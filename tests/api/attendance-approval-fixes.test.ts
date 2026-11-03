import request from 'supertest';
import app from '../../apps/api/src/server';
import { prisma } from '../../apps/api/src/lib/prisma';
import { setupDeterministicTestUsers, deterministicUsers } from '../fixtures/testUsers';
import { Roles } from '@rrh-ems/shared';
import { recheckAbsences } from '../../apps/api/src/services/absenceRecheck';
import { leadFollowUpJob, staleLeadFlaggingJob } from '../../apps/api/src/jobs/tasks';
import { getISTComponents, getISTMidnightInstant } from '../../apps/api/src/utils/time';

// Fixes from the production check of 2026-11-03.
describe('Attendance approvals, field-work absences, reminder floods, WFH notices', () => {
  const DAY = 24 * 3600 * 1000;
  const tag = `AAF-${Date.now()}`;
  let md: { token: string; id: number };
  let hr: { token: string; id: number };
  let tc: { token: string; id: number };
  const made = {
    proposals: [] as number[],
    events: [] as number[],
    leads: [] as number[],
    emps: [] as number[],
  };

  const login = async (role: string) => {
    const u = deterministicUsers.find((x) => x.roles[0] === role && x.company_id === 1)!;
    const r = await request(app)
      .post('/api/v1/auth/login')
      .send({ employee_code: u.employee_code, password: 'Password@123' });
    expect(r.status).toBe(200);
    return { token: r.body.accessToken as string, id: r.body.user.id as number };
  };
  const daysAgo = (n: number) => getISTComponents(new Date(Date.now() - n * DAY)).dateString;

  beforeAll(async () => {
    await setupDeterministicTestUsers();
    md = await login(Roles.MD);
    hr = await login(Roles.HR_MANAGER);
    tc = await login(Roles.TELECALLER);
  });

  afterAll(async () => {
    await prisma.attendanceLog.deleteMany({
      where: { employee_id: tc.id, notes: { contains: 'Field work (approved after the day)' } },
    });
    await prisma.attendanceProposal.deleteMany({ where: { id: { in: made.proposals } } });
    await prisma.attendanceProposal.deleteMany({
      where: { employee_id: tc.id, type: 'WORK_FROM_HOME', reason: { contains: tag } },
    });
    await prisma.auditEvent.deleteMany({ where: { id: { in: made.events } } });
    await prisma.auditEvent.deleteMany({
      where: {
        action: 'ABSENCE_PENALTY_CANCELLED',
        entity_id: tc.id,
        new_value: { contains: tag },
      },
    });
    await prisma.auditEvent.deleteMany({
      where: { entity_type: 'LEAD', entity_id: { in: made.leads } },
    });
    await prisma.notification.deleteMany({ where: { employee_id: { in: made.emps } } });
    await prisma.lead.deleteMany({ where: { id: { in: made.leads } } });
    await prisma.employee.deleteMany({ where: { id: { in: made.emps } } });
  });

  it('two approvals at the same moment: one wins, one attendance row', async () => {
    const day = daysAgo(3);
    await prisma.attendanceLog.deleteMany({
      where: {
        employee_id: tc.id,
        check_in_at: {
          gte: getISTMidnightInstant(day),
          lt: new Date(getISTMidnightInstant(day).getTime() + DAY),
        },
      },
    });
    const fw = await prisma.attendanceProposal.create({
      data: {
        employee_id: tc.id,
        type: 'FIELD_WORK',
        target_date: getISTMidnightInstant(day),
        reason: `${tag} site trip`,
        status: 'PENDING',
      },
    });
    made.proposals.push(fw.id);
    const approve = (who: { token: string }) =>
      request(app)
        .post(`/api/v1/attendance/proposals/${fw.id}/approve`)
        .set('Authorization', `Bearer ${who.token}`)
        .send({});
    const [a, b] = await Promise.all([approve(md), approve(hr)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const start = getISTMidnightInstant(day);
    const rows = await prisma.attendanceLog.count({
      where: {
        employee_id: tc.id,
        check_in_at: { gte: start, lt: new Date(start.getTime() + DAY) },
      },
    });
    expect(rows).toBe(1);
  });

  it('an absence on an approved field-work day is cancelled', async () => {
    const day = daysAgo(9);
    const fw = await prisma.attendanceProposal.create({
      data: {
        employee_id: tc.id,
        type: 'FIELD_WORK',
        target_date: getISTMidnightInstant(day),
        reason: `${tag} field`,
        status: 'APPROVED',
      },
    });
    made.proposals.push(fw.id);
    const absent = await prisma.auditEvent.create({
      data: {
        actor_id: tc.id,
        action: 'UNINFORMED_ABSENT',
        entity_type: 'EMPLOYEE',
        entity_id: tc.id,
        new_value: JSON.stringify({ date: day, tag }),
      },
    });
    made.events.push(absent.id);
    await recheckAbsences({ employeeIds: [tc.id], date: day });
    const after = await prisma.auditEvent.findUnique({ where: { id: absent.id } });
    expect(after!.action).toBe('UNINFORMED_ABSENT_VOIDED');
    expect(after!.reason).toContain('approved field work');
  });

  it('follow-up reminders: one summary per person, not one per lead', async () => {
    const owner = await prisma.employee.create({
      data: {
        employee_code: `${tag}-OWN`,
        company_id: 1,
        password_hash: '',
        status: 'ACTIVE',
        full_name: `${tag} Owner`,
      },
    });
    made.emps.push(owner.id);
    for (let i = 0; i < 7; i++) {
      const lead = await prisma.lead.create({
        data: {
          lead_code: `${tag}-L${i}`,
          company_id: 1,
          customer_name: `Cust ${i}`,
          phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
          status: 'CONTACTED',
          assigned_to_id: owner.id,
        },
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { created_at: new Date(Date.now() - 8 * DAY) },
      });
      made.leads.push(lead.id);
    }
    await leadFollowUpJob();
    const notes = await prisma.notification.findMany({
      where: { employee_id: owner.id, type: 'LEAD_FOLLOW_UP_REMINDER' },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toMatch(/^7 of your leads/);
  });

  it('stale leads: the manager gets one summary; every lead is still flagged', async () => {
    const mgr = await prisma.employee.create({
      data: {
        employee_code: `${tag}-MGR`,
        company_id: 1,
        password_hash: '',
        status: 'ACTIVE',
        full_name: `${tag} Manager`,
      },
    });
    made.emps.push(mgr.id);
    await prisma.employee.update({
      where: { employee_code: `${tag}-OWN` },
      data: { reporting_manager_id: mgr.id },
    });
    await staleLeadFlaggingJob();
    const notes = await prisma.notification.findMany({
      where: { employee_id: mgr.id, type: 'LEAD_STALE_FLAGGED' },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain('7 with');
    const flags = await prisma.auditEvent.count({
      where: { entity_type: 'LEAD', entity_id: { in: made.leads }, action: 'LEAD_STALE_FLAGGED' },
    });
    expect(flags).toBe(7);
    // A second run in the same stretch adds nothing.
    await staleLeadFlaggingJob();
    expect(
      await prisma.notification.count({
        where: { employee_id: mgr.id, type: 'LEAD_STALE_FLAGGED' },
      }),
    ).toBe(1);
  });

  it('a work-from-home request notifies HR and the MD', async () => {
    const date = getISTComponents(new Date(Date.now() + 5 * DAY)).dateString;
    const since = new Date();
    const r = await request(app)
      .post('/api/v1/attendance/wfh-proposal')
      .set('Authorization', `Bearer ${tc.token}`)
      .send({ date, reason: `${tag} home visit for repairs` });
    expect(r.status).toBe(201);
    for (const who of [hr, md]) {
      const n = await prisma.notification.findFirst({
        where: { employee_id: who.id, title: 'Work-from-home request', created_at: { gte: since } },
      });
      expect(n).not.toBeNull();
    }
    await prisma.notification.deleteMany({
      where: { title: 'Work-from-home request', created_at: { gte: since } },
    });
  });
});
