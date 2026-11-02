import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  KeyRound,
  Lock,
  MapPin,
  MessageSquareWarning,
  PhoneCall,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  Users,
  Wallet,
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
  activity: {
    actions_today: number;
    recent: { at: string; who: string; label: string; url: string | null }[];
    by_hour: { hour: number; actions: number }[];
    top_people: { id: number; name: string; actions: number }[];
  };
  trend: { date: string; leads: number; calls: number; visits: number; bookings: number }[];
  me: {
    checked_in_at: string | null;
    checked_out_at: string | null;
    report_sent_at: string | null;
  };
}

const C = {
  navy: '#203873',
  gold: '#C9A227',
  blue: '#4268E8',
  green: '#10B981',
  amber: '#F59E0B',
  slate: '#CBD5E1',
};

const TOOLTIP = {
  borderRadius: 12,
  border: 'none',
  boxShadow: '0 8px 24px rgba(15,23,42,.12)',
  fontSize: 12,
};
const AXIS = { fontSize: 10, fill: '#64748B' };

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : '';
const shortDay = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

/** Where a recorded change lives in the app ("/projects/5/units/9" -> project 5). */
const pageFor = (url: string | null): string => {
  if (!url) return '/team-today';
  const [, first, id] = url.split('/');
  const withId = (base: string) => (id && /^\d+$/.test(id) ? `${base}/${id}` : base);
  switch (first) {
    case 'leads':
      return withId('/leads');
    case 'projects':
      return withId('/projects');
    case 'bookings':
      return withId('/bookings');
    case 'site-visits':
      return '/site-visits';
    case 'tasks':
      return '/tasks?tab=team_tasks';
    case 'complaints':
      return '/complaints';
    case 'employees':
      return '/hr-hub';
    case 'attendance':
      return '/hr-attendance';
    case 'payments':
    case 'installments':
    case 'expense-refunds':
      return '/finance';
    case 'properties':
      return '/properties';
    case 'customers':
      return '/customers';
    case 'demos':
      return '/demos';
    case 'reports':
      return '/hr-daily-reports';
    case 'admin':
    case 'roles':
      return '/access-control';
    default:
      return '/team-today';
  }
};

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '',
  children,
}) => (
  <div
    className={`bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${className}`}
  >
    {children}
  </div>
);

const SectionTitle: React.FC<{
  id: string;
  icon: React.ReactNode;
  title: string;
  hint?: string;
  to?: string;
}> = ({ id, icon, title, hint, to }) => (
  <div id={id} className="scroll-mt-20 flex items-end justify-between gap-3 mb-2.5">
    <div>
      <h2 className="text-sm font-extrabold text-navy-900 flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-navy-50 text-navy-700 flex items-center justify-center">
          {icon}
        </span>
        {title}
      </h2>
      {hint && <p className="text-[11px] text-slate-500 mt-0.5 ml-9">{hint}</p>}
    </div>
    {to && (
      <Link
        to={to}
        className="text-[11px] font-bold text-navy-700 hover:text-navy-900 flex items-center gap-0.5 shrink-0"
      >
        Open <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    )}
  </div>
);

/** A headline number with a 7-day sparkline; the whole card opens the list. */
const KpiCard: React.FC<{
  id: string;
  label: string;
  value: number;
  to: string;
  icon: React.ReactNode;
  color: string;
  series: number[];
}> = ({ id, label, value, to, icon, color, series }) => (
  <Link to={to} className="group block">
    <Card className="p-3.5 h-full transition group-hover:shadow-md group-hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
          style={{ background: color }}
        >
          {icon}
        </span>
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-navy-700" />
      </div>
      <div className="mt-2.5 text-2xl font-black text-navy-900 tabular-nums">{value}</div>
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="h-8 mt-1 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series.map((v, i) => ({ i, v }))}>
            <defs>
              <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill={`url(#spark-${id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  </Link>
);

/** A small linked number. */
const Stat: React.FC<{
  label: string;
  value: number | string;
  to?: string;
  tone?: 'warn' | 'bad' | 'good';
}> = ({ label, value, to, tone }) => {
  const toneCls =
    tone === 'bad'
      ? 'text-rose-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : tone === 'good'
          ? 'text-emerald-600'
          : 'text-navy-900';
  const body = (
    <div className="rounded-xl bg-slate-50/80 hover:bg-navy-50 transition px-3 py-2.5 h-full">
      <div className={`text-lg font-black tabular-nums ${toneCls}`}>{value}</div>
      <div className="text-[11px] text-slate-500 leading-tight">{label}</div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

/** A donut ring of parts (plain SVG, so it is always centred and crisp). */
const Ring: React.FC<{ parts: { name: string; value: number; color: string }[] }> = ({ parts }) => {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const r = 52;
  const len = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
      <circle cx="64" cy="64" r={r} fill="none" stroke="#EEF2F7" strokeWidth="16" />
      {total > 0 &&
        parts.map((p) => {
          const dash = (p.value / total) * len;
          const el = (
            <circle
              key={p.name}
              cx="64"
              cy="64"
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth="16"
              strokeDasharray={`${dash} ${len - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
    </svg>
  );
};

const TABS = [
  ['attention', 'Needs attention'],
  ['today', 'Today'],
  ['trends', 'Trends'],
  ['people', 'People'],
  ['activity', 'Activity'],
  ['security', 'Security'],
  ['system', 'System'],
] as const;

type Alert = {
  n: number;
  text: [one: string, many: string];
  to: string;
  icon: React.ReactNode;
  bad?: boolean;
};

/**
 * The Technical Manager's dashboard (2026-11-02), most urgent first: what
 * needs someone now, today's business, the week's trend, people, live
 * activity, then security and the system. Every number opens its list.
 * Refreshes every minute.
 */
export const TechnicalManagerDashboard: React.FC = () => {
  const { user, fetchWithAuth } = useAuth();
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery<Overview>({
    queryKey: ['tech-overview'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE_URL}/admin/tech-overview`);
      if (!res.ok) throw new Error('Could not load the overview');
      return res.json();
    },
    refetchInterval: 60_000,
  });

  // Everything that needs someone's action, most serious first; only those above zero.
  const attention = useMemo<Alert[]>(() => {
    if (!data) return [];
    const { system, security, people, business } = data;
    const all: Alert[] = [
      {
        n: system.job_failures.length,
        text: ['background job failed today', 'background jobs failed today'],
        to: '#system',
        icon: <ServerCog className="w-4 h-4" />,
        bad: true,
      },
      {
        n: security.accounts_locked_today,
        text: ['account locked after wrong passwords', 'accounts locked after wrong passwords'],
        to: '#security',
        icon: <Lock className="w-4 h-4" />,
        bad: true,
      },
      {
        n: business.bookings_waiting_md,
        text: ['booking waiting for the MD', 'bookings waiting for the MD'],
        to: '/approvals-inbox',
        icon: <ClipboardCheck className="w-4 h-4" />,
        bad: true,
      },
      {
        n: business.unassigned_leads,
        text: ['open lead with nobody assigned', 'open leads with nobody assigned'],
        to: '/leads?status=NEW',
        icon: <UserPlus className="w-4 h-4" />,
      },
      {
        n: business.visits_waiting_acceptance,
        text: ['site visit waiting for a PM to accept', 'site visits waiting for a PM to accept'],
        to: '/site-visits',
        icon: <MapPin className="w-4 h-4" />,
      },
      {
        n: business.overdue_tasks,
        text: ['overdue task', 'overdue tasks'],
        to: '/tasks?tab=team_tasks&status=OVERDUE',
        icon: <Clock className="w-4 h-4" />,
      },
      {
        n: business.open_complaints,
        text: ['open complaint', 'open complaints'],
        to: '/complaints?status=OPEN',
        icon: <MessageSquareWarning className="w-4 h-4" />,
      },
      {
        n: business.projects_in_review,
        text: ['project waiting for review', 'projects waiting for review'],
        to: '/projects',
        icon: <Building2 className="w-4 h-4" />,
      },
      {
        n: business.payments_pending,
        text: ['payment pending', 'payments pending'],
        to: '/finance',
        icon: <Wallet className="w-4 h-4" />,
      },
      {
        n: Math.max(people.need_attendance - people.checked_in, 0),
        text: [
          'person expected today but not checked in',
          'people expected today but not checked in',
        ],
        to: '/team-today',
        icon: <Users className="w-4 h-4" />,
      },
      {
        n: security.without_two_step.length,
        text: [
          'person who must use 2-step login but has not set it up',
          'people who must use 2-step login but have not set it up',
        ],
        to: '#security',
        icon: <KeyRound className="w-4 h-4" />,
      },
    ];
    return all.filter((a) => a.n > 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-32 rounded-3xl bg-slate-200" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Card className="p-5 text-sm text-rose-700 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> Could not load the overview.
        <button onClick={() => refetch()} className="underline font-bold">
          Try again
        </button>
      </Card>
    );
  }

  const { system, security, people, business, me } = data;
  // An API one release older sends no chart data; show empty charts, never crash.
  const trend = data.trend || [];
  const activity = {
    ...data.activity,
    recent: data.activity?.recent || [],
    by_hour: data.activity?.by_hour || [],
    top_people: data.activity?.top_people || [],
  };
  const series = (k: 'leads' | 'calls' | 'visits' | 'bookings') => trend.map((d) => d[k]);
  const onTime = Math.max(people.checked_in - people.late, 0);
  const notIn = Math.max(people.need_attendance - people.checked_in, 0);
  const attendancePie = [
    { name: 'On time', value: onTime, color: C.green },
    { name: 'Late', value: people.late, color: C.amber },
    { name: 'Not in yet', value: notIn, color: C.slate },
  ].filter((d) => d.value > 0);
  const reportPct = people.need_report
    ? Math.round((people.reports_sent / people.need_report) * 100)
    : 0;
  // Working hours, widened to any hour that had activity (late-night fixes too).
  const busy = activity.by_hour.filter((h) => h.actions > 0).map((h) => h.hour);
  const firstHour = Math.min(7, ...busy);
  const lastHour = Math.max(22, ...busy);
  const hours = activity.by_hour.filter((h) => h.hour >= firstHour && h.hour <= lastHour);
  const trendData = trend.map((d) => ({ ...d, day: shortDay(d.date) }));
  const maxTop = Math.max(...activity.top_people.map((p) => p.actions), 1);
  const pill = (ok: boolean) =>
    ok ? 'bg-emerald-400/20 text-emerald-100' : 'bg-amber-400/25 text-amber-100';

  return (
    <div className="space-y-6 pb-8">
      {/* Header: who, when, and their own day */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 text-white p-5 sm:p-6">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-gold-600/20 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold-300 font-bold">
              Technical Manager
            </p>
            <h1 className="text-2xl font-black mt-1">
              Hello, {user?.fullName?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-xs text-navy-200 mt-1">
              {activity.actions_today} change{activity.actions_today === 1 ? '' : 's'} in the CRM
              today · updated {time(new Date(dataUpdatedAt).toISOString())}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2 text-[11px] font-bold">
          <Link
            to="/my-attendance"
            className={`rounded-full px-3 py-1.5 flex items-center gap-1.5 ${pill(!!me.checked_in_at)}`}
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            {me.checked_in_at
              ? `In ${time(me.checked_in_at)}${me.checked_out_at ? ` · out ${time(me.checked_out_at)}` : ''}`
              : 'Not checked in'}
          </Link>
          <Link
            to="/daily-report"
            className={`rounded-full px-3 py-1.5 flex items-center gap-1.5 ${pill(!!me.report_sent_at)}`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            {me.report_sent_at ? `Report sent ${time(me.report_sent_at)}` : 'Daily report due'}
          </Link>
          <button
            onClick={() => jumpTo('system')}
            className="rounded-full px-3 py-1.5 bg-white/10 text-navy-100 flex items-center gap-1.5"
          >
            <ServerCog className="w-3.5 h-3.5" /> {system.version || 'local'}
          </button>
        </div>
      </div>

      {/* Tabs, most important first; each jumps to its section. */}
      <nav className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-slate-50/95 backdrop-blur border-b border-slate-200/60">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => jumpTo(id)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:border-navy-300 hover:text-navy-800"
            >
              {label}
              {id === 'attention' && attention.length > 0 && (
                <span className="ml-1.5 rounded-full bg-rose-500 text-white px-1.5 text-[10px]">
                  {attention.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* 1. Needs attention */}
      <section>
        <SectionTitle
          id="attention"
          icon={<AlertTriangle className="w-4 h-4" />}
          title="Needs attention"
          hint="Waiting on someone right now, most serious first"
        />
        {attention.length === 0 ? (
          <Card className="p-4 text-sm text-emerald-700 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> All clear. Nothing is waiting.
          </Card>
        ) : (
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {attention.map((a) => {
              const row = (
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition text-left w-full">
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${a.bad ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}
                  >
                    {a.icon}
                  </span>
                  <span className="text-xl font-black tabular-nums text-navy-900 w-10">{a.n}</span>
                  <span className="text-sm text-slate-700 flex-1">
                    {a.n === 1 ? a.text[0] : a.text[1]}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              );
              return a.to.startsWith('#') ? (
                <button
                  key={a.text[1]}
                  onClick={() => jumpTo(a.to.slice(1))}
                  className="block w-full"
                >
                  {row}
                </button>
              ) : (
                <Link key={a.text[1]} to={a.to} className="block">
                  {row}
                </Link>
              );
            })}
          </Card>
        )}
      </section>

      {/* 2. Today's business */}
      <section>
        <SectionTitle
          id="today"
          icon={<BarChart3 className="w-4 h-4" />}
          title="Today"
          hint="The small lines show the last 7 days"
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            id="leads"
            label="New leads"
            value={business.leads_today}
            to="/leads"
            icon={<UserPlus className="w-4 h-4" />}
            color={C.navy}
            series={series('leads')}
          />
          <KpiCard
            id="calls"
            label="Calls logged"
            value={business.calls_today}
            to="/team-today"
            icon={<PhoneCall className="w-4 h-4" />}
            color={C.blue}
            series={series('calls')}
          />
          <KpiCard
            id="visits"
            label="Site visits done"
            value={business.visits_done_today}
            to="/site-visits"
            icon={<MapPin className="w-4 h-4" />}
            color={C.green}
            series={series('visits')}
          />
          <KpiCard
            id="bookings"
            label="Bookings"
            value={business.bookings_today}
            to="/bookings"
            icon={<ClipboardCheck className="w-4 h-4" />}
            color={C.gold}
            series={series('bookings')}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <Stat label="Site visits planned today" value={business.visits_today} to="/site-visits" />
          <Stat label="Payments pending" value={business.payments_pending} to="/finance" />
          <Stat label="Projects in review" value={business.projects_in_review} to="/projects" />
          <Stat
            label="Open complaints"
            value={business.open_complaints}
            to="/complaints?status=OPEN"
            tone={business.open_complaints ? 'warn' : undefined}
          />
        </div>
      </section>

      {/* 3. Trends */}
      <section>
        <SectionTitle
          id="trends"
          icon={<Activity className="w-4 h-4" />}
          title="Last 7 days"
          hint="Leads, visits and bookings per day; calls on the right-hand scale"
        />
        <Card className="p-3 sm:p-4">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="trend-calls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.blue} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="trend-leads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.navy} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={C.navy} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF2F7" />
                <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="l"
                  allowDecimals={false}
                  tick={AXIS}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="r"
                  orientation="right"
                  allowDecimals={false}
                  tick={AXIS}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={TOOLTIP} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Area
                  yAxisId="r"
                  type="monotone"
                  dataKey="calls"
                  name="Calls"
                  stroke={C.blue}
                  strokeWidth={2}
                  fill="url(#trend-calls)"
                />
                <Area
                  yAxisId="l"
                  type="monotone"
                  dataKey="leads"
                  name="Leads"
                  stroke={C.navy}
                  strokeWidth={2}
                  fill="url(#trend-leads)"
                />
                <Area
                  yAxisId="l"
                  type="monotone"
                  dataKey="visits"
                  name="Visits done"
                  stroke={C.green}
                  strokeWidth={2}
                  fillOpacity={0}
                />
                <Area
                  yAxisId="l"
                  type="monotone"
                  dataKey="bookings"
                  name="Bookings"
                  stroke={C.gold}
                  strokeWidth={2}
                  fillOpacity={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {/* 4. People */}
      <section>
        <SectionTitle
          id="people"
          icon={<Users className="w-4 h-4" />}
          title="People today"
          hint={`${people.active_staff} active staff`}
          to="/team-today"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link to="/hr-attendance" className="block group">
            <Card className="p-4 h-full group-hover:shadow-md transition">
              <div className="text-xs font-bold text-slate-600 mb-1">Attendance</div>
              <div className="flex items-center gap-4">
                <div className="relative w-32 h-32 shrink-0">
                  <Ring parts={attendancePie} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black text-navy-900">{people.checked_in}</span>
                    <span className="text-[10px] text-slate-500">of {people.need_attendance}</span>
                  </div>
                </div>
                <ul className="text-xs space-y-1.5">
                  {(
                    [
                      ['On time', onTime, C.green],
                      ['Late', people.late, C.amber],
                      ['Not in yet', notIn, C.slate],
                      ['Checked out', people.checked_out, C.navy],
                    ] as const
                  ).map(([l, v, c]) => (
                    <li key={l} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                      <span className="text-slate-600 w-20">{l}</span>
                      <b className="text-navy-900 tabular-nums">{v}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </Link>
          <Link to="/hr-daily-reports" className="block group">
            <Card className="p-4 h-full group-hover:shadow-md transition">
              <div className="text-xs font-bold text-slate-600">Daily reports</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-navy-900 tabular-nums">
                  {people.reports_sent}
                </span>
                <span className="text-sm text-slate-500">of {people.need_report} sent</span>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-navy-700 to-gold-600 transition-all"
                  style={{ width: `${reportPct}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {Math.max(people.need_report - people.reports_sent, 0)} still to come · {reportPct}%
                done
              </p>
            </Card>
          </Link>
        </div>
      </section>

      {/* 5. Activity */}
      <section>
        <SectionTitle
          id="activity"
          icon={<Activity className="w-4 h-4" />}
          title="What everyone is doing"
          hint="Every change made in the CRM today"
          to="/team-today"
        />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <Card className="p-4 lg:col-span-3">
            <div className="text-xs font-bold text-slate-600 mb-2">Changes per hour</div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hours} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF2F7" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={hourLabel}
                    tick={AXIS}
                    axisLine={false}
                    tickLine={false}
                    interval={1}
                  />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip
                    labelFormatter={(h) => `${hourLabel(Number(h))}m`}
                    formatter={(v) => [v, 'Changes']}
                    contentStyle={TOOLTIP}
                  />
                  <Bar dataKey="actions" fill={C.navy} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-4 lg:col-span-2">
            <div className="text-xs font-bold text-slate-600 mb-2">Most active today</div>
            {activity.top_people.length === 0 ? (
              <p className="text-xs text-slate-400">Nobody has changed anything yet.</p>
            ) : (
              <ul className="space-y-2">
                {activity.top_people.map((p) => (
                  <li key={p.id}>
                    <Link to="/team-today" className="block group">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-700 group-hover:text-navy-800 truncate">
                          {p.name}
                        </span>
                        <span className="font-bold text-navy-900 tabular-nums">{p.actions}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-navy-700 group-hover:bg-gold-600 transition-colors"
                          style={{ width: `${(p.actions / maxTop) * 100}%` }}
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="lg:col-span-5 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 text-xs font-bold text-slate-600 flex justify-between">
              <span>Live feed</span>
              <span className="text-slate-400 font-medium">tap a line to open it</span>
            </div>
            {activity.recent.length === 0 ? (
              <p className="text-xs text-slate-400 px-4 py-4">Nothing yet today.</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                {activity.recent.map((a, i) => (
                  <li key={i}>
                    <Link
                      to={pageFor(a.url)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition"
                    >
                      <span className="w-8 h-8 rounded-full bg-navy-50 text-navy-700 text-[11px] font-black flex items-center justify-center shrink-0">
                        {initials(a.who)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-slate-800 truncate">
                          <b>{a.who}</b> · {a.label}
                        </span>
                        <span className="block text-[10px] text-slate-400">{time(a.at)}</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {/* 6. Security */}
      <section>
        <SectionTitle
          id="security"
          icon={<ShieldCheck className="w-4 h-4" />}
          title="Security today"
          to="/access-control"
        />
        <Card className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <Stat label="Sign-ins" value={security.sign_ins_today} />
            <Stat
              label="Wrong passwords or unknown IDs"
              value={security.failed_sign_ins_today}
              tone={security.failed_sign_ins_today >= 5 ? 'bad' : undefined}
            />
            <Stat
              label="Accounts locked"
              value={security.accounts_locked_today}
              tone={security.accounts_locked_today ? 'bad' : undefined}
            />
            <Stat
              label="Permission changes"
              value={security.permission_changes_today}
              to="/access-control"
              tone={security.permission_changes_today ? 'warn' : undefined}
            />
            <Stat label="Passwords reset" value={security.password_resets_today} to="/hr-hub" />
          </div>
          {security.without_two_step.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" /> 2-step login not set up yet (
                {security.without_two_step.length})
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {security.without_two_step.map((e) => (
                  <Link
                    key={e.id}
                    to="/hr-hub"
                    className="text-[11px] font-semibold rounded-full bg-white border border-amber-200 text-amber-900 px-2.5 py-1 hover:bg-amber-100"
                  >
                    {e.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* 7. System */}
      <section>
        <SectionTitle
          id="system"
          icon={<ServerCog className="w-4 h-4" />}
          title="System"
          to="/system-control"
        />
        <Card className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Live version" value={system.version || 'local'} />
            <Stat label="Minutes since the server started" value={system.uptime_minutes} />
            <Stat label="Devices signed in" value={system.open_sessions} />
            <Stat
              label="Jobs failed today"
              value={system.job_failures.length}
              tone={system.job_failures.length ? 'bad' : 'good'}
            />
          </div>
          {system.job_failures.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {system.job_failures.map((j, i) => (
                <li
                  key={i}
                  className="text-[11px] bg-rose-50 text-rose-900 rounded-xl px-3 py-2 flex gap-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    <b>{j.title}</b> · {time(j.created_at)}
                    <span className="block text-rose-800/80">{j.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
};
