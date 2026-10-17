import { prisma } from '../lib/prisma';
import { getISTDayOfWeek, getISTMidnightInstant, toHolidayDateKey } from '../utils/time';

const p = prisma;
const DAY_MS = 24 * 3600 * 1000;

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Request types added for week-offs (stored in AttendanceProposal.type). */
export const DUTY_DAY = 'DUTY_DAY'; // work on an off day (week off or holiday)
export const SWAP_OFF = 'SWAP_OFF'; // the day taken off instead, in a week-off swap
export const COMP_OFF = 'COMP_OFF'; // a comp-off day being used
export const ATTENDANCE_CLAIM = 'ATTENDANCE_CLAIM'; // "I worked that day" after the fact
export const TEAM_REQUEST_TYPES = [DUTY_DAY, SWAP_OFF, COMP_OFF, ATTENDANCE_CLAIM];

export const COMP_OFF_VALID_DAYS = 30;

export type WorkEmployee = { id: number; company_id: number; weekly_off_day: number | null };

export interface DayInfo {
  /** Company holiday name (holidays are for everyone). */
  holiday: string | null;
  /** The person's own weekly off. */
  weekOff: boolean;
  /** Taken off in an approved week-off swap. */
  swapOff: boolean;
  /** An approved comp-off day. */
  compOff: boolean;
  /** An approved duty day: works even though it is a holiday / week off. */
  duty: boolean;
  /** Not expected at work: holiday, week off, swap or comp-off, unless it is a duty day. */
  offDay: boolean;
  /** Why it is off, in words ("Sunday (week off)", "Diwali"...), when offDay. */
  label: string | null;
}

/**
 * Whether each person is expected at work on one IST date. Replaces the old
 * "Sunday is everyone's day off" rule: each person has their own weekly off
 * (Employee.weekly_off_day), company holidays apply to everyone, and approved
 * requests move days around (duty day = works on an off day; swap and comp-off =
 * off on a working day). One batch query each for holidays and requests.
 */
export async function dayInfoMany(
  employees: WorkEmployee[],
  dateString: string,
): Promise<Map<number, DayInfo>> {
  const out = new Map<number, DayInfo>();
  if (employees.length === 0) return out;
  const start = getISTMidnightInstant(dateString);
  const companyIds = [...new Set(employees.map((e) => e.company_id))];
  const [holidays, requests] = await Promise.all([
    p.companyHoliday.findMany({
      where: { company_id: { in: companyIds }, date: toHolidayDateKey(dateString) },
      select: { company_id: true, name: true },
    }),
    p.attendanceProposal.findMany({
      where: {
        employee_id: { in: employees.map((e) => e.id) },
        type: { in: [DUTY_DAY, SWAP_OFF, COMP_OFF] },
        status: 'APPROVED',
        target_date: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
      },
      select: { employee_id: true, type: true },
    }),
  ]);
  const holidayBy = new Map(holidays.map((h) => [h.company_id, h.name]));
  const weekday = getISTDayOfWeek(dateString);
  for (const e of employees) {
    const mine = requests.filter((r) => r.employee_id === e.id);
    const holiday = holidayBy.get(e.company_id) || null;
    const weekOff = e.weekly_off_day !== null && e.weekly_off_day === weekday;
    const swapOff = mine.some((r) => r.type === SWAP_OFF);
    const compOff = mine.some((r) => r.type === COMP_OFF);
    const duty = mine.some((r) => r.type === DUTY_DAY);
    const offDay = (!!holiday || weekOff || swapOff || compOff) && !duty;
    out.set(e.id, {
      holiday,
      weekOff,
      swapOff,
      compOff,
      duty,
      offDay,
      label: !offDay
        ? null
        : holiday
          ? holiday
          : weekOff
            ? `${WEEKDAY_NAMES[weekday]} (week off)`
            : compOff
              ? 'Comp-off'
              : 'Week off (swapped)',
    });
  }
  return out;
}

export async function dayInfo(employee: WorkEmployee, dateString: string): Promise<DayInfo> {
  return (await dayInfoMany([employee], dateString)).get(employee.id)!;
}

/** The person's weekly-off fields, for callers that only have an id. */
export async function workEmployee(employeeId: number): Promise<WorkEmployee | null> {
  return p.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, company_id: true, weekly_off_day: true },
  });
}

/**
 * Someone came in on an off day without an approved duty day (at the kiosk, or a
 * visit completed): their attendance is kept, and a duty-day request is opened for
 * the manager, so the extra day can earn a comp-off. Never opens a second one.
 */
export async function openDutyRequestIfMissing(
  employeeId: number,
  dateString: string,
  why: string,
) {
  const start = getISTMidnightInstant(dateString);
  const existing = await p.attendanceProposal.findFirst({
    where: {
      employee_id: employeeId,
      type: DUTY_DAY,
      status: { in: ['PENDING', 'APPROVED'] },
      target_date: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await p.attendanceProposal.create({
    data: {
      employee_id: employeeId,
      type: DUTY_DAY,
      target_date: start,
      reason: why,
      status: 'PENDING',
    },
  });
  return created.id;
}

/**
 * One comp-off day for an approved duty day the person actually worked (has an
 * attendance record that day). Safe to call more than once: one credit per day.
 */
export async function creditCompOffIfEarned(employeeId: number, dateString: string) {
  const start = getISTMidnightInstant(dateString);
  const end = new Date(start.getTime() + DAY_MS);
  const [duty, log] = await Promise.all([
    p.attendanceProposal.findFirst({
      where: {
        employee_id: employeeId,
        type: DUTY_DAY,
        status: 'APPROVED',
        target_date: { gte: start, lt: end },
      },
      select: { id: true },
    }),
    p.attendanceLog.findFirst({
      where: {
        employee_id: employeeId,
        check_in_at: { gte: start, lt: end },
        status: { not: 'ABSENT' },
      },
      select: { id: true },
    }),
  ]);
  if (!duty || !log) return false;
  const earned = toHolidayDateKey(dateString);
  const expires = new Date(earned.getTime() + COMP_OFF_VALID_DAYS * DAY_MS);
  await p.compOffCredit.upsert({
    where: { employee_id_earned_date: { employee_id: employeeId, earned_date: earned } },
    update: {},
    create: { employee_id: employeeId, earned_date: earned, expires_at: expires },
  });
  return true;
}

/** Comp-off days still to use (available minus those already requested). */
export async function compOffBalance(employeeId: number) {
  const today = toHolidayDateKey(new Date().toISOString().slice(0, 10));
  const [available, pending] = await Promise.all([
    p.compOffCredit.findMany({
      where: { employee_id: employeeId, status: 'AVAILABLE', expires_at: { gte: today } },
      orderBy: { expires_at: 'asc' },
      select: { id: true, earned_date: true, expires_at: true },
    }),
    p.attendanceProposal.count({
      where: { employee_id: employeeId, type: COMP_OFF, status: 'PENDING' },
    }),
  ]);
  return { credits: available, available: Math.max(0, available.length - pending), pending };
}
