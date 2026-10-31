import React, { lazy, Suspense } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Permissions, Roles } from '../../shared';

const ActionCenter = lazy(() =>
  import('../md/ActionCenter').then((m) => ({ default: m.ActionCenter })),
);
const ApprovalsDashboard = lazy(() =>
  import('../hr/ApprovalsDashboard').then((m) => ({ default: m.ApprovalsDashboard })),
);
const TeamRequestsPage = lazy(() =>
  import('../attendance/TeamRequestsPage').then((m) => ({ default: m.TeamRequestsPage })),
);
const PMApprovalsHub = lazy(() =>
  import('./PMApprovalsHub').then((m) => ({ default: m.PMApprovalsHub })),
);
const AccountantRefundQueue = lazy(() =>
  import('../finance/AccountantRefundQueue').then((m) => ({ default: m.AccountantRefundQueue })),
);

type TabId = 'listings' | 'attendance' | 'refunds' | 'visits';

interface InboxSection {
  key: string;
  label: string;
  link: string;
  count: number;
}

/** Which inbox sections (from /md/approvals-inbox) count towards which tab. */
const SECTION_TAB: Record<string, TabId> = {
  properties: 'listings',
  projects: 'listings',
  bookings: 'listings',
  leave: 'attendance',
  refunds: 'refunds',
  site_visits: 'visits',
};

/**
 * One place for everything waiting on a decision. Replaces the separate
 * Approvals inbox, Action Center, HR Approvals, Team requests and PM
 * Approvals pages. Each person sees only the tabs they can act on:
 *  - Bookings & listings (MD / Admin): bookings, property and project
 *    verification, PM assignment
 *  - Leave & attendance (HR, MD, Admin -- HR decides all attendance requests)
 *  - Refunds (Finance and the MD)
 *  - Site visits & demos (project managers / agents who accept them)
 */
export const ApprovalsPage: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const [params, setParams] = useSearchParams();
  const roles: string[] = user?.roles || [];
  const perms: string[] = user?.permissions || [];
  const isTop = roles.includes(Roles.MD) || roles.includes(Roles.ADMIN);
  const isHr = roles.includes(Roles.HR_MANAGER);
  const canReviewRefunds =
    perms.includes(Permissions.EXPENSES_REVIEW) || perms.includes(Permissions.EXPENSES_MD_APPROVE);
  const canAcceptVisits =
    perms.includes(Permissions.SITE_VISITS_ACCEPT) || perms.includes(Permissions.DEMOS_ACCEPT);

  const tabs: { id: TabId; label: string }[] = [
    ...(isTop ? [{ id: 'listings' as TabId, label: 'Bookings & listings' }] : []),
    ...(isTop || isHr ? [{ id: 'attendance' as TabId, label: 'Leave & attendance' }] : []),
    ...(canReviewRefunds ? [{ id: 'refunds' as TabId, label: 'Refunds' }] : []),
    ...(canAcceptVisits ? [{ id: 'visits' as TabId, label: 'Site visits & demos' }] : []),
  ];

  // Counts per tab (the MD's inbox summary already counts every queue).
  const { data: inbox } = useQuery({
    queryKey: ['approvalsInbox'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/md/approvals-inbox`);
      if (!res.ok) throw new Error('unavailable');
      return (await res.json()) as { sections: InboxSection[]; total: number };
    },
    enabled: isTop,
    staleTime: 30_000,
  });
  const countFor = (t: TabId) =>
    (inbox?.sections || [])
      .filter((s) => SECTION_TAB[s.key] === t)
      .reduce((n, s) => n + (s.count || 0), 0);
  const elsewhere = (inbox?.sections || []).filter((s) => !SECTION_TAB[s.key] && s.count > 0);

  const requested = params.get('tab') as TabId | null;
  const active: TabId | undefined =
    tabs.find((t) => t.id === requested)?.id ||
    // Open the first tab with something waiting, else the first tab.
    tabs.find((t) => countFor(t.id) > 0)?.id ||
    tabs[0]?.id;
  const sub = params.get('sub') === 'duty' ? 'duty' : 'leave';
  const go = (tab: TabId, extra: Record<string, string> = {}) =>
    setParams({ tab, ...extra }, { replace: true });

  if (!active) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 text-slate-500">
        <Inbox className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        Nothing here for your role.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-24 md:pb-6">
      <div>
        <h1 className="text-2xl font-black text-navy-900">Approvals</h1>
        <p className="text-sm text-slate-500">Everything waiting for your decision.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const n = countFor(t.id);
          return (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold border flex items-center gap-2 ${
                active === t.id
                  ? 'bg-navy-900 text-white border-navy-900'
                  : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              {t.label}
              {n > 0 && (
                <span
                  className={`text-[11px] font-black rounded-full px-2 py-0.5 ${active === t.id ? 'bg-white text-navy-900' : 'bg-rose-600 text-white'}`}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isTop && elsewhere.length > 0 && (
        <p className="text-xs text-slate-500">
          Also waiting:{' '}
          {elsewhere.map((s, i) => (
            <span key={s.key}>
              {i > 0 ? ' · ' : ''}
              <Link to={s.link} className="tap-inline font-bold text-navy-700 underline">
                {s.label} ({s.count})
              </Link>
            </span>
          ))}
        </p>
      )}

      <Suspense fallback={<p className="text-sm text-slate-400 py-8 text-center">Loading…</p>}>
        {active === 'listings' && <ActionCenter embedded />}
        {active === 'attendance' && (
          <div className="space-y-4">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              {(
                [
                  ['leave', 'Leave, late, WFH & field'],
                  ['duty', 'Duty days, comp-off & check-ins'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => go('attendance', { sub: k })}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold ${sub === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {sub === 'leave' ? <ApprovalsDashboard embedded /> : <TeamRequestsPage embedded />}
          </div>
        )}
        {active === 'refunds' && (
          <AccountantRefundQueue isMD={perms.includes(Permissions.EXPENSES_MD_APPROVE)} />
        )}
        {active === 'visits' && <PMApprovalsHub />}
      </Suspense>
    </div>
  );
};
