import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { getISTComponents } from '../../utils/time';
import { notifyEmployee } from '../../utils/notifyEmployee';
import { logger } from '../../utils/logger';
import { AppError } from './errors';

const p = prisma;

// Only leads nobody has called yet are moved: once a telecaller has spoken to
// a customer the lead's history belongs with them.
const MOVABLE_STATUSES = ['NEW', 'ASSIGNED'];
const notCalled = { activities: { none: { activity_type: 'CALL_LOGGED' } } };

const istDayRange = (day: string) => {
  const start = new Date(`${day}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime())) throw new AppError(400, 'Invalid date');
  return { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

/**
 * The not-yet-called leads sitting with one employee, grouped by upload:
 * who added them, from which source, on which (IST) day. Lets a manager see
 * e.g. "100 leads Sravathi uploaded on 4 Oct landed here" and move them.
 */
export async function listUploadBatches(user: TokenPayload, employeeId: number) {
  const leads = await p.lead.findMany({
    where: {
      company_id: user.companyId,
      assigned_to_id: employeeId,
      status: { in: MOVABLE_STATUSES },
      ...notCalled,
    },
    select: {
      created_at: true,
      source: true,
      created_by_id: true,
      created_by: { select: { full_name: true, employee_code: true } },
    },
  });

  const batches = new Map<
    string,
    {
      created_by_id: number | null;
      created_by_name: string;
      source: string;
      day: string;
      count: number;
    }
  >();
  for (const l of leads) {
    const day = getISTComponents(l.created_at).dateString;
    const key = `${l.created_by_id ?? 0}|${l.source}|${day}`;
    const b = batches.get(key);
    if (b) b.count += 1;
    else
      batches.set(key, {
        created_by_id: l.created_by_id,
        created_by_name:
          l.created_by?.full_name || l.created_by?.employee_code || 'Website / system',
        source: l.source,
        day,
        count: 1,
      });
  }
  return [...batches.values()].sort((a, b) => b.day.localeCompare(a.day) || b.count - a.count);
}

/** Moves one upload batch's not-yet-called leads to another employee. */
export async function moveUploadBatch(
  user: TokenPayload,
  input: {
    from_employee_id: number;
    to_employee_id: number;
    created_by_id: number | null;
    source: string;
    day: string;
    reason: string;
  },
) {
  if (input.from_employee_id === input.to_employee_id) {
    throw new AppError(400, 'Pick a different person to move the leads to');
  }
  const target = await p.employee.findFirst({
    where: { id: input.to_employee_id, company_id: user.companyId, status: 'ACTIVE' },
    select: { id: true, full_name: true, employee_code: true },
  });
  if (!target) throw new AppError(404, 'Employee to move the leads to was not found');

  const leads = await p.lead.findMany({
    where: {
      company_id: user.companyId,
      assigned_to_id: input.from_employee_id,
      created_by_id: input.created_by_id,
      source: input.source,
      created_at: istDayRange(input.day),
      status: { in: MOVABLE_STATUSES },
      ...notCalled,
    },
    select: { id: true },
  });
  if (leads.length === 0) throw new AppError(404, 'No uncalled leads left in this batch');

  const ids = leads.map((l) => l.id);
  const targetName = target.full_name || target.employee_code;
  const now = new Date();

  await p.$transaction(async (tx) => {
    await tx.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        assigned_to_id: target.id,
        assigned_at: now,
        assignment_type: 'MANUAL_OVERRIDE',
        status: 'ASSIGNED',
      },
    });
    await tx.leadActivity.createMany({
      data: ids.map((id) => ({
        lead_id: id,
        actor_id: user.employeeId,
        activity_type: 'ASSIGNED_TO_AGENT',
        notes: `Moved with its upload batch to ${targetName}. Reason: ${input.reason}`,
      })),
    });
    await tx.auditEvent.create({
      data: {
        actor_id: user.employeeId,
        action: 'LEAD_BATCH_REASSIGNED',
        entity_type: 'EMPLOYEE',
        entity_id: input.from_employee_id,
        old_value: JSON.stringify({ assigned_to_id: input.from_employee_id }),
        new_value: JSON.stringify({ ...input, lead_ids: ids }),
      },
    });
    await tx.notification.create({
      data: {
        employee_id: target.id,
        type: 'TARGET_ASSIGNED',
        title: `${ids.length} leads assigned to you`,
        message: `${ids.length} leads were moved to you. Reason: ${input.reason}`,
      },
    });
  });

  notifyEmployee(
    target.id,
    {
      type: 'TARGET_ASSIGNED',
      title: `${ids.length} leads assigned to you`,
      message: `${ids.length} leads were moved to you.`,
    },
    { skipDbNotification: true },
  ).catch((err) => logger.error('[WebPush] Lead batch move:', err));

  return { moved: ids.length, to: targetName };
}
