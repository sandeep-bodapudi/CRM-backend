import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, CheckCircle2, Clock, FileText, NotebookPen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { WorkLogPage } from '../worklog/WorkLogPage';
import { EndOfDayReportForm, useReportToday } from '../reports/EndOfDayReportForm';
import { EmergencyLogoutModal } from '../profile/EmergencyLogoutModal';

interface PastReport {
  id: number;
  submitted_at: string;
  summary: string;
  target_met: boolean;
}

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

/**
 * My Day: the work done outside the CRM (Work Log) and the end-of-day report,
 * which is needed before the QR checkout. Replaces the separate Work Log and
 * Daily Report pages (2026-10-19).
 */
export const MyDayPage: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { data } = useReportToday();
  const [showHistory, setShowHistory] = useState(false);
  const [earlyOut, setEarlyOut] = useState(false);

  const { data: history } = useQuery({
    queryKey: ['myReportHistory'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/reports/my-history?days=14`);
      if (!res.ok) return [] as PastReport[];
      return ((await res.json()).reports || []) as PastReport[];
    },
    enabled: showHistory,
  });

  const report = data?.report;
  // Opened from a reminder or the dashboard card: go straight to the report.
  const loaded = !!data;
  useEffect(() => {
    if (loaded && window.location.hash === '#report')
      document.getElementById('report')?.scrollIntoView({ block: 'start' });
  }, [loaded]);
  const jump = () =>
    document.getElementById('report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24 md:pb-6">
      <div>
        <h1 className="text-2xl font-black text-navy-900">My Day</h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'Asia/Kolkata',
          })}
        </p>
      </div>

      {/* ---- Where the report stands ---- */}
      {data && (data.required || report) && (
        <div
          className={`rounded-2xl border p-4 flex flex-wrap items-center gap-3 ${
            !report
              ? 'bg-amber-50 border-amber-200'
              : data.checked_out
                ? 'bg-slate-50 border-slate-200'
                : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          {!report ? (
            <>
              <Clock className="w-5 h-5 text-amber-700 shrink-0" />
              <p className="flex-1 min-w-[200px] text-sm text-amber-900">
                <span className="font-bold">End-of-day report not sent yet.</span> It is needed
                before you check out by QR.
              </p>
              <button
                onClick={jump}
                className="px-4 py-2.5 rounded-xl bg-navy-900 text-white text-sm font-black"
              >
                Write it now
              </button>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              <p className="flex-1 min-w-[200px] text-sm text-slate-800">
                <span className="font-bold">Report sent at {time(report.submitted_at)}.</span>{' '}
                {data.checked_out
                  ? 'You have checked out; the report is final.'
                  : 'Scan the QR to check out. You can correct the report until then.'}
              </p>
            </>
          )}
        </div>
      )}

      {/* ---- Work outside the CRM ---- */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
        <h2 className="font-bold text-navy-900 flex items-center gap-2">
          <NotebookPen className="w-5 h-5 text-navy-600" /> Work outside the CRM
        </h2>
        <WorkLogPage embedded />
      </section>

      {/* ---- End-of-day report ---- */}
      <section
        id="report"
        className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3 scroll-mt-20"
      >
        <h2 className="font-bold text-navy-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-navy-600" /> End-of-day report
        </h2>
        <EndOfDayReportForm />
        <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
          Leaving before 18:00?{' '}
          <button
            onClick={() => setEarlyOut(true)}
            className="tap-inline font-bold text-navy-700 underline"
          >
            Ask for an early checkout
          </button>
        </p>
      </section>

      {/* ---- Past reports ---- */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="w-full flex items-center justify-between font-bold text-navy-900"
        >
          <span className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-navy-600" /> Past reports (14 days)
          </span>
          <span className="text-xs text-slate-500">{showHistory ? 'Hide' : 'Show'}</span>
        </button>
        {showHistory && (
          <ul className="mt-3 divide-y divide-slate-100">
            {(history || []).length === 0 && (
              <li className="py-3 text-sm text-slate-400">No reports in the last 14 days.</li>
            )}
            {(history || []).map((r) => (
              <li key={r.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">
                    {dayLabel(r.submitted_at)}{' '}
                    <span className="font-normal text-slate-400">{time(r.submitted_at)}</span>
                  </p>
                  <p className="text-xs text-slate-500 line-clamp-2">{r.summary}</p>
                </div>
                <span
                  className={`shrink-0 text-[11px] font-bold rounded px-2 py-0.5 border ${r.target_met ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}
                >
                  {r.target_met ? 'On target' : 'Below target'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {earlyOut && <EmergencyLogoutModal onClose={() => setEarlyOut(false)} />}
    </div>
  );
};
