import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PerformanceScoreWidget } from '../performance/PerformanceScoreWidget';
import { TaskManager } from '../tasks/TaskManager';
import { Briefcase, Calendar, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { StatCard } from '../ui';
import { API_BASE_URL } from '../../config';

export const StaffDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const [showOps, setShowOps] = useState(false);
  const [metrics, setMetrics] = useState({ leads: 0, visits: 0, tasks: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [leadsRes, visitsRes, tasksRes] = await Promise.all([
          // Explicit high limit: leadsCount below is computed by filtering
          // this array, so the backend's own default (2000) would silently
          // undercount it once this staff member's scoped lead total passes
          // that — same class of bug fixed in TelecallerDashboard/
          // LeadManagement. No render-side pagination needed here since
          // individual leads are never rendered as cards, just counted.
          fetchWithAuth(`${API_BASE_URL}/leads?limit=100000`),
          fetchWithAuth(`${API_BASE_URL}/site-visits`),
          fetchWithAuth(`${API_BASE_URL}/tasks/my-tasks`),
        ]);

        let leadsCount = 0;
        if (leadsRes.ok) {
          const leadsData = await leadsRes.json();
          // Filter leads assigned to this user and not yet BOOKED or DEAD
          leadsCount = (leadsData.leads || []).filter(
            (l: any) =>
              l.assigned_to_id === user?.id && !['BOOKED', 'DEAD', 'LOST'].includes(l.status),
          ).length;
        }

        let visitsCount = 0;
        if (visitsRes.ok) {
          const visitsData = await visitsRes.json();
          // Filter active site visits assigned to user (as PM or agent)
          visitsCount = (visitsData.visits || []).filter(
            (v: any) =>
              (v.project_manager_id === user?.id || v.assigned_agent_id === user?.id) &&
              !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(v.status),
          ).length;
        }

        let tasksCount = 0;
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          // Filter open tasks
          tasksCount = (tasksData.tasks || []).filter(
            (t: any) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED',
          ).length;
        }

        setMetrics({ leads: leadsCount, visits: visitsCount, tasks: tasksCount });
      } catch (error) {
        console.error('Failed to load dashboard metrics', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [fetchWithAuth, user]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">My Workspace</h1>
          <p className="text-slate-500 text-sm mt-1">
            Welcome back,{' '}
            <strong className="text-navy-700">{user?.fullName || user?.employeeCode}</strong>.
            Manage your pipeline and tasks.
          </p>
        </div>
      </div>

      {/* Primary KPI Row - CRM Focused */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="My Active Leads"
          value={isLoading ? '...' : metrics.leads.toString()}
          icon={Users}
          link="/leads"
        />
        <StatCard
          label="Upcoming Visits"
          value={isLoading ? '...' : metrics.visits.toString()}
          icon={Calendar}
          link="/site-visits"
        />
        <StatCard
          label="My Tasks"
          value={isLoading ? '...' : metrics.tasks.toString()}
          icon={Briefcase}
          link="/tasks"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h3 className="font-bold text-navy-900 mb-4">Task Management</h3>
            <TaskManager />
          </div>
        </div>

        <div className="space-y-6">
          {/* Operational Widgets moved to a collapsible section or secondary view */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setShowOps(!showOps)}
              className="w-full flex items-center justify-between p-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <span>Operational Metrics (Attendance & Performance)</span>
              {showOps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showOps && (
              <div className="p-4 border-t border-slate-200 bg-white">
                <PerformanceScoreWidget />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
