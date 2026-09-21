import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import {
  MapPin,
  CheckCircle2,
  Users,
  Briefcase,
  ChevronDown,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { StatCard, ListWidget, ListItem } from '../ui';
import { TaskManager } from '../tasks/TaskManager';
import { PerformanceScoreWidget } from '../performance/PerformanceScoreWidget';
import { useQuery } from '@tanstack/react-query';

export const AgentDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const [showOps, setShowOps] = useState(false);

  const {
    data,
    isLoading,
    isError: hasError,
  } = useQuery({
    queryKey: ['agentDashboardData'],
    queryFn: async () => {
      const [visitsRes, leadsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/site-visits`),
        // Explicit high limit: this only computes a count (myLeadsCount)
        // from the result, but without it the backend's own default (2000)
        // silently undercounts once this agent's scoped lead total passes
        // that — same class of bug fixed in TelecallerDashboard/
        // LeadManagement. No render-side pagination needed here since
        // individual leads are never rendered as cards, just counted.
        fetchWithAuth(`${API_BASE_URL}/leads?limit=100000`),
      ]);
      if (!visitsRes.ok) throw new Error('Failed to load site visits');

      const visitsData = await visitsRes.json();
      const visits = visitsData.visits || [];
      const myVisits = visits.filter((v: any) => v.assigned_agent_id === user?.id);

      const upcoming = myVisits.filter(
        (v: any) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(v.status),
      );
      const completedThisMonth = myVisits.filter((v: any) => {
        if (v.status !== 'COMPLETED' || !v.completed_at) return false;
        const completedDate = new Date(v.completed_at);
        const now = new Date();
        return (
          completedDate.getMonth() === now.getMonth() &&
          completedDate.getFullYear() === now.getFullYear()
        );
      });

      let myLeadsCount = 0;
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        myLeadsCount = (leadsData.leads || []).filter(
          (l: any) => l.assigned_to_id === user?.id,
        ).length;
      }

      const upcomingItems: ListItem[] = upcoming
        .sort(
          (a: any, b: any) =>
            new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime(),
        )
        .slice(0, 10)
        .map((v: any) => ({
          id: v.id,
          title: `Visit for ${v.customer?.customer_name || v.lead?.customer_name || 'Customer'}`,
          subtitle: new Date(v.scheduled_date).toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }),
          icon: MapPin,
          link: '/site-visits',
        }));

      return {
        upcomingCount: upcoming.length,
        completedCount: completedThisMonth.length,
        myLeadsCount,
        upcomingItems,
      };
    },
    enabled: !!user?.id,
  });

  const metrics = data || {
    upcomingCount: 0,
    completedCount: 0,
    myLeadsCount: 0,
    upcomingItems: [],
  };

  return (
    <div className="space-y-6 pb-20 sm:pb-6">
      <div className="flex items-center justify-between mb-2 p-6 rounded-3xl bg-gradient-to-r from-emerald-700 to-green-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-white tracking-tight">Field Agent Workspace</h1>
          <p className="text-emerald-100 text-sm mt-2 font-medium">
            Welcome back,{' '}
            <strong className="text-white bg-white/20 px-2 py-0.5 rounded-md">
              {user?.fullName || user?.employeeCode}
            </strong>
          </p>
        </div>
      </div>

      {hasError && (
        <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-danger-600" />
          Unable to load your visits. Please try again later.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Upcoming Visits"
          value={isLoading ? '...' : metrics.upcomingCount.toString()}
          icon={Calendar}
          link="/site-visits"
        />
        <StatCard
          label="Completed This Month"
          value={isLoading ? '...' : metrics.completedCount.toString()}
          icon={CheckCircle2}
          link="/site-visits"
        />
        <StatCard
          label="My Active Leads"
          value={isLoading ? '...' : metrics.myLeadsCount.toString()}
          icon={Users}
          link="/leads"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-6">
            <h3 className="font-black text-navy-900 mb-6 flex items-center gap-2 text-lg">
              <Briefcase className="w-5 h-5 text-emerald-600" /> Task Management
            </h3>
            <TaskManager />
          </div>
        </div>

        <div className="space-y-6">
          <ListWidget
            title="Upcoming Visits"
            items={metrics.upcomingItems}
            emptyStateMessage="No visits scheduled right now."
            viewAllLink="/site-visits"
          />

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
            <button
              onClick={() => setShowOps(!showOps)}
              className="w-full flex items-center justify-between p-5 text-sm font-black text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${showOps ? 'rotate-180' : ''}`}
                  />
                </span>
                <span>Operational Metrics (Attendance & Performance)</span>
              </div>
            </button>
            {showOps && (
              <div className="p-5 border-t border-slate-100 bg-white/50">
                <PerformanceScoreWidget />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
