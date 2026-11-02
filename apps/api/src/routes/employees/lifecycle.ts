import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { requireAuthz } from '../../middleware/authz';
import {
  Permissions,
  EmployeeResignSchema,
  EmployeeResignationUpdateSchema,
  EmployeeHandoverSchema,
  EmployeePromoteSchema,
  EmployeeConvertEmploymentTypeSchema,
} from '../../shared';
import { can } from '../../authz/authorization';
import { notifyEmployee } from '../../utils/notifyEmployee';
import { validateRequestBody } from '../../middleware/validate';
import { applyRoleChange, roleAssignmentError } from './roleChange';
import { logger } from '../../utils/logger';
import { lastWorkingDayPassed } from '../../utils/time';
import {
  OffboardError,
  findHandoverTarget,
  getHandoverSummary,
  handOverWork,
  offboardEmployee,
  toDayKey,
} from '../../services/employeeOffboard.service';

const router = Router();

/** Loads the employee and checks the caller may manage them; sends the error itself. */
async function loadManagedEmployee(req: AuthenticatedRequest, res: Response) {
  const employeeId = parseInt(req.params.id, 10);
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) {
    res.status(404).json({ error: 'Employee not found' });
    return null;
  }
  if (!can(req.user!, Permissions.EMPLOYEES_UPDATE, emp)) {
    res.status(403).json({ error: 'Forbidden: Cannot update an employee outside your company' });
    return null;
  }
  return emp;
}

function sendOffboardError(res: Response, error: unknown, fallback: string) {
  if (error instanceof OffboardError)
    return res.status(error.status).json({ error: error.message });
  logger.error(`${fallback}:`, error);
  return res.status(500).json({ error: fallback });
}

const BAD_TARGET =
  'That colleague cannot take the work (not active, another company, or their role cannot work leads).';

// POST /api/v1/employees/:id/resign - Record a resignation. With a last working
// day in the future the person keeps working (serving notice) and the nightly
// job locks them out and hands over their work after that day; otherwise both
// happen now.
router.post(
  '/:id/resign',
  authenticateToken,
  requireAuthz(Permissions.EMPLOYEES_UPDATE),
  validateRequestBody(EmployeeResignSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const targetEmployee = await loadManagedEmployee(req, res);
      if (!targetEmployee) return;
      const employeeId = targetEmployee.id;
      if (targetEmployee.status === 'RESIGNED') {
        return res.status(409).json({ error: 'This employee has already left' });
      }

      const { resignation_date, last_working_day, reason, handover_to_id } = req.body;
      const resignedAt = resignation_date ? new Date(resignation_date) : new Date();
      const lastDay = last_working_day ? toDayKey(last_working_day) : null;
      if (
        handover_to_id &&
        !(await findHandoverTarget(targetEmployee.company_id, handover_to_id, employeeId))
      ) {
        return res.status(400).json({ error: BAD_TARGET });
      }
      const servingNotice = !!lastDay && !lastWorkingDayPassed(lastDay);

      await prisma.$transaction(async (tx) => {
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            resignation_date: resignedAt,
            last_working_day: lastDay,
            handover_to_id: handover_to_id ?? null,
          },
        });
        await tx.auditEvent.create({
          data: {
            actor_id: req.user!.employeeId || 1,
            action: 'EMPLOYEE_RESIGNATION_RECORDED',
            entity_type: 'EMPLOYEE',
            entity_id: employeeId,
            new_value: JSON.stringify({
              resignation_date: resignedAt,
              last_working_day: lastDay,
              handover_to_id: handover_to_id ?? null,
              serving_notice: servingNotice,
            }),
            reason: reason || null,
          },
        });
      });

      let handover = null;
      if (servingNotice) {
        await notifyEmployee(employeeId, {
          type: 'STATUS_CHANGED',
          title: '📋 Resignation Recorded',
          message: `Your resignation has been recorded. Last working day: ${lastDay!.toLocaleDateString('en-IN', { timeZone: 'UTC' })}.`,
        });
      } else {
        const r = await offboardEmployee(employeeId, req.user!);
        handover = r?.handover ?? null;
      }

      const updatedEmp = await prisma.employee.findUnique({ where: { id: employeeId } });
      return res.status(200).json({
        message: servingNotice
          ? 'Resignation recorded; they keep working until their last day'
          : 'Employee marked as resigned',
        employee: updatedEmp,
        serving_notice: servingNotice,
        handover,
      });
    } catch (error) {
      return sendOffboardError(res, error, 'Failed to record resignation');
    }
  },
);

const servingNotice = (emp: {
  resignation_date: Date | null;
  offboarded_at: Date | null;
  status: string;
}) => !!emp.resignation_date && !emp.offboarded_at && emp.status === 'ACTIVE';

// PATCH /api/v1/employees/:id/resignation - change the last day or hand-over colleague while serving notice
router.patch(
  '/:id/resignation',
  authenticateToken,
  requireAuthz(Permissions.EMPLOYEES_UPDATE),
  validateRequestBody(EmployeeResignationUpdateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const emp = await loadManagedEmployee(req, res);
      if (!emp) return;
      if (!servingNotice(emp)) {
        return res.status(409).json({ error: 'This employee is not serving notice' });
      }
      const data: { last_working_day?: Date; handover_to_id?: number | null } = {};
      if (req.body.last_working_day) data.last_working_day = toDayKey(req.body.last_working_day);
      if (req.body.handover_to_id !== undefined) {
        if (
          req.body.handover_to_id &&
          !(await findHandoverTarget(emp.company_id, req.body.handover_to_id, emp.id))
        ) {
          return res.status(400).json({ error: BAD_TARGET });
        }
        data.handover_to_id = req.body.handover_to_id ?? null;
      }
      await prisma.$transaction(async (tx) => {
        await tx.employee.update({ where: { id: emp.id }, data });
        await tx.auditEvent.create({
          data: {
            actor_id: req.user!.employeeId,
            action: 'EMPLOYEE_RESIGNATION_UPDATED',
            entity_type: 'EMPLOYEE',
            entity_id: emp.id,
            old_value: JSON.stringify({
              last_working_day: emp.last_working_day,
              handover_to_id: emp.handover_to_id,
            }),
            new_value: JSON.stringify(data),
          },
        });
      });
      // A last day moved into the past means they have already left.
      if (data.last_working_day && lastWorkingDayPassed(data.last_working_day)) {
        await offboardEmployee(emp.id, req.user!);
      }
      const updatedEmp = await prisma.employee.findUnique({ where: { id: emp.id } });
      return res.status(200).json({ message: 'Resignation updated', employee: updatedEmp });
    } catch (error) {
      return sendOffboardError(res, error, 'Failed to update resignation');
    }
  },
);

// DELETE /api/v1/employees/:id/resignation - withdraw a resignation while serving notice
router.delete(
  '/:id/resignation',
  authenticateToken,
  requireAuthz(Permissions.EMPLOYEES_UPDATE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const emp = await loadManagedEmployee(req, res);
      if (!emp) return;
      if (!servingNotice(emp)) {
        return res.status(409).json({ error: 'This employee is not serving notice' });
      }
      await prisma.$transaction(async (tx) => {
        await tx.employee.update({
          where: { id: emp.id },
          data: { resignation_date: null, last_working_day: null, handover_to_id: null },
        });
        await tx.auditEvent.create({
          data: {
            actor_id: req.user!.employeeId,
            action: 'EMPLOYEE_RESIGNATION_WITHDRAWN',
            entity_type: 'EMPLOYEE',
            entity_id: emp.id,
            old_value: JSON.stringify({
              resignation_date: emp.resignation_date,
              last_working_day: emp.last_working_day,
              handover_to_id: emp.handover_to_id,
            }),
          },
        });
      });
      await notifyEmployee(emp.id, {
        type: 'STATUS_CHANGED',
        title: 'Resignation withdrawn',
        message: 'Your resignation has been withdrawn. Nothing changes for you.',
      });
      const updatedEmp = await prisma.employee.findUnique({ where: { id: emp.id } });
      return res.status(200).json({ message: 'Resignation withdrawn', employee: updatedEmp });
    } catch (error) {
      return sendOffboardError(res, error, 'Failed to withdraw resignation');
    }
  },
);

// GET /api/v1/employees/:id/handover-summary - what this person still owns
router.get(
  '/:id/handover-summary',
  authenticateToken,
  requireAuthz(Permissions.EMPLOYEES_UPDATE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const emp = await loadManagedEmployee(req, res);
      if (!emp) return;
      return res.status(200).json(await getHandoverSummary(emp.id));
    } catch (error) {
      return sendOffboardError(res, error, 'Failed to load hand-over summary');
    }
  },
);

// POST /api/v1/employees/:id/handover - move a leaver's open work to a colleague now
router.post(
  '/:id/handover',
  authenticateToken,
  requireAuthz(Permissions.EMPLOYEES_UPDATE),
  validateRequestBody(EmployeeHandoverSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const emp = await loadManagedEmployee(req, res);
      if (!emp) return;
      if (emp.status === 'ACTIVE' && !emp.resignation_date) {
        return res
          .status(409)
          .json({ error: 'Only for someone who has resigned. To move one lead, use Transfer.' });
      }
      const result = await handOverWork(
        emp.id,
        req.body.to_employee_id,
        req.user!,
        req.body.reason || 'resigned',
      );
      return res.status(200).json({ message: 'Work handed over', ...result });
    } catch (error) {
      return sendOffboardError(res, error, 'Failed to hand over work');
    }
  },
);

// POST /api/v1/employees/:id/promote - Promote an employee (title/salary/role, with an audit trail)
router.post(
  '/:id/promote',
  authenticateToken,
  requireAuthz(Permissions.EMPLOYEES_UPDATE),
  validateRequestBody(EmployeePromoteSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = parseInt(req.params.id, 10);
      const targetEmployee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (!targetEmployee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      if (!can(req.user!, Permissions.EMPLOYEES_UPDATE, targetEmployee)) {
        return res
          .status(403)
          .json({ error: 'Forbidden: Cannot update an employee outside your company' });
      }

      const canViewSensitive = can(req.user!, Permissions.EMPLOYEES_VIEW_SENSITIVE, targetEmployee);
      if (req.body.salary_ctc !== undefined && !canViewSensitive) {
        return res.status(403).json({ error: 'Cannot modify salary' });
      }

      const { job_title, salary_ctc, role_name, replaces_role_name, reason } = req.body;

      // Same role-assignment rules as Edit. Promote previously had none, so
      // anyone allowed to edit employees could promote themselves or others
      // to Admin/MD through this endpoint.
      if (role_name) {
        const currentRoleNames = (
          await prisma.employeeRole.findMany({
            where: { employee_id: employeeId },
            include: { role: true },
          })
        ).map((r) => r.role.name);
        const roleError = roleAssignmentError(req.user!, employeeId, currentRoleNames, role_name);
        if (roleError) return res.status(403).json({ error: roleError });
      }

      const oldValue = {
        job_title: targetEmployee.job_title,
        salary_ctc: targetEmployee.salary_ctc,
      };
      const updateData: any = {};
      if (job_title !== undefined) updateData.job_title = job_title;
      if (salary_ctc !== undefined) updateData.salary_ctc = parseFloat(salary_ctc as any);

      const updatedEmp = await prisma.$transaction(async (tx) => {
        const roleChanged = role_name
          ? await applyRoleChange(tx, employeeId, role_name, replaces_role_name)
          : false;

        if (roleChanged) {
          updateData.token_version = { increment: 1 };
        }

        const emp = await tx.employee.update({
          where: { id: employeeId },
          data: updateData,
          include: { roles: { include: { role: true } } },
        });

        if (roleChanged) {
          await tx.authSession.updateMany({
            where: { employee_id: employeeId, revoked: false },
            data: { revoked: true, revocation_reason: 'AUTHORIZATION_CHANGED' },
          });
        }

        await tx.auditEvent.create({
          data: {
            actor_id: req.user!.employeeId || 1,
            action: 'EMPLOYEE_PROMOTED',
            entity_type: 'EMPLOYEE',
            entity_id: employeeId,
            old_value: JSON.stringify(oldValue),
            new_value: JSON.stringify({ job_title, salary_ctc, role_name }),
            reason: reason || null,
          },
        });

        return emp;
      });

      await notifyEmployee(employeeId, {
        type: 'ROLE_CHANGED',
        title: '🎉 You Have Been Promoted',
        message: `Congratulations! ${job_title ? `New title: ${job_title}. ` : ''}${role_name ? `New role: ${role_name}. ` : ''}Please check with HR for details.`,
      });

      return res.status(200).json({ message: 'Employee promoted', employee: updatedEmp });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to promote employee' });
    }
  },
);

// POST /api/v1/employees/:id/convert-employment-type - Convert between full-time/part-time/contract/intern
router.post(
  '/:id/convert-employment-type',
  authenticateToken,
  requireAuthz(Permissions.EMPLOYEES_UPDATE),
  validateRequestBody(EmployeeConvertEmploymentTypeSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = parseInt(req.params.id, 10);
      const targetEmployee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (!targetEmployee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      if (!can(req.user!, Permissions.EMPLOYEES_UPDATE, targetEmployee)) {
        return res
          .status(403)
          .json({ error: 'Forbidden: Cannot update an employee outside your company' });
      }

      const { employment_type } = req.body;
      const oldType = targetEmployee.employment_type;

      const updatedEmp = await prisma.$transaction(async (tx) => {
        const emp = await tx.employee.update({
          where: { id: employeeId },
          data: { employment_type },
        });

        await tx.auditEvent.create({
          data: {
            actor_id: req.user!.employeeId || 1,
            action: 'EMPLOYEE_EMPLOYMENT_TYPE_CONVERTED',
            entity_type: 'EMPLOYEE',
            entity_id: employeeId,
            old_value: JSON.stringify({ employment_type: oldType }),
            new_value: JSON.stringify({ employment_type }),
          },
        });

        return emp;
      });

      await notifyEmployee(employeeId, {
        type: 'STATUS_CHANGED',
        title: '📄 Employment Type Updated',
        message: `Your employment type has been changed to ${employment_type.replace('_', ' ')}.`,
      });

      return res.status(200).json({ message: 'Employment type updated', employee: updatedEmp });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to convert employment type' });
    }
  },
);

export default router;
