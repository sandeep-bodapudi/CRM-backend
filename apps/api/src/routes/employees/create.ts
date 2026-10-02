import { logger } from '../../utils/logger';
import { getCompanyLeaders, suggestManager } from '../../utils/reportingRules';
import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { requireAuthz } from '../../middleware/authz';
import { Roles, DepartmentCodes, Permissions, EmployeeCreateSchema } from '../../shared';
import { encryptData } from '../../utils/crypto';
import { validateRequestBody } from '../../middleware/validate';
import { generateTemporaryPassword } from '../../utils/tempPassword';
import {
  findEmployeeContactConflict,
  employeeContactConflictMessage,
  normaliseEmployeePhone,
  normaliseEmployeeEmail,
} from '../../services/employeeContact.service';

const router = Router();

// POST /api/v1/employees - Add new employee with all 20 industrial fields
router.post(
  '/',
  authenticateToken,
  requireAuthz(Permissions.EMPLOYEES_CREATE),
  validateRequestBody(EmployeeCreateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        full_name,
        phone,
        secondary_phone,
        whatsapp_number,
        email,
        blood_group,
        social_links,
        current_address,
        permanent_address,
        emergency_contact_name,
        emergency_contact_relation,
        emergency_contact_phone,
        pan_number,
        aadhaar_number,
        bank_name,
        bank_account_number,
        bank_ifsc,
        bank_branch,
        job_title,
        department,
        employment_type,
        report_required,
        reporting_manager_id,
        date_of_joining,
        salary_ctc,
        background_education,
        role_name,
        branch_id,
        additional_branch_ids,
        initial_password,
        company_id,
        accessible_company_ids,
      } = req.body;

      if (!role_name || !branch_id || !full_name || !phone) {
        return res
          .status(400)
          .json({ error: 'Full Name, Primary Phone, Role, and Branch are required fields' });
      }

      const userRoles = req.user!.roles;
      const isUserAdmin = userRoles.includes(Roles.ADMIN);
      const isUserMD = userRoles.includes(Roles.MD);

      if (role_name === Roles.ADMIN && !isUserAdmin) {
        return res.status(403).json({ error: 'Forbidden: Only ADMIN can create ADMIN accounts' });
      }
      if (role_name === Roles.MD && !isUserAdmin && !isUserMD) {
        return res
          .status(403)
          .json({ error: 'Forbidden: Only ADMIN or MD can create MD accounts' });
      }

      const parsedBranchId = parseInt(branch_id, 10);
      const branch = await prisma.branch.findUnique({ where: { id: parsedBranchId } });
      if (!branch) {
        return res.status(404).json({ error: 'Branch not found' });
      }
      if (!isUserAdmin && branch.company_id !== req.user!.companyId) {
        return res
          .status(403)
          .json({ error: "Forbidden: Cannot create employee in another company's branch" });
      }

      const validAdditionalBranchIds: number[] = [];
      if (Array.isArray(additional_branch_ids)) {
        const additionalBranches = await prisma.branch.findMany({
          where: {
            id: { in: additional_branch_ids.map((id: string) => parseInt(id, 10)) },
            company_id:
              isUserAdmin && req.body.company_id
                ? parseInt(req.body.company_id, 10)
                : req.user!.companyId,
          },
        });
        for (const b of additionalBranches) {
          if (b.id !== parsedBranchId) validAdditionalBranchIds.push(b.id);
        }
      }

      // Resolve target company ID (Admin can specify, otherwise forced to actor's company)
      const targetCompanyId =
        isUserAdmin && req.body.company_id
          ? parseInt(req.body.company_id, 10)
          : req.user!.companyId;

      // Phone/email must be unique within the company (QA 2026-09-14). Checked
      // here rather than trusting the form: the same person was being
      // onboarded twice with the same number.
      const normalisedPhone = normaliseEmployeePhone(phone);
      const normalisedEmail = normaliseEmployeeEmail(email);
      const conflict = await findEmployeeContactConflict(prisma, {
        companyId: targetCompanyId,
        phone: normalisedPhone,
        email: normalisedEmail,
      });
      if (conflict) {
        return res.status(409).json({
          error: employeeContactConflictMessage(conflict),
          conflict: { field: conflict.field, employee_code: conflict.employee.employee_code },
        });
      }

      const deptCode = DepartmentCodes[role_name] || 'EX';

      let employeeCode = '';
      let isUnique = false;
      while (!isUnique) {
        const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
        employeeCode = `RRH-${deptCode}-${randomNum}`;
        const existing = await prisma.employee.findFirst({
          where: { employee_code: employeeCode },
        });
        if (!existing) {
          isUnique = true;
        }
      }

      const role = await prisma.role.findUnique({
        where: { name: role_name },
      });

      if (!role) {
        return res.status(400).json({ error: 'Invalid role specified' });
      }

      const effectivePassword = initial_password || generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(effectivePassword, 12);
      const isExempt = [Roles.MD, Roles.HR_MANAGER, Roles.ADMIN, Roles.MARKETING_DIRECTOR].includes(
        role_name,
      );

      // No manager chosen: apply the company's default reporting line
      // (utils/reportingRules.ts) instead of leaving it empty -- almost no
      // one in production had a reporting manager, so "my team" views were
      // blank for every manager.
      const defaultManager = reporting_manager_id
        ? null
        : suggestManager(-1, [role_name], null, await getCompanyLeaders(targetCompanyId));

      const newEmp = await prisma.employee.create({
        data: {
          employee_code: employeeCode,
          full_name,
          phone: normalisedPhone,
          secondary_phone,
          whatsapp_number: whatsapp_number || phone,
          email: normalisedEmail,
          blood_group: blood_group || 'O+',
          social_links,
          current_address,
          permanent_address: permanent_address || current_address,
          emergency_contact_name,
          emergency_contact_relation,
          emergency_contact_phone,
          pan_number: encryptData(pan_number),
          aadhaar_number: encryptData(aadhaar_number),
          bank_name: encryptData(bank_name),
          bank_account_number: encryptData(bank_account_number),
          bank_ifsc: encryptData(bank_ifsc),
          bank_branch: encryptData(bank_branch),
          job_title: job_title || role_name,
          department: department || 'Operations',
          employment_type: employment_type || 'FULL_TIME',
          // Every employment type submits a daily report before logout —
          // this used to default to false for part-time/contract/intern,
          // silently exempting them from the kiosk logout gate (see
          // routes/attendance/qr.ts). Still overridable per-employee via the
          // existing admin-actions endpoint for genuine exceptions.
          report_required: report_required !== undefined ? Boolean(report_required) : true,
          reporting_manager_id: reporting_manager_id
            ? parseInt(reporting_manager_id, 10)
            : (defaultManager?.id ?? null),
          date_of_joining: date_of_joining ? new Date(date_of_joining) : new Date(),
          salary_ctc: salary_ctc ? parseFloat(salary_ctc) : 35000,
          background_education,
          company_id: targetCompanyId,
          branch_id: parsedBranchId,
          password_hash: passwordHash,
          status: 'ACTIVE',
          attendance_required: !isExempt,
          first_login_done: false,
          roles: {
            create: {
              role_id: role.id,
            },
          },
          branches: {
            create: validAdditionalBranchIds.map((id) => ({ branch_id: id })),
          },
          company_access: accessible_company_ids?.length
            ? {
                create: accessible_company_ids.map((id: string | number) => ({
                  company_id: typeof id === 'string' ? parseInt(id, 10) : id,
                })),
              }
            : {
                create: [{ company_id: targetCompanyId }], // default to their own company if nothing specified
              },
        },
        include: {
          branch: true,
          roles: { include: { role: true } },
          branches: { include: { branch: true } },
        },
      });

      return res.status(201).json({
        message: 'Employee created successfully',
        employee: {
          id: newEmp.id,
          employeeCode: newEmp.employee_code,
          fullName: newEmp.full_name,
          branch: newEmp.branch?.name || 'All Branches',
          additionalBranches: newEmp.branches.map((b) => b.branch.name),
          status: newEmp.status,
          attendanceRequired: newEmp.attendance_required,
          roles: newEmp.roles.map((r) => r.role.name),
          defaultPassword: effectivePassword,
        },
      });
    } catch (error) {
      logger.error('Create employee error:', error);
      return res.status(500).json({ error: 'Failed to create employee' });
    }
  },
);

export default router;
