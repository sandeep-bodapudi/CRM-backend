// Week-offs, duty days, comp-off and selfie check-in (2026-10-17).
//
// Each person has their own weekly off (Employee.weekly_off_day); company holidays
// are for everyone. Working on an off day is a "duty day" (asked for by the person
// or assigned by their manager). On a duty day -- or an approved field day -- the
// person can check in from their phone with a selfie, a photo of the surroundings
// and their location; doubtful check-ins wait for the manager. A duty day worked
// earns one comp-off day. The reporting manager (or HR / MD) decides the requests.
import { logger } from '../../utils/logger';
import { recheckAbsences } from '../../services/absenceRecheck';
import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { validateRequestBody } from '../../middleware/validate';
import { Roles } from '../../shared';
import { getDownstreamEmployeeIds } from '../../utils/hierarchy';
import { getAccessibleCompanyIds } from '../../authz/dataScope';
import { notifyEmployee } from '../../utils/notifyEmployee';
import {
  calculateAttendanceStatus,
  getISTComponents,
  getISTMidnightInstant,
  toHolidayDateKey,
} from '../../utils/time';
import { processImageBuffer, getStorageService } from '../../services/storage.service';
import {
  dayInfo,
  workEmployee,
  creditCompOffIfEarned,
  compOffBalance,
  WEEKDAY_NAMES,
  DUTY_DAY,
  SWAP_OFF,
  COMP_OFF,
  ATTENDANCE_CLAIM,
  TEAM_REQUEST_TYPES,
} from '../../services/workCalendar';
import {
  distanceMetres,
  plainBackground,
  aiPlaceCheck,
  OFFICE_RADIUS_M,
  SITE_RADIUS_M,
} from '../../services/checkinProof.service';

const router = Router();
const p = prisma;
const DAY_MS = 24 * 3600 * 1000;
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const TYPE_LABEL: Record<string, string> = {
  [DUTY_DAY]: 'duty day',
  [SWAP_OFF]: 'week-off swap',
  [COMP_OFF]: 'comp-off',
  [ATTENDANCE_CLAIM]: 'attendance',
};

const isHrOrTop = (roles: string[]) =>
  roles.some((r) => [Roles.MD, Roles.ADMIN, Roles.HR_MANAGER].includes(r as any));

/** Employee ids whose requests this person may decide (their team; HR/MD: the company). */
async function decidableIds(req: AuthenticatedRequest): Promise<number[]> {
  const user = req.user!;
  if (isHrOrTop(user.roles)) {
    const companyIds = user.roles.includes(Roles.ADMIN)
      ? undefined
      : await getAccessibleCompanyIds(user);
    const rows = await p.employee.findMany({
      where: { status: 'ACTIVE', ...(companyIds ? { company_id: { in: companyIds } } : {}) },
      select: { id: true },
    });
    return rows.map((r) => r.id).filter((id) => id !== user.employeeId);
  }
  return (await getDownstreamEmployeeIds(user.companyId, user.employeeId)).filter(
    (id) => id !== user.employeeId,
  );
}

const dayRange = (dateString: string) => {
  const start = getISTMidnightInstant(dateString);
  return { gte: start, lt: new Date(start.getTime() + DAY_MS) };
};

const todayKey = () => getISTComponents(new Date()).dateString;

/** Tell the person's manager (and HR when there is no manager) about a new request. */
async function tellApprover(employeeId: number, title: string, message: string) {
  try {
    const emp = await p.employee.findUnique({
      where: { id: employeeId },
      select: { reporting_manager_id: true, company_id: true },
    });
    let to: number[] = emp?.reporting_manager_id ? [emp.reporting_manager_id] : [];
    if (to.length === 0 && emp) {
      const hr = await p.employee.findMany({
        where: {
          company_id: emp.company_id,
          status: 'ACTIVE',
          roles: { some: { role: { name: { in: [Roles.HR_MANAGER, Roles.MD] } } } },
        },
        select: { id: true },
      });
      to = hr.map((h) => h.id);
    }
    if (to.length)
      await notifyEmployee(to, { type: 'SYSTEM', title, message, link: '/team-requests' });
  } catch (err) {
    logger.error('[duty] could not notify approver:', err);
  }
}

// ---------------------------------------------------------------------------
// My days
// ---------------------------------------------------------------------------

// GET /api/v1/attendance/my-days - my weekly off, today, my requests, comp-off balance
router.get('/my-days', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const me = await workEmployee(req.user!.employeeId);
    if (!me) return res.status(404).json({ error: 'Employee not found' });
    const today = todayKey();
    const info = await dayInfo(me, today);
    const fieldToday = await p.attendanceProposal.findFirst({
      where: {
        employee_id: me.id,
        type: 'FIELD_WORK',
        status: 'APPROVED',
        target_date: dayRange(today),
      },
      select: { id: true },
    });
    const [requests, balance, log, proof] = await Promise.all([
      p.attendanceProposal.findMany({
        where: {
          employee_id: me.id,
          type: { in: TEAM_REQUEST_TYPES },
          target_date: { gte: new Date(Date.now() - 30 * DAY_MS) },
        },
        orderBy: { target_date: 'desc' },
        take: 60,
      }),
      compOffBalance(me.id),
      p.attendanceLog.findFirst({
        where: { employee_id: me.id, check_in_at: dayRange(today) },
        orderBy: { check_in_at: 'desc' },
      }),
      p.attendanceCheckinProof.findFirst({
        where: { employee_id: me.id, created_at: dayRange(today) },
        orderBy: { id: 'desc' },
        select: { id: true, review_status: true, flags: true },
      }),
    ]);
    return res.status(200).json({
      date: today,
      weekly_off_day: me.weekly_off_day,
      weekly_off_name: me.weekly_off_day === null ? null : WEEKDAY_NAMES[me.weekly_off_day],
      today: info,
      // Phone check-in (selfie + location) is open on a duty day or an approved field day.
      can_selfie_checkin: (info.duty || !!fieldToday) && !log,
      field_day_today: !!fieldToday,
      log: log
        ? {
            check_in_at: log.check_in_at,
            check_out_at: log.check_out_at,
            status: log.status,
            source: log.source,
          }
        : null,
      proof: proof ? { ...proof, flags: proof.flags ? JSON.parse(proof.flags) : [] } : null,
      comp_off: balance,
      requests,
    });
  } catch (error) {
    logger.error('My days error:', error);
    return res.status(500).json({ error: 'Failed to load your days' });
  }
});

// ---------------------------------------------------------------------------
// Requests by the employee
// ---------------------------------------------------------------------------

const DutyRequestSchema = z.object({ date: dateKey, reason: z.string().trim().min(3).max(300) });

// POST /api/v1/attendance/duty-request - "I will work on my off day <date>"
router.post(
  '/duty-request',
  authenticateToken,
  validateRequestBody(DutyRequestSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const me = await workEmployee(req.user!.employeeId);
      if (!me) return res.status(404).json({ error: 'Employee not found' });
      const { date, reason } = req.body;
      if (date < todayKey()) {
        return res.status(400).json({ error: 'For a past day, use "Mark my attendance" instead.' });
      }
      const info = await dayInfo(me, date);
      if (info.duty) return res.status(409).json({ error: 'That day is already a duty day.' });
      if (!info.holiday && !info.weekOff) {
        return res
          .status(400)
          .json({ error: 'That is a normal working day for you, not an off day.' });
      }
      const pending = await p.attendanceProposal.findFirst({
        where: {
          employee_id: me.id,
          type: DUTY_DAY,
          status: 'PENDING',
          target_date: dayRange(date),
        },
      });
      if (pending) return res.status(409).json({ error: 'You already asked for that day.' });
      const created = await p.attendanceProposal.create({
        data: {
          employee_id: me.id,
          type: DUTY_DAY,
          target_date: getISTMidnightInstant(date),
          reason,
          status: 'PENDING',
        },
      });
      await tellApprover(
        me.id,
        'Duty day request',
        `${req.user!.employeeCode} wants to work on ${date} (${info.label}): ${reason}`,
      );
      return res
        .status(201)
        .json({ message: 'Duty day request sent to your manager.', request: created });
    } catch (error) {
      logger.error('Duty request error:', error);
      return res.status(500).json({ error: 'Failed to send the request' });
    }
  },
);

const SwapSchema = z.object({
  work_date: dateKey,
  off_date: dateKey,
  reason: z.string().trim().min(3).max(300),
});

// POST /api/v1/attendance/swap-request - "work on my off day X, take Y off instead"
router.post(
  '/swap-request',
  authenticateToken,
  validateRequestBody(SwapSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const me = await workEmployee(req.user!.employeeId);
      if (!me) return res.status(404).json({ error: 'Employee not found' });
      const { work_date, off_date, reason } = req.body;
      if (work_date < todayKey() || off_date < todayKey()) {
        return res.status(400).json({ error: 'Both days must be today or later.' });
      }
      const [workInfo, offInfo] = await Promise.all([
        dayInfo(me, work_date),
        dayInfo(me, off_date),
      ]);
      if (!workInfo.holiday && !workInfo.weekOff) {
        return res.status(400).json({ error: `${work_date} is not one of your off days.` });
      }
      if (offInfo.offDay || offInfo.holiday || offInfo.weekOff) {
        return res.status(400).json({ error: `${off_date} is already an off day for you.` });
      }
      // Created together (same time stamp) so they are approved or rejected together.
      const at = new Date();
      await p.attendanceProposal.createMany({
        data: [
          {
            employee_id: me.id,
            type: DUTY_DAY,
            target_date: getISTMidnightInstant(work_date),
            reason: `Swap: work ${work_date}, off ${off_date}. ${reason}`,
            status: 'PENDING',
            created_at: at,
          },
          {
            employee_id: me.id,
            type: SWAP_OFF,
            target_date: getISTMidnightInstant(off_date),
            reason: `Swap: work ${work_date}, off ${off_date}. ${reason}`,
            status: 'PENDING',
            created_at: at,
          },
        ],
      });
      await tellApprover(
        me.id,
        'Week-off swap request',
        `${req.user!.employeeCode}: work ${work_date}, take ${off_date} off. ${reason}`,
      );
      return res.status(201).json({ message: 'Swap request sent to your manager.' });
    } catch (error) {
      logger.error('Swap request error:', error);
      return res.status(500).json({ error: 'Failed to send the request' });
    }
  },
);

// POST /api/v1/attendance/comp-off-request - use one comp-off day
router.post(
  '/comp-off-request',
  authenticateToken,
  validateRequestBody(DutyRequestSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const me = await workEmployee(req.user!.employeeId);
      if (!me) return res.status(404).json({ error: 'Employee not found' });
      const { date, reason } = req.body;
      const balance = await compOffBalance(me.id);
      if (balance.available < 1) {
        return res.status(400).json({ error: 'You have no comp-off days to use.' });
      }
      const info = await dayInfo(me, date);
      if (info.offDay || info.holiday || info.weekOff) {
        return res.status(400).json({ error: 'That day is already an off day for you.' });
      }
      const created = await p.attendanceProposal.create({
        data: {
          employee_id: me.id,
          type: COMP_OFF,
          target_date: getISTMidnightInstant(date),
          reason,
          status: 'PENDING',
        },
      });
      await tellApprover(
        me.id,
        'Comp-off request',
        `${req.user!.employeeCode} wants a comp-off on ${date}: ${reason}`,
      );
      return res
        .status(201)
        .json({ message: 'Comp-off request sent to your manager.', request: created });
    } catch (error) {
      logger.error('Comp-off request error:', error);
      return res.status(500).json({ error: 'Failed to send the request' });
    }
  },
);

// POST /api/v1/attendance/claim-request - "I worked on <date> but could not check in"
router.post(
  '/claim-request',
  authenticateToken,
  validateRequestBody(DutyRequestSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const me = await workEmployee(req.user!.employeeId);
      if (!me) return res.status(404).json({ error: 'Employee not found' });
      const { date, reason } = req.body;
      const today = todayKey();
      const oldest = getISTComponents(new Date(Date.now() - 7 * DAY_MS)).dateString;
      if (date > today || date < oldest) {
        return res.status(400).json({ error: 'You can ask for a day in the last 7 days.' });
      }
      const log = await p.attendanceLog.findFirst({
        where: { employee_id: me.id, check_in_at: dayRange(date) },
      });
      if (log) return res.status(409).json({ error: 'You already have attendance for that day.' });
      const dup = await p.attendanceProposal.findFirst({
        where: {
          employee_id: me.id,
          type: ATTENDANCE_CLAIM,
          status: 'PENDING',
          target_date: dayRange(date),
        },
      });
      if (dup) return res.status(409).json({ error: 'You already asked for that day.' });
      const created = await p.attendanceProposal.create({
        data: {
          employee_id: me.id,
          type: ATTENDANCE_CLAIM,
          target_date: getISTMidnightInstant(date),
          reason,
          status: 'PENDING',
        },
      });
      await tellApprover(
        me.id,
        'Attendance request',
        `${req.user!.employeeCode} asks to be marked present on ${date}: ${reason}`,
      );
      return res
        .status(201)
        .json({ message: 'Sent to your manager, who sees your work that day.', request: created });
    } catch (error) {
      logger.error('Claim request error:', error);
      return res.status(500).json({ error: 'Failed to send the request' });
    }
  },
);

// ---------------------------------------------------------------------------
// Manager: queue, decisions, assigning duty days
// ---------------------------------------------------------------------------

/** What the person did in the CRM that day: the approver's evidence. */
async function workEvidence(employeeId: number, dateString: string) {
  const range = dayRange(dateString);
  const [acts, visits, log] = await Promise.all([
    p.leadActivity.findMany({
      where: { actor_id: employeeId, created_at: range },
      select: { activity_type: true, created_at: true },
      orderBy: { created_at: 'asc' },
    }),
    p.siteVisitBooking.count({
      where: {
        status: 'COMPLETED',
        completed_at: range,
        OR: [
          { assigned_agent_id: employeeId },
          { project_manager_id: employeeId },
          { telecaller_id: employeeId, visit_type: 'WALK_IN' },
        ],
      },
    }),
    p.attendanceLog.findFirst({
      where: { employee_id: employeeId, check_in_at: range },
      select: { check_in_at: true, check_out_at: true, source: true },
    }),
  ]);
  return {
    calls: acts.filter((a) => a.activity_type === 'CALL_LOGGED').length,
    activities: acts.length,
    first_activity: acts[0]?.created_at || null,
    last_activity: acts[acts.length - 1]?.created_at || null,
    visits_completed: visits,
    attendance: log,
  };
}

// GET /api/v1/attendance/team-requests - pending duty / swap / comp-off / attendance
// requests and doubtful phone check-ins of the people I approve for
router.get(
  '/team-requests',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ids = await decidableIds(req);
      if (ids.length === 0) return res.status(200).json({ requests: [], checkins: [] });
      const [requests, proofs, people] = await Promise.all([
        p.attendanceProposal.findMany({
          where: { employee_id: { in: ids }, type: { in: TEAM_REQUEST_TYPES }, status: 'PENDING' },
          orderBy: { target_date: 'asc' },
          take: 200,
        }),
        p.attendanceCheckinProof.findMany({
          where: { employee_id: { in: ids }, review_status: 'PENDING' },
          orderBy: { created_at: 'desc' },
          take: 100,
        }),
        p.employee.findMany({
          where: { id: { in: ids } },
          select: { id: true, full_name: true, employee_code: true },
        }),
      ]);
      const nameOf = new Map(people.map((x) => [x.id, x.full_name || x.employee_code]));
      const withEvidence = [];
      for (const r of requests) {
        const ds = getISTComponents(r.target_date).dateString;
        withEvidence.push({
          ...r,
          date: ds,
          employee_name: nameOf.get(r.employee_id) || null,
          evidence:
            [DUTY_DAY, ATTENDANCE_CLAIM].includes(r.type) && ds <= todayKey()
              ? await workEvidence(r.employee_id, ds)
              : null,
        });
      }
      return res.status(200).json({
        requests: withEvidence,
        checkins: proofs.map((x) => ({
          ...x,
          employee_name: nameOf.get(x.employee_id) || null,
          flags: x.flags ? JSON.parse(x.flags) : [],
          selfie: `/attendance/checkin-proofs/${x.id}/photo/selfie`,
          surroundings: `/attendance/checkin-proofs/${x.id}/photo/surroundings`,
        })),
      });
    } catch (error) {
      logger.error('Team requests error:', error);
      return res.status(500).json({ error: 'Failed to load team requests' });
    }
  },
);

const DecideSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(300).optional(),
});

// POST /api/v1/attendance/team-requests/:id/decide
router.post(
  '/team-requests/:id/decide',
  authenticateToken,
  validateRequestBody(DecideSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const reqRow = await p.attendanceProposal.findUnique({ where: { id } });
      if (!reqRow || !TEAM_REQUEST_TYPES.includes(reqRow.type)) {
        return res.status(404).json({ error: 'Request not found' });
      }
      if (!(await decidableIds(req)).includes(reqRow.employee_id)) {
        return res
          .status(403)
          .json({ error: 'Only their manager (or HR) can decide this request.' });
      }
      if (reqRow.status !== 'PENDING') {
        return res
          .status(409)
          .json({ error: `This request was already ${reqRow.status.toLowerCase()}.` });
      }
      const approve = req.body.action === 'APPROVE';
      const ds = getISTComponents(reqRow.target_date).dateString;

      if (approve && reqRow.type === COMP_OFF) {
        const credit = await p.compOffCredit.findFirst({
          where: {
            employee_id: reqRow.employee_id,
            status: 'AVAILABLE',
            expires_at: { gte: toHolidayDateKey(todayKey()) },
          },
          orderBy: { expires_at: 'asc' },
        });
        if (!credit)
          return res.status(409).json({ error: 'They have no comp-off day left to use.' });
        await p.compOffCredit.update({
          where: { id: credit.id },
          data: { status: 'USED', used_date: toHolidayDateKey(ds), proposal_id: reqRow.id },
        });
      }

      // A swap's two halves are decided together.
      const sameBatch = {
        employee_id: reqRow.employee_id,
        created_at: reqRow.created_at,
        status: 'PENDING',
        type: { in: [DUTY_DAY, SWAP_OFF] },
      };
      const decided = {
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewed_by: req.user!.employeeId,
        reviewed_at: new Date(),
      };
      if (reqRow.type === DUTY_DAY || reqRow.type === SWAP_OFF) {
        await p.attendanceProposal.updateMany({ where: sameBatch, data: decided });
      } else {
        await p.attendanceProposal.update({ where: { id }, data: decided });
      }

      if (approve && reqRow.type === ATTENDANCE_CLAIM) {
        const log = await p.attendanceLog.findFirst({
          where: { employee_id: reqRow.employee_id, check_in_at: dayRange(ds) },
        });
        if (!log) {
          await p.attendanceLog.create({
            data: {
              employee_id: reqRow.employee_id,
              check_in_at: new Date(`${ds}T09:30:00+05:30`),
              check_out_at: new Date(`${ds}T18:30:00+05:30`),
              working_duration_minutes: 540,
              status: 'PRESENT',
              source: 'PROPOSAL',
              notes: `Marked present by ${req.user!.employeeCode} (attendance request)${req.body.note ? `: ${req.body.note}` : ''}`,
            },
          });
        }
      }
      if (
        approve &&
        (reqRow.type === DUTY_DAY || reqRow.type === ATTENDANCE_CLAIM) &&
        ds <= todayKey()
      ) {
        await creditCompOffIfEarned(reqRow.employee_id, ds);
      }

      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: approve ? 'TEAM_REQUEST_APPROVED' : 'TEAM_REQUEST_REJECTED',
          entity_type: 'ATTENDANCE_PROPOSAL',
          entity_id: id,
          new_value: JSON.stringify({ type: reqRow.type, date: ds, note: req.body.note || null }),
        },
      });
      // A comp-off / swap / "I worked that day" approved after the day: cancel
      // the absence already recorded for it.
      if (approve) {
        await recheckAbsences({
          employeeIds: [reqRow.employee_id],
          date: ds,
          actorId: req.user!.employeeId,
        }).catch((err) => logger.error({ err }, 'Absence re-check after request failed'));
      }
      await notifyEmployee(reqRow.employee_id, {
        type: 'SYSTEM',
        title: approve ? 'Request approved' : 'Request not approved',
        message: `Your ${TYPE_LABEL[reqRow.type]} request for ${ds} was ${approve ? 'approved' : 'not approved'}${req.body.note ? `: ${req.body.note}` : '.'}`,
        link: '/requests',
      }).catch(() => {});
      return res.status(200).json({ message: approve ? 'Approved' : 'Rejected' });
    } catch (error) {
      logger.error('Decide team request error:', error);
      return res.status(500).json({ error: 'Failed to save the decision' });
    }
  },
);

const AssignSchema = z.object({
  employee_ids: z.array(z.number().int().positive()).min(1).max(200),
  date: dateKey,
  reason: z.string().trim().min(3).max(300),
});

// POST /api/v1/attendance/duty-days/assign - a manager puts team members on duty
router.post(
  '/duty-days/assign',
  authenticateToken,
  validateRequestBody(AssignSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { employee_ids, date, reason } = req.body;
      if (date < todayKey()) return res.status(400).json({ error: 'Pick today or a later day.' });
      const allowed = new Set(await decidableIds(req));
      const notMine = employee_ids.filter((x: number) => !allowed.has(x));
      if (notMine.length)
        return res.status(403).json({ error: 'Some of these people are not in your team.' });
      let created = 0;
      let skipped = 0;
      for (const empId of employee_ids as number[]) {
        const me = await workEmployee(empId);
        if (!me) continue;
        const info = await dayInfo(me, date);
        if (info.duty || (!info.holiday && !info.weekOff)) {
          skipped++; // already on duty, or a normal working day for them
          continue;
        }
        await p.attendanceProposal.create({
          data: {
            employee_id: empId,
            type: DUTY_DAY,
            target_date: getISTMidnightInstant(date),
            reason: `Assigned by ${req.user!.employeeCode}: ${reason}`,
            status: 'APPROVED',
            reviewed_by: req.user!.employeeId,
            reviewed_at: new Date(),
          },
        });
        created++;
        await notifyEmployee(empId, {
          type: 'SYSTEM',
          title: 'Duty day',
          message: `You are on duty on ${date} (${info.label}): ${reason}. Check in at the kiosk or from the app with a selfie. It earns a comp-off day.`,
          link: '/requests',
        }).catch(() => {});
      }
      return res
        .status(201)
        .json({
          message: `${created} put on duty${skipped ? `, ${skipped} skipped (already on duty, or a normal working day for them)` : ''}.`,
          created,
          skipped,
        });
    } catch (error) {
      logger.error('Assign duty error:', error);
      return res.status(500).json({ error: 'Failed to assign the duty day' });
    }
  },
);

// ---------------------------------------------------------------------------
// HR: weekly offs and office pins
// ---------------------------------------------------------------------------

// GET /api/v1/attendance/weekly-offs - who has which weekly off (my team; HR: everyone)
router.get('/weekly-offs', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ids = await decidableIds(req);
    const rows = await p.employee.findMany({
      where: { id: { in: ids }, status: 'ACTIVE' },
      select: {
        id: true,
        full_name: true,
        employee_code: true,
        weekly_off_day: true,
        branch_id: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { full_name: 'asc' },
    });
    return res.status(200).json({
      can_edit: isHrOrTop(req.user!.roles),
      weekdays: WEEKDAY_NAMES,
      employees: rows.map((r) => ({
        id: r.id,
        name: r.full_name || r.employee_code,
        employee_code: r.employee_code,
        weekly_off_day: r.weekly_off_day,
        branch_id: r.branch_id,
        roles: r.roles.map((x) => x.role.name),
      })),
    });
  } catch (error) {
    logger.error('Weekly offs error:', error);
    return res.status(500).json({ error: 'Failed to load weekly offs' });
  }
});

const WeeklyOffSchema = z.object({ weekly_off_day: z.number().int().min(0).max(6).nullable() });

// PATCH /api/v1/attendance/weekly-offs/:employeeId - HR sets a person's weekly off
router.patch(
  '/weekly-offs/:employeeId',
  authenticateToken,
  validateRequestBody(WeeklyOffSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isHrOrTop(req.user!.roles))
        return res.status(403).json({ error: 'Only HR or the MD sets weekly offs.' });
      const empId = parseInt(req.params.employeeId, 10);
      if (!(await decidableIds(req)).includes(empId))
        return res.status(404).json({ error: 'Employee not found' });
      const before = await p.employee.findUnique({
        where: { id: empId },
        select: { weekly_off_day: true },
      });
      await p.employee.update({
        where: { id: empId },
        data: { weekly_off_day: req.body.weekly_off_day },
      });
      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'WEEKLY_OFF_CHANGED',
          entity_type: 'EMPLOYEE',
          entity_id: empId,
          old_value: JSON.stringify({ weekly_off_day: before?.weekly_off_day ?? null }),
          new_value: JSON.stringify({ weekly_off_day: req.body.weekly_off_day }),
        },
      });
      return res.status(200).json({
        message:
          req.body.weekly_off_day === null
            ? 'No fixed weekly off.'
            : `Weekly off: ${WEEKDAY_NAMES[req.body.weekly_off_day]}.`,
      });
    } catch (error) {
      logger.error('Set weekly off error:', error);
      return res.status(500).json({ error: 'Failed to save the weekly off' });
    }
  },
);

// GET /api/v1/attendance/branches - branches with their office pin
router.get('/branches', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await p.branch.findMany({
      where: { company_id: req.user!.companyId, deleted_at: null },
      select: { id: true, name: true, latitude: true, longitude: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({ branches: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load branches' });
  }
});

const PinSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// PATCH /api/v1/attendance/branches/:id/location - HR sets the office pin
router.patch(
  '/branches/:id/location',
  authenticateToken,
  validateRequestBody(PinSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isHrOrTop(req.user!.roles))
        return res.status(403).json({ error: 'Only HR or the MD sets office locations.' });
      const id = parseInt(req.params.id, 10);
      const branch = await p.branch.findFirst({ where: { id, company_id: req.user!.companyId } });
      if (!branch) return res.status(404).json({ error: 'Branch not found' });
      await p.branch.update({
        where: { id },
        data: { latitude: req.body.latitude, longitude: req.body.longitude },
      });
      return res.status(200).json({ message: `Office location saved for ${branch.name}.` });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to save the location' });
    }
  },
);

// ---------------------------------------------------------------------------
// Phone check-in with selfie + surroundings + location (duty days / field days)
// ---------------------------------------------------------------------------

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Photos must be JPG, PNG or WebP.'), { statusCode: 400 }));
  },
});

// POST /api/v1/attendance/selfie-check-in - multipart: selfie, surroundings;
// fields: latitude, longitude, accuracy, place_type (OFFICE|FIELD), project_id?
router.post(
  '/selfie-check-in',
  authenticateToken,
  photoUpload.fields([
    { name: 'selfie', maxCount: 1 },
    { name: 'surroundings', maxCount: 1 },
  ]) as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const selfieFile = files?.selfie?.[0];
      const surroundFile = files?.surroundings?.[0];
      if (!selfieFile || !surroundFile) {
        return res
          .status(400)
          .json({ error: 'Take both photos: your selfie and the surroundings.' });
      }
      const placeType = req.body.place_type === 'FIELD' ? 'FIELD' : 'OFFICE';
      const lat =
        req.body.latitude !== undefined && req.body.latitude !== ''
          ? Number(req.body.latitude)
          : null;
      const lng =
        req.body.longitude !== undefined && req.body.longitude !== ''
          ? Number(req.body.longitude)
          : null;
      const accuracy = req.body.accuracy ? Number(req.body.accuracy) : null;
      const projectId = req.body.project_id ? parseInt(req.body.project_id, 10) : null;

      const employee = await p.employee.findUnique({
        where: { id: req.user!.employeeId },
        select: {
          id: true,
          company_id: true,
          weekly_off_day: true,
          status: true,
          branch_id: true,
          employment_type: true,
          attendance_required: true,
          company: { select: { name: true } },
        },
      });
      if (!employee || employee.status !== 'ACTIVE')
        return res.status(403).json({ error: 'Not eligible for attendance.' });

      const now = new Date();
      const { dateString, timeString } = getISTComponents(now);
      const info = await dayInfo(employee, dateString);
      const fieldDay = await p.attendanceProposal.findFirst({
        where: {
          employee_id: employee.id,
          type: 'FIELD_WORK',
          status: 'APPROVED',
          target_date: dayRange(dateString),
        },
        select: { id: true },
      });
      if (!info.duty && !fieldDay) {
        return res.status(403).json({
          error:
            'Phone check-in is for duty days and approved field days. Please check in at the office kiosk.',
        });
      }
      const existing = await p.attendanceLog.findFirst({
        where: { employee_id: employee.id, check_in_at: dayRange(dateString) },
      });
      if (existing) {
        return res
          .status(200)
          .json({
            message: 'Already checked in today',
            alreadyStamped: true,
            checkInAt: existing.check_in_at,
          });
      }

      // Re-encode (proves they are images, drops the photos' own metadata) and store privately.
      let selfieP, surroundP;
      try {
        [selfieP, surroundP] = await Promise.all([
          processImageBuffer(selfieFile.buffer),
          processImageBuffer(surroundFile.buffer),
        ]);
      } catch {
        return res.status(400).json({ error: 'Those files are not valid photos.' });
      }
      const storage = getStorageService('checkin-proofs');
      const [selfieUrl, surroundUrl] = await Promise.all([
        storage.upload(selfieP.processedBuffer, selfieP.filename, 'image/webp'),
        storage.upload(surroundP.processedBuffer, surroundP.filename, 'image/webp'),
      ]);

      // Checks: they only raise flags for the manager; nothing is refused here.
      const flags: string[] = [];
      let distance: number | null = null;
      let branchId: number | null = null;
      if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
        flags.push('Location not shared');
      } else {
        if (accuracy && accuracy > 200)
          flags.push(`Location is approximate (about ${Math.round(accuracy)} m)`);
        if (placeType === 'OFFICE') {
          const branch = employee.branch_id
            ? await p.branch.findUnique({
                where: { id: employee.branch_id },
                select: { id: true, latitude: true, longitude: true, name: true },
              })
            : null;
          branchId = branch?.id ?? null;
          if (branch?.latitude != null && branch?.longitude != null) {
            distance = distanceMetres(lat, lng, branch.latitude, branch.longitude);
            if (distance > OFFICE_RADIUS_M)
              flags.push(`${distance} m from the ${branch.name} office`);
          }
        } else if (projectId) {
          const project = await p.project.findFirst({
            where: { id: projectId, company_id: employee.company_id },
            select: { latitude: true, longitude: true, name: true },
          });
          if (project?.latitude != null && project?.longitude != null) {
            distance = distanceMetres(lat, lng, project.latitude, project.longitude);
            if (distance > SITE_RADIUS_M) flags.push(`${distance} m from ${project.name}`);
          }
        }
      }
      if (placeType === 'FIELD' && !projectId) flags.push('No project chosen');
      if (await plainBackground(selfieP.processedBuffer))
        flags.push('Background behind the selfie looks plain');
      const ai = await aiPlaceCheck(
        selfieP.processedBuffer,
        surroundP.processedBuffer,
        placeType,
        employee.company?.name || 'the company',
      );
      if (ai.flag) flags.push(ai.flag);

      const late = await p.attendanceProposal.findFirst({
        where: {
          employee_id: employee.id,
          type: 'LATE_CHECKIN',
          status: 'APPROVED',
          target_date: dayRange(dateString),
        },
        select: { id: true },
      });
      const log = await p.attendanceLog.create({
        data: {
          employee_id: employee.id,
          check_in_at: now,
          status: calculateAttendanceStatus(now, !!late, employee.employment_type || 'FULL_TIME'),
          source: 'APP_SELFIE',
          notes: `${info.duty ? 'Duty day' : 'Field day'} check-in from the phone (${placeType === 'OFFICE' ? 'office' : 'field'})${flags.length ? ' - waiting for manager check' : ''}`,
        },
      });
      const proof = await p.attendanceCheckinProof.create({
        data: {
          employee_id: employee.id,
          attendance_log_id: log.id,
          place_type: placeType,
          branch_id: branchId,
          project_id: projectId,
          selfie_url: selfieUrl,
          surroundings_url: surroundUrl,
          latitude: lat,
          longitude: lng,
          accuracy_m: accuracy,
          distance_m: distance,
          flags: flags.length ? JSON.stringify(flags) : null,
          ai_note: ai.note,
          review_status: flags.length ? 'PENDING' : 'AUTO_OK',
        },
      });
      if (info.duty) await creditCompOffIfEarned(employee.id, dateString);
      if (flags.length) {
        await tellApprover(
          employee.id,
          'Check-in to review',
          `${req.user!.employeeCode} checked in from the phone: ${flags.join('; ')}.`,
        );
      }
      return res.status(200).json({
        message: flags.length ? 'Checked in. Your manager will check the photos.' : 'Checked in.',
        status: log.status,
        timeIST: timeString,
        flags,
        proof_id: proof.id,
      });
    } catch (error) {
      logger.error('Selfie check-in error:', error);
      return res.status(500).json({ error: 'Check-in failed, please try again.' });
    }
  },
);

// GET /api/v1/attendance/checkin-proofs/:id/photo/:which - the person, their approvers
router.get(
  '/checkin-proofs/:id/photo/:which',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const proof = await p.attendanceCheckinProof.findUnique({
        where: { id: parseInt(req.params.id, 10) },
      });
      if (!proof) return res.status(404).json({ error: 'Not found' });
      const mine = proof.employee_id === req.user!.employeeId;
      if (!mine && !(await decidableIds(req)).includes(proof.employee_id)) {
        return res.status(404).json({ error: 'Not found' });
      }
      const url = req.params.which === 'surroundings' ? proof.surroundings_url : proof.selfie_url;
      const bytes = await getStorageService('checkin-proofs').download(url);
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(bytes);
    } catch (error) {
      return res.status(404).json({ error: 'The photo could not be loaded.' });
    }
  },
);

const ReviewSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
  note: z.string().trim().max(300).optional(),
});

// POST /api/v1/attendance/checkin-proofs/:id/review - the manager accepts or rejects a flagged check-in
router.post(
  '/checkin-proofs/:id/review',
  authenticateToken,
  validateRequestBody(ReviewSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const proof = await p.attendanceCheckinProof.findUnique({
        where: { id: parseInt(req.params.id, 10) },
      });
      if (!proof) return res.status(404).json({ error: 'Not found' });
      if (!(await decidableIds(req)).includes(proof.employee_id)) {
        return res
          .status(403)
          .json({ error: 'Only their manager (or HR) can review this check-in.' });
      }
      if (proof.review_status !== 'PENDING')
        return res.status(409).json({ error: 'Already reviewed.' });
      const accept = req.body.action === 'ACCEPT';
      await p.attendanceCheckinProof.update({
        where: { id: proof.id },
        data: {
          review_status: accept ? 'ACCEPTED' : 'REJECTED',
          reviewed_by: req.user!.employeeId,
          reviewed_at: new Date(),
          review_note: req.body.note || null,
        },
      });
      if (!accept && proof.attendance_log_id) {
        const log = await p.attendanceLog.update({
          where: { id: proof.attendance_log_id },
          data: {
            status: 'ABSENT',
            notes: `Phone check-in rejected by ${req.user!.employeeCode}${req.body.note ? `: ${req.body.note}` : ''}`,
          },
        });
        // No comp-off for a rejected day.
        const ds = getISTComponents(log.check_in_at).dateString;
        await p.compOffCredit.updateMany({
          where: {
            employee_id: proof.employee_id,
            earned_date: toHolidayDateKey(ds),
            status: 'AVAILABLE',
          },
          data: { status: 'EXPIRED' },
        });
      }
      await notifyEmployee(proof.employee_id, {
        type: 'SYSTEM',
        title: accept ? 'Check-in accepted' : 'Check-in rejected',
        message: accept
          ? 'Your phone check-in was accepted.'
          : `Your phone check-in was rejected${req.body.note ? `: ${req.body.note}` : '.'} You can ask for that day with "Mark my attendance".`,
        link: '/requests',
      }).catch(() => {});
      return res.status(200).json({ message: accept ? 'Accepted' : 'Rejected' });
    } catch (error) {
      logger.error('Review check-in error:', error);
      return res.status(500).json({ error: 'Failed to save the review' });
    }
  },
);

export default router;
