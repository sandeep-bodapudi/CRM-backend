import { logger } from '../../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { requireAuthz } from '../../middleware/authz';
import { validateRequestBody } from '../../middleware/validate';
import {
  Permissions,
  AdminAttendanceCreateSchema,
  AdminAttendanceUpdateSchema,
} from '../../shared';

const router = Router();
const p = prisma;

// GET /api/v1/admin/attendance/search — search/filter attendance logs
router.get(
  '/attendance/search',
  authenticateToken,
  requireAuthz(Permissions.ATTENDANCE_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { search, status, startDate, endDate, page = '1', limit = '50' } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const whereClause: any = {
        employee: { company_id: req.user!.companyId },
      };

      if (search) {
        whereClause.employee.OR = [
          { full_name: { contains: search as string } },
          { employee_code: { contains: search as string } },
        ];
      }

      if (status) {
        whereClause.status = status;
      }

      if (startDate || endDate) {
        whereClause.check_in_at = {};
        if (startDate) whereClause.check_in_at.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          whereClause.check_in_at.lte = end;
        }
      }

      const [logs, total] = await Promise.all([
        p.attendanceLog.findMany({
          where: whereClause,
          orderBy: { check_in_at: 'desc' },
          skip,
          take: Number(limit),
          include: {
            employee: {
              select: {
                full_name: true,
                employee_code: true,
                roles: { select: { role: { select: { name: true } } } },
              },
            },
          },
        }),
        p.attendanceLog.count({ where: whereClause }),
      ]);

      // Who last created/edited each record by hand. Uses the audit trail
      // rather than a new column, so older edits (made before edits were
      // labelled) show up too. Falls back to the employee code when the
      // account has no name -- e.g. the shared technical admin login, which
      // is exactly what the MD needs to see.
      const editEvents = logs.length
        ? await p.auditEvent.findMany({
            where: {
              entity_type: 'ATTENDANCE_LOG',
              action: { in: ['ADMIN_ATTENDANCE_UPDATE', 'ADMIN_ATTENDANCE_CREATE'] },
              entity_id: { in: logs.map((l) => l.id) },
            },
            orderBy: { created_at: 'desc' },
            select: { entity_id: true, actor_id: true, action: true, created_at: true },
          })
        : [];
      const editors = editEvents.length
        ? await p.employee.findMany({
            where: { id: { in: [...new Set(editEvents.map((e) => e.actor_id))] } },
            select: { id: true, full_name: true, employee_code: true },
          })
        : [];
      const editorName = new Map(editors.map((e) => [e.id, e.full_name || e.employee_code]));
      const lastEdit = new Map<number, (typeof editEvents)[number]>();
      const editCount = new Map<number, number>();
      for (const ev of editEvents) {
        if (!lastEdit.has(ev.entity_id)) lastEdit.set(ev.entity_id, ev);
        editCount.set(ev.entity_id, (editCount.get(ev.entity_id) || 0) + 1);
      }
      const logsWithEditor = logs.map((l) => {
        const ev = lastEdit.get(l.id);
        return {
          ...l,
          edited_by: ev
            ? {
                name: editorName.get(ev.actor_id) || `#${ev.actor_id}`,
                at: ev.created_at,
                created_manually: ev.action === 'ADMIN_ATTENDANCE_CREATE',
                edit_count: editCount.get(l.id) || 1,
              }
            : null,
        };
      });

      return res.status(200).json({
        logs: logsWithEditor,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      logger.error('[Admin] Attendance search failed:', error);
      return res.status(500).json({ error: 'Failed to search attendance' });
    }
  },
);

// POST /api/v1/admin/attendance — create a manual attendance record. The
// kiosk-is-down fallback: HR/MD/Admin can log a punch by hand for an
// employee who has no record at all for that day, instead of the day just
// showing as an unexplained absence.
router.post(
  '/attendance',
  authenticateToken,
  requireAuthz(Permissions.ATTENDANCE_MANAGE),
  validateRequestBody(AdminAttendanceCreateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { employee_id, check_in_at, check_out_at, status, notes } = req.body;

      const employee = await p.employee.findFirst({
        where: { id: employee_id, company_id: req.user!.companyId },
        select: { id: true, full_name: true },
      });
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const checkInDate = new Date(check_in_at);
      const checkOutDate = check_out_at ? new Date(check_out_at) : null;
      const workingDurationMinutes = checkOutDate
        ? Math.max(0, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 60000))
        : null;

      const created = await p.attendanceLog.create({
        data: {
          employee_id,
          check_in_at: checkInDate,
          check_out_at: checkOutDate,
          working_duration_minutes: workingDurationMinutes,
          status,
          source: 'MANUAL',
          notes,
        },
      });

      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'ADMIN_ATTENDANCE_CREATE',
          entity_type: 'ATTENDANCE_LOG',
          entity_id: created.id,
          old_value: null,
          new_value: JSON.stringify({ employee_id, check_in_at, check_out_at, status, notes }),
        },
      });

      return res.status(201).json({
        message: `Manual attendance record created for ${employee.full_name}`,
        log: created,
      });
    } catch (error: any) {
      logger.error('[Admin] Attendance create failed:', error);
      return res
        .status(500)
        .json({ error: 'Failed to create attendance record', detail: error?.message });
    }
  },
);

// GET /api/v1/admin/attendance/:id — single attendance log detail
router.get(
  '/attendance/:id',
  authenticateToken,
  requireAuthz(Permissions.ATTENDANCE_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const log = await p.attendanceLog.findFirst({
        where: {
          id: Number(req.params.id),
          employee: { company_id: req.user!.companyId },
        },
        include: {
          employee: {
            select: {
              id: true,
              full_name: true,
              employee_code: true,
              roles: { select: { role: { select: { name: true } } } },
            },
          },
        },
      });

      if (!log) {
        return res.status(404).json({ error: 'Attendance log not found' });
      }

      return res.status(200).json({ log });
    } catch (error) {
      logger.error('[Admin] Attendance fetch failed:', error);
      return res.status(500).json({ error: 'Failed to fetch attendance' });
    }
  },
);

// PATCH /api/v1/admin/attendance/:id — correct attendance status, timings, notes
router.patch(
  '/attendance/:id',
  authenticateToken,
  requireAuthz(Permissions.ATTENDANCE_MANAGE),
  validateRequestBody(AdminAttendanceUpdateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const logId = Number(req.params.id);
      const { status, check_in_at, check_out_at, notes } = req.body;

      const log = await p.attendanceLog.findFirst({
        where: {
          id: logId,
          employee: { company_id: req.user!.companyId },
        },
        include: { employee: { select: { employment_type: true } } },
      });

      if (!log) {
        return res.status(404).json({ error: 'Attendance log not found' });
      }

      // Record old values for audit
      const oldData = {
        status: log.status,
        check_in_at: log.check_in_at,
        check_out_at: log.check_out_at,
        notes: log.notes,
      };

      const updateData: any = {};
      const auditActions: string[] = [];

      if (status !== undefined) {
        updateData.status = status;
        auditActions.push(`status: ${oldData.status} → ${status}`);
      }

      if (check_in_at !== undefined) {
        updateData.check_in_at = new Date(check_in_at);
        auditActions.push(`check-in: ${oldData.check_in_at.toISOString()} → ${check_in_at}`);
      }

      if (check_out_at !== undefined) {
        updateData.check_out_at = check_out_at ? new Date(check_out_at) : null;
        auditActions.push(
          `checkout: ${oldData.check_out_at || 'None'} → ${check_out_at || 'Cleared'}`,
        );
      }

      // Recalculate working_duration_minutes whenever either timestamp moved
      // — not just on check_out_at, since editing check_in_at alone (e.g.
      // correcting a wrong kiosk punch time) should also update the total.
      if (updateData.check_in_at !== undefined || updateData.check_out_at !== undefined) {
        const checkInTime = (updateData.check_in_at ?? log.check_in_at).getTime();
        const resolvedCheckOut =
          updateData.check_out_at !== undefined ? updateData.check_out_at : log.check_out_at;
        const checkOutTime = resolvedCheckOut ? resolvedCheckOut.getTime() : Date.now();
        updateData.working_duration_minutes = Math.max(
          0,
          Math.round((checkOutTime - checkInTime) / 60000),
        );
      }

      if (notes !== undefined) {
        updateData.notes = notes || null;
        auditActions.push(`notes updated`);
      }

      // A kiosk scan whose time or status was changed by hand must not keep
      // looking like a genuine scan -- that made HR edits indistinguishable
      // from real check-ins in every report. (Notes-only edits don't count.)
      const changedRecord =
        updateData.status !== undefined ||
        updateData.check_in_at !== undefined ||
        updateData.check_out_at !== undefined;
      if (changedRecord && log.source === 'QR_SCAN') {
        updateData.source = 'QR_SCAN_EDITED';
        auditActions.push(`source: QR_SCAN → QR_SCAN_EDITED`);
      }

      const updated = await p.attendanceLog.update({
        where: { id: logId },
        data: updateData,
      });

      // Audit trail
      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'ADMIN_ATTENDANCE_UPDATE',
          entity_type: 'ATTENDANCE_LOG',
          entity_id: logId,
          old_value: JSON.stringify(oldData),
          new_value: JSON.stringify({ ...updateData, audit_actions: auditActions }),
        },
      });

      return res.status(200).json({
        message: 'Attendance updated successfully',
        log: updated,
      });
    } catch (error: any) {
      logger.error('[Admin] Attendance update failed:', error);
      return res.status(500).json({ error: 'Failed to update attendance', detail: error?.message });
    }
  },
);

// DELETE /api/v1/admin/attendance/:id — remove a manually-created record
// entered in error. Restricted to source: 'MANUAL' — a real kiosk/QR scan is
// never deletable this way, only correctable via PATCH, so a mis-clicked
// delete can't erase actual punch evidence.
router.delete(
  '/attendance/:id',
  authenticateToken,
  requireAuthz(Permissions.ATTENDANCE_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const logId = Number(req.params.id);
      const log = await p.attendanceLog.findFirst({
        where: { id: logId, employee: { company_id: req.user!.companyId } },
      });

      if (!log) {
        return res.status(404).json({ error: 'Attendance log not found' });
      }
      if (log.source !== 'MANUAL') {
        return res.status(409).json({
          error:
            'Only manually-created records can be deleted. Correct a scanned record with an edit instead.',
        });
      }

      await p.attendanceLog.delete({ where: { id: logId } });

      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'ADMIN_ATTENDANCE_DELETE',
          entity_type: 'ATTENDANCE_LOG',
          entity_id: logId,
          old_value: JSON.stringify(log),
          new_value: null,
        },
      });

      return res.status(200).json({ message: 'Manual attendance record deleted' });
    } catch (error: any) {
      logger.error('[Admin] Attendance delete failed:', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete attendance record', detail: error?.message });
    }
  },
);

// GET /api/v1/admin/attendance/:id/log — audit trail for a specific attendance log
router.get(
  '/attendance/:id/log',
  authenticateToken,
  requireAuthz(Permissions.ATTENDANCE_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auditLogs = await p.auditEvent.findMany({
        where: {
          entity_type: 'ATTENDANCE_LOG',
          entity_id: Number(req.params.id),
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      });

      return res.status(200).json({ auditLogs });
    } catch (error) {
      logger.error('[Admin] Attendance audit log fetch failed:', error);
      return res.status(500).json({ error: 'Failed to fetch audit trail' });
    }
  },
);

export default router;
