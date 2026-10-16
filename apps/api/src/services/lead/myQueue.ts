import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { getISTComponents } from '../../utils/time';
import { LeadPolicy } from '../../policies/lead.policy';
import { getCallQueueMeta, splitCalls } from './calls';

const p = prisma;

/** The statuses a telecaller still calls about (same list as the dashboard used). */
export const QUEUE_STATUSES = ['NEW', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT_SCHEDULED'];
const RETRY_OUTCOMES = ['NO_ANSWER', 'BUSY_OR_SWITCHED_OFF'];
export type QueueTab = 'new' | 'followups' | 'all';

const istDay = (d: Date) => getISTComponents(d).dateString;

/**
 * The telecaller's calling list, worked out on the server (FIX-1c). The dashboard
 * used to download every page of the person's leads plus their whole call history
 * and sort them in the browser, which is slow for someone holding thousands of
 * leads after a big upload. The rules are the same as the dashboard's were:
 *
 *  - New call: never called and still NEW / ASSIGNED. Oldest hand-over first.
 *  - Follow-up: everything else. Due call-backs first (overdue first), then
 *    unanswered calls to try again (no answer / busy, last tried before today),
 *    then the rest by how long since the last call, later call-backs last.
 *  - "Due" = a call-back on or before the end of today; days are IST.
 *  - Batches: leads handed over together (same source, same IST day), oldest
 *    first, only those that still have leads waiting for a first call.
 *
 * Only the requested page of lead rows is returned in full, with the call
 * history of just those leads; the counts cover the whole list.
 */
export async function getMyQueue(
  user: TokenPayload,
  opts: { tab?: QueueTab; batch?: string; limit: number; offset: number },
) {
  const now = new Date();
  const today = istDay(now);
  const dayStart = new Date(`${today}T00:00:00+05:30`);
  const endOfToday = new Date(`${today}T23:59:59.999+05:30`);

  const [light, meta, todayCalls] = await Promise.all([
    p.lead.findMany({
      where: {
        assigned_to_id: user.employeeId,
        company_id: user.companyId,
        status: { in: QUEUE_STATUSES },
      },
      select: { id: true, status: true, source: true, assigned_at: true, created_at: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    }),
    getCallQueueMeta(user, QUEUE_STATUSES),
    splitCalls(user.employeeId, dayStart, new Date(dayStart.getTime() + 24 * 3600 * 1000)),
  ]);

  type Light = (typeof light)[number];
  const isNewCall = (l: Light) =>
    !meta[l.id]?.calls && (l.status === 'NEW' || l.status === 'ASSIGNED');
  const isDue = (l: Light) => {
    const f = meta[l.id]?.follow_up_at;
    return !!f && f <= endOfToday;
  };
  const isRetry = (l: Light) => {
    const m = meta[l.id];
    return (
      !m?.follow_up_at &&
      !!m?.last_outcome &&
      RETRY_OUTCOMES.includes(m.last_outcome) &&
      !!m.last_call_at &&
      istDay(m.last_call_at) !== today
    );
  };
  const handedOver = (l: Light) => (l.assigned_at || l.created_at || new Date(0)).getTime();
  const batchKey = (l: Light) =>
    `${l.source || 'UNKNOWN'}|${l.assigned_at ? istDay(l.assigned_at) : ''}`;

  const newCalls = light.filter(isNewCall).sort((a, b) => handedOver(a) - handedOver(b));
  const rank = (l: Light) => (isDue(l) ? 0 : isRetry(l) ? 1 : meta[l.id]?.follow_up_at ? 3 : 2);
  const followTime = (l: Light) => {
    const m = meta[l.id];
    return (m?.follow_up_at || m?.last_call_at || new Date(0)).getTime();
  };
  const followUps = light
    .filter((l) => !isNewCall(l))
    .sort((a, b) => rank(a) - rank(b) || followTime(a) - followTime(b));
  const followUpsDue = followUps.filter((l) => isDue(l) || isRetry(l)).length;

  const batchMap = new Map<
    string,
    { key: string; source: string; assigned_at: Date | null; total: number; left: number }
  >();
  for (const l of light) {
    const key = batchKey(l);
    const b = batchMap.get(key) || {
      key,
      source: l.source || 'UNKNOWN',
      assigned_at: l.assigned_at,
      total: 0,
      left: 0,
    };
    b.total += 1;
    if (isNewCall(l)) b.left += 1;
    batchMap.set(key, b);
  }
  const batches = [...batchMap.values()]
    .filter((b) => b.left > 0)
    .sort((a, b) => (a.assigned_at?.getTime() || 0) - (b.assigned_at?.getTime() || 0));

  const tab: QueueTab = opts.tab || (followUpsDue > 0 ? 'followups' : 'new');
  const shown =
    tab === 'new'
      ? newCalls.filter((l) => !opts.batch || batchKey(l) === opts.batch)
      : tab === 'followups'
        ? followUps
        : light;
  const pageIds = shown.slice(opts.offset, opts.offset + opts.limit).map((l) => l.id);

  const rows = pageIds.length
    ? await p.lead.findMany({
        where: { id: { in: pageIds } },
        include: {
          assigned_to: { select: { id: true, employee_code: true, full_name: true, phone: true } },
          created_by: { select: { id: true, employee_code: true, full_name: true } },
          introduced_by: { select: { id: true, employee_code: true, full_name: true } },
          referral_employee: { select: { id: true, employee_code: true, full_name: true } },
          preferred_locations: { orderBy: { sort_order: 'asc' } },
          converted_customer: { select: { customer_code: true } },
        },
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const leads = pageIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((lead) => ({
      ...lead,
      introduced_by: LeadPolicy.canView(user, lead) ? lead.introduced_by : null,
      can_edit: LeadPolicy.canMutate(user, lead),
    }));

  const callMeta: Record<number, (typeof meta)[number]> = {};
  for (const id of pageIds) if (meta[id]) callMeta[id] = meta[id];

  return {
    tab,
    batch: opts.batch || null,
    counts: {
      new: newCalls.length,
      followups: followUps.length,
      followups_due: followUpsDue,
      all: light.length,
    },
    total: shown.length,
    offset: opts.offset,
    limit: opts.limit,
    batches,
    leads,
    call_meta: callMeta,
    today: todayCalls,
  };
}
