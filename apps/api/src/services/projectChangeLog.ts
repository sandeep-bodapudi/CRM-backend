import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Roles } from '../shared';
import { notifyEmployee } from '../utils/notifyEmployee';
import { logger } from '../utils/logger';

// Changes to an approved project (owner, 2026-11-02): a VERIFIED project's
// details, prices, pricing rules and units can change without another review,
// but every change leaves one AuditEvent row per field, written so it reads
// plainly in the project's History tab and in the table itself:
//   action    "PRICING_CHANGE:Base price (Plot)"
//   old_value "₹15,000 / Sq.Yd"     new_value "₹16,000 / Sq.Yd"
//   reason    why (required for price changes), actor_id + created_at who/when.

export type ChangeArea = 'DETAILS' | 'PRICING' | 'UNITS';
export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

type Client = Prisma.TransactionClient | typeof prisma;

export const isApproved = (project: { verification_status?: string | null }) =>
  project.verification_status === 'VERIFIED';

/** Price changes on an approved project need a reason. */
export function requireReason(
  project: { verification_status?: string | null },
  reason: string | null | undefined,
) {
  if (isApproved(project) && !reason?.trim()) {
    throw {
      status: 400,
      message:
        'This project is already approved. Give a reason for the price change — it is kept in the project history.',
    };
  }
}

// ── Formatting ──────────────────────────────────────────────────────────────

const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const TYPE_LABEL: Record<string, string> = {
  PLOT: 'Plot',
  FLAT: 'Flat',
  VILLA: 'Villa',
  HOUSE: 'House',
  COMMERCIAL: 'Commercial',
  OTHER: 'Other',
};
const humanize = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (value instanceof Date)
    return value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-IN');
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 300);
  const s = String(value);
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown) =>
    v === undefined || v === null || v === ''
      ? null
      : v instanceof Date
        ? v.getTime()
        : typeof (v as any).toNumber === 'function' // Prisma Decimal
          ? (v as any).toNumber()
          : typeof v === 'object'
            ? JSON.stringify(v)
            : v;
  const na = norm(a);
  const nb = norm(b);
  // A date sent as text compares by its time, not its spelling.
  if (typeof na === 'number' && typeof b === 'string') return na === new Date(b).getTime();
  return na === nb;
};

function diff(
  before: Record<string, any>,
  after: Record<string, any>,
  labels: Record<string, string>,
  prefix = '',
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const key of Object.keys(after)) {
    if (!(key in labels)) continue;
    if (same(before[key], after[key])) continue;
    out.push({
      field: `${prefix}${labels[key]}`,
      before: show(before[key]),
      after: show(after[key]),
    });
  }
  return out;
}

// ── Project details ─────────────────────────────────────────────────────────

const PROJECT_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  location: 'Location',
  total_area: 'Total area',
  total_units: 'Total units',
  launch_date: 'Launch date',
  completion_date: 'Completion date',
  project_phase: 'Phase',
  rera_number: 'RERA number',
  rera_status: 'RERA status',
  approval_authorities: 'Approvals',
  approval_number: 'Approval number',
  lp_number: 'LP number',
  amenities: 'Amenities',
  project_type: 'Project type',
  developer_name: 'Developer',
  state: 'State',
  district: 'District',
  city: 'City',
  mandal: 'Mandal',
  village: 'Village',
  locality: 'Locality',
  address: 'Address',
  pincode: 'Pincode',
  latitude: 'Latitude',
  longitude: 'Longitude',
  maps_link: 'Map link',
  total_area_value: 'Total area',
  total_area_unit: 'Total area unit',
  towers_count: 'Towers',
  blocks_count: 'Blocks / phases',
  floors_count: 'Floors',
  default_price_basis: 'Default price basis',
  default_area_unit: 'Default area unit',
  cover_image_url: 'Cover image',
};

/** Field changes in a project edit. The PM and status are recorded on their own. */
export function projectChanges(before: Record<string, any>, update: Record<string, any>) {
  return diff(before, update, PROJECT_LABELS);
}

// ── Pricing rules ───────────────────────────────────────────────────────────

const RULE_KIND: Record<string, string> = {
  BASE_RATE: 'Base price',
  PREMIUM: 'Premium',
  CHARGE: 'Charge',
  DISCOUNT: 'Discount',
  TAX: 'Tax',
};

export function ruleRate(rule: { rate: number; calc_method: string }) {
  switch (rule.calc_method) {
    case 'PER_SQYD':
      return `${inr(rule.rate)} / Sq.Yd`;
    case 'PER_SQFT':
      return `${inr(rule.rate)} / Sq.Ft`;
    case 'PERCENT_OF_BASE':
      return `${rule.rate}% of base`;
    case 'QTY_X_RATE':
      return `${inr(rule.rate)} each`;
    default:
      return inr(rule.rate);
  }
}

/** "Base price (Plot)", or "Premium: East facing (Plot)" when the label adds something. */
export function ruleName(rule: {
  label: string;
  kind: string;
  applies_to_unit_type?: string | null;
}) {
  const kind = RULE_KIND[rule.kind] || humanize(rule.kind);
  const label =
    rule.label && rule.label.toLowerCase() !== kind.toLowerCase() ? `: ${rule.label}` : '';
  const type = rule.applies_to_unit_type
    ? ` (${TYPE_LABEL[rule.applies_to_unit_type] || rule.applies_to_unit_type})`
    : '';
  return `${kind === 'Base price' ? kind : `${kind}${label}`}${type}`;
}

const RULE_LABELS: Record<string, string> = {
  label: 'name',
  applies_to_unit_type: 'applies to',
  area_basis: 'area basis',
  is_mandatory: 'applies automatically',
  is_tax: 'is tax',
  is_refundable: 'refundable',
  match_facing: 'facing',
  match_corner: 'corner only',
  match_park_facing: 'park facing only',
  match_road_facing: 'road facing only',
  match_main_road_facing: 'main road only',
  match_floor_min: 'from floor',
  match_floor_max: 'to floor',
  match_bhk: 'BHK',
  match_type_code: 'type',
  match_view: 'view',
};

export function ruleChanges(
  before: Record<string, any>,
  after: Record<string, any>,
): FieldChange[] {
  const name = ruleName({ ...before, ...after } as any);
  const out: FieldChange[] = [];
  const merged = { ...before, ...after };
  if (!same(before.rate, merged.rate) || !same(before.calc_method, merged.calc_method)) {
    out.push({ field: name, before: ruleRate(before as any), after: ruleRate(merged as any) });
  }
  if (after.is_active !== undefined && !same(before.is_active, after.is_active)) {
    out.push({
      field: name,
      before: before.is_active ? 'On' : 'Off',
      after: after.is_active ? 'On' : 'Off',
    });
  }
  return out.concat(diff(before, after, RULE_LABELS, `${name} · `));
}

// ── Units ───────────────────────────────────────────────────────────────────

const UNIT_LABELS: Record<string, string> = {
  unit_number: 'number',
  unit_type: 'type',
  block: 'block',
  tower: 'tower',
  floor: 'floor',
  bhk: 'BHK',
  type_code: 'type',
  plot_area_sqyd: 'plot area (Sq.Yd)',
  carpet_area_sqft: 'carpet area (Sq.Ft)',
  built_up_area_sqft: 'built-up area (Sq.Ft)',
  super_built_up_area_sqft: 'super built-up area (Sq.Ft)',
  facing: 'facing',
  is_corner: 'corner',
  is_road_facing: 'road facing',
  is_park_facing: 'park facing',
  is_main_road_facing: 'main road facing',
  road_width_ft: 'road width (ft)',
  view: 'view',
  parking_included: 'parking included',
  parking_count: 'parking slots',
  price_basis: 'price basis',
  notes: 'notes',
};

export const unitName = (unit: { unit_number: string; unit_type?: string | null }) =>
  `${TYPE_LABEL[unit.unit_type || ''] || 'Unit'} ${unit.unit_number}`;

export function unitChanges(before: Record<string, any>, after: Record<string, any>) {
  return diff(before, after, UNIT_LABELS, `${unitName(before as any)} · `);
}

export const priceChange = (
  unit: { unit_number: string; unit_type?: string | null },
  from: number,
  to: number,
): FieldChange[] =>
  Math.round(from) === Math.round(to)
    ? []
    : [{ field: `${unitName(unit)} · price`, before: inr(from), after: inr(to) }];

export const money = inr;

// ── Writing and reading ─────────────────────────────────────────────────────

export async function recordChanges(
  client: Client,
  input: {
    projectId: number;
    actorId: number;
    area: ChangeArea;
    changes: FieldChange[];
    reason?: string | null;
  },
) {
  if (!input.changes.length) return 0;
  await client.auditEvent.createMany({
    data: input.changes.map((c) => ({
      actor_id: input.actorId,
      action: `${input.area}_CHANGE:${c.field}`.slice(0, 191),
      entity_type: 'PROJECT',
      entity_id: input.projectId,
      old_value: c.before,
      new_value: c.after,
      reason: input.reason?.trim() || null,
    })),
  });
  return input.changes.length;
}

/** Tells every active MD of the company (except the one who made it) that an approved project's prices changed. */
export async function notifyPricingChange(
  project: { id: number; name: string; project_code: string; company_id: number },
  actorId: number,
  changes: FieldChange[],
  reason?: string | null,
) {
  if (!changes.length) return 0;
  const [mds, actor] = await Promise.all([
    prisma.employee.findMany({
      where: {
        company_id: project.company_id,
        status: 'ACTIVE',
        id: { not: actorId },
        roles: { some: { role: { name: Roles.MD } } },
      },
      select: { id: true },
    }),
    prisma.employee.findUnique({ where: { id: actorId }, select: { full_name: true } }),
  ]);
  const lines = changes.slice(0, 3).map((c) => `${c.field}: ${c.before} → ${c.after}`);
  if (changes.length > 3) lines.push(`and ${changes.length - 3} more`);
  const message =
    `${actor?.full_name || 'Someone'} changed prices on approved project "${project.name}" (${project.project_code}). ` +
    `${lines.join('; ')}.${reason ? ` Reason: ${reason}` : ''}`;
  await Promise.all(
    mds.map((m) =>
      notifyEmployee(m.id, {
        type: 'PROJECT_PRICE_CHANGED',
        title: `Prices changed: ${project.project_code}`,
        message,
        link: `/projects/${project.id}`,
      }).catch((err) => logger.error('[Project] price change notification failed:', err)),
    ),
  );
  return mds.length;
}
