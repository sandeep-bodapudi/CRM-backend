import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import {
  TrendingUp,
  Calendar,
  AlertCircle,
  PieChart,
  Target,
  Zap,
  Megaphone,
  Users,
} from 'lucide-react';
import { SalesManagerDashboardData, LeadAttributionRow } from '../../types';
import { StatCard, DataTable } from '../ui';

export const MarketingDirectorDashboard: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [data, setData] = useState<SalesManagerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // We reuse the sales-manager endpoint since MARKETING_DIRECTOR shares
        // the REPORTS_READ_TEAM permission and it exposes lead volume & attribution.
        const res = await fetchWithAuth(`${API_BASE_URL}/analytics/sales-manager`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error('Failed to load Marketing Director dashboard', err);
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
      <div className="text-danger-700 p-4 bg-danger-50 rounded-lg flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        Failed to load marketing dashboard data.
      </div>
    );

  const { kpis, pipeline, leadAttribution } = data;

  // Determine the top performing source from leadAttribution
  const sortedSources = [...(leadAttribution || [])].sort(
    (a, b) => b.leadsIntroduced - a.leadsIntroduced,
  );
  const topSource =
    sortedSources.length > 0 ? sortedSources[0].employee?.full_name || 'N/A' : 'N/A';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
            Marketing Director Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Monitor lead generation, attribution, and pipeline conversion.
          </p>
        </div>
        <div className="bg-navy-50 text-navy-700 px-3 py-1.5 rounded-lg text-sm font-semibold border border-navy-100 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-gold-500" />
          Marketing Overview
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Lead Volume" value={kpis.totalLeads} icon={Users} link="/leads" />
        <StatCard
          label="Conversion Rate"
          value={`${kpis.conversionRate.toFixed(1)}%`}
          icon={TrendingUp}
          link="/leads"
        />
        <StatCard
          label="Site Visits Generated"
          value={kpis.siteVisits}
          icon={Calendar}
          link="/site-visits"
        />
        <StatCard label="Top Lead Introducer" value={topSource} icon={Zap} link="/leads" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Attribution / Sources */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-navy-700" />
            <h2 className="font-bold text-navy-900">Lead Attribution by Team Member</h2>
          </div>
          <div className="p-5 flex-1">
            {leadAttribution && leadAttribution.length > 0 ? (
              <div className="max-h-72 overflow-y-auto pr-1">
                <DataTable
                  columns={[
                    {
                      key: 'employee',
                      header: 'Team Member',
                      render: (row: LeadAttributionRow) => (
                        <span>{row.employee?.full_name || 'Unknown'}</span>
                      ),
                    },
                    {
                      key: 'leadsIntroduced',
                      header: 'Leads Generated',
                      render: (row: LeadAttributionRow) => (
                        <span className="font-semibold text-navy-700">{row.leadsIntroduced}</span>
                      ),
                    },
                  ]}
                  data={leadAttribution}
                />
              </div>
            ) : (
              <div className="min-h-[160px] flex flex-col items-center justify-center text-slate-400">
                <AlertCircle className="w-8 h-8 text-slate-300 mb-2" />
                <p>No attribution data available.</p>
              </div>
            )}
          </div>
        </div>

        {/* Pipeline Stage Summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Target className="w-5 h-5 text-navy-700" />
            <h2 className="font-bold text-navy-900">Active Pipeline Stages</h2>
          </div>
          <div className="p-5 flex-1">
            {pipeline && pipeline.length > 0 ? (
              <div className="max-h-72 overflow-y-auto pr-1">
                <DataTable
                  columns={[
                    { key: 'stage', header: 'Stage' },
                    {
                      key: 'count',
                      header: 'Active Leads',
                      render: (row: any) => (
                        <span className="font-semibold text-navy-700">{row.count}</span>
                      ),
                    },
                  ]}
                  data={pipeline}
                />
              </div>
            ) : (
              <div className="min-h-[160px] flex flex-col items-center justify-center text-slate-400">
                <Target className="w-8 h-8 text-slate-300 mb-2" />
                <p>No active pipeline data.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
