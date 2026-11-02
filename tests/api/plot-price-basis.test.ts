import { prisma } from '../../apps/api/src/lib/prisma';
import { ProjectUnitService } from '../../apps/api/src/services/projectUnit.service';
import { ProjectService } from '../../apps/api/src/services/project.service';
import { PricingRulesService } from '../../apps/api/src/services/pricing/rules.service';
import { PricingService } from '../../apps/api/src/services/pricing/pricing.service';
import { computePrice } from '../../apps/api/src/services/pricing/engine';
import { buildProjectScope } from '../../apps/api/src/authz/dataScope';
import {
  defaultPriceBasisForUnitType,
  resolveUnitPriceBasis,
} from '../../apps/api/src/shared/measurement';
import { Roles, ALL_PERMISSIONS } from '@rrh-ems/shared';
import { TokenPayload } from '../../apps/api/src/utils/jwt';

// Owner's decisions 2026-11-02: plots are priced per Sq.Yd of plot area, flats
// on super built-up area only, no GST on plots; a project in review is locked
// for its PM and visible only to who added it, its reviewers, Admin and MD.
//
// Regression it started from: the wizard saved default_price_basis =
// SUPER_BUILT_UP and rules with no area_basis, so a 150 Sq.Yd plot priced at
// "₹15,000 / Sq.Yd" came out as 0.
describe('unit-type pricing and project review rules', () => {
  const companyId = 1;
  const admin: TokenPayload = {
    employeeId: 999960,
    employeeCode: 'ADMIN-PB-1',
    companyId,
    branchId: null,
    roles: [Roles.ADMIN],
    permissions: ALL_PERMISSIONS,
  };
  const pm: TokenPayload = {
    employeeId: 999961,
    employeeCode: 'PM-PB-1',
    companyId,
    branchId: null,
    roles: [Roles.PROJECT_MANAGER],
    permissions: ALL_PERMISSIONS,
  };
  const projectId = 8880260;

  // Also run first, so a run that died half-way doesn't block the next one.
  async function cleanUp() {
    await prisma.priceLine.deleteMany({ where: { project_unit: { project_id: projectId } } });
    await prisma.projectUnit.deleteMany({ where: { project_id: projectId } });
    await prisma.projectPricingRule.deleteMany({ where: { project_id: projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.employee.deleteMany({
      where: { id: { in: [admin.employeeId, pm.employeeId] } },
    });
  }

  beforeAll(async () => {
    await cleanUp();
    for (const u of [admin, pm]) {
      await prisma.employee.create({
        data: {
          id: u.employeeId,
          employee_code: u.employeeCode,
          company_id: companyId,
          password_hash: '',
          status: 'ACTIVE',
          full_name: `Plot Basis Test ${u.employeeCode}`,
        },
      });
    }
    await prisma.project.create({
      data: {
        id: projectId,
        project_code: `TEST-PB-${Date.now()}`,
        company_id: companyId,
        name: 'Plot Basis Test Project',
        location: 'Test Location',
        slug: `test-pb-${Date.now()}`,
        default_price_basis: 'SUPER_BUILT_UP',
        assigned_pm_id: pm.employeeId,
      },
    });
    // As the wizard's rule form saves them: no area_basis.
    await PricingRulesService.createRule(admin, projectId, {
      label: 'Base price',
      kind: 'BASE_RATE',
      category: 'OTHER',
      calc_method: 'PER_SQYD',
      rate: 15000,
      applies_to_unit_type: 'PLOT',
    });
    await PricingRulesService.createRule(admin, projectId, {
      label: 'East Facing',
      kind: 'PREMIUM',
      category: 'FACING',
      calc_method: 'PER_SQYD',
      rate: 500,
      match_facing: 'EAST',
      applies_to_unit_type: 'PLOT',
    });
  });

  afterAll(cleanUp);

  it('plot and flat bases are fixed; other types follow a fitting project default', () => {
    expect(defaultPriceBasisForUnitType('PLOT', 'SUPER_BUILT_UP')).toBe('PLOT_AREA');
    expect(defaultPriceBasisForUnitType('FLAT', 'CARPET')).toBe('SUPER_BUILT_UP');
    expect(defaultPriceBasisForUnitType('VILLA', null)).toBe('BUILT_UP');
    expect(defaultPriceBasisForUnitType('VILLA', 'PLOT_AREA')).toBe('BUILT_UP');
    expect(resolveUnitPriceBasis('PLOT', 'SUPER_BUILT_UP')).toBe('PLOT_AREA');
    expect(resolveUnitPriceBasis('FLAT', 'CARPET')).toBe('SUPER_BUILT_UP');
    expect(resolveUnitPriceBasis('VILLA', 'CARPET')).toBe('CARPET');
  });

  it('sample-unit preview: 150 Sq.Yd east-facing plot is 150 x 15,000 + 150 x 500', async () => {
    const preview = await PricingService.previewForProject(admin, projectId, {
      unit_type: 'PLOT',
      plot_area_sqyd: 150,
      facing: 'EAST',
      is_corner: false,
    } as any);
    expect(preview.warnings).toEqual([]);
    expect(preview.base_price).toBe(150 * 15000);
    expect(preview.premiums_total).toBe(150 * 500);
    expect(preview.calculated_price).toBe(150 * 15500);
  });

  it('a plot sent with a flat basis is still priced on plot area', async () => {
    const preview = await PricingService.previewForProject(admin, projectId, {
      unit_type: 'PLOT',
      plot_area_sqyd: 150,
      price_basis: 'SUPER_BUILT_UP',
    } as any);
    expect(preview.base_price).toBe(150 * 15000);
  });

  it('a plot unit created without price_basis is stored as PLOT_AREA and priced', async () => {
    const unit = await ProjectUnitService.createUnit(admin, projectId, {
      unit_number: 'PB-1',
      unit_type: 'PLOT',
      plot_area_sqyd: 150,
      facing: 'EAST',
    } as any);
    expect(unit.price_basis).toBe('PLOT_AREA');
    expect(unit.calculated_price).toBe(150 * 15500);
  });

  it('a flat is stored on super built-up even when another basis is sent', async () => {
    const unit = await ProjectUnitService.createUnit(admin, projectId, {
      unit_number: 'PB-F1',
      unit_type: 'FLAT',
      super_built_up_area_sqft: 1200,
      price_basis: 'CARPET',
    } as any);
    expect(unit.price_basis).toBe('SUPER_BUILT_UP');
  });

  it('refuses a tax rule on plots', async () => {
    await expect(
      PricingRulesService.createRule(admin, projectId, {
        label: 'GST',
        kind: 'TAX',
        category: 'TAX',
        calc_method: 'PERCENT_OF_BASE',
        rate: 5,
        applies_to_unit_type: 'PLOT',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('a project-wide tax rule never lands on a plot, but does on a flat', () => {
    const gst = {
      id: 1,
      label: 'GST',
      kind: 'TAX' as const,
      category: 'TAX' as const,
      calc_method: 'PERCENT_OF_BASE' as const,
      rate: 5,
    };
    const base = {
      id: 2,
      label: 'Base',
      kind: 'BASE_RATE' as const,
      category: 'OTHER' as const,
      calc_method: 'FIXED' as const,
      rate: 1000000,
    };
    const plot = computePrice({ unit_type: 'PLOT', price_basis: 'PLOT_AREA' }, [base, gst]);
    const flat = computePrice({ unit_type: 'FLAT', price_basis: 'SUPER_BUILT_UP' }, [base, gst]);
    expect(plot.taxes_total).toBe(0);
    expect(flat.taxes_total).toBe(50000);
  });

  it('inventory/data-entry staff see only verified projects plus their own', async () => {
    const scope = await buildProjectScope({ ...pm, roles: [Roles.INVENTORY_EXECUTIVE] });
    expect(scope.OR).toEqual([
      { verification_status: 'VERIFIED' },
      { created_by_id: pm.employeeId },
    ]);
  });

  describe('while the project is in review', () => {
    beforeAll(async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: { verification_status: 'PENDING_MD_APPROVAL' },
      });
    });

    it("the PM can't change core details", async () => {
      await expect(
        ProjectService.updateProject(pm, projectId, { name: 'Renamed' } as any),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('re-sending unchanged core details (a wizard re-save) is allowed', async () => {
      await expect(
        ProjectService.updateProject(pm, projectId, { name: 'Plot Basis Test Project' } as any),
      ).resolves.toBeTruthy();
    });

    it('Admin can still correct it', async () => {
      const updated: any = await ProjectService.updateProject(admin, projectId, {
        name: 'Plot Basis Test Project (fixed)',
      } as any);
      expect(updated.name).toBe('Plot Basis Test Project (fixed)');
    });
  });
});
