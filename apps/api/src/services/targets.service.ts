import { prisma } from '../lib/prisma';
import { getISTComponents } from '../utils/time';

const p = prisma;

export const TARGET_METRICS = [
  'CALLS',
  'VISITS_BOOKED',
  'VISITS_COMPLETED',
  'BOOKINGS_CONFIRMED',
] as const;
export const TARGET_PERIODS = ['DAY', 'WEEK', 'MONTH'] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];
export type TargetPeriod = (typeof TARGET_PERIODS)[number];

export const METRIC_LABELS: Record<TargetMetric, string> = {
  CALLS: 'Calls made',
  VISITS_BOOKED: 'Site visits booked',
  VISITS_COMPLETED: 'Site visits completed',
  BOOKINGS_CONFIRMED: 'Bookings confirmed',
};

const IST_OFFSET = '+05:30';
const DAY_MS = 24 * 3600 * 1000;

/** Midnight (IST) of the day containing `d`, as a real instant. */
const istMidnight = (d: Date) =>
  new Date(`${getISTComponents(d).dateString}T00:00:00${IST_OFFSET}`);

/**
 * The IST window for a period: the day, the week (Monday to the next Monday) or
 * the calendar month containing `now`. End is exclusive.
 */
export function periodRange(period: TargetPeriod, now: Date = new Date()) {
  const today = istMidnight(now);
  if (period === 'DAY') return { start: today, end: new Date(today.getTime() + DAY_MS) };

  const [y, m, d] = getISTComponents(now).dateString.split('-').map(Number);
  if (period === 'WEEK') {
    // UTC day-of-week of the IST calendar date (0 = Sunday); Monday starts the week.
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const back = (dow + 6) % 7;
    const start = new Date(today.getTime() - back * DAY_MS);
    return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = new Date(`${y}-${pad(m)}-01T00:00:00${IST_OFFSET}`);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { start, end: new Date(`${ny}-${pad(nm)}-01T00:00:00${IST_OFFSET}`) };
}

/**
 * What the system recorded for one person in [start, end). Never typed.
 *  - CALLS: logged call attempts.
 *  - VISITS_BOOKED: visits this person booked (walk-ins are not "booked"; cancelled ones do not count).
 *  - VISITS_COMPLETED: visits this person ran (the agent, else the project manager), by the day they were completed.
 *  - BOOKINGS_CONFIRMED: bookings credited to this person, by the day the booking was confirmed.
 */
export async function measureMetric(
  employeeId: number,
  metric: TargetMetric,
  start: Date,
  end: Date,
): Promise<number> {
  switch (metric) {
    case 'CALLS':
      return p.leadActivity.count({
        where: {
          actor_id: employeeId,
          activity_type: 'CALL_LOGGED',
          created_at: { gte: start, lt: end },
        },
      });
    case 'VISITS_BOOKED':
      return p.siteVisitBooking.count({
        where: {
          telecaller_id: employeeId,
          visit_type: { in: ['SCHEDULED', 'DIRECT'] },
          status: { not: 'CANCELLED' },
          created_at: { gte: start, lt: end },
        },
      });
    case 'VISITS_COMPLETED':
      return p.siteVisitBooking.count({
        where: {
          visit_type: 'SCHEDULED',
          status: 'COMPLETED',
          completed_at: { gte: start, lt: end },
          OR: [
            { assigned_agent_id: employeeId },
            { assigned_agent_id: null, project_manager_id: employeeId },
          ],
        },
      });
    case 'BOOKINGS_CONFIRMED': {
      const events = await p.auditEvent.findMany({
        where: { action: 'BOOKING_CONFIRMED', created_at: { gte: start, lt: end } },
        select: { entity_id: true },
      });
      const ids = [...new Set(events.map((e) => e.entity_id).filter((id): id is number => !!id))];
      if (ids.length === 0) return 0;
      return p.booking.count({
        where: { id: { in: ids }, assigned_employee_id: employeeId, status: { not: 'CANCELLED' } },
      });
    }
  }
}

export interface TargetProgress {
  metric: TargetMetric;
  metric_label: string;
  period: TargetPeriod;
  target: number;
  done: number;
  percent: number;
  source: 'PERSON' | 'ROLE';
  target_id: number;
  range_start: string;
  range_end: string;
}

/**
 * The targets that apply to this person in the period containing `now`, with
 * progress. A person's own target replaces their role's for the same
 * metric+period; someone with several roles gets the highest role value.
 * A target set mid-period counts the whole period's activity (no pro-rating
 * for leave and holidays yet); one whose dates have not started or have ended
 * is not shown.
 */
export async function progressFor(
  employee: { id: number; company_id: number; roles: string[] },
  now: Date = new Date(),
): Promise<TargetProgress[]> {
  const rows = await p.performanceTarget.findMany({
    where: {
      company_id: employee.company_id,
      is_active: true,
      OR: [{ employee_id: employee.id }, { employee_id: null, role_name: { in: employee.roles } }],
    },
  });

  const chosen = new Map<string, (typeof rows)[number]>();
  for (const t of rows) {
    const range = periodRange(t.period as TargetPeriod, now);
    const started = t.valid_from.getTime() < range.end.getTime();
    const notEnded = !t.valid_to || t.valid_to.getTime() >= range.start.getTime();
    if (!started || !notEnded) continue;
    const key = `${t.metric}|${t.period}`;
    const cur = chosen.get(key);
    if (
      !cur ||
      (t.employee_id && !cur.employee_id) ||
      (!!t.employee_id === !!cur.employee_id && t.value > cur.value)
    ) {
      chosen.set(key, t);
    }
  }

  const out: TargetProgress[] = [];
  for (const t of chosen.values()) {
    const range = periodRange(t.period as TargetPeriod, now);
    const done = await measureMetric(employee.id, t.metric as TargetMetric, range.start, range.end);
    out.push({
      metric: t.metric as TargetMetric,
      metric_label: METRIC_LABELS[t.metric as TargetMetric] || t.metric,
      period: t.period as TargetPeriod,
      target: t.value,
      done,
      percent: t.value > 0 ? Math.min(100, Math.round((done / t.value) * 100)) : 0,
      source: t.employee_id ? 'PERSON' : 'ROLE',
      target_id: t.id,
      range_start: range.start.toISOString(),
      range_end: range.end.toISOString(),
    });
  }
  const order = { DAY: 0, WEEK: 1, MONTH: 2 } as const;
  return out.sort((a, b) => order[a.period] - order[b.period] || a.metric.localeCompare(b.metric));
}
