import { logger } from '../../utils/logger';
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../../middleware/auth';
import { validateRequestBody } from '../../middleware/validate';
import {
  calculateAttendanceStatus,
  getISTComponents,
  getISTDayOfWeek,
  getISTMidnightInstant,
  toHolidayDateKey,
} from '../../utils/time';
import { Roles } from '../../shared';
import { getAccessibleCompanyIds } from '../../authz/dataScope';
import { notifyEmployee } from '../../utils/notifyEmployee';

// Work from home. A WFH day is an AttendanceProposal of type WORK_FROM_HOME:
// either requested by the employee and approved by the MD, or granted by the
// MD directly for a group of people over a date range (e.g. all telecallers
// for a month). On an approved WFH day the employee checks in and out from
// the app instead of the kiosk; the log is stored with source 'REMOTE'.
// What they actually did that day is visible on Team Today (calls logged,
// leads worked), which is the real check on remote work.
const router = Router();
const p = prisma;

const WFH = 'WORK_FROM_HOME';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GRANT_DAYS = 62;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const WfhRequestSchema = z.object({
  date: dateKey,
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters'),
});

const WfhGrantSchema = z.object({
  employee_ids: z.array(z.number().int().positive()).min(1).max(500),
  start_date: dateKey,
  end_date: dateKey,
  reason: z.string().trim().min(3).max(500).optional(),
});

const RemoteCheckSchema = z.object({
  note: z.string().trim().max(300).optional(),
});

/** Approved WFH proposal covering this IST date, if any. */
const approvedWfhFor = (employeeId: number, dateString: string) => {
  const start = getISTMidnightInstant(dateString);
  return p.attendanceProposal.findFirst({
    where: {
      employee_id: employeeId,
      type: WFH,
      status: 'APPROVED',
      target_date: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
    },
  });
};

const isHoliday = async (companyId: number, dateString: string) =>
  getISTDayOfWeek(dateString) === 0 ||
  !!(await p.companyHoliday.findFirst({
    where: { company_id: companyId, date: toHolidayDateKey(dateString) },
  }));

// GET /api/v1/attendance/wfh/today - is today a WFH day for me, and my log
router.get('/wfh/today', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeId = req.user!.employeeId;
    const { dateString } = getISTComponents(new Date());
    const start = getISTMidnightInstant(dateString);
    const [wfh, log] = await Promise.all([
      approvedWfhFor(employeeId, dateString),
      p.attendanceLog.findFirst({
        where: {
          employee_id: employeeId,
          check_in_at: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
        },
        orderBy: { check_in_at: 'desc' },
      }),
    ]);
    return res.status(200).json({
      date: dateString,
      wfh_today: !!wfh,
      log: log
        ? {
            check_in_at: log.check_in_at,
            check_out_at: log.check_out_at,
            status: log.status,
            source: log.source,
          }
        : null,
    });
  } catch (error) {
    logger.error('WFH today error:', error);
    return res.status(500).json({ error: 'Failed to load work-from-home status' });
  }
});

// POST /api/v1/attendance/wfh-proposal - employee asks to work from home
router.post(
  '/wfh-proposal',
  authenticateToken,
  validateRequestBody(WfhRequestSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;
      const { date, reason } = req.body as z.infer<typeof WfhRequestSchema>;
      if (date < getISTComponents(new Date()).dateString) {
        return res.status(400).json({ error: 'Pick today or a future date.' });
      }
      const start = getISTMidnightInstant(date);
      const existing = await p.attendanceProposal.findFirst({
        where: {
          employee_id: employeeId,
          type: WFH,
          status: { in: ['PENDING', 'APPROVED'] },
          target_date: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
        },
      });
      if (existing) {
        return res.status(409).json({
          error: `You already have a ${existing.status.toLowerCase()} request for that day.`,
        });
      }

      const proposal = await p.attendanceProposal.create({
        data: { employee_id: employeeId, type: WFH, target_date: start, reason, status: 'PENDING' },
      });
      await p.auditEvent.create({
        data: {
          actor_id: employeeId,
          action: 'SUBMIT_WFH_PROPOSAL',
          entity_type: 'ATTENDANCE_PROPOSAL',
          entity_id: proposal.id,
          new_value: JSON.stringify({ type: WFH, target_date: date, reason }),
        },
      });
      return res
        .status(201)
        .json({ message: 'Work-from-home request sent for approval.', proposalId: proposal.id });
    } catch (error) {
      logger.error('WFH proposal error:', error);
      return res.status(500).json({ error: 'Failed to submit work-from-home request' });
    }
  },
);

// POST /api/v1/attendance/wfh/grant - MD sets WFH for people over a date range
// (Sundays and company holidays skipped; days already granted are left as is).
router.post(
  '/wfh/grant',
  authenticateToken,
  requireRole([Roles.MD, Roles.ADMIN]),
  validateRequestBody(WfhGrantSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { employee_ids, start_date, end_date, reason } = req.body as z.infer<
        typeof WfhGrantSchema
      >;
      if (end_date < start_date) {
        return res.status(400).json({ error: 'End date is before start date.' });
      }
      const first = getISTMidnightInstant(start_date);
      const last = getISTMidnightInstant(end_date);
      const days = Math.round((last.getTime() - first.getTime()) / DAY_MS) + 1;
      if (days > MAX_GRANT_DAYS) {
        return res.status(400).json({ error: `At most ${MAX_GRANT_DAYS} days at a time.` });
      }

      const isAdmin = req.user!.roles.includes(Roles.ADMIN);
      const companyIds = await getAccessibleCompanyIds(req.user!);
      const employees = await p.employee.findMany({
        where: {
          id: { in: employee_ids },
          status: 'ACTIVE',
          ...(isAdmin ? {} : { company_id: { in: companyIds } }),
        },
        select: { id: true, company_id: true },
      });
      if (employees.length !== new Set(employee_ids).size) {
        return res
          .status(403)
          .json({ error: 'Some of these employees are not in your companies.' });
      }

      const companyHolidays = await p.companyHoliday.findMany({
        where: {
          company_id: { in: [...new Set(employees.map((e) => e.company_id))] },
          date: { gte: toHolidayDateKey(start_date), lte: toHolidayDateKey(end_date) },
        },
        select: { company_id: true, date: true },
      });
      const holidayKeys = new Set(
        companyHolidays.map((h) => `${h.company_id}:${h.date.toISOString().slice(0, 10)}`),
      );

      const already = await p.attendanceProposal.findMany({
        where: {
          employee_id: { in: employees.map((e) => e.id) },
          type: WFH,
          status: 'APPROVED',
          target_date: { gte: first, lt: new Date(last.getTime() + DAY_MS) },
        },
        select: { employee_id: true, target_date: true },
      });
      const have = new Set(
        already.map((a) => `${a.employee_id}:${getISTComponents(a.target_date).dateString}`),
      );

      const now = new Date();
      const rows: any[] = [];
      for (let i = 0; i < days; i++) {
        const day = new Date(first.getTime() + i * DAY_MS);
        const ds = getISTComponents(day).dateString;
        if (getISTDayOfWeek(ds) === 0) continue;
        for (const e of employees) {
          if (holidayKeys.has(`${e.company_id}:${ds}`) || have.has(`${e.id}:${ds}`)) continue;
          rows.push({
            employee_id: e.id,
            type: WFH,
            target_date: day,
            reason: reason || 'Work from home (set by MD)',
            status: 'APPROVED',
            reviewed_by: req.user!.employeeId,
            reviewed_at: now,
          });
        }
      }
      if (rows.length) await p.attendanceProposal.createMany({ data: rows });

      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'GRANT_WORK_FROM_HOME',
          entity_type: 'ATTENDANCE_PROPOSAL',
          entity_id: 0,
          new_value: JSON.stringify({
            employee_ids,
            start_date,
            end_date,
            days_created: rows.length,
          }),
        },
      });
      for (const e of employees) {
        notifyEmployee(e.id, {
          title: 'Work from home',
          message: `You can work from home ${start_date === end_date ? `on ${start_date}` : `from ${start_date} to ${end_date}`}. Check in and out from My Attendance.`,
          type: 'SYSTEM',
          link: '/my-attendance',
        });
      }
      return res.status(201).json({ message: 'Work from home set.', days_created: rows.length });
    } catch (error) {
      logger.error('WFH grant error:', error);
      return res.status(500).json({ error: 'Failed to set work from home' });
    }
  },
);

// POST /api/v1/attendance/wfh/check-in - check in from the app on a WFH day
router.post(
  '/wfh/check-in',
  authenticateToken,
  validateRequestBody(RemoteCheckSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;
      const now = new Date();
      const { dateString, timeString } = getISTComponents(now);
      const employee = await p.employee.findUnique({ where: { id: employeeId } });
      if (!employee || employee.status !== 'ACTIVE') {
        return res.status(403).json({ error: 'Not eligible for attendance.' });
      }
      if (await isHoliday(employee.company_id, dateString)) {
        return res.status(400).json({ error: 'Today is a holiday.' });
      }
      if (!(await approvedWfhFor(employeeId, dateString))) {
        return res.status(403).json({
          error:
            'Today is not an approved work-from-home day. Please check in at the office kiosk.',
        });
      }

      const start = getISTMidnightInstant(dateString);
      const existing = await p.attendanceLog.findFirst({
        where: {
          employee_id: employeeId,
          check_in_at: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
        },
      });
      if (existing) {
        return res.status(200).json({
          message: 'Already checked in today',
          alreadyStamped: true,
          checkInAt: existing.check_in_at,
        });
      }

      const lateApproved = await p.attendanceProposal.findFirst({
        where: {
          employee_id: employeeId,
          type: 'LATE_CHECKIN',
          status: 'APPROVED',
          target_date: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
        },
      });
      const log = await p.attendanceLog.create({
        data: {
          employee_id: employeeId,
          check_in_at: now,
          status: calculateAttendanceStatus(
            now,
            !!lateApproved,
            employee.employment_type || 'FULL_TIME',
          ),
          source: 'REMOTE',
          notes: req.body.note ? `WFH: ${req.body.note}` : 'Work from home',
        },
      });
      return res.status(200).json({
        message: `Checked in (work from home) as ${log.status}`,
        status: log.status,
        checkInAt: log.check_in_at,
        timeIST: timeString,
      });
    } catch (error) {
      logger.error('WFH check-in error:', error);
      return res.status(500).json({ error: 'Check-in failed, please try again.' });
    }
  },
);

// POST /api/v1/attendance/wfh/check-out - same rules as the kiosk checkout
// (not before 18:00 IST without an emergency request; daily report first).
router.post(
  '/wfh/check-out',
  authenticateToken,
  validateRequestBody(RemoteCheckSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;
      const now = new Date();
      const { dateString, timeString } = getISTComponents(now);
      const start = getISTMidnightInstant(dateString);
      const dayRange = { gte: start, lt: new Date(start.getTime() + DAY_MS) };
      const employee = await p.employee.findUnique({ where: { id: employeeId } });
      if (!employee) return res.status(404).json({ error: 'Employee not found' });

      const log = await p.attendanceLog.findFirst({
        where: { employee_id: employeeId, check_out_at: null, check_in_at: dayRange },
        orderBy: { check_in_at: 'desc' },
      });
      if (!log) return res.status(400).json({ error: 'No open check-in for today.' });
      if (log.source !== 'REMOTE') {
        return res
          .status(400)
          .json({ error: 'You checked in at the office. Please check out at the kiosk.' });
      }

      if (timeString < '18:00') {
        const early = await p.attendanceProposal.findFirst({
          where: {
            employee_id: employeeId,
            type: 'EARLY_CHECKOUT',
            status: 'APPROVED',
            target_date: dayRange,
          },
        });
        if (!early) {
          return res
            .status(400)
            .json({ error: 'Logout is not allowed before 18:00 IST without an emergency request' });
        }
      }
      if (employee.report_required) {
        const report = await p.dailyReport.findFirst({
          where: { employee_id: employeeId, submitted_at: dayRange },
        });
        if (!report)
          return res.status(400).json({ error: 'Please submit your daily report first.' });
      }

      const minutes = Math.max(0, Math.round((now.getTime() - log.check_in_at.getTime()) / 60000));
      const updated = await p.attendanceLog.update({
        where: { id: log.id },
        data: {
          check_out_at: now,
          working_duration_minutes: minutes,
          ...(req.body.note
            ? { notes: `${log.notes || 'Work from home'} | Out: ${req.body.note}` }
            : {}),
        },
      });
      return res.status(200).json({
        message: 'Checked out',
        checkOutAt: updated.check_out_at,
        working_duration_minutes: minutes,
        timeIST: timeString,
      });
    } catch (error) {
      logger.error('WFH check-out error:', error);
      return res.status(500).json({ error: 'Check-out failed, please try again.' });
    }
  },
);

export default router;
