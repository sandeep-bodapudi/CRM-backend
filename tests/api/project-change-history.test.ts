import request from 'supertest';
import app from '../../apps/api/src/server';
import { prisma } from '../../apps/api/src/lib/prisma';
import { generateAccessToken, TokenPayload } from '../../apps/api/src/utils/jwt';
import { ProjectService } from '../../apps/api/src/services/project.service';
import { ProjectUnitService } from '../../apps/api/src/services/projectUnit.service';
import { PricingRulesService } from '../../apps/api/src/services/pricing/rules.service';
import { Roles, RolePermissionsMatrix, ALL_PERMISSIONS } from '@rrh-ems/shared';
import { jest } from '@jest/globals';

jest.setTimeout(60000);

// Owner, 2026-11-02: an approved project can change without another review,
// but every change is kept field by field (who, when, before -> after, why);
// and the database itself refuses a second unit with the same number.
describe('project change history and unique unit numbers', () => {
  const companyId = 1;
  const people = {
    md: { id: 999940, code: 'PCH-MD', role: Roles.MD },
    pm: { id: 999941, code: 'PCH-PM', role: Roles.PROJECT_MANAGER },
  };
  type Who = keyof typeof people;
  const users = {} as Record<Who, TokenPayload>;
  const tokens = {} as Record<Who, string>;
  const projectIds: number[] = [];

  const newProject = async (approved: boolean) => {
    const p = await ProjectService.createProject(users.md, {
      name: `Change history ${Date.now()}-${projectIds.length}`,
      location: 'Hyderabad',
      project_type: 'PLOTTED',
      assigned_pm_id: people.pm.id,
    } as any);
    projectIds.push(p.id);
    if (approved) {
      await prisma.project.update({
        where: { id: p.id },
        data: { verification_status: 'VERIFIED' },
      });
    }
    return p;
  };
  const baseRule = (projectId: number) =>
    prisma.projectPricingRule.create({
      data: {
        project_id: projectId,
        label: 'Base Rate',
        kind: 'BASE_RATE',
        category: 'OTHER',
        calc_method: 'PER_SQYD',
        rate: 15000,
        applies_to_unit_type: 'PLOT',
      } as any,
    });
  const history = async (projectId: number) => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/activity`)
      .set('Authorization', `Bearer ${tokens.md}`);
    expect(res.status).toBe(200);
    return res.body.events as any[];
  };

  beforeAll(async () => {
    for (const [key, person] of Object.entries(people)) {
      const role = await prisma.role.upsert({
        where: { name: person.role },
        update: {},
        create: { name: person.role },
      });
      const emp = await prisma.employee.upsert({
        where: { id: person.id },
        update: { status: 'ACTIVE', company_id: companyId },
        create: {
          id: person.id,
          employee_code: person.code,
          company_id: companyId,
          password_hash: '',
          status: 'ACTIVE',
          full_name: `History ${person.code}`,
        },
      });
      await prisma.employeeRole.createMany({
        data: [{ employee_id: emp.id, role_id: role.id }],
        skipDuplicates: true,
      });
      const u: TokenPayload = {
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        companyId,
        branchId: null,
        roles: [person.role],
        permissions: (person.role === Roles.MD
          ? ALL_PERMISSIONS
          : (RolePermissionsMatrix as any)[person.role]) as any,
        tokenVersion: emp.token_version,
      };
      users[key as Who] = u;
      tokens[key as Who] = generateAccessToken(u);
    }
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      // Every MD of the company gets one; these projects are all "Change history ...".
      where: { type: 'PROJECT_PRICE_CHANGED', message: { contains: 'project "Change history ' } },
    });
    for (const id of projectIds) {
      await prisma.auditEvent.deleteMany({ where: { entity_type: 'PROJECT', entity_id: id } });
      await prisma.priceLine.deleteMany({ where: { project_unit: { project_id: id } } });
      await prisma.projectUnit.deleteMany({ where: { project_id: id } });
      await prisma.projectPricingRule.deleteMany({ where: { project_id: id } });
      await prisma.project.deleteMany({ where: { id } }).catch(() => undefined);
    }
  });

  it('a price change on an approved project needs a reason, is kept before → after, and tells the MD', async () => {
    const p = await newProject(true);
    const rule = await baseRule(p.id);

    await expect(
      PricingRulesService.updateRule(users.pm, p.id, rule.id, { rate: 16000 } as any),
    ).rejects.toMatchObject({ status: 400 });

    await PricingRulesService.updateRule(users.pm, p.id, rule.id, {
      rate: 16000,
      change_reason: 'Market rate revised',
    } as any);

    const events = await history(p.id);
    expect(events).toContainEqual(
      expect.objectContaining({
        area: 'PRICING',
        field: 'Base price (Plot)',
        before: '₹15,000 / Sq.Yd',
        after: '₹16,000 / Sq.Yd',
        reason: 'Market rate revised',
        actor_name: 'History PCH-PM',
      }),
    );

    const note = await prisma.notification.findFirst({
      where: {
        employee_id: people.md.id,
        type: 'PROJECT_PRICE_CHANGED',
        message: { contains: p.project_code },
      },
    });
    expect(note?.message).toContain('Base price (Plot): ₹15,000 / Sq.Yd → ₹16,000 / Sq.Yd');
    expect(note?.message).toContain('Reason: Market rate revised');
  });

  it('details and units changed after approval are listed field by field; a draft keeps no such history', async () => {
    const p = await newProject(true);
    await baseRule(p.id);
    const unit: any = await ProjectUnitService.createUnit(users.md, p.id, {
      unit_number: 'H-1',
      unit_type: 'PLOT',
      plot_area_sqyd: 100,
    } as any);

    await ProjectService.updateProject(users.md, p.id, {
      rera_number: 'P02400009999',
      change_reason: 'RERA number received',
    } as any);
    await ProjectUnitService.updateUnit(users.md, unit.id, { plot_area_sqyd: 120 } as any);

    const events = await history(p.id);
    const line = (field: string) => events.find((e) => e.field === field);
    expect(line('RERA number')).toMatchObject({
      area: 'DETAILS',
      before: '—',
      after: 'P02400009999',
      reason: 'RERA number received',
    });
    expect(line('Plot H-1 added')).toMatchObject({ area: 'UNITS', after: '₹15,00,000' });
    expect(line('Plot H-1 · plot area (Sq.Yd)')).toMatchObject({ before: '100', after: '120' });
    expect(line('Plot H-1 · price')).toMatchObject({ before: '₹15,00,000', after: '₹18,00,000' });
    // Only readable lines: the raw request log is not mixed in.
    expect(events.every((e) => typeof e.field === 'string' && e.field.length > 0)).toBe(true);

    const draft = await newProject(false);
    const draftRule = await baseRule(draft.id);
    await PricingRulesService.updateRule(users.pm, draft.id, draftRule.id, { rate: 17000 } as any);
    expect(await history(draft.id)).toEqual([]);
  });

  it('two people saving the same unit number at the same moment: exactly one wins', async () => {
    const p = await newProject(false);
    const save = () =>
      request(app)
        .post(`/api/v1/projects/${p.id}/units`)
        .set('Authorization', `Bearer ${tokens.pm}`)
        .send({ unit_number: 'RACE-1', unit_type: 'PLOT', plot_area_sqyd: 150 });

    const both = await Promise.all([save(), save()]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(both.find((r) => r.status === 409)!.body.error).toBe(
      'Unit number "RACE-1" is already used in this project. Choose another number.',
    );
    expect(
      await prisma.projectUnit.count({ where: { project_id: p.id, unit_number: 'RACE-1' } }),
    ).toBe(1);

    // Make the race certain: with the read-first check switched off, every
    // save reaches the database at once, and only the unique key stops them.
    const spy = jest
      .spyOn(ProjectUnitService as any, 'assertUnitNumberFree')
      .mockResolvedValue(undefined as never);
    try {
      const five = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .post(`/api/v1/projects/${p.id}/units`)
            .set('Authorization', `Bearer ${tokens.pm}`)
            .send({ unit_number: 'RACE-2', unit_type: 'PLOT', plot_area_sqyd: 150 }),
        ),
      );
      expect(five.filter((r) => r.status === 201)).toHaveLength(1);
      for (const r of five.filter((x) => x.status !== 201)) {
        expect(r.status).toBe(409);
        expect(r.body.error).toContain('Unit number "RACE-2" is already used in this project');
      }
    } finally {
      spy.mockRestore();
    }
    expect(
      await prisma.projectUnit.count({ where: { project_id: p.id, unit_number: 'RACE-2' } }),
    ).toBe(1);

    // Renaming a unit onto a taken number is refused the same way.
    const other: any = await ProjectUnitService.createUnit(users.pm, p.id, {
      unit_number: 'RACE-3',
      unit_type: 'PLOT',
      plot_area_sqyd: 150,
    } as any);
    const spy2 = jest
      .spyOn(ProjectUnitService as any, 'assertUnitNumberFree')
      .mockResolvedValue(undefined as never);
    try {
      await expect(
        ProjectUnitService.updateUnit(users.pm, other.id, { unit_number: 'RACE-1' } as any),
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      spy2.mockRestore();
    }
  });
});
