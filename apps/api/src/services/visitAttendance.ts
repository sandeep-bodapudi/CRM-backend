import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import {
  getISTComponents,
  getISTDayOfWeek,
  getISTMidnightInstant,
  toHolidayDateKey,
} from '../utils/time';

const p = prisma;

/** AttendanceLog.source for a day marked present because the person ran a visit. */
export const VISIT_ATTENDANCE_SOURCE = 'VISIT';

/**
 * A project manager (or agent) who ran a site visit is out at the project, not
 * at a desk with a QR code. When they complete a visit that has both a photo
 * and the feedback they wrote, that is proof enough that they worked the day:
 * mark them present for that day (decision D7).
 *
 * It never overrides anything: no mark on a Sunday or a company holiday, on a
 * day of approved leave, or when any attendance record already exists for the
 * day (a QR scan, a work-from-home or field-work day, a hand entry). It only
 * applies to the person who actually ran the visit, never to a walk-in (nobody
 * ran it), and only to people who are required to mark attendance. Several
 * visits in a day produce one mark.
 *
 * Called after the visit is saved and must never break completing it, so it
 * swallows its own errors. Returns what it did, for logs and tests.
 */
export async function markPresentFromVisit(visitId: number): Promise<string> {
  try {
    const visit = await p.siteVisitBooking.findUnique({
      where: { id: visitId },
      include: { lead: { select: { company_id: true } } },
    });
    if (!visit || visit.status !== 'COMPLETED' || !visit.completed_at) return 'not completed';
    if (visit.visit_type === 'WALK_IN') return 'walk-in: nobody ran it';
    if (!visit.proof_photo_url) return 'no photo';
    if ((visit.feedback_notes || '').trim().length < 3) return 'no feedback';

    const runnerId = visit.assigned_agent_id ?? visit.project_manager_id;
    if (!runnerId) return 'nobody ran it';
    const runner = await p.employee.findUnique({
      where: { id: runnerId },
      select: { id: true, status: true, attendance_required: true, company_id: true },
    });
    if (!runner || runner.status !== 'ACTIVE' || !runner.attendance_required) {
      return 'attendance not required';
    }

    const { dateString } = getISTComponents(visit.completed_at);
    if (getISTDayOfWeek(dateString) === 0) return 'sunday';
    const holiday = await p.companyHoliday.findFirst({
      where: { company_id: runner.company_id, date: toHolidayDateKey(dateString) },
      select: { id: true },
    });
    if (holiday) return 'holiday';

    const dayStart = getISTMidnightInstant(dateString);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const [leave, existing] = await Promise.all([
      p.attendanceProposal.findFirst({
        where: {
          employee_id: runner.id,
          type: 'LEAVE',
          status: 'APPROVED',
          target_date: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true },
      }),
      p.attendanceLog.findFirst({
        where: { employee_id: runner.id, check_in_at: { gte: dayStart, lt: dayEnd } },
        select: { id: true },
      }),
    ]);
    if (leave) return 'approved leave';
    if (existing) return 'already has attendance';

    // In at the visit's scheduled time when that is the same day, else when it was completed;
    // out when it was completed -- closed now, so the midnight auto-checkout never has to
    // chase someone who was never at a kiosk.
    const scheduledToday = visit.scheduled_date >= dayStart && visit.scheduled_date < dayEnd;
    const checkIn =
      scheduledToday && visit.scheduled_date < visit.completed_at
        ? visit.scheduled_date
        : visit.completed_at;
    const log = await p.attendanceLog.create({
      data: {
        employee_id: runner.id,
        check_in_at: checkIn,
        check_out_at: visit.completed_at,
        working_duration_minutes: Math.max(
          0,
          Math.round((visit.completed_at.getTime() - checkIn.getTime()) / 60000),
        ),
        status: 'PRESENT',
        source: VISIT_ATTENDANCE_SOURCE,
        notes: `Marked present: completed site visit ${visit.booking_code} with a photo and feedback.`,
      },
    });
    await p.auditEvent.create({
      data: {
        actor_id: runner.id,
        action: 'ATTENDANCE_FROM_VISIT',
        entity_type: 'ATTENDANCE_LOG',
        entity_id: log.id,
        new_value: JSON.stringify({ date: dateString, visit: visit.booking_code }),
      },
    });
    return 'marked present';
  } catch (err) {
    logger.error(`[visit-attendance] visit ${visitId} could not be turned into attendance:`, err);
    return 'error';
  }
}
