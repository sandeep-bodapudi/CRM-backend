// Typed fetch wrappers for the ProjectUnit + pricing-rule endpoints built in
// Phase 1 (apps/api/src/routes/projects/units.ts, .../pricing.ts). Every
// function takes the `fetchWithAuth` from useAuth() so callers don't repeat
// the auth-header/JSON-body boilerplate. None of these compute a price
// client-side — the server always does (see services/pricing/engine.ts).

import { API_BASE_URL } from '../config';

type FetchWithAuth = (url: string, options?: RequestInit) => Promise<Response>;

export type UnitType = 'PLOT' | 'FLAT' | 'VILLA' | 'HOUSE' | 'COMMERCIAL' | 'OTHER';
export type AreaUnitCode =
  'SQFT' | 'SQYD' | 'SQM' | 'ACRE' | 'GUNTA' | 'CENT' | 'ANKANAM' | 'HECTARE';
export type PriceBasisCode = 'CARPET' | 'BUILT_UP' | 'SUPER_BUILT_UP' | 'PLOT_AREA' | 'LUMPSUM';
export type SalesStatus =
  'AVAILABLE' | 'HOLD' | 'RESERVED' | 'BOOKED' | 'SOLD' | 'BLOCKED' | 'UNAVAILABLE';
export type ChargeCalcMethod = 'FIXED' | 'PER_SQFT' | 'PER_SQYD' | 'PERCENT_OF_BASE' | 'QTY_X_RATE';
export type PricingRuleKind = 'BASE_RATE' | 'PREMIUM' | 'CHARGE' | 'DISCOUNT' | 'TAX';
export type ChargeCategory =
  | 'FACING'
  | 'FLOOR'
  | 'CORNER'
  | 'ROAD'
  | 'PARK'
  | 'VIEW'
  | 'BHK'
  | 'AMENITY'
  | 'PARKING'
  | 'INFRA'
  | 'MAINTENANCE'
  | 'LEGAL'
  | 'CLUB'
  | 'TAX'
  | 'OTHER';

export interface ManualPriceLineInput {
  label: string;
  category?: ChargeCategory;
  amount: number;
}

/** Everything a unit form can send. Every field optional — the type-specific
 * section a form renders decides which of these it actually fills in. */
export interface ProjectUnitInput {
  unit_number: string;
  unit_type: UnitType;
  plot_number?: string | null;
  survey_number?: string | null;
  tower?: string | null;
  block?: string | null;
  floor?: number | null;
  flat_number?: string | null;
  villa_number?: string | null;
  type_code?: string | null;

  bhk?: string | null;
  listing_type?: 'NEW' | 'RESALE' | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  balconies?: number | null;
  living_rooms?: number | null;
  kitchens?: number | null;
  utility_rooms?: number | null;
  has_pooja_room?: boolean;
  has_study_room?: boolean;

  area_value?: number | null;
  area_unit?: AreaUnitCode | null;
  plot_area_sqyd?: number | null;
  plot_length_ft?: number | null;
  plot_width_ft?: number | null;
  carpet_area_sqft?: number | null;
  built_up_area_sqft?: number | null;
  super_built_up_area_sqft?: number | null;
  ground_floor_area_sqft?: number | null;
  first_floor_area_sqft?: number | null;
  total_floors?: number | null;
  price_basis?: PriceBasisCode;

  facing?: string | null;
  is_corner?: boolean;
  is_road_facing?: boolean;
  is_park_facing?: boolean;
  is_main_road_facing?: boolean;
  road_width_ft?: number | null;
  view?: string | null;

  parking_included?: boolean;
  parking_type?: string | null;
  parking_count?: number | null;
  parking_slots?: string | null;

  base_rate?: number | null;
  base_rate_unit?: ChargeCalcMethod | null;
  base_price_override?: number | null;
  discount_amount?: number | null;
  discount_reason?: string | null;
  manual_lines?: ManualPriceLineInput[];

  sales_status?: SalesStatus;
  notes?: string | null;
}

export interface InventoryFeature {
  id: number;
  label: string;
  charge_amount: number | null;
  sort_order: number;
}

export interface ProjectUnitImage {
  id: number;
  image_url: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
}

export interface ProjectUnitDocument {
  id: number;
  url: string;
  title: string | null;
}

export interface UnitActivityEvent {
  id: number;
  actor_id: number;
  actor_name: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  created_at: string;
}

export interface ProjectUnit extends ProjectUnitInput {
  id: number;
  unit_code: string;
  project_id: number;
  base_price: number;
  premiums_total: number;
  charges_total: number;
  taxes_total: number;
  calculated_price: number;
  override_price: number | null;
  override_reason: string | null;
  overridden_by_id: number | null;
  overridden_at: string | null;
  final_price: number;
  sales_status: SalesStatus;
  locked_until: string | null;
  locked_by_booking_id: number | null;
  area_sqft?: number | null;
  area_sqyd?: number | null;
  price_lines?: PriceLine[];
  features?: InventoryFeature[];
  images?: ProjectUnitImage[];
  documents?: ProjectUnitDocument[];
  project?: { id: number; name: string; project_code: string; location: string };
}

export interface PriceLine {
  id: number;
  rule_id: number | null;
  label: string;
  kind: PricingRuleKind;
  category: ChargeCategory;
  calc_method: ChargeCalcMethod;
  rate: number;
  quantity: number;
  area_basis: PriceBasisCode | null;
  amount: number;
  is_manual: boolean;
  is_refundable: boolean;
  sort_order: number;
}

export interface PriceComputation {
  lines: PriceLine[];
  base_price: number;
  premiums_total: number;
  charges_total: number;
  discount_amount: number;
  calculated_price: number;
  taxes_total: number;
  all_inclusive_price: number;
  refundable_total: number;
  warnings: string[];
}

export interface InventorySummary {
  total_units: number;
  by_status: Record<string, number>;
  by_unit_type: Record<string, number>;
  total_inventory_value: number;
  sold_and_booked_value: number;
  price_range: { min: number; max: number };
}

export interface PricingRuleInput {
  /** Needed when the project is already approved; kept in its History. */
  change_reason?: string;
  label: string;
  kind: PricingRuleKind;
  category: ChargeCategory;
  calc_method: ChargeCalcMethod;
  rate: number;
  area_basis?: PriceBasisCode | null;
  applies_to_unit_type?: UnitType | null;
  is_mandatory?: boolean;
  is_tax?: boolean;
  is_refundable?: boolean;
  is_active?: boolean;
  sort_order?: number;
  match_facing?: string | null;
  match_corner?: boolean | null;
  match_park_facing?: boolean | null;
  match_road_facing?: boolean | null;
  match_main_road_facing?: boolean | null;
  match_floor_min?: number | null;
  match_floor_max?: number | null;
  match_bhk?: string | null;
  match_type_code?: string | null;
  match_view?: string | null;
}

export interface PricingRule extends PricingRuleInput {
  id: number;
  project_id: number;
}

async function asJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error || data?.message || 'Request failed';
    throw { res, data, message };
  }
  return data as T;
}

// ---- Units -----------------------------------------------------------------

export function listProjectUnits(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  filters: {
    unit_type?: string;
    sales_status?: string;
    tower?: string;
    floor?: number;
    bhk?: string;
    facing?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units${qs ? `?${qs}` : ''}`).then(
    (res) =>
      asJson<{
        units: ProjectUnit[];
        pagination: { limit: number; offset: number; total: number };
      }>(res),
  );
}

export function getProjectUnit(fetchWithAuth: FetchWithAuth, projectId: number, unitId: number) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units/${unitId}`).then((res) =>
    asJson<{ unit: ProjectUnit }>(res),
  );
}

export function createProjectUnit(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  data: ProjectUnitInput,
) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((res) => asJson<{ message: string; unit: ProjectUnit }>(res));
}

export function updateProjectUnit(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  unitId: number,
  data: Partial<ProjectUnitInput>,
) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units/${unitId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((res) => asJson<{ message: string; unit: ProjectUnit }>(res));
}

export function deleteProjectUnit(fetchWithAuth: FetchWithAuth, projectId: number, unitId: number) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units/${unitId}`, {
    method: 'DELETE',
  }).then((res) => asJson<{ deleted: boolean }>(res));
}

export function changeUnitStatus(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  unitId: number,
  sales_status: SalesStatus,
  reason?: string,
) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units/${unitId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sales_status, reason }),
  }).then((res) => asJson<{ message: string; unit: ProjectUnit }>(res));
}

export function overrideUnitPrice(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  unitId: number,
  override_price: number | null,
  override_reason?: string | null,
) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units/${unitId}/override-price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ override_price, override_reason }),
  }).then((res) => asJson<{ message: string; unit: ProjectUnit }>(res));
}

export function previewUnitPrice(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  input: Partial<ProjectUnitInput> & { unit_type: UnitType },
) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units/preview-price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((res) => asJson<{ computation: PriceComputation }>(res));
}

export function addUnitFeature(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  unitId: number,
  label: string,
  chargeAmount?: number | null,
) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units/${unitId}/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, charge_amount: chargeAmount }),
  }).then((res) => asJson<{ message: string; feature: InventoryFeature }>(res));
}

export function removeUnitFeature(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  unitId: number,
  featureId: number,
) {
  return fetchWithAuth(
    `${API_BASE_URL}/projects/${projectId}/units/${unitId}/features/${featureId}`,
    { method: 'DELETE' },
  ).then((res) => asJson<{ deleted: boolean }>(res));
}

export function getUnitActivity(fetchWithAuth: FetchWithAuth, projectId: number, unitId: number) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units/${unitId}/activity`).then(
    (res) => asJson<{ events: UnitActivityEvent[] }>(res),
  );
}

export function getInventorySummary(fetchWithAuth: FetchWithAuth, projectId: number) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units/summary`).then((res) =>
    asJson<{ summary: InventorySummary }>(res),
  );
}

export function generateProjectUnits(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  payload: {
    common?: Partial<ProjectUnitInput>;
    units: (Partial<ProjectUnitInput> & { unit_number: string })[];
  },
) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/units/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((res) =>
    asJson<{
      message: string;
      created: number;
      total: number;
      failed: { index: number; error: string }[];
      created_ids: number[];
    }>(res),
  );
}

// ---- Pricing rules -----------------------------------------------------------

export function listPricingRules(fetchWithAuth: FetchWithAuth, projectId: number) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/pricing-rules`).then((res) =>
    asJson<{ rules: PricingRule[] }>(res),
  );
}

export function createPricingRule(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  data: PricingRuleInput,
) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/pricing-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((res) => asJson<{ message: string; rule: PricingRule }>(res));
}

export function updatePricingRule(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  ruleId: number,
  data: Partial<PricingRuleInput>,
) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/pricing-rules/${ruleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((res) => asJson<{ message: string; rule: PricingRule }>(res));
}

export function deletePricingRule(
  fetchWithAuth: FetchWithAuth,
  projectId: number,
  ruleId: number,
  changeReason?: string,
) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/pricing-rules/${ruleId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ change_reason: changeReason }),
  }).then((res) => asJson<{ deactivated: boolean }>(res));
}

export interface RecalculatePreview {
  total_units: number;
  changed_count: number;
  changes: {
    unit_id: number;
    unit_number: string;
    old_calculated_price: number;
    new_calculated_price: number;
    old_final_price: number;
    new_final_price: number;
    delta: number;
  }[];
}

export function previewRecalculateProject(fetchWithAuth: FetchWithAuth, projectId: number) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/pricing/recalculate-preview`).then(
    (res) => asJson<RecalculatePreview>(res),
  );
}

export function applyRecalculateProject(fetchWithAuth: FetchWithAuth, projectId: number) {
  return fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/pricing/recalculate`, {
    method: 'POST',
  }).then((res) => asJson<{ message: string; updated_count: number }>(res));
}
