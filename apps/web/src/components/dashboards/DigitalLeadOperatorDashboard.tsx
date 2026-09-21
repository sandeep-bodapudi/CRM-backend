import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import {
  Users,
  UserX,
  Inbox,
  PhoneCall,
  Upload,
  Briefcase,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import { StatCard, ListWidget, ListItem } from '../ui';
import { TaskManager } from '../tasks/TaskManager';
import { PerformanceScoreWidget } from '../performance/PerformanceScoreWidget';
import { useQuery } from '@tanstack/react-query';

export const DigitalLeadOperatorDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const [showOps, setShowOps] = useState(false);

  const {
    data,
    isLoading,
    isError: hasError,
  } = useQuery({
    queryKey: ['dloDashboardData'],
    queryFn: async () => {
      const [leadsRes, monitorRes] = await Promise.all([
        // Explicit high limit: totalLeads/unassigned/newToday below are all
        // computed by filtering this array, so the backend's own default
        // (2000) would silently undercount these stats once the company's
        // scoped lead total passes that — same class of bug fixed in
        // TelecallerDashboard/LeadManagement. No render-side pagination
        // needed here since individual leads are never rendered as cards.
        fetchWithAuth(`${API_BASE_URL}/leads?limit=100000`),
        fetchWithAuth(`${API_BASE_URL}/leads/distribution-monitor`),
      ]);
      if (!leadsRes.ok) throw new Error('Failed to load leads');

      const leadsData = await leadsRes.json();
      const leads = leadsData.leads || [];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const totalLeads = leads.length;
      const unassigned = leads.filter((l: any) => !l.assigned_to_id).length;
      const newToday = leads.filter((l: any) => new Date(l.created_at) >= todayStart).length;

      let telecallerLoad: ListItem[] = [];
      let activeTelecallers = 0;
      if (monitorRes.ok) {
        const monitorData = await monitorRes.json();
        const telecallers = monitorData.telecallers || [];
        activeTelecallers = telecallers.length;
        telecallerLoad = [...telecallers]
          .sort((a: any, b: any) => (b.activeLeadCount || 0) - (a.activeLeadCount || 0))
          .slice(0, 8)
          .map((tc: any) => ({
            id: tc.id,
            title: tc.fullName || tc.full_name || 'Unknown',
            subtitle: tc.employeeCode || tc.employee_code || '',
            meta: `${tc.activeLeadCount ?? 0} active`,
            icon: PhoneCall,
            link: '/leads',
          }));
      }

      return { totalLeads, unassigned, newToday, activeTelecallers, telecallerLoad };
    },
    enabled: !!user?.id,
  });

  const metrics = data || {
    totalLeads: 0,
    unassigned: 0,
    newToday: 0,
    activeTelecallers: 0,
    telecallerLoad: [],
  };

  return (
    <div className="space-y-6 pb-20 sm:pb-6">
      <div className="flex items-center justify-between mb-2 p-6 rounded-3xl bg-gradient-to-r from-cyan-700 to-teal-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-white tracking-tight">Lead Operations</h1>
          <p className="text-teal-100 text-sm mt-2 font-medium">
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
          Unable to load lead operations data. Please try again later.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Leads"
          value={isLoading ? '...' : metrics.totalLeads.toString()}
          icon={Users}
          link="/leads"
        />
        <StatCard
          label="Unassigned Pool"
          value={isLoading ? '...' : metrics.unassigned.toString()}
          icon={UserX}
          link="/leads"
        />
        <StatCard
          label="New Today"
          value={isLoading ? '...' : metrics.newToday.toString()}
          icon={Inbox}
          link="/leads"
        />
        <StatCard
          label="Active Telecallers"
          value={isLoading ? '...' : metrics.activeTelecallers.toString()}
          icon={PhoneCall}
          link="/leads"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-6">
            <h3 className="font-black text-navy-900 mb-6 flex items-center gap-2 text-lg">
              <Briefcase className="w-5 h-5 text-teal-600" /> Task Management
            </h3>
            <TaskManager />
          </div>
        </div>

        <div className="space-y-6">
          <ListWidget
            title="Telecaller Load Balance"
            items={metrics.telecallerLoad}
            emptyStateMessage="No active telecaller assignments."
            viewAllLink="/leads"
          />

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
            <button
              onClick={() => setShowOps(!showOps)}
              className="w-full flex items-center justify-between p-5 text-sm font-black text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-600">
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
