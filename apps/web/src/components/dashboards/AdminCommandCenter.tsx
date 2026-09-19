import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { Link } from 'react-router-dom';
import {
  ServerCog,
  ShieldAlert,
  Database,
  Users,
  Target,
  Building,
  ScrollText,
  Eye,
  RefreshCw,
  Activity,
  Lock,
  ActivitySquare,
  ShieldCheck,
} from 'lucide-react';
import { StatCard, ListWidget, ListItem } from '../ui';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

interface SystemMetrics {
  totalLeads?: number;
  totalProperties?: number;
  totalUsers?: number; // Added since we reference totalUsers
  totalEmployees?: number;
  totalAuditEvents?: number;
  recentErrors?: number;
  databaseStatus?: string;
  activeSessions?: number;
}

interface AuditLog {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number;
  actor_code: string;
  actor_role: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

interface SecurityAlert {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number;
  actor_id: number;
  new_value?: string;
  created_at: string;
}

const ENTITY_LABELS: Record<string, string> = {
  Lead: 'Lead',
  Customer: 'Customer',
  Property: 'Property',
  Project: 'Project',
  Booking: 'Booking',
  Payment: 'Payment',
  Installment: 'Installment',
  Employee: 'Employee',
  Task: 'Task',
  SiteVisit: 'Site Visit',
  Document: 'Document',
  Expense: 'Expense',
  EXPENSE_REFUND: 'Expense Refund',
};

const formatEntityType = (type?: string): string =>
  type ? (ENTITY_LABELS[type] ?? 'Record') : 'Record';

export const AdminCommandCenter: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditError, setAuditError] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [alertsError, setAlertsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const fetchTelemetry = useCallback(async () => {
    setIsLoading(true);
    try {
      const [metricsRes, logsRes, alertsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/admin/system-metrics`),
        fetchWithAuth(`${API_BASE_URL}/admin/audit-logs`),
        fetchWithAuth(`${API_BASE_URL}/admin/security-alerts`),
      ]);

      if (metricsRes.ok) {
        setMetrics(await metricsRes.json());
        setMetricsError(null);
      } else {
        setMetrics(null);
        setMetricsError(`System metrics unavailable (HTTP ${metricsRes.status})`);
      }

      if (logsRes.ok) {
        const logData = await logsRes.json();
        setAuditLogs(logData.logs || []);
        setAuditError(false);
      } else {
        setAuditLogs([]);
        setAuditError(true);
      }

      if (alertsRes.ok) {
        const alertData = await alertsRes.json();
        setSecurityAlerts(alertData.alerts || []);
        setAlertsError(false);
      } else {
        setSecurityAlerts([]);
        setAlertsError(true);
      }

      setLastRefreshedAt(new Date());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[AdminCommandCenter] telemetry fetch failed:', e);
      setMetricsError(`Network error: ${message}`);
      showError({ message: 'Failed to connect to secure admin endpoints' });
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, showToast]);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  const dbStatus = metrics?.databaseStatus;
  const dbHealthy = dbStatus === 'HEALTHY';

  // Prepare ListWidget data
  const securityItems: ListItem[] = securityAlerts.slice(0, 8).map((alert) => ({
    id: alert.id,
    title: alert.new_value || alert.action,
    subtitle: `${new Date(alert.created_at).toLocaleString('en-IN')} · Actor #${alert.actor_id} ${alert.entity_type ? `· ${alert.entity_type} #${alert.entity_id}` : ''}`,
    icon: ShieldAlert,
    link: '/system-control',
  }));

  const auditItems: ListItem[] = auditLogs.slice(0, 30).map((log) => ({
    id: log.id,
    title: `${log.action} ${formatEntityType(log.entity_type)} #${log.entity_id}`,
    subtitle: `Actor: ${log.actor_code} (${log.actor_role}) · ${new Date(log.created_at).toLocaleString('en-IN')}`,
    meta:
      log.old_value || log.new_value ? (
        <div className="text-[10px] font-mono bg-slate-50 border border-slate-100 rounded px-1 max-w-[150px] truncate text-slate-500">
          {log.old_value && <span className="line-through mr-1">{log.old_value}</span>}
          {log.new_value && <span>{log.new_value}</span>}
        </div>
      ) : undefined,
    icon: Eye,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight flex items-center gap-2">
            <ServerCog className="w-6 h-6 text-navy-600" />
            Admin Command Center
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              <Lock className="w-3 h-3" /> RESTRICTED ACCESS
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {user?.fullName || user?.employeeCode || 'Technical Admin'}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Last refresh: {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString() : '—'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div
            className={`px-4 py-2 rounded-xl border text-center ${
              isLoading
                ? 'bg-slate-50 border-slate-200'
                : dbHealthy
                  ? 'bg-success/10 border-success/20'
                  : 'bg-danger/10 border-danger/20'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              System Status
            </span>
            <span
              className={`text-sm font-black flex items-center gap-1.5 justify-center ${
                isLoading ? 'text-slate-400' : dbHealthy ? 'text-success' : 'text-danger'
              }`}
            >
              {!isLoading && (
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${dbHealthy ? 'bg-success' : 'bg-danger'}`}
                />
              )}
              {isLoading ? 'CHECKING...' : dbStatus || 'UNAVAILABLE'}
            </span>
          </div>

          <button
            onClick={fetchTelemetry}
            disabled={isLoading}
            className="p-3 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors disabled:opacity-50"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`w-4 h-4 text-navy-600 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {metricsError && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl px-4 py-3 text-sm font-semibold text-danger-800">
          {metricsError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Database" value={dbStatus || 'UNKNOWN'} icon={Database} />
        <StatCard
          label="Total Users"
          value={metrics?.totalUsers || '—'}
          icon={Users}
          link="/hr-hub"
        />
        <StatCard
          label="Active Sessions"
          value={metrics?.activeSessions || '—'}
          icon={ActivitySquare}
        />
        <StatCard
          label="Total Leads"
          value={metrics?.totalLeads || '—'}
          icon={Target}
          link="/leads"
        />
      </div>

      <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
        <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-700">System Operations Normal</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mt-2">
          Key performance indicators and high-level health metrics are displayed above. Detailed
          audit logs and granular system controls have been migrated to the dedicated Super Admin
          views.
        </p>
      </div>
    </div>
  );
};
