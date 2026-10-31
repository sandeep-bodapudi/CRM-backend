import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useReportToday } from '../reports/EndOfDayReportForm';

const istMinutes = () => {
  const ist = new Date(Date.now() + 5.5 * 3600e3);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
};

/** On the dashboard from 17:00: the end-of-day report is due before checkout. */
export const ReportDueCard: React.FC = () => {
  const { pathname } = useLocation();
  const onDashboard = pathname === '/dashboard';
  const late = istMinutes() >= 17 * 60;
  const { data } = useReportToday(onDashboard && late);
  if (!onDashboard || !late || !data || !data.required || data.report) return null;
  return (
    <div className="max-w-7xl mx-auto mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center gap-3">
      <FileText className="w-5 h-5 text-amber-700 shrink-0" />
      <p className="flex-1 min-w-[200px] text-sm text-amber-900">
        <span className="font-bold">End-of-day report due.</span> Checkout by QR needs it.
      </p>
      <Link
        to="/my-day#report"
        className="px-4 py-2.5 rounded-xl bg-navy-900 text-white text-sm font-black"
      >
        Write it now
      </Link>
    </div>
  );
};
