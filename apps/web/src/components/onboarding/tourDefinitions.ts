import { RoleName, Roles } from '../../shared';

export interface TourStep {
  target: string;
  title: string;
  description: string;
  route?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const COMMON_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar-dashboard"]',
    title: 'Dashboard',
    description:
      'Your central command area. Get a quick overview of your key metrics, performance, and daily priorities.',
    route: '/dashboard',
    placement: 'right',
  },
];

export const TOUR_DEFINITIONS: Record<string, TourStep[]> = {
  [Roles.MD]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="dashboard-kpis"]',
      title: 'Command Center',
      description: 'Monitor organization-wide metrics and business performance.',
      route: '/dashboard',
    },
    {
      target: '[data-tour="sidebar-analytics"]',
      title: 'Analytics & Goals',
      description:
        'Review deep analytics across departments, track target achievement, and make data-driven decisions.',
      route: '/analytics',
      placement: 'right',
    },
    {
      target: '[data-tour="sidebar-finance"]',
      title: 'Finance Overview',
      description:
        'Monitor payments, manage refunds, and track the financial health of the organization.',
      route: '/finance',
      placement: 'right',
    },
    {
      target: '[data-tour="sidebar-hr-hub"]',
      title: 'HR Overview',
      description:
        'Review employee performance, attendance metrics, and manage organizational structure.',
      route: '/hr-hub',
      placement: 'right',
    },
  ],
  [Roles.ADMIN]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-system-control"]',
      title: 'System Control',
      description:
        'Manage technical system administration, configure security settings, and view audit logs.',
      route: '/system-control',
      placement: 'right',
    },
  ],
  [Roles.MARKETING_DIRECTOR]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-leads"]',
      title: 'Leads & Acquisition',
      description:
        'Oversee lead generation, review source performance, and hand off qualified leads to sales.',
      route: '/leads',
      placement: 'right',
    },
    {
      target: '[data-tour="sidebar-analytics"]',
      title: 'Marketing Analytics',
      description: 'Analyze campaign performance and bulk lead acquisition metrics.',
      route: '/analytics',
      placement: 'right',
    },
  ],
  [Roles.SALES_MANAGER]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="dashboard-kpis"]',
      title: 'Command Center',
      description: 'Monitor overall sales performance metrics across your organization.',
      route: '/dashboard',
    },
    {
      target: '[data-tour="dashboard-pipeline"]',
      title: 'Pipeline Conversion',
      description:
        'Track how efficiently your team is converting leads into site visits and closed deals.',
      route: '/dashboard',
    },
    {
      target: '[data-tour="dashboard-team-performance"]',
      title: 'Team Execution',
      description: 'Compare sales execution and follow-up performance across your team.',
      route: '/dashboard',
    },
    {
      target: '[data-tour="dashboard-lead-attribution"]',
      title: 'Lead Attribution',
      description:
        'See who originally introduced each lead. Assignment changes do not change introduction credit.',
      route: '/dashboard',
    },
    {
      target: '[data-tour="dashboard-stalled-leads"]',
      title: 'Stalled Leads',
      description:
        'Identify leads that need managerial intervention because follow-up has stopped.',
      route: '/dashboard',
    },
    {
      target: '[data-tour="dashboard-overdue-tasks"]',
      title: 'Overdue Follow-ups',
      description: 'Monitor missed or overdue tasks across the sales team.',
      route: '/dashboard',
    },
    {
      target: '[data-tour="dashboard-site-visits"]',
      title: 'Site Visits',
      description: 'Track the status of all scheduled and completed site visits.',
      route: '/dashboard',
    },
    {
      target: '[data-tour="dashboard-targets"]',
      title: 'Targets',
      description: 'Track overall revenue and sales target attainment.',
      route: '/dashboard',
    },
    {
      target: '[data-tour="sidebar-leads"]',
      title: 'Lead Distribution',
      description:
        'Manage the sales lead pipeline here. Review lead status, ownership, follow-ups and assignment.',
      route: '/leads',
      placement: 'right',
    },
    {
      target: '[data-tour="lead-attribution-block"]',
      title: 'Attribution vs Assignment',
      description:
        '"Introduced By" is permanent attribution credit \u2014 whoever originally brought the lead into the CRM. "Assigned To" is who is currently working the lead and may change via reassignment. These are two distinct concepts: credit versus responsibility.',
      route: '/leads',
    },
    {
      target: '[data-tour="sidebar-tasks"]',
      title: 'Tasks & Follow-ups',
      description: 'Monitor team follow-ups and overdue sales activities.',
      route: '/tasks',
      placement: 'right',
    },
    {
      target: '[data-tour="sidebar-analytics"]',
      title: 'Analytics & Targets',
      description: 'Review deep team performance analytics, conversion rates, and lead sources.',
      route: '/analytics',
      placement: 'right',
    },
  ],
  [Roles.TELECALLER]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-leads"]',
      title: 'Assigned Leads',
      description:
        'View your calling queue, qualify leads, log interactions, and schedule site visits.',
      route: '/leads',
      placement: 'right',
    },
    {
      target: '[data-tour="lead-create"]',
      title: 'Lead Creation',
      description:
        'This lead is automatically attributed to you as the person who introduced it into CRM.',
      route: '/leads',
    },
    {
      target: '[data-tour="sidebar-tasks"]',
      title: 'Follow-ups',
      description: 'Track your scheduled calls and follow-up activities.',
      route: '/tasks',
      placement: 'right',
    },
  ],
  [Roles.AGENT]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-leads"]',
      title: 'My Leads',
      description: 'Manage leads assigned to you and work them through the conversion pipeline.',
      route: '/leads',
      placement: 'right',
    },
    {
      target: '[data-tour="sidebar-site-visits"]',
      title: 'Site Visits',
      description: 'Review site visits assigned to you and log the outcomes.',
      route: '/site-visits',
      placement: 'right',
    },
    {
      target: '[data-tour="sidebar-customers"]',
      title: 'Customers',
      description: 'Manage your active customer relationships.',
      route: '/customers',
      placement: 'right',
    },
  ],
  [Roles.PROJECT_MANAGER]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-properties"]',
      title: 'Property Operations',
      description: 'Manage property inventory, verification, and operational status.',
      route: '/properties',
      placement: 'right',
    },
    {
      target: '[data-tour="sidebar-projects"]',
      title: 'Projects',
      description: 'Manage ongoing real estate projects and workflow milestones.',
      route: '/projects',
      placement: 'right',
    },
    {
      target: '[data-tour="sidebar-site-visits"]',
      title: 'Site Visits',
      description: 'Monitor site visits occurring at your properties.',
      route: '/site-visits',
      placement: 'right',
    },
  ],
  [Roles.INVENTORY_EXECUTIVE]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-projects"]',
      title: 'Projects',
      description:
        'Add and update projects for the Project Managers. Pick the PM who gave you the data — they review and submit it.',
      route: '/projects',
      placement: 'right',
    },
    {
      target: '[data-tour="sidebar-properties"]',
      title: 'Properties',
      description:
        'Add and update property listings, photos and pricing. New listings go to the assigned PM for verification.',
      route: '/properties',
      placement: 'right',
    },
  ],
  [Roles.HR_MANAGER]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-hr-hub"]',
      title: 'Employees & HR',
      description:
        'Manage employees, review attendance, process leave proposals, and track HR metrics.',
      route: '/hr-hub',
      placement: 'right',
    },
  ],
  [Roles.FINANCE]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-finance"]',
      title: 'Finance Workspace',
      description:
        'Process payments, manage expense/refund workflows, and generate financial reports.',
      route: '/finance',
      placement: 'right',
    },
  ],
  [Roles.DIGITAL_MARKETING_HEAD]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-leads"]',
      title: 'Digital Marketing Leads',
      description: 'Monitor lead acquisition from digital campaigns and performance metrics.',
      route: '/leads',
      placement: 'right',
    },
  ],
  [Roles.DIGITAL_MARKETING_EXECUTIVE]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-tasks"]',
      title: 'Marketing Tasks',
      description: 'Manage your assigned marketing tasks and execution workflows.',
      route: '/tasks',
      placement: 'right',
    },
  ],
  [Roles.DIGITAL_LEAD_OPERATOR]: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-leads"]',
      title: 'Lead Operations',
      description: 'Process incoming leads and manage lead distribution.',
      route: '/leads',
      placement: 'right',
    },
  ],
  GENERAL: [
    ...COMMON_STEPS,
    {
      target: '[data-tour="sidebar-profile"]',
      title: 'Profile & Settings',
      description: 'Manage your personal profile and account settings.',
      route: '/profile',
      placement: 'right',
    },
  ],
};

export const getRoleTour = (roles: string[]): TourStep[] => {
  // Give priority to the most important roles
  const priorityOrder = [
    Roles.MD,
    Roles.ADMIN,
    Roles.MARKETING_DIRECTOR,
    'Sales manager',
    Roles.PROJECT_MANAGER,
    Roles.INVENTORY_EXECUTIVE,
    Roles.HR_MANAGER,
    Roles.FINANCE,
    Roles.DIGITAL_MARKETING_HEAD,
    Roles.DIGITAL_LEAD_OPERATOR,
    Roles.TELECALLER,
    Roles.AGENT,
    Roles.DIGITAL_MARKETING_EXECUTIVE,
  ];

  for (const prioritizedRole of priorityOrder) {
    if (roles.includes(prioritizedRole)) {
      return TOUR_DEFINITIONS[prioritizedRole as RoleName] || TOUR_DEFINITIONS['GENERAL']!;
    }
  }

  return TOUR_DEFINITIONS['GENERAL']!;
};
