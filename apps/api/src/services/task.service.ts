import { prisma } from '../lib/prisma';
import { TokenPayload } from '../utils/jwt';
import { Roles, Permissions, TaskFinishInput, TaskReviewInput } from '../shared';
import { can } from '../authz/authorization';
import { getDownstreamEmployeeIds } from '../utils/hierarchy';
import { notifyEmployee } from '../utils/notifyEmployee';

const p = prisma;

export class TaskError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Statuses after which the assignee has nothing left to do (until the assigner reopens). */
export const FINISHED_TASK_STATUSES = ['COMPLETED', 'CANCELLED', 'NOT_COMPLETED', 'BLOCKED'];
/** Reports waiting for the assigner's decision. */
export const REVIEWABLE_TASK_STATUSES = ['NOT_COMPLETED', 'BLOCKED'];

const MAX_RESCHEDULE_DAYS = 60;

/**
 * +1.0 performance point for completing a task someone ELSE assigned, once per
 * task and to the person it belongs to. Tasks people assign to themselves earn
 * nothing (otherwise anyone could inflate their score with trivial tasks).
 */
export async function awardTaskCompletion(
  task: { id: number; created_by: number; assignee_id: number },
  title: string,
  actorEmployeeId: number,
) {
  const isSelfAssigned = task.created_by === task.assignee_id;
  if (isSelfAssigned) {
    await p.notification.create({
      data: {
        employee_id: actorEmployeeId,
        title: '✅ Task Completed',
        message: `You completed "${title}". Self-assigned tasks don't count toward performance.`,
        type: 'SYSTEM_ALERT',
      },
    });
    return;
  }
  const alreadyAwarded =
    (await p.auditEvent.count({
      where: { action: 'TASK_COMPLETED', entity_type: 'TASK', entity_id: task.id },
    })) > 0;
  if (alreadyAwarded) return;

  await p.auditEvent.create({
    data: {
      actor_id: task.assignee_id,
      action: 'TASK_COMPLETED',
      entity_type: 'TASK',
      entity_id: task.id,
      new_value: JSON.stringify({ points: 1.0, taskTitle: title }),
    },
  });
  await p.notification.create({
    data: {
      employee_id: task.assignee_id,
      title: '🎉 Task Completed!',
      message: `Great job! You completed "${title}" and earned +1.0 performance points!`,
      type: 'SYSTEM_ALERT',
    },
  });
}

async function loadTaskForUpdate(user: TokenPayload, taskId: number) {
  const task = await p.task.findFirst({
    where: { id: taskId },
    include: { assignee: { select: { company_id: true } } },
  });
  if (!task) throw new TaskError(404, 'Task not found');
  const downstreamIds = await getDownstreamEmployeeIds(user.companyId, user.employeeId);
  const context = {
    ...task,
    assignee: { ...task.assignee, company_id: task.assignee?.company_id },
    _isSubordinate: downstreamIds.includes(task.assignee_id),
  };
  if (!can(user, Permissions.TASKS_UPDATE, context)) {
    throw new TaskError(403, 'Forbidden: Cannot update this task');
  }
  return task;
}

const OUTCOME_LABEL: Record<string, string> = {
  COMPLETED: 'completed',
  NOT_COMPLETED: 'could not be completed',
  BLOCKED: 'is blocked',
  NEED_MORE_TIME: 'needs more time',
};

/**
 * Finish a task with an outcome and a note, so the assigner learns what
 * happened instead of just seeing it stay open or turn overdue.
 */
export async function finishTask(user: TokenPayload, taskId: number, input: TaskFinishInput) {
  const task = await loadTaskForUpdate(user, taskId);
  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
    throw new TaskError(409, 'This task is already closed');
  }
  if (REVIEWABLE_TASK_STATUSES.includes(task.status)) {
    throw new TaskError(
      409,
      task.reviewed_at
        ? 'This task was reported as not done and the report was accepted'
        : 'This task has already been reported and is waiting for review',
    );
  }

  const now = new Date();
  const feedback = input.feedback?.trim() || null;
  const selfAssigned = task.created_by === task.assignee_id;
  const data: Record<string, unknown> = {
    outcome: input.outcome,
    feedback,
    feedback_at: now,
    reviewed_at: null,
    reviewed_by: null,
    review_note: null,
  };

  if (input.outcome === 'COMPLETED') {
    data.status = 'COMPLETED';
    data.completed_at = now;
  } else if (input.outcome === 'NEED_MORE_TIME') {
    const newDate = new Date(input.reschedule_to as string);
    if (Number.isNaN(newDate.getTime()) || newDate.getTime() <= now.getTime()) {
      throw new TaskError(400, 'Choose a new date and time in the future');
    }
    if (newDate.getTime() > now.getTime() + MAX_RESCHEDULE_DAYS * 24 * 3600 * 1000) {
      throw new TaskError(400, `The new date can be at most ${MAX_RESCHEDULE_DAYS} days away`);
    }
    data.status = 'PENDING';
    data.target_date = newDate;
    data.reschedule_to = newDate;
  } else {
    data.status = input.outcome; // NOT_COMPLETED | BLOCKED
    // Nobody to review a task you gave yourself.
    if (selfAssigned) {
      data.reviewed_at = now;
      data.reviewed_by = user.employeeId;
    }
  }

  const updated = await p.task.update({ where: { id: taskId }, data });

  await p.auditEvent.create({
    data: {
      actor_id: user.employeeId,
      action: 'TASK_FINISHED',
      entity_type: 'TASK',
      entity_id: taskId,
      old_value: JSON.stringify({ status: task.status, target_date: task.target_date }),
      new_value: JSON.stringify({
        outcome: input.outcome,
        feedback,
        target_date: updated.target_date,
      }),
    },
  });

  const cheerUp = input.outcome === 'COMPLETED' && task.status !== 'COMPLETED';
  if (cheerUp) await awardTaskCompletion(task, updated.title, user.employeeId);

  // Tell whoever assigned it (unless that is the same person).
  if (!selfAssigned) {
    await notifyEmployee(task.created_by, {
      type: 'SYSTEM_ALERT',
      title: `Task update: ${updated.title}`,
      message: `${OUTCOME_LABEL[input.outcome]}${feedback ? ` — "${feedback}"` : ''}.${
        REVIEWABLE_TASK_STATUSES.includes(updated.status)
          ? ' Open Tasks to accept or send it back.'
          : ''
      }`,
      link: '/tasks',
    }).catch(() => undefined);
  }

  return { task: updated, cheerUp };
}

/**
 * The assigner's decision on a "not completed" / "blocked" report: ACCEPT it
 * (neutral: no points, no overdue) or REOPEN it (an ordinary open task again,
 * overdue if its date has passed).
 */
export async function reviewTask(user: TokenPayload, taskId: number, input: TaskReviewInput) {
  const task = await p.task.findFirst({ where: { id: taskId } });
  if (!task) throw new TaskError(404, 'Task not found');
  const isAssigner = task.created_by === user.employeeId;
  const isManagement = user.roles.includes(Roles.MD) || user.roles.includes(Roles.ADMIN);
  if (!isAssigner && !isManagement) {
    throw new TaskError(403, 'Only the person who assigned this task can review it');
  }
  if (!REVIEWABLE_TASK_STATUSES.includes(task.status) || task.reviewed_at) {
    throw new TaskError(409, 'This task has no report waiting for review');
  }

  const now = new Date();
  const data: Record<string, unknown> = {
    reviewed_at: now,
    reviewed_by: user.employeeId,
    review_note: input.note?.trim() || null,
  };
  if (input.action === 'REOPEN') {
    data.status = 'PENDING';
    if (input.new_date) {
      const d = new Date(input.new_date);
      if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime()) {
        throw new TaskError(400, 'Choose a new date and time in the future');
      }
      data.target_date = d;
    }
  }

  const updated = await p.task.update({ where: { id: taskId }, data });
  await p.auditEvent.create({
    data: {
      actor_id: user.employeeId,
      action: 'TASK_REVIEWED',
      entity_type: 'TASK',
      entity_id: taskId,
      new_value: JSON.stringify({ action: input.action, note: input.note ?? null }),
    },
  });
  await notifyEmployee(task.assignee_id, {
    type: 'SYSTEM_ALERT',
    title: `Task ${input.action === 'ACCEPT' ? 'report accepted' : 'sent back'}: ${updated.title}`,
    message:
      input.action === 'ACCEPT'
        ? `Your report was accepted${input.note ? `: "${input.note}"` : '.'}`
        : `Please do this task again${input.note ? `: "${input.note}"` : '.'}`,
    link: '/tasks',
  }).catch(() => undefined);

  return updated;
}
