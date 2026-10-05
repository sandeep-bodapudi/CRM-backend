import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { AppError } from './errors';
import { CALL_OUTCOMES } from './calls';
import { generateNextBookingCode } from '../siteVisit/shared';

const p = prisma;

/**
 * Stages a Channel Partner Manager can add a lead at. Associates bring
 * customers who have often already been spoken to, qualified or even taken
 * on a visit before the lead reaches the CRM. Booking stages are excluded:
 * those need a real booking with payments and approvals.
 */
export const INITIAL_STAGES = [
  'ASSIGNED',
  'CONTACTED',
  'QUALIFIED',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_COMPLETED',
  'NEGOTIATION',
] as const;
export type InitialStage = (typeof INITIAL_STAGES)[number];

export interface StageDetails {
  contacted_at?: string;
  call_notes?: string;
  project_id?: number;
  visit_at?: string;
  visit_handled_by_id?: number;
  visit_rating?: 'HOT_INTERESTED' | 'WARM' | 'COLD' | 'NOT_INTERESTED';
  visit_feedback?: string;
  negotiation_notes?: string;
}

const STAGE_LABEL: Record<InitialStage, string> = {
  ASSIGNED: 'Not contacted yet',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  SITE_VISIT_SCHEDULED: 'Site visit scheduled',
  SITE_VISIT_COMPLETED: 'Site visit completed',
  NEGOTIATION: 'Negotiation',
};

const atLeast = (stage: InitialStage, min: InitialStage) =>
  INITIAL_STAGES.indexOf(stage) >= INITIAL_STAGES.indexOf(min);

const parseDate = (v: string | undefined, label: string) => {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new AppError(400, `${label} is required`);
  return d;
};

export interface ResolvedStage {
  stage: InitialStage;
  contactedAt?: Date;
  callNotes?: string;
  project?: { id: number; name: string; assigned_pm_id: number | null };
  visitAt?: Date;
  handler?: { id: number; name: string };
  details: StageDetails;
}

/**
 * Checks every detail the chosen stage needs is present (the same things
 * the normal step-by-step flow would have collected) before anything is
 * written.
 */
export async function resolveInitialStage(
  user: TokenPayload,
  stage: InitialStage,
  details: StageDetails,
  dto: {
    property_type_preference?: string | null;
    budget_max?: number | null;
    preferred_location?: string | null;
    preferred_locations?: string[];
  },
): Promise<ResolvedStage> {
  const out: ResolvedStage = { stage, details };
  if (stage === 'ASSIGNED') return out;
  const now = Date.now() + 5 * 60 * 1000;

  out.contactedAt = parseDate(details.contacted_at, 'Date the customer was first spoken to');
  if (out.contactedAt.getTime() > now) {
    throw new AppError(400, 'The first-contact date cannot be in the future');
  }
  out.callNotes = details.call_notes?.trim() || undefined;

  if (atLeast(stage, 'QUALIFIED')) {
    const hasLocation = !!(dto.preferred_locations?.length || dto.preferred_location?.trim());
    if (!dto.property_type_preference || !dto.budget_max || !hasLocation) {
      throw new AppError(400, 'Property type, budget and preferred location are required');
    }
  }

  if (atLeast(stage, 'SITE_VISIT_SCHEDULED')) {
    if (!details.project_id) throw new AppError(400, 'Choose the project of the site visit');
    const project = await p.project.findFirst({
      where: { id: details.project_id, company_id: user.companyId },
      select: { id: true, name: true, assigned_pm_id: true },
    });
    if (!project) throw new AppError(404, 'Project not found');
    out.project = project;

    if (!details.visit_handled_by_id) {
      throw new AppError(400, 'Choose who handles the site visit');
    }
    const handler = await p.employee.findFirst({
      where: { id: details.visit_handled_by_id, company_id: user.companyId, status: 'ACTIVE' },
      select: { id: true, full_name: true, employee_code: true },
    });
    if (!handler) throw new AppError(404, 'Site visit handler not found');
    out.handler = { id: handler.id, name: handler.full_name || handler.employee_code };

    out.visitAt = parseDate(details.visit_at, 'Site visit date and time');
    if (stage === 'SITE_VISIT_SCHEDULED' && out.visitAt.getTime() < Date.now() - 60 * 60 * 1000) {
      throw new AppError(400, 'A scheduled visit must be in the future');
    }
  }

  if (atLeast(stage, 'SITE_VISIT_COMPLETED')) {
    if (out.visitAt!.getTime() > now) {
      throw new AppError(400, 'A completed visit cannot be in the future');
    }
    if (!details.visit_rating)
      throw new AppError(400, "Choose the customer's interest after the visit");
    if (!details.visit_feedback?.trim()) throw new AppError(400, 'Enter the site visit feedback');
  }

  if (stage === 'NEGOTIATION' && !details.negotiation_notes?.trim()) {
    throw new AppError(400, 'Enter what is being negotiated');
  }
  return out;
}

/** Writes the records the chosen stage implies, inside the lead's create transaction. */
export async function applyInitialStage(
  tx: Prisma.TransactionClient,
  user: TokenPayload,
  lead: { id: number; customer_name: string; lead_code: string },
  r: ResolvedStage,
) {
  if (r.stage === 'ASSIGNED') return;

  await tx.leadActivity.create({
    data: {
      lead_id: lead.id,
      actor_id: user.employeeId,
      activity_type: 'CALL_LOGGED',
      notes: `[${CALL_OUTCOMES.CONNECTED_INTERESTED}] ${r.callNotes || 'Spoken to before the lead was added'}`,
      created_at: r.contactedAt,
    },
  });

  if (r.project) {
    const pmId = r.project.assigned_pm_id;
    const completed = r.stage !== 'SITE_VISIT_SCHEDULED';
    const booking = await tx.siteVisitBooking.create({
      data: {
        booking_code: await generateNextBookingCode(),
        lead_id: lead.id,
        telecaller_id: user.employeeId,
        project_id: r.project.id,
        project_manager_id: pmId ?? r.handler!.id,
        assigned_agent_id: pmId && pmId !== r.handler!.id ? r.handler!.id : null,
        scheduled_date: r.visitAt!,
        status: completed ? 'COMPLETED' : 'CONFIRMED',
        verification_call_notes: 'Recorded by the Channel Partner Manager when adding the lead.',
        ...(completed
          ? {
              completed_at: r.visitAt,
              rating: r.details.visit_rating,
              feedback_notes: r.details.visit_feedback!.trim(),
            }
          : {}),
      },
    });
    await tx.leadActivity.create({
      data: {
        lead_id: lead.id,
        actor_id: user.employeeId,
        activity_type: completed ? 'SITE_VISIT_COMPLETED' : 'SITE_VISIT_BOOKED',
        notes: completed
          ? `Visit ${booking.booking_code} to ${r.project.name} on ${r.visitAt!.toDateString()}, handled by ${r.handler!.name}. Interest: ${r.details.visit_rating}. Feedback: ${r.details.visit_feedback!.trim()}`
          : `Visit ${booking.booking_code} to ${r.project.name} on ${r.visitAt!.toDateString()}, handled by ${r.handler!.name}`,
      },
    });
    await tx.notification.create({
      data: {
        employee_id: r.handler!.id,
        type: 'STATUS_UPDATE',
        title: completed ? 'Site visit recorded' : 'Site visit scheduled for you',
        message: `${lead.customer_name} (${lead.lead_code}) — ${r.project.name}, ${r.visitAt!.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. Recorded by the Channel Partner Manager.`,
      },
    });
  }

  if (r.stage === 'NEGOTIATION') {
    await tx.leadActivity.create({
      data: {
        lead_id: lead.id,
        actor_id: user.employeeId,
        activity_type: 'NOTE_ADDED',
        notes: `Negotiation: ${r.details.negotiation_notes!.trim()}`,
      },
    });
  }

  await tx.leadActivity.create({
    data: {
      lead_id: lead.id,
      actor_id: user.employeeId,
      activity_type: 'STATUS_CHANGED',
      notes: `Added directly at "${STAGE_LABEL[r.stage]}" by the Channel Partner Manager (the customer had already reached this stage).`,
    },
  });
}
