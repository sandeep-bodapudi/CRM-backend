import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { can } from '../../authz/authorization';
import { getAccessibleCompanyIds } from '../../authz/dataScope';
import { Permissions, Roles } from '../../shared';
import { WorkflowEngine } from '../../workflows/workflowEngine';
import { OpportunityService } from '../opportunity.service';
import { CustomerPortalService } from '../customerPortal.service';
import { findBestAssigneeForLead } from '../../utils/distributionService';
import { AppError } from './errors';
import { generateNextLeadCode, syncLeadPreferredLocations } from './shared';
import { notifyEmployee } from '../../utils/notifyEmployee';
import { logger } from '../../utils/logger';

const p = prisma;

/**
 * Self-claim from the unclaimed-leads safety net (see query.ts's
 * getUnclaimedLeads) — a telecaller/agent picking up a lead that fell
 * through auto-distribution. Deliberately gated on LEADS_UPDATE, not
 * LEADS_ASSIGN: this only ever assigns the lead to the caller themselves,
 * never to a third party, so it doesn't need the higher-privilege
 * reassign-to-anyone permission reassignLead requires above.
 */
export async function claimLead(user: TokenPayload, leadId: number) {
  const lead = await p.lead.findFirst({ where: { id: leadId } });
  if (!lead) throw new AppError(404, 'Lead not found');

  // Deliberately NOT LeadPolicy.canMutate — that requires assigned_to_id to
  // already equal the caller, which by definition is never true for an
  // unclaimed lead (see its own comment on why that's intentional). Claiming
  // is its own capability: hold the base permission, and the lead must be in
  // an accessible company. ADMIN bypasses the company check the same way
  // getUnclaimedLeads does, so an admin never sees a lead in that list they
  // then can't actually claim.
  const hasBasePermission = (user.permissions || []).includes(Permissions.LEADS_UPDATE);
  const isAdmin = user.roles.includes(Roles.ADMIN);
  const accessibleCompanyIds = isAdmin ? null : await getAccessibleCompanyIds(user);
  if (
    !hasBasePermission ||
    (accessibleCompanyIds && !accessibleCompanyIds.includes(lead.company_id))
  ) {
    throw new AppError(403, 'Forbidden: Insufficient privileges');
  }
  if (lead.assigned_to_id !== null) {
    throw new AppError(409, 'This lead has already been claimed by someone else');
  }
  if (lead.status !== 'NEW') {
    throw new AppError(409, `Cannot claim a lead in status ${lead.status}`);
  }

  return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
    const updated = await WorkflowEngine.transitionLead(
      tx,
      leadId,
      'ASSIGNED',
      { actor: user, entity: lead },
      {
        assigned_to_id: user.employeeId,
        assigned_at: new Date(),
        assignment_type: 'SELF_CLAIMED',
      },
    );

    await tx.leadActivity.create({
      data: {
        lead_id: leadId,
        actor_id: user.employeeId,
        activity_type: 'ASSIGNED_TO_AGENT',
        notes: `Self-claimed from the unclaimed leads pool.`,
      },
    });

    return updated;
  });
}

export async function reassignLead(
  user: TokenPayload,
  leadId: number,
  assigneeId: number,
  reason: string,
) {
  const lead = await p.lead.findFirst({ where: { id: leadId } });
  if (!lead) throw new AppError(404, 'Lead not found');

  if (!can(user, Permissions.LEADS_ASSIGN, lead)) {
    throw new AppError(403, 'Forbidden: Insufficient privileges or cross-company reassignment');
  }

  const assignee = await p.employee.findFirst({ where: { id: assigneeId } });
  if (!assignee) throw new AppError(404, 'Assignee employee not found');

  return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
    const newStatus = lead.status === 'NEW' ? 'ASSIGNED' : lead.status;
    const updated = await WorkflowEngine.transitionLead(
      tx,
      leadId,
      newStatus,
      { actor: user, entity: lead },
      {
        assigned_to_id: assigneeId,
        assigned_at: new Date(),
        assignment_type: 'MANUAL_OVERRIDE',
      },
    );

    await tx.leadActivity.create({
      data: {
        lead_id: leadId,
        actor_id: user.employeeId,
        activity_type: 'ASSIGNED_TO_AGENT',
        notes: `Manual Reassignment to ${assignee.full_name || assignee.employee_code}. Reason: ${reason}`,
      },
    });

    // Notify the newly assigned employee
    await tx.notification.create({
      data: {
        employee_id: assigneeId,
        type: 'TARGET_ASSIGNED',
        title: 'Lead Assigned to You',
        message: `Lead ${lead.lead_code} (${lead.customer_name}) has been assigned to you by ${user.employeeId}. Reason: ${reason}`,
      },
    });

    await tx.auditEvent.create({
      data: {
        actor_id: user.employeeId,
        action: 'LEAD_MANUAL_REASSIGNMENT_OVERRIDE',
        entity_type: 'LEAD',
        entity_id: leadId,
        old_value: JSON.stringify({ assigned_to_id: lead.assigned_to_id }),
        new_value: JSON.stringify({ assigned_to_id: assigneeId, reason }),
      },
    });

    return updated;
  });
  // Send web push notification to the newly assigned employee (outside transaction)
  notifyEmployee(
    assigneeId,
    {
      type: 'TARGET_ASSIGNED',
      title: 'Lead Assigned to You',
      message: `Lead ${lead!.lead_code} (${lead!.customer_name}) has been assigned to you.`,
    },
    { skipDbNotification: true },
  ).catch((err) => logger.error('[WebPush] Lead reassign:', err));
}

export async function updateLeadStatus(
  user: TokenPayload,
  leadId: number,
  newStatus: string,
  notes?: string,
  guardFields?: {
    exit_reason?: string;
    exit_reason_detail?: string;
    demo_scheduled_at?: string;
    demo_handler_id?: number;
    qualification?: any;
  },
  opts?: {
    // Skips the leads.update/LeadPolicy.canMutate check below. Only for a
    // trusted internal caller advancing the Lead as an automatic consequence
    // of an action the user WAS separately authorized for (e.g. completing a
    // site visit, which needs site_visits.complete, not leads.update) — never
    // set from an HTTP request body. See routes/siteVisits.ts's /:id/complete
    // handler for the one real caller: whoever holds site_visits.complete
    // (typically Agent) usually lacks leads.update and, even with it granted,
    // is usually not the lead's assignee, so LeadPolicy.canMutate would still
    // reject a call made on their own authority.
    skipPermissionCheck?: boolean;
  },
) {
  const lead = await p.lead.findFirst({ where: { id: leadId }, include: { project: true } });
  if (!lead) throw new AppError(404, 'Lead not found');

  if (!opts?.skipPermissionCheck && !can(user, Permissions.LEADS_UPDATE, lead)) {
    throw new AppError(403, 'Forbidden: You do not have permission to mutate this lead');
  }

  const _guardFields = guardFields || {};

  // Demo handler is now a required MANUAL pick from the CRM (§ Phase 2/6) —
  // was an automatic territory-lookup + role-fallback chain that could land
  // on Sales Manager/Marketing Director/MD/any Admin with zero human input,
  // and silently overwrote whatever the client sent. The Zod schema
  // (LeadStatusUpdateSchema) already requires demo_handler_id whenever
  // status -> DEMO_SCHEDULED; this validates the chosen employee is
  // active, in this company, and holds an eligible role (PM/Agent/Sales
  // Manager/Channel Partner Manager, or MD self-assigning) — Telecallers
  // are explicitly ineligible.
  //
  // Auto-assign fallback: if handler_id is not provided, resolve the
  // lead's project PM as the default handler. When the territory model
  // exists (P2.3), replace this with a territory-based lookup.
  if (newStatus === 'DEMO_SCHEDULED') {
    let handlerId = _guardFields.demo_handler_id;

    // Auto-resolve from lead's project PM if not manually specified
    if (!handlerId) {
      if (lead.project?.assigned_pm_id) {
        handlerId = lead.project.assigned_pm_id;
      }
    }

    if (!handlerId) {
      throw new AppError(
        400,
        'Please select who will handle this demo, or attach a project to the lead so the PM can be auto-assigned.',
      );
    }

    const handler = await p.employee.findFirst({
      where: { id: handlerId, company_id: lead.company_id, status: 'ACTIVE' },
      include: { roles: { include: { role: true } } },
    });
    if (!handler) {
      throw new AppError(400, 'Selected demo handler was not found or is not active.');
    }

    const eligibleRoleNames: string[] = [
      Roles.PROJECT_MANAGER,
      Roles.AGENT,
      Roles.SALES_MANAGER,
      Roles.CHANNEL_PARTNER_MANAGER,
      Roles.MD,
    ];
    const isEligible = handler.roles.some((r) => eligibleRoleNames.includes(r.role.name));
    if (!isEligible) {
      throw new AppError(
        400,
        'Selected employee is not eligible to handle a demo (must be a Project Manager, Agent, Sales Manager, Channel Partner Manager, or the Managing Director).',
      );
    }
  }

  // §0: the workflow engine is the ONLY authority allowed to write Lead.status.
  // We assemble the entity context the engine uses for its field-level guards.
  const entityContext: any = {
    ...lead,
    exit_reason: _guardFields.exit_reason ?? lead.exit_reason,
  };
  if (_guardFields.demo_scheduled_at) {
    entityContext.pending_demo = {
      scheduled_at: _guardFields.demo_scheduled_at,
      handler_id: _guardFields.demo_handler_id,
    };
  }
  if (_guardFields.qualification) {
    const q = _guardFields.qualification;
    if (q.budget_min !== undefined) entityContext.budget_min = q.budget_min;
    if (q.budget_max !== undefined) entityContext.budget_max = q.budget_max;
    if (q.property_type_preference !== undefined)
      entityContext.property_type_preference = q.property_type_preference;
    if (q.preferred_location !== undefined) entityContext.preferred_location = q.preferred_location;
  }

  if (newStatus === 'DEMO_SCHEDULED' || newStatus === 'DEMO_COMPLETED') {
    entityContext.demos = await p.demo.findMany({ where: { lead_id: leadId } });
  }

  // Always pull activities — the CALL_LOGGED guard (§1 row 2) needs them
  entityContext.activities = await p.leadActivity.findMany({ where: { lead_id: leadId } });
  // SITE_VISIT_* guards need the linked visits AND their property outcomes
  if (
    newStatus === 'SITE_VISIT_SCHEDULED' ||
    newStatus === 'SITE_VISIT_COMPLETED' ||
    newStatus === 'DROPPED'
  ) {
    entityContext.site_visits = await p.siteVisitBooking.findMany({ where: { lead_id: leadId } });
    if (newStatus === 'DROPPED') {
      // Pull SiteVisitProperty outcomes for the DROPPED-from-SITE_VISIT_COMPLETED guard
      const visits = entityContext.site_visits;
      const visitIds = visits.map((v: any) => v.id);
      if (visitIds.length > 0) {
        entityContext.site_visit_properties = await p.siteVisitProperty.findMany({
          where: { visit_id: { in: visitIds } },
        });
      }
    }
  }
  // NEGOTIATION / BOOKING_INITIATED guards need the opportunity context
  if (newStatus === 'NEGOTIATION' || newStatus === 'BOOKING_INITIATED') {
    entityContext.opportunities = await p.opportunity.findMany({ where: { lead_id: leadId } });

    // §4's auto-create only runs AFTER this transition is validated below,
    // so on a lead's FIRST move into NEGOTIATION no Opportunity exists yet —
    // canTransition()'s "requires an Opportunity with expected_value" guard
    // would always reject it, making this transition permanently
    // unreachable through the normal lead pipeline (the only way in was the
    // separate, never-wired-up-in-any-UI OpportunityService.createFromLead
    // route, which passes its own freshly-created opportunity into the
    // entity context the same way). Preview here what §4 is about to create
    // — computed identically, from the same INTERESTED site_visit_property
    // — so the guard can see the value that will actually be persisted.
    if (newStatus === 'NEGOTIATION' && entityContext.opportunities.length === 0) {
      const interested = await p.siteVisitProperty.findFirst({
        where: { outcome: 'INTERESTED', visit: { lead_id: leadId } },
        include: { property: true, project_unit: true },
      });
      entityContext.opportunities = [
        {
          expected_value:
            interested?.property?.final_price ?? interested?.project_unit?.final_price ?? null,
        },
      ];
    }
  }

  // §3: emit a distinct activity_type for each macro-transition
  // (see docs/LEAD-WORKFLOW-SPEC.md §3 for the full registry).
  const activityTypeForTransition = (from: string, to: string): string => {
    if (to === 'DROPPED') return 'LEAD_DROPPED';
    if (to === 'RECOVERED_TO_POOL') return 'LEAD_RECOVERED';
    if (to === 'DEMO_SCHEDULED') return 'DEMO_SCHEDULED';
    if (to === 'DEMO_COMPLETED') return 'DEMO_COMPLETED';
    if (to === 'SITE_VISIT_SCHEDULED') return 'SITE_VISIT_REQUESTED';
    if (to === 'SITE_VISIT_COMPLETED') return 'SITE_VISIT_COMPLETED';
    if (to === 'NEGOTIATION') return 'STATUS_CHANGED'; // Opportunity auto-created (§4) below
    if (to === 'BOOKING_INITIATED') return 'STATUS_CHANGED'; // portal provision stub (§6) below
    if (to === 'BOOKED') return 'STATUS_CHANGED';
    if (from === 'NEW' && to === 'ASSIGNED') return 'ASSIGNED_TO_AGENT';
    return 'STATUS_CHANGED';
  };

  const isDrop = newStatus === 'DROPPED';
  const isRecover = newStatus === 'RECOVERED_TO_POOL';

  // 5-Day Unreachable Cap Enforcement
  if (isDrop && (lead.status === 'ASSIGNED' || lead.status === 'CONTACTED')) {
    const exitReason = guardFields?.exit_reason;
    const lowerNotes = (notes || '').toLowerCase();
    if (
      exitReason === 'OTHER' &&
      (lowerNotes.includes('unreachable') ||
        lowerNotes.includes('not answering') ||
        lowerNotes.includes('no response'))
    ) {
      const callLogs = (entityContext.activities || []).filter(
        (a: any) => a.activity_type === 'CALL_LOGGED',
      );
      const distinctDays = new Set(
        callLogs.map((a: any) => new Date(a.created_at).toISOString().split('T')[0]),
      );
      if (distinctDays.size < 5) {
        throw new AppError(
          400,
          'Cannot drop lead as unreachable without at least 5 days of CALL_LOGGED attempts.',
        );
      }
    }
  }

  const finalLead = await p.$transaction(
    async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      const updateData: any = {
        last_contacted_at: new Date(),
      };
      if (isDrop) {
        updateData.exit_reason = guardFields?.exit_reason || null;
        // Only meaningful (and only ever populated by the frontend) when
        // exit_reason === 'OTHER' — the Zod schema enforces that pairing.
        updateData.exit_reason_detail = guardFields?.exit_reason_detail || null;
        updateData.exited_from_status = lead.status; // snapshot per §1
      }
      // Create Demo record when entering DEMO_SCHEDULED instead of updating Lead fields
      if (
        newStatus === 'DEMO_SCHEDULED' &&
        _guardFields.demo_scheduled_at &&
        _guardFields.demo_handler_id
      ) {
        const demoRecord = await tx.demo.create({
          data: {
            lead_id: leadId,
            handler_id: _guardFields.demo_handler_id,
            scheduled_at: new Date(_guardFields.demo_scheduled_at),
            summary: notes || 'Demo Scheduled',
          },
        });
        // Notify the demo handler that a demo was scheduled for them
        await tx.notification.create({
          data: {
            employee_id: _guardFields.demo_handler_id,
            type: 'DEMO_SCHEDULED',
            title: `Demo Scheduled: ${lead.customer_name}`,
            message: `A demo for ${lead.customer_name} (${lead.lead_code}) has been scheduled for ${new Date(_guardFields.demo_scheduled_at).toLocaleString()}.`,
          },
        });
        // Web push to demo handler (outside transaction, after DB notification)
        const demoHandlerId = _guardFields.demo_handler_id;
        notifyEmployee(
          demoHandlerId,
          {
            type: 'DEMO_SCHEDULED',
            title: `Demo Scheduled: ${lead.customer_name}`,
            message: `A demo for ${lead.customer_name} (${lead.lead_code}) has been scheduled for ${new Date(_guardFields.demo_scheduled_at).toLocaleString()}.`,
          },
          { skipDbNotification: true },
        ).catch((err) => logger.error('[WebPush] Demo scheduled:', err));
      }
      // Persist qualification fields when entering QUALIFIED
      if (newStatus === 'QUALIFIED' && guardFields?.qualification) {
        const q = guardFields.qualification;
        if (q.budget_min !== undefined) updateData.budget_min = q.budget_min;
        if (q.budget_max !== undefined) updateData.budget_max = q.budget_max;
        if (q.property_type_preference !== undefined)
          updateData.property_type_preference = q.property_type_preference;
        // Full multi-location list (§ Phase 2) wins over the legacy single
        // field when both are sent.
        if (q.preferred_locations !== undefined && q.preferred_locations.length > 0) {
          updateData.preferred_location = q.preferred_locations[0];
        } else if (q.preferred_location !== undefined) {
          updateData.preferred_location = q.preferred_location;
        }
      }
      // Persist qualification fields when demo handler revises them on DEMO_COMPLETED (§1 row 4)
      if (newStatus === 'DEMO_COMPLETED' && guardFields?.qualification) {
        const q = guardFields.qualification;
        if (q.budget_min !== undefined) updateData.budget_min = q.budget_min;
        if (q.budget_max !== undefined) updateData.budget_max = q.budget_max;
        if (q.property_type_preference !== undefined)
          updateData.property_type_preference = q.property_type_preference;
        if (q.preferred_locations !== undefined && q.preferred_locations.length > 0) {
          updateData.preferred_location = q.preferred_locations[0];
        } else if (q.preferred_location !== undefined) {
          updateData.preferred_location = q.preferred_location;
        }
      }

      if (
        (newStatus === 'QUALIFIED' || newStatus === 'DEMO_COMPLETED') &&
        guardFields?.qualification?.preferred_locations !== undefined
      ) {
        await syncLeadPreferredLocations(tx, leadId, guardFields.qualification.preferred_locations);
      }

      const updated = await WorkflowEngine.transitionLead(
        tx,
        leadId,
        newStatus,
        { actor: user, entity: entityContext },
        updateData,
      );

      const activityType = activityTypeForTransition(lead.status, newStatus);
      await tx.leadActivity.create({
        data: {
          lead_id: leadId,
          actor_id: user.employeeId,
          activity_type: activityType,
          notes: isDrop
            ? `Lead dropped from ${lead.status}. Reason: ${guardFields?.exit_reason || 'n/a'}`
            : `Status updated from ${lead.status} to ${newStatus}${notes ? `: ${notes}` : ''}`,
        },
      });

      // Notify the assigned employee when lead status changes
      if (!isRecover && updated.assigned_to_id) {
        const isDroppedNotification = isDrop;
        await tx.notification.create({
          data: {
            employee_id: updated.assigned_to_id,
            type: isDroppedNotification ? 'LEAD_DROPPED' : 'STATUS_UPDATE',
            title: isDroppedNotification
              ? `Lead ${updated.lead_code} — Dropped`
              : `Lead ${updated.lead_code} — Status Updated`,
            message: isDroppedNotification
              ? `${updated.customer_name} was dropped from ${lead!.status}. Reason: ${guardFields?.exit_reason || 'n/a'}`
              : `${updated.customer_name} moved from ${lead!.status} to ${newStatus}${notes ? `. ${notes}` : ''}`,
          },
        });
      }

      // §4: auto-create Opportunity when entering NEGOTIATION
      if (newStatus === 'NEGOTIATION') {
        // Find the INTERESTED property/unit outcome that unlocked NEGOTIATION
        // (§1: SITE_VISIT_COMPLETED → NEGOTIATION requires ≥1 INTERESTED
        // property). This used to query `outcome: 'INTERESTED'` with no lead
        // scope at all, so it fetched whichever INTERESTED row happened to be
        // first in the whole table (any lead, any company) rather than this
        // lead's — the interestedLeadId===leadId check below only ever
        // matched if that happened to be this lead's own row, meaning any
        // pre-existing INTERESTED history for other leads silently produced
        // a blank Opportunity (no property/unit, no expected_value) here.
        const interested = await tx.siteVisitProperty.findFirst({
          where: { outcome: 'INTERESTED', visit: { lead_id: leadId } },
          include: { visit: true },
        });
        const interestedLeadId = interested?.visit?.lead_id;
        if (interestedLeadId && interestedLeadId === leadId) {
          await OpportunityService.createFromLeadTx(
            tx,
            lead,
            user.employeeId || 1,
            interested.property_id,
            interested.project_unit_id,
          );
        } else {
          await OpportunityService.createFromLeadTx(tx, lead, user.employeeId || 1);
        }
      }

      // §6: customer-portal provisioning stub on BOOKING_INITIATED
      if (newStatus === 'BOOKING_INITIATED') {
        await CustomerPortalService.provisionStub(tx, lead, user);
      }

      let finalUpdated = updated;

      // Auto-assign recovered leads
      if (newStatus === 'RECOVERED_TO_POOL') {
        const bestAssignee = await findBestAssigneeForLead(user.companyId);
        if (bestAssignee) {
          finalUpdated = await WorkflowEngine.transitionLead(
            tx,
            leadId,
            'ASSIGNED',
            { actor: user, entity: { ...entityContext, status: 'RECOVERED_TO_POOL' } },
            {
              assigned_to_id: bestAssignee.employeeId,
              assigned_at: new Date(),
              assignment_type: 'PERFORMANCE_WEIGHTED',
            },
          );

          await tx.leadActivity.create({
            data: {
              lead_id: leadId,
              actor_id: user.employeeId || 1,
              activity_type: 'ASSIGNED_TO_AGENT',
              notes: `Auto-distributed to ${bestAssignee.name} (${bestAssignee.employeeCode}) [Weight Score: ${bestAssignee.weight.toFixed(1)}] upon recovery`,
            },
          });

          // Notify the auto-assigned employee about the recovery
          await tx.notification.create({
            data: {
              employee_id: bestAssignee.employeeId,
              type: 'STATUS_UPDATE',
              title: `Lead ${finalUpdated.lead_code} — Recovered & Assigned to You`,
              message: `${finalUpdated.customer_name} was recovered from dropped state and auto-assigned to you.`,
            },
          });
        }
      }

      return finalUpdated;
    },
  );
  // Send web push notification for lead status change (outside transaction)
  if (!isRecover && finalLead.assigned_to_id) {
    notifyEmployee(
      finalLead.assigned_to_id,
      {
        type: isDrop ? 'LEAD_DROPPED' : 'STATUS_UPDATE',
        title: isDrop
          ? `Lead ${finalLead.lead_code} — Dropped`
          : `Lead ${finalLead.lead_code} — Status Updated`,
        message: isDrop
          ? `${finalLead.customer_name} was dropped from ${lead!.status}.`
          : `${finalLead.customer_name} moved from ${lead!.status} to ${newStatus}${notes ? `. ${notes}` : ''}`,
      },
      { skipDbNotification: true },
    ).catch((err) => logger.error('[WebPush] Lead status:', err));
  }

  return finalLead;
}

/**
 * Sanitise one bulk-upload row before it is considered at all.
 *
 * The route has no schema on the row array, and a client once read an .xlsx
 * as plain text and posted its zip bytes as leads (names like
 * `xl/styles.xml`, phones full of control characters). Whatever the client
 * does, a row only gets in if it looks like a lead: a readable name and a
 * 10-digit phone. Everything else is reported back as a failed row.
 */
const BULK_TEXT = (v: unknown, max: number) =>
  typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '';
// Control chars and U+FFFD (the replacement char produced by decoding binary
// as text) never belong in a name.
const BULK_GARBAGE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/;

function sanitiseBulkLeadRow(raw: any): { row: any; error?: string } {
  if (!raw || typeof raw !== 'object') return { row: raw, error: 'Row is not an object' };
  // A blank name is never worth losing a lead over — default to "Unknown"
  // rather than rejecting the row, same as the frontend's own file parser.
  // Phone stays mandatory: a name with no contactable number isn't usable.
  const customer_name = BULK_TEXT(raw.customer_name, 120) || 'Unknown';
  let phone = BULK_TEXT(raw.phone, 20).replace(/\.0+$/, '').replace(/\D/g, '');
  if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
  if (phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1);

  if (!phone) {
    return { row: raw, error: 'Missing required field: phone' };
  }
  if (BULK_GARBAGE.test(customer_name)) {
    return {
      row: raw,
      error: 'customer_name contains unreadable characters (is the file really a CSV/XLSX?)',
    };
  }
  if (!/^\d{10}$/.test(phone)) {
    return { row: raw, error: `Invalid phone "${BULK_TEXT(raw.phone, 20)}" (expected 10 digits)` };
  }
  const email = BULK_TEXT(raw.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { row: raw, error: `Invalid email "${email}"` };
  }
  return {
    row: {
      ...raw,
      customer_name,
      phone,
      email: email || null,
      property_type: BULK_TEXT(raw.property_type, 60) || null,
      location: BULK_TEXT(raw.location, 120) || null,
      notes: BULK_TEXT(raw.notes, 2000) || null,
      source: BULK_TEXT(raw.source, 40) || null,
    },
  };
}

export async function bulkUploadLeads(user: TokenPayload, rawLeads: any[], assignToSelf = false) {
  // Phase 2.13: previously unbounded — a CSV/Excel import of any size ran
  // fully inline within one HTTP request (chunked only for the DB writes,
  // not for the request's own duration/memory footprint). Capped at 1000
  // rows, the upper end of the plan's suggested 500-1000 range — generous
  // enough for a real marketing-list import, small enough to keep one
  // request bounded. Matches the same class of cap already applied to
  // bulk property-unit creation (2.19's 500-unit limit).
  const MAX_BATCH_SIZE = 1000;
  if (rawLeads.length > MAX_BATCH_SIZE) {
    throw new AppError(
      400,
      `Cannot upload more than ${MAX_BATCH_SIZE} leads in a single request (received ${rawLeads.length}). Split into multiple batches.`,
    );
  }

  const results = {
    total_rows: rawLeads.length,
    successful_imports: 0,
    duplicates: 0,
    failed_rows: 0,
    errors: [] as any[],
  };

  const sanitised = rawLeads.map(sanitiseBulkLeadRow);

  // Pre-fetch existing phones and emails to detect duplicates efficiently
  const phones = sanitised.filter((r) => !r.error).map((r) => r.row.phone);
  const emails = sanitised.filter((r) => !r.error && r.row.email).map((r) => r.row.email);

  const existingLeads = await p.lead.findMany({
    where: {
      company_id: user.companyId,
      OR: [
        ...(phones.length > 0 ? [{ phone: { in: phones } }] : []),
        ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
      ],
    },
    select: { id: true, phone: true, email: true, status: true },
  });

  const existingPhonesMap = new Map();
  const existingEmailsMap = new Map();
  for (const e of existingLeads) {
    if (e.phone) existingPhonesMap.set(e.phone, e);
    if (e.email) existingEmailsMap.set(e.email, e);
  }

  // Chunking to prevent holding transaction too long
  const CHUNK_SIZE = 50;
  let currentRow = 0;

  for (let i = 0; i < sanitised.length; i += CHUNK_SIZE) {
    const chunk = sanitised.slice(i, i + CHUNK_SIZE);

    for (const { row: item, error: rowError } of chunk) {
      currentRow++;
      try {
        if (rowError) {
          results.failed_rows++;
          results.errors.push({ row: currentRow, reason: rowError });
          continue;
        }

        const existingLead =
          existingPhonesMap.get(item.phone) ||
          (item.email ? existingEmailsMap.get(item.email) : undefined);
        if (existingLead) {
          if (existingLead.status === 'DROPPED') {
            await updateLeadStatus(user, existingLead.id, 'RECOVERED_TO_POOL');
            results.successful_imports++;
          } else {
            results.duplicates++;
            const duplicateReason = existingPhonesMap.has(item.phone)
              ? `Duplicate phone number: ${item.phone}`
              : `Duplicate email: ${item.email}`;
            results.errors.push({ row: currentRow, reason: duplicateReason });
          }
          continue;
        }

        await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
          const leadCode = await generateNextLeadCode(); // Inside transaction to ensure unique code sequentially

          // DIRECT: skip the distribution engine entirely and keep the lead
          // with the person who uploaded it (mirrors createLead's DIRECT
          // path) — POOL (default): existing performance-weighted behavior.
          const bestAssignee = assignToSelf ? null : await findBestAssigneeForLead(user.companyId);
          const assignedToId = assignToSelf ? user.employeeId : bestAssignee?.employeeId || null;
          const assignmentType = assignToSelf
            ? 'MANUAL_OVERRIDE'
            : bestAssignee
              ? 'PERFORMANCE_WEIGHTED'
              : null;

          const newLead = await tx.lead.create({
            data: {
              lead_code: leadCode,
              company_id: user.companyId,
              branch_id: user.branchId || null,
              customer_name: item.customer_name,
              phone: item.phone,
              email: item.email || null,
              source: item.source || 'BULK_UPLOAD',
              status: assignedToId ? 'ASSIGNED' : 'NEW',
              assigned_to_id: assignedToId,
              assigned_at: assignedToId ? new Date() : null,
              assignment_type: assignmentType,
              property_type_preference: item.property_type || null,
              preferred_location: item.location || null,
              notes: item.notes || 'Imported via Bulk Upload',
              created_by_id: user.employeeId,
              utm_source: item.utm_source || null,
              utm_medium: item.utm_medium || null,
              utm_campaign: item.utm_campaign || null,
            },
          });

          await tx.leadActivity.create({
            data: {
              lead_id: newLead.id,
              actor_id: user.employeeId,
              activity_type: 'LEAD_CREATED',
              notes: `Bulk Upload Lead ${newLead.lead_code} created by Digital Lead Operator`,
            },
          });

          if (assignToSelf) {
            await tx.leadActivity.create({
              data: {
                lead_id: newLead.id,
                actor_id: user.employeeId,
                activity_type: 'ASSIGNED_TO_AGENT',
                notes: `Kept with uploader (${user.employeeId}) — Assign to Me selected for this import.`,
              },
            });
          } else if (bestAssignee) {
            await tx.leadActivity.create({
              data: {
                lead_id: newLead.id,
                actor_id: user.employeeId,
                activity_type: 'ASSIGNED_TO_AGENT',
                notes: `Weighted Auto-Distribution to ${bestAssignee.name} (${bestAssignee.employeeCode})`,
              },
            });
          }
        });

        // Only add to Map if successfully inserted
        existingPhonesMap.set(item.phone, { id: 0, phone: item.phone, status: 'NEW' });
        if (item.email) {
          existingEmailsMap.set(item.email, { id: 0, email: item.email, status: 'NEW' });
        }
        results.successful_imports++;
      } catch (error: any) {
        results.failed_rows++;
        results.errors.push({
          row: currentRow,
          reason: error.message || 'Database error during insertion',
        });
      }
    }
  }

  return results;
}
