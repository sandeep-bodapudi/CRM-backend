import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AppLayout } from './components/common/AppLayout';
import { LoginForm } from './components/auth/LoginForm';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal';
import { DailyReportModal } from './components/reports/DailyReportModal';
import { NotificationDrawer } from './components/notifications/NotificationDrawer';
import { ISTClock } from './components/common/ISTClock';
import { FirstLoginSetup } from './components/auth/FirstLoginSetup';
import { MDExecutiveDashboard } from './components/dashboards/MDExecutiveDashboard';
import { AdminCommandCenter } from './components/dashboards/AdminCommandCenter';
import { TelecallerDashboard } from './components/dashboards/TelecallerDashboard';
import { PMDashboard } from './components/dashboards/PMDashboard';
import { StaffDashboard } from './components/dashboards/StaffDashboard';

// Lazy load Sales Manager Dashboard
const SalesManagerDashboard = lazy(() =>
  import('./components/dashboards/SalesManagerDashboard').then((m) => ({
    default: m.SalesManagerDashboard,
  })),
);
const MarketingDirectorDashboard = lazy(() =>
  import('./components/dashboards/MarketingDirectorDashboard').then((m) => ({
    default: m.MarketingDirectorDashboard,
  })),
);
const CPMDashboard = lazy(() =>
  import('./components/dashboards/CPMDashboard').then((m) => ({ default: m.CPMDashboard })),
);
const DigitalLeadOperatorDashboard = lazy(() =>
  import('./components/dashboards/DigitalLeadOperatorDashboard').then((m) => ({
    default: m.DigitalLeadOperatorDashboard,
  })),
);
const DigitalMarketingHeadDashboard = lazy(() =>
  import('./components/dashboards/DigitalMarketingHeadDashboard').then((m) => ({
    default: m.DigitalMarketingHeadDashboard,
  })),
);
const DigitalMarketingExecutiveDashboard = lazy(() =>
  import('./components/dashboards/DigitalMarketingExecutiveDashboard').then((m) => ({
    default: m.DigitalMarketingExecutiveDashboard,
  })),
);
const AgentDashboard = lazy(() =>
  import('./components/dashboards/AgentDashboard').then((m) => ({ default: m.AgentDashboard })),
);
const FinanceDashboard = lazy(() =>
  import('./components/dashboards/FinanceDashboard').then((m) => ({ default: m.FinanceDashboard })),
);

import { MobileBottomNav } from './components/common/MobileBottomNav';
import { PWAInstallPrompt } from './components/common/PWAInstallPrompt';
import { UpdateAvailableBanner } from './components/common/UpdateAvailableBanner';
import { useSwUpdate } from './hooks/useSwUpdate';
import { Bell, Users, CalendarCheck, ShieldCheck } from 'lucide-react';

import { API_BASE_URL } from './config';
import { useIdleTimer } from './hooks/useIdleTimer';
import { usePushNotifications } from './hooks/usePushNotifications';
import { GlobalAnnouncementBanner } from './components/common/GlobalAnnouncementBanner';
import { Roles, Permissions } from './shared';
import { Kiosk } from './components/attendance/Kiosk';
import { AppLockScreen } from './components/auth/AppLockScreen';
import { PublicFeedbackForm } from './components/feedback/PublicFeedbackForm';
import { ThemeProvider } from './hooks/useTheme';

// Lazy-loaded heavy tab modules for optimal initial load performance & code splitting
const LeadManagement = lazy(() =>
  import('./components/leads/LeadManagement').then((m) => ({ default: m.LeadManagement })),
);
const SalesPipelineManagement = lazy(() =>
  import('./components/sales/SalesPipelineManagement').then((m) => ({
    default: m.SalesPipelineManagement,
  })),
);
const CustomerManagement = lazy(() =>
  import('./components/customers/CustomerManagement').then((m) => ({
    default: m.CustomerManagement,
  })),
);
const PropertyManagement = lazy(() =>
  import('./components/properties/PropertyManagement').then((m) => ({
    default: m.PropertyManagement,
  })),
);
const ProjectManagement = lazy(() =>
  import('./components/projects/ProjectManagement').then((m) => ({ default: m.ProjectManagement })),
);
const ProjectDashboard = lazy(() =>
  import('./components/projects/ProjectDashboard').then((m) => ({ default: m.ProjectDashboard })),
);
const UnitDetail = lazy(() =>
  import('./components/projects/UnitDetail').then((m) => ({ default: m.UnitDetail })),
);
const SiteVisitManagement = lazy(() =>
  import('./components/siteVisits/SiteVisitManagement').then((m) => ({
    default: m.SiteVisitManagement,
  })),
);
const DemoManagement = lazy(() =>
  import('./components/demos/DemoManagement').then((m) => ({ default: m.DemoManagement })),
);
const ComplaintManagement = lazy(() =>
  import('./components/complaints/ComplaintManagement').then((m) => ({
    default: m.ComplaintManagement,
  })),
);
const PMApprovalsHub = lazy(() =>
  import('./components/approvals/PMApprovalsHub').then((m) => ({ default: m.PMApprovalsHub })),
);
const ActionCenter = lazy(() =>
  import('./components/md/ActionCenter').then((m) => ({ default: m.ActionCenter })),
);
const TaskManager = lazy(() =>
  import('./components/tasks/TaskManager').then((m) => ({ default: m.TaskManager })),
);
const BookingManagement = lazy(() =>
  import('./components/commercial/BookingManagement').then((m) => ({
    default: m.BookingManagement,
  })),
);
const BookingDossier = lazy(() =>
  import('./components/commercial/BookingDossier').then((m) => ({ default: m.BookingDossier })),
);

// Expose a prefetch function for background loading
export const prefetchMainModules = () => {
  setTimeout(() => {
    import('./components/leads/LeadManagement');
    import('./components/sales/SalesPipelineManagement');
    import('./components/customers/CustomerManagement');
    import('./components/properties/PropertyManagement');
    import('./components/projects/ProjectManagement');
    import('./components/siteVisits/SiteVisitManagement');
    import('./components/tasks/TaskManager');
    import('./components/commercial/BookingManagement');
  }, 2000); // 2-second delay to prioritize initial render
};

// New Consolidated Hubs
const UserProfile = lazy(() =>
  import('./components/profile/UserProfile').then((m) => ({ default: m.UserProfile })),
);
const HRDashboard = lazy(() =>
  import('./components/hr/HRDashboard').then((m) => ({
    default: m.HRDashboard,
  })),
);
const ApprovalsDashboard = lazy(() =>
  import('./components/hr/ApprovalsDashboard').then((m) => ({ default: m.ApprovalsDashboard })),
);
const HRAttendanceDashboard = lazy(() =>
  import('./components/hr/HRAttendanceDashboard').then((m) => ({
    default: m.HRAttendanceDashboard,
  })),
);
const MyAttendancePage = lazy(() =>
  import('./components/attendance/MyAttendancePage').then((m) => ({ default: m.MyAttendancePage })),
);
const DailyReportsView = lazy(() =>
  import('./components/hr/DailyReportsView').then((m) => ({ default: m.DailyReportsView })),
);
const MyPerformanceDashboard = lazy(() =>
  import('./components/performance/MyPerformanceDashboard').then((m) => ({
    default: m.MyPerformanceDashboard,
  })),
);
const AchievementsDashboard = lazy(() =>
  import('./components/performance/AchievementsDashboard').then((m) => ({
    default: m.AchievementsDashboard,
  })),
);
const TeamPerformanceDashboard = lazy(() =>
  import('./components/performance/TeamPerformanceDashboard').then((m) => ({
    default: m.TeamPerformanceDashboard,
  })),
);
const PerformanceAdjustmentPage = lazy(() =>
  import('./components/performance/PerformanceAdjustmentPage').then((m) => ({
    default: m.default,
  })),
);
const AnalyticsHub = lazy(() =>
  import('./components/analytics/AnalyticsHub').then((m) => ({ default: m.AnalyticsHub })),
);
const DailyReportingPage = lazy(() =>
  import('./components/reports/DailyReportingPage').then((m) => ({
    default: m.DailyReportingPage,
  })),
);
const KioskManagementPage = lazy(() =>
  import('./components/system/KioskManagementPage').then((m) => ({
    default: m.KioskManagementPage,
  })),
);
const AdminSuperHub = lazy(() =>
  import('./components/admin/AdminSuperHub').then((m) => ({ default: m.AdminSuperHub })),
);
const PMTerritories = lazy(() =>
  import('./components/md/PMTerritories').then((m) => ({ default: m.PMTerritories })),
);
const FinanceHub = lazy(() =>
  import('./components/finance/FinanceHub').then((m) => ({ default: m.FinanceHub })),
);
const UserSettings = lazy(() =>
  import('./components/settings/UserSettings').then((m) => ({ default: m.UserSettings })),
);
const CustomerFeedbackDashboard = lazy(() =>
  import('./components/feedback/CustomerFeedbackDashboard').then((m) => ({
    default: m.CustomerFeedbackDashboard,
  })),
);
const FAQPage = lazy(() =>
  import('./components/help/FAQPage').then((m) => ({ default: m.FAQPage })),
);
const RolesResponsibilitiesPage = lazy(() =>
  import('./components/help/RolesResponsibilitiesPage').then((m) => ({
    default: m.RolesResponsibilitiesPage,
  })),
);
// Legacy for standard users
const LateLeaveProposals = lazy(() =>
  import('./components/attendance/LateLeaveProposals').then((m) => ({
    default: m.LateLeaveProposals,
  })),
);

// TopUtilityBar placeholder — title rendered in AppLayout header
const TopUtilityBar: React.FC<{ title?: string }> = ({ title }) => {
  return null;
};

const DefaultRedirect: React.FC<{ user: unknown }> = () => <Navigate to="/dashboard" replace />;

// AppShell provides the global layout shell: compact left sidebar, top utility bar,
// responsive 12-column content grid, and optional right rail. The Routes and
// internal modal logic are rendered as children inside the AppLayout content canvas.
const AppShell: React.FC<{ swUpdate: ReturnType<typeof useSwUpdate> }> = ({ swUpdate }) => {
  const {
    user,
    activeRole,
    accessToken,
    authStatus,
    firstLoginDone,
    attendanceStamped,
    login,
    logout,
    fetchWithAuth,
    isLocked,
    appLockEnabled,
    lock,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = location.pathname.replace('/', '') || 'dashboard';
  const [apiStatus, setApiStatus] = useState<string>('Checking...');
  const [showReportModal, setShowReportModal] = useState(false);
  const [pendingLogout, setPendingLogout] = useState(false);
  const { isSupported, permission, isSubscribing, subscribe } = usePushNotifications();

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then((res) => res.json())
      .then((data) => setApiStatus(data.status))
      .catch(() => setApiStatus('Offline'));

    // Prefetch main modules for better performance
    if (accessToken) {
      prefetchMainModules();
    }
    // Deliberately NOT auto-calling subscribe() here. Notification.
    // requestPermission() only shows the real browser prompt when it's
    // triggered by a genuine user gesture (a click) — called from a timer
    // like this, browsers either silently no-op it or downgrade it to a
    // barely-visible address-bar chip instead of the actual dialog, and can
    // even penalize the origin's future *real* gesture-triggered requests
    // for looking automated. The amber "Enable Notifications" banner below
    // (rendered whenever permission === 'default') is what actually asks —
    // its onClick={subscribe} is a real user gesture.
  }, [accessToken]);

  // Report Exemption Logic (for logout gate only — attendance gating removed)
  const isExemptFromReport =
    user?.reportRequired === false ||
    user?.roles?.some(
      (r) =>
        r === Roles.MD ||
        r === Roles.HR_MANAGER ||
        r === Roles.ADMIN ||
        r === Roles.MARKETING_DIRECTOR,
    );

  const [showLogoutIntentModal, setShowLogoutIntentModal] = useState(false);

  const handleLogoutClick = async () => {
    if (isExemptFromReport) {
      logout();
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/reports/today-status`);
      const data = await res.json();
      if (res.ok && data.report) {
        logout();
      } else {
        setShowLogoutIntentModal(true);
      }
    } catch (e) {
      setShowLogoutIntentModal(true);
    }
  };

  // § Phase 6 — a session now persists until the employee explicitly logs
  // out; this timer no longer force-logs-out on its own. For an employee who
  // has enabled App Lock, 30 minutes idle instead shows the lock screen
  // (requiring their device biometric/PIN to continue) rather than ending
  // the session. For everyone else, idle does nothing at all — "never
  // expires" applies to them too, app lock is an opt-in extra layer, not a
  // requirement.
  useIdleTimer({
    timeout: 30 * 60 * 1000,
    onIdle: () => {
      if (accessToken && appLockEnabled) {
        lock();
      }
    },
  });

  if (location.pathname === '/kiosk') {
    return (
      <ErrorBoundary>
        <Kiosk />
      </ErrorBoundary>
    );
  }

  // § Phase 7 — a customer reaching this via a WhatsApp link has no CRM
  // account; this must render before any auth-gated logic below (isLocked,
  // authStatus) so it works identically whether or not a staff member
  // happens to already be logged into this same browser.
  if (location.pathname.startsWith('/feedback/')) {
    const feedbackToken = location.pathname.slice('/feedback/'.length);
    return (
      <ErrorBoundary>
        <PublicFeedbackForm token={feedbackToken} />
      </ErrorBoundary>
    );
  }

  if (isLocked) {
    return (
      <ErrorBoundary>
        <AppLockScreen />
      </ErrorBoundary>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen flex">
        {/* Branding panel -- desktop only. On a wide screen the login card
            alone left the rest of the viewport looking like an empty plain
            background; this fills it with the identity the card lacks room
            for, instead of stretching the same small card wider. */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-navy-950 flex-col justify-between p-14">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-navy-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-[28rem] h-[28rem] bg-gold-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
              <img src="/logo.svg" alt="RS CRM Logo" className="w-7 h-7 object-contain" />
            </div>
            <span className="text-lg font-black tracking-tight text-white">RS CRM</span>
          </div>

          <div className="relative max-w-md">
            <h1 className="text-4xl font-extrabold text-white tracking-tight leading-tight">
              Real estate CRM & workforce management, in one place.
            </h1>
            <p className="text-slate-300 mt-4 text-sm leading-relaxed">
              Leads, properties, site visits, and bookings — alongside attendance, performance, and
              HR — for the whole team.
            </p>

            <div className="mt-10 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gold-500/15 text-gold-400 flex items-center justify-center shrink-0">
                  <Users className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Leads & Properties</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    From first inquiry to booking, tracked end to end.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gold-500/15 text-gold-400 flex items-center justify-center shrink-0">
                  <CalendarCheck className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Attendance & Performance</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Kiosk check-ins, leave, and daily reporting.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gold-500/15 text-gold-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Team & HR Management</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Role-based access, employee records, and approvals.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="relative text-slate-500 text-xs">
            © {new Date().getFullYear()} RS CRM. All rights reserved.
          </p>
        </div>

        {/* Login card panel */}
        <div className="flex-1 flex items-center justify-center p-4 bg-slate-950 lg:bg-slate-50 bg-gradient-to-br from-slate-900 via-slate-800 to-navy-950 lg:bg-none relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-navy-600/20 rounded-full blur-3xl pointer-events-none lg:hidden" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-gold-500/10 rounded-full blur-3xl pointer-events-none lg:hidden" />
          <LoginForm />
        </div>
      </div>
    );
  }

  if (authStatus === 'bootstrapping') {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-8">
        <div className="text-navy text-xl font-semibold mb-4">RRH-CRMS</div>
        <div className="w-12 h-12 border-4 border-navy border-t-transparent rounded-full animate-spin mb-4"></div>
        <span className="text-neutral-600">Loading application...</span>
      </div>
    );
  }

  if (!firstLoginDone) {
    return <FirstLoginSetup />;
  }

  const isMD = activeRole === Roles.MD || activeRole === Roles.ADMIN;
  const isTechAdmin = activeRole === Roles.ADMIN;
  const isHRManager = activeRole === Roles.HR_MANAGER;
  const isProjectManager = activeRole === Roles.PROJECT_MANAGER;
  const isTelecaller = activeRole === Roles.TELECALLER;
  const isSalesManager = activeRole === Roles.SALES_MANAGER;
  const isMarketingDirector = activeRole === Roles.MARKETING_DIRECTOR;
  const isChannelPartnerManager = activeRole === Roles.CHANNEL_PARTNER_MANAGER;
  const isDigitalLeadOperator = activeRole === Roles.DIGITAL_LEAD_OPERATOR;
  const isDigitalMarketingHead = activeRole === Roles.DIGITAL_MARKETING_HEAD;
  const isDigitalMarketingExecutive = activeRole === Roles.DIGITAL_MARKETING_EXECUTIVE;
  const isAgent = activeRole === Roles.AGENT;
  const isFinance = activeRole === Roles.FINANCE;
  const isStandardStaff =
    !isMD &&
    !isTechAdmin &&
    !isHRManager &&
    !isProjectManager &&
    !isTelecaller &&
    !isSalesManager &&
    !isMarketingDirector &&
    !isChannelPartnerManager &&
    !isDigitalLeadOperator &&
    !isDigitalMarketingHead &&
    !isDigitalMarketingExecutive &&
    !isAgent &&
    !isFinance;

  // Role-based access for hubs
  const canManageTargets = ([Roles.MD, Roles.MARKETING_DIRECTOR, Roles.ADMIN] as string[]).includes(
    activeRole,
  );
  const canManageEmployees = ([Roles.MD, Roles.HR_MANAGER, Roles.ADMIN] as string[]).includes(
    activeRole,
  );
  const canViewTeamPerformance = (
    [
      Roles.MD,
      Roles.ADMIN,
      Roles.MARKETING_DIRECTOR,
      Roles.HR_MANAGER,
      Roles.PROJECT_MANAGER,
      Roles.DIGITAL_MARKETING_HEAD,
      Roles.FINANCE,
      Roles.SALES_MANAGER,
    ] as string[]
  ).includes(activeRole);

  const canAccessCommercial = (
    [
      Roles.MD,
      Roles.ADMIN,
      Roles.SALES_MANAGER,
      Roles.TELECALLER,
      Roles.AGENT,
      Roles.MARKETING_DIRECTOR,
      Roles.FINANCE,
      Roles.CHANNEL_PARTNER_MANAGER,
    ] as string[]
  ).includes(activeRole);

  // Role-to-dashboard resolver — each role gets its own dedicated dashboard
  const dashboardElement = (
    <Routes>
      <Route path="/" element={<DefaultRedirect user={user} />} />
      <Route
        path="/dashboard"
        element={
          isMD ? (
            <MDExecutiveDashboard />
          ) : isTechAdmin ? (
            <AdminCommandCenter />
          ) : isHRManager ? (
            <HRDashboard />
          ) : isProjectManager ? (
            <PMDashboard />
          ) : isSalesManager ? (
            <SalesManagerDashboard />
          ) : isMarketingDirector ? (
            <MarketingDirectorDashboard />
          ) : isTelecaller ? (
            <TelecallerDashboard />
          ) : isChannelPartnerManager ? (
            <CPMDashboard />
          ) : isDigitalLeadOperator ? (
            <DigitalLeadOperatorDashboard />
          ) : isDigitalMarketingHead ? (
            <DigitalMarketingHeadDashboard />
          ) : isDigitalMarketingExecutive ? (
            <DigitalMarketingExecutiveDashboard />
          ) : isAgent ? (
            <AgentDashboard />
          ) : isFinance ? (
            <FinanceDashboard />
          ) : (
            <StaffDashboard />
          )
        }
      />

      <Route path="/leads" element={<LeadManagement />} />
      <Route path="/leads-clients" element={<LeadManagement />} />
      <Route path="/sales-pipeline" element={<SalesPipelineManagement />} />
      <Route
        path="/customers"
        element={
          canAccessCommercial ? <CustomerManagement /> : <Navigate to="/dashboard" replace />
        }
      />
      <Route path="/complaints" element={<ComplaintManagement />} />
      <Route path="/projects" element={<ProjectManagement />} />
      <Route path="/projects/:id" element={<ProjectDashboard />} />
      <Route path="/projects/:projectId/units/:unitId" element={<UnitDetail />} />
      <Route path="/properties" element={<PropertyManagement />} />
      <Route path="/site-visits" element={<SiteVisitManagement />} />
      <Route path="/demos" element={<DemoManagement />} />
      <Route
        path="/action-center"
        element={isMD ? <ActionCenter /> : <Navigate to="/" replace />}
      />
      <Route path="/pm/approvals" element={<PMApprovalsHub />} />
      <Route path="/pm/site-visits/approvals" element={<PMApprovalsHub />} />
      <Route path="/pm/demos/approvals" element={<PMApprovalsHub />} />
      <Route path="/tasks" element={<TaskManager />} />
      <Route path="/daily-report" element={<DailyReportingPage />} />
      <Route
        path="/bookings"
        element={canAccessCommercial ? <BookingManagement /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/bookings/:id"
        element={canAccessCommercial ? <BookingDossier /> : <Navigate to="/dashboard" replace />}
      />
      <Route path="/profile" element={<UserProfile />} />
      <Route path="/my-attendance" element={<MyAttendancePage />} />
      <Route path="/my-performance" element={<MyPerformanceDashboard />} />
      <Route
        path="/achievements"
        element={
          <Suspense
            fallback={
              <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-600"></div>
              </div>
            }
          >
            <AchievementsDashboard />
          </Suspense>
        }
      />
      <Route path="/settings" element={<UserSettings />} />
      <Route
        path="/faq"
        element={
          <Suspense
            fallback={
              <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-600"></div>
              </div>
            }
          >
            <FAQPage />
          </Suspense>
        }
      />
      <Route
        path="/roles-responsibilities"
        element={
          <Suspense
            fallback={
              <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-600"></div>
              </div>
            }
          >
            <RolesResponsibilitiesPage />
          </Suspense>
        }
      />

      {/* Consolidated Hubs */}
      <Route
        path="/hr-hub"
        element={canManageEmployees ? <HRDashboard /> : <Navigate to="/" replace />}
      />
      <Route
        path="/hr-attendance"
        element={canManageEmployees ? <HRAttendanceDashboard /> : <Navigate to="/" replace />}
      />
      <Route
        path="/team-performance"
        element={
          canViewTeamPerformance ? <TeamPerformanceDashboard /> : <Navigate to="/" replace />
        }
      />
      <Route
        path="/performance-adjustments"
        element={canManageEmployees ? <PerformanceAdjustmentPage /> : <Navigate to="/" replace />}
      />
      <Route
        path="/customer-feedback"
        element={
          canViewTeamPerformance ? (
            <Suspense
              fallback={
                <div className="flex h-screen items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-600"></div>
                </div>
              }
            >
              <CustomerFeedbackDashboard />
            </Suspense>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/approvals"
        element={canManageEmployees ? <ApprovalsDashboard /> : <Navigate to="/" replace />}
      />
      <Route
        path="/hr-daily-reports"
        element={canManageEmployees ? <DailyReportsView /> : <Navigate to="/" replace />}
      />

      <Route
        path="/analytics"
        element={
          canManageTargets || canViewTeamPerformance ? (
            <AnalyticsHub />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      {/* System Control was folded into Super Admin (2026-09-15) — redirect any old bookmarks/links. */}
      <Route path="/system-control" element={<Navigate to="/super-admin" replace />} />
      <Route
        path="/kiosk-management"
        element={isMD || isTechAdmin ? <KioskManagementPage /> : <Navigate to="/" replace />}
      />
      <Route
        path="/pm-territories"
        element={isMD || isTechAdmin ? <PMTerritories /> : <Navigate to="/" replace />}
      />
      <Route
        path="/super-admin"
        element={isTechAdmin ? <AdminSuperHub /> : <Navigate to="/" replace />}
      />

      <Route
        path="/finance"
        element={
          user?.permissions?.includes(Permissions.EXPENSES_READ_OWN) ? (
            <FinanceHub />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  // Page context for the header — one clear business title per route.
  const PAGE_TITLES: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/leads': 'Leads',
    '/leads-clients': 'Leads',
    '/sales-pipeline': 'Sales Pipeline',
    '/customers': 'Customers',
    '/properties': 'Properties',
    '/projects': 'Projects',
    '/site-visits': 'Site Visits',
    '/customer-feedback': 'Customer Feedback',
    '/faq': 'Help & FAQ',
    '/roles-responsibilities': 'Roles & Responsibilities',
    '/tasks': 'Tasks',
    '/bookings': 'Bookings',
    '/profile': 'Profile',
    '/settings': 'Personal Settings',
    '/hr-hub': 'Employees & Attendance',
    '/analytics': 'Analytics & Goals',
    '/kiosk-management': 'Kiosk Management',
    '/finance': 'Payments & Refunds',
    '/action-center': 'Action Center',
    '/pm/approvals': 'PM Approvals',
    '/pm/site-visits/approvals': 'PM Approvals',
    '/complaints': 'Complaints Management',
    '/demos': 'My Demos',
    '/pm/demos/approvals': 'PM Approvals',
    '/achievements': 'Achievements',
  };
  const pageTitle = PAGE_TITLES[location.pathname] || 'RRH-CRMS';

  return (
    <AppLayout title={pageTitle}>
      {/* Global Image Banner */}
      <GlobalAnnouncementBanner />

      {/* Push Notification Banner */}
      {isSupported && permission === 'default' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm z-30 relative">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-600 animate-bounce" />
            <span className="text-sm font-semibold text-amber-900">
              Enable push notifications to receive real-time updates and leads.
            </span>
          </div>
          <button
            onClick={subscribe}
            disabled={isSubscribing}
            className="w-full sm:w-auto bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-amber-700 transition-colors disabled:opacity-70 whitespace-nowrap"
          >
            {isSubscribing ? 'Enabling...' : 'Enable Notifications'}
          </button>
        </div>
      )}

      {/* Main Content Body — Routes rendered inside AppLayout content canvas */}
      <div className="main-content p-4 sm:p-6 max-w-7xl w-full mx-auto pb-20 md:pb-6">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="py-20 text-center text-xs text-slate-400 font-semibold flex flex-col items-center justify-center gap-3">
                <div className="w-7 h-7 border-3 border-navy-600 border-t-transparent rounded-full animate-spin"></div>
                <span>Loading workstation module...</span>
              </div>
            }
          >
            {dashboardElement}
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Mobile Bottom Navigation Bar & PWA Prompt */}
      <MobileBottomNav />
      <PWAInstallPrompt />
      <UpdateAvailableBanner {...swUpdate} />

      {/* Daily Report Modal (Logout Gate) */}
      <DailyReportModal
        isOpen={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setPendingLogout(false);
        }}
        onSuccess={() => {
          if (pendingLogout) logout();
        }}
      />

      {/* Logout Intent Modal */}
      {showLogoutIntentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl relative animate-scaleUp">
            <h3 className="font-bold text-slate-800 text-lg mb-2">Logout Action</h3>
            <p className="text-sm text-slate-600 mb-6">
              You haven't submitted your Daily Log. Were you working a full shift, or just
              visiting/updating?
            </p>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowLogoutIntentModal(false);
                  setPendingLogout(true);
                  setShowReportModal(true);
                }}
                className="w-full p-3 bg-navy-700 text-white font-bold rounded-xl hover:bg-navy-800 transition-colors shadow-md"
              >
                Submit Daily Log & Logout
              </button>
              <button
                onClick={() => {
                  setShowLogoutIntentModal(false);
                  logout();
                }}
                className="w-full p-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Just Visiting / Updating (Log out immediately)
              </button>
              <button
                onClick={() => setShowLogoutIntentModal(false)}
                className="w-full p-2 text-slate-500 font-bold hover:text-slate-700 text-xs"
              >
                Cancel Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

function App() {
  // Called exactly once here (not inside AppShell, and not again inside
  // UpdateAvailableBanner) -- useRegisterSW is NOT a shared singleton, each
  // call spins up its own independent Workbox registration, periodic
  // update-check interval, and needRefresh state, so calling it twice would
  // register the service worker twice over and run two redundant update
  // flows in parallel. Called here rather than inside AppShell so the
  // service worker registers and starts checking for updates even before
  // login -- AppShell early-returns <LoginForm /> for unauthenticated
  // users, which would otherwise delay registration until after sign-in.
  const swUpdate = useSwUpdate();

  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppShell swUpdate={swUpdate} />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
