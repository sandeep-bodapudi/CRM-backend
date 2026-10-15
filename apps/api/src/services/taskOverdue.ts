import { prisma } from '../lib/prisma';
import { Roles } from '../shared';
import { logger } from '../utils/logger';

const p = prisma;

export const OPEN_TASK_STATUSES = ['PENDING', 'IN_PROGRESS'];

/**
 * A task is overdue as soon as its target time has passed -- whether or not
 * the stored status has been flipped to OVERDUE yet. Reading code must use
 * this (or overdueInPeriod) instead of trusting the stored status alone,
 * because the status only changes when the sweep below runs, and that cannot
 * be guaranteed on a server that sleeps.
 */
export const isTaskOverdue = (
  t: { status: string; target_date: Date | string },
  now: Date = new Date(),
) =>
  t.status === 'OVERDUE' ||
  (OPEN_TASK_STATUSES.includes(t.status) && new Date(t.target_date) < now);

/**
 * Prisma `where` for "this person's tasks that count as overdue in the
 * period": already flipped (judged by when they flipped, as before) or still
 * open with a target time that has passed inside the period.
 */
export const overdueInPeriod = (from: Date, to: Date, now: Date = new Date()) => ({
  OR: [
    { status: 'OVERDUE', updated_at: { gte: from, lte: to } },
    { status: { in: OPEN_TASK_STATUSES }, target_date: { gte: from, lte: to, lt: now } },
  ],
});

/**
 * Flips every open task past its target time to OVERDUE in ONE statement and
 * tells each company's MD once with a summary. This used to run inside the
 * task-list GET requests: a per-task update + notification loop on every page
 * load (N+1 queries, and duplicate alerts when two requests overlapped).
 */
export async function sweepOverdueTasks(now: Date = new Date()): Promise<number> {
  const due = await p.task.findMany({
    where: { status: { in: OPEN_TASK_STATUSES }, target_date: { lt: now } },
    select: {
      id: true,
      title: true,
      assignee: { select: { company_id: true, employee_code: true } },
    },
    take: 5000,
  });
  if (due.length === 0) return 0;

  const flipped = await p.task.updateMany({
    where: { id: { in: due.map((t) => t.id) }, status: { in: OPEN_TASK_STATUSES } },
    data: { status: 'OVERDUE' },
  });

  const byCompany = new Map<number, typeof due>();
  for (const t of due) {
    const cid = t.assignee?.company_id;
    if (cid == null) continue;
    byCompany.set(cid, [...(byCompany.get(cid) || []), t]);
  }
  const mds = await p.employee.findMany({
    where: {
      company_id: { in: [...byCompany.keys()] },
      status: 'ACTIVE',
      roles: { some: { role: { name: Roles.MD } } },
    },
    select: { id: true, company_id: true },
  });
  const mdByCompany = new Map<number, number>();
  for (const md of mds) if (!mdByCompany.has(md.company_id)) mdByCompany.set(md.company_id, md.id);

  const notifications = [...byCompany.entries()]
    .filter(([cid]) => mdByCompany.has(cid))
    .map(([cid, tasks]) => {
      const sample = tasks
        .slice(0, 3)
        .map((t) => `"${t.title}" (${t.assignee?.employee_code || 'staff'})`)
        .join(', ');
      return {
        employee_id: mdByCompany.get(cid)!,
        title: '🚨 OVERDUE TASK ALERT',
        message: `${tasks.length} task${tasks.length === 1 ? ' is' : 's are'} now past deadline: ${sample}${tasks.length > 3 ? ` and ${tasks.length - 3} more` : ''}.`,
        type: 'TASK_OVERDUE' as const,
      };
    });
  if (notifications.length > 0) await p.notification.createMany({ data: notifications });

  logger.info(`[Jobs] Overdue task sweep flipped ${flipped.count} task(s).`);
  return flipped.count;
}
