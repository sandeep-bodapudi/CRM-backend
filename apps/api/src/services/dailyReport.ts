import { prisma } from '../lib/prisma';
import { Roles } from '../shared';
import { getISTComponents } from '../utils/time';
import { WORK_LOG_ACTION, parseWorkLog, countByKind, WorkLogEntry } from '../routes/workLog';
import { splitCalls } from './lead/calls';
import { measureMetric } from './targets.service';

// The end-of-day report. Everything the CRM records is filled in by the
// server ("recorded"); the person may type their own count beside it, plus
// the few things the CRM cannot know and the day's summary. Targets are
// always judged on the recorded numbers.

const p = prisma;
const DAY_MS = 24 * 60 * 60 * 1000;

/** [start, end) of an IST calendar day as real instants (today by default). */
export function istDayRange(now = new Date()) {
  const { dateString } = getISTComponents(now);
  const start = new Date(`${dateString}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + DAY_MS), dateString };
}

/**
 * What the CRM recorded for this person today: logged calls (plus calls to
 * associates from the Work Log), leads worked, and the Work Log by kind.
 */
export async function verifiedActivityToday(employeeId: number) {
  const { start, end } = istDayRange();
  const [loggedCalls, leadsWorked, workLogRows, split] = await Promise.all([
    p.leadActivity.count({
      where: {
        actor_id: employeeId,
        activity_type: 'CALL_LOGGED',
        created_at: { gte: start, lt: end },
      },
    }),
    p.leadActivity.findMany({
      where: {
        actor_id: employeeId,
        activity_type: { notIn: ['LEAD_CREATED', 'ASSIGNED_TO_AGENT'] },
        created_at: { gte: start, lt: end },
      },
      select: { lead_id: true },
      distinct: ['lead_id'],
    }),
    p.auditEvent.findMany({
      where: { actor_id: employeeId, action: WORK_LOG_ACTION, created_at: { gte: start, lt: end } },
      select: { id: true, new_value: true, created_at: true },
    }),
    splitCalls(employeeId, start, end),
  ]);
  const workLog = countByKind(workLogRows.map(parseWorkLog).filter((e): e is WorkLogEntry => !!e));
  // Calls to associates (Channel Partner Managers) are calls too.
  const calls = loggedCalls + (workLog.ASSOCIATE_CALL || 0) + (workLog.ASSOCIATE_NEW_CALL || 0);
  return { calls, ...split, leads_worked: leadsWorked.length, work_log: workLog };
}

type Verified = Awaited<ReturnType<typeof verifiedActivityToday>>;
interface Ctx {
  employeeId: number;
  companyId: number;
  start: Date;
  end: Date;
  v: Verified;
}

interface FieldDef {
  id: string;
  label: string;
  /** How the CRM counts it; absent = typed only. */
  recorded?: (c: Ctx) => Promise<number> | number;
  /** Typed-only fields: what kind of answer. */
  input?: 'COUNT' | 'MONEY' | 'TEXT';
  required?: boolean;
  hint?: string;
}

const day = (c: Ctx) => ({ gte: c.start, lt: c.end });
const workLogSum = (kinds: string[]) => (c: Ctx) =>
  kinds.reduce((n, k) => n + (c.v.work_log[k] || 0), 0);
const stageChanges = (to: string) => (c: Ctx) =>
  p.leadActivity.count({
    where: {
      actor_id: c.employeeId,
      activity_type: 'STATUS_CHANGED',
      notes: { contains: ` to ${to}` },
      created_at: day(c),
    },
  });

const F = {
  calls: { id: 'calls', label: 'Calls made', recorded: (c: Ctx) => c.v.calls },
  newCalls: {
    id: 'new_calls',
    label: 'First calls to new leads',
    recorded: (c: Ctx) => c.v.new_calls,
  },
  followUps: {
    id: 'follow_up_calls',
    label: 'Follow-up calls',
    recorded: (c: Ctx) => c.v.follow_up_calls,
  },
  qualified: {
    id: 'leads_qualified',
    label: 'Leads qualified',
    recorded: stageChanges('QUALIFIED'),
  },
  visitsBooked: {
    id: 'visits_booked',
    label: 'Site visits booked',
    recorded: (c: Ctx) => measureMetric(c.employeeId, 'VISITS_BOOKED', c.start, c.end),
  },
  visitsDone: {
    id: 'visits_done',
    label: 'Site visits done',
    recorded: (c: Ctx) => measureMetric(c.employeeId, 'VISITS_COMPLETED', c.start, c.end),
  },
  bookingsStarted: {
    id: 'bookings_started',
    label: 'Bookings started',
    recorded: stageChanges('BOOKING_INITIATED'),
  },
  propertiesVerified: {
    id: 'properties_verified',
    label: 'Properties verified',
    recorded: (c: Ctx) =>
      p.property.count({ where: { assigned_pm_id: c.employeeId, verified_by_pm_at: day(c) } }),
  },
  leadsAdded: {
    id: 'leads_added',
    label: 'Leads added',
    recorded: (c: Ctx) =>
      p.lead.count({ where: { created_by_id: c.employeeId, created_at: day(c) } }),
  },
  leadsAssigned: {
    id: 'leads_assigned',
    label: 'Leads assigned to telecallers',
    recorded: (c: Ctx) =>
      p.leadActivity.count({
        where: { actor_id: c.employeeId, activity_type: 'ASSIGNED_TO_AGENT', created_at: day(c) },
      }),
  },
  propertiesAdded: {
    id: 'properties_added',
    label: 'Properties added',
    recorded: (c: Ctx) =>
      p.property.count({ where: { created_by_id: c.employeeId, created_at: day(c) } }),
  },
  posts: {
    id: 'posts',
    label: 'Posts (Instagram / Facebook)',
    recorded: workLogSum(['INSTAGRAM_POST', 'FACEBOOK_POST']),
  },
  reels: {
    id: 'reels',
    label: 'Reels & videos',
    recorded: workLogSum(['INSTAGRAM_REEL', 'YOUTUBE_VIDEO']),
  },
  stories: { id: 'stories', label: 'Stories', recorded: workLogSum(['INSTAGRAM_STORY']) },
  ads: { id: 'ad_campaigns', label: 'Ad campaigns', recorded: workLogSum(['AD_CAMPAIGN']) },
  leadsFromAds: {
    id: 'leads_from_ads',
    label: 'Leads from ads today (whole company)',
    recorded: (c: Ctx) =>
      p.lead.count({
        where: {
          company_id: c.companyId,
          source: { in: ['FACEBOOK_ADS', 'GOOGLE_ADS'] },
          created_at: day(c),
        },
      }),
  },
  attendanceDecided: {
    id: 'attendance_decided',
    label: 'Attendance requests decided',
    recorded: (c: Ctx) =>
      p.attendanceProposal.count({ where: { reviewed_by: c.employeeId, reviewed_at: day(c) } }),
  },
  checkinsReviewed: {
    id: 'checkins_reviewed',
    label: 'Check-in photos reviewed',
    recorded: (c: Ctx) =>
      p.attendanceCheckinProof.count({ where: { reviewed_by: c.employeeId, reviewed_at: day(c) } }),
  },
  paymentsVerified: {
    id: 'payments_verified',
    label: 'Customer payments verified',
    recorded: (c: Ctx) =>
      p.auditEvent.count({
        where: { actor_id: c.employeeId, action: 'PAYMENT_VERIFIED', created_at: day(c) },
      }),
  },
  refundsSettled: {
    id: 'refunds_settled',
    label: 'Refunds settled',
    recorded: (c: Ctx) =>
      p.auditEvent.count({
        where: { actor_id: c.employeeId, action: 'PAYMENT_REFUNDED', created_at: day(c) },
      }),
  },
} satisfies Record<string, FieldDef>;

// Channel Partner Manager fields keep their ids (production reports use them).
const CPM_FIELDS: FieldDef[] = (
  [
    ['existingProspectsFollowup', 'Existing prospects followed up', ['ASSOCIATE_CALL']],
    ['newCalls', 'New calls (new associates)', ['ASSOCIATE_NEW_CALL']],
    ['totalCalls', 'Total calls made', ['ASSOCIATE_CALL', 'ASSOCIATE_NEW_CALL']],
    ['newProspects', 'New prospects', ['ASSOCIATE_PROSPECT']],
    ['associateOfficeVisits', "Associates' office visits", ['ASSOCIATE_OFFICE_VISIT']],
    ['enrollments', 'Enrollments', ['ASSOCIATE_ENROLLMENT']],
    ['associateSiteVisits', 'Associate site visits', ['ASSOCIATE_SITE_VISIT']],
    ['bookings', 'Bookings', ['ASSOCIATE_BOOKING']],
  ] as [string, string, string[]][]
).map(([id, label, kinds]) => ({ id, label, recorded: workLogSum(kinds) }));

const typed = (
  id: string,
  label: string,
  input: FieldDef['input'],
  required = false,
  hint?: string,
): FieldDef => ({ id, label, input, required, hint });

const SALES = [F.calls, F.visitsDone, F.bookingsStarted];
const DIGITAL = [
  F.posts,
  F.reels,
  F.stories,
  F.ads,
  F.leadsFromAds,
  typed('ad_spend', 'Ad spend today (₹)', 'MONEY', true, 'Enter 0 if nothing was spent.'),
];

/** The report's fields for each role (agreed with the user 2026-10-19). */
export const REPORT_FIELDS: Record<string, FieldDef[]> = {
  [Roles.TELECALLER]: [
    F.calls,
    F.newCalls,
    F.followUps,
    F.qualified,
    F.visitsBooked,
    typed('blockers', 'Anything blocking you?', 'TEXT'),
  ],
  [Roles.AGENT]: SALES,
  [Roles.SALES_MANAGER]: SALES,
  [Roles.PROJECT_MANAGER]: [
    F.visitsDone,
    F.propertiesVerified,
    typed('site_issues', 'Site issues', 'TEXT'),
  ],
  [Roles.DIGITAL_LEAD_OPERATOR]: [F.leadsAdded, F.leadsAssigned],
  [Roles.DIGITAL_MARKETING_HEAD]: DIGITAL,
  [Roles.DIGITAL_MARKETING_EXECUTIVE]: DIGITAL,
  [Roles.MARKETING_DIRECTOR]: DIGITAL,
  [Roles.CHANNEL_PARTNER_MANAGER]: CPM_FIELDS,
  [Roles.HR_MANAGER]: [
    F.attendanceDecided,
    F.checkinsReviewed,
    typed('interviews', 'Interviews held', 'COUNT', true, 'Enter 0 if none.'),
  ],
  [Roles.FINANCE]: [F.paymentsVerified, F.refundsSettled],
  [Roles.DATA_ENTRY_OPERATOR]: [F.leadsAdded, F.propertiesAdded],
  [Roles.INVENTORY_EXECUTIVE]: [F.propertiesAdded],
};

/** Field id -> label, for showing stored reports. */
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(REPORT_FIELDS)
    .flat()
    .map((f) => [f.id, f.label]),
);

// Ids from the old Target Configurator presets: the fields above replace them,
// so an MD-configured form never shows them twice.
const OLD_PRESET_IDS = new Set([
  'callsMade',
  'newCalls',
  'followupsDone',
  'leadsQualified',
  'siteVisits',
  'propertyVerifications',
  'leadsProcessed',
  'telecallerAssignments',
  'adSpendMonitored',
  'contentPosts',
  'leadsGenerated',
  'interviewsConducted',
  'attendanceQueueCleared',
  'invoicesProcessed',
  'paymentAudits',
  'projectsUpdated',
  'propertiesUpdated',
  'unitsAdded',
  'leadsEntered',
  'leadsCorrected',
  'customersUpdated',
  'bookingsUpdated',
  'dailyTaskListCompleted',
  'endOfDayCleanup',
  'feedback',
]);

/** The role the report is for: the one asked for if they hold it, else their first. */
export function reportRole(roles: string[], requested?: string | null) {
  if (requested && roles.includes(requested)) return requested;
  return roles.find((r) => REPORT_FIELDS[r]) || roles[0] || '';
}

async function activeTarget(employeeId: number, companyId: number, roleName: string) {
  return p.dailyTarget.findFirst({
    where: {
      company_id: companyId,
      OR: [{ employee_id: employeeId }, { role_name: roleName, employee_id: null }],
    },
    orderBy: [{ employee_id: 'desc' }, { created_at: 'desc' }],
  });
}

/**
 * Judged on recorded numbers only: calls, visits (booked + done) and confirmed
 * bookings against the MD's daily target. A target of 0 is never judged.
 */
export async function judgeToday(employeeId: number, companyId: number, roleName: string) {
  const { start, end } = istDayRange();
  const [v, visitsBooked, visitsRun, deals, target] = await Promise.all([
    verifiedActivityToday(employeeId),
    measureMetric(employeeId, 'VISITS_BOOKED', start, end),
    measureMetric(employeeId, 'VISITS_COMPLETED', start, end),
    measureMetric(employeeId, 'BOOKINGS_CONFIRMED', start, end),
    activeTarget(employeeId, companyId, roleName),
  ]);
  const calls = v.calls;
  const visits = visitsBooked + visitsRun;
  const checks = target
    ? [
        { label: 'Calls logged in CRM', done: calls, target: target.calls_target },
        { label: 'Site visits', done: visits, target: target.site_visits_target },
        { label: 'Bookings', done: deals, target: target.closed_deals_target },
      ].filter((x) => x.target > 0)
    : [];
  const missed = checks.filter((x) => x.done < x.target);
  const below = missed.length > 0;
  const exceeded =
    !!target &&
    !below &&
    (calls > target.calls_target ||
      visits > target.site_visits_target ||
      deals > target.closed_deals_target);
  return {
    verified: v,
    calls,
    visits,
    deals,
    target,
    checks,
    below,
    exceeded,
    missedMetrics: missed.map((x) => `${x.label}: ${x.done}/${x.target}`),
  };
}

export interface SheetField {
  id: string;
  label: string;
  recorded: number | null;
  input: 'COUNT' | 'MONEY' | 'TEXT' | null;
  required: boolean;
  hint: string | null;
}

/** The fields for this person's report today, with what the CRM recorded. */
export async function buildSheet(employeeId: number, companyId: number, roleName: string) {
  const { start, end } = istDayRange();
  const [v, target] = await Promise.all([
    verifiedActivityToday(employeeId),
    activeTarget(employeeId, companyId, roleName),
  ]);
  const ctx: Ctx = { employeeId, companyId, start, end, v };
  const defs = REPORT_FIELDS[roleName] || [];
  const fields: SheetField[] = await Promise.all(
    defs.map(async (d) => ({
      id: d.id,
      label: d.label,
      recorded: d.recorded ? await d.recorded(ctx) : null,
      input: d.recorded ? null : d.input || 'TEXT',
      required: !!d.required,
      hint: d.hint || null,
    })),
  );
  // Extra questions the MD added in the Target Configurator stay, as typed fields.
  const known = new Set(defs.map((d) => d.id));
  const schema = Array.isArray(target?.form_schema_json) ? (target!.form_schema_json as any[]) : [];
  for (const f of schema) {
    if (!f || typeof f.id !== 'string' || known.has(f.id) || OLD_PRESET_IDS.has(f.id)) continue;
    if (f.type === 'CHECKLIST') continue;
    fields.push({
      id: f.id,
      label: String(f.label || f.id),
      recorded: null,
      input: f.type === 'COUNT' ? 'COUNT' : 'TEXT',
      required: !!f.required,
      hint: null,
    });
  }
  return fields;
}

/**
 * Checked out today means the report is final: it can be edited until the QR
 * checkout (decision 2026-10-19).
 */
export async function checkedOutToday(employeeId: number) {
  const { start, end } = istDayRange();
  const log = await p.attendanceLog.findFirst({
    where: { employee_id: employeeId, check_in_at: { gte: start, lt: end } },
    orderBy: { check_in_at: 'desc' },
    select: { check_out_at: true },
  });
  return !!log?.check_out_at;
}

/** Recorded numbers, keyed by field id, to store with the report. */
export const recordedSnapshot = (fields: SheetField[]) =>
  Object.fromEntries(fields.filter((f) => f.recorded !== null).map((f) => [f.id, f.recorded]));

/** Checks the typed answers against the sheet; returns an error message or null. */
export function checkTyped(fields: SheetField[], typedValues: Record<string, unknown>) {
  for (const f of fields) {
    const raw = typedValues[f.id];
    const empty = raw === undefined || raw === null || String(raw).trim() === '';
    if (f.input && f.required && empty) return `"${f.label}" is required.`;
    if (empty) continue;
    if (f.recorded !== null || f.input === 'COUNT' || f.input === 'MONEY') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return `"${f.label}" must be a number (0 or more).`;
    }
  }
  return null;
}
