import React, { useState } from 'react';
import { MyWorkSummary } from './MyWorkSummary';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Sparkles, Clock, CheckCircle2, Briefcase, ChevronDown, AlertCircle } from 'lucide-react';
import { StatCard, ListWidget, ListItem } from '../ui';
import { TaskManager } from '../tasks/TaskManager';
import { PerformanceScoreWidget } from '../performance/PerformanceScoreWidget';
import { useQuery } from '@tanstack/react-query';

export const DigitalMarketingExecutiveDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const [showOps, setShowOps] = useState(false);

  const {
    data,
    isLoading,
    isError: hasError,
  } = useQuery({
    queryKey: ['dmExecutiveDashboardData'],
    queryFn: async () => {
      // GET /properties auto-scopes to this DM Executive's own dm_executive_id
      // assignment (see routes/properties/crud.ts's isDMExecutiveOnly check).
      const res = await fetchWithAuth(`${API_BASE_URL}/properties`);
      if (!res.ok) throw new Error('Failed to load assigned properties');
      const propData = await res.json();
      const properties = propData.properties || [];

      const pending = properties.filter((p: any) => p.status === 'PENDING_DM_POLISH');
      const completed = properties.filter((p: any) => p.status !== 'PENDING_DM_POLISH');

      const pendingItems: ListItem[] = pending.slice(0, 10).map((p: any) => ({
        id: p.id,
        title: p.title || p.property_code || `Property #${p.id}`,
        subtitle: p.project?.name || p.city || 'No project',
        icon: Sparkles,
        link: '/properties',
      }));

      return {
        assignedCount: properties.length,
        pendingCount: pending.length,
        completedCount: completed.length,
        pendingItems,
      };
    },
    enabled: !!user?.id,
  });

  const metrics = data || {
    assignedCount: 0,
    pendingCount: 0,
    completedCount: 0,
    pendingItems: [],
  };

  return (
    <div className="space-y-6 pb-20 sm:pb-6">
      <MyWorkSummary />
      <div className="flex items-center justify-between mb-2 p-6 rounded-3xl bg-gradient-to-r from-pink-600 to-rose-700 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-white tracking-tight">My Content Queue</h1>
          <p className="text-pink-100 text-sm mt-2 font-medium">
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
          Unable to load your assigned properties. Please try again later.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Assigned to Me"
          value={isLoading ? '...' : metrics.assignedCount.toString()}
          icon={Briefcase}
          link="/properties"
        />
        <StatCard
          label="Awaiting Polish"
          value={isLoading ? '...' : metrics.pendingCount.toString()}
          icon={Clock}
          link="/properties"
        />
        <StatCard
          label="Completed"
          value={isLoading ? '...' : metrics.completedCount.toString()}
          icon={CheckCircle2}
          link="/properties"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-6">
            <h3 className="font-black text-navy-900 mb-6 flex items-center gap-2 text-lg">
              <Briefcase className="w-5 h-5 text-pink-600" /> Task Management
            </h3>
            <TaskManager />
          </div>
        </div>

        <div className="space-y-6">
          <ListWidget
            title="My Polish Queue"
            items={metrics.pendingItems}
            emptyStateMessage="Nothing waiting on you right now."
            viewAllLink="/properties"
          />

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
            <button
              onClick={() => setShowOps(!showOps)}
              className="w-full flex items-center justify-between p-5 text-sm font-black text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-600">
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
