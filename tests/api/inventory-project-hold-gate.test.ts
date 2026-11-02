import { assertClaimable, LockedInventory } from '../../apps/api/src/services/inventory/reference';

// Item #15 from the user's manual QA pass: putting a project ON_HOLD must
// block NEW bookings against its inventory (Property or ProjectUnit) without
// touching anything already locked/booked — assertClaimable is the single
// choke point every booking creation path (BookingService.claimAndCreate,
// its hold-expiry variant) runs through before claiming a lock, so this
// tests it directly rather than through the full booking HTTP flow.
describe('Item #15 — a held project blocks new bookings at the claim step', () => {
  const now = new Date('2026-09-12T10:00:00Z');

  const baseUnit: LockedInventory = {
    ref: { kind: 'UNIT', id: 1 },
    id: 1,
    company_id: 1,
    state: 'AVAILABLE',
    locked_until: null,
    label: 'Unit',
    project_status: null,
    // A unit is only claimable in an MD-approved project (2026-11-02).
    project_verification: 'VERIFIED',
  };

  const baseProperty: LockedInventory = {
    ref: { kind: 'PROPERTY', id: 1 },
    id: 1,
    company_id: 1,
    state: 'LIVE',
    locked_until: null,
    label: 'Property',
    project_status: null,
  };

  it('a sellable ProjectUnit under an ON_HOLD project is rejected, not claimed', () => {
    expect(() => assertClaimable({ ...baseUnit, project_status: 'ON_HOLD' }, now)).toThrow(
      /on hold/i,
    );
  });

  it('a sellable Property under an ON_HOLD project is rejected too — the gate is not unit-only', () => {
    expect(() => assertClaimable({ ...baseProperty, project_status: 'ON_HOLD' }, now)).toThrow(
      /on hold/i,
    );
  });

  it('the same otherwise-sellable unit is claimable once the project is not ON_HOLD', () => {
    expect(() =>
      assertClaimable({ ...baseUnit, project_status: 'UNDER_CONSTRUCTION' }, now),
    ).not.toThrow();
  });

  it('a standalone Property with no project (project_status null) is unaffected by the gate', () => {
    expect(() => assertClaimable({ ...baseProperty, project_status: null }, now)).not.toThrow();
  });

  it('the hold gate is checked before the normal sellable-state checks (fails fast with the hold reason)', () => {
    // Even an already-booked unit under a held project should surface the
    // hold reason first — both are legitimate 409s, but the hold message is
    // the more actionable one for a caller deciding whether to retry later.
    expect(() =>
      assertClaimable({ ...baseUnit, state: 'BOOKED', project_status: 'ON_HOLD' }, now),
    ).toThrow(/on hold/i);
  });
});
