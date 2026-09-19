import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import {
  Users,
  Medal,
  TrendingUp,
  Calendar,
  AlertCircle,
  Clock,
  ShieldAlert,
  Award,
  Activity,
  PhoneCall,
  CheckCircle,
  Target,
} from 'lucide-react';
import {
  SalesManagerDashboardData,
  PipelineStageCount,
  TeamPerformanceRow,
  LeadAttributionRow,
  StalledLeadRow,
  OverdueTaskRow,
} from '../../types';
import { StatCard, ListWidget, ListItem, DataTable } from '../ui';

import { ActiveSiteVisitsBanner } from '../siteVisits/ActiveSiteVisitsBanner';

export const SalesManagerDashboard: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [data, setData] = useState<SalesManagerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/analytics/sales-manager`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error('Failed to load Sales Manager dashboard', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [fetchWithAuth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-navy-700">
        <div className="w-8 h-8 border-4 border-navy-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!data)
    return (
      <div className="text-red-500 p-4 bg-red-50 rounded-lg">Failed to load dashboard data.</div>
    );

  const {
    kpis,
    pipeline,
    teamPerformance,
    leadAttribution,
    stalledLeads,
    recoveredUnassignedLeads,
    overdueTasks,
    siteVisits,
    targets,
  } = data;

  // Prepare ListWidget data for Recovered Leads
  const recoveredItems: ListItem[] =
    recoveredUnassignedLeads?.map((l) => ({
      id: String(l.id),
      title: `Lead #${l.id} - ${l.customer_name || 'No Name'}`,
      subtitle: 'Waiting for Assignment',
      value: new Date(l.created_at || '').toLocaleDateString('en-IN'),
      icon: AlertCircle,
      color: 'text-amber-500',
      link: `/leads/${l.id}`,
    })) || [];

  // Prepare ListWidget data for Stalled Leads
  const stalledItems: ListItem[] = stalledLeads.map((l) => ({
    id: String(l.id),
    title: `Lead #${l.id}`,
    subtitle: l.assigned_to?.full_name || 'Unassigned',
    value: new Date(l.last_contacted_at || l.created_at || '').toLocaleDateString('en-IN'),
    icon: ShieldAlert,
    link: `/leads/${l.id}`,
  }));

  // Prepare ListWidget data for Overdue Tasks
  const taskItems: ListItem[] = overdueTasks.map((t) => ({
    id: String(t.id),
    title: t.lead?.customer_name || 'No Lead',
    subtitle: t.assignee?.full_name || 'Unassigned',
    value: new Date(t.target_date || '').toLocaleDateString('en-IN'),
    icon: Clock,
    link: `/tasks`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
            Sales Manager Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Monitor team pipeline execution and performance.
          </p>
        </div>
      </div>

      <ActiveSiteVisitsBanner />

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Team Lead Load" value={kpis.totalLeads} icon={Users} link="/leads" />
        <StatCard
          label="Conversion Rate"
          value={`${kpis.conversionRate.toFixed(1)}%`}
          icon={TrendingUp}
          link="/leads"
        />
        <StatCard
          label="Site Visits (This Week)"
          value={kpis.siteVisits}
          icon={Calendar}
          link="/site-visits"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Lead Attribution */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-navy-900 flex items-center gap-2">
                <Medal className="w-4 h-4 text-gold-500" />
                Top Lead Introducers
              </h3>
            </div>

            <div className="max-h-72 md:max-h-96 overflow-y-auto overscroll-contain pr-1 flex-1">
              <DataTable
                columns={[
                  { key: 'employee', header: 'Introduced By' },
                  { key: 'introduced', header: 'Introduced' },
                  { key: 'qualified', header: 'Qualified' },
                  { key: 'won', header: 'Won' },
                  { key: 'conv', header: 'Conv. %' },
                ]}
                data={leadAttribution.map((la) => ({
                  id: la.employee.id,
                  employee: (
                    <div className="font-semibold text-navy-900">{la.employee.full_name}</div>
                  ),
                  introduced: <span className="font-bold text-navy-700">{la.leadsIntroduced}</span>,
                  qualified: <span className="font-medium text-navy-800">{la.qualified}</span>,
                  won: <span className="font-bold text-success">{la.won}</span>,
                  conv: `${la.conversionRate.toFixed(1)}%`,
                }))}
                emptyMessage="No lead-source data yet."
              />
            </div>
          </div>

          {/* Distinctive Widget: Team distribution view */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-navy-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-action" />
                Team Distribution
              </h3>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                Operational - Active Load
              </span>
            </div>

            <div className="max-h-72 md:max-h-96 overflow-y-auto overscroll-contain pr-1 flex-1">
              <DataTable
                columns={[
                  { key: 'employee', header: 'Employee' },
                  { key: 'assigned', header: 'Assigned' },
                  { key: 'contacted', header: 'Contacted' },
                  { key: 'qualified', header: 'Qualified' },
                  { key: 'won', header: 'Won' },
                  { key: 'conv', header: 'Conv. %' },
                ]}
                data={teamPerformance.map((tp) => ({
                  id: tp.employee.id,
                  employee: (
                    <div className="font-semibold text-navy-800">{tp.employee.full_name}</div>
                  ),
                  assigned: tp.assignedLeads,
                  contacted: tp.contacted,
                  qualified: tp.qualified,
                  won: <span className="font-bold text-navy-600">{tp.won}</span>,
                  conv: `${tp.conversionRate.toFixed(1)}%`,
                }))}
                emptyMessage="No team performance data available."
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {recoveredItems.length > 0 && (
            <ListWidget
              title="Recovered but Unassigned"
              items={recoveredItems}
              emptyStateMessage="No stuck recovered leads."
              viewAllLink="/leads"
            />
          )}

          <ListWidget
            title="Stalled Leads (>7 Days)"
            items={stalledItems}
            emptyStateMessage="No stalled leads. Good job!"
            viewAllLink="/leads"
          />

          <ListWidget
            title="Overdue Follow-ups"
            items={taskItems}
            emptyStateMessage="No overdue tasks. All caught up!"
            viewAllLink="/tasks"
          />

          {/* Target Progress (Repurposed as simple custom widget to retain logic) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-navy-900 mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-danger" />
              Target vs Actual
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold text-slate-700">
                <span>Revenue Target</span>
                <span>{targets.targetAttainmentPercentage?.toFixed(1) || 0}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${targets.targetAttainmentPercentage >= 100 ? 'bg-success' : 'bg-danger'}`}
                  style={{ width: `${Math.min(targets.targetAttainmentPercentage || 0, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
