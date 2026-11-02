import { prisma } from '../../apps/api/src/lib/prisma';
import { ProjectUnitService } from '../../apps/api/src/services/projectUnit.service';
import { ProjectService } from '../../apps/api/src/services/project.service';
import { PricingRulesService } from '../../apps/api/src/services/pricing/rules.service';
import { PricingService } from '../../apps/api/src/services/pricing/pricing.service';
import { BookingService } from '../../apps/api/src/services/booking.service';
import { encryptData } from '../../apps/api/src/utils/crypto';
import { Roles, Permissions, ALL_PERMISSIONS } from '@rrh-ems/shared';
import { TokenPayload } from '../../apps/api/src/utils/jwt';

// Integration coverage for the ProjectUnit rebuild: real ProjectUnit rows
// (not Property rows with project_id set), priced by the server-side engine
// against real ProjectPricingRule rows, and wired into the booking lifecycle
// via services/inventory/reference.ts.
describe('ProjectUnit CRUD, pricing, and booking lifecycle', () => {
  const companyId = 1;
  const admin: TokenPayload = {
    employeeId: 999950,
    employeeCode: 'ADMIN-PU-1',
    companyId,
    branchId: null,
    // Includes MD alongside ADMIN: BookingService.confirmBooking is gated to
    // MD-only regardless of permission set (Phase 9 Packet 5, transaction
    // authority), which ALL_PERMISSIONS alone does not satisfy.
    roles: [Roles.ADMIN, Roles.MD],
    permissions: ALL_PERMISSIONS,
  };
  const projectId = 8880250;
  let ruleBaseId: number;
  let ruleEastId: number;
  let ruleCornerId: number;

  beforeAll(async () => {
    await prisma.employee.create({
      data: {
        id: admin.employeeId,
        employee_code: admin.employeeCode,
        company_id: companyId,
        password_hash: '',
        status: 'ACTIVE',
        full_name: 'Project Unit Test Admin',
      },
    });
    await prisma.project.create({
      data: {
        id: projectId,
        project_code: `TEST-PU-${Date.now()}`,
        company_id: companyId,
        name: 'Project Unit Pricing Test Project',
        // Units can only be booked once the project is MD-approved (2026-11-02).
        verification_status: 'VERIFIED',
        location: 'Test Location',
        slug: `test-pu-${Date.now()}`,
      },
    });

    const base = await PricingRulesService.createRule(admin, projectId, {
      label: 'Base Rate',
      kind: 'BASE_RATE',
      category: 'OTHER',
      calc_method: 'PER_SQYD',
      rate: 20000,
      area_basis: 'PLOT_AREA',
      // The project is approved (bookings need that), so price changes carry a reason.
      change_reason: 'Initial price list',
    });
    const east = await PricingRulesService.createRule(admin, projectId, {
      label: 'East Facing Premium',
      kind: 'PREMIUM',
      category: 'FACING',
      calc_method: 'PER_SQYD',
      rate: 1500,
      area_basis: 'PLOT_AREA',
      match_facing: 'EAST',
      change_reason: 'Initial price list',
    });
    const corner = await PricingRulesService.createRule(admin, projectId, {
      label: 'Corner Premium',
      kind: 'PREMIUM',
      category: 'CORNER',
      calc_method: 'PER_SQYD',
      rate: 2000,
      area_basis: 'PLOT_AREA',
      match_corner: true,
      change_reason: 'Initial price list',
    });
    ruleBaseId = base.id;
    ruleEastId = east.id;
    ruleCornerId = corner.id;
  });

  afterAll(async () => {
    await prisma.priceLine.deleteMany({ where: { project_unit: { project_id: projectId } } });
    await prisma.projectUnit.deleteMany({ where: { project_id: projectId } });
    await prisma.projectPricingRule.deleteMany({ where: { project_id: projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.employee.delete({ where: { id: admin.employeeId } });
  });

  it('1. Lists the rules just created', async () => {
    const rules = await PricingRulesService.listRules(admin, projectId);
    expect(rules.map((r) => r.label).sort()).toEqual(
      ['Base Rate', 'Corner Premium', 'East Facing Premium'].sort(),
    );
  });

  it('2. Creates a unit and prices it against the project rules (facing applies, corner does not)', async () => {
    const unit = await ProjectUnitService.createUnit(admin, projectId, {
      unit_number: 'P-001',
      unit_type: 'PLOT',
      plot_number: '1',
      plot_area_sqyd: 150,
      price_basis: 'PLOT_AREA',
      facing: 'EAST',
      is_corner: false,
    } as any);

    expect(unit.base_price).toBe(3000000); // 150 x 20,000
    expect(unit.calculated_price).toBe(3225000); // + 150 x 1,500 east premium, no corner
    expect(unit.final_price).toBe(3225000);
    expect(unit.sales_status).toBe('AVAILABLE');

    const fetched = await ProjectUnitService.getUnit(admin, unit.id);
    expect(fetched.price_lines.length).toBeGreaterThanOrEqual(2);
    expect(fetched.price_lines.some((l) => l.label === 'East Facing Premium')).toBe(true);
    expect(fetched.price_lines.some((l) => l.label === 'Corner Premium')).toBe(false);
  });

  it('3. A corner unit is priced differently from a non-corner unit with the same area', async () => {
    const corner = await ProjectUnitService.createUnit(admin, projectId, {
      unit_number: 'P-002',
      unit_type: 'PLOT',
      plot_area_sqyd: 150,
      price_basis: 'PLOT_AREA',
      facing: 'WEST',
      is_corner: true,
    } as any);
    // 150 x 20,000 base + 150 x 2,000 corner (no facing premium — WEST has no rule)
    expect(corner.calculated_price).toBe(3300000);
    expect(corner.calculated_price).not.toBe(3225000);
  });

  it('4. Lists units filtered by facing', async () => {
    const { units, total } = await ProjectUnitService.listUnits(
      admin,
      projectId,
      { facing: 'EAST' },
      50,
      0,
    );
    expect(total).toBe(1);
    expect(units[0].unit_number).toBe('P-001');
  });

  it('5. Updating a unit recomputes its price', async () => {
    const { units } = await ProjectUnitService.listUnits(
      admin,
      projectId,
      { search: 'P-001' },
      50,
      0,
    );
    const unit = units[0];
    const updated = await ProjectUnitService.updateUnit(admin, unit.id, { is_corner: true } as any);
    // Now both east + corner apply: 3,000,000 + 225,000 + 300,000
    expect(updated.calculated_price).toBe(3525000);
  });

  it('6. Manual status changes are restricted — RESERVED/BOOKED cannot be set by hand', async () => {
    const { units } = await ProjectUnitService.listUnits(
      admin,
      projectId,
      { search: 'P-002' },
      50,
      0,
    );
    const unit = units[0];
    await expect(ProjectUnitService.changeStatus(admin, unit.id, 'RESERVED')).rejects.toMatchObject(
      { status: 409 },
    );
    await expect(ProjectUnitService.changeStatus(admin, unit.id, 'SOLD')).rejects.toMatchObject({
      status: 409,
    });

    const held = await ProjectUnitService.changeStatus(admin, unit.id, 'HOLD', 'Walk-in customer');
    expect(held.sales_status).toBe('HOLD');
    await ProjectUnitService.changeStatus(admin, unit.id, 'AVAILABLE');
  });

  it('7. Price override preserves the calculated price and records who/why', async () => {
    const { units } = await ProjectUnitService.listUnits(
      admin,
      projectId,
      { search: 'P-002' },
      50,
      0,
    );
    const unit = units[0];
    const calculated = unit.calculated_price;

    const overridden = await ProjectUnitService.overridePrice(
      admin,
      unit.id,
      calculated + 50000,
      'Premium corner location',
    );
    expect(overridden.calculated_price).toBe(calculated); // untouched
    expect(overridden.final_price).toBe(calculated + 50000);
    expect(overridden.override_reason).toBe('Premium corner location');

    const cleared = await ProjectUnitService.overridePrice(
      admin,
      unit.id,
      null,
      'Back to list price',
    );
    expect(cleared.final_price).toBe(calculated);
    expect(cleared.override_price).toBeNull();

    const audits = await prisma.auditEvent.findMany({
      where: { entity_type: 'PROJECT_UNIT', entity_id: unit.id, action: 'PRICE_OVERRIDE' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it('8. Preview computes a price without creating anything', async () => {
    const preview = await PricingService.previewForProject(admin, projectId, {
      unit_type: 'PLOT',
      plot_area_sqyd: 200,
      price_basis: 'PLOT_AREA',
      facing: 'EAST',
      is_corner: true,
    } as any);
    expect(preview.calculated_price).toBe(200 * 20000 + 200 * 1500 + 200 * 2000);
    const countBefore = await prisma.projectUnit.count({ where: { project_id: projectId } });
    expect(countBefore).toBe(2); // preview created nothing
  });

  it('9. Bulk-generates units where each row prices independently on its own facing/corner', async () => {
    const result = await ProjectUnitService.bulkCreateUnits(admin, projectId, {
      common: { unit_type: 'PLOT', price_basis: 'PLOT_AREA', plot_area_sqyd: 100 } as any,
      units: [
        { unit_number: 'P-101', facing: 'EAST', is_corner: false } as any,
        { unit_number: 'P-102', facing: 'EAST', is_corner: true } as any,
        { unit_number: 'P-103', facing: 'NORTH', is_corner: false } as any,
      ],
    });
    expect(result.created).toBe(3);
    expect(result.failed).toHaveLength(0);

    const rows = await prisma.projectUnit.findMany({
      where: { id: { in: result.created_ids } },
      orderBy: { unit_number: 'asc' },
    });
    const byNumber = Object.fromEntries(rows.map((r) => [r.unit_number, r.calculated_price]));
    expect(byNumber['P-101']).toBe(100 * 20000 + 100 * 1500); // east only
    expect(byNumber['P-102']).toBe(100 * 20000 + 100 * 1500 + 100 * 2000); // east + corner
    expect(byNumber['P-103']).toBe(100 * 20000); // no matching premium
    // Confirms the literal ask this rebuild was for: units differ by facing/corner charges.
    expect(byNumber['P-101']).not.toBe(byNumber['P-102']);
    expect(byNumber['P-103']).not.toBe(byNumber['P-101']);
  });

  it('10. Inventory summary is a live aggregate, never a stored number', async () => {
    const summary = await ProjectUnitService.getInventorySummary(admin, projectId);
    expect(summary.total_units).toBe(5); // P-001, P-002, P-101, P-102, P-103
    expect(summary.by_status.AVAILABLE).toBe(5);
    expect(summary.by_unit_type.PLOT).toBe(5);
  });

  it('11. Deactivating a rule stops it applying to future creates without touching past PriceLine rows', async () => {
    await PricingRulesService.deleteRule(admin, projectId, ruleEastId, 'East premium withdrawn');
    const created = await ProjectUnitService.createUnit(admin, projectId, {
      unit_number: 'P-201',
      unit_type: 'PLOT',
      plot_area_sqyd: 100,
      price_basis: 'PLOT_AREA',
      facing: 'EAST',
    } as any);
    expect(created.calculated_price).toBe(100 * 20000); // east premium no longer applies

    const { units } = await ProjectUnitService.listUnits(
      admin,
      projectId,
      { search: 'P-001' },
      50,
      0,
    );
    const oldUnit = await ProjectUnitService.getUnit(admin, units[0].id);
    expect(oldUnit.price_lines.some((l) => l.label === 'East Facing Premium')).toBe(true); // preserved
  });

  it('12. Recalculate-preview reports the diff after a rule changes, without writing anything', async () => {
    await PricingRulesService.updateRule(admin, projectId, ruleCornerId, {
      rate: 5000,
      change_reason: 'Corner premium raised',
    });
    const preview = await PricingService.previewRecalculateProject(admin, projectId);
    expect(preview.changed_count).toBeGreaterThan(0);
    const p002 = preview.changes.find((c) => c.unit_number === 'P-002');
    expect(p002).toBeTruthy();
    expect(p002!.new_final_price).toBeGreaterThan(p002!.old_final_price);

    const unchanged = await prisma.projectUnit.findFirst({
      where: { project_id: projectId, unit_number: 'P-002' },
    });
    expect(unchanged!.calculated_price).not.toBe(p002!.new_calculated_price); // not yet applied
  });

  it('13. Applying the recalculation persists the new prices for every unit', async () => {
    await PricingService.applyRecalculateProject(admin, projectId);
    const p002 = await prisma.projectUnit.findFirst({
      where: { project_id: projectId, unit_number: 'P-002' },
    });
    // 100,000 (base+east, east now deactivated so just base=3,000,000) + 150 x 5,000 corner
    expect(p002!.calculated_price).toBe(150 * 20000 + 150 * 5000);
  });

  it('14. Deleting a unit is blocked once it has booking history, allowed otherwise', async () => {
    const disposable = await ProjectUnitService.createUnit(admin, projectId, {
      unit_number: 'P-DELETE-ME',
      unit_type: 'PLOT',
      plot_area_sqyd: 50,
      price_basis: 'PLOT_AREA',
    } as any);
    const result = await ProjectUnitService.deleteUnit(admin, disposable.id);
    expect(result.deleted).toBe(true);
    await expect(
      prisma.projectUnit.findUniqueOrThrow({ where: { id: disposable.id } }),
    ).rejects.toBeTruthy();
  });

  describe('booking lifecycle against a real ProjectUnit', () => {
    let unitId: number;
    let customerId: number;
    let bookingId: number;

    beforeAll(async () => {
      const unit = await ProjectUnitService.createUnit(admin, projectId, {
        unit_number: 'P-BOOKING-TEST',
        unit_type: 'PLOT',
        plot_area_sqyd: 120,
        price_basis: 'PLOT_AREA',
      } as any);
      unitId = unit.id;

      const customer = await prisma.customer.create({
        data: {
          customer_code: `TEST-PU-CUST-${Date.now()}`,
          company_id: companyId,
          first_name: 'Test',
          last_name: 'Buyer',
          phone: `9${Date.now().toString().slice(-9)}`,
        },
      });
      customerId = customer.id;
    });

    afterAll(async () => {
      await prisma.booking.deleteMany({ where: { project_unit_id: unitId } });
      await prisma.customer.delete({ where: { id: customerId } });
    });

    it('15. Creating a booking against a unit reserves it and claims the lock', async () => {
      const before = await prisma.projectUnit.findUniqueOrThrow({ where: { id: unitId } });
      expect(before.sales_status).toBe('AVAILABLE');

      const booking = await BookingService.createBooking(admin, {
        customer_id: customerId,
        project_unit_id: unitId,
        agreed_price: before.final_price,
        booking_amount: 100000,
      } as any);
      bookingId = booking.id;

      const after = await prisma.projectUnit.findUniqueOrThrow({ where: { id: unitId } });
      expect(after.sales_status).toBe('RESERVED');
      expect(after.locked_by_booking_id).toBe(booking.id);
      expect(after.locked_until).not.toBeNull();
    });

    it('16. A second booking attempt on the same reserved unit is rejected', async () => {
      await expect(
        BookingService.createBooking(admin, {
          customer_id: customerId,
          project_unit_id: unitId,
          agreed_price: 1000000,
          booking_amount: 50000,
        } as any),
      ).rejects.toThrow();
    });

    it('17. Confirming the booking moves the unit to BOOKED', async () => {
      // confirmBooking requires KYC; pan_number/aadhaar_number are encrypted at
      // rest (AES-256-GCM), so they must be written through encryptData rather
      // than as plaintext.
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          pan_number: encryptData('ABCDE1234F'),
          aadhaar_number: encryptData('123412341234'),
        },
      });

      await BookingService.confirmBooking(admin, bookingId);
      const unit = await prisma.projectUnit.findUniqueOrThrow({ where: { id: unitId } });
      expect(unit.sales_status).toBe('BOOKED');
    });

    it('18. Cancelling releases the lock back to AVAILABLE, atomically with the booking status', async () => {
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (booking.status === 'CANCELLED') return; // already covered by a prior failure path

      await BookingService.cancelBooking(admin, bookingId);
      const unit = await prisma.projectUnit.findUniqueOrThrow({ where: { id: unitId } });
      expect(unit.sales_status).toBe('AVAILABLE');
      expect(unit.locked_by_booking_id).toBeNull();
      expect(unit.locked_until).toBeNull();

      const cancelled = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(cancelled.status).toBe('CANCELLED');
    });
  });

  // Item #15 — end-to-end: putting the parent project ON_HOLD must block a
  // brand-new booking attempt against a real, otherwise-available unit,
  // through the actual BookingService.createBooking path (not just the pure
  // assertClaimable unit test in inventory-project-hold-gate.test.ts).
  describe('a held project blocks new bookings end-to-end', () => {
    let heldUnitId: number;
    let heldCustomerId: number;

    beforeAll(async () => {
      const unit = await ProjectUnitService.createUnit(admin, projectId, {
        unit_number: 'P-HOLD-TEST',
        unit_type: 'PLOT',
        plot_area_sqyd: 100,
        price_basis: 'PLOT_AREA',
      } as any);
      heldUnitId = unit.id;

      const customer = await prisma.customer.create({
        data: {
          customer_code: `TEST-PU-HOLD-CUST-${Date.now()}`,
          company_id: companyId,
          first_name: 'Held',
          last_name: 'Buyer',
          phone: `9${Date.now().toString().slice(-9)}`,
        },
      });
      heldCustomerId = customer.id;

      await prisma.project.update({ where: { id: projectId }, data: { status: 'ON_HOLD' } });
    });

    afterAll(async () => {
      await prisma.project.update({ where: { id: projectId }, data: { status: 'PLANNING' } });
      await prisma.booking.deleteMany({ where: { project_unit_id: heldUnitId } });
      await prisma.customer.delete({ where: { id: heldCustomerId } });
    });

    it('19. A new booking against an AVAILABLE unit is rejected while its project is ON_HOLD', async () => {
      const before = await prisma.projectUnit.findUniqueOrThrow({ where: { id: heldUnitId } });
      expect(before.sales_status).toBe('AVAILABLE');

      await expect(
        BookingService.createBooking(admin, {
          customer_id: heldCustomerId,
          project_unit_id: heldUnitId,
          agreed_price: before.final_price,
          booking_amount: 50000,
        } as any),
      ).rejects.toThrow(/on hold/i);

      const after = await prisma.projectUnit.findUniqueOrThrow({ where: { id: heldUnitId } });
      expect(after.sales_status).toBe('AVAILABLE'); // untouched — no partial lock left behind
    });

    it('20. The same unit becomes bookable again once the project resumes', async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'UNDER_CONSTRUCTION' },
      });
      const before = await prisma.projectUnit.findUniqueOrThrow({ where: { id: heldUnitId } });

      const booking = await BookingService.createBooking(admin, {
        customer_id: heldCustomerId,
        project_unit_id: heldUnitId,
        agreed_price: before.final_price,
        booking_amount: 50000,
      } as any);
      expect(booking.id).toBeGreaterThan(0);

      const after = await prisma.projectUnit.findUniqueOrThrow({ where: { id: heldUnitId } });
      expect(after.sales_status).toBe('RESERVED');
    });
  });

  it('21. listing_type (NEW/RESALE) round-trips through create and update', async () => {
    const unit = await ProjectUnitService.createUnit(admin, projectId, {
      unit_number: 'P-LISTING-TYPE',
      unit_type: 'PLOT',
      plot_area_sqyd: 80,
      price_basis: 'PLOT_AREA',
      listing_type: 'RESALE',
    } as any);
    expect(unit.listing_type).toBe('RESALE');

    const updated = await ProjectUnitService.updateUnit(admin, unit.id, {
      listing_type: 'NEW',
    } as any);
    expect(updated.listing_type).toBe('NEW');
  });

  it('22. approval_authorities (multi-value) round-trips on the project through updateProject', async () => {
    const updated = await ProjectService.updateProject(admin, projectId, {
      approval_authorities: ['HMDA', 'GHMC', 'CUSTOM AUTHORITY'],
    } as any);
    expect(updated.approval_authorities).toEqual(['HMDA', 'GHMC', 'CUSTOM AUTHORITY']);
  });
});
