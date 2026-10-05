import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, PhoneCall, History, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Permissions, LEAD_EXIT_REASON_LABELS } from '../../shared';
import { LEAD_STATUS_LABELS, getLeadSourceLabel, getRelativeAge } from '../../constants/leadStatus';

type ListName = 'all' | 'active' | 'not_called' | 'booked' | 'dropped' | 'moved';

interface TelecallerRow {
  id: number;
  fullName: string;
  employeeCode: string;
  active_employee: boolean;
  total: number;
  active: number;
  booked: number;
  dropped: number;
}

interface Report {
  employee: { id: number; fullName: string; employeeCode: string; active_employee: boolean };
  counts: Record<'total' | 'active' | 'not_called' | 'booked' | 'dropped' | 'moved', number>;
  status: Record<string, number>;
  dropped_reasons: { reason: string; count: number }[];
  sources: { source: string; count: number }[];
  calls: {
    total: number;
    last_7_days: number;
    last_30_days: number;
    today_new: number;
    today_follow_up: number;
  };
  list: {
    name: ListName;
    total: number;
    limit: number;
    leads: {
      id: number;
      lead_code: string;
      customer_name: string;
      phone: string;
      status: string;
      source: string;
      exit_reason: string | null;
      exit_reason_detail: string | null;
      assigned_at: string | null;
      last_contacted_at: string | null;
      updated_at: string;
      assigned_to: { full_name: string | null } | null;
    }[];
  };
  history: {
    id: number;
    activity_type: string;
    notes: string | null;
    created_at: string;
    lead: { id: number; lead_code: string; customer_name: string };
  }[];
}

const TILES: { key: ListName; label: string; tone: string }[] = [
  { key: 'all', label: 'Total leads', tone: 'text-navy-900' },
  { key: 'active', label: 'Active now', tone: 'text-blue-700' },
  { key: 'not_called', label: 'Not called yet', tone: 'text-amber-600' },
  { key: 'booked', label: 'Booked', tone: 'text-emerald-600' },
  { key: 'dropped', label: 'Dropped', tone: 'text-red-600' },
  { key: 'moved', label: 'Worked, now with others', tone: 'text-slate-600' },
];

// Pipeline stages shown under "Active now", in order.
const ACTIVE_STAGES = [
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

const reasonLabel = (r: string | null) =>
  !r || r === 'NOT_RECORDED'
    ? 'Reason not recorded'
    : (LEAD_EXIT_REASON_LABELS as Record<string, string>)[r] || r;
const activityLabel = (t: string) =>
  t
    .toLowerCase()
    .split('_')
    .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
    : '—';

/**
 * Leads page section for MD, Admin and HR: pick a telecaller and see every
 * lead they hold — active by stage, booked, dropped with reasons — plus
 * their calls and recent activity.
 */
export const TelecallerReport: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const navigate = useNavigate();
  const canOpenLeads = !!user?.permissions?.includes(Permissions.LEADS_READ);
  const [open, setOpen] = useState(true);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [list, setList] = useState<ListName>('active');
  const [view, setView] = useState<'leads' | 'history'>('leads');
  const [historyOffset, setHistoryOffset] = useState(0);

  const { data: telecallers = [] } = useQuery<TelecallerRow[]>({
    queryKey: ['telecallerReportList'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/leads/telecaller-report`);
      return res.ok ? (await res.json()).telecallers || [] : [];
    },
  });

  const { data: report, isFetching } = useQuery<Report | null>({
    queryKey: ['telecallerReport', employeeId, list, historyOffset],
    enabled: employeeId !== null,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/leads/telecaller-report/${employeeId}?list=${list}&history_offset=${historyOffset}`,
      );
      return res.ok ? res.json() : null;
    },
  });

  const shown = report && report.employee.id === employeeId ? report : null;
  const droppedTotal = shown?.dropped_reasons.reduce((n, r) => n + r.count, 0) || 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3.5 flex items-center justify-between border-b border-slate-100"
      >
        <h3 className="text-lg font-bold text-navy-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-navy-600" /> Telecaller report
        </h3>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="p-4 space-y-4">
          <select
            value={employeeId ?? ''}
            onChange={(e) => {
              setEmployeeId(e.target.value ? parseInt(e.target.value, 10) : null);
              setList('active');
              setView('leads');
              setHistoryOffset(0);
            }}
            className="w-full md:w-96 p-2.5 text-sm border border-slate-200 rounded-xl"
          >
            <option value="">Choose a telecaller…</option>
            {telecallers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.employeeCode}){t.active_employee ? '' : ' — left'} · {t.active}{' '}
                active · {t.total} total
              </option>
            ))}
          </select>

          {employeeId !== null && !shown && <p className="text-sm text-slate-400">Loading…</p>}

          {shown && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {TILES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setList(t.key);
                      setView('leads');
                    }}
                    className={`p-3 rounded-xl border text-left transition-colors ${list === t.key && view === 'leads' ? 'border-navy-600 bg-navy-50' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <p className={`text-2xl font-black ${t.tone}`}>
                      {shown.counts[t.key === 'all' ? 'total' : t.key]}
                    </p>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                      {t.label}
                    </p>
                  </button>
                ))}
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                    Active leads by stage
                  </p>
                  {ACTIVE_STAGES.filter((s) => shown.status[s]).length === 0 ? (
                    <p className="text-xs text-slate-400">No active leads</p>
                  ) : (
                    ACTIVE_STAGES.filter((s) => shown.status[s]).map((s) => (
                      <div key={s} className="flex justify-between text-sm py-0.5">
                        <span className="text-slate-600">{LEAD_STATUS_LABELS[s] || s}</span>
                        <span className="font-bold text-navy-900">{shown.status[s]}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                    Why leads were dropped
                  </p>
                  {shown.dropped_reasons.length === 0 ? (
                    <p className="text-xs text-slate-400">Nothing dropped</p>
                  ) : (
                    shown.dropped_reasons.map((r) => (
                      <div key={r.reason} className="py-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">{reasonLabel(r.reason)}</span>
                          <span className="font-bold text-red-600">{r.count}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full mt-1">
                          <div
                            className="h-1.5 bg-red-400 rounded-full"
                            style={{ width: `${(r.count / droppedTotal) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 rounded-xl border border-slate-200 space-y-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                      <PhoneCall className="w-3.5 h-3.5" /> Calls logged
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {(
                        [
                          ['Today', shown.calls.today_new + shown.calls.today_follow_up],
                          ['7 days', shown.calls.last_7_days],
                          ['30 days', shown.calls.last_30_days],
                        ] as const
                      ).map(([l, n]) => (
                        <div key={l} className="bg-slate-50 rounded-lg py-1.5">
                          <p className="font-black text-navy-900">{n}</p>
                          <p className="text-[10px] text-slate-500">{l}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Today: {shown.calls.today_new} new · {shown.calls.today_follow_up} follow-up ·{' '}
                      {shown.calls.total} calls ever
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Lead sources</p>
                    {shown.sources.map((s) => (
                      <div key={s.source} className="flex justify-between text-sm py-0.5">
                        <span className="text-slate-600">{getLeadSourceLabel(s.source)}</span>
                        <span className="font-bold text-navy-900">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setView('leads')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border ${view === 'leads' ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  {TILES.find((t) => t.key === list)?.label} ({shown.list.total})
                </button>
                <button
                  onClick={() => setView('history')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1 ${view === 'history' ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  <History className="w-3.5 h-3.5" /> Activity history
                </button>
                {isFetching && (
                  <span className="text-xs text-slate-400 self-center">Updating…</span>
                )}
              </div>

              {view === 'leads' && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                      <tr>
                        <th className="text-left p-2">Lead</th>
                        <th className="text-left p-2">Stage</th>
                        <th className="text-left p-2">
                          {list === 'dropped' ? 'Drop reason' : 'Source'}
                        </th>
                        <th className="text-left p-2">Given</th>
                        <th className="text-left p-2">Last call</th>
                        {list === 'moved' && <th className="text-left p-2">Now with</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.list.leads.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-400">
                            No leads here
                          </td>
                        </tr>
                      ) : (
                        shown.list.leads.map((l) => (
                          <tr
                            key={l.id}
                            onClick={() =>
                              canOpenLeads && navigate(`/leads-clients?tab=leads&leadId=${l.id}`)
                            }
                            className={`border-t border-slate-100 ${canOpenLeads ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                          >
                            <td className="p-2">
                              <div className="font-semibold text-navy-900">{l.customer_name}</div>
                              <div className="text-[11px] font-mono text-slate-400">
                                {l.lead_code}
                              </div>
                            </td>
                            <td className="p-2 text-slate-600">
                              {LEAD_STATUS_LABELS[l.status] || l.status}
                            </td>
                            <td className="p-2 text-slate-600">
                              {list === 'dropped' ? (
                                <>
                                  {reasonLabel(l.exit_reason)}
                                  {l.exit_reason_detail && (
                                    <span className="block text-[11px] text-slate-400">
                                      {l.exit_reason_detail}
                                    </span>
                                  )}
                                </>
                              ) : (
                                getLeadSourceLabel(l.source)
                              )}
                            </td>
                            <td className="p-2 text-slate-500">{fmtDate(l.assigned_at)}</td>
                            <td className="p-2 text-slate-500">
                              {l.last_contacted_at ? getRelativeAge(l.last_contacted_at) : 'Never'}
                            </td>
                            {list === 'moved' && (
                              <td className="p-2 text-slate-500">
                                {l.assigned_to?.full_name || 'Not assigned'}
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {shown.list.total > shown.list.limit && (
                    <p className="p-2 text-[11px] text-slate-400 border-t border-slate-100">
                      Showing the {shown.list.limit} most recently updated of {shown.list.total}.
                    </p>
                  )}
                </div>
              )}

              {view === 'history' && (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {shown.history.length === 0 ? (
                    <p className="p-4 text-center text-sm text-slate-400">No activity recorded</p>
                  ) : (
                    shown.history.map((h) => (
                      <div key={h.id} className="p-2.5 text-sm flex gap-3">
                        <span className="text-[11px] text-slate-400 w-28 shrink-0">
                          {new Date(h.created_at).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        <div className="min-w-0">
                          <span className="font-semibold text-navy-900">
                            {activityLabel(h.activity_type)}
                          </span>{' '}
                          <span className="text-slate-500">
                            · {h.lead.customer_name} ({h.lead.lead_code})
                          </span>
                          {h.notes && <p className="text-xs text-slate-500 truncate">{h.notes}</p>}
                        </div>
                      </div>
                    ))
                  )}
                  <div className="p-2 flex justify-between">
                    <button
                      disabled={historyOffset === 0}
                      onClick={() => setHistoryOffset((o) => Math.max(0, o - 50))}
                      className="text-xs font-bold text-navy-600 disabled:text-slate-300"
                    >
                      ← Newer
                    </button>
                    <button
                      disabled={shown.history.length < 50}
                      onClick={() => setHistoryOffset((o) => o + 50)}
                      className="text-xs font-bold text-navy-600 disabled:text-slate-300"
                    >
                      Older →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
