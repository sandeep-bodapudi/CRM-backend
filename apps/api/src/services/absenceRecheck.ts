import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { notifyEmployee } from '../utils/notifyEmployee';
import { getISTMidnightInstant } from '../utils/time';
import { dayInfoMany } from './workCalendar';

// An uninformed absence (-2 points) is written by the nightly attendance
// rollup from what was known that night. When the day is later excused -- a
// holiday entered after the fact, a leave or comp-off approved late, a
// check-in added by HR -- the penalty used to stay. This re-checks recorded
// absences and cancels the ones that are now excused. The row is kept
// (action renamed to UNINFORMED_ABSENT_VOIDED, with the reason), so the
// history stays and every score that counts UNINFORMED_ABSENT drops it.

const p = prisma;
const DAY_MS = 24 * 60 * 60 * 1000;
export const VOIDED_ABSENCE_ACTION = 'UNINFORMED_ABSENT_VOIDED';

const dateOf = (newValue: string | null) => {
  try {
    const d = JSON.parse(newValue || '{}').date;
    return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  } catch {
    return null;
  }
};

/**
 * Cancels recorded absences that are now excused. Scope: absences recorded in
 * the last `days` days, optionally only one company and/or one date.
 * Returns how many were cancelled.
 */
export async function recheckAbsences(opts: {
  days?: number;
  companyId?: number;
  date?: string;
  employeeIds?: number[];
  actorId?: number;
  notify?: boolean;
}) {
  const since = new Date(Date.now() - (opts.days ?? 45) * DAY_MS);
  const events = await p.auditEvent.findMany({
    where: {
      action: 'UNINFORMED_ABSENT',
      created_at: { gte: since },
      ...(opts.date ? { new_value: { contains: opts.date } } : {}),
      ...(opts.employeeIds ? { actor_id: { in: opts.employeeIds } } : {}),
    },
    select: { id: true, actor_id: true, new_value: true },
  });
  if (events.length === 0) return 0;

  // Group by the absent date.
  const byDate = new Map<string, { id: number; actor_id: number }[]>();
  for (const e of events) {
    const d = dateOf(e.new_value);
    if (!d || (opts.date && d !== opts.date)) continue;
    byDate.set(d, [...(byDate.get(d) || []), e]);
  }

  const voided: { eventId: number; employeeId: number; date: string; why: string }[] = [];
  for (const [date, list] of byDate) {
    const staff = await p.employee.findMany({
      where: {
        id: { in: [...new Set(list.map((e) => e.actor_id))] },
        ...(opts.companyId ? { company_id: opts.companyId } : {}),
      },
      select: { id: true, company_id: true, weekly_off_day: true },
    });
    if (staff.length === 0) continue;
    const ids = staff.map((s) => s.id);
    const start = getISTMidnightInstant(date);
    const end = new Date(start.getTime() + DAY_MS);
    const [days, logs, leave] = await Promise.all([
      dayInfoMany(staff, date),
      p.attendanceLog.findMany({
        where: { employee_id: { in: ids }, check_in_at: { gte: start, lt: end } },
        select: { employee_id: true },
      }),
      p.attendanceProposal.findMany({
        where: {
          employee_id: { in: ids },
          type: { in: ['LEAVE', 'ATTENDANCE_CLAIM'] },
          status: 'APPROVED',
          target_date: { gte: start, lt: end },
        },
        select: { employee_id: true, type: true },
      }),
    ]);
    const present = new Set(logs.map((l) => l.employee_id));
    const leaveOf = new Map(leave.map((l) => [l.employee_id, l.type]));
    for (const e of list) {
      const info = days.get(e.actor_id);
      if (!info) continue; // other company (scoped call)
      // A weekly off changed later does not excuse past days (it would wipe
      // real absences); holidays, swaps and comp-offs do.
      const excusedOff = info.offDay && (!!info.holiday || info.swapOff || info.compOff);
      const why = excusedOff
        ? info.holiday
          ? `holiday: ${info.holiday}`
          : info.compOff
            ? 'comp-off'
            : 'week-off swap'
        : present.has(e.actor_id)
          ? 'checked in that day'
          : leaveOf.get(e.actor_id) === 'LEAVE'
            ? 'approved leave'
            : leaveOf.get(e.actor_id) === 'ATTENDANCE_CLAIM'
              ? 'worked that day (approved)'
              : null;
      if (why) voided.push({ eventId: e.id, employeeId: e.actor_id, date, why });
    }
  }

  for (const v of voided) {
    await p.$transaction([
      p.auditEvent.update({
        where: { id: v.eventId },
        data: {
          action: VOIDED_ABSENCE_ACTION,
          reason: `Absence cancelled: ${v.why}.`,
        },
      }),
      p.auditEvent.create({
        data: {
          actor_id: opts.actorId ?? 0,
          action: 'ABSENCE_PENALTY_CANCELLED',
          entity_type: 'EMPLOYEE',
          entity_id: v.employeeId,
          new_value: JSON.stringify({ date: v.date, absence_event_id: v.eventId, why: v.why }),
        },
      }),
    ]);
  }

  if (voided.length > 0) {
    logger.info(`[Absences] Cancelled ${voided.length} uninformed absence(s) now excused.`);
    if (opts.notify !== false) {
      const byEmp = new Map<number, typeof voided>();
      for (const v of voided) byEmp.set(v.employeeId, [...(byEmp.get(v.employeeId) || []), v]);
      for (const [employeeId, list] of byEmp) {
        await notifyEmployee(employeeId, {
          type: 'ABSENCE_PENALTY_CANCELLED',
          title: 'Absence penalty removed',
          message: `The −2 for ${list.map((v) => `${v.date} (${v.why})`).join(', ')} has been removed.`,
          link: '/my-performance',
        });
      }
    }
  }
  return voided.length;
}
