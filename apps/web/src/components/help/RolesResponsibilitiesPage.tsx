import React, { useMemo, useState } from 'react';
import {
  Search,
  BookOpen,
  Crown,
  ShieldCheck,
  Megaphone,
  Building2,
  Radio,
  PhoneCall,
  Megaphone as MegaphoneHead,
  Users2,
  Wallet,
  Handshake,
  TrendingUp,
  Share2,
  Network,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Roles } from '../../shared';

interface RoleEntry {
  // Matches a value in shared/index.ts's Roles constant exactly, so this
  // page can filter to the signed-in employee's own role(s) rather than
  // fuzzy-matching display-name strings (which differ in casing/wording
  // from the raw role names, e.g. Roles.FINANCE === 'accountant' vs. this
  // entry's display "Finance / Accountant").
  key: string;
  role: string;
  tagline: string;
  icon: React.ElementType;
  responsibilities: string[];
}

// § Phase 8 — item #30. Written against RolePermissionsMatrix in
// apps/api/src/shared/auth.ts and the actual workflows fixed elsewhere this
// pass (lead lifecycle, verification chain, site-visit/demo blind-acceptance,
// performance scoring) rather than generic role-description filler. Update
// this list whenever a role's real permissions or a workflow it references
// changes, so it never drifts from what the CRM actually does.
const ROLES: RoleEntry[] = [
  {
    key: Roles.MD,
    role: 'Managing Director',
    tagline: 'Full company visibility and final sign-off authority.',
    icon: Crown,
    responsibilities: [
      'Approves properties at the final step of the verification chain (Pending MD Approval → Live) and confirms bookings — no one else can confirm a booking.',
      'Assigns Project Managers to projects, and reassigns them with a recorded reason when needed.',
      'Reviews escalated site visits — any visit within 10 hours of its scheduled time with no PM acceptance yet is flagged to the MD automatically.',
      'Has full access to every module: leads, properties, projects, bookings, payments, employees, permissions, and audit logs.',
      "The only role (alongside Admin) that can reset a role's permissions to their system default, or grant/revoke an individual employee's permission.",
    ],
  },
  {
    key: Roles.ADMIN,
    role: 'Admin (Technical)',
    tagline: 'A second fully-privileged account for system administration.',
    icon: ShieldCheck,
    responsibilities: [
      'Same full access as the Managing Director — manages roles, permissions, employee accounts, and system-wide settings.',
      'Owns the Permissions Manager: granting or denying a permission for an entire role, or for one individual employee.',
      "Handles technical/administrative work the MD doesn't need to be pulled into personally (password resets, kiosk device management, audit log review).",
    ],
  },
  {
    key: Roles.PROJECT_MANAGER,
    role: 'Project Manager',
    tagline: 'Owns projects and properties end-to-end — creation through verification.',
    icon: Building2,
    responsibilities: [
      'Creates and edits Projects and Properties, and submits them for verification.',
      'Verifies properties in the first step of the approval chain (Pending Verification → Pending DM Polish).',
      "Accepts or declines incoming Site Visits and Demos — until accepted, only you can see who requested it; the customer's name and phone number only appear once you accept.",
      'The Properties page has two tabs for exactly this reason: "All Projects" for everything you can see, and "Needs Your Verification" for what\'s actually waiting on you today.',
      'Manages Tasks for your team, and resolves Complaints routed to you.',
    ],
  },
  {
    key: Roles.SALES_MANAGER,
    role: 'Sales Manager',
    tagline: 'Runs the sales team — lead distribution and site-visit assignment.',
    icon: TrendingUp,
    responsibilities: [
      'Assigns leads to telecallers/agents and monitors the lead distribution dashboard for imbalances.',
      'Assigns agents to site visits and tracks team performance and daily targets.',
      'Reviews team reports and configures performance targets for the sales team.',
      'Sends WhatsApp proposal messages to leads directly from the lead record.',
    ],
  },
  {
    key: Roles.TELECALLER,
    role: 'Telecaller',
    tagline: 'First point of contact — qualifies leads and books site visits.',
    icon: PhoneCall,
    responsibilities: [
      'Creates and updates leads, moves them through New → Contacted → Qualified, and schedules Demos or Site Visits.',
      'Converts a lead to a full Customer record once it reaches Booking Initiated — this can also happen automatically the moment a lead crosses that status.',
      'Receives an automatic WhatsApp-ready feedback-request message the moment a site visit you originated is marked Completed — one tap sends it to the customer.',
      'Submits a daily report before logging out. Skipping it costs a performance point (see Performance & Attendance below) — so does forgetting to log out before midnight.',
      'Scans in for attendance and can raise a late-arrival or leave proposal if something comes up.',
    ],
  },
  {
    key: Roles.AGENT,
    role: 'Agent',
    tagline: 'Executes site visits and demos in the field.',
    icon: Handshake,
    responsibilities: [
      'Completes assigned Site Visits and Demos, and logs outcomes (interested / not interested per property).',
      'Updates Customer records after a visit and can convert a lead to a customer.',
      'Creates and resolves Complaints raised against you or your visits.',
      'Same daily-report and midnight-logout rules as Telecaller apply — see Performance & Attendance.',
    ],
  },
  {
    key: Roles.MARKETING_DIRECTOR,
    role: 'Marketing Director',
    tagline: 'Owns lead generation strategy and property content quality.',
    icon: Megaphone,
    responsibilities: [
      'Creates, assigns, and bulk-uploads leads; configures reporting targets for the marketing/lead-gen team.',
      'Polishes property listings (DM Polish step) and participates in the MD-approval step.',
      'Converts leads into customers directly when marketing-sourced leads convert without a telecaller in between.',
      'Reviews team performance and reports across the marketing function.',
    ],
  },
  {
    key: Roles.DIGITAL_LEAD_OPERATOR,
    role: 'Digital Lead Operator',
    tagline: 'Manages inbound digital leads and the booking form pipeline.',
    icon: Radio,
    responsibilities: [
      'Creates, assigns, and bulk-uploads leads sourced from digital channels; monitors the lead distribution dashboard.',
      'Verifies site visits and creates bookings via the booking form pipeline.',
      'Converts leads to customers and manages customer records for digitally-sourced leads.',
    ],
  },
  {
    key: Roles.DIGITAL_MARKETING_HEAD,
    role: 'Digital Marketing Head',
    tagline: 'Leads the digital marketing team and content polish process.',
    icon: MegaphoneHead,
    responsibilities: [
      'Polishes property listings for digital/marketing readiness (DM Polish).',
      'Sets targets for and reviews performance of the Digital Marketing Executive team.',
    ],
  },
  {
    key: Roles.DIGITAL_MARKETING_EXECUTIVE,
    role: 'Digital Marketing Executive',
    tagline: 'Executes day-to-day property content and lead follow-up.',
    icon: Share2,
    responsibilities: [
      'Polishes properties assigned to you for DM Polish and keeps lead records updated.',
      'Submits your own daily report and completes assigned tasks.',
    ],
  },
  {
    key: Roles.HR_MANAGER,
    role: 'HR Manager',
    tagline: 'Manages the workforce — hiring, attendance approvals, and records.',
    icon: Users2,
    responsibilities: [
      'Creates and updates employee records, resets passwords, and views sensitive employee fields (salary, documents).',
      'Reviews attendance proposals (late-arrival / leave requests) and monitors live attendance.',
      'Assigns and tracks Tasks across teams, and reviews team-wide reports and performance.',
      'Manages KYC documentation for customers where required.',
    ],
  },
  {
    key: Roles.FINANCE,
    role: 'Finance / Accountant',
    tagline: 'Owns payments, expense approvals, and booking financials.',
    icon: Wallet,
    responsibilities: [
      'Reviews and processes Payments against bookings, and updates or cancels them when needed.',
      'Reviews Expenses submitted by staff, marks reimbursed expenses as refunded.',
      'Verifies KYC documents and manages document records tied to bookings.',
      'Sees sensitive employee fields where authorized, for payroll-adjacent work.',
    ],
  },
  {
    key: Roles.CHANNEL_PARTNER_MANAGER,
    role: 'Channel Partner Manager',
    tagline: 'Manages relationships with external referral/channel partners.',
    icon: Network,
    responsibilities: [
      'Creates and updates leads sourced through channel partners.',
      'Creates and completes site visits for channel-partner-referred customers.',
      'Reports on your own activity and submits your own daily report.',
    ],
  },
  {
    key: Roles.STAFF,
    role: 'Staff',
    tagline: 'General operational role for day-to-day workspace tasks.',
    icon: Briefcase,
    responsibilities: [
      'Manages your own Tasks and tracks upcoming Site Visits from your workspace dashboard.',
      'Same daily-report and midnight-logout rules as other field roles apply — see Performance & Attendance.',
      'Scans in for attendance and can raise a late-arrival or leave proposal if something comes up.',
    ],
  },
];

interface RuleEntry {
  category: string;
  rule: string;
}

const OPERATING_RULES: RuleEntry[] = [
  {
    category: 'Attendance',
    rule: 'Check in by 10:30 AM for full credit. 10:31–11:30 AM is Late. 11:31 AM–1:59 PM is Half Day. From 2:00 PM onward, check-in still works but no longer counts as attendance for that day (Absent) — it exists for the record, not to earn credit.',
  },
  {
    category: 'Attendance',
    rule: 'Staying logged in past midnight without logging out triggers an automatic system checkout and costs 1 performance point. Logging out yourself before midnight avoids this entirely.',
  },
  {
    category: 'Attendance',
    rule: 'Not submitting a daily report on a day you were logged in costs 1 performance point — this applies to Part-Time staff too, not just Full-Time.',
  },
  {
    category: 'Performance',
    rule: 'Everyone starts each scoring period at a base of 50 points. Completed tasks, daily reports, attendance, and bookings add to it; lateness, overdue tasks, and missed reports subtract from it.',
  },
  {
    category: 'Performance',
    rule: 'A task you assigned to yourself does not count toward your score when completed — only tasks a manager assigned to you do. This keeps the score reflecting real delegated work, not self-credit.',
  },
  {
    category: 'Performance',
    rule: 'Clearing every task on your plate AND submitting your daily report on the same day earns a bonus point — a concrete reward for actually finishing your work, not just showing up.',
  },
  {
    category: 'Permissions',
    rule: "What you can do is driven by your role first. If you personally need one extra permission your role doesn't normally have, an MD or Admin can grant it to you individually without changing your whole role — ask your manager to request it.",
  },
  {
    category: 'Permissions',
    rule: 'Granting a permission takes effect within moments. Revoking one signs you out and requires logging back in — this is intentional, so an access change is never left half-applied.',
  },
  {
    category: 'Site Visits & Demos',
    rule: "New requests are blind — you see the property and location, but not the customer's name or phone number, until you accept. This prevents cherry-picking by customer profile.",
  },
  {
    category: 'Site Visits & Demos',
    rule: 'A visit with no PM acceptance inside 10 hours of its scheduled time escalates to the MD; inside 12 hours it also flags to Marketing. Accept or route visits promptly to avoid this.',
  },
];

const RoleCard: React.FC<{ entry: RoleEntry }> = ({ entry }) => {
  const Icon = entry.icon;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-navy-50 dark:bg-navy-900/40 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-navy-600 dark:text-navy-300" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-tight">
            {entry.role}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{entry.tagline}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {entry.responsibilities.map((r, i) => (
          <li
            key={i}
            className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed flex gap-2"
          >
            <span className="text-navy-400 shrink-0">•</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const RolesResponsibilitiesPage: React.FC = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');

  // Previously showed every role's full description to every employee.
  // Scoped to the signed-in employee's own role(s) instead -- an employee
  // can hold more than one role, so this is `some role I hold`, not just
  // the currently active one. Search stays scoped to this set too, since
  // the point is "what am I responsible for", not a company-wide directory.
  const myRoles = useMemo(() => {
    const roleKeys = new Set(user?.roles || []);
    return ROLES.filter((r) => roleKeys.has(r.key));
  }, [user?.roles]);

  const filteredRoles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return myRoles;
    return myRoles.filter(
      (r) =>
        r.role.toLowerCase().includes(q) ||
        r.tagline.toLowerCase().includes(q) ||
        r.responsibilities.some((resp) => resp.toLowerCase().includes(q)),
    );
  }, [query, myRoles]);

  const filteredRules = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return OPERATING_RULES;
    return OPERATING_RULES.filter(
      (r) => r.rule.toLowerCase().includes(q) || r.category.toLowerCase().includes(q),
    );
  }, [query]);

  const groupedRules = useMemo(() => {
    const map = new Map<string, RuleEntry[]>();
    for (const entry of filteredRules) {
      if (!map.has(entry.category)) map.set(entry.category, []);
      map.get(entry.category)!.push(entry);
    }
    return Array.from(map.entries());
  }, [filteredRules]);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-navy-600 dark:text-navy-300" />
          Roles &amp; Responsibilities
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          What your role is actually responsible for, and the operating rules that apply to
          everyone.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roles or rules…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-300"
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-1">
          {myRoles.length > 1 ? 'Your Roles' : 'Your Role'}
        </h2>
        {myRoles.length === 0 ? (
          <p className="text-sm text-slate-400 px-1 py-8 text-center">
            We don't have a responsibilities entry for your role yet — ask your manager if you think
            this is wrong.
          </p>
        ) : filteredRoles.length === 0 ? (
          <p className="text-sm text-slate-400 px-1 py-8 text-center">
            No roles match your search.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRoles.map((entry) => (
              <RoleCard key={entry.role} entry={entry} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-1">
          Operating Rules — Apply To Everyone
        </h2>
        {groupedRules.length === 0 ? (
          <p className="text-sm text-slate-400 px-1 py-8 text-center">
            No rules match your search.
          </p>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
            {groupedRules.map(([category, rules]) => (
              <div key={category} className="p-5">
                <p className="text-xs font-bold text-navy-600 dark:text-navy-300 uppercase tracking-wide mb-2">
                  {category}
                </p>
                <ul className="space-y-2">
                  {rules.map((r, i) => (
                    <li
                      key={i}
                      className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed flex gap-2"
                    >
                      <span className="text-navy-400 shrink-0">•</span>
                      <span>{r.rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
