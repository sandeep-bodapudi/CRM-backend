import request from 'supertest';
import app from '../../apps/api/src/server';
import { prisma } from '../../apps/api/src/lib/prisma';
import { setupDeterministicTestUsers, deterministicUsers } from '../fixtures/testUsers';
import { Roles } from '@rrh-ems/shared';
import { CRM_ACTION, describeCrmAction } from '../../apps/api/src/middleware/recordCrmAction';

// 2026-11-02: every change a person makes in the CRM is recorded for the daily
// work page (Team Today and their own daily report), and the Technical Manager
// gets a dashboard of the whole system.
describe('Daily work recording and the Technical Manager dashboard', () => {
  let adminToken: string;
  let adminId: number;
  let telecallerToken: string;
  const taskIds: number[] = [];
  const startedAt = new Date();

  const login = async (role: string) => {
    const u = deterministicUsers.find((x) => x.roles[0] === role)!;
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ employee_code: u.employee_code, password: 'Password@123' });
    expect(res.status).toBe(200);
    return res.body;
  };

  beforeAll(async () => {
    await setupDeterministicTestUsers();
    const admin = await login(Roles.ADMIN);
    adminToken = admin.accessToken;
    adminId = admin.user.id;
    telecallerToken = (await login(Roles.TELECALLER)).accessToken;
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({
      where: { actor_id: adminId, action: CRM_ACTION, created_at: { gte: startedAt } },
    });
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  });

  it('describes changes in plain words', () => {
    expect(describeCrmAction('POST', '/leads/123/calls').label).toBe('Logged a call on lead #123');
    expect(describeCrmAction('POST', '/projects/5/units').label).toBe('Added a unit to project #5');
    expect(describeCrmAction('POST', '/attendance/check-in').label).toBe('Checked in');
    expect(describeCrmAction('POST', '/reports').label).toBe('Sent the daily report');
    expect(describeCrmAction('DELETE', '/tasks/3').label).toBe('Removed task #3');
  });

  it('records a change; Team Today carries a list for each person', async () => {
    const created = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Daily work recording test task',
        assignee_id: adminId,
        deadline: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(created.status).toBeLessThan(300);
    const taskId = created.body.task?.id ?? created.body.id;
    if (taskId) taskIds.push(taskId);

    // Recorded after the response is sent.
    let row = null;
    for (let i = 0; i < 20 && !row; i++) {
      row = await prisma.auditEvent.findFirst({
        where: { actor_id: adminId, action: CRM_ACTION, created_at: { gte: startedAt } },
      });
      if (!row) await new Promise((r) => setTimeout(r, 100));
    }
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.new_value!).label).toBe('Added a task');

    const today = await request(app)
      .get('/api/v1/md/team-today')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(today.status).toBe(200);
    // Admin itself is not listed on Team Today; every listed person carries the list.
    for (const e of today.body.employees) expect(Array.isArray(e.crm_actions)).toBe(true);
  });

  it('signing in and reading pages are not recorded as work', async () => {
    const before = await prisma.auditEvent.count({
      where: { actor_id: adminId, action: CRM_ACTION, created_at: { gte: startedAt } },
    });
    await request(app).get('/api/v1/tasks').set('Authorization', `Bearer ${adminToken}`);
    await new Promise((r) => setTimeout(r, 300));
    const after = await prisma.auditEvent.count({
      where: { actor_id: adminId, action: CRM_ACTION, created_at: { gte: startedAt } },
    });
    expect(after).toBe(before);
  });

  it('the Technical Manager overview loads for Admin and is refused to others', async () => {
    const ok = await request(app)
      .get('/api/v1/admin/tech-overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveProperty('people.active_staff');
    expect(ok.body).toHaveProperty('business.overdue_tasks');
    expect(ok.body.activity.actions_today).toBeGreaterThan(0);

    const no = await request(app)
      .get('/api/v1/admin/tech-overview')
      .set('Authorization', `Bearer ${telecallerToken}`);
    expect(no.status).toBe(403);
  });
});
