import { Prisma } from '@prisma/client';

/** Call-back tasks are the follow-up tasks logCall creates, titled "Call back <customer>". */
export const CALL_BACK_TITLE_PREFIX = 'Call back ';

/**
 * Closes a lead's open call-back tasks.
 *
 * Nothing used to close them: logging the promised call, transferring the
 * lead, dropping it or booking it all left every earlier "Call back" task
 * pending until it went overdue -- so a telecaller who did exactly what the
 * task asked still collected an overdue penalty, and the dashboard's
 * "call-backs due" count never went down.
 *
 * COMPLETED = the call was made (no performance points: those are awarded only
 * through the task-status route). CANCELLED = the task no longer applies
 * (lead moved to someone else, dropped or booked).
 */
export async function closeCallBackTasks(
  tx: Prisma.TransactionClient,
  leadId: number,
  opts: { outcome: 'COMPLETED' | 'CANCELLED'; assigneeId?: number },
): Promise<number> {
  const res = await tx.task.updateMany({
    where: {
      lead_id: leadId,
      title: { startsWith: CALL_BACK_TITLE_PREFIX },
      status: { notIn: ['COMPLETED', 'CANCELLED', 'NOT_COMPLETED', 'BLOCKED'] },
      ...(opts.assigneeId !== undefined ? { assignee_id: opts.assigneeId } : {}),
    },
    data: {
      status: opts.outcome,
      ...(opts.outcome === 'COMPLETED' ? { completed_at: new Date() } : {}),
    },
  });
  return res.count;
}
