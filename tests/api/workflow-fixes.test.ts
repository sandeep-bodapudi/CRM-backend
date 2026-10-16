import { LeadWorkflow } from '../../apps/api/src/workflows/lead.workflow';
import { SiteVisitWorkflow } from '../../apps/api/src/workflows/siteVisit.workflow';
import { dropReasonFromOutcomes } from '../../apps/api/src/services/siteVisit/shared';

const lead = new LeadWorkflow();
const sv = new SiteVisitWorkflow();
const actor: any = { employeeId: 1, roles: [], permissions: [] };
const can = (currentState: string, action: string, entity: any = {}) =>
  lead.canTransition({ domain: 'LEAD' as any, currentState, action, actor, entity });

describe('W2 - cancelled visits do not block or count', () => {
  it('lets a lead complete when the only other visit is CANCELLED', () => {
    const r = can('SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', {
      site_visits: [
        { id: 1, status: 'CANCELLED' },
        { id: 2, status: 'COMPLETED' },
      ],
    });
    expect(r.allowed).toBe(true);
  });
  it('still blocks while a live visit is open', () => {
    const r = can('SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', {
      site_visits: [
        { id: 1, status: 'COMPLETED' },
        { id: 2, status: 'ACCEPTED' },
      ],
    });
    expect(r.allowed).toBe(false);
  });
  it('a cancelled visit alone does not schedule or complete a lead', () => {
    const e = { site_visits: [{ id: 1, status: 'CANCELLED' }] };
    expect(can('QUALIFIED', 'SITE_VISIT_SCHEDULED', e).allowed).toBe(false);
    expect(can('SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', e).allowed).toBe(false);
  });
});

describe('W4 - a second visit after the first is completed', () => {
  it('allows SITE_VISIT_COMPLETED -> SITE_VISIT_SCHEDULED with a new open visit', () => {
    const r = can('SITE_VISIT_COMPLETED', 'SITE_VISIT_SCHEDULED', {
      site_visits: [
        { id: 1, status: 'COMPLETED' },
        { id: 2, status: 'REQUESTED' },
      ],
    });
    expect(r.allowed).toBe(true);
  });
  it('refuses it when every visit is already completed (no new visit booked)', () => {
    const r = can('SITE_VISIT_COMPLETED', 'SITE_VISIT_SCHEDULED', {
      site_visits: [{ id: 1, status: 'COMPLETED' }],
    });
    expect(r.allowed).toBe(false);
  });
});

describe('W1 - BOOKED can only be dropped by a booking cancellation', () => {
  it('refuses a manual drop of a BOOKED lead', () => {
    expect(can('BOOKED', 'DROPPED', { exit_reason: 'OTHER' }).allowed).toBe(false);
  });
  it('allows the drop when the booking was cancelled', () => {
    const r = can('BOOKED', 'DROPPED', { exit_reason: 'OTHER', booking_cancelled: true });
    expect(r.allowed).toBe(true);
  });
  it('allows the drop from BOOKING_INITIATED as before', () => {
    expect(can('BOOKING_INITIATED', 'DROPPED', { exit_reason: 'OTHER' }).allowed).toBe(true);
  });
  it('BOOKED still cannot go anywhere else', () => {
    expect(can('BOOKED', 'NEGOTIATION', { booking_cancelled: true }).allowed).toBe(false);
  });
});

describe('W5 - START from an unreconfirmed visit', () => {
  const t = (state: string, action: any) =>
    sv.canTransition({
      domain: 'SITE_VISIT' as any,
      currentState: state,
      action,
      actor,
      entity: {},
    });
  it('is allowed from ACCEPTED and PENDING_CUSTOMER_RECONFIRMATION', () => {
    expect(t('ACCEPTED', 'START').allowed).toBe(true);
    expect(t('PENDING_CUSTOMER_RECONFIRMATION', 'START').allowed).toBe(true);
  });
  it('is still not allowed from earlier states', () => {
    expect(t('PENDING_ACCEPTANCE', 'START').allowed).toBe(false);
    expect(t('REQUESTED', 'START').allowed).toBe(false);
  });
});

describe('W3 - drop reason comes from what the customer said', () => {
  it('maps price words to BUDGET_MISMATCH', () => {
    expect(dropReasonFromOutcomes(['price too high']).exit_reason).toBe('BUDGET_MISMATCH');
  });
  it('maps location words to LOCATION_MISMATCH', () => {
    expect(dropReasonFromOutcomes(['too far from office']).exit_reason).toBe('LOCATION_MISMATCH');
  });
  it('falls back to OTHER and keeps the text, never NO_MATCHING_INVENTORY', () => {
    const r = dropReasonFromOutcomes(['family said no']);
    expect(r.exit_reason).toBe('OTHER');
    expect(r.exit_reason_detail).toBe('family said no');
  });
  it('has a detail even when nothing was written', () => {
    expect(dropReasonFromOutcomes([null, '']).exit_reason_detail).toBeTruthy();
  });
});
