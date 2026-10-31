import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { notifyEmployee } from '../utils/notifyEmployee';
import { getISTComponents } from '../utils/time';
import { dayInfoMany } from '../services/workCalendar';
import { Roles } from '../shared';

// Reminders for the working day. One sweep runs every 10 minutes; each
// reminder has a time window and goes to each person at most once a day (a
// notification of that type already sent today means "done"). The host
// sleeps when nobody uses the app, so fixed-time jobs were often missed;
// with a window, a reminder still goes out on the next sweep after wake-up,
// and is skipped once it would no longer help.

const p = prisma;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Day {
  now: Date;
  dateString: string;
  start: Date;
  end: Date;
}

interface Reminder {
  type: string;
  /** IST "HH:MM" window, from inclusive, until exclusive. */
  from: string;
  until: string;
  run: (d: Day) => Promise<number>;
}

const hhmm = (now: Date) => {
  const { hours, minutes } = getISTComponents(now);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/** Who already got a notification of this type today. */
async function sentToday(type: string, ids: number[], d: Day) {
  if (ids.length === 0) return new Set<number>();
  const rows = await p.notification.findMany({
    where: { type, employee_id: { in: ids }, created_at: { gte: d.start, lt: d.end } },
    select: { employee_id: true },
  });
  return new Set(rows.map((r) => r.employee_id));
}

async function sendOnce(
  type: string,
  d: Day,
  targets: { id: number; title: string; message: string; link: string }[],
) {
  const done = await sentToday(
    type,
    targets.map((t) => t.id),
    d,
  );
  let n = 0;
  for (const t of targets) {
    if (done.has(t.id)) continue;
    done.add(t.id);
    await notifyEmployee(t.id, { type, title: t.title, message: t.message, link: t.link });
    n++;
  }
  return n;
}

const notTopRole = {
  roles: { none: { role: { name: { in: [Roles.MD, Roles.ADMIN] } } } },
};

/** Logs of the day (check-in on that IST date), by employee. */
async function logsToday(d: Day, ids?: number[]) {
  const rows = await p.attendanceLog.findMany({
    where: {
      check_in_at: { gte: d.start, lt: d.end },
      ...(ids ? { employee_id: { in: ids } } : {}),
    },
    select: { employee_id: true, check_out_at: true },
  });
  const by = new Map<number, { open: boolean }>();
  for (const r of rows) {
    const prev = by.get(r.employee_id);
    by.set(r.employee_id, { open: (prev?.open ?? false) || r.check_out_at === null });
  }
  return by;
}

async function reportsToday(d: Day, ids: number[]) {
  if (ids.length === 0) return new Set<number>();
  const rows = await p.dailyReport.findMany({
    where: { employee_id: { in: ids }, submitted_at: { gte: d.start, lt: d.end } },
    select: { employee_id: true },
  });
  return new Set(rows.map((r) => r.employee_id));
}

// ---- 1. Not checked in yet (on time until 10:30) ----
export async function remindCheckIn(d: Day) {
  const staff = await p.employee.findMany({
    where: { status: 'ACTIVE', attendance_required: true, ...notTopRole },
    select: { id: true, company_id: true, weekly_off_day: true },
  });
  if (staff.length === 0) return 0;
  const ids = staff.map((s) => s.id);
  const [days, logs, leave] = await Promise.all([
    dayInfoMany(staff, d.dateString),
    logsToday(d, ids),
    p.attendanceProposal.findMany({
      where: {
        employee_id: { in: ids },
        type: 'LEAVE',
        status: 'APPROVED',
        target_date: { gte: d.start, lt: d.end },
      },
      select: { employee_id: true },
    }),
  ]);
  const onLeave = new Set(leave.map((l) => l.employee_id));
  const due = staff.filter((s) => !days.get(s.id)?.offDay && !logs.has(s.id) && !onLeave.has(s.id));
  return sendOnce(
    'REMINDER_CHECK_IN',
    d,
    due.map((s) => ({
      id: s.id,
      title: 'You have not checked in yet',
      message:
        'Scan the QR at the office (or check in from the app if you are on field work or working from home). Check-ins after 10:30 are marked late.',
      link: '/my-attendance',
    })),
  );
}

// ---- 2. End-of-day report not sent (needed for the QR checkout) ----
export async function remindDailyReport(d: Day) {
  const logs = await logsToday(d);
  const staff = await p.employee.findMany({
    where: {
      id: { in: [...logs.keys()] },
      status: 'ACTIVE',
      report_required: true,
      ...notTopRole,
    },
    select: { id: true },
  });
  const sent = await reportsToday(
    d,
    staff.map((s) => s.id),
  );
  return sendOnce(
    'REMINDER_DAILY_REPORT',
    d,
    staff
      .filter((s) => !sent.has(s.id))
      .map((s) => ({
        id: s.id,
        title: 'Send your end-of-day report',
        message: 'Checkout by QR needs today’s report. It takes a minute: open My Day.',
        link: '/my-day',
      })),
  );
}

// ---- 3. Still checked in after 18:45 ----
export async function remindCheckOut(d: Day) {
  const logs = await logsToday(d);
  const openIds = [...logs.entries()].filter(([, v]) => v.open).map(([id]) => id);
  if (openIds.length === 0) return 0;
  const staff = await p.employee.findMany({
    where: { id: { in: openIds }, status: 'ACTIVE' },
    select: { id: true, report_required: true },
  });
  const sent = await reportsToday(
    d,
    staff.map((s) => s.id),
  );
  return sendOnce(
    'REMINDER_CHECK_OUT',
    d,
    staff.map((s) => {
      const needsReport = s.report_required && !sent.has(s.id);
      return {
        id: s.id,
        title: 'You are still checked in',
        message: needsReport
          ? 'Send your end-of-day report, then scan the QR to check out before you leave.'
          : 'Scan the QR to check out before you leave.',
        link: needsReport ? '/my-day' : '/my-attendance',
      };
    }),
  );
}

// ---- 4. Tasks due today ----
export async function remindTasksDue(d: Day) {
  const tasks = await p.task.findMany({
    where: {
      target_date: { gte: d.start, lt: d.end },
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      assignee: { status: 'ACTIVE' },
    },
    select: { assignee_id: true, title: true },
    orderBy: { target_date: 'asc' },
  });
  const by = new Map<number, string[]>();
  for (const t of tasks) by.set(t.assignee_id, [...(by.get(t.assignee_id) || []), t.title]);
  return sendOnce(
    'REMINDER_TASKS_TODAY',
    d,
    [...by.entries()].map(([id, titles]) => ({
      id,
      title: `${titles.length} task${titles.length === 1 ? '' : 's'} due today`,
      message:
        titles
          .slice(0, 3)
          .map((t) => `“${t}”`)
          .join(', ') + (titles.length > 3 ? ` and ${titles.length - 3} more` : ''),
      link: '/tasks',
    })),
  );
}

// ---- 5. Site visits today (the telecaller, the agent and the project manager) ----
export async function remindVisitsToday(d: Day) {
  const visits = await p.siteVisitBooking.findMany({
    where: {
      scheduled_date: { gte: d.start, lt: d.end },
      status: { in: ['PENDING_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED'] },
    },
    select: {
      scheduled_date: true,
      telecaller_id: true,
      assigned_agent_id: true,
      project_manager_id: true,
      lead: { select: { customer_name: true } },
    },
    orderBy: { scheduled_date: 'asc' },
  });
  const by = new Map<number, string[]>();
  for (const v of visits) {
    const { timeString } = getISTComponents(v.scheduled_date);
    const line = `${v.lead?.customer_name || 'Customer'} at ${timeString.slice(0, 5)}`;
    const people = new Set(
      [v.telecaller_id, v.assigned_agent_id, v.project_manager_id].filter((x): x is number => !!x),
    );
    for (const id of people) by.set(id, [...(by.get(id) || []), line]);
  }
  return sendOnce(
    'REMINDER_VISITS_TODAY',
    d,
    [...by.entries()].map(([id, lines]) => ({
      id,
      title: `${lines.length} site visit${lines.length === 1 ? '' : 's'} today`,
      message:
        lines.slice(0, 3).join(', ') + (lines.length > 3 ? ` and ${lines.length - 3} more` : ''),
      link: '/site-visits',
    })),
  );
}

/** Active people with a role, by company (the MD when a company has none). */
async function holdersByCompany(role: string, fallbackToMd: boolean) {
  const rows = await p.employee.findMany({
    where: { status: 'ACTIVE', roles: { some: { role: { name: role } } } },
    select: { id: true, company_id: true },
  });
  const by = new Map<number, number[]>();
  for (const r of rows) by.set(r.company_id, [...(by.get(r.company_id) || []), r.id]);
  if (fallbackToMd) {
    const mds = await p.employee.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { name: Roles.MD } } } },
      select: { id: true, company_id: true },
    });
    for (const m of mds) if (!by.has(m.company_id)) by.set(m.company_id, [m.id]);
  }
  return by;
}

// ---- 6. HR: attendance requests and check-in photos waiting ----
export async function remindHrQueue(d: Day) {
  const [proposals, proofs, hr] = await Promise.all([
    p.attendanceProposal.findMany({
      where: { status: 'PENDING' },
      select: { employee_id: true },
    }),
    p.attendanceCheckinProof.findMany({
      where: { review_status: 'PENDING' },
      select: { employee_id: true },
    }),
    holdersByCompany(Roles.HR_MANAGER, true),
  ]);
  const ids = [...new Set([...proposals, ...proofs].map((x) => x.employee_id))];
  const companyOf = new Map(
    (
      await p.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true, company_id: true },
      })
    ).map((e) => [e.id, e.company_id]),
  );
  const count = new Map<number, { requests: number; photos: number }>();
  const bump = (empId: number, k: 'requests' | 'photos') => {
    const c = companyOf.get(empId);
    if (c === undefined) return;
    const cur = count.get(c) || { requests: 0, photos: 0 };
    cur[k]++;
    count.set(c, cur);
  };
  proposals.forEach((x) => bump(x.employee_id, 'requests'));
  proofs.forEach((x) => bump(x.employee_id, 'photos'));
  const targets: { id: number; title: string; message: string; link: string }[] = [];
  for (const [companyId, c] of count) {
    const parts = [
      c.requests ? `${c.requests} attendance request${c.requests === 1 ? '' : 's'}` : '',
      c.photos ? `${c.photos} check-in photo${c.photos === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    for (const id of hr.get(companyId) || [])
      targets.push({
        id,
        title: 'Waiting for your decision',
        message: `${parts.join(' and ')} to review.`,
        link: '/approvals?tab=attendance',
      });
  }
  return sendOnce('REMINDER_HR_QUEUE', d, targets);
}

// ---- 7. Finance: customer payments to verify, refunds due ----
export async function remindFinanceQueue(d: Day) {
  const [rows, fin] = await Promise.all([
    p.payment.groupBy({
      by: ['company_id', 'status'],
      where: { status: { in: ['PENDING', 'REFUND_DUE'] } },
      _count: { _all: true },
    }),
    holdersByCompany(Roles.FINANCE, false),
  ]);
  const targets: { id: number; title: string; message: string; link: string }[] = [];
  for (const [companyId, ids] of fin) {
    const n = (st: string) =>
      rows.find((r) => r.company_id === companyId && r.status === st)?._count._all || 0;
    const verify = n('PENDING');
    const refund = n('REFUND_DUE');
    if (!verify && !refund) continue;
    const parts = [
      verify ? `${verify} customer payment${verify === 1 ? '' : 's'} to verify` : '',
      refund ? `${refund} refund${refund === 1 ? '' : 's'} due` : '',
    ].filter(Boolean);
    for (const id of ids)
      targets.push({
        id,
        title: 'Payments waiting',
        message: `${parts.join(' and ')}.`,
        link: '/finance',
      });
  }
  return sendOnce('REMINDER_FINANCE_QUEUE', d, targets);
}

export const REMINDERS: Reminder[] = [
  { type: 'REMINDER_VISITS_TODAY', from: '08:30', until: '12:00', run: remindVisitsToday },
  { type: 'REMINDER_TASKS_TODAY', from: '09:30', until: '13:00', run: remindTasksDue },
  { type: 'REMINDER_CHECK_IN', from: '10:00', until: '11:30', run: remindCheckIn },
  { type: 'REMINDER_HR_QUEUE', from: '10:30', until: '17:00', run: remindHrQueue },
  { type: 'REMINDER_FINANCE_QUEUE', from: '11:00', until: '17:00', run: remindFinanceQueue },
  { type: 'REMINDER_DAILY_REPORT', from: '17:30', until: '23:30', run: remindDailyReport },
  { type: 'REMINDER_CHECK_OUT', from: '18:45', until: '22:30', run: remindCheckOut },
];

export function dayOf(now: Date): Day {
  const { dateString } = getISTComponents(now);
  const start = new Date(`${dateString}T00:00:00+05:30`);
  return { now, dateString, start, end: new Date(start.getTime() + DAY_MS) };
}

/** Runs every reminder whose window is open now. */
export async function reminderSweepJob(now: Date = new Date()) {
  const d = dayOf(now);
  const t = hhmm(now);
  for (const r of REMINDERS) {
    if (t < r.from || t >= r.until) continue;
    try {
      const n = await r.run(d);
      if (n > 0) logger.info(`[Reminders] ${r.type}: sent ${n}`);
    } catch (err) {
      logger.error({ err }, `[Reminders] ${r.type} failed`);
    }
  }
}
