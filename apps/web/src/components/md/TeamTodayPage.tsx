import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Home, PhoneCall, Users, X } from 'lucide-react';
import { Roles } from '../../shared';
import { workLogEntryLabel } from '../worklog/workLogKinds';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface Row {
  id: number;
  name: string;
  employee_code: string;
  roles: string[];
  attendance: {
    check_in_at: string;
    check_out_at: string | null;
    status: string;
    source: string;
  } | null;
  attendance_required: boolean;
  calls_logged: number;
  leads_worked: number;
  contacted: number;
  qualified: number;
  dropped: number;
  site_visit_actions: number;
  visits_completed: number;
  tasks_completed: number;
  leads_imported: number;
  first_action: string | null;
  last_action: string | null;
  report: { submitted_at: string; reported_calls: number; summary: string } | null;
  flags: string[];
  kind: 'CALLING' | 'SITE' | 'DIGITAL' | 'PARTNER' | 'GENERAL';
  site: {
    visits_today: number;
    visits_completed: number;
    visits_awaiting_acceptance: number;
    inventory_updates: number;
  };
  work_log: {
    id: number;
    kind: string;
    note: string;
    link: string | null;
    count: number;
    at: string;
  }[];
}

const KIND_LABEL: Record<Row['kind'], string> = {
  CALLING: 'Calling team',
  SITE: 'Site & inventory',
  DIGITAL: 'Digital team',
  PARTNER: 'Channel partners',
  GENERAL: 'Other',
};

const logTotal = (r: Row) => (r.work_log || []).reduce((n, w) => n + (w.count || 1), 0);

/** The numbers that describe each kind of job -- PMs don't make calls. */
const RoleStats: React.FC<{ r: Row }> = ({ r }) => {
  const s = r.site || {
    visits_today: 0,
    visits_completed: 0,
    visits_awaiting_acceptance: 0,
    inventory_updates: 0,
  };
  const cells: [string, number, boolean?][] =
    r.kind === 'SITE'
      ? [
          ['Visits today', s.visits_today, true],
          ['Completed', s.visits_completed + r.visits_completed, true],
          ['To accept', s.visits_awaiting_acceptance],
          ['Inventory updates', s.inventory_updates],
          ['Tasks', r.tasks_completed],
          ['Work log', logTotal(r)],
        ]
      : r.kind === 'DIGITAL'
        ? [
            ['Work logged', logTotal(r), true],
            ['Leads added', r.leads_imported, true],
            ['Leads worked', r.leads_worked],
            ['Tasks', r.tasks_completed],
          ]
        : r.kind === 'PARTNER'
          ? [
              ['Leads added', r.leads_imported, true],
              ['Leads worked', r.leads_worked, true],
              ['Work log', logTotal(r)],
              ['Tasks', r.tasks_completed],
            ]
          : r.kind === 'CALLING'
            ? [
                ['Calls', r.calls_logged, true],
                ['Leads', r.leads_worked, true],
                ['Contacted', r.contacted],
                ['Qualified', r.qualified],
                ['Dropped', r.dropped],
                ['Visits', r.visits_completed],
                ['Tasks', r.tasks_completed],
              ]
            : [
                ['Tasks', r.tasks_completed, true],
                ['Leads worked', r.leads_worked],
                ['Work log', logTotal(r)],
              ];
  return (
    <div
      className="grid gap-2 bg-slate-50 rounded-xl p-2"
      style={{ gridTemplateColumns: `repeat(${Math.min(cells.length, 4)}, minmax(0, 1fr))` }}
    >
      {cells.map(([label, value, strong]) => (
        <Stat key={label} label={label} value={value} strong={strong} />
      ))}
    </div>
  );
};

const t = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : '—';

const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** MD sets work-from-home for a group of people over a date range. */
const GrantWfhModal: React.FC<{ rows: Row[]; onClose: () => void }> = ({ rows, onClose }) => {
  const { fetchWithAuth } = useAuth();
  const [selected, setSelected] = useState<number[]>([]);
  const [start, setStart] = useState(todayIST());
  const [end, setEnd] = useState(todayIST());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const roles = [...new Set(rows.flatMap((r) => r.roles))].sort();
  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/wfh/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: selected, start_date: start, end_date: end }),
      });
      const body = await res.json().catch(() => ({}));
      setMsg({
        ok: res.ok,
        text: res.ok
          ? `Done - ${body.days_created} work-from-home day(s) set. Sundays and holidays skipped.`
          : body.error || 'Failed',
      });
    } catch {
      setMsg({ ok: false, text: 'Network error, please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-extrabold text-slate-900 flex items-center gap-2">
            <Home className="w-4 h-4" /> Set work from home
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-slate-500">
            On these days the selected people check in and out from their own app instead of the
            kiosk. Their real work shows here on Team Today.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-600">
              From
              <input
                type="date"
                value={start}
                min={todayIST()}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              To
              <input
                type="date"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {roles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() =>
                  setSelected((s) => [
                    ...new Set([
                      ...s,
                      ...rows.filter((r) => r.roles.includes(role)).map((r) => r.id),
                    ]),
                  ])
                }
                className="px-2.5 py-1 rounded-full border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
              >
                + all {role}
              </button>
            ))}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="px-2.5 py-1 text-[11px] font-bold text-red-600"
              >
                clear
              </button>
            )}
          </div>
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {rows.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={() => toggle(r.id)}
                />
                <span className="font-bold text-slate-800 truncate">{r.name}</span>
                <span className="text-[11px] text-slate-400 truncate">{r.roles.join(', ')}</span>
              </label>
            ))}
          </div>
          {msg && (
            <p className={`text-xs font-bold ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              {msg.text}
            </p>
          )}
        </div>
        <div className="p-4 border-t border-slate-100">
          <button
            disabled={busy || selected.length === 0 || !start || !end}
            onClick={submit}
            className="w-full py-3 bg-navy-700 hover:bg-navy-800 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl"
          >
            Set work from home for {selected.length} {selected.length === 1 ? 'person' : 'people'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number | string; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <div className="text-center">
    <div className={`text-base font-black ${strong ? 'text-navy-900' : 'text-slate-700'}`}>
      {value}
    </div>
    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{label}</div>
  </div>
);

/**
 * Team Today — what each person actually did on a day, from system records
 * only (attendance, logged calls, lead actions, tasks, site visits), with
 * their typed daily report shown alongside so the two can be compared.
 */
export const TeamTodayPage: React.FC = () => {
  const { fetchWithAuth, user } = useAuth();
  const canGrantWfh = !!user?.roles?.some((r: string) => r === Roles.MD || r === Roles.ADMIN);
  const [showWfh, setShowWfh] = useState(false);
  const [date, setDate] = useState(todayIST());
  const [filter, setFilter] = useState<'all' | 'flagged' | 'present'>('all');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['teamToday', date],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/md/team-today?date=${date}`);
      if (!res.ok) throw new Error('Failed');
      return (await res.json()) as { date: string; employees: Row[] };
    },
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  });

  const rows = data?.employees || [];
  const summary = useMemo(
    () => ({
      present: rows.filter((r) => r.attendance).length,
      flagged: rows.filter((r) => r.flags.length > 0).length,
      calls: rows.reduce((n, r) => n + r.calls_logged, 0),
      leads: rows.reduce((n, r) => n + r.leads_worked, 0),
    }),
    [rows],
  );
  const shown = rows
    .filter((r) =>
      filter === 'flagged' ? r.flags.length > 0 : filter === 'present' ? !!r.attendance : true,
    )
    .sort((a, b) => b.flags.length - a.flags.length || b.leads_worked - a.leads_worked);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5" /> Team Today
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            What each person actually did — from attendance and CRM records, not self-reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canGrantWfh && (
            <button
              onClick={() => setShowWfh(true)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 flex items-center gap-1.5 hover:bg-slate-50"
            >
              <Home className="w-4 h-4" /> Work from home
            </button>
          )}
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <CalendarDays className="w-4 h-4" />
            <input
              type="date"
              value={date}
              max={todayIST()}
              onChange={(e) => setDate(e.target.value || todayIST())}
              className="px-3 py-2 border border-slate-300 rounded-xl text-sm"
            />
          </label>
        </div>
      </div>
      {showWfh && <GrantWfhModal rows={rows} onClose={() => setShowWfh(false)} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Present', value: summary.present },
          { label: 'Need a look', value: summary.flagged, alert: summary.flagged > 0 },
          { label: 'Calls logged', value: summary.calls },
          { label: 'Leads worked', value: summary.leads },
        ].map((c) => (
          <div
            key={c.label}
            className={`rounded-2xl border p-3 ${c.alert ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}
          >
            <div className="text-2xl font-black text-slate-900">{c.value}</div>
            <div className="text-[11px] font-bold text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {(
          [
            ['all', 'Everyone'],
            ['flagged', 'Need a look'],
            ['present', 'Present'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
              filter === k
                ? 'bg-navy-900 text-white border-navy-900'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-red-600">Could not load this day. Please refresh.</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {shown.map((r) => (
          <div
            key={r.id}
            className={`bg-white rounded-2xl border p-4 space-y-3 ${r.flags.length ? 'border-amber-300' : 'border-slate-200'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-extrabold text-slate-900 truncate">{r.name}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {r.employee_code} · {r.roles.join(', ')} · {KIND_LABEL[r.kind] || ''}
                </div>
              </div>
              <div className="text-right text-[11px] shrink-0">
                {r.attendance ? (
                  <>
                    <div className="font-bold text-emerald-700">
                      In {t(r.attendance.check_in_at)}
                      {r.attendance.check_out_at ? ` · Out ${t(r.attendance.check_out_at)}` : ''}
                    </div>
                    <div className="text-slate-400">
                      {r.attendance.status.replace(/_/g, ' ').toLowerCase()}
                      {r.attendance.source !== 'QR_SCAN' &&
                        ` · ${r.attendance.source === 'REMOTE' ? 'work from home' : r.attendance.source === 'FIELD' ? 'field work' : r.attendance.source.replace(/_/g, ' ').toLowerCase()}`}
                    </div>
                  </>
                ) : (
                  <div className="font-bold text-slate-400">
                    {r.attendance_required ? 'No check-in' : 'Attendance not required'}
                  </div>
                )}
              </div>
            </div>

            <RoleStats r={r} />

            {(r.work_log || []).length > 0 && (
              <ul className="text-[11px] space-y-1">
                {r.work_log.map((w) => (
                  <li key={w.id} className="flex gap-2">
                    <span className="text-slate-400 shrink-0">{t(w.at)}</span>
                    <span className="min-w-0">
                      <b className="text-slate-700">
                        {workLogEntryLabel(w)}
                        {w.count > 1 ? ` × ${w.count}` : ''}
                      </b>{' '}
                      <span className="text-slate-500">{w.note}</span>{' '}
                      {w.link && (
                        <a
                          href={w.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-navy-600 font-semibold"
                        >
                          open
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Active {t(r.first_action)} – {t(r.last_action)}
              </span>
              {r.leads_imported > 0 && <span>{r.leads_imported} leads imported</span>}
            </div>

            <div className="text-[11px] rounded-xl border border-slate-200 p-2">
              {r.report ? (
                <>
                  <div className="font-bold text-slate-700 flex items-center gap-1">
                    <PhoneCall className="w-3 h-3" /> Daily report ({t(r.report.submitted_at)})
                    {r.kind === 'CALLING' ? `: claimed ${r.report.reported_calls} calls` : ''}
                  </div>
                  <div className="text-slate-500 line-clamp-2">{r.report.summary}</div>
                </>
              ) : (
                <span className="text-slate-400">No daily report</span>
              )}
            </div>

            {r.flags.length > 0 && (
              <ul className="space-y-1">
                {r.flags.map((f) => (
                  <li
                    key={f}
                    className="text-[11px] font-bold text-amber-800 bg-amber-50 rounded-lg px-2 py-1 flex items-center gap-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
