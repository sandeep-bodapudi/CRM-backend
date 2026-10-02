import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, PhoneCall, Users } from 'lucide-react';
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
}

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
  const { fetchWithAuth } = useAuth();
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
                  {r.employee_code} · {r.roles.join(', ')}
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
                        ` · ${r.attendance.source.replace(/_/g, ' ').toLowerCase()}`}
                    </div>
                  </>
                ) : (
                  <div className="font-bold text-slate-400">
                    {r.attendance_required ? 'No check-in' : 'Attendance not required'}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 bg-slate-50 rounded-xl p-2">
              <Stat label="Calls" value={r.calls_logged} strong />
              <Stat label="Leads" value={r.leads_worked} strong />
              <Stat label="Contacted" value={r.contacted} />
              <Stat label="Qualified" value={r.qualified} />
              <Stat label="Dropped" value={r.dropped} />
              <Stat label="Visits" value={r.visits_completed} />
              <Stat label="Tasks" value={r.tasks_completed} />
            </div>

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
                    <PhoneCall className="w-3 h-3" /> Daily report ({t(r.report.submitted_at)}):
                    claimed {r.report.reported_calls} calls
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
