import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../apps/api/src/server';
import { prisma } from '../../apps/api/src/lib/prisma';
import { setupDeterministicTestUsers, deterministicUsers } from '../fixtures/testUsers';
import { Roles, withRoleAliases } from '@rrh-ems/shared';
import { syncRolePermissions } from '../../apps/api/src/authz/syncRolePermissions';

// 2026-11-02: a Technical Manager works with Admin's access but marks
// attendance and sends daily reports like any employee; and people who have
// left are kept out of employee pickers (only the directory asks for them).
describe('Technical Manager role and hidden leavers', () => {
  const tag = `TMLV-${Date.now()}`;
  const createdIds: number[] = [];
  let adminToken: string;
  let tmToken: string;
  let tmBody: any;
  let leaverId: number;

  beforeAll(async () => {
    await setupDeterministicTestUsers();
    await syncRolePermissions();
    const company = await prisma.company.findUnique({ where: { code: 'TEST_COMP_01' } });
    const tmRole = await prisma.role.findUnique({ where: { name: Roles.TECHNICAL_MANAGER } });
    const tm = await prisma.employee.create({
      data: {
        employee_code: `RRH-TMLV-${String(Date.now()).slice(-5)}`,
        company_id: company!.id,
        password_hash: await bcrypt.hash('Password@123', 4),
        status: 'ACTIVE',
        full_name: `${tag} Tech Manager`,
        first_login_done: true,
        attendance_required: true,
        report_required: true,
        roles: { create: [{ role_id: tmRole!.id }] },
      },
    });
    createdIds.push(tm.id);
    const telecallerRole = await prisma.role.findUnique({ where: { name: Roles.TELECALLER } });
    const leaver = await prisma.employee.create({
      data: {
        employee_code: `${tag}-LEFT`,
        company_id: company!.id,
        password_hash: '',
        status: 'RESIGNED',
        full_name: `${tag} Has Left`,
        roles: { create: [{ role_id: telecallerRole!.id }] },
      },
    });
    leaverId = leaver.id;
    createdIds.push(leaver.id);

    const adminUser = deterministicUsers.find((u) => u.roles[0] === Roles.ADMIN)!;
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ employee_code: adminUser.employee_code, password: 'Password@123' });
    adminToken = adminLogin.body.accessToken;

    const tmLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ employee_code: tm.employee_code, password: 'Password@123' });
    expect(tmLogin.status).toBe(200);
    tmToken = tmLogin.body.accessToken;
    tmBody = tmLogin.body;
  });

  afterAll(async () => {
    await prisma.authSession.deleteMany({ where: { employee_id: { in: createdIds } } });
    await prisma.auditEvent.deleteMany({ where: { actor_id: { in: createdIds } } });
    await prisma.employeeRole.deleteMany({ where: { employee_id: { in: createdIds } } });
    await prisma.employee.deleteMany({ where: { id: { in: createdIds } } });
  });

  it('withRoleAliases adds Admin only for a Technical Manager', () => {
    expect(withRoleAliases([Roles.TECHNICAL_MANAGER])).toEqual([
      Roles.ADMIN,
      Roles.TECHNICAL_MANAGER,
    ]);
    expect(withRoleAliases([Roles.TELECALLER])).toEqual([Roles.TELECALLER]);
    expect(withRoleAliases([Roles.ADMIN])).toEqual([Roles.ADMIN]);
  });

  it('signs in with Admin access and keeps the Technical Manager role', () => {
    expect(tmBody.user.roles).toEqual([Roles.ADMIN, Roles.TECHNICAL_MANAGER]);
  });

  it('can use an Admin-only screen', async () => {
    const res = await request(app)
      .get('/api/v1/attendance/live')
      .set('Authorization', `Bearer ${tmToken}`);
    expect(res.status).toBe(200);
  });

  it('still has to send the daily report, unlike Admin', async () => {
    const tm = await request(app)
      .get('/api/v1/reports/today')
      .set('Authorization', `Bearer ${tmToken}`);
    expect(tm.status).toBe(200);
    expect(tm.body.required).toBe(true);
    expect(tm.body.role).toBe(Roles.TECHNICAL_MANAGER);
  });

  it('employee pickers leave out people who have left; the directory can ask for them', async () => {
    const picker = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(picker.status).toBe(200);
    expect(picker.body.employees.some((e: any) => e.id === leaverId)).toBe(false);

    const directory = await request(app)
      .get('/api/v1/employees?include_left=1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(directory.body.employees.some((e: any) => e.id === leaverId)).toBe(true);

    const md = await request(app)
      .get('/api/v1/md/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(md.body.employees.some((e: any) => e.id === leaverId)).toBe(false);
  });
});
