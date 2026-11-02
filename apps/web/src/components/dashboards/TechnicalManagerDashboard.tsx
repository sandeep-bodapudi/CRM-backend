import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

interface Overview {
  date: string;
  system: {
    version: string | null;
    uptime_minutes: number;
    open_sessions: number;
    job_failures: { title: string; message: string; created_at: string }[];
  };
  security: {
    sign_ins_today: number;
    failed_sign_ins_today: number;
    accounts_locked_today: number;
    permission_changes_today: number;
    password_resets_today: number;
    without_two_step: { id: number; name: string }[];
  };
  people: {
    active_staff: number;
    need_attendance: number;
    checked_in: number;
    late: number;
    checked_out: number;
    need_report: number;
    reports_sent: number;
  };
  business: {
    leads_today: number;
    unassigned_leads: number;
    calls_today: number;
    visits_today: number;
    visits_done_today: number;
    visits_waiting_acceptance: number;
    bookings_today: number;
    bookings_waiting_md: number;
    payments_pending: number;
    overdue_tasks: number;
    projects_in_review: number;
    open_complaints: number;
  };
  activity: { actions_today: number; recent: { at: string; who: string; label: string }[] };
  me: {
    checked_in_at: string | null;
    checked_out_at: string | null;
    report_sent_at: string | null;
  };
}

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : '';

/** One number with its label; amber when it needs someone's attention. */
const Tile: React.FC<{ label: string; value: number | string; to?: string; warn?: boolean }> = ({
  label,
  value,
  to,
  warn,
}) => {
  const body = (
    <div
      className={`rounded-xl border px-3 py-2.5 h-full ${warn ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}
    >
      <div className={`text-xl font-black ${warn ? 'text-amber-800' : 'text-navy-900'}`}>
        {value}
      </div>
      <div className="text-[11px] text-slate-500 leading-tight">{label}</div>
    </div>
  );
  return to ? (
    <Link to={to} className="block hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <section className="space-y-2">
    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
      {icon} {title}
    </h2>
    {children}
  </section>
);

const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">{children}</div>
);

/**
 * The Technical Manager's dashboard (2026-11-02): system, security, people and
 * today's business on one screen, plus a live feed of what everyone is doing.
 * Refreshes every minute.
 */
export const TechnicalManagerDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = useQuery<Overview>({
    queryKey: ['tech-overview'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/admin/tech-overview`);
      if (!res.ok) throw new Error('Could not load the overview');
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading) return <p className="text-sm text-slate-500 p-4">Loading the overview…</p>;
  if (isError || !data) {
    return (
      <div className="p-4 text-sm text-red-600">
        Could not load the overview.{' '}
        <button onClick={() => refetch()} className="underline font-semibold">
          Try again
        </button>
      </div>
    );
  }

  const { system, security, people, business, activity, me } = data;
  const notIn = Math.max(people.need_attendance - people.checked_in, 0);
  const noReport = Math.max(people.need_report - people.reports_sent, 0);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy-900">Technical Manager</h1>
          <p className="text-xs text-slate-500">
            {user?.fullName} · everything in the CRM today, updated every minute
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-navy-700"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Their own day: they mark attendance and report like everyone else. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
        <span
          className={me.checked_in_at ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}
        >
          {me.checked_in_at
            ? `You checked in at ${time(me.checked_in_at)}${me.checked_out_at ? `, out at ${time(me.checked_out_at)}` : ''}`
            : 'You have not checked in today'}
        </span>
        <Link
          to="/daily-report"
          className={
            me.report_sent_at ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold underline'
          }
        >
          {me.report_sent_at
            ? `Daily report sent at ${time(me.report_sent_at)}`
            : 'Daily report not sent yet'}
        </Link>
      </div>

      <Section title="System" icon={<ServerCog className="w-4 h-4" />}>
        <Grid>
          <Tile label="Live version" value={system.version || 'local'} />
          <Tile label="Minutes since the server started" value={system.uptime_minutes} />
          <Tile label="People signed in (open sessions)" value={system.open_sessions} />
          <Tile
            label="Background jobs that failed today"
            value={system.job_failures.length}
            warn={system.job_failures.length > 0}
          />
        </Grid>
        {system.job_failures.length > 0 && (
          <ul className="space-y-1">
            {system.job_failures.map((j, i) => (
              <li
                key={i}
                className="text-[11px] bg-amber-50 text-amber-900 rounded-lg px-2 py-1.5 flex gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <b>{j.title}</b> ({time(j.created_at)}): {j.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Security today" icon={<ShieldCheck className="w-4 h-4" />}>
        <Grid>
          <Tile label="Sign-ins" value={security.sign_ins_today} />
          <Tile
            label="Wrong passwords or unknown IDs"
            value={security.failed_sign_ins_today}
            warn={security.failed_sign_ins_today >= 5}
          />
          <Tile
            label="Accounts locked"
            value={security.accounts_locked_today}
            warn={security.accounts_locked_today > 0}
          />
          <Tile
            label="Permission changes"
            value={security.permission_changes_today}
            to="/access-control"
            warn={security.permission_changes_today > 0}
          />
          <Tile label="Passwords reset" value={security.password_resets_today} />
          <Tile
            label="Need 2-step login and haven't set it up"
            value={security.without_two_step.length}
            warn={security.without_two_step.length > 0}
          />
        </Grid>
        {security.without_two_step.length > 0 && (
          <p className="text-[11px] text-slate-500">
            Not set up yet: {security.without_two_step.map((e) => e.name).join(', ')}
          </p>
        )}
      </Section>

      <Section title="People today" icon={<Users className="w-4 h-4" />}>
        <Grid>
          <Tile label="Active staff" value={people.active_staff} />
          <Tile label="Checked in" value={people.checked_in} to="/hr-attendance" />
          <Tile
            label="Expected but not checked in"
            value={notIn}
            to="/team-today"
            warn={notIn > 0}
          />
          <Tile label="Late" value={people.late} warn={people.late > 0} />
          <Tile label="Daily reports sent" value={people.reports_sent} to="/hr-daily-reports" />
          <Tile label="Reports still to come" value={noReport} to="/hr-daily-reports" />
        </Grid>
      </Section>

      <Section title="Business today" icon={<Briefcase className="w-4 h-4" />}>
        <Grid>
          <Tile label="New leads" value={business.leads_today} to="/leads" />
          <Tile
            label="Open leads with nobody assigned"
            value={business.unassigned_leads}
            to="/leads"
            warn={business.unassigned_leads > 0}
          />
          <Tile label="Calls logged" value={business.calls_today} />
          <Tile label="Site visits today" value={business.visits_today} to="/site-visits" />
          <Tile label="Site visits done" value={business.visits_done_today} to="/site-visits" />
          <Tile
            label="Visits waiting for a PM to accept"
            value={business.visits_waiting_acceptance}
            to="/site-visits"
            warn={business.visits_waiting_acceptance > 0}
          />
          <Tile label="Bookings today" value={business.bookings_today} to="/bookings" />
          <Tile
            label="Bookings waiting for the MD"
            value={business.bookings_waiting_md}
            to="/approvals-inbox"
            warn={business.bookings_waiting_md > 0}
          />
          <Tile label="Payments pending" value={business.payments_pending} to="/finance" />
          <Tile
            label="Overdue tasks"
            value={business.overdue_tasks}
            to="/tasks"
            warn={business.overdue_tasks > 0}
          />
          <Tile label="Projects in review" value={business.projects_in_review} to="/projects" />
          <Tile
            label="Open complaints"
            value={business.open_complaints}
            to="/complaints"
            warn={business.open_complaints > 0}
          />
        </Grid>
      </Section>

      <Section title="What everyone is doing" icon={<Activity className="w-4 h-4" />}>
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 text-xs">
            <span className="font-bold text-slate-700">
              {activity.actions_today} change{activity.actions_today === 1 ? '' : 's'} made in the
              CRM today
            </span>
            <Link to="/team-today" className="text-navy-700 font-semibold flex items-center gap-1">
              <ClipboardList className="w-3.5 h-3.5" /> Each person's day
            </Link>
          </div>
          {activity.recent.length === 0 ? (
            <p className="text-xs text-slate-400 px-3 py-3 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Nothing yet today.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {activity.recent.map((a, i) => (
                <li key={i} className="px-3 py-1.5 text-xs flex gap-2">
                  <span className="text-slate-400 w-14 shrink-0">{time(a.at)}</span>
                  <span className="font-semibold text-slate-800 shrink-0 max-w-[35%] truncate">
                    {a.who}
                  </span>
                  <span className="text-slate-600 min-w-0">{a.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
};
