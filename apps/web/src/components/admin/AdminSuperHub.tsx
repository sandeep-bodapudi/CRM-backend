import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import {
  ShieldCheck,
  ScrollText,
  ShieldAlert,
  Users,
  Lock,
  Eye,
  Building2,
  Plug,
  Settings,
  ServerCrash,
  Send,
} from 'lucide-react';
import { ListWidget, ListItem } from '../ui';
import { RoleChangePage } from './RoleChangePage';
import { PermissionsPage } from './PermissionsPage';
import { CompanyBranchManagement } from './CompanyBranchManagement';
import { AdminAnalyticsPortal } from './AdminAnalyticsPortal';
import { MDControlDashboard } from '../md/MDControlDashboard';
import { BannerControlWidget } from '../dashboards/BannerControlWidget';
import { toUserFacingError } from '../../utils/userFacingError';

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

export const AdminSuperHub: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();

  const [activeTab, setActiveTab] = useState<
    'roles' | 'permissions' | 'companies' | 'integrations' | 'advanced' | 'audit' | 'security'
  >('roles');

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditError, setAuditError] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [alertsError, setAlertsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Test Lead Import tool (folded in from the retired System Control page)
  const [simName, setSimName] = useState('Jane Doe');
  const [simPhone, setSimPhone] = useState('9876543210');
  const [simSource, setSimSource] = useState('FACEBOOK');
  const [isSimulating, setIsSimulating] = useState(false);

  const handleSimulateLead = async () => {
    setIsSimulating(true);
    try {
      const payload = {
        name: simName,
        phone: simPhone,
        source: simSource,
        email: `${simName.toLowerCase().replace(' ', '.')}@example.com`,
        budget: 5000000,
      };
      const res = await fetchWithAuth(`${API_BASE_URL}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast('Lead webhook simulated successfully. Check the Leads pipeline.', 'success');
      } else {
        showError({ message: 'Failed to simulate lead.' });
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsSimulating(false);
    }
  };

  const getPayloadPreview = () =>
    JSON.stringify(
      {
        name: simName,
        phone: simPhone,
        source: simSource,
        email: `${simName.toLowerCase().replace(' ', '.')}@example.com`,
        budget: 5000000,
      },
      null,
      2,
    );

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      // Explicit high limit: the backend previously had a fixed take of
      // 150/50 with no total and no way to page further — audit events
      // accumulate per action indefinitely. ListWidget (below) has its own
      // render-side "Load More" cap, so raising this is safe.
      const [logsRes, alertsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/admin/audit-logs?limit=5000`),
        fetchWithAuth(`${API_BASE_URL}/admin/security-alerts?limit=5000`),
      ]);

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
    } catch (e: unknown) {
      console.error('[AdminSuperHub] fetch failed:', e);
      showError({ message: "Couldn't load admin data. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth, showError]);

  useEffect(() => {
    if (activeTab === 'audit' || activeTab === 'security') {
      fetchLogs();
    }
  }, [activeTab, fetchLogs]);

  const securityItems: ListItem[] = securityAlerts.map((alert) => ({
    id: alert.id,
    title: alert.new_value || alert.action,
    subtitle: `${new Date(alert.created_at).toLocaleString('en-IN')} · Actor #${alert.actor_id} ${alert.entity_type ? `· ${alert.entity_type} #${alert.entity_id}` : ''}`,
    icon: ShieldAlert,
  }));

  const auditItems: ListItem[] = auditLogs.map((log) => ({
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
      {/* Premium Header Banner */}
      <div className="bg-gradient-to-r from-navy-900 via-navy-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-navy-700/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-5 h-5 text-rose-500" />
            <h1 className="text-xl font-extrabold tracking-tight">Super Admin Hub</h1>
          </div>
          <p className="text-xs text-navy-200/80">
            Exclusive Technical Admin Portal for Roles, Permissions, Companies & Branches,
            Integrations, Audit Trails, and Security Logs.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Tab Navigation */}
        <div className="flex overflow-x-auto no-scrollbar gap-1 p-2 bg-slate-50 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors ${
              activeTab === 'roles'
                ? 'bg-white text-navy-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Users className="w-4 h-4" />
            Role Assignment
          </button>

          <button
            onClick={() => setActiveTab('permissions')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors ${
              activeTab === 'permissions'
                ? 'bg-white text-navy-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Lock className="w-4 h-4" />
            Permissions
          </button>

          <button
            onClick={() => setActiveTab('companies')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors ${
              activeTab === 'companies'
                ? 'bg-white text-navy-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Companies & Branches
          </button>

          <button
            onClick={() => setActiveTab('integrations')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors ${
              activeTab === 'integrations'
                ? 'bg-white text-navy-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Plug className="w-4 h-4" />
            Integrations
          </button>

          <button
            onClick={() => setActiveTab('advanced')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors ${
              activeTab === 'advanced'
                ? 'bg-white text-navy-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Settings className="w-4 h-4" />
            Advanced
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors ${
              activeTab === 'audit'
                ? 'bg-white text-navy-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <ScrollText className="w-4 h-4" />
            Audit Reviews
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors ${
              activeTab === 'security'
                ? 'bg-rose-50 text-rose-700 shadow-sm border border-rose-200'
                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Security / Incidents
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6 bg-slate-50 min-h-[600px]">
          {activeTab === 'roles' && (
            <div className="max-w-7xl mx-auto">
              <RoleChangePage />
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="max-w-7xl mx-auto">
              <PermissionsPage />
            </div>
          )}

          {activeTab === 'companies' && (
            <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <CompanyBranchManagement />
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Lead Integrations</h3>
                <p className="text-sm text-slate-500">
                  Manage incoming lead sources (Facebook, Housing.com, 99acres).
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-100 border-b border-slate-200 p-4">
                  <h4 className="font-bold text-navy-800 flex items-center gap-2">
                    <ServerCrash className="w-4 h-4" />
                    Test Lead Import
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Send a sample lead to check it comes into the CRM correctly.
                  </p>
                </div>

                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Customer Name
                      </label>
                      <input
                        type="text"
                        value={simName}
                        onChange={(e) => setSimName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-navy-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={simPhone}
                        onChange={(e) => setSimPhone(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-navy-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Source
                      </label>
                      <select
                        value={simSource}
                        onChange={(e) => setSimSource(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-navy-500"
                      >
                        <option value="FACEBOOK">Facebook Lead Ads</option>
                        <option value="HOUSING.COM">Housing.com</option>
                        <option value="99ACRES">99acres</option>
                        <option value="WEBSITE">Direct Website</option>
                      </select>
                    </div>
                    <button
                      onClick={handleSimulateLead}
                      disabled={isSimulating}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-navy-700 text-white rounded-xl text-sm font-bold hover:bg-navy-800 transition-colors shadow-sm disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      {isSimulating ? 'Sending Test Lead...' : 'Send Test Lead'}
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Preview of Lead Data Sent
                    </label>
                    <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs overflow-x-auto font-mono h-48 border border-slate-800">
                      {getPayloadPreview()}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <MDControlDashboard />
              <AdminAnalyticsPortal />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BannerControlWidget />
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <ListWidget
                title="System Audit Activity"
                items={auditError ? [] : auditItems}
                emptyStateMessage={
                  auditError ? 'Audit trail is currently unavailable.' : 'No audit events recorded.'
                }
              />
            </div>
          )}

          {activeTab === 'security' && (
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <ListWidget
                title="Security & Anomalies"
                items={alertsError ? [] : securityItems}
                emptyStateMessage={
                  alertsError
                    ? 'Security alerts feed unavailable.'
                    : 'System secure — no critical security anomalies detected.'
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
