import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { Roles } from '../../shared';
import { getISTComponents } from '../../utils/time';
import { AppError } from './errors';
import { splitCalls } from './calls';

const p = prisma;

export const ACTIVE_STATUSES = [
  'NEW',
  'ASSIGNED',
  'CONTACTED',
  'QUALIFIED',
  'DEMO_SCHEDULED',
  'DEMO_COMPLETED',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_COMPLETED',
  'NEGOTIATION',
  'BOOKING_INITIATED',
];

export const REPORT_LISTS = ['all', 'active', 'not_called', 'booked', 'dropped', 'moved'] as const;
export type ReportList = (typeof REPORT_LISTS)[number];

const DAY = 24 * 60 * 60 * 1000;

/** Every telecaller in the company (including ones who left) with headline counts. */
export async function listTelecallersForReport(user: TokenPayload) {
  const telecallers = await p.employee.findMany({
    where: {
      company_id: user.companyId,
      roles: { some: { role: { name: Roles.TELECALLER } } },
    },
    select: { id: true, employee_code: true, full_name: true, status: true },
    orderBy: { full_name: 'asc' },
  });
  const ids = telecallers.map((t) => t.id);
  const byStatus = await p.lead.groupBy({
    by: ['assigned_to_id', 'status'],
    where: { assigned_to_id: { in: ids } },
    _count: { _all: true },
  });
  const counts = new Map<
    number,
    { total: number; active: number; booked: number; dropped: number }
  >();
  for (const row of byStatus) {
    const c = counts.get(row.assigned_to_id!) || { total: 0, active: 0, booked: 0, dropped: 0 };
    const n = row._count._all;
    c.total += n;
    if (ACTIVE_STATUSES.includes(row.status)) c.active += n;
    if (row.status === 'BOOKED') c.booked += n;
    if (row.status === 'DROPPED') c.dropped += n;
    counts.set(row.assigned_to_id!, c);
  }
  return telecallers.map((t) => ({
    id: t.id,
    employeeCode: t.employee_code,
    fullName: t.full_name || t.employee_code,
    active_employee: t.status === 'ACTIVE',
    ...(counts.get(t.id) || { total: 0, active: 0, booked: 0, dropped: 0 }),
  }));
}

/**
 * One telecaller's whole lead picture: counts by stage, dropped leads with
 * reasons, sources, calls, a lead list for the chosen bucket, and their
 * recent activity.
 */
export async function getTelecallerReport(
  user: TokenPayload,
  employeeId: number,
  opts: { list: ReportList; historyOffset: number },
) {
  const employee = await p.employee.findFirst({
    where: { id: employeeId, company_id: user.companyId },
    select: { id: true, employee_code: true, full_name: true, status: true, created_at: true },
  });
  if (!employee) throw new AppError(404, 'Employee not found');

  const mine = { assigned_to_id: employeeId, company_id: user.companyId };
  const notCalled = { activities: { none: { activity_type: 'CALL_LOGGED' } } };
  // Leads they worked on (any activity) that now sit with someone else.
  const moved = {
    company_id: user.companyId,
    OR: [{ assigned_to_id: { not: employeeId } }, { assigned_to_id: null }],
    activities: {
      some: {
        actor_id: employeeId,
        activity_type: { notIn: ['LEAD_CREATED', 'ASSIGNED_TO_AGENT'] },
      },
    },
  };

  const { dateString } = getISTComponents(new Date());
  const todayStart = new Date(`${dateString}T00:00:00+05:30`);
  const callWhere = (from?: Date) => ({
    actor_id: employeeId,
    activity_type: 'CALL_LOGGED',
    ...(from ? { created_at: { gte: from } } : {}),
  });

  const [
    byStatus,
    dropReasons,
    sources,
    notCalledCount,
    movedCount,
    callsTotal,
    calls7,
    calls30,
    callsToday,
  ] = await Promise.all([
    p.lead.groupBy({ by: ['status'], where: mine, _count: { _all: true } }),
    p.lead.groupBy({
      by: ['exit_reason'],
      where: { ...mine, status: 'DROPPED' },
      _count: { _all: true },
    }),
    p.lead.groupBy({ by: ['source'], where: mine, _count: { _all: true } }),
    p.lead.count({ where: { ...mine, status: { in: ['NEW', 'ASSIGNED'] }, ...notCalled } }),
    p.lead.count({ where: moved }),
    p.leadActivity.count({ where: callWhere() }),
    p.leadActivity.count({ where: callWhere(new Date(todayStart.getTime() - 6 * DAY)) }),
    p.leadActivity.count({ where: callWhere(new Date(todayStart.getTime() - 29 * DAY)) }),
    splitCalls(employeeId, todayStart, new Date(todayStart.getTime() + DAY)),
  ]);

  const status: Record<string, number> = {};
  for (const r of byStatus) status[r.status] = r._count._all;
  const sum = (keys: string[]) => keys.reduce((n, k) => n + (status[k] || 0), 0);
  const total = Object.values(status).reduce((a, b) => a + b, 0);

  const listWhere =
    opts.list === 'moved'
      ? moved
      : opts.list === 'active'
        ? { ...mine, status: { in: ACTIVE_STATUSES } }
        : opts.list === 'not_called'
          ? { ...mine, status: { in: ['NEW', 'ASSIGNED'] }, ...notCalled }
          : opts.list === 'booked'
            ? { ...mine, status: 'BOOKED' }
            : opts.list === 'dropped'
              ? { ...mine, status: 'DROPPED' }
              : mine;

  const LIST_LIMIT = 300;
  const [leads, listTotal, history] = await Promise.all([
    p.lead.findMany({
      where: listWhere,
      select: {
        id: true,
        lead_code: true,
        customer_name: true,
        phone: true,
        status: true,
        source: true,
        exit_reason: true,
        exit_reason_detail: true,
        assigned_at: true,
        last_contacted_at: true,
        updated_at: true,
        assigned_to: { select: { full_name: true } },
      },
      orderBy: { updated_at: 'desc' },
      take: LIST_LIMIT,
    }),
    p.lead.count({ where: listWhere }),
    p.leadActivity.findMany({
      where: { actor_id: employeeId, lead: { company_id: user.companyId } },
      select: {
        id: true,
        activity_type: true,
        notes: true,
        created_at: true,
        lead: { select: { id: true, lead_code: true, customer_name: true } },
      },
      orderBy: { id: 'desc' },
      skip: opts.historyOffset,
      take: 50,
    }),
  ]);

  return {
    employee: {
      id: employee.id,
      fullName: employee.full_name || employee.employee_code,
      employeeCode: employee.employee_code,
      active_employee: employee.status === 'ACTIVE',
    },
    counts: {
      total,
      active: sum(ACTIVE_STATUSES),
      not_called: notCalledCount,
      booked: status.BOOKED || 0,
      dropped: status.DROPPED || 0,
      moved: movedCount,
    },
    status,
    dropped_reasons: dropReasons
      .map((r) => ({ reason: r.exit_reason || 'NOT_RECORDED', count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    sources: sources
      .map((s) => ({ source: s.source, count: s._count._all }))
      .sort((a, b) => b.count - a.count),
    calls: {
      total: callsTotal,
      last_7_days: calls7,
      last_30_days: calls30,
      today_new: callsToday.new_calls,
      today_follow_up: callsToday.follow_up_calls,
    },
    list: { name: opts.list, total: listTotal, limit: LIST_LIMIT, leads },
    history,
  };
}
