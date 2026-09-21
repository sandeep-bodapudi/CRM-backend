import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { validateRequestBody } from '../middleware/validate';
import { DailyReportSchema, Roles } from '../shared';
import { getISTComponents } from '../utils/time';

const router = Router();

const p = prisma;

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

      const calls = parseInt(metrics?.callsMade || metrics?.call_count || '0', 10);
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
          missedMetrics.push(`Calls: ${calls}/${activeTarget.calls_target}`);
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
          call_count: calls,
          site_visit_count: visits,
          closed_deal_count: deals,
          target_met: !isBelowTarget,
          below_target_reason: isBelowTarget ? below_target_reason : null,
          metrics_json: metrics || null,
        },
      });

      // Write Audit Event safely supporting schema variations
      await p.auditEvent.create({
        data: {
          actor_id: employeeId,
          action: 'SUBMIT_DAILY_REPORT',
          entity_type: 'DAILY_REPORT',
          entity_id: report.id,
          new_value: JSON.stringify({ calls, visits, deals, isBelowTarget }),
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
