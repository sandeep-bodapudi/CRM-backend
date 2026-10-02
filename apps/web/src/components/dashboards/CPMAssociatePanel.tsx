import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Handshake, NotebookPen, PhoneCall, UserPlus, Building2, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import type { AssociateRef } from '../worklog/workLogKinds';

interface CpmSummary {
  date: string;
  today: Record<string, number>;
  month: Record<string, number>;
  leads_from_associates_month: number;
  visits_from_associates_month: number;
  associates_total: number;
  not_contacted_7_days: AssociateRef[];
  recent_associates: AssociateRef[];
}

const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

// Month targets from the CPM daily-report preset (apps/api targets.ts),
// as monthly figures for a ~25 working-day month.
const MONTH_GOALS: {
  key: string;
  label: string;
  goal: number;
  value: (s: CpmSummary) => number;
}[] = [
  {
    key: 'prospects',
    label: 'New prospects',
    goal: 10,
    value: (s) => (s.month.ASSOCIATE_PROSPECT || 0) + s.leads_from_associates_month,
  },
  {
    key: 'visits',
    label: 'Site visits via associates',
    goal: 5,
    value: (s) => (s.month.ASSOCIATE_SITE_VISIT || 0) + s.visits_from_associates_month,
  },
  {
    key: 'office',
    label: "Associates' office visits",
    goal: 3,
    value: (s) => s.month.ASSOCIATE_OFFICE_VISIT || 0,
  },
];

/**
 * Channel Partner Manager dashboard header: their day is spent with
 * associates (external agents), recorded through the Work Log, not on
 * telecaller-style lead calls.
 */
export const CPMAssociatePanel: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { data } = useQuery({
    queryKey: ['cpmSummary'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/work-log/cpm-summary`);
      if (!res.ok) throw new Error('Failed');
      return (await res.json()) as CpmSummary;
    },
    refetchOnWindowFocus: true,
  });

  const t = data?.today || {};
  const tiles = [
    {
      label: 'Associate calls today',
      value: (t.ASSOCIATE_CALL || 0) + (t.ASSOCIATE_NEW_CALL || 0),
      icon: PhoneCall,
    },
    { label: 'Office visits today', value: t.ASSOCIATE_OFFICE_VISIT || 0, icon: Building2 },
    { label: 'Enrollments today', value: t.ASSOCIATE_ENROLLMENT || 0, icon: UserPlus },
    { label: 'Site visits today', value: t.ASSOCIATE_SITE_VISIT || 0, icon: MapPin },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"
          >
            <tile.icon className="w-5 h-5 text-navy-600" />
            <div className="text-2xl font-black text-slate-900 mt-2">{tile.value}</div>
            <div className="text-xs font-bold text-slate-500">{tile.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-navy-900 flex items-center gap-2">
              <Handshake className="w-4 h-4" /> This month
            </h3>
            <Link
              to="/work-log"
              className="text-xs font-bold text-white bg-navy-700 hover:bg-navy-800 px-3 py-2 rounded-xl flex items-center gap-1.5"
            >
              <NotebookPen className="w-3.5 h-3.5" /> Log associate work
            </Link>
          </div>
          {data &&
            MONTH_GOALS.map((g) => {
              const v = g.value(data);
              const pct = Math.min(100, Math.round((v / g.goal) * 100));
              return (
                <div key={g.key}>
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span>{g.label}</span>
                    <span>
                      {v} / {g.goal}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-navy-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          {data && (
            <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 pt-1">
              <span>Associates worked with: {data.associates_total}</span>
              <span>Enrollments: {data.month.ASSOCIATE_ENROLLMENT || 0}</span>
              <span>Bookings via associates: {data.month.ASSOCIATE_BOOKING || 0}</span>
              <span>Leads you entered: {data.leads_from_associates_month}</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-2">
          <h3 className="font-bold text-navy-900 text-sm">Not contacted in 7+ days</h3>
          {!data || data.not_contacted_7_days.length === 0 ? (
            <p className="text-xs text-slate-400">
              {data && data.associates_total === 0
                ? 'Log associate calls and visits in the Work Log to track follow-ups here.'
                : 'Everyone has been contacted this week.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.not_contacted_7_days.map((a) => (
                <li key={(a.associate_id || '') + a.name} className="py-2 text-sm">
                  <div className="font-bold text-slate-800">{a.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {a.associate_id ? `${a.associate_id} · ` : ''}
                    {daysAgo(a.last_contact)} days ago
                    {a.phone ? ` · ${a.phone}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
