import { z } from 'zod';
import { blankAsAbsent } from './zodHelpers';

// Lead Constants & Schemas
export const LeadStatus = {
  NEW: 'NEW',
  ASSIGNED: 'ASSIGNED',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  DEMO_SCHEDULED: 'DEMO_SCHEDULED',
  DEMO_COMPLETED: 'DEMO_COMPLETED',
  SITE_VISIT_SCHEDULED: 'SITE_VISIT_SCHEDULED',
  SITE_VISIT_COMPLETED: 'SITE_VISIT_COMPLETED',
  NEGOTIATION: 'NEGOTIATION',
  BOOKING_INITIATED: 'BOOKING_INITIATED',
  BOOKED: 'BOOKED',
  DROPPED: 'DROPPED',
  RECOVERED_TO_POOL: 'RECOVERED_TO_POOL',
} as const;

export type LeadStatusType = (typeof LeadStatus)[keyof typeof LeadStatus];

// Mirrors the Prisma `LeadExitReason` enum (schema.prisma) — kept as a
// runtime const + label map so the frontend dropdown and this validation
// schema can never drift silently out of sync with each other.
export const LeadExitReason = {
  NO_MATCHING_INVENTORY: 'NO_MATCHING_INVENTORY',
  CHOSE_COMPETITOR: 'CHOSE_COMPETITOR',
  BUDGET_MISMATCH: 'BUDGET_MISMATCH',
  NOT_READY: 'NOT_READY',
  DO_NOT_CONTACT: 'DO_NOT_CONTACT',
  UNRESPONSIVE: 'UNRESPONSIVE',
  INVALID_CONTACT: 'INVALID_CONTACT',
  DUPLICATE_LEAD: 'DUPLICATE_LEAD',
  FINANCING_ISSUE: 'FINANCING_ISSUE',
  LOCATION_MISMATCH: 'LOCATION_MISMATCH',
  ALREADY_PURCHASED: 'ALREADY_PURCHASED',
  JUST_ENQUIRING: 'JUST_ENQUIRING',
  SITE_VISIT_NO_SHOW: 'SITE_VISIT_NO_SHOW',
  NEGOTIATION_FAILED: 'NEGOTIATION_FAILED',
  OUT_OF_SERVICE_AREA: 'OUT_OF_SERVICE_AREA',
  OTHER: 'OTHER',
  MARKETING_CALL: 'MARKETING_CALL',
  BROKER_OR_AGENT: 'BROKER_OR_AGENT',
} as const;

export type LeadExitReasonType = (typeof LeadExitReason)[keyof typeof LeadExitReason];

export const LEAD_EXIT_REASON_VALUES = Object.values(LeadExitReason) as [string, ...string[]];

export const LEAD_EXIT_REASON_LABELS: Record<LeadExitReasonType, string> = {
  NO_MATCHING_INVENTORY: 'No matching property available',
  CHOSE_COMPETITOR: 'Chose a competitor / another builder',
  BUDGET_MISMATCH: "Budget doesn't match available options",
  NOT_READY: 'Not ready to buy right now',
  DO_NOT_CONTACT: 'Requested not to be contacted',
  UNRESPONSIVE: 'Not responding to calls or messages',
  INVALID_CONTACT: 'Wrong number / invalid contact',
  DUPLICATE_LEAD: 'Duplicate of an existing lead',
  FINANCING_ISSUE: 'Home loan / financing fell through',
  LOCATION_MISMATCH: 'Preferred location not available',
  ALREADY_PURCHASED: 'Already purchased elsewhere',
  JUST_ENQUIRING: 'Casual enquiry, no purchase intent',
  SITE_VISIT_NO_SHOW: 'Missed scheduled site visit(s)',
  NEGOTIATION_FAILED: 'Could not agree on price or terms',
  OUT_OF_SERVICE_AREA: 'Out of station / unable to visit',
  OTHER: 'Other (please specify)',
  MARKETING_CALL: 'Marketing / promotional call, not a real enquiry',
  BROKER_OR_AGENT: 'Broker / agent, not a buyer',
};

// ---------------------------------------------------------------------------
// Call reasons: WHY a call ended as "not interested" or "wrong number".
// Stored in its own column (LeadActivity.call_reason) instead of inside the
// note text, so reports can count them. Each maps to the exit reason used if
// the telecaller also drops the lead.
// ---------------------------------------------------------------------------
export const CallReason = {
  MARKETING_CALL: 'MARKETING_CALL',
  ALREADY_BOUGHT: 'ALREADY_BOUGHT',
  NOT_NOW: 'NOT_NOW',
  BUDGET_LOW: 'BUDGET_LOW',
  LOCATION_NOT_SUITABLE: 'LOCATION_NOT_SUITABLE',
  BROKER_OR_AGENT: 'BROKER_OR_AGENT',
  COMPETITOR: 'COMPETITOR',
  LOAN_PROBLEM: 'LOAN_PROBLEM',
  FAMILY_DECISION: 'FAMILY_DECISION',
  OUT_OF_STATION: 'OUT_OF_STATION',
  LANGUAGE_PROBLEM: 'LANGUAGE_PROBLEM',
  DO_NOT_CALL_AGAIN: 'DO_NOT_CALL_AGAIN',
  WRONG_PERSON: 'WRONG_PERSON',
  NOT_IN_SERVICE: 'NOT_IN_SERVICE',
} as const;

export type CallReasonType = (typeof CallReason)[keyof typeof CallReason];

export const CALL_REASON_VALUES = Object.values(CallReason) as [string, ...string[]];

export const CALL_REASON_LABELS: Record<CallReasonType, string> = {
  MARKETING_CALL: 'Thought it was a marketing / spam call',
  ALREADY_BOUGHT: 'Already bought elsewhere',
  NOT_NOW: 'Not looking right now',
  BUDGET_LOW: 'Budget too low',
  LOCATION_NOT_SUITABLE: 'Location not suitable',
  BROKER_OR_AGENT: 'Broker / agent, not a buyer',
  COMPETITOR: 'Dealing with a competitor',
  LOAN_PROBLEM: 'Loan problem',
  FAMILY_DECISION: 'Family decision pending',
  OUT_OF_STATION: 'Out of station',
  LANGUAGE_PROBLEM: 'Language problem',
  DO_NOT_CALL_AGAIN: 'Asked not to be called again',
  WRONG_PERSON: 'Number belongs to someone else',
  NOT_IN_SERVICE: 'Number not in service',
};

/** Which reasons can be given for which call outcome. */
export const CALL_REASONS_BY_OUTCOME: Record<string, CallReasonType[]> = {
  CONNECTED_NOT_INTERESTED: [
    'MARKETING_CALL',
    'ALREADY_BOUGHT',
    'NOT_NOW',
    'BUDGET_LOW',
    'LOCATION_NOT_SUITABLE',
    'BROKER_OR_AGENT',
    'COMPETITOR',
    'LOAN_PROBLEM',
    'FAMILY_DECISION',
    'OUT_OF_STATION',
    'LANGUAGE_PROBLEM',
    'DO_NOT_CALL_AGAIN',
  ],
  WRONG_NUMBER: ['WRONG_PERSON', 'NOT_IN_SERVICE'],
};

/** The exit reason used when a call reason leads to dropping the lead. */
export const CALL_REASON_EXIT_REASON: Record<
  CallReasonType,
  { exit_reason: LeadExitReasonType; detail?: string }
> = {
  MARKETING_CALL: { exit_reason: 'MARKETING_CALL' },
  ALREADY_BOUGHT: { exit_reason: 'ALREADY_PURCHASED' },
  NOT_NOW: { exit_reason: 'NOT_READY' },
  BUDGET_LOW: { exit_reason: 'BUDGET_MISMATCH' },
  LOCATION_NOT_SUITABLE: { exit_reason: 'LOCATION_MISMATCH' },
  BROKER_OR_AGENT: { exit_reason: 'BROKER_OR_AGENT' },
  COMPETITOR: { exit_reason: 'CHOSE_COMPETITOR' },
  LOAN_PROBLEM: { exit_reason: 'FINANCING_ISSUE' },
  FAMILY_DECISION: { exit_reason: 'NOT_READY' },
  OUT_OF_STATION: { exit_reason: 'OUT_OF_SERVICE_AREA' },
  LANGUAGE_PROBLEM: { exit_reason: 'OTHER', detail: 'Language problem' },
  DO_NOT_CALL_AGAIN: { exit_reason: 'DO_NOT_CONTACT' },
  WRONG_PERSON: { exit_reason: 'INVALID_CONTACT' },
  NOT_IN_SERVICE: { exit_reason: 'INVALID_CONTACT' },
};

export const LeadSource = {
  MANUAL_ENTRY: 'MANUAL_ENTRY',
  BULK_UPLOAD: 'BULK_UPLOAD',
  WEBSITE: 'WEBSITE',
  FACEBOOK_ADS: 'FACEBOOK_ADS',
  GOOGLE_ADS: 'GOOGLE_ADS',
  WALK_IN: 'WALK_IN',
  REFERRAL: 'REFERRAL',
  HOUSING_COM: 'HOUSING_COM',
  OTHER: 'OTHER',
} as const;

// Sources a person can pick for a bulk upload (the file's own column is the fallback).
export const LEAD_UPLOAD_SOURCES = [
  'HOUSING_COM',
  'FACEBOOK_ADS',
  'GOOGLE_ADS',
  'WEBSITE',
  'WALK_IN',
  'REFERRAL',
  'OTHER',
] as const;

export const LeadCreateSchema = z.object({
  customer_name: z.string().min(2, 'Customer name is required'),
  ownership_type: z.enum(['POOL', 'DIRECT']).default('POOL'),
  introduced_by_id: z.number().int().optional().nullable(),
  phone: z.string().min(10, 'Valid phone number is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  source: z.string().default('MANUAL_ENTRY'),
  property_type_preference: z.string().optional(),
  budget_min: z.number().optional().nullable(),
  budget_max: z.number().optional().nullable(),
  preferred_location: z.string().optional(),
  // Full multi-location list (§ Phase 2) — when provided, the first entry
  // becomes the `preferred_location` scalar server-side; `preferred_location`
  // above stays accepted on its own for backward compatibility.
  preferred_locations: z.array(z.string().trim().min(1)).max(10).optional(),
  notes: z.string().optional(),
  campaign: z.string().optional().nullable(),
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
  referral_person_name: z.string().optional().nullable(),
  referral_employee_id: z.number().optional().nullable(),
  // Channel Partner Manager leads originate from an external agent working
  // for a partner company, not an internal employee -- optional everywhere
  // else, only ever populated on CPM-created leads.
  external_agent_name: z.string().optional().nullable(),
  external_agent_phone: z.string().optional().nullable(),
  external_agent_associate_id: z.string().optional().nullable(),
  external_agent_company: z.string().optional().nullable(),
  // Channel Partner Manager keeping the lead ("Me") can add it at the stage
  // it has already reached, with that stage's details (services/lead/stage.ts).
  initial_stage: z
    .enum([
      'ASSIGNED',
      'CONTACTED',
      'QUALIFIED',
      'SITE_VISIT_SCHEDULED',
      'SITE_VISIT_COMPLETED',
      'NEGOTIATION',
    ])
    .optional(),
  stage_details: z
    .object({
      contacted_at: z.string().optional(),
      call_notes: z.string().max(1000).optional(),
      project_id: z.number().int().positive().optional(),
      visit_at: z.string().optional(),
      visit_handled_by_id: z.number().int().positive().optional(),
      visit_rating: z.enum(['HOT_INTERESTED', 'WARM', 'COLD', 'NOT_INTERESTED']).optional(),
      visit_feedback: z.string().max(2000).optional(),
      negotiation_notes: z.string().max(2000).optional(),
      // Expected deal value (rupees) -- required at Negotiation so an Opportunity can be created.
      expected_value: z.number().positive().optional(),
    })
    .optional(),
});

export type LeadCreateInput = z.infer<typeof LeadCreateSchema>;

// Website public lead intake — mirrors the fields the public API currently accepts.
// Intentionally narrower than the internal LeadCreateSchema (no source/campaign/UTM:
// source is forced to WEBSITE server-side).
export const PublicLeadCreateSchema = z.object({
  customer_name: z.string().min(2, 'Customer name is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  property_type_preference: z.string().optional(),
  preferred_location: z.string().optional(),
  preferred_locations: z.array(z.string().trim().min(1)).max(10).optional(),
  enquiry_type: z
    .enum(['appraisal', 'call', 'project', 'property', 'consultation', 'other'])
    .optional(),
  preferred_contact_time: z
    .enum(['immediate', 'business_hours', 'after_hours', 'anytime'])
    .optional(),
  property_ids: z.array(z.number().int().positive()).max(10).optional(),
  project_id: z.number().int().positive().optional().nullable(),
  budget_max: z.number().positive('Budget must be a positive number').optional().nullable(),
  notes: z.string().optional(),
});

export type PublicLeadCreateInput = z.infer<typeof PublicLeadCreateSchema>;

export const LeadStatusUpdateSchema = z
  .object({
    status: z.enum([
      'NEW',
      'ASSIGNED',
      'CONTACTED',
      'QUALIFIED',
      'DEMO_SCHEDULED',
      'DEMO_COMPLETED',
      'SITE_VISIT_SCHEDULED',
      'SITE_VISIT_COMPLETED',
      'NEGOTIATION',
      'BOOKING_INITIATED',
      'BOOKED',
      'DROPPED',
      'RECOVERED_TO_POOL',
    ]),
    notes: z.string().optional(),
    // §1 guard fields — required for specific transitions (enforced in service)
    // Was a loose z.string() — the drop-reason dropdown (Phase 2) needs this to
    // actually be validated against the real enum, not accept any string.
    exit_reason: z.enum(LEAD_EXIT_REASON_VALUES).optional(), // required when status -> DROPPED
    // Required (enforced below) only when exit_reason === 'OTHER'.
    exit_reason_detail: blankAsAbsent(z.string().trim().min(1).max(500).optional()),
    demo_scheduled_at: blankAsAbsent(z.string().datetime().optional()), // required when status -> DEMO_SCHEDULED
    demo_handler_id: z.number().int().positive().optional(), // required when status -> DEMO_SCHEDULED
    qualification: z
      .object({
        budget_min: z.number().nonnegative().optional(),
        budget_max: z.number().nonnegative().optional(),
        property_type_preference: z.string().optional(),
        preferred_location: z.string().optional(),
        preferred_locations: z.array(z.string().trim().min(1)).max(10).optional(),
      })
      .partial()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'DROPPED' && !data.exit_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exit_reason'],
        message: 'exit_reason is required when dropping a lead',
      });
    }
    if (data.exit_reason === 'OTHER' && !data.exit_reason_detail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exit_reason_detail'],
        message: 'Please specify the reason when "Other" is selected',
      });
    }
    // Demo handler assignment is now a required manual pick (PM/Agent/Sales
    // Manager/CPM, or MD self-assign) — the old automatic territory-fallback
    // chain in status.ts is gone, so this can no longer be silently filled in.
    if (data.status === 'DEMO_SCHEDULED' && !data.demo_handler_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['demo_handler_id'],
        message: 'Please select who will handle this demo',
      });
    }
  });

export type LeadStatusUpdateInput = z.infer<typeof LeadStatusUpdateSchema>;

export const LeadReassignSchema = z.object({
  assigned_to_id: z.number().int().positive('Assignee ID is required'),
  reason: z.string().min(3, 'Reassignment reason is required'),
});

export type LeadReassignInput = z.infer<typeof LeadReassignSchema>;

// Opportunity Schemas
export const OpportunityCreateSchema = z
  .object({
    lead_id: z.number().int().positive(),
    owner_id: z.number().int().positive().optional(),
    project_id: z.number().int().positive().optional(),
    // At most one of property_id / project_unit_id — an Opportunity is
    // allowed to have neither yet (target undecided), unlike a Booking.
    property_id: z.number().int().positive().optional(),
    project_unit_id: z.number().int().positive().optional(),
    expected_value: z.number().nonnegative().optional(),
    probability: z.number().min(0).max(100).optional(),
    budget_min: z.number().nonnegative().optional(),
    budget_max: z.number().nonnegative().optional(),
  })
  .refine((data) => !(data.property_id && data.project_unit_id), {
    message: 'Provide at most one of property_id or project_unit_id',
  });
export type OpportunityCreateInput = z.infer<typeof OpportunityCreateSchema>;

export const OpportunityUpdateSchema = z
  .object({
    expected_value: z.number().nonnegative().optional(),
    probability: z.number().min(0).max(100).optional(),
    stage: z.string().optional(),
    drop_reason: z.string().optional(),
    budget_min: z.number().nonnegative().optional(),
    budget_max: z.number().nonnegative().optional(),
    property_id: z.number().int().positive().optional(),
    project_unit_id: z.number().int().positive().optional(),
  })
  .refine((data) => !(data.property_id && data.project_unit_id), {
    message: 'Provide at most one of property_id or project_unit_id',
  });
export type OpportunityUpdateInput = z.infer<typeof OpportunityUpdateSchema>;
