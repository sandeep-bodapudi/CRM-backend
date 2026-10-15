import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { Roles, Permissions } from '../../shared';
import { can } from '../../authz/authorization';
import { WorkflowEngine } from '../../workflows/workflowEngine';
import { WorkflowDomain } from '../../workflows/types';
import { SiteVisitPolicy } from '../../policies/siteVisit.policy';
import { applyTransition } from './shared';
import { createFeedbackRequest, dispatchFeedbackRequestNotification } from '../feedback.service';
import { notifyEmployee } from '../../utils/notifyEmployee';
import { logger } from '../../utils/logger';
import { getISTComponents } from '../../utils/time';
const p = prisma;

/** accept: PM/Agent accepts the routed visit. */
export async function acceptVisit(user: TokenPayload, visitId: number, notes?: string) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true },
  });
  if (!visit) throw { status: 404, message: 'Site visit booking not found' };
  if (!can(user, Permissions.SITE_VISITS_ACCEPT, visit)) {
    throw { status: 403, message: 'Forbidden: Missing permission to accept site visits' };
  }
  if (!SiteVisitPolicy.canAccept(user, visit)) {
    throw { status: 403, message: 'Forbidden: only the routed PM/Agent may accept this visit' };
  }

  return applyTransition(
    user,
    visitId,
    'ACCEPT',
    { project_manager_id: user.employeeId },
    'SITE_VISIT_ACCEPTED',
    `Site visit ${visit.booking_code} accepted by ${user.employeeId}.${notes ? ` Notes: ${notes}` : ''}`,
  );
}

/** reassign: open chain during initial acceptance — logged to SiteVisitReassignment, resets to PENDING_ACCEPTANCE. */
export async function reassignVisit(
  user: TokenPayload,
  visitId: number,
  toEmployeeId: number,
  reason: string,
) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true },
  });
  if (!visit) throw { status: 404, message: 'Site visit booking not found' };

  const targetWithRoles = await p.employee.findFirst({
    where: { id: toEmployeeId },
    include: { roles: { include: { role: true } } },
  });
  if (!targetWithRoles) throw { status: 404, message: 'Target employee not found' };
  const target = {
    ...targetWithRoles,
    roles: (targetWithRoles.roles || []).map((er: any) => er.role?.name).filter(Boolean),
  };
  if (!SiteVisitPolicy.canReassignTarget(user, target)) {
    throw {
      status: 403,
      message: 'Forbidden: only PROJECT_MANAGER or AGENT may be reassignment targets',
    };
  }

  // Ping-pong prevention: Cannot route to someone who has already routed it away.
  const previousReassignment = await p.siteVisitReassignment.findFirst({
    where: {
      visit_id: visitId,
      from_employee_id: toEmployeeId,
    },
  });
  if (previousReassignment) {
    throw {
      status: 409,
      message: 'Cannot route to this employee. They have already declined or routed this visit.',
    };
  }

  const transition = WorkflowEngine.canTransition({
    domain: WorkflowDomain.SITE_VISIT,
    currentState: visit.status,
    action: 'REASSIGN',
    actor: user,
    entity: visit,
  });
  if (!transition.allowed) {
    throw { status: 409, message: transition.reason || 'Invalid state transition' };
  }

  return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
    // Log the reassignment hop (reason visibility restricted per §2).
    await tx.siteVisitReassignment.create({
      data: {
        visit_id: visitId,
        from_employee_id: visit.project_manager_id ?? user.employeeId,
        to_employee_id: toEmployeeId,
        reason,
      },
    });

    const updated = await tx.siteVisitBooking.update({
      where: { id: visitId },
      data: { status: 'PENDING_ACCEPTANCE', project_manager_id: toEmployeeId },
    });

    await tx.leadActivity.create({
      data: {
        lead: { connect: { id: visit.lead_id } },
        actor: { connect: { id: user.employeeId } },
        activity_type: 'SITE_VISIT_REASSIGNED',
        notes: `Site visit ${visit.booking_code} reassigned to ${target.full_name || target.employee_code}. Reason: ${reason}`,
      },
    });

    await tx.notification.create({
      data: {
        employee_id: toEmployeeId,
        type: 'TARGET_ASSIGNED',
        title: 'Site Visit Reassigned to You',
        message: `Site visit ${visit.booking_code} has been reassigned to you for acceptance.`,
      },
    });
    // Web push to reassigned employee (outside transaction)
    notifyEmployee(
      toEmployeeId,
      {
        type: 'TARGET_ASSIGNED',
        title: 'Site Visit Reassigned to You',
        message: `Site visit ${visit.booking_code} has been reassigned to you for acceptance.`,
      },
      { skipDbNotification: true },
    ).catch((err) => logger.error('[WebPush] Site visit reassign:', err));

    return updated;
  });
}

/** escalate: no PM/Agent available → Marketing Director for manual resolution. */
export async function escalateVisit(user: TokenPayload, visitId: number, reason: string) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true },
  });
  if (!visit) throw { status: 404, message: 'Site visit booking not found' };

  const transition = WorkflowEngine.canTransition({
    domain: WorkflowDomain.SITE_VISIT,
    currentState: visit.status,
    action: 'ESCALATE',
    actor: user,
    entity: visit,
  });
  if (!transition.allowed) {
    throw { status: 409, message: transition.reason || 'Invalid state transition' };
  }

  return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
    const md = await tx.employee.findFirst({
      where: { roles: { some: { role: { name: Roles.MARKETING_DIRECTOR } } } },
    });

    const updated = await tx.siteVisitBooking.update({
      where: { id: visitId },
      data: { status: 'ESCALATED_TO_MARKETING_DIRECTOR' },
    });

    await tx.leadActivity.create({
      data: {
        lead: { connect: { id: visit.lead_id } },
        actor: { connect: { id: user.employeeId } },
        activity_type: 'SITE_VISIT_ESCALATED',
        notes: `Site visit ${visit.booking_code} escalated to Marketing Director. Reason: ${reason}`,
      },
    });

    if (md) {
      await tx.notification.create({
        data: {
          employee_id: md.id,
          type: 'SYSTEM_ALERT',
          title: 'Site Visit Escalated',
          message: `Site visit ${visit.booking_code} could not be assigned to a PM/Agent. Reason: ${reason}`,
        },
      });
      // Web push to Marketing Director (outside transaction)
      notifyEmployee(
        md.id,
        {
          type: 'SYSTEM_ALERT',
          title: 'Site Visit Escalated',
          message: `Site visit ${visit.booking_code} escalated — no PM/Agent available.`,
        },
        { skipDbNotification: true },
      ).catch((err) => logger.error('[WebPush] Site visit escalate:', err));
    }

    return updated;
  });
}

/** Telecaller triggers day-before reconfirmation call. */
export async function reconfirmCustomer(user: TokenPayload, visitId: number) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true },
  });
  if (!visit) throw { status: 404, message: 'Site visit booking not found' };
  if (!can(user, Permissions.SITE_VISITS_VERIFY, visit)) {
    throw { status: 403, message: 'Forbidden: Missing site_visits.verify permission' };
  }
  return applyTransition(
    user,
    visitId,
    'RECONFIRM_CUSTOMER',
    {},
    'SITE_VISIT_REQUESTED',
    `Day-before reconfirmation call initiated for ${visit.booking_code}.`,
  );
}

/** Customer requests reschedule (new date/property/unit). */
export async function rescheduleVisit(
  user: TokenPayload,
  visitId: number,
  data: { scheduled_date?: string; property_ids?: number[]; project_unit_ids?: number[] },
) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true },
  });
  if (!visit) throw { status: 404, message: 'Site visit booking not found' };
  if (!can(user, Permissions.SITE_VISITS_VERIFY, visit)) {
    throw { status: 403, message: 'Forbidden: Missing site_visits.verify permission' };
  }

  // Phase D: If superseding a cancellation, notify the PM.
  if (visit.status === 'CANCELLATION_PENDING_PM_CONFIRMATION' && visit.project_manager_id) {
    await p.notification.create({
      data: {
        employee_id: visit.project_manager_id,
        type: 'SYSTEM_ALERT',
        title: 'Cancellation Superseded',
        message: `The cancellation for site visit ${visit.booking_code} was superseded by a reschedule request.`,
      },
    });
  }

  const extra: any = {};
  if (data.scheduled_date) extra.scheduled_date = new Date(data.scheduled_date);
  const hasPropertyIds = !!data.property_ids?.length;
  const hasUnitIds = !!data.project_unit_ids?.length;
  if (hasPropertyIds || hasUnitIds) {
    // Replace property/unit links entirely — a reschedule that changes the
    // item swaps it out rather than accumulating old + new links.
    await p.siteVisitProperty.deleteMany({ where: { visit_id: visitId } });
    await p.siteVisitProperty.createMany({
      data: [
        ...(data.property_ids ?? []).map((pid: number) => ({
          visit_id: visitId,
          property_id: pid,
        })),
        ...(data.project_unit_ids ?? []).map((uid: number) => ({
          visit_id: visitId,
          project_unit_id: uid,
        })),
      ],
    });
    if (hasPropertyIds) {
      extra.property_id = data.property_ids![0];
      extra.project_unit_id = null;
    } else {
      extra.project_unit_id = data.project_unit_ids![0];
      extra.property_id = null;
    }
  }

  return applyTransition(
    user,
    visitId,
    'RESCHEDULE',
    extra,
    'SITE_VISIT_RESCHEDULE_REQUESTED',
    `Reschedule requested for ${visit.booking_code}.`,
  );
}

/** PM confirms or releases after a reschedule (PENDING_PM_RECONFIRMATION). */
export async function pmReconfirm(user: TokenPayload, visitId: number, release: boolean) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true },
  });
  if (!visit) throw { status: 404, message: 'Site visit booking not found' };
  if (!SiteVisitPolicy.canAccept(user, visit)) {
    throw { status: 403, message: 'Forbidden: only the PM may reconfirm this visit' };
  }

  if (release) {
    // Reset to the authoritative project PM for the (possibly new) property.
    const props = await p.siteVisitProperty.findMany({
      where: { visit_id: visitId },
      include: { property: true },
    });
    const projectId = props[0]?.property?.project_id ?? visit.project_id;
    const project = projectId ? await p.project.findFirst({ where: { id: projectId } }) : null;
    const authoritativePm = project?.assigned_pm_id ?? null;

    const transition = WorkflowEngine.canTransition({
      domain: WorkflowDomain.SITE_VISIT,
      currentState: visit.status,
      action: 'PM_RELEASE',
      actor: user,
      entity: visit,
    });
    if (!transition.allowed)
      throw { status: 409, message: transition.reason || 'Invalid state transition' };

    return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      const updated = await tx.siteVisitBooking.update({
        where: { id: visitId },
        data: { status: 'PENDING_ACCEPTANCE', project_manager_id: authoritativePm ?? undefined },
      });
      await tx.leadActivity.create({
        data: {
          lead: { connect: { id: visit.lead_id } },
          actor: { connect: { id: user.employeeId } },
          activity_type: 'SITE_VISIT_RESCHEDULE_REQUESTED',
          notes: `PM released reschedule for ${visit.booking_code}; reset to project PM for acceptance.`,
        },
      });
      return updated;
    });
  }

  return applyTransition(
    user,
    visitId,
    'PM_CONFIRM',
    {},
    'SITE_VISIT_ACCEPTED',
    `PM confirmed reschedule for ${visit.booking_code}.`,
  );
}

/** confirm: PENDING_CUSTOMER_RECONFIRMATION / RESCHEDULE_REQUESTED → CONFIRMED. */
export async function confirmVisit(user: TokenPayload, visitId: number) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true },
  });
  if (!visit) throw { status: 404, message: 'Site visit booking not found' };
  if (!can(user, Permissions.SITE_VISITS_VERIFY, visit)) {
    throw { status: 403, message: 'Forbidden: Missing site_visits.verify permission' };
  }
  return applyTransition(
    user,
    visitId,
    'CONFIRM',
    {},
    'SITE_VISIT_ACCEPTED',
    `Site visit ${visit.booking_code} confirmed (schedule locked).`,
  );
}

/** Statuses in which the PM may still choose who runs the visit. */
const AGENT_ASSIGNABLE_STATUSES = ['ACCEPTED', 'PENDING_CUSTOMER_RECONFIRMATION', 'CONFIRMED'];

/**
 * assign-agent: the visit's PM (or MD/Admin) names who physically runs an
 * accepted visit -- another PM/Agent, or themselves (`self`). Until this
 * existed assigned_agent_id was never set, so nobody but MD/Admin could start
 * or complete a visit.
 */
export async function assignAgent(
  user: TokenPayload,
  visitId: number,
  input: { agent_id?: number; self?: boolean; notes?: string },
) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true },
  });
  if (!visit) throw { status: 404, message: 'Site visit booking not found' };

  const agentId = input.self ? user.employeeId : input.agent_id!;
  const agentRow = await p.employee.findFirst({
    where: { id: agentId },
    include: { roles: { include: { role: true } } },
  });
  if (!agentRow || agentRow.status !== 'ACTIVE') {
    throw { status: 404, message: 'That employee was not found or is not active' };
  }

  if (!SiteVisitPolicy.canAssignAgent(user, visit, agentRow)) {
    throw { status: 403, message: 'Forbidden: you cannot assign an agent to this visit' };
  }
  if (!SiteVisitPolicy.canAssignAgentToVisit(user, visit)) {
    throw { status: 403, message: "Forbidden: only this visit's PM can choose who runs it" };
  }
  const agentRoles = (agentRow.roles || []).map((er: any) => er.role?.name).filter(Boolean);
  if (!SiteVisitPolicy.canReassignTarget(user, { id: agentRow.id, roles: agentRoles })) {
    throw { status: 400, message: 'Only a Project Manager or Agent can run a site visit' };
  }
  if (!AGENT_ASSIGNABLE_STATUSES.includes(visit.status)) {
    throw {
      status: 409,
      message: `The visit is ${visit.status}; an agent can only be chosen once it is accepted and before it starts.`,
    };
  }

  const label = agentRow.full_name || agentRow.employee_code;
  const updated = await p.$transaction(
    async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      const row = await tx.siteVisitBooking.update({
        where: { id: visitId },
        data: { assigned_agent_id: agentId },
        include: { lead: true },
      });
      await tx.leadActivity.create({
        data: {
          lead: { connect: { id: visit.lead_id } },
          actor: { connect: { id: user.employeeId } },
          activity_type: 'SITE_VISIT_AGENT_ASSIGNED',
          notes: `Site visit ${visit.booking_code} will be run by ${label}${agentId === user.employeeId ? ' (the PM themselves)' : ''}.${input.notes ? ` Instructions: ${input.notes}` : ''}`,
        },
      });
      await tx.auditEvent.create({
        data: {
          actor_id: user.employeeId,
          action: 'SITE_VISIT_AGENT_ASSIGNED',
          entity_type: 'SITE_VISIT',
          entity_id: visitId,
          old_value: JSON.stringify({ assigned_agent_id: visit.assigned_agent_id }),
          new_value: JSON.stringify({ assigned_agent_id: agentId }),
        },
      });
      if (agentId !== user.employeeId) {
        await tx.notification.create({
          data: {
            employee_id: agentId,
            type: 'TARGET_ASSIGNED',
            title: 'Site Visit Assigned to You',
            message: `You will run site visit ${visit.booking_code}.`,
          },
        });
      }
      return row;
    },
  );

  if (agentId !== user.employeeId) {
    notifyEmployee(
      agentId,
      {
        type: 'TARGET_ASSIGNED',
        title: 'Site Visit Assigned to You',
        message: `You will run site visit ${visit.booking_code}.`,
      },
      { skipDbNotification: true },
    ).catch((err) => logger.error('[WebPush] Site visit assign-agent:', err));
  }
  return updated;
}

/** start: CONFIRMED → ACTIVE (day-of). */
export async function startVisit(user: TokenPayload, visitId: number) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true },
  });
  if (!visit) throw { status: 404, message: 'Site visit booking not found' };
  if (!can(user, Permissions.SITE_VISITS_COMPLETE, visit)) {
    throw { status: 403, message: 'Forbidden: Missing site_visits.complete permission' };
  }
  // A visit can't be started before its scheduled (IST) day; MD/Admin may
  // override for genuine early starts.
  if (!user.roles.includes(Roles.MD) && !user.roles.includes(Roles.ADMIN)) {
    const today = getISTComponents(new Date()).dateString;
    const scheduledDay = getISTComponents(visit.scheduled_date).dateString;
    if (today < scheduledDay) {
      throw {
        status: 409,
        message: `This visit is scheduled for ${scheduledDay}; it can't be started before that day.`,
      };
    }
  }
  return applyTransition(
    user,
    visitId,
    'START',
    {},
    'SITE_VISIT_COMPLETED',
    `Site visit ${visit.booking_code} is now ACTIVE (in progress).`,
  );
}

/** complete: ACTIVE → COMPLETED, capturing per-property outcomes (multi-property §2). */
export async function completeVisit(
  user: TokenPayload,
  visitId: number,
  outcomes: any[],
  feedback_notes?: string,
  proof_photo_url?: string,
  rating?: string,
) {
  const visit = await p.siteVisitBooking.findFirst({
    where: { id: visitId, lead: {} },
    include: { lead: true, site_visit_properties: true },
  });
  if (!visit) throw { status: 404, message: 'Site visit booking not found' };
  if (!can(user, Permissions.SITE_VISITS_COMPLETE, visit)) {
    throw { status: 403, message: 'Forbidden: Missing site_visits.complete permission' };
  }

  // Validate outcomes: every linked property/unit must have an outcome, with
  // reason if NOT_INTERESTED.
  const linkedProperties = visit.site_visit_properties
    .map((sp: any) => sp.property_id)
    .filter((id: number | null): id is number => id != null);
  const linkedUnits = visit.site_visit_properties
    .map((sp: any) => sp.project_unit_id)
    .filter((id: number | null): id is number => id != null);
  const providedProperties = new Set(
    outcomes.filter((o: any) => o.property_id != null).map((o: any) => o.property_id),
  );
  const providedUnits = new Set(
    outcomes.filter((o: any) => o.project_unit_id != null).map((o: any) => o.project_unit_id),
  );
  for (const pid of linkedProperties) {
    if (!providedProperties.has(pid)) {
      throw {
        status: 400,
        message: `Outcome required for every linked property. Missing property ${pid}.`,
      };
    }
  }
  for (const uid of linkedUnits) {
    if (!providedUnits.has(uid)) {
      throw {
        status: 400,
        message: `Outcome required for every linked unit. Missing unit ${uid}.`,
      };
    }
  }
  for (const o of outcomes) {
    if (o.outcome === 'NOT_INTERESTED' && (!o.outcome_reason || o.outcome_reason.trim() === '')) {
      throw { status: 400, message: 'outcome_reason is required when outcome is NOT_INTERESTED.' };
    }
  }

  // Project-based visits link no unit up front: the PM records the units the
  // customer liked afterwards. Those units must belong to this visit's project.
  const extraUnitIds = [...providedUnits].filter((id) => !linkedUnits.includes(id as number));
  if (extraUnitIds.length > 0) {
    const projectId = (visit as any).project_id as number | null;
    const found = projectId
      ? await p.projectUnit.count({
          where: {
            id: { in: extraUnitIds as number[] },
            project_id: projectId,
            company_id: visit.lead.company_id,
          },
        })
      : 0;
    if (found !== extraUnitIds.length) {
      throw {
        status: 400,
        message: "Every unit the customer liked must belong to this visit's project.",
      };
    }
  }

  const transition = WorkflowEngine.canTransition({
    domain: WorkflowDomain.SITE_VISIT,
    currentState: visit.status,
    action: 'COMPLETE',
    actor: user,
    entity: visit,
  });
  if (!transition.allowed) {
    throw { status: 409, message: transition.reason || 'Invalid state transition' };
  }

  const anyInterested = outcomes.some((o: any) => o.outcome === 'INTERESTED');
  // Array.prototype.every() is vacuously true on an empty array — guard
  // against that so a visit with no linked properties (outcomes: []) isn't
  // misreported as "all not interested".
  // A project visit with no unit picked and a "not interested" rating is a
  // drop, not a Negotiation on an estimate.
  const allNotInterested =
    (outcomes.length > 0 && outcomes.every((o: any) => o.outcome === 'NOT_INTERESTED')) ||
    (outcomes.length === 0 && rating === 'NOT_INTERESTED');

  const result = await p.$transaction(
    async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      // Persist outcomes. A compound-unique lookup needs a real (non-null)
      // value for both halves of the key, so property vs. unit outcomes go
      // through different unique keys — same reasoning as
      // LeadPropertyInterest's lead_id_property_id / lead_id_project_unit_id split.
      for (const o of outcomes) {
        if (o.property_id != null) {
          await tx.siteVisitProperty.upsert({
            where: { visit_id_property_id: { visit_id: visitId, property_id: o.property_id } },
            update: { outcome: o.outcome, outcome_reason: o.outcome_reason ?? null },
            create: {
              visit_id: visitId,
              property_id: o.property_id,
              outcome: o.outcome,
              outcome_reason: o.outcome_reason ?? null,
            },
          });
        } else {
          await tx.siteVisitProperty.upsert({
            where: {
              visit_id_project_unit_id: { visit_id: visitId, project_unit_id: o.project_unit_id },
            },
            update: { outcome: o.outcome, outcome_reason: o.outcome_reason ?? null },
            create: {
              visit_id: visitId,
              project_unit_id: o.project_unit_id,
              outcome: o.outcome,
              outcome_reason: o.outcome_reason ?? null,
            },
          });
        }
      }

      const updated = await tx.siteVisitBooking.update({
        where: { id: visitId },
        data: {
          status: 'COMPLETED',
          feedback_notes,
          proof_photo_url: proof_photo_url || null,
          rating: rating || null,
          completed_at: new Date(),
        },
      });

      await tx.leadActivity.create({
        data: {
          lead: { connect: { id: visit.lead_id } },
          actor: { connect: { id: user.employeeId } },
          activity_type: 'SITE_VISIT_COMPLETED',
          notes: `Site Visit Completed! ${outcomes.length} property outcome(s) recorded.`,
        },
      });

      // §1: SITE_VISIT_COMPLETED → NEGOTIATION (any INTERESTED) or DROPPED (all NOT_INTERESTED).
      // The Lead status move is driven by the lead workflow; the service that
      // owns the lead transition will enforce it. Here we record the outcome
      // branch so the caller (route) can advance the Lead accordingly.
      (updated as any)._outcomeBranch = allNotInterested
        ? 'DROP'
        : anyInterested
          ? 'NEGOTIATE'
          : 'NEGOTIATE';

      // § Phase 7 — a completed visit always has someone who actually ran it
      // (agent takes priority over PM when both are set, matching how the
      // notification below picks a name); only request feedback when there
      // is genuinely someone to rate.
      const ratedEmployeeId = visit.assigned_agent_id || visit.project_manager_id;
      if (ratedEmployeeId) {
        (updated as any)._feedbackToken = await createFeedbackRequest(tx, visitId, ratedEmployeeId);
      }

      return updated;
    },
  );

  // Outside the transaction (this I/O must never roll back the visit
  // completion itself), but still awaited: dispatchFeedbackRequestNotification
  // catches its own errors internally, so awaiting it costs a little
  // latency without risking the request path — and avoids an unhandled,
  // untracked background promise outliving the request.
  if ((result as any)._feedbackToken) {
    await dispatchFeedbackRequestNotification(visitId, (result as any)._feedbackToken);
  }

  return result;
}
