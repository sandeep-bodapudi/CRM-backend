import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { WorkflowEngine } from '../../workflows/workflowEngine';
import { WorkflowDomain } from '../../workflows/types';
import { SiteVisitAction } from '../../workflows/siteVisit.workflow';
import { Roles } from '../../shared';

const p = prisma;

/** Site visit statuses that count as "currently on this PM/Agent's plate"
 * for load-balancing the fallback routing below. */
const ACTIVE_VISIT_STATUSES = [
  'PENDING_ACCEPTANCE',
  'ACCEPTED',
  'PENDING_CUSTOMER_RECONFIRMATION',
  'RESCHEDULE_REQUESTED',
  'PENDING_PM_RECONFIRMATION',
  'CONFIRMED',
  'ACTIVE',
];

/**
 * A property-less visit (no project, no linked property) has no PM to
 * inherit — previously this left `project_manager_id` at null, which
 * SiteVisitPolicy.canAccept can never match (it requires
 * project_manager_id === the accepting employee's own id), so the visit sat
 * in the queue forever, un-acceptable by anyone. This routes it instead:
 * first via the company's explicit PMLocationAssignment table (already
 * built for exactly this purpose — see pm-routing.service.ts — but never
 * previously consulted during booking), then, if no location match exists,
 * to whichever active PM/Agent currently has the fewest open visits.
 */
async function resolveFallbackPm(
  companyId: number,
  preferredLocation?: string | null,
): Promise<number | null> {
  if (preferredLocation) {
    const assignment = await p.pMLocationAssignment.findFirst({
      where: { company_id: companyId, location: preferredLocation },
      orderBy: { id: 'asc' },
    });
    if (assignment) return assignment.pm_id;
  }

  // Only PROJECT_MANAGER and SALES_MANAGER actually hold
  // site_visits.assign_agent in RolePermissionsMatrix — Agent does not, so a
  // visit routed to one would repeat the exact bug this function exists to
  // fix (SiteVisitPolicy.canAccept fails its permission check before even
  // reaching the project_manager_id match).
  const candidates = await p.employee.findMany({
    where: {
      company_id: companyId,
      status: 'ACTIVE',
      roles: { some: { role: { name: { in: [Roles.PROJECT_MANAGER, Roles.SALES_MANAGER] } } } },
    },
    select: { id: true },
  });
  if (candidates.length === 0) return null;

  const loads = await Promise.all(
    candidates.map(async (c) => ({
      id: c.id,
      count: await p.siteVisitBooking.count({
        where: { project_manager_id: c.id, status: { in: ACTIVE_VISIT_STATUSES as any } },
      }),
    })),
  );
  loads.sort((a, b) => a.count - b.count);
  return loads[0].id;
}

export async function generateNextBookingCode(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `RRH-SV-${currentYear}-`;
  const count = await p.siteVisitBooking.count();
  let seq = count + 1;
  for (;;) {
    const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    const existing = await p.siteVisitBooking.findUnique({ where: { booking_code: candidate } });
    if (!existing) {
      return candidate;
    }
    seq++;
  }
}

/**
 * Resolve the authoritative project PM for the given property/unit list.
 * §2 constraint: all linked items in a single booking must belong to the SAME
 * project — extended for "every project is a property" to project units too,
 * which always belong to exactly one project (unlike a standalone Property,
 * whose project_id is optional).
 */
export async function resolveVisitProject(
  data: any,
  companyId: number,
  lead?: { preferred_location?: string | null },
): Promise<{ projectId: number; pmId: number | null }> {
  // Determine project from an explicit project_id, from the properties, or
  // from the units.
  let projectId: number | null = data.project_id ?? null;
  const propertyIds: number[] =
    data.property_ids && Array.isArray(data.property_ids)
      ? data.property_ids
      : data.property_id
        ? [data.property_id]
        : [];
  const projectUnitIds: number[] =
    data.project_unit_ids && Array.isArray(data.project_unit_ids)
      ? data.project_unit_ids
      : data.project_unit_id
        ? [data.project_unit_id]
        : [];

  const projects = new Set<number>();

  if (propertyIds.length > 0) {
    const properties = await p.property.findMany({
      where: { id: { in: propertyIds }, company_id: companyId },
    });
    for (const pr of properties) if (pr.project_id) projects.add(pr.project_id);
  }
  if (projectUnitIds.length > 0) {
    const units = await p.projectUnit.findMany({
      where: { id: { in: projectUnitIds }, company_id: companyId },
    });
    for (const u of units) projects.add(u.project_id);
  }
  if (projects.size > 1) {
    throw {
      status: 400,
      message: '§2: All properties/units in a single site visit must belong to the same project.',
    };
  }
  if (projects.size === 1) {
    projectId = [...projects][0];
  }

  if (!projectId) {
    const pmId = await resolveFallbackPm(companyId, lead?.preferred_location);
    return { projectId: 0, pmId };
  }

  const project = await p.project.findFirst({ where: { id: projectId } });
  const pmId =
    project?.assigned_pm_id ?? (await resolveFallbackPm(companyId, lead?.preferred_location));
  return { projectId, pmId };
}

/** Helper: run an action through the workflow engine and persist the next status. */
export async function applyTransition(
  user: TokenPayload,
  visitId: number,
  action: SiteVisitAction,
  extraData: any = {},
  activityType: string,
  activityNotes: string,
) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true },
  });
  if (!visit) {
    throw { status: 404, message: 'Site visit booking not found' };
  }

  const transition = WorkflowEngine.canTransition({
    domain: WorkflowDomain.SITE_VISIT,
    currentState: visit.status,
    action,
    actor: user,
    entity: visit,
  });
  if (!transition.allowed) {
    throw { status: 409, message: transition.reason || 'Invalid state transition' };
  }

  return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
    // Includes `lead` so callers like acceptVisit can hand the customer's
    // name/phone straight back in the response — previously the accepting
    // PM/Agent got no contact details at all until a separate detail fetch.
    const updated = await tx.siteVisitBooking.update({
      where: { id: visitId },
      data: { status: transition.nextState, ...extraData },
      include: { lead: true },
    });

    await tx.leadActivity.create({
      data: {
        lead: { connect: { id: visit.lead_id } },
        actor: { connect: { id: user.employeeId } },
        activity_type: activityType,
        notes: activityNotes,
      },
    });

    return updated;
  });
}

/**
 * Turn what the customer said about the visited properties into a real
 * LeadExitReason. Outcome reasons are free text, so match on common words and
 * fall back to OTHER (with the text kept as the detail) instead of recording
 * a reason that may be untrue.
 */
export function dropReasonFromOutcomes(reasons: Array<string | null | undefined>): {
  exit_reason: string;
  exit_reason_detail?: string;
} {
  const text = reasons
    .map((r) => (r || '').trim())
    .filter(Boolean)
    .join('; ');
  const t = text.toLowerCase();
  if (/budget|price|expensive|costly|afford/.test(t)) return { exit_reason: 'BUDGET_MISMATCH' };
  if (/location|far|distance|area/.test(t)) return { exit_reason: 'LOCATION_MISMATCH' };
  if (/competitor|other builder|another builder|chose|bought elsewhere/.test(t))
    return { exit_reason: 'CHOSE_COMPETITOR' };
  if (/loan|finance|financing/.test(t)) return { exit_reason: 'FINANCING_ISSUE' };
  if (/not ready|later|postpone|wait/.test(t)) return { exit_reason: 'NOT_READY' };
  return {
    exit_reason: 'OTHER',
    exit_reason_detail: (text || 'Not interested after the site visit').slice(0, 500),
  };
}
