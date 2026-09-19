// Centralized precise domain DTOs for the RRH-CRMS web frontend.
//
// These mirror the real API response shapes (Prisma models) consumed by the
// React UI. They are intentionally narrow: only the fields actually read by the
// frontend are typed. This avoids broad index signatures and keeps G1 strict-typing
// honest. Where a field is genuinely dynamic (e.g. metrics_json), it is typed
// precisely as JsonValue rather than any.
//
// Reuse these instead of re-declaring the same shape across components.

export type ISODateTime = string;

/** Minimal JSON value type (no `any`). */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

/** Employee as returned by /employees and /md/employees endpoints. */
export interface EmployeeListItem {
  id: number;
  employee_code: string;
  full_name?: string | null;
  employeeCode?: string;
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  job_title?: string | null;
  department?: string | null;
  status?: EmployeeStatus;
  roles: string[];
  branch?: string;
  branch_id?: number | null;
  attendanceRequired?: boolean;
  reportRequired?: boolean;
  role?: { name?: string | null } | null;
  company_id?: number;
  // POST /auth/login flattens this to a plain string (see apps/api/src/routes/auth.ts);
  // some other endpoints return the nested object shape — kept as a union
  // rather than picking one, since this type is shared across both.
  company?: string | { id?: number; name?: string } | null;
  // Only actually populated on the /auth/login response's `user` object.
  permissions?: string[];
  firstLoginDone?: boolean;
  activeLeadCount?: number;
  closureRate?: number;
  created_at?: ISODateTime;
  updated_at?: ISODateTime;
}

/** Project as returned by GET /projects (list + detail). */
export type ProjectType =
  | 'PLOTTED'
  | 'APARTMENT'
  | 'VILLA'
  | 'INDEPENDENT_HOUSE'
  | 'ROW_HOUSE'
  | 'AGRICULTURAL_LAND'
  | 'FARM_HOUSE'
  | 'COMMERCIAL_SHOP'
  | 'COMMERCIAL_OFFICE'
  | 'MIXED_RESIDENTIAL'
  | 'MIXED_USE'
  | 'TOWNSHIP'
  | 'GATED_COMMUNITY'
  // Kept for backward compatibility with existing rows — see the enum's own
  // comment in schema.prisma (spec item 1.6).
  | 'MIXED'
  | 'COMMERCIAL'
  | 'OTHER';
export type ProjectAreaUnit =
  'SQFT' | 'SQYD' | 'SQM' | 'ACRE' | 'GUNTA' | 'CENT' | 'ANKANAM' | 'HECTARE';
export type ProjectPriceBasis = 'CARPET' | 'BUILT_UP' | 'SUPER_BUILT_UP' | 'PLOT_AREA' | 'LUMPSUM';
export type ReraStatus = 'NOT_APPLICABLE' | 'APPLIED' | 'APPROVED';
export type ApprovalAuthority = 'RERA' | 'DTCP' | 'HMDA' | 'PANCHAYAT';

export interface ProjectListItem {
  id: number;
  project_code: string;
  name: string;
  description?: string | null;
  location: string;
  total_area?: string | null;
  total_units?: number | null;
  launch_date?: ISODateTime | null;
  project_phase?: string | null;
  rera_number?: string | null;
  status: string;
  slug?: string;
  assigned_pm_id?: number | null;
  assigned_pm?: { id: number; employee_code: string; full_name?: string | null } | null;
  company_id?: number;
  branch_id?: number | null;
  created_at?: ISODateTime;
  updated_at?: ISODateTime;

  // Common-data fields (Rebuild Phase 2)
  project_type?: ProjectType | null;
  developer_name?: string | null;
  state?: string | null;
  district?: string | null;
  city?: string | null;
  mandal?: string | null;
  village?: string | null;
  locality?: string | null;
  address?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  maps_link?: string | null;
  total_area_value?: number | null;
  total_area_unit?: ProjectAreaUnit | null;
  towers_count?: number | null;
  blocks_count?: number | null;
  floors_count?: number | null;
  completion_date?: ISODateTime | null;
  rera_status?: ReraStatus | null;
  /** @deprecated superseded by approval_authorities (#13) */
  approval_authority?: ApprovalAuthority | null;
  approval_authorities?: string[] | null;
  approval_number?: string | null;
  lp_number?: string | null;
  default_price_basis?: ProjectPriceBasis | null;
  default_area_unit?: ProjectAreaUnit | null;
  cover_image_url?: string | null;
  is_published?: boolean;

  // Verification workflow — separate from `status` (the operational
  // PLANNING/UNDER_CONSTRUCTION/etc lifecycle). DRAFT/REJECTED projects are
  // only visible to MD/Admin and their assigned PM; everyone else only sees
  // VERIFIED projects (see apps/api/src/authz/dataScope.ts).
  verification_status?:
    | 'DRAFT'
    | 'PENDING_DM_POLISH'
    | 'PENDING_MD_APPROVAL'
    | 'VERIFIED'
    | 'REJECTED'
    // Legacy value -- see the enum's own comment in schema.prisma (item 1.7).
    | 'PENDING_VERIFICATION';
  verified_by_id?: number | null;
  verified_by?: { id: number; full_name?: string | null } | null;
  verified_at?: ISODateTime | null;
  verification_notes?: string | null;
}

/** Project detail DTO — extends the list item with nested properties + counts. */
export interface ProjectDossierData extends ProjectListItem {
  properties?: PropertyListItem[];
}

/**
 * Unified property-or-project-unit row from GET /inventory — the single list
 * every picker that used to be property-only (booking, matching, ...) now
 * reads from, so a project's units show up everywhere a standalone property
 * does. See apps/api/src/services/inventory.service.ts for the server side.
 */
export interface InventoryItem {
  kind: 'PROPERTY' | 'UNIT';
  id: number;
  code: string;
  title: string;
  category: string;
  location: string;
  city: string | null;
  price: number;
  area_sqft: number | null;
  bedrooms: number | null;
  facing: string | null;
  image_url: string | null;
  sales_status: string;
  project_id: number | null;
  project_name: string | null;
  unit_number: string | null;
  tower: string | null;
  floor: number | null;
  created_at: ISODateTime;
}

/** Property as returned by GET /properties (list + detail). */
export interface PropertyListItem {
  id: number;
  property_code: string;
  project_id?: number | null;
  title: string;
  description?: string | null;
  brand_type?: string;
  category?: string;
  // § Phase 3: Property.price (manually-typed) was removed — final_price is
  // the pricing engine's authoritative output.
  final_price?: number;
  area_sqft?: number;
  location: string;
  address?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  facing?: string | null;
  details?: JsonValue | null;
  status?: string;
  assigned_pm_id?: number | null;
  assigned_pm?: {
    id: number;
    employee_code: string;
    full_name?: string | null;
    phone?: string | null;
  } | null;
  created_by?: { id: number; employee_code: string; full_name?: string | null } | null;
  project?: { id: number; name: string };
  images?: PropertyImage[];
  city?: string | null;
  locality?: string | null;
  state?: string | null;
  pincode?: string | null;
  created_at?: ISODateTime;
  updated_at?: ISODateTime;
  // Verification workflow
  verification_logs?: PropertyVerificationLog[];
  // UI view mode used by PropertyManagement
  viewMode?: 'grid' | 'list';
  _count?: {
    interested_leads: number;
  };
}

export interface PropertyImage {
  id: number;
  property_id?: number;
  image_url: string;
  is_primary?: boolean;
  alt_text?: string | null;
  sort_order?: number;
  /** ID of the employee who uploaded this image — used to distinguish PM on-site photos from seller-submitted photos. */
  uploaded_by_id?: number;
  status?: string;
  created_at?: ISODateTime;
}

export interface PropertyVerificationLog {
  id: number;
  property_id?: number;
  actor_id?: number;
  from_status?: string | null;
  to_status?: string;
  notes?: string | null;
  actor?: { id: number; employee_code?: string; full_name?: string | null } | null;
  created_at?: ISODateTime;
}

export interface LocalImageItem extends PropertyImage {}

/** Booking as returned by GET /bookings (list + detail). */
export interface BookingItem {
  id: number;
  booking_code: string;
  company_id?: number;
  branch_id?: number | null;
  customer_id?: number;
  /** Exactly one of property_id / project_unit_id is set (never both). */
  property_id?: number | null;
  project_unit_id?: number | null;
  assigned_employee_id?: number | null;
  assigned_employee?: EmployeeListItem | null;
  status: string;
  agreed_price: number;
  booking_amount: number;
  balance_amount: number;
  booking_date?: ISODateTime;
  source?: string | null;
  notes?: string | null;
  customer?: {
    id: number;
    customer_code?: string;
    first_name?: string;
    last_name?: string | null;
    phone?: string;
  };
  property?: PropertyListItem | null;
  project_unit?: {
    id: number;
    unit_code: string;
    unit_number: string;
    flat_number?: string | null;
    villa_number?: string | null;
    plot_number?: string | null;
    final_price?: number;
    sales_status?: string;
    project: {
      id: number;
      name: string;
      project_code?: string;
      location?: string;
      city?: string | null;
    };
  } | null;
  payments?: PaymentItem[];
  created_at?: ISODateTime;
  updated_at?: ISODateTime;
}

export interface PaymentItem {
  id: number;
  payment_code?: string;
  booking_id?: number;
  installment_id?: number | null;
  amount: number;
  payment_method?: string;
  reference_number?: string | null;
  payment_date: ISODateTime;
  status?: string;
  notes?: string | null;
  created_at?: ISODateTime;
}

/** Booking dossier detail (extends BookingItem). */
export interface BookingDossierData extends BookingItem {
  handoff?: HandoffData | null;
}

export interface HandoffData {
  portal_customer_id?: string | null;
  portal_booking_id?: string | null;
  company_id?: number;
  crms_booking_id?: number;
  status?: string;
  handoff_status?: string;
  message?: string | null;
  initiated_at?: ISODateTime;
  completed_at?: ISODateTime | null;
}

export interface ProjectFormData {
  id?: number;
  name: string;
  location: string;
  description?: string | null;
  total_area?: string | null;
  launch_date?: ISODateTime | null;
  status?: string;
  assigned_pm_id?: number | null;
}

export interface ProjectFormPayload {
  name: string;
  location: string;
  description?: string | null;
  total_area?: string | null;
  total_units?: number | null;
  project_phase?: string | null;
  rera_number?: string | null;
  launch_date?: ISODateTime | null;
  assigned_pm_id?: number | null;
  status?: string;
}

/** Lead as returned by GET /leads. */
export interface LeadListItem {
  id: number;
  lead_code: string;
  customer_name: string;
  phone: string;
  email?: string | null;
  source?: string;
  status?: string;
  assignment_type?: string | null;
  property_type_preference?: string | null;
  preferred_location?: string | null;
  // Full multi-location list (§ Phase 2) — preferred_location above stays as
  // the primary/first entry for backward compatibility.
  preferred_locations?: { id: number; location: string; sort_order: number }[];
  budget_min?: number | null;
  budget_max?: number | null;
  assigned_to?: { id: number; employee_code: string; full_name: string; phone: string } | null;
  created_by?: { id: number; employee_code: string; full_name?: string } | null;
  created_at?: ISODateTime;
  lead_score?: number;
  sla_breach_at?: ISODateTime | null;
  campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referral_person_name?: string | null;
  activities?: LeadActivity[];
  can_edit?: boolean;
  converted_customer?: { customer_code: string } | null;
}

export interface LeadActivity {
  id: number;
  lead_id?: number;
  actor_id?: number;
  activity_type: string;
  notes?: string | null;
  actor?: { id: number; full_name?: string | null; employee_code?: string } | null;
  created_at: ISODateTime;
}

/**
 * Matched property OR project unit for a lead (GET /leads/:id/matches).
 * `kind` defaults to 'PROPERTY' when absent (older cached responses) — a
 * unit result reuses `propertyId` for the unit's own id (see
 * matchingEngine.ts), and adds `projectId`/`projectName`/`unitNumber`.
 */
export interface MatchItem {
  id?: number;
  kind?: 'PROPERTY' | 'UNIT';
  propertyId: number;
  property?: PropertyListItem;
  propertyCode?: string;
  title?: string;
  location?: string;
  price: number;
  areaSqft?: number;
  projectId?: number;
  projectName?: string;
  unitNumber?: string;
  matchScore: number;
  whatsAppUrl: string;
  matchBreakdown: { locationMatch: boolean; budgetMatch: boolean };
  match_reasons?: string[];
  is_active?: boolean;
}

/** A saved interest's project-unit shape (GET /leads/:id/properties), nested project included. */
export interface SavedInterestUnitItem {
  id: number;
  unit_code: string;
  unit_number: string;
  flat_number?: string | null;
  villa_number?: string | null;
  plot_number?: string | null;
  final_price: number;
  sales_status: string;
  project: { id: number; name: string; location: string; assigned_pm_id: number | null };
}

/**
 * Saved property (or project unit) interest (GET /leads/:id/properties).
 * Points at exactly one of `property` / `project_unit` — never both.
 */
export interface SavedInterestItem {
  id?: number;
  property_id?: number | null;
  property?: PropertyListItem | null;
  project_unit_id?: number | null;
  project_unit?: SavedInterestUnitItem | null;
  is_active?: boolean;
  created_at: ISODateTime;
}

/** Site visit for a lead (GET /site-visits?leadId=). */
export interface LeadVisitItem {
  id: number;
  booking_code?: string;
  lead_id?: number;
  property_id?: number | null;
  scheduled_date: ISODateTime;
  status: string;
  verification_call_notes?: string | null;
  feedback_notes?: string | null;
  rating?: string | null;
  property?: { id: number; title?: string; property_code?: string } | null;
}

/** Demo scheduled for a lead (GET /demos?leadId=). */
export interface LeadDemoItem {
  id: number;
  lead_id?: number;
  scheduled_at: ISODateTime;
  accepted_at?: ISODateTime | null;
  status: string;
  handler?: { id: number; full_name: string; employee_code: string } | null;
}

/** Follow-up task for a lead (GET /leads/:id/tasks). */
export interface LeadTaskItem {
  id: number;
  title: string;
  description?: string | null;
  assignee_id?: number;
  target_date: ISODateTime;
  status?: string;
  priority?: string;
  lead_id?: number | null;
  opportunity_id?: number | null;
  assignee?: { id: number; full_name?: string | null; employee_code?: string } | null;
  completed_at?: ISODateTime | null;
  created_at?: ISODateTime;
}

/** Sales opportunity for a lead (GET /opportunities). */
export interface LeadSalesOppItem {
  id: number;
  opportunity_code?: string;
  lead_id?: number;
  project_id?: number | null;
  project?: { id?: number; name?: string } | null;
  property_id?: number | null;
  booking_id?: number | null;

  expected_value?: number | null;
  probability?: number | null;
  owner_id?: number;
  owner?: { id: number; full_name?: string | null; employee_code?: string } | null;
  created_at: ISODateTime;
}

/** Parsed row from a bulk CSV upload. */
export interface ParsedBulkLeadRow {
  customer_name: string;
  phone: string;
  email?: string;
  property_type?: string;
  location?: string;
  notes?: string;
}

/** Lead distribution monitor response (GET /leads/distribution-monitor). */
export interface MonitorData {
  totalLeads?: number;
  totalLeadsCount?: number;
  unassigned?: number;
  byStatus?: Record<string, number>;
  byEmployee?: { employee_id: number; full_name?: string; count: number }[];
  telecallers: EmployeeListItem[];
}

/** Sales pipeline opportunity DTO (GET /opportunities). */
export interface SalesOpportunity {
  id: number;
  opportunity_code?: string;
  company_id?: number;
  branch_id?: number | null;
  lead_id?: number;
  project_id?: number | null;
  property_id?: number | null;
  project_unit_id?: number | null;
  booking_id?: number | null;

  expected_value?: number | null;
  probability?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
  expected_close_date?: ISODateTime | null;
  drop_reason?: string | null;
  owner_id?: number;
  owner?: { id: number; full_name?: string | null; employee_code?: string } | null;
  lead?: {
    id: number;
    customer_name?: string;
    phone?: string;
    email?: string | null;
    status?: string;
  };
  project?: { id: number; name?: string } | null;
  property?: PropertyListItem | null;
  project_unit?: SavedInterestUnitItem | null;
  history: OpportunityHistoryEntry[];
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface OpportunityHistoryEntry {
  id: number;
  opportunity_id?: number;
  from_stage?: string | null;
  to_stage?: string;
  changed_by_id?: number;
  changed_by?: { id: number; full_name?: string | null; employee_code?: string } | null;
  created_at: ISODateTime;
  duration_minutes?: number;
  exited_at?: ISODateTime | null;
}

/** Sales pipeline metrics (stage distribution counts). */
export interface PipelineMetricsData {
  total?: number;
  byStage?: Record<string, number>;
  metrics?: { status: string; count: number }[];
  weightedValue?: number;
  activeCount?: number;
  totalCount?: number;
  totalExpectedValue?: number;
  totalWeightedValue?: number;
  bookingInitiatedCount?: number;
  droppedCount?: number;
}

/** Sales conversion metrics. */
export interface ConversionMetricsData {
  total?: number;
  won?: number;
  lost?: number;
  conversionRate?: number;
  bySource?: Record<string, number>;
}

/** Sales manager dashboard KPI shape. */
export interface SalesManagerDashboardData {
  kpis: {
    totalLeads: number;
    newLeads: number;
    unassignedLeads: number;
    contacted: number;
    qualified: number;
    siteVisits: number;
    won: number;
    conversionRate: number;
  };
  pipeline: PipelineStageCount[];
  teamPerformance: TeamPerformanceRow[];
  leadAttribution: LeadAttributionRow[];
  stalledLeads: StalledLeadRow[];
  recoveredUnassignedLeads: StalledLeadRow[];
  overdueTasks: OverdueTaskRow[];
  siteVisits?: Record<string, number>;
  targets: { targetAttainmentPercentage: number };
}

export interface PipelineStageCount {
  status: string;
  count: number;
}

export interface TeamPerformanceRow {
  employee: { id: number; full_name?: string | null; employee_code?: string };
  assignedLeads: number;
  contacted: number;
  qualified: number;
  won: number;
  conversionRate: number;
}

export interface LeadAttributionRow {
  employee: { id: number; full_name?: string | null; employee_code?: string };
  leadsIntroduced: number;
  qualified: number;
  won: number;
  conversionRate: number;
}

export interface StalledLeadRow {
  id: number;
  customer_name?: string | null;
  assigned_to?: { full_name?: string | null } | null;
  last_contacted_at?: string | null;
  created_at?: string;
}

export interface OverdueTaskRow {
  id: number;
  lead?: { customer_name?: string | null } | null;
  assignee?: { full_name?: string | null } | null;
  target_date?: string;
}

/** Sales opportunity details DTO. */
export interface SalesOpportunityData extends SalesOpportunity {}

/** Task as returned by GET /tasks (my + team). */
export interface TaskItem {
  id: number;
  title: string;
  description?: string | null;
  assignee_id: number;
  // The real Task field (matches Prisma's `Task.target_date` and every API
  // response) — "deadline" is only ever the CREATE request body's field
  // name, never present on a returned task, and reading it here always
  // produced `undefined`/Invalid Date until this was caught.
  target_date: ISODateTime;
  status?: string;
  created_by?: number;
  completed_at?: ISODateTime | null;
  lead_id?: number | null;
  opportunity_id?: number | null;
  priority?: string;
  lead?: { id: number; customer_name?: string } | null;
  assignee?: { id: number; full_name?: string | null; employee_code?: string } | null;
  created_at?: ISODateTime;
  updated_at?: ISODateTime;
}

/** Site visit booking (GET /site-visits). */
export interface SiteVisitListItem {
  id: number;
  booking_code?: string;
  lead_id?: number;
  property_id?: number | null;
  telecaller_id?: number;
  project_manager_id?: number | null;
  assigned_agent_id?: number | null;
  scheduled_date?: ISODateTime;
  status?: string;
  verification_call_notes?: string | null;
  feedback_notes?: string | null;
  rating?: string | null;
  proof_photo_url?: string | null;
  completed_at?: ISODateTime | null;
  opportunity_id?: number | null;
  lead?: { id: number; customer_name?: string; phone?: string } | null;
  property?: { id: number; title?: string; property_code?: string } | null;
  telecaller?: { id: number; full_name?: string | null; employee_code?: string } | null;
  project_manager?: { id: number; full_name?: string | null; employee_code?: string } | null;
}

/** Target list item (GET /targets). */
export interface TargetListItem {
  id?: number;
  role_name?: string;
  employee_id?: number | null;
  employee?: EmployeeListItem | null;
  target_date?: ISODateTime;
  calls_target?: number;
  site_visits_target?: number;
  closed_deals_target?: number;
  form_schema_json?: FormSchemaField[] | null;
}

/** Daily report form schema field. */
export interface FormSchemaField {
  id: string;
  type: 'SHORT_TEXT' | 'LONG_TEXT' | 'COUNT' | 'CHECKLIST' | string;
  label: string;
  required?: boolean;
  targetValue?: number;
}

/** Daily report modal preset. */
export interface DailyReportPreset {
  id?: number;
  role_name?: string;
  form_schema_json?: FormSchemaField[];
  target_date?: ISODateTime;
}

/** Minimal Web Speech API recognition types (not in standard DOM lib). */
export interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

export interface SpeechRecognitionEventLike {
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

/** Login response data returned from the auth endpoint. */
export interface LoginResponseData {
  token?: string;
  employee?: EmployeeListItem;
  roles?: string[];
  permissions?: string[];
  requires_password_change?: boolean;
  error?: string;
  message?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: EmployeeListItem;
}

/** Project manager list item (subset of EmployeeListItem). */
export interface PmListItem {
  id: number;
  employee_code: string;
  full_name?: string | null;
  roles?: string[];
}

/** Verification log item used in property dossiers. */
export interface VerificationLogItem {
  id: number;
  from_status?: string | null;
  to_status?: string;
  notes?: string | null;
  actor?: { id: number; full_name?: string | null; employee_code?: string } | null;
  created_at?: ISODateTime;
}

/** Pending verification property list item. */
export interface PendingVerificationItem extends PropertyListItem {}

/** Notifications for the notification drawer. */
export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  link?: string;
  entity_type?: string;
  entity_id?: number;
  created_at: string;
}

/** Kiosk QR scan result. */
export interface ScanResult {
  employee?: { id: number; full_name?: string | null; employee_code?: string };
  type?: 'CHECK_IN' | 'CHECK_OUT' | string;
  status?: string;
  message?: string;
  time?: ISODateTime;
  duration?: number;
  employee_code?: string;
  name?: string;
  mode?: string;
  note?: string;
  signedToken?: string;
  token?: string;
  check_in_at?: ISODateTime;
}

/** Admin analytics dashboard metrics payload (GET /admin/system-metrics). */
export interface AdminAnalyticsData {
  databaseStatus?: string;
  apiStatus?: string;
  cacheStatus?: string;
  activeUsers?: number;
  totalRequests?: number;
  errorRate?: number;
  totalLeads?: number;
  totalProperties?: number;
  totalEmployees?: number;
  totalAuditEvents?: number;
}

/** Audit log entry (GET /admin/audit-logs). */
export interface AuditLogEntry {
  id: number;
  action?: string;
  entity_type?: string;
  entity_id?: number;
  actor_code?: string;
  actor_role?: string;
  actor_id?: number;
  old_value?: string;
  new_value?: string;
  created_at: ISODateTime;
}

/** Security anomaly entry (GET /admin/security-alerts). */
export interface SecurityAlertItem {
  id: number;
  action?: string;
  new_value?: string;
  actor_id?: number;
  created_at: ISODateTime;
}

/** MD executive metrics dashboard payload (GET /md/executive-metrics). */
export interface ExecMetricsData {
  totalLeadsCount?: number;
  totalClosedDeals?: number;
  siteVisitsScheduled?: number;
  totalPropertiesCount?: number;
  livePropertiesCount?: number;
  pendingVerificationPropertiesCount?: number;
  pendingApprovalPropertiesCount?: number;
  totalEmployeesCount?: number;
  attendanceExceptionsCount?: number;
  pendingLeaveRequestsCount?: number;
  newLeadsCount?: number;
  contactedLeadsCount?: number;
  qualifiedLeadsCount?: number;
  siteVisitsCompletedCount?: number;
  bookingInitiatedCount?: number;
  activeCustomersCount?: number;
  salesValue?: number;
  duePayments?: number;
  /** (totalClosedDeals / totalLeadsCount) * 100, rounded to 1 decimal; 0 when there are no leads. */
  leadConversionRate?: number;
}
export interface ProposalItem {
  id: number;
  employee_id: number;
  employee?: { id: number; full_name?: string | null; employee_code?: string } | null;
  type: string;
  leave_type?: string | null;
  target_date: ISODateTime;
  reason: string;
  status: string;
  reviewed_by?: number | null;
  reviewed_at?: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  monthlyStats?: {
    lates: number;
    approvedLates: number;
    halfDaysTaken: number;
    halfDaysRejected: number;
    leavesTaken: number;
    leavesRejected: number;
  };
}

/** Browser beforeinstallprompt event payload. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** A single point on the performance score timeline. */
export interface PerformanceEvent {
  id?: number;
  label?: string;
  date?: ISODateTime;
  score?: number;
  change?: number;
  metric?: string;
  details?: string | null;
  points?: number;
  title?: string;
  description?: string;
  timestamp?: ISODateTime;
}

/** Response payload for the performance score widget. */
export interface PerformanceScoreResponse {
  employee_id?: number;
  score?: number;
  snapshot_date?: ISODateTime;
  tasks_completed?: number;
  on_time_logins?: number;
  late_logins?: number;
  sub_target_reports?: number;
  uninformed_absences?: number;
  trend?: PerformanceEvent[];
  breakdown?: {
    baseScore?: number;
    taskBoost?: number;
    reportBoost?: number;
    presentBoost?: number;
    propertyBookingBoost?: number;
    targetExceededBoost?: number;
    completedAllWorkBoost?: number;
    latePenalty?: number;
    halfDayPenalty?: number;
    belowTargetPenalty?: number;
    overduePenalty?: number;
    uninformedAbsentPenalty?: number;
    midnightAutoCheckoutPenalty?: number;
    missingDailyReportPenalty?: number;
    tier?: 'DANGER' | 'SATISFACTORY' | 'SAFE' | 'EXCELLENT';
    tierBoostMultiplier?: number;
    tierPenaltyMultiplier?: number;
    tierBoostBonus?: number;
    tierPenaltyExtra?: number;
    manualAdjustmentsTotal?: number;
    manualAdjustmentsCount?: number;
  } | null;
}
