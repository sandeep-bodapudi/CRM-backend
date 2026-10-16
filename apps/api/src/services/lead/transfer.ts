import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { Roles, Permissions } from '../../shared';
import { buildLeadScope } from '../../authz/dataScope';
import { WorkflowEngine } from '../../workflows/workflowEngine';
import { notifyEmployee } from '../../utils/notifyEmployee';
import { logger } from '../../utils/logger';
import { AppError } from './errors';
import { CALL_BACK_TITLE_PREFIX } from './callBacks';

const p = prisma;

/** A person handing over this many leads in 24 hours triggers a heads-up to the MD. */
const TRANSFER_ALERT_THRESHOLD = 10;

const isManagement = (user: TokenPayload) =>
  user.roles.some((r) =>
    [Roles.MD, Roles.ADMIN, Roles.HR_MANAGER, Roles.MARKETING_DIRECTOR].includes(r as any),
  );

/**
 * Hand a lead to a colleague.
 *
 * Who: the lead's current owner, or management. Why it is more than a reassign:
 * the lead record moves, but so must everything that hangs off the owner --
 * their open call-back tasks, the opportunity's owner and the telecaller on
 * visits that have not happened yet -- otherwise the previous owner keeps
 * getting reminders (and overdue marks) for a lead that is no longer theirs.
 * Every transfer needs a reason, is written to the audit log, and tells both
 * people. A lead being booked or already booked/dropped is not transferable by
 * its owner (management may still do it for BOOKING_INITIATED).
 */
export async function transferLead(
  user: TokenPayload,
  leadId: number,
  toEmployeeId: number,
  reason: string,
) {
  const trimmedReason = (reason || '').trim();
  if (trimmedReason.length < 3) throw new AppError(400, 'Say why the lead is being transferred');

  const scope = await buildLeadScope(user);
  const lead = await p.lead.findFirst({ where: { id: leadId, ...scope } });
  if (!lead) throw new AppError(404, 'Lead not found');

  const management = isManagement(user);
  const isOwner = lead.assigned_to_id === user.employeeId;
  if (!isOwner && !management) {
    throw new AppError(403, 'Only the person who owns this lead (or management) can transfer it');
  }
  if (lead.status === 'BOOKED' || lead.status === 'DROPPED') {
    throw new AppError(409, `A ${lead.status.toLowerCase()} lead cannot be transferred`);
  }
  if (lead.status === 'BOOKING_INITIATED' && !management) {
    throw new AppError(
      409,
      'A lead with a booking in progress can only be transferred by management',
    );
  }
  if (toEmployeeId === lead.assigned_to_id) {
    throw new AppError(400, 'The lead already belongs to that person');
  }

  const target = await p.employee.findFirst({
    where: {
      id: toEmployeeId,
      company_id: lead.company_id,
      status: 'ACTIVE',
      deleted_at: null,
      roles: {
        some: {
          role: { permissions: { some: { permission: { name: Permissions.LEADS_UPDATE } } } },
        },
      },
    },
    select: { id: true, full_name: true, employee_code: true },
  });
  if (!target) {
    throw new AppError(
      400,
      'That colleague cannot take leads (not active, or their role cannot work leads).',
    );
  }
  const targetName = target.full_name || target.employee_code;

  const previousOwnerId = lead.assigned_to_id;
  const previousOwner = previousOwnerId
    ? await p.employee.findUnique({
        where: { id: previousOwnerId },
        select: { full_name: true, employee_code: true },
      })
    : null;
  const previousName = previousOwner?.full_name || previousOwner?.employee_code || 'the pool';

  const updated = await p.$transaction(async (tx) => {
    let movedCallBacks = 0;
    let movedOpportunities = 0;
    let movedVisits = 0;

    if (previousOwnerId) {
      // Move (not cancel) the previous owner's open call-backs: the customer
      // still expects that call, from the new owner.
      movedCallBacks = (
        await tx.task.updateMany({
          where: {
            lead_id: leadId,
            assignee_id: previousOwnerId,
            title: { startsWith: CALL_BACK_TITLE_PREFIX },
            status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
          },
          data: { assignee_id: target.id },
        })
      ).count;
      movedOpportunities = (
        await tx.opportunity.updateMany({
          where: { lead_id: leadId, owner_id: previousOwnerId },
          data: { owner_id: target.id },
        })
      ).count;
      movedVisits = (
        await tx.siteVisitBooking.updateMany({
          where: {
            lead_id: leadId,
            telecaller_id: previousOwnerId,
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
          data: { telecaller_id: target.id },
        })
      ).count;
    }

    const row = await WorkflowEngine.transitionLead(
      tx,
      leadId,
      lead.status === 'NEW' ? 'ASSIGNED' : lead.status,
      { actor: user, entity: lead },
      {
        assigned_to_id: target.id,
        assigned_at: new Date(),
        assignment_type: 'MANUAL_OVERRIDE',
      },
    );

    await tx.leadActivity.create({
      data: {
        lead_id: leadId,
        actor_id: user.employeeId,
        activity_type: 'ASSIGNED_TO_AGENT',
        notes: `Transferred from ${previousName} to ${targetName}. Reason: ${trimmedReason}`,
      },
    });
    await tx.auditEvent.create({
      data: {
        actor_id: user.employeeId,
        action: 'LEAD_TRANSFERRED',
        entity_type: 'LEAD',
        entity_id: leadId,
        old_value: JSON.stringify({ assigned_to_id: previousOwnerId }),
        new_value: JSON.stringify({
          assigned_to_id: target.id,
          reason: trimmedReason,
          moved: {
            call_backs: movedCallBacks,
            opportunities: movedOpportunities,
            visits: movedVisits,
          },
        }),
      },
    });
    return row;
  });

  // Tell both people (outside the transaction; a failed notification must not undo the transfer).
  const note = (employeeId: number, title: string, message: string) =>
    notifyEmployee(employeeId, {
      type: 'TARGET_ASSIGNED',
      title,
      message,
      link: `/leads/${leadId}`,
    }).catch((e) => logger.error('[transfer] notify failed:', e));
  await note(
    target.id,
    'A lead was transferred to you',
    `${lead.customer_name} (${lead.lead_code}) now belongs to you. Reason: ${trimmedReason}`,
  );
  if (previousOwnerId && previousOwnerId !== user.employeeId) {
    await note(
      previousOwnerId,
      'A lead was moved away from you',
      `${lead.customer_name} (${lead.lead_code}) was transferred to ${targetName}.`,
    );
  }

  // Poaching tripwire: one person handing over a lot of leads in a day.
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const count = await p.auditEvent.count({
      where: { actor_id: user.employeeId, action: 'LEAD_TRANSFERRED', created_at: { gte: since } },
    });
    if (count === TRANSFER_ALERT_THRESHOLD) {
      const mds = await p.employee.findMany({
        where: {
          company_id: lead.company_id,
          status: 'ACTIVE',
          roles: { some: { role: { name: Roles.MD } } },
        },
        select: { id: true },
      });
      for (const md of mds) {
        await note(
          md.id,
          'Many lead transfers by one person',
          `${count} leads were transferred by the same person in the last 24 hours. Worth a look.`,
        );
      }
    }
  } catch (e) {
    logger.error('[transfer] tripwire failed:', e);
  }

  return updated;
}
