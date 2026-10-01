import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { validateRequestBody } from '../middleware/validate';
import { DailyReportSchema, Roles } from '../shared';
import { getISTComponents } from '../utils/time';

const router = Router();

const p = prisma;

/** [start, end) of the current IST calendar day as UTC instants. */
function istTodayRange(now = new Date()) {
  const { dateString } = getISTComponents(now);
  const start = new Date(`${dateString}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000), dateString };
}

/**
 * What the system itself recorded for this employee today. Calls are the
 * logged call attempts (POST /leads/:id/calls); leads worked counts every
 * lead they actually acted on (imports excluded).
 */
async function verifiedActivityToday(employeeId: number) {
  const { start, end } = istTodayRange();
  const [calls, leadsWorked] = await Promise.all([
    p.leadActivity.count({
      where: {
        actor_id: employeeId,
        activity_type: 'CALL_LOGGED',
        created_at: { gte: start, lt: end },
      },
    }),
    p.leadActivity.findMany({
      where: {
        actor_id: employeeId,
        activity_type: { notIn: ['LEAD_CREATED', 'ASSIGNED_TO_AGENT'] },
        created_at: { gte: start, lt: end },
      },
      select: { lead_id: true },
      distinct: ['lead_id'],
    }),
  ]);
  return { calls, leads_worked: leadsWorked.length };
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

// POST /api/v1/reports/daily - Submit Daily Report with Below-Target Validation
router.post(
  '/daily',
  authenticateToken,
  validateRequestBody(DailyReportSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;
      const { role_name, metrics, summary_notes, below_target_reason } = req.body;
      const now = new Date();

      // One report per IST day. Several submissions on the same day each
      // earned the "target exceeded" bonus again.
      const { start: dayStart, end: dayEnd } = istTodayRange(now);
      const existing = await p.dailyReport.findFirst({
        where: { employee_id: employeeId, submitted_at: { gte: dayStart, lt: dayEnd } },
        select: { id: true },
      });
      if (existing) {
        return res.status(409).json({ error: "You have already submitted today's report." });
      }

      // Calls are judged on what the system recorded (logged call attempts),
      // not the number typed into the form. Points/penalties used to follow
      // the typed number, which rewarded typing the target (production
      // reports said "100 calls" on days with zero recorded activity). The
      // typed figure is still stored, so the two can be compared.
      const reportedCalls = parseInt(metrics?.callsMade || metrics?.call_count || '0', 10);
      const verified = await verifiedActivityToday(employeeId);
      const calls = verified.calls;
      const visits = parseInt(metrics?.siteVisits || metrics?.site_visit_count || '0', 10);
      const deals = parseInt(metrics?.leadsQualified || metrics?.closed_deal_count || '0', 10);

      // Resolve Active Target for employee/role safely
      let activeTarget: any = null;
      if (p.dailyTarget) {
        activeTarget = await p.dailyTarget.findFirst({
          where: {
            company_id: req.user!.companyId,
            OR: [
              { employee_id: employeeId },
              { role_name: role_name || 'Telecaller', employee_id: null },
            ],
          },
          orderBy: [{ employee_id: 'desc' }, { created_at: 'desc' }],
        });
      }

      let isBelowTarget = false;
      let isTargetExceeded = false;
      const missedMetrics: string[] = [];

      if (activeTarget) {
        if (calls < activeTarget.calls_target) {
          isBelowTarget = true;
          missedMetrics.push(`Calls logged in CRM: ${calls}/${activeTarget.calls_target}`);
        }
        if (visits < activeTarget.site_visits_target) {
          isBelowTarget = true;
          missedMetrics.push(`Site Visits: ${visits}/${activeTarget.site_visits_target}`);
        }
        if (deals < activeTarget.closed_deals_target) {
          isBelowTarget = true;
          missedMetrics.push(`Deals: ${deals}/${activeTarget.closed_deals_target}`);
        }

        if (
          !isBelowTarget &&
          (calls > activeTarget.calls_target ||
            visits > activeTarget.site_visits_target ||
            deals > activeTarget.closed_deals_target)
        ) {
          isTargetExceeded = true;
        }
      }

      // Require min 15-char reason if below target
      if (isBelowTarget && (!below_target_reason || below_target_reason.trim().length < 15)) {
        return res.status(400).json({
          error: `Your submitted metrics are below target (${missedMetrics.join(', ')}). A valid explanation (minimum 15 characters) is required.`,
          isBelowTarget: true,
          missedMetrics,
        });
      }

      // Save Daily Report
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
            ...(metrics || {}),
            verified_calls: verified.calls,
            verified_leads_worked: verified.leads_worked,
          },
        },
      });

      // Write Audit Event safely supporting schema variations
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

      // Stamp penalty audit event if submitted below target with reason
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

      // Submitting a report never performs the checkout itself — it only
      // satisfies routes/attendance/qr.ts's report_required prerequisite,
      // which still gates the actual checkout on scanning the kiosk QR.
      // Previously this route also force-closed the attendance log
      // (check_out_at = submission time) with no time-of-day gate at all, so
      // submitting a report at any hour immediately logged the employee out
      // — bypassing the 18:00 / approved-EARLY_CHECKOUT-proposal rule kiosk
      // checkout enforces. Logout/checkout now happens only via QR kiosk scan.

      return res.status(201).json({
        message: 'Daily report submitted successfully. Logout gate unlocked.',
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

// GET /api/v1/reports/today-status - Check report status for Logout Gate
router.get('/today-status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeId = req.user!.employeeId;
    const roles = req.user!.roles;
    const { dateString } = getISTComponents(new Date());

    if (roles.includes(Roles.MD) || roles.includes(Roles.ADMIN)) {
      return res.status(200).json({ submitted: true, exempt: true });
    }

    const report = await p.dailyReport.findFirst({
      where: {
        employee_id: employeeId,
        submitted_at: {
          gte: new Date(`${dateString}T00:00:00.000Z`),
          lte: new Date(`${dateString}T23:59:59.999Z`),
        },
      },
    });

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
      where: {
        employee_id: employeeId,
        submitted_at: {
          gte: pastDate,
        },
      },
      orderBy: {
        submitted_at: 'desc',
      },
    });

    return res.status(200).json({ reports });
  } catch (error) {
    logger.error('Fetch my-history error:', error);
    return res.status(500).json({ error: 'Failed to fetch report history' });
  }
});

// GET /api/v1/reports/all - Fetch all daily reports for HR/MD
router.get(
  '/all',
  authenticateToken,
  requireRole([Roles.MD, Roles.ADMIN, Roles.HR_MANAGER]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { date } = req.query;

      // Determine date range (defaults to today IST)
      let startDate: Date;
      let endDate: Date;

      if (date && typeof date === 'string') {
        startDate = new Date(`${date}T00:00:00.000Z`);
        endDate = new Date(`${date}T23:59:59.999Z`);
      } else {
        const { dateString } = getISTComponents(new Date());
        startDate = new Date(`${dateString}T00:00:00.000Z`);
        endDate = new Date(`${dateString}T23:59:59.999Z`);
      }

      const reports = await p.dailyReport.findMany({
        where: {
          submitted_at: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          employee: {
            select: {
              full_name: true,
              employee_code: true,
              department: true,
              roles: {
                include: {
                  role: true,
                },
              },
            },
          },
        },
        orderBy: {
          submitted_at: 'desc',
        },
      });

      return res.status(200).json({ reports });
    } catch (error) {
      logger.error('Fetch all reports error:', error);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }
  },
);

// GET /api/v1/reports/:id - Fetch single report by ID
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reportId = parseInt(req.params.id, 10);
    const employeeId = req.user!.employeeId;
    const roles = req.user!.roles;

    if (isNaN(reportId)) return res.status(400).json({ error: 'Invalid report ID' });

    const report = await p.dailyReport.findUnique({
      where: { id: reportId },
      include: {
        employee: {
          select: {
            full_name: true,
            employee_code: true,
          },
        },
      },
    });

    if (!report) return res.status(404).json({ error: 'Report not found' });

    // Allow access if it's the user's own report or if they are HR/Admin
    const canAccess =
      report.employee_id === employeeId ||
      roles.includes(Roles.MD) ||
      roles.includes(Roles.ADMIN) ||
      roles.includes(Roles.HR_MANAGER);
    if (!canAccess) return res.status(403).json({ error: 'Unauthorized to view this report' });

    return res.status(200).json({ report });
  } catch (error) {
    logger.error('Fetch single report error:', error);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
});

export default router;
