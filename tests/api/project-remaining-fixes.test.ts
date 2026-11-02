import request from 'supertest';
import crypto from 'crypto';
import app from '../../apps/api/src/server';
import { prisma } from '../../apps/api/src/lib/prisma';
import { generateAccessToken, TokenPayload } from '../../apps/api/src/utils/jwt';
import { ProjectService } from '../../apps/api/src/services/project.service';
import {
  ProjectUnitService,
  UNIT_HOLD_HOURS,
} from '../../apps/api/src/services/projectUnit.service';
import { PricingRulesService } from '../../apps/api/src/services/pricing/rules.service';
import { InventoryService } from '../../apps/api/src/services/inventory.service';
import { assertClaimable } from '../../apps/api/src/services/inventory/reference';
import { resolveVisitProject } from '../../apps/api/src/services/siteVisit/shared';
import { Roles, RolePermissionsMatrix, ALL_PERMISSIONS } from '@rrh-ems/shared';
import { jest } from '@jest/globals';

jest.setTimeout(60000);

// The medium/low findings of docs/project-workflow-audit-2026-11-02.md fixed
// on 2026-11-02 (the four high ones are in project-review-fixes.test.ts).
describe('project workflow audit — remaining fixes', () => {
  const companyId = 1;
  const people = {
    md: { id: 999980, code: 'PRM-MD', role: Roles.MD },
    pm: { id: 999981, code: 'PRM-PM', role: Roles.PROJECT_MANAGER },
    pm2: { id: 999982, code: 'PRM-PM2', role: Roles.PROJECT_MANAGER },
    ie: { id: 999983, code: 'PRM-IE', role: Roles.INVENTORY_EXECUTIVE },
    dmHead: { id: 999984, code: 'PRM-DMH', role: Roles.DIGITAL_MARKETING_HEAD },
    dmExec: { id: 999985, code: 'PRM-DME', role: Roles.DIGITAL_MARKETING_EXECUTIVE },
  };
  type Who = keyof typeof people;
  const users = {} as Record<Who, TokenPayload>;
  const tokens = {} as Record<Who, string>;
  const projectIds: number[] = [];
  const apiKey = `test-prm-${crypto.randomBytes(8).toString('hex')}`;

  const newProject = async (extra: any = {}) => {
    const p = await ProjectService.createProject(users.md, {
      name: `Remaining fixes ${Date.now()}-${projectIds.length}`,
      location: 'Hyderabad',
      project_type: 'PLOTTED',
      assigned_pm_id: people.pm.id,
      ...extra,
    } as any);
    projectIds.push(p.id);
    return p;
  };
  const plot = (projectId: number, n: string, extra: any = {}) =>
    ProjectUnitService.createUnit(users.md, projectId, {
      unit_number: n,
      unit_type: 'PLOT',
      plot_area_sqyd: 100,
      ...extra,
    } as any);

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
          full_name: `Remaining Fix ${person.code}`,
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
    await prisma.publicApiKey.create({ data: { api_key: apiKey, company_id: companyId } });
  });

  afterAll(async () => {
    await prisma.publicApiKey.deleteMany({ where: { api_key: apiKey } });
    for (const id of projectIds) {
      await prisma.priceLine.deleteMany({ where: { project_unit: { project_id: id } } });
      await prisma.projectUnit.deleteMany({ where: { project_id: id } });
      await prisma.projectPricingRule.deleteMany({ where: { project_id: id } });
      await prisma.project.deleteMany({ where: { id } }).catch(() => undefined);
    }
  });

  it('#5 a name and a new PM saved together both stick; a non-PM is refused as PM', async () => {
    const p = await newProject();
    const updated: any = await ProjectService.updateProject(users.md, p.id, {
      name: 'Renamed with PM change',
      assigned_pm_id: people.pm2.id,
    } as any);
    expect(updated.name).toBe('Renamed with PM change');
    expect(updated.assigned_pm_id).toBe(people.pm2.id);

    await expect(
      ProjectService.updateProject(users.md, p.id, { assigned_pm_id: people.ie.id } as any),
    ).rejects.toMatchObject({ status: 400 });
    await expect(newProject({ assigned_pm_id: people.dmHead.id })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('#5 project codes follow the highest number, not a count', async () => {
    const a = await newProject();
    const b = await newProject();
    const n = (code: string) => parseInt(code.split('-').pop()!, 10);
    expect(n(b.project_code)).toBe(n(a.project_code) + 1);
  });

  it('#6 a unit number can only be used once per project (single, edit and bulk)', async () => {
    const p = await newProject();
    const first = await plot(p.id, 'D-1');
    await expect(plot(p.id, 'D-1')).rejects.toMatchObject({ status: 409 });
    const second = await plot(p.id, 'D-2');
    await expect(
      ProjectUnitService.updateUnit(users.md, second.id, { unit_number: 'D-1' } as any),
    ).rejects.toMatchObject({ status: 409 });
    const bulk = await ProjectUnitService.bulkCreateUnits(users.md, p.id, {
      units: [
        { unit_number: 'D-3', unit_type: 'PLOT', plot_area_sqyd: 100 },
        { unit_number: 'D-3', unit_type: 'PLOT', plot_area_sqyd: 100 },
        { unit_number: 'D-1', unit_type: 'PLOT', plot_area_sqyd: 100 },
      ],
    } as any);
    expect(bulk.created).toBe(1);
    expect(bulk.failed.map((f: any) => f.index)).toEqual([1, 2]);
    expect(bulk.failed[0].error).toMatch(/already used/);
    expect(first.unit_number).toBe('D-1');
  });

  it('#7 pickers and booking only take units of approved projects', async () => {
    const draft = await newProject();
    const draftUnit = await plot(draft.id, 'P-1');
    const { items } = await InventoryService.listInventory(users.md, {}, 200, 0);
    expect(items.some((i: any) => i.kind === 'UNIT' && i.id === draftUnit.id)).toBe(false);

    const locked = (verification: string, status = 'PLANNING') => ({
      ref: { kind: 'UNIT' as const, id: draftUnit.id },
      id: draftUnit.id,
      company_id: companyId,
      state: 'AVAILABLE',
      locked_until: null,
      label: 'Unit',
      project_status: status,
      project_verification: verification,
    });
    expect(() => assertClaimable(locked('DRAFT'), new Date())).toThrow(/not approved/);
    expect(() => assertClaimable(locked('VERIFIED', 'CANCELLED'), new Date())).toThrow(/cancelled/);
    expect(() => assertClaimable(locked('VERIFIED'), new Date())).not.toThrow();

    await expect(
      resolveVisitProject({ project_unit_ids: [draftUnit.id] }, companyId),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('a manual HOLD now has an end date, so the expiry sweep frees it', async () => {
    const p = await newProject();
    const u = await plot(p.id, 'H-1');
    const before = Date.now();
    const held: any = await ProjectUnitService.changeStatus(
      users.md,
      u.id,
      'HOLD',
      'customer asked',
    );
    expect(held.hold_until).not.toBeNull();
    const hours = (new Date(held.hold_until).getTime() - before) / 3600000;
    expect(hours).toBeGreaterThan(UNIT_HOLD_HOURS - 0.1);
    const back: any = await ProjectUnitService.changeStatus(users.md, u.id, 'AVAILABLE');
    expect(back.hold_until).toBeNull();
  });

  it('only the DM Head (or MD) can pass a project on without polish', async () => {
    const p = await newProject();
    await prisma.project.update({
      where: { id: p.id },
      // Assigned to the executive so it is in their scope; the role is what refuses them.
      data: {
        verification_status: 'PENDING_DM_POLISH',
        digital_marketing_executive_id: people.dmExec.id,
      },
    });
    const as = (who: Who) =>
      request(app)
        .post(`/api/v1/projects/${p.id}/dm-verify-as-is`)
        .set('Authorization', `Bearer ${tokens[who]}`)
        .send({});
    expect((await as('dmExec')).status).toBe(403);
    expect((await as('dmHead')).status).toBe(200);
  });

  it('MD approve checks the project is in scope (404 for an unknown project)', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/987654321/md-approve`)
      .set('Authorization', `Bearer ${tokens.md}`)
      .send({ approved: true });
    expect(res.status).toBe(404);
  });

  it('a tax rule cannot be edited onto plots either', async () => {
    const p = await newProject();
    const rule = await PricingRulesService.createRule(users.md, p.id, {
      label: 'Club',
      kind: 'CHARGE',
      category: 'CLUB',
      calc_method: 'FIXED',
      rate: 50000,
      applies_to_unit_type: 'PLOT',
    });
    await expect(
      PricingRulesService.updateRule(users.md, p.id, rule.id, { kind: 'TAX', category: 'TAX' }),
    ).rejects.toMatchObject({ status: 400 });
    const edited = await PricingRulesService.updateRule(users.md, p.id, rule.id, { rate: 60000 });
    expect(edited.rate).toBe(60000);
  });

  it('#10 media: brochure PDF and MP4 video are accepted; wrong types per kind are refused', async () => {
    const p = await newProject();
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64)]);
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(64),
    ]);
    const up = (kind: string, name: string, mimetype: string, buffer: Buffer) =>
      ProjectService.uploadMedia(users.md, p.id, { buffer, originalname: name, mimetype }, kind);

    const brochure = await up('BROCHURE', 'brochure.pdf', 'application/pdf', pdf);
    expect(brochure.url).toMatch(/\.pdf$/);
    const video = await up('VIDEO', 'walk.mp4', 'video/mp4', mp4);
    expect(video.url).toMatch(/\.mp4$/);

    await expect(up('GALLERY', 'x.pdf', 'application/pdf', pdf)).rejects.toMatchObject({
      status: 400,
    });
    await expect(up('VIDEO', 'x.pdf', 'application/pdf', pdf)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      up('BROCHURE', 'fake.pdf', 'application/pdf', Buffer.from('not a pdf')),
    ).rejects.toMatchObject({ status: 400 });

    await prisma.projectMedia.deleteMany({ where: { project_id: p.id } });
  });

  it('websites: a plot unit gets a Sq.Ft area; a cancelled project is not served', async () => {
    const p = await newProject();
    await plot(p.id, 'W-1');
    await prisma.project.update({
      where: { id: p.id },
      data: { verification_status: 'VERIFIED', is_published: true },
    });
    await prisma.projectUnit.updateMany({
      where: { project_id: p.id },
      data: { is_published: true },
    });
    const get = () =>
      request(app).get(`/api/v1/public/rrh/projects/${p.id}`).set('x-api-key', apiKey);

    const ok = await get();
    expect(ok.status).toBe(200);
    expect(ok.body.properties[0].area_sqft).toBe(900); // 100 Sq.Yd
    expect(ok.body.properties[0].category).toBe('PLOT');

    await prisma.project.update({ where: { id: p.id }, data: { status: 'CANCELLED' } });
    expect((await get()).status).toBe(404);
  });
});
