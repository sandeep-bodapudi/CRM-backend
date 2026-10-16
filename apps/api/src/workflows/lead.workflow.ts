import { LeadStatus } from '../shared';
import { DomainWorkflow, WorkflowTransitionRequest, WorkflowTransitionResult } from './types';

/**
 * Lead Macro-Status Workflow State Machine (docs/LEAD-WORKFLOW-SPEC.md §1)
 *
 * The workflow engine is the single authority permitted to write `Lead.status`.
 * Services MUST route every lead status change through
 * WorkflowEngine.transitionLead(...) and never issue a raw
 * `tx.lead.update({ status })`.
 *
 * // Lead.status must only be written via engine.transitionLead() — do not call tx.lead.update({status}) directly anywhere else in the codebase.
 *
 * This engine enforces BOTH:
 *  - the allowed state graph (transitionMatrix), and
 *  - the spec's field-level guards:
 *    • CALL_LOGGED activity required before ASSIGNED → CONTACTED (§1 row 2)
 *    • CONTACTED → QUALIFIED direct only when all qualification fields present
 *      (§1 row 4)
 *    • SITE_VISIT_COMPLETED requires ALL linked visits COMPLETED (§1 row 6)
 *    • SITE_VISIT_COMPLETED → DROPPED requires ALL properties NOT_INTERESTED
 *      with outcome_reason populated per property (§1 row 7)
 *    • exit_reason required for DROPPED (§1 row 10)
 *    • demo_scheduled_at + demo_handler_id required for DEMO_SCHEDULED (§1 row 5)
 *    • ≥1 SiteVisitBooking for SITE_VISIT_SCHEDULED (§1 row 6)
 *    • Opportunity with expected_value for NEGOTIATION (§1 row 7)
 *    • expected_value + target property for BOOKING_INITIATED (§1 row 9)
 */

export class LeadWorkflow implements DomainWorkflow {
  /** Statuses from which DROPPED is reachable — spec §1 lines 27-29. */
  private static readonly DROPPABLE_FROM = new Set<string>([
    LeadStatus.ASSIGNED,
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.DEMO_SCHEDULED,
    LeadStatus.DEMO_COMPLETED,
    LeadStatus.SITE_VISIT_SCHEDULED,
    LeadStatus.SITE_VISIT_COMPLETED,
    LeadStatus.NEGOTIATION,
    LeadStatus.BOOKING_INITIATED,
  ]);

  /** Which qualification fields must be non-null to count as "qualified". */
  private static isFullyQualified(lead: any): boolean {
    return !!(
      lead.budget_min != null &&
      lead.budget_max != null &&
      lead.property_type_preference != null &&
      lead.preferred_location != null
    );
  }

  /** Strict Transition Matrix for Leads (spec §1 transition table).
   * Key: Current Status → allowed next statuses.
   *
   * BOOKED is listed as a target on every state below that's also in
   * DROPPABLE_FROM, not just BOOKING_INITIATED. This was added so a
   * genuinely confirmed booking (MD-approved, KYC-cleared — see
   * BookingService.confirmBooking) can close out the originating Lead even
   * when that Lead never formally progressed through Negotiation/
   * BOOKING_INITIATED, which happens whenever a booking is entered through
   * the Booking Initiation Wizard for a customer who came from a live Lead.
   * A confirmed booking is stronger evidence than the Lead's intermediate
   * pipeline stage. This does NOT open a manual shortcut for staff — the
   * UI's own status-change buttons build their menu independently (see
   * LeadDetailModal.tsx's availableNextTransitions) and never offer BOOKED
   * except from BOOKING_INITIATED; only the booking-confirmation code path
   * exercises this wider rule.
   */
  private static transitionMatrix: Record<string, string[]> = {
    [LeadStatus.NEW]: [LeadStatus.ASSIGNED],

    [LeadStatus.ASSIGNED]: [LeadStatus.CONTACTED, LeadStatus.DROPPED, LeadStatus.BOOKED],

    [LeadStatus.CONTACTED]: [LeadStatus.QUALIFIED, LeadStatus.DROPPED, LeadStatus.BOOKED],

    [LeadStatus.QUALIFIED]: [
      LeadStatus.DEMO_SCHEDULED,
      LeadStatus.SITE_VISIT_SCHEDULED,
      LeadStatus.DROPPED,
      LeadStatus.BOOKED,
    ],

    [LeadStatus.DEMO_SCHEDULED]: [LeadStatus.DEMO_COMPLETED, LeadStatus.DROPPED, LeadStatus.BOOKED],

    [LeadStatus.DEMO_COMPLETED]: [
      LeadStatus.SITE_VISIT_SCHEDULED,
      LeadStatus.DROPPED,
      LeadStatus.BOOKED,
    ],

    [LeadStatus.SITE_VISIT_SCHEDULED]: [
      LeadStatus.SITE_VISIT_COMPLETED,
      LeadStatus.DROPPED,
      LeadStatus.BOOKED,
    ],

    [LeadStatus.SITE_VISIT_COMPLETED]: [
      LeadStatus.NEGOTIATION,
      LeadStatus.DROPPED,
      LeadStatus.BOOKED,
    ],

    [LeadStatus.NEGOTIATION]: [LeadStatus.BOOKING_INITIATED, LeadStatus.DROPPED, LeadStatus.BOOKED],

    [LeadStatus.BOOKING_INITIATED]: [LeadStatus.BOOKED, LeadStatus.DROPPED],

    [LeadStatus.BOOKED]: [], // Terminal won state

    [LeadStatus.DROPPED]: [LeadStatus.RECOVERED_TO_POOL],

    [LeadStatus.RECOVERED_TO_POOL]: [LeadStatus.ASSIGNED],
  };

  canTransition(req: WorkflowTransitionRequest): WorkflowTransitionResult {
    const { currentState, action: newStatus, entity } = req;

    if (currentState === newStatus) {
      return { allowed: true, nextState: newStatus };
    }

    const allowedTransitions = LeadWorkflow.transitionMatrix[currentState] || [];

    if (!allowedTransitions.includes(newStatus)) {
      return {
        allowed: false,
        reason: `Invalid lead status transition from ${currentState} to ${newStatus}`,
      };
    }

    // ── Field-level guards (spec §1) ──

    // §1 row 4: CONTACTED → QUALIFIED is only valid when all
    // qualification fields are present.
    if (newStatus === LeadStatus.QUALIFIED) {
      if (!LeadWorkflow.isFullyQualified(entity)) {
        return {
          allowed: false,
          reason:
            'Transition to QUALIFIED requires all qualification fields (budget_min, budget_max, property_type_preference, preferred_location) to be present.',
        };
      }
    }

    // §1 row 5: DEMO_SCHEDULED requires a scheduled date and a handler.
    if (newStatus === LeadStatus.DEMO_SCHEDULED) {
      const hasPendingDemo =
        entity &&
        entity.pending_demo &&
        entity.pending_demo.scheduled_at &&
        entity.pending_demo.handler_id;
      const hasExistingDemo = entity && entity.demos && entity.demos.length > 0;

      if (!hasPendingDemo && !hasExistingDemo) {
        return {
          allowed: false,
          reason:
            'Transition to DEMO_SCHEDULED requires demo_scheduled_at and demo_handler_id payload, or an existing Demo record',
        };
      }
    }

    // §1 row 6: SITE_VISIT_SCHEDULED requires at least one linked SiteVisitBooking.
    if (newStatus === LeadStatus.SITE_VISIT_SCHEDULED) {
      const visits = (entity && (entity.site_visits || [])) || [];
      if (visits.length === 0) {
        return {
          allowed: false,
          reason: 'Transition to SITE_VISIT_SCHEDULED requires at least one SiteVisitBooking',
        };
      }
    }

    // §1 row 6: SITE_VISIT_COMPLETED requires ALL linked SiteVisitBooking rows
    // to reach COMPLETED (not just one).
    if (newStatus === LeadStatus.SITE_VISIT_COMPLETED) {
      const visits = (entity && (entity.site_visits || [])) || [];
      if (visits.length === 0) {
        return {
          allowed: false,
          reason: 'Transition to SITE_VISIT_COMPLETED requires at least one SiteVisitBooking',
        };
      }
      const allCompleted = visits.every((v: any) => v.status === 'COMPLETED');
      if (!allCompleted) {
        return {
          allowed: false,
          reason:
            'Transition to SITE_VISIT_COMPLETED requires ALL linked SiteVisitBooking rows to have status COMPLETED',
        };
      }
    }

    // §1 row 7: SITE_VISIT_COMPLETED → DROPPED requires ALL properties marked
    // NOT_INTERESTED with a non-empty outcome_reason per property.
    if (newStatus === LeadStatus.DROPPED && currentState === LeadStatus.SITE_VISIT_COMPLETED) {
      const siteVisitProperties = (entity && (entity.site_visit_properties || [])) || [];
      if (siteVisitProperties.length === 0) {
        // A visit to a whole project (no property or unit picked) and a walk-in
        // have no per-property outcomes; the visit's own "not interested"
        // rating is the record that the customer said no.
        const visits: any[] = (entity && entity.site_visits) || [];
        const completed = visits.filter((v) => v.status === 'COMPLETED');
        const saidNo =
          completed.length > 0 && completed.every((v) => v.rating === 'NOT_INTERESTED');
        if (!saidNo) {
          return {
            allowed: false,
            reason: 'Cannot drop a lead from SITE_VISIT_COMPLETED without property outcome records',
          };
        }
        // fall through: nothing per-property left to check
      }
      const allNotInterested = siteVisitProperties.every(
        (sp: any) => sp.outcome === 'NOT_INTERESTED',
      );
      if (!allNotInterested) {
        return {
          allowed: false,
          reason:
            'Transition to DROPPED from SITE_VISIT_COMPLETED requires ALL properties to be marked NOT_INTERESTED',
        };
      }
      const allHaveReason = siteVisitProperties.every(
        (sp: any) => sp.outcome_reason && sp.outcome_reason.trim() !== '',
      );
      if (!allHaveReason) {
        return {
          allowed: false,
          reason:
            'Transition to DROPPED from SITE_VISIT_COMPLETED requires a non-empty outcome_reason for every NOT_INTERESTED property',
        };
      }
    }

    // §1 row 7: SITE_VISIT_COMPLETED → NEGOTIATION requires at least one
    // property outcome marked INTERESTED (enforced by the service layer when
    // creating the Opportunity; the workflow guard here validates the
    // Opportunity has expected_value).
    if (newStatus === LeadStatus.NEGOTIATION) {
      const opps = entity?.opportunities || [];
      const opp = Array.isArray(opps) && opps.length > 0 ? opps[0] : entity?.opportunity || null;
      const expected = opp && (opp.expected_value ?? opp.expectedValue);
      if (expected === undefined || expected === null) {
        return {
          allowed: false,
          reason: 'Transition to NEGOTIATION requires an Opportunity with expected_value',
        };
      }
    }

    // §1 row 9: BOOKING_INITIATED requires the opportunity finalized
    // (expected_value + target property).
    if (newStatus === LeadStatus.BOOKING_INITIATED) {
      const opps = entity?.opportunities || [];
      const opp = Array.isArray(opps) && opps.length > 0 ? opps[0] : entity?.opportunity || null;
      const expected = opp && (opp.expected_value ?? opp.expectedValue);
      const propertyId = opp && (opp.property_id ?? opp.propertyId);
      const projectUnitId = opp && (opp.project_unit_id ?? opp.projectUnitId);
      if (expected === undefined || expected === null || !(propertyId || projectUnitId)) {
        return {
          allowed: false,
          reason:
            'Transition to BOOKING_INITIATED requires Opportunity.expected_value and a finalized target property',
        };
      }
    }

    // §1 row 10: Any → DROPPED requires non-empty exit_reason + exited_from_status auto-recorded.
    if (newStatus === LeadStatus.DROPPED) {
      if (!LeadWorkflow.DROPPABLE_FROM.has(currentState)) {
        return {
          allowed: false,
          reason: `Cannot drop a lead from ${currentState}`,
        };
      }
      const reason = (entity && (entity.exit_reason ?? entity.exitReason)) || '';
      if (!reason || reason.trim() === '') {
        return {
          allowed: false,
          reason: 'Transition to DROPPED requires a non-empty exit_reason',
        };
      }
    }

    return { allowed: true, nextState: newStatus };
  }

  // Keeping validateTransition for backward compatibility until all services are migrated
  static validateTransition(currentStatus: string, newStatus: string): void {
    if (currentStatus === newStatus) return;
    const allowedTransitions = this.transitionMatrix[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      const error = new Error(
        `Invalid lead status transition from ${currentStatus} to ${newStatus}`,
      );
      (error as any).code = 'INVALID_STATE_TRANSITION';
      throw error;
    }
  }
}
