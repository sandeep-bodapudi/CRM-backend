import { logger } from '../../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../../middleware/auth';
import {
  calculateAttendanceStatus,
  getISTComponents,
  getISTDayOfWeek,
  getISTMidnightInstant,
  toHolidayDateKey,
} from '../../utils/time';
import { Roles, LateProposalSchema, LeaveProposalSchema, EmptyBodySchema } from '../../shared';
import { validateRequestBody } from '../../middleware/validate';
import { notifyEmployee } from '../../utils/notifyEmployee';
import { getAccessibleCompanyIds } from '../../authz/dataScope';

const router = Router();

const p = prisma;

// Same scope as the MD Approvals inbox (routes/md.ts): every company the
// reviewer can access (Admin: all). Using only the home company meant the
// inbox could count requests this queue never showed.
const proposalEmployeeScope = async (req: AuthenticatedRequest) =>
  req.user!.roles.includes(Roles.ADMIN)
    ? {}
    : { company_id: { in: await getAccessibleCompanyIds(req.user!) } };

// A multi-day leave is stored as one row per day sharing a created_at (see
// /leave-proposal). Collapse them into one entry with the date range for
// the HR/MD queue and history.
const groupLeaveDays = <
  T extends {
    id: number;
    type: string;
    employee_id: number;
    created_at: Date;
    target_date: Date;
    status: string;
  },
>(
  rows: T[],
) => {
  const out: (T & { end_date?: Date; days?: number })[] = [];
  const seen = new Map<string, T & { end_date?: Date; days?: number }>();
  for (const r of rows) {
    if (r.type !== 'LEAVE') {
      out.push(r);
      continue;
    }
    const key = `${r.employee_id}:${r.created_at.getTime()}:${r.status}`;
    const g = seen.get(key);
    if (!g) {
      const entry = { ...r, end_date: r.target_date, days: 1 };
      seen.set(key, entry);
      out.push(entry);
    } else {
      g.days = (g.days || 1) + 1;
      if (r.target_date < g.target_date) g.target_date = r.target_date;
      if (!g.end_date || r.target_date > g.end_date) g.end_date = r.target_date;
    }
  }
  return out;
};

const proposalLabel = (type: string) =>
  ({
    LEAVE: 'leave',
    FIELD_WORK: 'field work',
    WORK_FROM_HOME: 'work-from-home',
    EARLY_CHECKOUT: 'early logout',
  })[type] || 'late';

// POST /api/v1/attendance/late-proposal - Submit late proposal (< 09:30 AM IST)
router.post(
  '/late-proposal',
  authenticateToken,
  validateRequestBody(LateProposalSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { hours, minutes } = getISTComponents(new Date());
      const currentMinutes = hours * 60 + minutes;
      const cutoff930 = 9 * 60 + 30; // 09:30 AM

      if (currentMinutes > cutoff930) {
        return res.status(400).json({
          error: 'Late proposals must be submitted before 09:30 AM IST on the same day.',
        });
      }

      // Record proposal in AttendanceProposal table
      const proposal = await p.attendanceProposal.create({
        data: {
          employee_id: req.user!.employeeId,
          type: 'LATE_CHECKIN',
          target_date: new Date(`${req.body.date}T${req.body.expected_time}:00+05:30`),
          reason: req.body.reason,
          status: 'PENDING',
        },
      });

      // Write AuditEvent so the HR approval queue (GET /attendance/proposals/queue)
      // can surface this submission — queue filters on action: 'SUBMIT_LATE_PROPOSAL'
      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'SUBMIT_LATE_PROPOSAL',
          entity_type: 'ATTENDANCE_PROPOSAL',
          entity_id: proposal.id,
          new_value: JSON.stringify({
            type: 'LATE_CHECKIN',
            target_date: proposal.target_date,
            reason: req.body.reason,
          }),
        },
      });

      return res.status(201).json({
        message: 'Late proposal submitted successfully to HR queue',
        proposalId: proposal.id,
      });
    } catch (error: any) {
      logger.error('Late proposal error:', error);
      return res
        .status(500)
        .json({ error: 'Failed to submit late proposal', detail: error?.message });
    }
  },
);

// POST /api/v1/attendance/leave-proposal - Submit leave proposal
router.post(
  '/leave-proposal',
  authenticateToken,
  validateRequestBody(LeaveProposalSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { start_date, end_date, reason, leave_type = 'FULL_DAY' } = req.body;
      if (!start_date || !reason) {
        return res.status(400).json({ error: 'Start date and reason are required' });
      }

      // Check if start_date is >= tomorrow
      // Compare IST calendar dates (the server clock is UTC).
      const todayIST = getISTComponents(new Date()).dateString;
      if (String(start_date).slice(0, 10) <= todayIST) {
        return res.status(400).json({
          error: 'Leave requests must be submitted at least 1 day in advance.',
        });
      }

      // A leave covers every working day from start_date to end_date. Only
      // start_date used to be saved, so on a 3-day leave days 2-3 were
      // marked UNINFORMED_ABSENT (performance penalty) and shown absent on
      // the calendar. AttendanceProposal has one target_date, so one row per
      // day is created; all share one created_at, which is how approve /
      // reject / the HR queue treat them as a single request.
      const startKey = String(start_date).slice(0, 10);
      const endKey = end_date ? String(end_date).slice(0, 10) : startKey;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endKey)) {
        return res.status(400).json({ error: 'Dates must be YYYY-MM-DD.' });
      }
      if (endKey < startKey) {
        return res.status(400).json({ error: 'End date is before the start date.' });
      }
      if (leave_type !== 'FULL_DAY' && endKey !== startKey) {
        return res.status(400).json({ error: 'A half-day leave is for a single day.' });
      }
      const first = getISTMidnightInstant(startKey);
      const last = getISTMidnightInstant(endKey);
      const totalDays = Math.round((last.getTime() - first.getTime()) / 86400000) + 1;
      if (totalDays > 31) {
        return res.status(400).json({ error: 'A single leave request can cover at most 31 days.' });
      }
      const holidays = await p.companyHoliday.findMany({
        where: {
          company_id: req.user!.companyId,
          date: { gte: toHolidayDateKey(startKey), lte: toHolidayDateKey(endKey) },
        },
        select: { date: true },
      });
      const holidayKeys = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
      const days: Date[] = [];
      for (let i = 0; i < totalDays; i++) {
        const day = new Date(first.getTime() + i * 86400000);
        const key = getISTComponents(day).dateString;
        if (getISTDayOfWeek(key) === 0 || holidayKeys.has(key)) continue;
        days.push(day);
      }
      if (days.length === 0) {
        return res
          .status(400)
          .json({ error: 'Those dates are all Sundays or holidays -- no leave needed.' });
      }
      const overlapping = await p.attendanceProposal.findFirst({
        where: {
          employee_id: req.user!.employeeId,
          type: 'LEAVE',
          status: { in: ['PENDING', 'APPROVED'] },
          target_date: { in: days },
        },
      });
      if (overlapping) {
        return res.status(409).json({
          error: `You already have a ${overlapping.status.toLowerCase()} leave on ${getISTComponents(overlapping.target_date).dateString}.`,
        });
      }

      const createdAt = new Date();
      await p.attendanceProposal.createMany({
        data: days.map((day) => ({
          employee_id: req.user!.employeeId,
          type: 'LEAVE',
          leave_type,
          target_date: day,
          reason,
          status: 'PENDING',
          created_at: createdAt,
        })),
      });
      const proposal = await p.attendanceProposal.findFirst({
        where: { employee_id: req.user!.employeeId, type: 'LEAVE', created_at: createdAt },
        orderBy: { target_date: 'asc' },
      });

      // Write AuditEvent so the HR approval queue can surface it
      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'SUBMIT_LEAVE_PROPOSAL',
          entity_type: 'ATTENDANCE_PROPOSAL',
          entity_id: proposal?.id ?? 0,
          new_value: JSON.stringify({
            type: 'LEAVE',
            leave_type,
            start_date: startKey,
            end_date: endKey,
            working_days: days.length,
            reason,
          }),
        },
      });

      return res.status(201).json({
        message:
          days.length === 1
            ? 'Leave request sent for approval.'
            : `Leave request for ${days.length} working days sent for approval.`,
        proposalId: proposal?.id ?? null,
        working_days: days.length,
      });
    } catch (error: any) {
      logger.error('Leave proposal error:', error);
      return res
        .status(500)
        .json({ error: 'Failed to submit leave proposal', detail: error?.message });
    }
  },
);

// POST /api/v1/attendance/field-work-proposal - Submit field work proposal
router.post(
  '/field-work-proposal',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { date, reason } = req.body;
      if (!date || !reason) {
        return res.status(400).json({ error: 'Date and reason are required' });
      }

      // One field-work request per day (pending or approved).
      const fwStart = new Date(`${String(date).slice(0, 10)}T00:00:00+05:30`);
      const duplicate = await p.attendanceProposal.findFirst({
        where: {
          employee_id: req.user!.employeeId,
          type: 'FIELD_WORK',
          status: { in: ['PENDING', 'APPROVED'] },
          target_date: { gte: fwStart, lt: new Date(fwStart.getTime() + 86400000) },
        },
      });
      if (duplicate) {
        return res.status(409).json({
          error: `You already have a ${duplicate.status.toLowerCase()} field-work request for that day.`,
        });
      }

      // Record proposal in AttendanceProposal table
      const proposal = await p.attendanceProposal.create({
        data: {
          employee_id: req.user!.employeeId,
          type: 'FIELD_WORK',
          target_date: new Date(`${date}T00:00:00+05:30`),
          reason: reason,
          status: 'PENDING',
        },
      });

      // Write AuditEvent so HR sees it
      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'SUBMIT_FIELD_WORK_PROPOSAL',
          entity_type: 'ATTENDANCE_PROPOSAL',
          entity_id: proposal.id,
          new_value: JSON.stringify({
            type: 'FIELD_WORK',
            target_date: proposal.target_date,
            reason: reason,
          }),
        },
      });

      return res.status(201).json({
        message: 'Field work proposal submitted successfully to HR queue',
        proposalId: proposal.id,
      });
    } catch (error: any) {
      logger.error('Field work proposal error:', error);
      return res
        .status(500)
        .json({ error: 'Failed to submit field work proposal', detail: error?.message });
    }
  },
);

// POST /api/v1/attendance/early-logout-proposal - Submit emergency early logout
router.post(
  '/early-logout-proposal',
  authenticateToken,
  validateRequestBody(LateProposalSchema), // Reusing LateProposalSchema since it has date, expected_time, reason
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Record proposal in AttendanceProposal table
      const proposal = await p.attendanceProposal.create({
        data: {
          employee_id: req.user!.employeeId,
          type: 'EARLY_CHECKOUT',
          target_date: new Date(`${req.body.date}T${req.body.expected_time}:00+05:30`),
          reason: req.body.reason,
          status: 'APPROVED', // Auto-approved for emergencies
        },
      });

      // Write AuditEvent so HR sees it
      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'SUBMIT_EARLY_LOGOUT',
          entity_type: 'ATTENDANCE_PROPOSAL',
          entity_id: proposal.id,
          new_value: JSON.stringify({
            type: 'EARLY_CHECKOUT',
            target_date: proposal.target_date,
            reason: req.body.reason,
          }),
        },
      });

      return res.status(201).json({
        message:
          'Emergency logout request recorded successfully. You may now scan out at the Kiosk.',
        proposalId: proposal.id,
      });
    } catch (error: any) {
      logger.error('Early logout proposal error:', error);
      return res
        .status(500)
        .json({ error: 'Failed to submit emergency logout request', detail: error?.message });
    }
  },
);

// GET /api/v1/attendance/proposals/queue - HR Manager approval queue
router.get(
  '/proposals/queue',
  authenticateToken,
  requireRole([Roles.HR_MANAGER, Roles.MD, Roles.ADMIN]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const companyEmployees = await p.employee.findMany({
        where: await proposalEmployeeScope(req),
        select: { id: true, full_name: true, employee_code: true },
      });

      const employeeIds = companyEmployees.map((e: any) => e.id);

      const proposals = await p.attendanceProposal.findMany({
        where: {
          employee_id: { in: employeeIds },
          status: 'PENDING',
        },
        orderBy: { created_at: 'desc' },
      });

      // Monthly stats: every proposal targeting the current IST calendar
      // month, so HR/MD can see the employee's pattern alongside each
      // pending item. Lateness is a fact independent of approval (approval
      // only decides whether it's excused/penalized), so `lates` counts every
      // LATE_CHECKIN request submitted this month regardless of outcome.
      // Leave is different: a REJECTED leave request means the employee
      // attended instead, so it must NOT count as leave taken — `leaves` and
      // `halfDays` here count only APPROVED requests (days actually taken),
      // with rejected counts surfaced separately for context. A PENDING item
      // is by definition neither approved nor rejected, so it never
      // contributes to leaves/halfDays; only `lates` needs the pending item
      // being reviewed subtracted back out of its own count below.
      const { dateString: todayStr } = getISTComponents(new Date());
      const [year, month] = todayStr.split('-');
      const monthStart = new Date(`${year}-${month}-01T00:00:00+05:30`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const monthProposals = await p.attendanceProposal.findMany({
        where: { employee_id: { in: employeeIds }, target_date: { gte: monthStart, lt: monthEnd } },
        select: { employee_id: true, type: true, leave_type: true, status: true },
      });

      type MonthlyStats = {
        lates: number;
        approvedLates: number;
        halfDaysTaken: number;
        halfDaysRejected: number;
        leavesTaken: number;
        leavesRejected: number;
      };
      const emptyStats = (): MonthlyStats => ({
        lates: 0,
        approvedLates: 0,
        halfDaysTaken: 0,
        halfDaysRejected: 0,
        leavesTaken: 0,
        leavesRejected: 0,
      });

      const statsByEmployee: Record<number, MonthlyStats> = {};
      for (const mp of monthProposals) {
        const s = (statsByEmployee[mp.employee_id] ||= emptyStats());
        if (mp.type === 'LATE_CHECKIN') {
          s.lates++;
          if (mp.status === 'APPROVED') s.approvedLates++;
        } else if (mp.type === 'LEAVE') {
          const isHalf = mp.leave_type === 'FIRST_HALF' || mp.leave_type === 'SECOND_HALF';
          if (isHalf) {
            if (mp.status === 'APPROVED') s.halfDaysTaken++;
            else if (mp.status === 'REJECTED') s.halfDaysRejected++;
          } else {
            if (mp.status === 'APPROVED') s.leavesTaken++;
            else if (mp.status === 'REJECTED') s.leavesRejected++;
          }
        }
      }

      const mappedProposals = groupLeaveDays(proposals).map((proposal: any) => {
        const emp = companyEmployees.find((e: any) => e.id === proposal.employee_id);
        const monthlyStats = { ...(statsByEmployee[proposal.employee_id] || emptyStats()) };

        // Exclude this pending item from its own displayed "lates" count —
        // leaves/halfDays never include pending items in the first place.
        if (proposal.type === 'LATE_CHECKIN') {
          monthlyStats.lates = Math.max(0, monthlyStats.lates - 1);
        }

        return {
          ...proposal,
          employee: emp,
          monthlyStats,
        };
      });

      return res.status(200).json({ proposals: mappedProposals });
    } catch (error) {
      logger.error('Proposal queue error:', error);
      return res.status(500).json({ error: 'Failed to load HR proposal queue' });
    }
  },
);

// GET /api/v1/attendance/proposals/history - HR Manager approval history
router.get(
  '/proposals/history',
  authenticateToken,
  requireRole([Roles.HR_MANAGER, Roles.MD, Roles.ADMIN]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const companyEmployees = await p.employee.findMany({
        where: await proposalEmployeeScope(req),
        select: { id: true, full_name: true, employee_code: true },
      });

      const proposals = await p.attendanceProposal.findMany({
        where: {
          employee_id: { in: companyEmployees.map((e: any) => e.id) },
          status: { in: ['APPROVED', 'REJECTED'] },
        },
        orderBy: { reviewed_at: 'desc' },
        take: 100, // Limit to recent 100 to avoid huge payloads
      });

      const mappedProposals = groupLeaveDays(proposals).map((proposal: any) => {
        const emp = companyEmployees.find((e: any) => e.id === proposal.employee_id);
        return {
          ...proposal,
          employee: emp,
        };
      });

      return res.status(200).json({ proposals: mappedProposals });
    } catch (error) {
      logger.error('Proposal history error:', error);
      return res.status(500).json({ error: 'Failed to load HR proposal history' });
    }
  },
);

// POST /api/v1/attendance/proposals/:id/approve - Approve proposal (changes attendance status, e.g. LATE -> PRESENT)
router.post(
  '/proposals/:id/approve',
  authenticateToken,
  requireRole([Roles.MD, Roles.ADMIN]),
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const proposal = await p.attendanceProposal.findUnique({ where: { id } });
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
      // Only the reviewer's own companies, and only undecided requests:
      // re-deciding used to re-run the attendance side effects (a rejected
      // field-work day flipped back to PRESENT, or vice versa).
      const inScope = await p.employee.count({
        where: { id: proposal.employee_id, ...(await proposalEmployeeScope(req)) },
      });
      if (!inScope) return res.status(404).json({ error: 'Proposal not found' });
      if (proposal.status !== 'PENDING') {
        return res
          .status(409)
          .json({ error: `This request was already ${proposal.status.toLowerCase()}.` });
      }

      const updated = await p.attendanceProposal.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewed_by: req.user!.employeeId,
          reviewed_at: new Date(),
        },
      });
      // The other days of the same multi-day leave go with it.
      let leaveDays = 1;
      if (updated.type === 'LEAVE') {
        const siblings = await p.attendanceProposal.updateMany({
          where: {
            employee_id: updated.employee_id,
            type: 'LEAVE',
            status: 'PENDING',
            created_at: updated.created_at,
            id: { not: updated.id },
          },
          data: {
            status: 'APPROVED',
            reviewed_by: req.user!.employeeId,
            reviewed_at: new Date(),
          },
        });
        leaveDays += siblings.count;
      }

      if (updated.type === 'LATE_CHECKIN') {
        const targetDate = new Date(updated.target_date);
        const { dateString } = getISTComponents(targetDate);
        const istTodayStart = new Date(`${dateString}T00:00:00+05:30`);
        const istTodayEnd = new Date(`${dateString}T23:59:59+05:30`);

        const existingLog = await p.attendanceLog.findFirst({
          where: {
            employee_id: updated.employee_id,
            check_in_at: { gte: istTodayStart, lte: istTodayEnd },
          },
        });

        if (existingLog) {
          const emp = await p.employee.findUnique({ where: { id: updated.employee_id } });
          if (emp) {
            const newStatus = calculateAttendanceStatus(
              existingLog.check_in_at,
              true,
              emp.employment_type || 'FULL_TIME',
            );
            if (newStatus !== existingLog.status) {
              await p.attendanceLog.update({
                where: { id: existingLog.id },
                data: { status: newStatus },
              });
            }
          }
        }
      } else if (updated.type === 'FIELD_WORK') {
        // Today or later: the employee checks in/out from the app on that
        // day (routes/attendance/wfh.ts, source FIELD) -- real times instead
        // of an automatic 9:30-18:30. Only a day that has already passed
        // (approved after the fact) is filled in here, since no check-in
        // is possible any more.
        const targetDate = new Date(updated.target_date);
        const { dateString } = getISTComponents(targetDate);
        const todayString = getISTComponents(new Date()).dateString;
        const istTodayStart = new Date(`${dateString}T00:00:00+05:30`);
        const istTodayEnd = new Date(`${dateString}T23:59:59+05:30`);

        const existingLog =
          dateString < todayString
            ? await p.attendanceLog.findFirst({
                where: {
                  employee_id: updated.employee_id,
                  check_in_at: { gte: istTodayStart, lte: istTodayEnd },
                },
              })
            : null;

        if (dateString < todayString && !existingLog) {
          await p.attendanceLog.create({
            data: {
              employee_id: updated.employee_id,
              check_in_at: new Date(`${dateString}T09:30:00+05:30`),
              check_out_at: new Date(`${dateString}T18:30:00+05:30`),
              working_duration_minutes: 540,
              status: 'PRESENT',
              // Created by approving a request, not by anyone scanning.
              source: 'PROPOSAL',
              notes: 'Field work (approved after the day)',
            },
          });
        } else if (existingLog && existingLog.status === 'ABSENT') {
          await p.attendanceLog.update({
            where: { id: existingLog.id },
            data: { status: 'PRESENT' },
          });
        }
      }

      notifyEmployee(proposal.employee_id, {
        title: 'Proposal Approved',
        message: `Your ${proposalLabel(proposal.type)} request for ${new Date(proposal.target_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}${leaveDays > 1 ? ` (${leaveDays} days)` : ''} has been approved.`,
        type: 'SYSTEM',
        link: '/requests',
      });

      return res.status(200).json({ message: 'Proposal approved', proposal: updated });
    } catch (error) {
      logger.error('Proposal approve error:', error);
      return res.status(500).json({ error: 'Failed to approve proposal' });
    }
  },
);

// POST /api/v1/attendance/proposals/:id/reject - Reject proposal (changes attendance status)
router.post(
  '/proposals/:id/reject',
  authenticateToken,
  requireRole([Roles.MD, Roles.ADMIN]),
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const proposal = await p.attendanceProposal.findUnique({ where: { id } });
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
      // Only the reviewer's own companies, and only undecided requests:
      // re-deciding used to re-run the attendance side effects (a rejected
      // field-work day flipped back to PRESENT, or vice versa).
      const inScope = await p.employee.count({
        where: { id: proposal.employee_id, ...(await proposalEmployeeScope(req)) },
      });
      if (!inScope) return res.status(404).json({ error: 'Proposal not found' });
      if (proposal.status !== 'PENDING') {
        return res
          .status(409)
          .json({ error: `This request was already ${proposal.status.toLowerCase()}.` });
      }

      const updated = await p.attendanceProposal.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewed_by: req.user!.employeeId,
          reviewed_at: new Date(),
        },
      });
      // The other days of the same multi-day leave go with it.
      let leaveDays = 1;
      if (updated.type === 'LEAVE') {
        const siblings = await p.attendanceProposal.updateMany({
          where: {
            employee_id: updated.employee_id,
            type: 'LEAVE',
            status: 'PENDING',
            created_at: updated.created_at,
            id: { not: updated.id },
          },
          data: {
            status: 'REJECTED',
            reviewed_by: req.user!.employeeId,
            reviewed_at: new Date(),
          },
        });
        leaveDays += siblings.count;
      }

      // A rejected field-work request no longer touches attendance: it used
      // to mark the day ABSENT even over a real kiosk check-in. Days with no
      // check-in are already handled by the nightly attendance rollup.

      notifyEmployee(proposal.employee_id, {
        title: 'Proposal Rejected',
        message: `Your ${proposalLabel(proposal.type)} request for ${new Date(proposal.target_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}${leaveDays > 1 ? ` (${leaveDays} days)` : ''} has been rejected.`,
        type: 'SYSTEM',
        link: '/requests',
      });

      return res.status(200).json({ message: 'Proposal rejected', proposal: updated });
    } catch (error) {
      logger.error('Proposal reject error:', error);
      return res.status(500).json({ error: 'Failed to reject proposal' });
    }
  },
);

// GET /api/v1/attendance/proposals/my - Employee's own proposals
router.get('/proposals/my', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const proposals = await p.attendanceProposal.findMany({
      where: { employee_id: req.user!.employeeId },
      orderBy: { created_at: 'desc' },
      take: 20,
    });

    return res.status(200).json({ proposals });
  } catch (error) {
    logger.error('My proposals error:', error);
    return res.status(500).json({ error: 'Failed to load my proposals' });
  }
});

export default router;
