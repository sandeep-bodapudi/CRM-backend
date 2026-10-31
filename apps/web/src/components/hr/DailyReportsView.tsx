import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Calendar, CheckCircle2, FileText, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface ReportRow {
  id: number;
  employee_id: number;
  submitted_at: string;
  summary: string;
  target_met: boolean;
  below_target_reason: string | null;
  metrics_json: Record<string, any> | null;
  employee: { full_name: string | null; employee_code: string; department: string | null };
}

interface Missing {
  id: number;
  full_name: string | null;
  employee_code: string;
  checked_in_at: string;
  checked_out_at: string | null;
}

interface Detail {
  report: ReportRow;
  labels: Record<string, string>;
  work_log: {
    id: number;
    kind: string;
    title: string | null;
    note: string;
    count: number;
    associate_name: string | null;
    at: string;
  }[];
  edits: { at: string; before: any; after: any }[];
}

const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
// "leadsQualified" / "work_log" -> "Leads qualified" / "Work log" (older reports).
const words = (k: string) =>
  k
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

/**
 * Rows of "field | recorded by the CRM | typed by the person". Reports since
 * 2026-10-19 keep `recorded` and `typed`; older ones kept a flat object with
 * verified_* numbers from the server.
 */
function rowsOf(m: Record<string, any> | null, labels: Record<string, string>) {
  if (!m) return [];
  if (m.recorded || m.typed) {
    const ids = [...new Set([...Object.keys(m.recorded || {}), ...Object.keys(m.typed || {})])];
    return ids.map((id) => ({
      label: labels[id] || words(id),
      recorded: m.recorded?.[id] ?? null,
      typed: m.typed?.[id] ?? null,
    }));
  }
  const rows: { label: string; recorded: any; typed: any }[] = [
    { label: 'Calls', recorded: m.verified_calls ?? null, typed: m.callsMade ?? null },
    { label: 'Site visits', recorded: m.verified_visits ?? null, typed: m.siteVisits ?? null },
    { label: 'Bookings', recorded: m.verified_deals ?? null, typed: null },
  ];
  for (const [k, v] of Object.entries(m)) {
    if (k.startsWith('verified_') || k.startsWith('reported_')) continue;
    if (['callsMade', 'siteVisits', 'feedback'].includes(k) || typeof v === 'boolean') continue;
    rows.push({ label: words(k), recorded: null, typed: v });
  }
  return rows.filter((r) => r.recorded !== null || (r.typed !== null && r.typed !== ''));
}

const cell = (v: any) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** HR / MD: who sent the end-of-day report, who has not, and each report in full. */
export const DailyReportsView: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [date, setDate] = useState(istToday);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['hrDailyReports', date],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/reports/all?date=${date}`);
      if (!res.ok) throw new Error('Failed');
      return (await res.json()) as { reports: ReportRow[]; missing: Missing[] };
    },
  });

  const { data: detail } = useQuery({
    queryKey: ['hrDailyReport', openId],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/reports/${openId}`);
      if (!res.ok) throw new Error('Failed');
      return (await res.json()) as Detail;
    },
    enabled: openId !== null,
  });

  const reports = data?.reports || [];
  const missing = data?.missing || [];

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-24 md:pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-navy-900">End-of-day reports</h1>
          <p className="text-sm text-slate-500">
            {reports.length} sent · {missing.length} not sent
          </p>
        </div>
        <label className="relative">
          <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="date"
            value={date}
            max={istToday()}
            onChange={(e) => setDate(e.target.value || istToday())}
            className="pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
          />
        </label>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>
      ) : (
        <>
          {missing.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <h2 className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Not sent yet ({missing.length})
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {missing.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3">
                    <span className="font-semibold text-slate-800 truncate">
                      {m.full_name || m.employee_code}
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      in {time(m.checked_in_at)}
                      {m.checked_out_at ? ` · out ${time(m.checked_out_at)}` : ' · still in'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {reports.length === 0 ? (
            <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No reports for this day.</p>
            </div>
          ) : (
            <ul className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {reports.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setOpenId(r.id)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">
                        {r.employee.full_name || r.employee.employee_code}{' '}
                        <span className="font-normal text-slate-400">
                          {r.employee.employee_code} · {time(r.submitted_at)}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-1">{r.summary}</p>
                    </div>
                    {r.target_met ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                        <CheckCircle2 className="w-3 h-3" /> On target
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-0.5">
                        Below target
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {openId !== null && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 relative">
            <button
              onClick={() => setOpenId(null)}
              aria-label="Close"
              className="absolute top-3 right-3 p-2 rounded-full text-slate-400 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
            {!detail ? (
              <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>
            ) : (
              <div className="space-y-4">
                <div className="pr-10">
                  <h2 className="text-lg font-bold text-navy-900">
                    {detail.report.employee.full_name || detail.report.employee.employee_code}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Sent {time(detail.report.submitted_at)}
                    {detail.edits.length > 0 &&
                      ` · corrected ${detail.edits.length} time${detail.edits.length === 1 ? '' : 's'}`}
                  </p>
                </div>

                {rowsOf(detail.report.metrics_json, detail.labels).length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase text-slate-400 text-left">
                        <th className="py-1 font-bold">Work</th>
                        <th className="py-1 font-bold text-right">CRM</th>
                        <th className="py-1 font-bold text-right">They said</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rowsOf(detail.report.metrics_json, detail.labels).map((r) => (
                        <tr key={r.label}>
                          <td className="py-1.5 text-slate-700">{r.label}</td>
                          <td className="py-1.5 text-right font-bold text-navy-900">
                            {cell(r.recorded)}
                          </td>
                          <td
                            className={`py-1.5 text-right ${r.recorded !== null && r.typed !== null && r.typed !== '' && Number(r.typed) !== Number(r.recorded) ? 'font-bold text-amber-700' : 'text-slate-600'}`}
                          >
                            {cell(r.typed)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 mb-1">Summary</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-3">
                    {detail.report.summary}
                  </p>
                </div>
                {detail.report.below_target_reason && (
                  <div>
                    <p className="text-[11px] font-bold uppercase text-rose-500 mb-1">
                      Why below target
                    </p>
                    <p className="text-sm text-rose-800 bg-rose-50 rounded-xl p-3">
                      {detail.report.below_target_reason}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Work outside the CRM that day
                  </p>
                  {detail.work_log.length === 0 ? (
                    <p className="text-sm text-slate-400">Nothing logged.</p>
                  ) : (
                    <ul className="text-sm divide-y divide-slate-100">
                      {detail.work_log.map((w) => (
                        <li key={w.id} className="py-1.5 flex justify-between gap-3">
                          <span className="text-slate-700">
                            {w.title || words(w.kind)}
                            {w.count > 1 ? ` × ${w.count}` : ''}
                            {w.associate_name ? ` · ${w.associate_name}` : ''}
                            {w.note ? (
                              <span className="block text-xs text-slate-500">{w.note}</span>
                            ) : null}
                          </span>
                          <span className="text-xs text-slate-400 shrink-0">{time(w.at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {detail.edits.length > 0 && (
                  <details>
                    <summary className="text-xs font-bold text-navy-700 cursor-pointer py-1">
                      Corrections ({detail.edits.length})
                    </summary>
                    <ul className="mt-2 space-y-2 text-xs">
                      {detail.edits.map((e, i) => (
                        <li key={i} className="bg-slate-50 rounded-xl p-2">
                          <p className="font-bold text-slate-600">{time(e.at)}</p>
                          <p className="text-slate-500">Before: {e.before?.summary}</p>
                          <p className="text-slate-700">After: {e.after?.summary}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
