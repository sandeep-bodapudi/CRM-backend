import React, { type ComponentType, useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Users,
  Building2,
  MapPinned,
  CalendarCheck,
  FileCheck,
  IndianRupee,
  Settings2,
  UserCircle,
  ClipboardList,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Map,
  FileText,
  Menu,
  Clock,
  Calendar,
  TrendingUp,
  ShieldCheck,
  MonitorSmartphone,
  ClipboardCheck,
  MessageSquareText,
  MessageSquareWarning,
  HelpCircle,
  BookOpen,
  Trophy,
  GitBranch,
  Target,
} from 'lucide-react';
import { Roles, Permissions } from '../../shared';
import { useAuth } from '../../context/AuthContext';
import { useLogoutGate } from '../../hooks/useLogoutGate';
import { NotificationDrawer } from '../notifications/NotificationDrawer';
import { ProductTour } from '../onboarding/ProductTour';
import { EmergencyLogoutModal } from '../profile/EmergencyLogoutModal';

export const AppLayout: React.FC<{
  children: React.ReactNode;
  showRightRail?: boolean;
  title?: string;
}> = ({ children, showRightRail = false, title }) => {
  const { user, logout, activeRole, setActiveRole } = useAuth();
  const { canLogoutNow } = useLogoutGate();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [showEmergencyLogout, setShowEmergencyLogout] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const handleLogoutClick = async () => {
    setIsProfileMenuOpen(false);
    if (await canLogoutNow()) {
      logout();
    } else {
      setShowEmergencyLogout(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name?: string, empCode?: string) => {
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (empCode) return empCode.slice(0, 2).toUpperCase();
    return 'U';
  };

  const initials = getInitials(user?.fullName, user?.employeeCode);

  return (
    <div className="app-shell h-[100dvh] w-full flex flex-col overflow-hidden bg-canvas">
      {/* Top Utility Bar */}
      <header className="utility-bar shrink-0 bg-white dark:bg-slate-800 border-b border-neutral-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/logo.svg" alt="RS CRM Logo" className="h-8 w-auto hidden sm:block" />
          <span className="text-sm font-black tracking-tight text-gold whitespace-nowrap sm:hidden md:inline-block">
            RS CRM
          </span>
          {title && (
            <>
              <span className="text-neutral-300 hidden sm:inline-block" aria-hidden="true">
                /
              </span>
              <h1 className="text-lg font-semibold text-navy truncate max-w-[150px] sm:max-w-xs">
                {title}
              </h1>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <NotificationDrawer />
          <div className="relative" ref={profileMenuRef}>
            <button
              aria-label="Open user menu"
              aria-expanded={isProfileMenuOpen}
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-navy"
            >
              <span className="w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center font-medium text-sm shadow-sm">
                {initials}
              </span>
            </button>
            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-neutral-100 dark:border-slate-700 py-2 z-50">
                <div className="px-4 py-3 border-b border-neutral-100 dark:border-slate-700">
                  <p className="text-sm font-semibold text-navy dark:text-navy-300 truncate">
                    {user?.fullName || 'Unknown User'}
                  </p>
                  {user?.roles && user.roles.length > 1 ? (
                    <select
                      value={activeRole}
                      onChange={(e) => setActiveRole(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 block w-full text-xs text-neutral-500 dark:text-slate-400 capitalize bg-neutral-50 dark:bg-slate-700 border border-neutral-200 dark:border-slate-600 rounded px-2 py-1 outline-none cursor-pointer"
                    >
                      {user.roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-neutral-500 dark:text-slate-400 capitalize truncate">
                      {activeRole}
                    </p>
                  )}
                  <p className="text-[10px] text-neutral-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                    {user?.employeeCode}
                  </p>
                </div>
                <div className="py-1">
                  <NavLink
                    to="/profile"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-neutral-700 dark:text-slate-300 hover:bg-neutral-50 dark:hover:bg-slate-700"
                  >
                    Profile
                  </NavLink>
                  <NavLink
                    to="/settings"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-neutral-700 dark:text-slate-300 hover:bg-neutral-50 dark:hover:bg-slate-700"
                  >
                    Settings
                  </NavLink>
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      window.dispatchEvent(new Event('restart-product-tour'));
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-navy-600 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-slate-700"
                  >
                    Take Product Tour
                  </button>
                  <button
                    onClick={handleLogoutClick}
                    className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
          {showEmergencyLogout && (
            <EmergencyLogoutModal onClose={() => setShowEmergencyLogout(false)} />
          )}
          <div className="md:hidden w-8" />{' '}
          {/* Placeholder to balance the layout since the menu button moved to bottom nav */}
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <aside
          className="hidden md:block sidebar-left bg-navy-950 border-r border-navy-900 p-4 shrink-0 h-full overflow-y-auto"
          style={{ width: '260px' }}
        >
          <SidebarNav />
        </aside>

        {/* Main Content Canvas */}
        <main className="main-content flex-1 min-w-0 h-full overflow-y-auto p-8 relative pb-20 md:pb-8">
          {children}
        </main>

        {/* Optional Right Rail */}
        {showRightRail && (
          <div
            className="hidden lg:block rail-right bg-white dark:bg-slate-800 border-l border-neutral-200 dark:border-slate-700 p-6 shrink-0 h-full overflow-y-auto"
            style={{ width: '320px' }}
          >
            <ContextualRail />
          </div>
        )}
      </div>
      <ProductTour />
    </div>
  );
};

type SidebarNavItem = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  path?: string;
  active?: boolean;
  group?: boolean;
  /** Canonical permission value required to see this item (e.g. Permissions.LEADS_READ). Omit = always visible. */
  requiredPermission?: string;
  /** Canonical Roles.* values; item visible if the user holds ANY of them. Omit = no role restriction. */
  requiredAnyRole?: string[];
};

const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  // CORE APP (Un-grouped)
  { id: 'command-center', label: 'Dashboard', icon: Settings2, path: '/dashboard' },
  {
    id: 'leads-clients',
    label: 'Leads',
    icon: Users,
    path: '/leads-clients',
    requiredPermission: Permissions.LEADS_READ,
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    path: '/customers',
    requiredAnyRole: [
      Roles.MD,
      Roles.ADMIN,
      Roles.SALES_MANAGER,
      Roles.TELECALLER,
      Roles.AGENT,
      Roles.MARKETING_DIRECTOR,
      Roles.FINANCE,
      Roles.CHANNEL_PARTNER_MANAGER,
    ],
    requiredPermission: Permissions.CUSTOMERS_READ,
  },
  {
    id: 'complaints',
    label: 'Complaints',
    icon: MessageSquareWarning,
    path: '/complaints',
    requiredPermission: Permissions.COMPLAINTS_READ,
  },
  {
    id: 'site-visits',
    label: 'Site Visits',
    icon: CalendarCheck,
    path: '/site-visits',
    requiredPermission: Permissions.SITE_VISITS_READ,
  },
  {
    id: 'demos',
    label: 'Demos',
    icon: Calendar,
    path: '/demos',
    requiredPermission: Permissions.DEMOS_READ,
  },
  {
    // Was just "Approvals" — identical to 'hr-approvals' below (a
    // different page, /approvals) despite having a different destination.
    // MD/Admin hold both sets of permissions, so they'd see two identically
    // labeled sidebar items leading to different pages. Renamed to match
    // this route's own page-title convention already used elsewhere
    // (App.tsx's title map: '/pm/approvals' -> 'PM Approvals').
    id: 'pm-approvals',
    label: 'PM Approvals',
    icon: ClipboardCheck,
    path: '/pm/approvals',
    requiredPermission: `${Permissions.SITE_VISITS_ACCEPT}|${Permissions.DEMOS_ACCEPT}`,
  },
  {
    id: 'action-center',
    label: 'Action Center',
    icon: ShieldCheck,
    path: '/action-center',
    requiredAnyRole: [Roles.MD, Roles.ADMIN],
  },
  { id: 'sales-pipeline', label: 'Sales Pipeline', icon: GitBranch, path: '/sales-pipeline' },
  {
    id: 'property-inventory',
    label: 'Properties',
    icon: Building2,
    path: '/properties',
    requiredPermission: Permissions.PROPERTIES_READ,
  },
  {
    id: 'projects-sites',
    label: 'Projects',
    icon: MapPinned,
    path: '/projects',
    requiredPermission: Permissions.PROJECTS_READ,
  },
  {
    id: 'bookings',
    label: 'Bookings',
    icon: FileCheck,
    path: '/bookings',
    requiredAnyRole: [
      Roles.MD,
      Roles.ADMIN,
      Roles.SALES_MANAGER,
      Roles.TELECALLER,
      Roles.AGENT,
      Roles.MARKETING_DIRECTOR,
      Roles.FINANCE,
      Roles.CHANNEL_PARTNER_MANAGER,
    ],
    requiredPermission: Permissions.BOOKINGS_READ,
  },

  // WORK
  { id: 'group-work', label: 'WORK', group: true, icon: undefined },
  { id: 'my-attendance', label: 'My Attendance', icon: CalendarCheck, path: '/my-attendance' },
  { id: 'my-performance', label: 'My Performance', icon: TrendingUp, path: '/my-performance' },
  { id: 'achievements', label: 'Achievements', icon: Trophy, path: '/achievements' },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: ClipboardList,
    path: '/tasks',
    requiredPermission: Permissions.TASKS_READ,
  },
  { id: 'daily-report', label: 'Daily Report', icon: FileText, path: '/daily-report' },

  // FINANCE
  { id: 'group-finance', label: 'FINANCE', group: true, icon: undefined },
  // Every role now gets EXPENSES_CREATE/EXPENSES_READ_OWN so any employee can
  // submit and track their own petty-cash refunds -- FinanceHub.tsx's own
  // docstring says as much ("Any employee: their own refund submissions +
  // New Request button"), but this item was previously gated to just
  // MD/Admin/Finance, hiding that page from everyone else entirely.
  {
    id: 'finance',
    label: 'Payments & Refunds',
    icon: IndianRupee,
    path: '/finance',
    requiredPermission: Permissions.EXPENSES_READ_OWN,
  },

  // OPERATIONS
  { id: 'group-operations', label: 'OPERATIONS', group: true, icon: undefined },
  {
    id: 'hr-employees',
    label: 'Employees',
    icon: Users,
    path: '/hr-hub',
    requiredAnyRole: [Roles.MD, Roles.HR_MANAGER, Roles.ADMIN],
  },
  {
    id: 'hr-attendance',
    label: 'Attendance',
    icon: Clock,
    path: '/hr-attendance',
    requiredAnyRole: [Roles.MD, Roles.HR_MANAGER, Roles.ADMIN],
  },
  {
    // Matches this feature's own naming elsewhere (the dashboard StatCard
    // for this same page is labeled "HR Approvals") — see 'pm-approvals'
    // above for why the generic "Approvals" label was ambiguous.
    id: 'hr-approvals',
    label: 'HR Approvals',
    icon: Calendar,
    path: '/approvals',
    requiredAnyRole: [Roles.MD, Roles.HR_MANAGER, Roles.ADMIN],
  },
  {
    id: 'team-performance',
    label: 'Team Performance',
    icon: TrendingUp,
    path: '/team-performance',
    requiredAnyRole: [
      Roles.MD,
      Roles.ADMIN,
      Roles.MARKETING_DIRECTOR,
      Roles.HR_MANAGER,
      Roles.PROJECT_MANAGER,
      Roles.DIGITAL_MARKETING_HEAD,
      Roles.FINANCE,
      Roles.SALES_MANAGER,
    ],
  },
  {
    id: 'performance-adjustments',
    label: 'Score Adjustments',
    icon: Settings2,
    path: '/performance-adjustments',
    requiredAnyRole: [Roles.MD, Roles.ADMIN, Roles.HR_MANAGER],
  },
  {
    id: 'customer-feedback',
    label: 'Customer Feedback',
    icon: MessageSquareText,
    path: '/customer-feedback',
    requiredAnyRole: [
      Roles.MD,
      Roles.ADMIN,
      Roles.MARKETING_DIRECTOR,
      Roles.HR_MANAGER,
      Roles.PROJECT_MANAGER,
      Roles.DIGITAL_MARKETING_HEAD,
      Roles.FINANCE,
      Roles.SALES_MANAGER,
    ],
  },
  {
    id: 'hr-daily-reports',
    label: 'Daily Reports',
    icon: FileText,
    path: '/hr-daily-reports',
    requiredAnyRole: [Roles.MD, Roles.HR_MANAGER, Roles.ADMIN],
  },
  {
    id: 'analytics',
    label: 'Analytics & Goals',
    icon: Target,
    path: '/analytics',
    requiredAnyRole: [
      Roles.MD,
      Roles.ADMIN,
      Roles.MARKETING_DIRECTOR,
      Roles.HR_MANAGER,
      Roles.PROJECT_MANAGER,
      Roles.DIGITAL_MARKETING_HEAD,
      Roles.FINANCE,
      Roles.SALES_MANAGER,
    ],
  },
  {
    id: 'pm-territories',
    label: 'PM Territories',
    icon: Map,
    path: '/pm-territories',
    requiredAnyRole: [Roles.MD, Roles.ADMIN],
  },

  // ADMINISTRATION
  { id: 'group-administration', label: 'ADMINISTRATION', group: true, icon: undefined },
  {
    id: 'super-admin',
    label: 'Super Admin',
    icon: ShieldCheck,
    path: '/super-admin',
    requiredAnyRole: [Roles.ADMIN],
  },
  {
    id: 'kiosk-management',
    label: 'Kiosk Management',
    icon: MonitorSmartphone,
    path: '/kiosk-management',
    requiredAnyRole: [Roles.MD, Roles.ADMIN],
  },

  // ACCOUNT — visible to everyone, so it must NOT sit under a group label
  // (like the old "ADMINISTRATION" placement) that implies admin-only tools.
  // Both the desktop sidebar and MobileBottomNav's drawer render whatever
  // group an item is nested under, so a mislabeled group here mislabels it
  // in both places at once.
  { id: 'group-account', label: 'ACCOUNT', group: true, icon: undefined },
  { id: 'settings', label: 'Settings', icon: Settings2, path: '/settings' },
  { id: 'profile', label: 'Profile', icon: UserCircle, path: '/profile' },
  { id: 'faq', label: 'Help & FAQ', icon: HelpCircle, path: '/faq' },
  {
    id: 'roles-responsibilities',
    label: 'Roles & Responsibilities',
    icon: BookOpen,
    path: '/roles-responsibilities',
  },
];

export { SIDEBAR_NAV_ITEMS };
export type { SidebarNavItem };

const SidebarNav: React.FC = () => {
  const { user, activeRole } = useAuth();
  const location = useLocation();
  const userPermissions = user?.permissions ?? [];
  const isVisible = (item: SidebarNavItem): boolean => {
    const hasPermission = item.requiredPermission
      ? item.requiredPermission.split('|').some((p) => userPermissions.includes(p.trim()))
      : true;
    return hasPermission && (!item.requiredAnyRole || item.requiredAnyRole.includes(activeRole));
  };

  type NavNode = {
    isGroup: boolean;
    groupItem?: SidebarNavItem;
    children?: SidebarNavItem[];
    item?: SidebarNavItem;
  };
  const nodes: NavNode[] = [];
  let currentGroup: { groupItem: SidebarNavItem; children: SidebarNavItem[] } | null = null;

  for (const entry of SIDEBAR_NAV_ITEMS) {
    if (entry.group) {
      if (currentGroup && currentGroup.children.length > 0) {
        nodes.push({
          isGroup: true,
          groupItem: currentGroup.groupItem,
          children: currentGroup.children,
        });
      }
      currentGroup = { groupItem: entry, children: [] };
    } else if (isVisible(entry)) {
      if (currentGroup) {
        currentGroup.children.push(entry);
      } else {
        nodes.push({ isGroup: false, item: entry });
      }
    }
  }
  if (currentGroup && currentGroup.children.length > 0) {
    nodes.push({
      isGroup: true,
      groupItem: currentGroup.groupItem,
      children: currentGroup.children,
    });
  }

  const storageKey = `rrh_sidebar_state_${user?.id || 'default'}`;
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    // Default to every group expanded (not `{}`, all collapsed) so
    // frequently-needed items under WORK/FINANCE/OPERATIONS/ADMINISTRATION/
    // ACCOUNT (Settings, Profile, My Attendance, Tasks, ...) are visible on
    // first load instead of buried behind a manual expand click.
    const allExpanded: Record<string, boolean> = {};
    for (const node of nodes) {
      if (node.isGroup && node.groupItem) allExpanded[node.groupItem.id] = true;
    }
    return allExpanded;
  });

  useEffect(() => {
    let shouldUpdate = false;
    const newExpanded = { ...expandedGroups };
    for (const node of nodes) {
      if (node.isGroup && node.children) {
        if (node.children.some((child) => child.path && location.pathname.startsWith(child.path))) {
          if (!newExpanded[node.groupItem!.id]) {
            // Close others (accordion behavior)
            for (const key of Object.keys(newExpanded)) {
              newExpanded[key] = false;
            }
            newExpanded[node.groupItem!.id] = true;
            shouldUpdate = true;
          }
        }
      }
    }
    if (shouldUpdate) {
      setExpandedGroups(newExpanded);
      const persistenceOff =
        localStorage.getItem(`rrh_sidebar_persist_off_${user?.id || 'default'}`) === 'true';
      if (!persistenceOff) {
        localStorage.setItem(storageKey, JSON.stringify(newExpanded));
      }
    }
  }, [location.pathname, nodes, storageKey, user?.id]);

  const toggleGroup = (groupId: string) => {
    // Accordion behavior: closing others
    const newExpanded = { [groupId]: !expandedGroups[groupId] };
    setExpandedGroups(newExpanded);
    const persistenceOff =
      localStorage.getItem(`rrh_sidebar_persist_off_${user?.id || 'default'}`) === 'true';
    if (!persistenceOff) {
      localStorage.setItem(storageKey, JSON.stringify(newExpanded));
    }
  };

  return (
    <nav className="space-y-4 pb-12" aria-label="Main navigation">
      {nodes.map((node, idx) => {
        if (!node.isGroup && node.item) {
          const item = node.item;
          return (
            <NavLink
              key={item.id}
              to={item.path || '/'}
              data-tour={`sidebar-${item.id}`}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 rounded-md py-2 px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-navy-900 text-gold-400 font-semibold shadow-sm'
                    : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <div className="w-4 h-4 flex items-center justify-center shrink-0 opacity-80">
                {item.icon && <item.icon className="w-4 h-4" />}
              </div>
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        }

        const isExpanded = expandedGroups[node.groupItem!.id];
        return (
          <div key={node.groupItem!.id} className="space-y-1">
            <button
              onClick={() => toggleGroup(node.groupItem!.id)}
              aria-expanded={isExpanded}
              aria-controls={`group-${node.groupItem!.id}`}
              className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:text-white transition-colors rounded-md hover:bg-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:bg-navy-900 ${
                isExpanded ? 'text-white bg-navy-900/50 shadow-sm' : 'text-slate-400'
              }`}
            >
              <span>{node.groupItem!.label}</span>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 shrink-0" aria-label="Collapse group" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0" aria-label="Expand group" />
              )}
            </button>
            {isExpanded && (
              <div
                id={`group-${node.groupItem!.id}`}
                className="space-y-1 mt-1 ml-3 pl-3 border-l border-navy-800"
              >
                {node.children!.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.path || '/'}
                    data-tour={`sidebar-${item.id}`}
                    className={({ isActive }) =>
                      `w-full flex items-center gap-3 rounded-md py-2 px-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-navy-900 text-gold-400 font-semibold shadow-sm'
                          : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                      }`
                    }
                  >
                    <div className="w-4 h-4 flex items-center justify-center shrink-0 opacity-80">
                      {item.icon && <item.icon className="w-4 h-4" />}
                    </div>
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
};

const ContextualRail: React.FC = () => {
  return (
    <div>
      <h2 className="text-base font-semibold text-navy mb-3">Filters</h2>
      <p className="text-xs text-neutral-500 mb-4">Refine your view with contextual filters.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Date range</label>
          <select className="input-field w-full text-sm">
            <option>This week</option>
            <option>This month</option>
            <option>This quarter</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Status</label>
          <select className="input-field w-full text-sm">
            <option>All</option>
            <option>Active</option>
            <option>Completed</option>
          </select>
        </div>
      </div>
    </div>
  );
};
