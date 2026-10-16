import React, { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Award,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  Users,
  Building2,
  CalendarCheck,
  TrendingUp,
  Inbox,
  PhoneCall,
  FileText,
} from 'lucide-react';
import { TargetConfigurator } from '../targets/TargetConfigurator';
import { MeasuredTargetsPanel } from '../targets/MeasuredTargetsPanel';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { Roles } from '../../shared';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * AnalyticsHub — Phase 16 Packet C.
 *
 * Consumes the Packet B unified analytics API (GET /api/v1/analytics/kpis) for an
 * aggregate, company-isolated KPI overview. Company scope is derived server-side
 * from req.user.companyId; the client never sends a companyId. The KPI overview
 * is permission-gated on `admin.system_metrics` (the same permission the backend
 * requires). The detailed Team Performance and Target Configurator tabs are
 * preserved as-is (different granularity than the aggregate overview).
 */

// ---- Packet B /analytics/kpis response contract (mirrors AnalyticsKpisResponse) ----
interface AnalyticsKpis {
  companyId: number;
  generatedAt: string;
  crm: {
    totalLeads: number;
    wonLeads: number;
    siteVisitsScheduled: number;
    dropOffByStage: { stage: string; dropoffs: number }[];
  };
  property: { total: number; live: number; pendingMD: number; pendingPM: number };
  opportunity: {
    pipelineMetrics: Record<string, unknown>;
    conversionMetrics: Record<string, unknown>;
  };
  booking: { totalBookings: number };
  hr: { activeEmployees: number; attendanceExceptionsToday: number };
  performance: {
    teamPerformance: {
      averageScore: number;
      totalEmployees: number;
      minScore: number;
      maxScore: number;
    };
  };
  targets: { targetAttainment: { met: number; total: number; rate: number } };
  marketing: {
    company_id: number;
    handoffs: { total: number };
    outbox: { total: number };
    payments: { total: number };
    kyc: { total: number };
    notifications: { total: number };
  } | null;
}

const nf = new Intl.NumberFormat('en-IN');

const PROPERTY_COLORS = ['#0d9488', '#f59e0b', '#6366f1', '#cbd5e1'];

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-slate-800 leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
      <h2 className="text-base sm:text-lg font-bold text-slate-800">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export const AnalyticsHub: React.FC = () => {
  const { user, fetchWithAuth, activeRole } = useAuth();

  const canManageTargets = ([Roles.MD, Roles.ADMIN] as string[]).includes(activeRole);
  // The KPI overview is permission-gated on the SAME permission the backend enforces.
  const canViewKpis = (user?.permissions ?? []).includes('admin.system_metrics');

  const [activeTab, setActiveTab] = useState<'overview' | 'targets'>(
    canViewKpis ? 'overview' : 'targets',
  );

  // KPI fetch state
  const [kpis, setKpis] = useState<AnalyticsKpis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKpis = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/analytics/kpis`);
      const data = await res.json();
      if (res.ok) {
        setKpis(data as AnalyticsKpis);
      } else if (res.status === 403) {
        setError('You do not have permission to view analytics. Contact your administrator.');
      } else {
        setError(data?.error || 'Failed to load analytics. Please try again.');
      }
    } catch {
      setError('Network error — check API connection.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    if (canViewKpis) {
      fetchKpis();
    }
  }, [canViewKpis, fetchKpis]);

  if (!canManageTargets && !canViewKpis) {
    return <Navigate to="/" replace />;
  }

  const propertyData = kpis
    ? [
        { name: 'Live', value: kpis.property.live },
        { name: 'Pending MD', value: kpis.property.pendingMD },
        { name: 'Pending PM', value: kpis.property.pendingPM },
      ].filter((d) => d.value > 0)
    : [];

  const targetData = kpis
    ? [
        { name: 'Met', value: kpis.targets.targetAttainment.met },
        {
          name: 'Missed',
          value: Math.max(
            0,
            kpis.targets.targetAttainment.total - kpis.targets.targetAttainment.met,
          ),
        },
      ]
    : [];

  const dropOffData = kpis?.crm.dropOffByStage ?? [];

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-navy-600" />
          Analytics & Goals
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Track your team's performance and monthly targets.
        </p>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto no-scrollbar gap-2 mt-6 pb-2 border-b border-slate-100">
          {canViewKpis && (
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors ${
                activeTab === 'overview'
                  ? 'bg-navy-50 text-navy-700 border border-navy-200'
                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Performance Overview
            </button>
          )}

          {canManageTargets && (
            <button
              onClick={() => setActiveTab('targets')}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors ${
                activeTab === 'targets'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
              }`}
            >
              <Target className="w-4 h-4" />
              Target Configurator
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && canViewKpis && (
          <div className="space-y-6">
            {isLoading && (
              <div className="bg-white p-10 rounded-2xl shadow-sm border border-slate-200 text-center text-slate-500">
                Loading analytics…
              </div>
            )}

            {!isLoading && error && (
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-rose-600 font-semibold">
                  <AlertTriangle className="w-5 h-5" />
                  Unable to load analytics
                </div>
                <p className="text-sm text-slate-600 mt-1">{error}</p>
                <button
                  onClick={fetchKpis}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-navy-600 text-white hover:bg-navy-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !error && kpis && (
              <>
                {/* Top-level summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard
                    icon={<Users className="w-5 h-5 text-navy-600" />}
                    label="Total Leads"
                    value={nf.format(kpis.crm.totalLeads)}
                    accent="bg-navy-50"
                  />
                  <KpiCard
                    icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
                    label="Won Leads"
                    value={nf.format(kpis.crm.wonLeads)}
                    accent="bg-emerald-50"
                  />
                  <KpiCard
                    icon={<Building2 className="w-5 h-5 text-navy-600" />}
                    label="Total Bookings"
                    value={nf.format(kpis.booking.totalBookings)}
                    accent="bg-navy-50"
                  />
                  <KpiCard
                    icon={<Users className="w-5 h-5 text-violet-600" />}
                    label="Active Employees"
                    value={nf.format(kpis.hr.activeEmployees)}
                    accent="bg-violet-50"
                  />
                </div>

                {/* CRM */}
                <SectionCard title="CRM Overview" subtitle="Lead pipeline health">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <KpiCard
                      icon={<PhoneCall className="w-5 h-5 text-navy-600" />}
                      label="Total Leads"
                      value={nf.format(kpis.crm.totalLeads)}
                      accent="bg-navy-50"
                    />
                    <KpiCard
                      icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
                      label="Won Leads"
                      value={nf.format(kpis.crm.wonLeads)}
                      accent="bg-emerald-50"
                    />
                    <KpiCard
                      icon={<CalendarCheck className="w-5 h-5 text-amber-600" />}
                      label="Site Visits Scheduled"
                      value={nf.format(kpis.crm.siteVisitsScheduled)}
                      accent="bg-amber-50"
                    />
                  </div>
                </SectionCard>

                {/* Pipeline Drop-off Analysis */}
                <SectionCard
                  title="Pipeline Drop-off Analysis"
                  subtitle="Leads lost by exit stage (exited_from_status)"
                >
                  {dropOffData.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">
                      No dropped leads recorded yet.
                    </p>
                  ) : (
                    <div className="h-64 mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={dropOffData}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis
                            dataKey="stage"
                            type="category"
                            axisLine={false}
                            tickLine={false}
                            style={{ fontSize: '11px', fontWeight: 'bold', fill: '#64748b' }}
                          />
                          <RechartsTooltip cursor={{ fill: '#f1f5f9' }} />
                          <Bar dataKey="dropoffs" name="Lost Leads" radius={[0, 4, 4, 0]}>
                            {dropOffData.map((_, idx) => (
                              <Cell key={`cell-${idx}`} fill={idx > 2 ? '#f43f5e' : '#f59e0b'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </SectionCard>

                {/* Property + Targets side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <SectionCard title="Property Overview" subtitle="Status distribution">
                    {kpis.property.total === 0 ? (
                      <p className="text-sm text-slate-400">No properties yet.</p>
                    ) : (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={propertyData}
                              dataKey="value"
                              nameKey="name"
                              outerRadius={80}
                              label
                            >
                              {propertyData.map((_, idx) => (
                                <Cell
                                  key={`cell-${idx}`}
                                  fill={PROPERTY_COLORS[idx % PROPERTY_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <RechartsTooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-center text-sm">
                      <div>
                        <p className="text-slate-500">Total</p>
                        <p className="font-semibold">{nf.format(kpis.property.total)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Live</p>
                        <p className="font-semibold">{nf.format(kpis.property.live)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Pending MD</p>
                        <p className="font-semibold">{nf.format(kpis.property.pendingMD)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Pending PM</p>
                        <p className="font-semibold">{nf.format(kpis.property.pendingPM)}</p>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title="Target Overview" subtitle="Daily report target attainment">
                    {kpis.targets.targetAttainment.total === 0 ? (
                      <p className="text-sm text-slate-400">No reports submitted today.</p>
                    ) : (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={targetData}>
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <RechartsTooltip />
                            <Bar dataKey="value" name="Reports">
                              <Cell key="met" fill="#10b981" />
                              <Cell key="missed" fill="#f43f5e" />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 mt-2 text-center text-sm">
                      <div>
                        <p className="text-slate-500">Met</p>
                        <p className="font-semibold">
                          {nf.format(kpis.targets.targetAttainment.met)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Total</p>
                        <p className="font-semibold">
                          {nf.format(kpis.targets.targetAttainment.total)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Rate</p>
                        <p className="font-semibold">
                          {nf.format(kpis.targets.targetAttainment.rate)}%
                        </p>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                {/* HR */}
                <SectionCard title="HR Overview" subtitle="Employee & attendance">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <KpiCard
                      icon={<Users className="w-5 h-5 text-violet-600" />}
                      label="Active Employees"
                      value={nf.format(kpis.hr.activeEmployees)}
                      accent="bg-violet-50"
                    />
                    <KpiCard
                      icon={<CalendarCheck className="w-5 h-5 text-rose-600" />}
                      label="Attendance Exceptions Today"
                      value={nf.format(kpis.hr.attendanceExceptionsToday)}
                      accent="bg-rose-50"
                    />
                  </div>
                </SectionCard>

                {/* Performance */}
                <SectionCard
                  title="Performance Overview"
                  subtitle="Aggregate team performance (from Packet A metric service)"
                >
                  {kpis.performance.teamPerformance.totalEmployees === 0 ? (
                    <p className="text-sm text-slate-400">No team performance data.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="p-4 rounded-xl bg-slate-50">
                        <p className="text-slate-500 text-sm">Avg Score</p>
                        <p className="text-xl font-bold text-slate-800">
                          {kpis.performance.teamPerformance.averageScore}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-50">
                        <p className="text-slate-500 text-sm">Employees</p>
                        <p className="text-xl font-bold text-slate-800">
                          {nf.format(kpis.performance.teamPerformance.totalEmployees)}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-50">
                        <p className="text-slate-500 text-sm">Min</p>
                        <p className="text-xl font-bold text-slate-800">
                          {kpis.performance.teamPerformance.minScore}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-50">
                        <p className="text-slate-500 text-sm">Max</p>
                        <p className="text-xl font-bold text-slate-800">
                          {kpis.performance.teamPerformance.maxScore}
                        </p>
                      </div>
                    </div>
                  )}
                </SectionCard>

                {/* Portal / Integration */}
                <SectionCard
                  title="Portal / Integration Overview"
                  subtitle="Customer portal & integration events"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <KpiCard
                      icon={<Inbox className="w-5 h-5 text-navy-600" />}
                      label="Handoffs"
                      value={nf.format(kpis.marketing?.handoffs.total ?? 0)}
                      accent="bg-navy-50"
                    />
                    <KpiCard
                      icon={<FileText className="w-5 h-5 text-navy-600" />}
                      label="Outbox"
                      value={nf.format(kpis.marketing?.outbox.total ?? 0)}
                      accent="bg-navy-50"
                    />
                    <KpiCard
                      icon={<FileText className="w-5 h-5 text-emerald-600" />}
                      label="KYC"
                      value={nf.format(kpis.marketing?.kyc.total ?? 0)}
                      accent="bg-emerald-50"
                    />
                    <KpiCard
                      icon={<Users className="w-5 h-5 text-amber-600" />}
                      label="Notifications"
                      value={nf.format(kpis.marketing?.notifications.total ?? 0)}
                      accent="bg-amber-50"
                    />
                    <KpiCard
                      icon={<Building2 className="w-5 h-5 text-violet-600" />}
                      label="Payments Synced"
                      value={nf.format(kpis.marketing?.payments.total ?? 0)}
                      accent="bg-violet-50"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-3">
                    Portal sync totals reflect integration events, not cash collections. Collection
                    totals are not part of this analytics view.
                  </p>
                </SectionCard>
              </>
            )}
          </div>
        )}

        {activeTab === 'targets' && canManageTargets && (
          <div className="space-y-6">
            <MeasuredTargetsPanel />
            <TargetConfigurator />
          </div>
        )}
      </div>
    </div>
  );
};
