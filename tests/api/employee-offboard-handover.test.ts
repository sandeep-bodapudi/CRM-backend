import { prisma } from '../../apps/api/src/lib/prisma';
import { TokenPayload } from '../../apps/api/src/utils/jwt';
import { Roles } from '@rrh-ems/shared';
import {
  offboardDueLeavers,
  handOverWork,
  getHandoverSummary,
  findHandoverTarget,
} from '../../apps/api/src/services/employeeOffboard.service';
import { lastWorkingDayPassed, todayKeyIST } from '../../apps/api/src/utils/time';
import { leadFollowUpJob } from '../../apps/api/src/jobs/tasks';

// 2026-11-02 resignation hand-over: a leaver keeps working until their last
// working day; after it they are locked out and their open work goes to the
// colleague HR picked.
describe('Resignation: last-day lock-out and hand-over', () => {
  const tag = `OFFB-${Date.now()}`;
  const DAY = 24 * 3600 * 1000;
  const created = { employeeIds: [] as number[], leadIds: [] as number[], taskIds: [] as number[] };
  let companyId: number;
  let leaver: { id: number };
  let target: { id: number };
  let hr: TokenPayload;

  const makeEmployee = async (code: string, role: string, extra: any = {}) => {
    const roleRow = await prisma.role.findUnique({ where: { name: role } });
    const emp = await prisma.employee.create({
      data: {
        employee_code: `${tag}-${code}`,
        company_id: companyId,
        password_hash: '',
        status: 'ACTIVE',
        full_name: `${tag} ${code}`,
        roles: roleRow ? { create: [{ role_id: roleRow.id }] } : undefined,
        ...extra,
      },
    });
    created.employeeIds.push(emp.id);
    return emp;
  };

  const makeLead = async (ownerId: number, status = 'CONTACTED') => {
    const lead = await prisma.lead.create({
      data: {
        lead_code: `${tag}-L-${Math.random().toString(36).slice(2)}`,
        company_id: companyId,
        customer_name: 'Offboard Test Customer',
        phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
        status,
        assigned_to_id: ownerId,
      },
    });
    created.leadIds.push(lead.id);
    return lead;
  };

  const makeTask = async (
    assigneeId: number,
    leadId: number | null,
    title: string,
    status = 'PENDING',
  ) => {
    const task = await prisma.task.create({
      data: {
        title,
        assignee_id: assigneeId,
        lead_id: leadId,
        status,
        target_date: new Date(Date.now() + DAY),
        created_by: assigneeId,
      } as any,
    });
    created.taskIds.push(task.id);
    return task;
  };

  beforeAll(async () => {
    const company = await prisma.company.findUnique({ where: { code: 'TEST_COMP_01' } });
    companyId = company!.id;
    const hrEmp = await makeEmployee('HR', Roles.HR_MANAGER);
    hr = {
      employeeId: hrEmp.id,
      employeeCode: hrEmp.employee_code,
      companyId,
      branchId: null,
      roles: [Roles.HR_MANAGER],
      permissions: [],
    };
    target = await makeEmployee('TARGET', Roles.TELECALLER);
  });

  afterAll(async () => {
    const ids = created.employeeIds;
    await prisma.task.deleteMany({ where: { id: { in: created.taskIds } } });
    await prisma.task.deleteMany({ where: { lead_id: { in: created.leadIds } } });
    await prisma.leadActivity.deleteMany({ where: { lead_id: { in: created.leadIds } } });
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { entity_type: 'LEAD', entity_id: { in: created.leadIds } },
          { entity_type: 'EMPLOYEE', entity_id: { in: ids } },
        ],
      },
    });
    await prisma.lead.deleteMany({ where: { id: { in: created.leadIds } } });
    await prisma.notification.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.authSession.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.employeeRole.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.employee.updateMany({
      where: { id: { in: ids } },
      data: { handover_to_id: null },
    });
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  });

  it('lastWorkingDayPassed: today still counts as a working day, yesterday does not', () => {
    const today = todayKeyIST();
    expect(lastWorkingDayPassed(null)).toBe(false);
    expect(lastWorkingDayPassed(today)).toBe(false);
    expect(lastWorkingDayPassed(new Date(today.getTime() + DAY))).toBe(false);
    expect(lastWorkingDayPassed(new Date(today.getTime() - DAY))).toBe(true);
  });

  it('a handover target must be active, able to work leads and not the leaver', async () => {
    const hrOnly = await prisma.employee.findFirst({ where: { id: hr.employeeId } });
    expect(await findHandoverTarget(companyId, target.id, hrOnly!.id)).not.toBeNull();
    expect(await findHandoverTarget(companyId, target.id, target.id)).toBeNull();
    // HR cannot work leads.
    expect(await findHandoverTarget(companyId, hr.employeeId, target.id)).toBeNull();
  });

  it('serving notice: nothing happens before the last day is over', async () => {
    const tomorrow = new Date(todayKeyIST().getTime() + DAY);
    const emp = await makeEmployee('NOTICE', Roles.TELECALLER, {
      resignation_date: new Date(),
      last_working_day: tomorrow,
      handover_to_id: target.id,
    });
    const lead = await makeLead(emp.id);

    await offboardDueLeavers();

    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after!.status).toBe('ACTIVE');
    expect(after!.offboarded_at).toBeNull();
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.assigned_to_id).toBe(emp.id);
  });

  it('after the last day: locked out, open work moves, closed work stays', async () => {
    const yesterday = new Date(todayKeyIST().getTime() - DAY);
    leaver = await makeEmployee('LEAVER', Roles.TELECALLER, {
      resignation_date: new Date(Date.now() - 20 * DAY),
      last_working_day: yesterday,
      handover_to_id: target.id,
    });
    await prisma.authSession.create({
      data: {
        employee_id: leaver.id,
        refresh_token_hash: `${tag}-rt`,
        family_token: `${tag}-fam`,
        expires_at: new Date(Date.now() + DAY),
      } as any,
    });
    const open = await makeLead(leaver.id, 'CONTACTED');
    const fresh = await makeLead(leaver.id, 'NEW');
    const booked = await makeLead(leaver.id, 'BOOKED');
    const dropped = await makeLead(leaver.id, 'DROPPED');
    const callBack = await makeTask(leaver.id, open.id, 'Call back: Offboard Test Customer');
    const otherTask = await makeTask(leaver.id, null, `${tag} other task`, 'IN_PROGRESS');
    const doneTask = await makeTask(leaver.id, null, `${tag} done task`, 'COMPLETED');

    const before = await prisma.employee.findUnique({ where: { id: leaver.id } });
    await offboardDueLeavers();

    const after = await prisma.employee.findUnique({ where: { id: leaver.id } });
    expect(after!.status).toBe('RESIGNED');
    expect(after!.offboarded_at).not.toBeNull();
    expect(after!.token_version).toBe(before!.token_version + 1);
    const sessions = await prisma.authSession.findMany({ where: { employee_id: leaver.id } });
    expect(sessions.every((s) => s.revoked)).toBe(true);

    const owner = async (id: number) =>
      (await prisma.lead.findUnique({ where: { id } }))!.assigned_to_id;
    expect(await owner(open.id)).toBe(target.id);
    expect(await owner(fresh.id)).toBe(target.id);
    expect((await prisma.lead.findUnique({ where: { id: fresh.id } }))!.status).toBe('ASSIGNED');
    expect(await owner(booked.id)).toBe(leaver.id);
    expect(await owner(dropped.id)).toBe(leaver.id);

    const assignee = async (id: number) =>
      (await prisma.task.findUnique({ where: { id } }))!.assignee_id;
    expect(await assignee(callBack.id)).toBe(target.id);
    expect(await assignee(otherTask.id)).toBe(target.id);
    expect(await assignee(doneTask.id)).toBe(leaver.id);

    const handoverAudit = await prisma.auditEvent.findFirst({
      where: { entity_type: 'EMPLOYEE', entity_id: leaver.id, action: 'EMPLOYEE_HANDOVER' },
    });
    expect(handoverAudit).not.toBeNull();
    const leadAudits = await prisma.auditEvent.count({
      where: {
        entity_type: 'LEAD',
        entity_id: { in: [open.id, fresh.id] },
        action: 'LEAD_HANDED_OVER',
      },
    });
    expect(leadAudits).toBe(2);
    // Not counted as transfers, so the poaching alert is not involved.
    expect(
      await prisma.auditEvent.count({
        where: { entity_id: { in: [open.id, fresh.id] }, action: 'LEAD_TRANSFERRED' },
      }),
    ).toBe(0);

    const note = await prisma.notification.findFirst({
      where: { employee_id: target.id, title: { contains: 'work is now yours' } },
    });
    expect(note).not.toBeNull();
  });

  it('running the job again does nothing more (offboarded_at)', async () => {
    const audits = () =>
      prisma.auditEvent.count({
        where: { entity_type: 'EMPLOYEE', entity_id: leaver.id, action: 'EMPLOYEE_RESIGNED' },
      });
    const n = await audits();
    await offboardDueLeavers();
    expect(await audits()).toBe(n);
  });

  it('target left before the last day: locked out anyway, HR told, work stays', async () => {
    const goneTarget = await makeEmployee('GONE', Roles.TELECALLER, { status: 'RESIGNED' });
    const emp = await makeEmployee('NOTARGET', Roles.TELECALLER, {
      resignation_date: new Date(Date.now() - 20 * DAY),
      last_working_day: new Date(todayKeyIST().getTime() - DAY),
      handover_to_id: goneTarget.id,
    });
    const lead = await makeLead(emp.id);

    await offboardDueLeavers();

    expect((await prisma.employee.findUnique({ where: { id: emp.id } }))!.status).toBe('RESIGNED');
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.assigned_to_id).toBe(emp.id);
    const hrNote = await prisma.notification.findFirst({
      where: { employee_id: hr.employeeId, title: { contains: 'needs a new owner' } },
    });
    expect(hrNote).not.toBeNull();

    // ...and HR can hand it over afterwards from the profile.
    const summary = await getHandoverSummary(emp.id);
    expect(summary.moves.leads).toBe(1);
    expect(summary.targets.some((t) => t.id === target.id)).toBe(true);
    const r = await handOverWork(emp.id, target.id, hr, 'resigned');
    expect(r.moved.leads).toBe(1);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))!.assigned_to_id).toBe(
      target.id,
    );
  });

  it('handover refuses a target who cannot take the work', async () => {
    await expect(handOverWork(leaver.id, hr.employeeId, hr, 'resigned')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('follow-up reminders skip leads whose owner has left', async () => {
    const emp = await makeEmployee('STALEOWNER', Roles.TELECALLER, { status: 'RESIGNED' });
    const lead = await makeLead(emp.id);
    await prisma.lead.update({
      where: { id: lead.id },
      data: { created_at: new Date(Date.now() - 10 * DAY) },
    });
    await leadFollowUpJob();
    expect(
      await prisma.notification.count({
        where: { employee_id: emp.id, type: 'LEAD_FOLLOW_UP_REMINDER' },
      }),
    ).toBe(0);
  });
});
