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

const OUTCOME_BY_LABEL = new Map<string, CallOutcome>(
  (Object.entries(CALL_OUTCOMES) as [CallOutcome, string][]).map(([k, v]) => [v, k]),
);
/** CALL_LOGGED notes start with "[<outcome label>]" (see logCall). */
const outcomeOf = (notes: string | null): CallOutcome | null =>
  OUTCOME_BY_LABEL.get(/^\[([^\]]+)\]/.exec(notes || '')?.[1] || '') || null;

/**
 * Splits an employee's calls in [start, end) into first calls on a lead
 * ("new calls") and calls to a lead that had already been called before
 * ("follow-ups"). Telecallers had to work this out by hand for their report.
 */
export async function splitCalls(employeeId: number, start: Date, end: Date) {
  const calls = await p.leadActivity.findMany({
    where: {
      actor_id: employeeId,
      activity_type: 'CALL_LOGGED',
      created_at: { gte: start, lt: end },
    },
    select: { id: true, lead_id: true },
  });
  if (calls.length === 0) return { new_calls: 0, follow_up_calls: 0 };
  const firsts = await p.leadActivity.groupBy({
    by: ['lead_id'],
    where: {
      activity_type: 'CALL_LOGGED',
      lead_id: { in: [...new Set(calls.map((c) => c.lead_id))] },
    },
    _min: { id: true },
  });
  const firstId = new Map(firsts.map((f) => [f.lead_id, f._min.id]));
  const newCalls = calls.filter((c) => firstId.get(c.lead_id) === c.id).length;
  return { new_calls: newCalls, follow_up_calls: calls.length - newCalls };
}

/**
 * Per-lead call history for the telecaller's own active leads, so the
 * dashboard can separate leads never called from follow-ups and show when
 * each follow-up is due.
 */
export async function getCallQueueMeta(user: TokenPayload, activeStatuses: string[]) {
  const mine = {
    assigned_to_id: user.employeeId,
    company_id: user.companyId,
    status: { in: activeStatuses },
  };
  const [calls, callBacks] = await Promise.all([
    p.leadActivity.findMany({
      where: { activity_type: 'CALL_LOGGED', lead: mine },
      select: { lead_id: true, notes: true, created_at: true },
      orderBy: { id: 'asc' },
    }),
    p.task.findMany({
      where: {
        assignee_id: user.employeeId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        title: { startsWith: 'Call back ' },
        lead: mine,
      },
      select: { lead_id: true, target_date: true },
    }),
  ]);

  const meta: Record<
    number,
    {
      calls: number;
      last_call_at: Date | null;
      last_outcome: CallOutcome | null;
      follow_up_at: Date | null;
    }
  > = {};
  const entry = (id: number) =>
    (meta[id] ??= { calls: 0, last_call_at: null, last_outcome: null, follow_up_at: null });
  for (const c of calls) {
    const m = entry(c.lead_id);
    m.calls += 1;
    m.last_call_at = c.created_at;
    m.last_outcome = outcomeOf(c.notes);
  }
  for (const t of callBacks) {
    if (!t.lead_id || !t.target_date) continue;
    const m = entry(t.lead_id);
    if (!m.follow_up_at || t.target_date < m.follow_up_at) m.follow_up_at = t.target_date;
  }
  return meta;
}
