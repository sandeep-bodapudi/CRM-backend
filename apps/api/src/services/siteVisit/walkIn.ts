import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { Roles } from '../../shared';
import { buildLeadScope } from '../../authz/dataScope';
import { getISTComponents } from '../../utils/time';
import { logger } from '../../utils/logger';
import { LeadService } from '../lead.service';
import { createFeedbackRequest, dispatchFeedbackRequestNotification } from '../feedback.service';
import { generateNextBookingCode, dropReasonFromOutcomes } from './shared';

const p = prisma;

export const WALK_IN_RATINGS = ['HOT_INTERESTED', 'WARM', 'COLD', 'NOT_INTERESTED'] as const;
/** A walk-in is recorded afterwards; anything older than this is probably a mistake. */
const MAX_BACKDATE_DAYS = 30;

export interface WalkInInput {
  /** An existing lead... */
  lead_id?: number;
  /** ...or the customer's details, to create the lead together with the visit. */
  customer_name?: string;
  phone?: string;
  project_id: number;
  /** When the customer came (ISO). Not in the future. */
  visit_date: string;
  rating: string;
  feedback_notes: string;
}

const isManagement = (user: TokenPayload) =>
  user.roles.some((r) =>
    [Roles.MD, Roles.ADMIN, Roles.HR_MANAGER, Roles.MARKETING_DIRECTOR].includes(r as any),
  );

/**
 * Record a visit the customer made on their own, after the fact.
 *
 * Unlike a booked visit there is no project manager to route to and nothing to
 * accept or start: the telecaller reports it as already completed (date,
 * project, how interested the customer was, what they said), so it is stored
 * as COMPLETED with `visit_type = WALK_IN` and `project_manager_id = NULL`.
 * That keeps it out of every project manager's counts (they did not run it).
 * A telecaller may record it only for a lead they own; management for any.
 * The lead moves on (to Negotiation, or Dropped when the customer was not
 * interested) only when it had already reached the stage a visit belongs to --
 * an earlier lead keeps its stage and the response says so.
 */
export async function recordWalkIn(user: TokenPayload, input: WalkInInput) {
  if (!(WALK_IN_RATINGS as readonly string[]).includes(input.rating)) {
    throw { status: 400, message: 'Choose how interested the customer was.' };
  }
  const notes = (input.feedback_notes || '').trim();
  if (notes.length < 3) {
    throw { status: 400, message: 'Write what the customer said about the visit.' };
  }

  const visitDate = new Date(input.visit_date);
  if (isNaN(visitDate.getTime())) throw { status: 400, message: 'Enter a valid visit date.' };
  const now = new Date();
  if (visitDate.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw {
      status: 400,
      message: 'A walk-in has already happened: the date cannot be in the future.',
    };
  }
  if (now.getTime() - visitDate.getTime() > MAX_BACKDATE_DAYS * 24 * 3600 * 1000) {
    throw {
      status: 400,
      message: `A walk-in older than ${MAX_BACKDATE_DAYS} days cannot be recorded here. Ask management.`,
    };
  }

  const project = await p.project.findFirst({
    where: { id: input.project_id, company_id: user.companyId },
    select: { id: true, name: true },
  });
  if (!project) throw { status: 404, message: 'Project not found.' };

  // --- the lead: an existing one the user owns, or a new one made together with the visit
  let lead: any;
  let createdLead = false;
  if (input.lead_id) {
    const scope = await buildLeadScope(user);
    lead = await p.lead.findFirst({ where: { id: input.lead_id, ...scope } });
    if (!lead) throw { status: 404, message: 'Lead not found.' };
    if (lead.assigned_to_id !== user.employeeId && !isManagement(user)) {
      throw { status: 403, message: 'You can record a walk-in only for a lead that is yours.' };
    }
  } else {
    const name = (input.customer_name || '').trim();
    const phone = (input.phone || '').trim();
    if (name.length < 2 || !phone) {
      throw { status: 400, message: "Enter the customer's name and phone number." };
    }
    const existing = await p.lead.findFirst({
      where: { company_id: user.companyId, phone },
      select: { id: true, lead_code: true, status: true, assigned_to_id: true },
    });
    if (existing) {
      throw {
        status: 409,
        message: `A lead with this phone number already exists (${existing.lead_code}). Open it and record the walk-in from there.`,
      };
    }
    const made = await LeadService.createLead(user, {
      customer_name: name,
      phone,
      source: 'WALK_IN',
      ownership_type: 'DIRECT',
    });
    lead = (made as any).lead;
    createdLead = true;
  }

  if (lead.status === 'BOOKED' || lead.status === 'DROPPED') {
    throw { status: 409, message: `A ${lead.status.toLowerCase()} lead cannot take a new visit.` };
  }

  // The same customer can visit two projects, but not the same project twice in one day.
  const dayStart = new Date(`${getISTComponents(visitDate).dateString}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const duplicate = await p.siteVisitBooking.findFirst({
    where: {
      lead_id: lead.id,
      project_id: project.id,
      scheduled_date: { gte: dayStart, lt: dayEnd },
      status: { not: 'CANCELLED' },
    },
    select: { booking_code: true },
  });
  if (duplicate) {
    throw {
      status: 409,
      message: `This customer already has a visit to ${project.name} on that day (${duplicate.booking_code}).`,
    };
  }

  const visit = await p.$transaction(
    async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      const created = await tx.siteVisitBooking.create({
        data: {
          booking_code: await generateNextBookingCode(),
          lead: { connect: { id: lead.id } },
          telecaller: { connect: { id: user.employeeId } },
          project: { connect: { id: project.id } },
          scheduled_date: visitDate,
          completed_at: visitDate,
          status: 'COMPLETED',
          visit_type: 'WALK_IN',
          rating: input.rating,
          feedback_notes: `Walk-in, reported by the telecaller. ${notes}`,
        },
      });
      await tx.leadActivity.create({
        data: {
          lead: { connect: { id: lead.id } },
          actor: { connect: { id: user.employeeId } },
          activity_type: 'SITE_VISIT_COMPLETED',
          notes:
            `Walk-in visit to ${project.name} recorded (${created.booking_code}). Interest: ${input.rating}. ${notes}`.slice(
              0,
              1000,
            ),
        },
      });
      // Nobody ran this visit, so there is nobody to rate; the customer is still asked for feedback.
      const token = await createFeedbackRequest(tx, created.id, null);
      return { created, token };
    },
    { maxWait: 10000, timeout: 30000 },
  );

  // Move the lead only when it had reached the stage a visit belongs to.
  let leadNote: string | undefined;
  const status: string = lead.status;
  const branch = input.rating === 'NOT_INTERESTED' ? 'DROPPED' : 'NEGOTIATION';
  const chain: Record<string, string[]> = {
    QUALIFIED: ['SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', branch],
    DEMO_COMPLETED: ['SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', branch],
    SITE_VISIT_SCHEDULED: ['SITE_VISIT_COMPLETED', branch],
    SITE_VISIT_COMPLETED: [branch],
  };
  const steps = chain[status];
  if (steps) {
    try {
      for (const step of steps) {
        await LeadService.updateLeadStatus(
          user,
          lead.id,
          step,
          step === 'DROPPED'
            ? 'Auto-dropped: the customer walked in and was not interested.'
            : step === 'NEGOTIATION'
              ? 'Auto-advanced to Negotiation: the customer walked in and showed interest.'
              : undefined,
          step === 'DROPPED'
            ? dropReasonFromOutcomes([notes, 'not interested after walking in'])
            : undefined,
          { skipPermissionCheck: true },
        );
      }
    } catch (err: any) {
      logger.error(`[walk-in] lead ${lead.id} could not advance after the visit:`, err);
      leadNote = `Visit recorded, but the lead could not be moved on automatically (${err?.message || 'unknown reason'}). Move it from the lead page.`;
    }
  } else if (['NEGOTIATION', 'BOOKING_INITIATED'].includes(status)) {
    leadNote = undefined; // already past the visit stage
  } else {
    leadNote =
      'Visit recorded. The lead is still at an early stage, so it was not moved: qualify it to carry on.';
  }

  await dispatchFeedbackRequestNotification(visit.created.id, visit.token);

  return { visit: visit.created, lead_id: lead.id, lead_created: createdLead, note: leadNote };
}
