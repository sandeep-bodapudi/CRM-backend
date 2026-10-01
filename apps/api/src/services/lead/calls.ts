import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { can } from '../../authz/authorization';
import { buildLeadScope } from '../../authz/dataScope';
import { Permissions } from '../../shared';
import { AppError } from './errors';
import { updateLeadStatus } from './status';

const p = prisma;

export const CALL_OUTCOMES = {
  CONNECTED_INTERESTED: 'Connected — interested',
  CONNECTED_NOT_INTERESTED: 'Connected — not interested',
  CALL_BACK: 'Asked to call back',
  NO_ANSWER: 'No answer',
  BUSY_OR_SWITCHED_OFF: 'Busy / switched off',
  WRONG_NUMBER: 'Wrong number',
} as const;
export type CallOutcome = keyof typeof CALL_OUTCOMES;

const CONNECTED: CallOutcome[] = ['CONNECTED_INTERESTED', 'CONNECTED_NOT_INTERESTED', 'CALL_BACK'];

/**
 * Records one call attempt on a lead.
 *
 * Until now the "Call" button only opened the phone dialer and nothing was
 * stored — in production no call had ever been logged, every "Contacted" was
 * a one-tap button with no outcome, and the MD had no way to see what a
 * telecaller actually did. A call now leaves a CALL_LOGGED activity with its
 * outcome (which also makes the existing "5 days of call attempts before
 * dropping as unreachable" rule satisfiable for the first time), moves a
 * freshly assigned lead to CONTACTED when someone actually picked up, and a
 * requested call-back becomes a dated follow-up task on the telecaller's
 * own task list.
 */
export async function logCall(
  user: TokenPayload,
  leadId: number,
  input: { outcome: CallOutcome; notes?: string; follow_up_at?: string },
) {
  const scope = await buildLeadScope(user);
  const lead = await p.lead.findFirst({ where: { id: leadId, ...scope } });
  if (!lead) throw new AppError(404, 'Lead not found');
  if (!can(user, Permissions.LEADS_UPDATE, lead)) {
    throw new AppError(403, 'Only the telecaller this lead is assigned to can log calls on it');
  }

  const followUpAt = input.follow_up_at ? new Date(input.follow_up_at) : null;
  if (followUpAt && Number.isNaN(followUpAt.getTime())) {
    throw new AppError(400, 'Invalid follow-up date');
  }
  if (input.outcome === 'CALL_BACK' && !followUpAt) {
    throw new AppError(400, 'Choose when to call back');
  }
  if (followUpAt && followUpAt.getTime() < Date.now() - 5 * 60 * 1000) {
    throw new AppError(400, 'Follow-up time must be in the future');
  }

  const note = input.notes?.trim();
  const activityNotes = `[${CALL_OUTCOMES[input.outcome]}]${note ? ` ${note}` : ''}`;

  const { activity, task } = await p.$transaction(async (tx) => {
    const activity = await tx.leadActivity.create({
      data: {
        lead_id: leadId,
        actor_id: user.employeeId,
        activity_type: 'CALL_LOGGED',
        notes: activityNotes,
      },
    });
    await tx.lead.update({ where: { id: leadId }, data: { last_contacted_at: new Date() } });

    const task = followUpAt
      ? await tx.task.create({
          data: {
            title: `Call back ${lead.customer_name}`,
            description: note || CALL_OUTCOMES[input.outcome],
            assignee_id: user.employeeId,
            created_by: user.employeeId,
            status: 'PENDING',
            priority: 'HIGH',
            target_date: followUpAt,
            lead_id: leadId,
          },
        })
      : null;
    return { activity, task };
  });

  // Someone actually answered: a freshly assigned lead is now genuinely
  // "contacted". Goes through the normal status path (workflow checks,
  // STATUS_CHANGED activity) rather than writing the status here.
  let updatedLead = null;
  if (CONNECTED.includes(input.outcome) && lead.status === 'ASSIGNED') {
    updatedLead = await updateLeadStatus(
      user,
      leadId,
      'CONTACTED',
      `Spoke to customer: ${activityNotes}`,
    );
  }

  return { activity, task, lead: updatedLead };
}
