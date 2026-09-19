import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Server,
  Activity,
  Database,
  Users,
  Building,
  Target,
  AlertTriangle,
  Lock,
  RefreshCw,
  Eye,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { AdminAnalyticsData, AuditLogEntry, SecurityAlertItem } from '../../types';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

export const AdminAnalyticsPortal: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [metrics, setMetrics] = useState<AdminAnalyticsData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlertItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLockingDown, setIsLockingDown] = useState(false);
  const [showLockdownConfirm, setShowLockdownConfirm] = useState(false);

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const [metricsRes, logsRes, alertsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/admin/system-metrics`),
        fetchWithAuth(`${API_BASE_URL}/admin/audit-logs`),
        fetchWithAuth(`${API_BASE_URL}/admin/security-alerts`),
      ]);

      if (metricsRes.ok) {
        setMetrics(await metricsRes.json());
      } else {
        const errText = await metricsRes.text();
        setMetrics({ databaseStatus: `ERROR: ${metricsRes.status} - ${errText}` });
      }
      if (logsRes.ok) {
        const logData = await logsRes.json();
        setAuditLogs(logData.logs || []);
      } else {
        console.error('Logs error:', await logsRes.text());
      }
      if (alertsRes.ok) {
        const alertData = await alertsRes.json();
        setSecurityAlerts(alertData.alerts || []);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('Failed to fetch admin data:', e);
      setMetrics({ databaseStatus: `NETWORK ERROR: ${message}` });
      showError({ message: "Couldn't load admin data. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleEmergencyLockdown = async () => {
    setIsLockingDown(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/admin/emergency/lockdown`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'System lockdown triggered!', 'success');
        setShowLockdownConfirm(false);
        // Refresh logs to show the lockdown event
        fetchAdminData();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsLockingDown(false);
    }
  };

  const dbSizeData = [
    { name: 'Leads', value: metrics?.totalLeads || 0 },
    { name: 'Properties', value: metrics?.totalProperties || 0 },
    { name: 'Employees', value: metrics?.totalEmployees || 0 },
    { name: 'Audit Events', value: metrics?.totalAuditEvents || 0 },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500 gap-4">
        <Activity className="w-8 h-8 animate-pulse text-rose-600" />
        <span className="font-mono text-sm tracking-widest font-bold text-rose-800">
          CONNECTING TO SECURE CORE...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-rose-950 to-slate-950 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-rose-900/50">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            <h2 className="text-xl font-black tracking-tight text-rose-50">
              Admin Security & Analytics Center
            </h2>
          </div>
          <p className="text-xs text-rose-200/70 font-mono">
            RESTRICTED ACCESS. Monitoring CRM calculations, data leakage, and system integrity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-rose-400 block font-mono">
              System Status
            </span>
            <span className="text-lg font-black text-emerald-400 flex items-center gap-1 justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {metrics?.databaseStatus || 'UNKNOWN'}
            </span>
          </div>

          <button
            onClick={fetchAdminData}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
            title="Refresh Telemetry"
          >
            <RefreshCw className="w-4 h-4 text-rose-300" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Analytics & Stats */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Database className="w-4 h-4 text-slate-600" />
              Total Data on Record
            </h3>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                  <Target className="w-3.5 h-3.5" /> Total CRM Leads
                </span>
                <span className="text-sm font-black font-mono text-slate-800">
                  {metrics?.totalLeads || 0}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                  <Building className="w-3.5 h-3.5" /> Properties Listed
                </span>
                <span className="text-sm font-black font-mono text-slate-800">
                  {metrics?.totalProperties || 0}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Active Staff Accounts
                </span>
                <span className="text-sm font-black font-mono text-slate-800">
                  {metrics?.totalEmployees || 0}
                </span>
              </div>
            </div>

            <div className="h-48 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dbSizeData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{
                      borderRadius: '8px',
                      fontSize: '12px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="value" fill="#0f172a" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Emergency Kill Switch */}
          <div className="bg-rose-50 rounded-3xl p-6 border border-rose-200 shadow-sm relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-5">
              <AlertTriangle className="w-32 h-32 text-rose-900" />
            </div>
            <h3 className="text-sm font-bold text-rose-900 mb-2 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Emergency Actions
            </h3>
            <p className="text-[11px] text-rose-700/80 mb-4 pr-4">
              Use only in the event of severe data leakage or unauthorized system compromise. This
              will halt all CRM operations.
            </p>

            {showLockdownConfirm ? (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                <p className="text-xs font-bold text-rose-800 bg-rose-100 p-2 rounded-lg border border-rose-200 text-center uppercase tracking-wide">
                  Confirm Global Lockdown?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowLockdownConfirm(false)}
                    className="flex-1 py-2 bg-white text-slate-600 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEmergencyLockdown}
                    disabled={isLockingDown}
                    className="flex-1 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-1"
                  >
                    {isLockingDown ? (
                      <Activity className="w-3 h-3 animate-spin" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    EXECUTE
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowLockdownConfirm(true)}
                className="w-full py-3 bg-white hover:bg-rose-100 text-rose-700 border-2 border-rose-200 font-black text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
              >
                Trigger System Lockdown
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Audit Logs & Security Trails */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm h-full flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-slate-600" />
                  Real-time Security Audit Log
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Monitoring all critical system actions to prevent data leakage.
                </p>
              </div>
              <div className="px-3 py-1 bg-slate-100 rounded-lg border border-slate-200 text-[10px] font-mono font-bold text-slate-600">
                {auditLogs.length} Events Captured
              </div>
            </div>

            <div className="flex-1 p-0 overflow-hidden relative">
              <div className="absolute inset-0 overflow-y-auto p-4 custom-scrollbar space-y-4">
                {/* Security Alerts Section */}
                {securityAlerts.length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-4">
                    <h4 className="text-xs font-bold text-rose-800 uppercase tracking-widest flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4" />
                      Critical Security Anomalies
                    </h4>
                    <div className="space-y-2">
                      {securityAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="bg-white p-3 rounded-xl shadow-sm border border-rose-100 flex items-start gap-3"
                        >
                          <div className="w-2 h-2 mt-1.5 rounded-full bg-rose-500 animate-pulse shrink-0"></div>
                          <div>
                            <div className="text-[11px] font-bold text-rose-900">
                              {alert.new_value || alert.action}
                            </div>
                            <div className="text-[9px] font-mono text-rose-500 mt-1">
                              {new Date(alert.created_at).toLocaleString('en-IN')} | ACTOR_ID:{' '}
                              {alert.actor_id}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {auditLogs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 font-mono">
                    No security events recorded.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex gap-4 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors group"
                      >
                        <div className="w-24 shrink-0 text-right">
                          <div className="text-[10px] text-slate-400 font-mono mb-0.5">
                            {new Date(log.created_at).toLocaleTimeString([], {
                              hour12: false,
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </div>
                          <div className="text-[9px] text-slate-300 font-mono">
                            {new Date(log.created_at).toLocaleDateString('en-IN')}
                          </div>
                        </div>

                        <div className="w-px bg-slate-100 group-hover:bg-slate-200 shrink-0"></div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-baseline gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold font-mono rounded">
                              {log.action}
                            </span>
                            <span className="text-[10px] font-bold text-slate-800">
                              {log.entity_type}{' '}
                              <span className="text-slate-400 font-mono text-[9px]">
                                #{log.entity_id}
                              </span>
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-600">
                            Actor:{' '}
                            <strong className="text-navy-800 font-mono">{log.actor_code}</strong>{' '}
                            <span className="text-slate-400">({log.actor_role})</span>
                          </div>

                          {(log.old_value || log.new_value) && (
                            <div className="mt-2 text-[10px] font-mono bg-slate-50 p-2 rounded-lg border border-slate-100 overflow-x-auto whitespace-nowrap">
                              {log.old_value && (
                                <span className="text-rose-600 line-through mr-2">
                                  {log.old_value}
                                </span>
                              )}
                              {log.new_value && (
                                <span className="text-emerald-600">{log.new_value}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
