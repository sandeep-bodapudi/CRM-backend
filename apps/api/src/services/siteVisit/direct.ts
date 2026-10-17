import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { Roles } from '../../shared';
import { getISTComponents } from '../../utils/time';
import { logger } from '../../utils/logger';
import { notifyEmployee } from '../../utils/notifyEmployee';
import { LeadService } from '../lead.service';
import { createFeedbackRequest, dispatchFeedbackRequestNotification } from '../feedback.service';
import { dropReasonFromOutcomes } from './shared';
import { WALK_IN_RATINGS } from './walkIn';
import { AppError } from '../lead/errors';

const p = prisma;

/**
 * Direct site visits: the customer goes to the site on their own, so no
 * project manager or agent is involved. The visit is booked as CONFIRMED with
 * `visit_type = DIRECT` and nobody assigned, so it never enters a PM's
 * acceptance queue, the escalation job or anyone's "visits run" counts. The
 * person who booked it (or the lead's owner, or management) records
 * afterwards whether the customer came.
 */

/** States a visit can be turned into a direct visit from: anything not started or finished. */
export const CONVERTIBLE_STATES = [
  'REQUESTED',
  'PENDING_ACCEPTANCE',
  'REASSIGNED',
  'ESCALATED_TO_MARKETING_DIRECTOR',
  'ACCEPTED',
  'PENDING_CUSTOMER_RECONFIRMATION',
  'RESCHEDULE_REQUESTED',
  'PENDING_PM_RECONFIRMATION',
  'CONFIRMED',
  'ON_HOLD',
];

const DIRECT_OPEN_STATES = ['CONFIRMED', 'PENDING_CUSTOMER_RECONFIRMATION', 'ON_HOLD'];

const isManagement = (user: TokenPayload) =>
  user.roles.some((r) => [Roles.MD, Roles.ADMIN, Roles.MARKETING_DIRECTOR].includes(r as any));

async function loadVisit(user: TokenPayload, visitId: number) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: { company_id: user.companyId } },
    include: { lead: true, project: { select: { name: true } } },
  });
  if (!visit) throw new AppError(404, 'Site visit not found.');
  const mine =
    visit.telecaller_id === user.employeeId || visit.lead.assigned_to_id === user.employeeId;
  if (!mine && !isManagement(user)) {
    throw new AppError(
      403,
      'Only the person who booked this visit, the lead owner or management can change it.',
    );
  }
  return visit;
}

/** Turn a pending (not yet started) visit into a direct visit: nobody from the company goes. */
export async function makeVisitDirect(user: TokenPayload, visitId: number) {
  const visit = await loadVisit(user, visitId);
  if (visit.visit_type === 'DIRECT') throw new AppError(409, 'This is already a direct visit.');
  if (visit.visit_type === 'WALK_IN') throw new AppError(409, 'A walk-in is already recorded.');
  if (!CONVERTIBLE_STATES.includes(visit.status)) {
    throw new AppError(
      409,
      `A visit that is ${visit.status.toLowerCase().replace(/_/g, ' ')} cannot be changed to a direct visit.`,
    );
  }
  const released = [visit.project_manager_id, visit.assigned_agent_id].filter(
    (id): id is number => !!id && id !== user.employeeId,
  );

  const updated = await p.$transaction(async (tx) => {
    const u = await tx.siteVisitBooking.update({
      where: { id: visitId },
      data: {
        visit_type: 'DIRECT',
        status: 'CONFIRMED',
        project_manager_id: null,
        assigned_agent_id: null,
      },
    });
    await tx.leadActivity.create({
      data: {
        lead: { connect: { id: visit.lead_id } },
        actor: { connect: { id: user.employeeId } },
        activity_type: 'SITE_VISIT_REQUESTED',
        notes: `Site visit ${visit.booking_code} changed to a direct visit: the customer goes on their own, no project manager needed.`,
      },
    });
    return u;
  });

  if (released.length > 0) {
    await notifyEmployee([...new Set(released)], {
      type: 'SYSTEM_ALERT',
      title: 'Site visit no longer needs you',
      message: `Site visit ${visit.booking_code} was changed to a direct visit — the customer goes on their own.`,
      link: '/site-visits',
    }).catch((err) => logger.error('[direct-visit] notify released PM/agent:', err));
  }
  return updated;
}

/** Move a direct visit to another date. */
export async function rescheduleDirectVisit(user: TokenPayload, visitId: number, date: string) {
  const visit = await loadVisit(user, visitId);
  if (visit.visit_type !== 'DIRECT')
    throw new AppError(409, 'Only a direct visit can be moved here.');
  if (!DIRECT_OPEN_STATES.includes(visit.status)) {
    throw new AppError(409, 'This visit is already finished.');
  }
  const when = new Date(date);
  if (isNaN(when.getTime())) throw new AppError(400, 'Enter a valid date.');
  if (getISTComponents(when).dateString < getISTComponents(new Date()).dateString) {
    throw new AppError(400, 'Pick today or a later day.');
  }
  return p.$transaction(async (tx) => {
    const u = await tx.siteVisitBooking.update({
      where: { id: visitId },
      data: { scheduled_date: when, status: 'CONFIRMED' },
    });
    await tx.leadActivity.create({
      data: {
        lead: { connect: { id: visit.lead_id } },
        actor: { connect: { id: user.employeeId } },
        activity_type: 'SITE_VISIT_REQUESTED',
        notes: `Direct site visit ${visit.booking_code} moved to ${getISTComponents(when).dateString}.`,
      },
    });
    return u;
  });
}

/**
 * Record what happened with a direct visit: the customer came (how interested,
 * what they said) or did not come. A visit that happened moves the lead on the
 * same way a walk-in does, once no other visit of the lead is still open.
 */
export async function recordDirectVisitOutcome(
  user: TokenPayload,
  visitId: number,
  input: { visited: boolean; rating?: string; feedback_notes?: string },
) {
  const visit = await loadVisit(user, visitId);
  if (visit.visit_type !== 'DIRECT') {
    throw new AppError(409, 'Only a direct visit is recorded here.');
  }
  if (!DIRECT_OPEN_STATES.includes(visit.status)) {
    throw new AppError(409, 'This visit is already finished.');
  }
  const notes = (input.feedback_notes || '').trim();

  if (!input.visited) {
    const updated = await p.$transaction(async (tx) => {
      const u = await tx.siteVisitBooking.update({
        where: { id: visitId },
        data: {
          status: 'CANCELLED',
          cancellation_reason: `Customer did not come.${notes ? ` ${notes}` : ''}`.slice(0, 1000),
        },
      });
      await tx.leadActivity.create({
        data: {
          lead: { connect: { id: visit.lead_id } },
          actor: { connect: { id: user.employeeId } },
          activity_type: 'SITE_VISIT_COMPLETED',
          notes:
            `Direct site visit ${visit.booking_code}: the customer did not come.${notes ? ` ${notes}` : ''}`.slice(
              0,
              1000,
            ),
        },
      });
      return u;
    });
    return {
      visit: updated,
      note: 'Marked as not visited. Book a new visit when the customer is ready.',
    };
  }

  if (!input.rating || !(WALK_IN_RATINGS as readonly string[]).includes(input.rating)) {
    throw new AppError(400, 'Choose how interested the customer was.');
  }
  if (notes.length < 3) throw new AppError(400, 'Write what the customer said about the visit.');
  if (getISTComponents(visit.scheduled_date).dateString > getISTComponents(new Date()).dateString) {
    throw new AppError(
      409,
      'This visit is on a later day. Change the date if the customer came early.',
    );
  }

  const done = await p.$transaction(
    async (tx) => {
      const u = await tx.siteVisitBooking.update({
        where: { id: visitId },
        data: {
          status: 'COMPLETED',
          completed_at: new Date(),
          rating: input.rating,
          feedback_notes: `Direct visit, reported by ${visit.telecaller_id === user.employeeId ? 'the telecaller' : 'staff'}. ${notes}`,
        },
      });
      await tx.leadActivity.create({
        data: {
          lead: { connect: { id: visit.lead_id } },
          actor: { connect: { id: user.employeeId } },
          activity_type: 'SITE_VISIT_COMPLETED',
          notes:
            `Direct site visit ${visit.booking_code}${visit.project ? ` to ${visit.project.name}` : ''} done. Interest: ${input.rating}. ${notes}`.slice(
              0,
              1000,
            ),
        },
      });
      // Nobody from the company ran it, so there is nobody to rate; the customer is still asked.
      const token = await createFeedbackRequest(tx, visitId, null);
      return { u, token };
    },
    { maxWait: 10000, timeout: 30000 },
  );

  const note = await advanceLead(user, visit.lead_id, visitId, input.rating, notes);
  await dispatchFeedbackRequestNotification(visitId, done.token);
  return { visit: done.u, note };
}

/** Same lead moves as a walk-in, but only once the lead has no other open visit. */
async function advanceLead(
  user: TokenPayload,
  leadId: number,
  visitId: number,
  rating: string,
  notes: string,
): Promise<string | undefined> {
  const open = await p.siteVisitBooking.count({
    where: { lead_id: leadId, id: { not: visitId }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
  });
  if (open > 0) {
    return `Visit recorded. This lead has ${open} more site visit(s) open; it moves on after the last one.`;
  }
  const lead = await p.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!lead) return undefined;
  const branch = rating === 'NOT_INTERESTED' ? 'DROPPED' : 'NEGOTIATION';
  const chain: Record<string, string[]> = {
    QUALIFIED: ['SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', branch],
    DEMO_COMPLETED: ['SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', branch],
    SITE_VISIT_SCHEDULED: ['SITE_VISIT_COMPLETED', branch],
    SITE_VISIT_COMPLETED: [branch],
  };
  const steps = chain[lead.status];
  if (!steps) {
    return ['NEGOTIATION', 'BOOKING_INITIATED'].includes(lead.status)
      ? undefined
      : 'Visit recorded. The lead is still at an early stage, so it was not moved: qualify it to carry on.';
  }
  try {
    for (const step of steps) {
      await LeadService.updateLeadStatus(
        user,
        leadId,
        step,
        step === 'DROPPED'
          ? 'Auto-dropped: the customer visited the site and was not interested.'
          : step === 'NEGOTIATION'
            ? 'Auto-advanced to Negotiation: the customer visited the site and showed interest.'
            : undefined,
        step === 'DROPPED'
          ? dropReasonFromOutcomes([notes, 'not interested after the site visit'])
          : undefined,
        { skipPermissionCheck: true },
      );
    }
  } catch (err: any) {
    logger.error(`[direct-visit] lead ${leadId} could not advance after the visit:`, err);
    return `Visit recorded, but the lead could not be moved on automatically (${err?.message || 'unknown reason'}). Move it from the lead page.`;
  }
  return undefined;
}
