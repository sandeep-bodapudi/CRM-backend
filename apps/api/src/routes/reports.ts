import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { validateRequestBody } from '../middleware/validate';
import { DailyReportSchema, Roles } from '../shared';
import { getISTComponents } from '../utils/time';
import { WORK_LOG_ACTION, parseWorkLog } from './workLog';
import {
  istDayRange,
  verifiedActivityToday,
  judgeToday,
  buildSheet,
  reportRole,
  checkedOutToday,
  recordedSnapshot,
  checkTyped,
  FIELD_LABELS,
} from '../services/dailyReport';

const router = Router();

const p = prisma;

const isExempt = (roles: string[]) => roles.includes(Roles.MD) || roles.includes(Roles.ADMIN);

async function todaysReport(employeeId: number) {
  const { start, end } = istDayRange();
  return p.dailyReport.findFirst({
    where: { employee_id: employeeId, submitted_at: { gte: start, lt: end } },
  });
}

// GET /api/v1/reports/today-activity - what the system recorded for me today
// (shown on the daily report form next to the self-reported numbers).
router.get(
  '/today-activity',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      return res.status(200).json(await verifiedActivityToday(req.user!.employeeId));
    } catch (error) {
      logger.error('Today activity error:', error);
      return res.status(500).json({ error: "Failed to load today's activity" });
    }
  },
);

// GET /api/v1/reports/today?role= - the end-of-day report form for today:
// the fields with what the CRM recorded, the live target check, and the
// report already sent (editable until the QR checkout).
router.get('/today', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId, companyId, roles } = req.user!;
    const role = reportRole(roles, typeof req.query.role === 'string' ? req.query.role : null);
    const [fields, judged, report, checkedOut, me] = await Promise.all([
      buildSheet(employeeId, companyId, role),
      judgeToday(employeeId, companyId, role),
      todaysReport(employeeId),
      checkedOutToday(employeeId),
      p.employee.findUnique({ where: { id: employeeId }, select: { report_required: true } }),
    ]);
    return res.status(200).json({
      role,
      required: !!me?.report_required && !isExempt(roles),
      fields,
      checks: judged.checks,
      below_target: judged.below,
      report: report
        ? {
            id: report.id,
            submitted_at: report.submitted_at,
            summary: report.summary,
            below_target_reason: report.below_target_reason,
            target_met: report.target_met,
            typed: ((report.metrics_json as any)?.typed as Record<string, unknown>) || {},
          }
        : null,
      checked_out: checkedOut,
      can_edit: !!report && !checkedOut,
    });
  } catch (error) {
    logger.error('Today report form error:', error);
    return res.status(500).json({ error: "Could not load today's report" });
  }
});

// POST /api/v1/reports/daily - Submit the end-of-day report (one per IST day)
router.post(
  '/daily',
  authenticateToken,
  validateRequestBody(DailyReportSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { employeeId, companyId, roles } = req.user!;
      const { role_name, metrics, summary_notes, below_target_reason } = req.body;
      const now = new Date();

      // One report per IST day. Several submissions on the same day each
      // earned the "target exceeded" bonus again.
      if (await todaysReport(employeeId)) {
        return res.status(409).json({ error: "You have already submitted today's report." });
      }

      const role = reportRole(roles, role_name);
      const typedValues: Record<string, unknown> = { ...(metrics || {}) };
      const [fields, judged] = await Promise.all([
        buildSheet(employeeId, companyId, role),
        judgeToday(employeeId, companyId, role),
      ]);
      const typedError = checkTyped(fields, typedValues);
      if (typedError) return res.status(400).json({ error: typedError });

      // Judged on what the CRM recorded, never on the typed numbers: reports
      // used to say "100 calls" on days with nothing logged. The typed figures
      // are kept beside the recorded ones so the two can be compared.
      const { calls, visits, deals, below: isBelowTarget, exceeded: isTargetExceeded } = judged;
      const missedMetrics = judged.missedMetrics;
      if (isBelowTarget && (!below_target_reason || below_target_reason.trim().length < 15)) {
        return res.status(400).json({
          error: `Below target (${missedMetrics.join(', ')}). Explain why in at least 15 characters.`,
          isBelowTarget: true,
          missedMetrics,
        });
      }

      const num = (v: unknown) => {
        const n = parseInt(String(v ?? ''), 10);
        return Number.isFinite(n) ? n : 0;
      };
      const reportedCalls = num(
        typedValues.calls ?? typedValues.callsMade ?? typedValues.totalCalls,
      );

      const report = await p.dailyReport.create({
        data: {
          employee_id: employeeId,
          submitted_at: now,
          summary: summary_notes || 'Daily work summary submitted.',
          call_count: reportedCalls,
          site_visit_count: visits,
          closed_deal_count: deals,
          target_met: !isBelowTarget,
          below_target_reason: isBelowTarget ? below_target_reason : null,
          metrics_json: {
            role,
            typed: typedValues as any,
            recorded: recordedSnapshot(fields),
            verified_calls: calls,
            verified_leads_worked: judged.verified.leads_worked,
            verified_visits: visits,
            verified_deals: deals,
          },
        },
      });

      await p.auditEvent.create({
        data: {
          actor_id: employeeId,
          action: 'SUBMIT_DAILY_REPORT',
          entity_type: 'DAILY_REPORT',
          entity_id: report.id,
          new_value: JSON.stringify({
            calls,
            reported_calls: reportedCalls,
            visits,
            deals,
            isBelowTarget,
          }),
        },
      });

      // Penalty / bonus are decided once, at the first submission.
      if (isBelowTarget) {
        await p.auditEvent.create({
          data: {
            actor_id: employeeId,
            action: 'DAILY_REPORT_BELOW_TARGET',
            entity_type: 'DAILY_REPORT',
            entity_id: report.id,
            new_value: JSON.stringify({ reason: below_target_reason, missedMetrics }),
          },
        });
      } else if (isTargetExceeded) {
        await p.auditEvent.create({
          data: {
            actor_id: employeeId,
            action: 'DAILY_REPORT_TARGET_EXCEEDED',
            entity_type: 'DAILY_REPORT',
            entity_id: report.id,
            new_value: JSON.stringify({ calls, visits, deals }),
          },
        });
      }

      // Submitting never checks the person out: that happens only by
      // scanning the QR (routes/attendance/qr.ts), which needs this report.
      return res.status(201).json({
        message: 'Report sent. You can check out by scanning the QR.',
        reportId: report.id,
        submittedAt: report.submitted_at,
        isBelowTarget,
      });
    } catch (error: any) {
      logger.error('Submit report error:', error);
      return res.status(500).json({ error: 'Failed to submit daily report' });
    }
  },
);

const DailyReportEditSchema = z.object({
  metrics: z.record(z.any()).default({}),
  summary_notes: z.string().trim().min(5, 'Summary must be at least 5 characters'),
  below_target_reason: z.string().trim().optional().nullable(),
});

// PUT /api/v1/reports/daily/:id - correct today's report until the QR checkout.
// The typed parts change; recorded numbers are refreshed; the judgement made at
// submission (penalty / bonus) stays. Every edit is kept as an audit event.
router.put(
  '/daily/:id',
  authenticateToken,
  validateRequestBody(DailyReportEditSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { employeeId, companyId, roles } = req.user!;
      const id = parseInt(req.params.id, 10);
      const report = await todaysReport(employeeId);
      if (!report || report.id !== id) {
        return res.status(404).json({ error: 'Only today’s own report can be changed.' });
      }
      if (await checkedOutToday(employeeId)) {
        return res
          .status(409)
          .json({ error: 'You have checked out for today, so the report is final.' });
      }
      const { metrics, summary_notes, below_target_reason } = req.body as z.infer<
        typeof DailyReportEditSchema
      >;
      const old = (report.metrics_json as any) || {};
      const role = reportRole(roles, old.role);
      const fields = await buildSheet(employeeId, companyId, role);
      const typedError = checkTyped(fields, metrics);
      if (typedError) return res.status(400).json({ error: typedError });
      if (!report.target_met && (!below_target_reason || below_target_reason.length < 15)) {
        return res
          .status(400)
          .json({ error: 'Explain why the target was missed in at least 15 characters.' });
      }

      const updated = await p.dailyReport.update({
        where: { id: report.id },
        data: {
          summary: summary_notes,
          below_target_reason: report.target_met ? null : below_target_reason,
          metrics_json: { ...old, typed: metrics, recorded: recordedSnapshot(fields) },
        },
      });
      await p.auditEvent.create({
        data: {
          actor_id: employeeId,
          action: 'DAILY_REPORT_EDITED',
          entity_type: 'DAILY_REPORT',
          entity_id: report.id,
          old_value: JSON.stringify({
            summary: report.summary,
            below_target_reason: report.below_target_reason,
            typed: old.typed || {},
          }),
          new_value: JSON.stringify({
            summary: summary_notes,
            below_target_reason,
            typed: metrics,
          }),
        },
      });
      return res.status(200).json({ message: 'Report updated.', reportId: updated.id });
    } catch (error) {
      logger.error('Edit report error:', error);
      return res.status(500).json({ error: 'Could not update the report' });
    }
  },
);

// GET /api/v1/reports/today-status - Check report status for Logout Gate
router.get('/today-status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeId = req.user!.employeeId;
    if (isExempt(req.user!.roles)) {
      return res.status(200).json({ submitted: true, exempt: true });
    }
    const report = await todaysReport(employeeId);
    return res.status(200).json({
      submitted: !!report,
      exempt: false,
      reportId: report?.id || null,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to check report status' });
  }
});

// GET /api/v1/reports/my-history - Fetch report history for the logged in employee
router.get('/my-history', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeId = req.user!.employeeId;
    const { days } = req.query;

    // Default to last 7 days
    const limitDays = days ? parseInt(days as string, 10) : 7;
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - limitDays);

    const reports = await p.dailyReport.findMany({
      where: { employee_id: employeeId, submitted_at: { gte: pastDate } },
      orderBy: { submitted_at: 'desc' },
    });

    return res.status(200).json({ reports });
  } catch (error) {
    logger.error('Fetch my-history error:', error);
    return res.status(500).json({ error: 'Failed to fetch report history' });
  }
});

// GET /api/v1/reports/all?date= - the day's reports for HR / MD, plus who has
// not sent one yet (checked in that day, report required, no report).
router.get(
  '/all',
  authenticateToken,
  requireRole([Roles.MD, Roles.ADMIN, Roles.HR_MANAGER]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { date } = req.query;
      const dateString =
        typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? date
          : getISTComponents(new Date()).dateString;
      const start = new Date(`${dateString}T00:00:00+05:30`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const companyId = req.user!.companyId;

      const [reports, logs] = await Promise.all([
        p.dailyReport.findMany({
          where: {
            submitted_at: { gte: start, lt: end },
            employee: { company_id: companyId },
          },
          include: {
            employee: {
              select: {
                full_name: true,
                employee_code: true,
                department: true,
                roles: { include: { role: true } },
              },
            },
          },
          orderBy: { submitted_at: 'desc' },
        }),
        p.attendanceLog.findMany({
          where: {
            check_in_at: { gte: start, lt: end },
            employee: { company_id: companyId, status: 'ACTIVE', report_required: true },
          },
          select: {
            check_in_at: true,
            check_out_at: true,
            employee: { select: { id: true, full_name: true, employee_code: true } },
          },
          orderBy: { check_in_at: 'asc' },
        }),
      ]);
      const sent = new Set(reports.map((r) => r.employee_id));
      const seen = new Set<number>();
      const missing = logs
        .filter(
          (l) => !sent.has(l.employee.id) && !seen.has(l.employee.id) && seen.add(l.employee.id),
        )
        .map((l) => ({
          id: l.employee.id,
          full_name: l.employee.full_name,
          employee_code: l.employee.employee_code,
          checked_in_at: l.check_in_at,
          checked_out_at: l.check_out_at,
        }));

      return res.status(200).json({ date: dateString, reports, missing });
    } catch (error) {
      logger.error('Fetch all reports error:', error);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }
  },
);

// GET /api/v1/reports/:id - one report, with that day's Work Log and its edits
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reportId = parseInt(req.params.id, 10);
    const { employeeId, roles, companyId } = req.user!;

    if (isNaN(reportId)) return res.status(400).json({ error: 'Invalid report ID' });

    const report = await p.dailyReport.findUnique({
      where: { id: reportId },
      include: {
        employee: { select: { full_name: true, employee_code: true, company_id: true } },
      },
    });

    if (!report) return res.status(404).json({ error: 'Report not found' });

    // Their own report, or HR / MD / Admin of the same company.
    const canAccess =
      report.employee_id === employeeId ||
      (report.employee.company_id === companyId &&
        (roles.includes(Roles.MD) ||
          roles.includes(Roles.ADMIN) ||
          roles.includes(Roles.HR_MANAGER)));
    if (!canAccess) return res.status(403).json({ error: 'Unauthorized to view this report' });

    const { start, end } = istDayRange(report.submitted_at);
    const [workLogRows, edits] = await Promise.all([
      p.auditEvent.findMany({
        where: {
          actor_id: report.employee_id,
          action: WORK_LOG_ACTION,
          created_at: { gte: start, lt: end },
        },
        select: { id: true, new_value: true, created_at: true },
        orderBy: { created_at: 'asc' },
      }),
      p.auditEvent.findMany({
        where: { action: 'DAILY_REPORT_EDITED', entity_type: 'DAILY_REPORT', entity_id: report.id },
        select: { created_at: true, old_value: true, new_value: true },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    return res.status(200).json({
      report,
      labels: FIELD_LABELS,
      work_log: workLogRows.map(parseWorkLog).filter(Boolean),
      edits: edits.map((e) => ({
        at: e.created_at,
        before: JSON.parse(e.old_value || '{}'),
        after: JSON.parse(e.new_value || '{}'),
      })),
    });
  } catch (error) {
    logger.error('Fetch single report error:', error);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
});

export default router;
