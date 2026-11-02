import request from 'supertest';
import crypto from 'crypto';
import app from '../../apps/api/src/server';
import { prisma } from '../../apps/api/src/lib/prisma';
import { generateAccessToken } from '../../apps/api/src/utils/jwt';
import { Roles, RolePermissionsMatrix, ALL_PERMISSIONS } from '@rrh-ems/shared';
import { jest } from '@jest/globals';

jest.setTimeout(60000);

// The four high findings of docs/project-workflow-audit-2026-11-02.md:
//  1. the project list cache hid new projects and the MD's pending queue;
//  2. the review chain sent no notifications;
//  3. units were never published, so the websites showed none;
//  4. unit codes were "count of all units + 1" and clashed after a delete.
describe('project review chain, list freshness, unit publishing and unit codes', () => {
  const companyId = 1;
  const people = {
    pm: { id: 999970, code: 'PRF-PM', role: Roles.PROJECT_MANAGER },
    dmHead: { id: 999971, code: 'PRF-DMH', role: Roles.DIGITAL_MARKETING_HEAD },
    md: { id: 999972, code: 'PRF-MD', role: Roles.MD },
  };
  const tokens: Record<keyof typeof people, string> = {} as any;
  const apiKey = `test-prf-${crypto.randomBytes(8).toString('hex')}`;
  let projectId: number;

  const api = (who: keyof typeof people) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${tokens[who]}`),
    post: (url: string, body: any = {}) =>
      request(app).post(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
    del: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${tokens[who]}`),
  });
  const newestNotification = (employeeId: number, type: string) =>
    prisma.notification.findFirst({
      where: { employee_id: employeeId, type, title: { contains: `${projectCode()}` } },
      orderBy: { id: 'desc' },
    });
  let code = '';
  const projectCode = () => code;

  beforeAll(async () => {
    for (const [key, person] of Object.entries(people)) {
      const role = await prisma.role.findUniqueOrThrow({ where: { name: person.role } });
      const emp = await prisma.employee.upsert({
        where: { id: person.id },
        update: { status: 'ACTIVE', company_id: companyId },
        create: {
          id: person.id,
          employee_code: person.code,
          company_id: companyId,
          password_hash: '',
          status: 'ACTIVE',
          full_name: `Review Fix ${person.code}`,
        },
      });
      await prisma.employeeRole.createMany({
        data: [{ employee_id: emp.id, role_id: role.id }],
        skipDuplicates: true,
      });
      tokens[key as keyof typeof people] = generateAccessToken({
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        companyId,
        branchId: null,
        roles: [person.role],
        permissions: (person.role === Roles.MD
          ? ALL_PERMISSIONS
          : (RolePermissionsMatrix as any)[person.role]) as any,
        tokenVersion: emp.token_version,
      });
    }
    await prisma.publicApiKey.create({ data: { api_key: apiKey, company_id: companyId } });
  });

  afterAll(async () => {
    await prisma.publicApiKey.deleteMany({ where: { api_key: apiKey } });
    if (projectId) {
      await prisma.priceLine.deleteMany({ where: { project_unit: { project_id: projectId } } });
      await prisma.projectUnit.deleteMany({ where: { project_id: projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
    }
  });

  it('1. a new project shows in its creator’s list straight away', async () => {
    const before = await api('pm').get('/api/v1/projects'); // fills the cache
    expect(before.status).toBe(200);
    const created = await api('pm').post('/api/v1/projects', {
      name: `Review fix ${Date.now()}`,
      location: 'Test',
      project_type: 'PLOTTED',
      assigned_pm_id: people.pm.id,
    });
    expect(created.status).toBe(201);
    projectId = created.body.project.id;
    code = created.body.project.project_code;
    const after = await api('pm').get('/api/v1/projects');
    expect(after.body.projects.map((p: any) => p.id)).toContain(projectId);
  });

  it('4. unit codes: a delete no longer makes the next unit clash; parallel adds get distinct codes', async () => {
    const add = (n: string) =>
      api('pm').post(`/api/v1/projects/${projectId}/units`, {
        unit_number: n,
        unit_type: 'PLOT',
        plot_area_sqyd: 100,
      });
    const a = await add('C-1');
    const b = await add('C-2');
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(
      (await api('pm').del(`/api/v1/projects/${projectId}/units/${a.body.unit.id}`)).status,
    ).toBe(200);
    const c = await add('C-3'); // used to recompute b's code -> 500
    expect(c.status).toBe(201);
    expect(c.body.unit.unit_code).not.toBe(b.body.unit.unit_code);

    const parallel = await Promise.all([add('C-4'), add('C-5'), add('C-6')]);
    expect(parallel.map((r) => r.status)).toEqual([201, 201, 201]);
    const codes = [b, c, ...parallel].map((r) => r.body.unit.unit_code);
    expect(new Set(codes).size).toBe(codes.length);
    // Not on the websites before the project is approved.
    expect(parallel.every((r) => r.body.unit.is_published === false)).toBe(true);
  });

  it('2. submit tells Marketing; passing it on tells the MD and refreshes the MD queue', async () => {
    const queueBefore = await api('md').get(
      '/api/v1/projects?verification_status=PENDING_MD_APPROVAL',
    );
    expect(queueBefore.body.projects.map((p: any) => p.id)).not.toContain(projectId);

    expect((await api('pm').post(`/api/v1/projects/${projectId}/submit-for-review`)).status).toBe(
      200,
    );
    expect(await newestNotification(people.dmHead.id, 'PROJECT_REVIEW_SUBMITTED')).not.toBeNull();

    expect(
      (await api('dmHead').post(`/api/v1/projects/${projectId}/dm-verify-as-is`, {})).status,
    ).toBe(200);
    expect(await newestNotification(people.md.id, 'PROJECT_REVIEW_MD')).not.toBeNull();

    const queueAfter = await api('md').get(
      '/api/v1/projects?verification_status=PENDING_MD_APPROVAL',
    );
    expect(queueAfter.body.projects.map((p: any) => p.id)).toContain(projectId);
  });

  it('2. a rejection reaches the PM with the reason, and says so', async () => {
    const res = await api('md').post(`/api/v1/projects/${projectId}/md-approve`, {
      approved: false,
      notes: 'Add the LP number',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/have been notified/);
    const n = await newestNotification(people.pm.id, 'PROJECT_REJECTED');
    expect(n?.message).toContain('Add the LP number');
  });

  it('2+3. approval tells the PM and publishes the units; the website lists the available ones', async () => {
    await api('pm').post(`/api/v1/projects/${projectId}/submit-for-review`);
    await api('dmHead').post(`/api/v1/projects/${projectId}/dm-verify-as-is`, {});
    const res = await api('md').post(`/api/v1/projects/${projectId}/md-approve`, {
      approved: true,
    });
    expect(res.status).toBe(200);
    expect(await newestNotification(people.pm.id, 'PROJECT_APPROVED')).not.toBeNull();

    const units = await prisma.projectUnit.findMany({ where: { project_id: projectId } });
    expect(units.length).toBeGreaterThan(0);
    expect(units.every((u) => u.is_published)).toBe(true);

    // A unit added after approval is published straight away.
    const late = await api('pm').post(`/api/v1/projects/${projectId}/units`, {
      unit_number: 'C-7',
      unit_type: 'PLOT',
      plot_area_sqyd: 120,
    });
    expect(late.body.unit.is_published).toBe(true);

    // A unit that is no longer for sale drops off the website without un-publishing it.
    await prisma.projectUnit.update({
      where: { id: units[0].id },
      data: { sales_status: 'BLOCKED' },
    });

    const pub = await request(app)
      .get(`/api/v1/public/rrh/projects/${projectId}`)
      .set('x-api-key', apiKey);
    expect(pub.status).toBe(200);
    const shown = pub.body.properties.map((u: any) => u.id);
    expect(shown).toContain(late.body.unit.id);
    expect(shown).not.toContain(units[0].id);
    expect(shown.length).toBe(units.length); // all published, minus the blocked one, plus the late one
  });
});
