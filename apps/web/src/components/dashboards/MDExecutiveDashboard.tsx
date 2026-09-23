import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { ExecMetricsData } from '../../types';
import {
  Users,
  Award,
  IndianRupee,
  Clock,
  AlertCircle,
  ShieldCheck,
  Building,
  ArrowRightLeft,
  FileText,
  Activity,
  Map as MapIcon,
  Percent,
} from 'lucide-react';
import { StatCard, ListWidget, ListItem } from '../ui';
import { getTimeBasedGreeting } from '../../utils/greeting';
import { UnassignedPropertiesWidget } from '../md/UnassignedPropertiesWidget';
import { MDEscalationQueue } from '../md/MDEscalationQueue';
import { LeadPipelineTabs } from '../md/LeadPipelineTabs';

const ClockWidget: React.FC = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-gradient-to-br from-navy-900 to-navy-950 rounded-3xl p-6 shadow-xl border border-navy-800 text-white flex flex-col justify-center h-full relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-10">
        <Clock className="w-24 h-24" />
      </div>
      <div className="text-sm font-semibold text-gold-400 mb-1 uppercase tracking-widest">
        {time.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
      </div>
      <div className="text-4xl font-black tracking-tight">
        {time.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </div>
    </div>
  );
};

export const MDExecutiveDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const navigate = useNavigate();
  const [execMetrics, setExecMetrics] = useState<ExecMetricsData | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [pmRouting, setPmRouting] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [greeting, setGreeting] = useState(getTimeBasedGreeting());

  useEffect(() => {
    const timer = setInterval(() => setGreeting(getTimeBasedGreeting()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchMDData = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/md/executive-metrics`);
      const data = await res.json();
      if (res.ok) {
        setExecMetrics(data);
      } else {
        setHasError(true);
      }

      const activityRes = await fetchWithAuth(`${API_BASE_URL}/md/recent-activity`);
      const activityData = await activityRes.json();
      if (activityRes.ok) setRecentActivity(activityData.activity || []);

      const routingRes = await fetchWithAuth(`${API_BASE_URL}/pm-routing`);
      const routingData = await routingRes.json();
      if (routingRes.ok) setPmRouting(routingData || []);
    } catch (e) {
      console.error('Fetch MD executive metrics error:', e);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMDData();
  }, []);

  // Compute KPIs
  const totalLeads = execMetrics?.totalLeadsCount || 0;
  const bookings = execMetrics?.totalClosedDeals || 0;
  const formatLakhs = (amount: number) => `₹${(amount / 100000).toFixed(1)}L`;
  const salesValue = formatLakhs(execMetrics?.salesValue || 0);
  const duePayments = formatLakhs(execMetrics?.duePayments || 0);

  // Prepare Alerts
  const crmAlerts: ListItem[] = [];
  const operationalAlerts: ListItem[] = [];

  if (execMetrics?.attendanceExceptionsCount) {
    operationalAlerts.push({
      id: 'att-ex',
      title: `${execMetrics.attendanceExceptionsCount} Attendance Exception${execMetrics.attendanceExceptionsCount === 1 ? '' : 's'}`,
      subtitle: 'Requires HR/Manager review',
      icon: Clock,
      link: '/hr-attendance',
    });
  }
  if (execMetrics?.pendingLeaveRequestsCount) {
    operationalAlerts.push({
      id: 'leave-req',
      title: `${execMetrics.pendingLeaveRequestsCount} Pending Leave Request${execMetrics.pendingLeaveRequestsCount === 1 ? '' : 's'}`,
      subtitle: 'Requires HR/MD approval',
      icon: AlertCircle,
      link: '/approvals',
    });
  }
  if (execMetrics?.pendingVerificationPropertiesCount) {
    crmAlerts.push({
      id: 'prop-ver',
      title: `${execMetrics.pendingVerificationPropertiesCount} Properties Pending Verification`,
      subtitle: 'Awaiting PM verification',
      icon: Building,
      link: '/properties',
    });
  }
  if (execMetrics?.pendingApprovalPropertiesCount) {
    crmAlerts.push({
      id: 'prop-app',
      title: `${execMetrics.pendingApprovalPropertiesCount} Properties Awaiting Approval`,
      subtitle: 'Requires Executive approval',
      icon: ShieldCheck,
      link: '/properties',
    });
  }

  const conversionRate = `${(execMetrics?.leadConversionRate ?? 0).toFixed(1)}%`;

  const activityItems: ListItem[] = (recentActivity || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    subtitle: a.subtitle || undefined,
    icon: Activity,
    link: a.link,
    meta: (
      <span className="text-xs text-slate-400 whitespace-nowrap">
        {new Date(a.timestamp).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    ),
  }));

  const territoryByPm = new Map<number, { name: string; locations: string[] }>();
  for (const a of pmRouting || []) {
    const existing = territoryByPm.get(a.pm_id);
    if (existing) {
      existing.locations.push(a.location);
    } else {
      territoryByPm.set(a.pm_id, {
        name: a.pm?.full_name || `PM #${a.pm_id}`,
        locations: [a.location],
      });
    }
  }
  const territorySummary: ListItem[] = Array.from(territoryByPm.entries()).map(([pmId, t]) => ({
    id: pmId,
    title: t.name,
    subtitle: t.locations.join(', '),
    icon: MapIcon,
    meta: (
      <span className="text-xs font-semibold text-navy-600">
        {t.locations.length} area{t.locations.length === 1 ? '' : 's'}
      </span>
    ),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            {greeting}, {user?.fullName || user?.employeeCode}. Here's the company overview.
          </p>
        </div>
      </div>

      {hasError && (
        <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-danger-600" />
          Unable to load some executive metrics. Please try again later.
        </div>
      )}

      {/* Top Banner Row: Clock and Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-2">
        <div className="lg:col-span-1">
          <ClockWidget />
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <button
            onClick={() => navigate('/approvals')}
            className="bg-white p-5 rounded-2xl shadow-card border border-slate-200 hover:border-gold-500 hover:shadow-card-hover hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-3 group"
          >
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-slate-700 text-center leading-tight">
              HR
              <br />
              Approvals
            </span>
          </button>
          <button
            onClick={() => navigate('/bookings')}
            className="bg-white p-5 rounded-2xl shadow-card border border-slate-200 hover:border-gold-500 hover:shadow-card-hover hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-3 group"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Award className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-slate-700 text-center leading-tight">
              Recent
              <br />
              Bookings
            </span>
          </button>
          <button
            onClick={() => navigate('/hr-daily-reports')}
            className="bg-white p-5 rounded-2xl shadow-card border border-slate-200 hover:border-gold-500 hover:shadow-card-hover hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-3 group"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-slate-700 text-center leading-tight">
              Daily
              <br />
              Reports
            </span>
          </button>
          <button
            onClick={() => navigate('/hr-attendance')}
            className="bg-white p-5 rounded-2xl shadow-card border border-slate-200 hover:border-gold-500 hover:shadow-card-hover hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-3 group"
          >
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-slate-700 text-center leading-tight">
              Live
              <br />
              Attendance
            </span>
          </button>
        </div>
      </div>

      {/* Primary KPI Row (CRM First) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Leads"
          value={isLoading ? '...' : totalLeads}
          icon={Users}
          link="/leads"
        />
        <StatCard
          label="Bookings"
          value={isLoading ? '...' : bookings}
          icon={Award}
          link="/bookings"
        />
        <StatCard
          label="Lead Conversion"
          value={isLoading ? '...' : conversionRate}
          icon={Percent}
          link="/leads"
        />
        <StatCard
          label="Sales Value"
          value={isLoading ? '...' : salesValue}
          icon={IndianRupee}
          link="/finance"
        />
        <StatCard
          label="Due Payments"
          value={isLoading ? '...' : duePayments}
          icon={Clock}
          link="/finance"
        />
      </div>

      <LeadPipelineTabs />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <UnassignedPropertiesWidget />
        </div>

        <div className="space-y-6">
          {/* CRM Alerts */}
          <ListWidget
            title="CRM Action Alerts"
            items={crmAlerts}
            emptyStateMessage="No CRM alerts right now."
            viewAllLink="/properties"
          />
          {/* Operational Alerts (Lower Priority) */}
          <ListWidget
            title="Operational Alerts"
            items={operationalAlerts}
            emptyStateMessage="No operational alerts right now."
            viewAllLink="/approvals"
          />
        </div>
      </div>

      {/* Escalated site visits, now actionable directly from the dashboard
          instead of a read-only link-out list. */}
      <MDEscalationQueue />

      {/* Portal-wide activity: what's happening across the whole CRM, not
          just this employee's own view. */}
      <ListWidget
        title="Recent Portal Activity"
        items={activityItems}
        emptyStateMessage="No recent activity yet."
      />

      {/* Condensed PM territory coverage -- full add/remove management stays
          on its own page. */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-navy-900 flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-navy-600" />
            PM Territory Coverage
          </h3>
          <button
            onClick={() => navigate('/pm-territories')}
            className="text-sm font-medium text-action hover:text-navy-700 transition-colors"
          >
            Manage Territories →
          </button>
        </div>
        {territorySummary.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No PM territory assignments yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {territorySummary.map((t) => (
              <div
                key={t.id}
                className="border border-slate-100 rounded-xl p-3 flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-navy-900 text-sm truncate">{t.title}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{t.subtitle}</p>
                </div>
                {t.meta}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
