import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { requireAuthz } from '../middleware/authz';
import { Roles, Permissions } from '../shared';
import { calculatePerformanceScore } from '../services/performance-metric';
import { getISTComponents, getISTMonthRange, calculateAttendancePoints } from '../utils/time';
import { AttendanceStatusType } from '../shared';

const router = Router();
const p = prisma;

router.post(
  '/reset-score-history',
  authenticateToken,
  requireRole([Roles.ADMIN]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await p.auditEvent.deleteMany({});
      await p.dailyReport.deleteMany({});
      await p.attendanceLog.deleteMany({});
      await p.task.deleteMany({});
      await p.performanceSnapshot.deleteMany({});

      return res
        .status(200)
        .json({ message: 'All account scores reset to clean 50.0 / 100+ pts successfully!' });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to reset score history' });
    }
  },
);

/**
 * Computes an employee's performance score for one calendar month. Shared by
 * /my-score (current month, tiered off the prior month) and the internal
 * prior-month lookup that feeds it — the prior-month call omits
 * `tierBasisScore`, which applies no tier multiplier, so tiers only ever
 * escalate off of an already-flat, untiered figure.
 */
async function computeMonthScore(
  employeeId: number,
  startOfMonth: Date,
  endOfMonth: Date,
  tierBasisScore?: number,
) {
  // The dailyAttendanceRollupJob cron runs at 05:30 AM IST (Midnight UTC) on the morning *after*
  // the day it evaluates. To correctly group these overnight events into the calendar month they
  // actually belong to (e.g. August 31st's absence runs on Sept 1st 05:30), we shift the bounds by 6 hours.
  const cronStart = new Date(startOfMonth.getTime() + 6 * 60 * 60 * 1000);
  const cronEnd = new Date(endOfMonth.getTime() + 6 * 60 * 60 * 1000);

  // These queries are independent; they ran one after another (24 round
  // trips per /my-score with last month included -- 10 s on staging). Run
  // them together.
  const [
    taskEvents,
    reportEvents,
    belowTargetEvents,
    targetExceededEvents,
    overdueTasksCount,
    uninformedAbsentEvents,
    midnightAutoCheckoutEvents,
    missingDailyReportEvents,
    completedAllWorkEvents,
    propertyBookingContributions,
    manualAdjustments,
    attendanceLogs,
  ] = await Promise.all([
    p.task.count({
      where: {
        assignee_id: employeeId,
        status: 'COMPLETED',
        updated_at: { gte: startOfMonth, lte: endOfMonth },
        created_by: { not: employeeId },
      },
    }),
    p.dailyReport.count({
      where: { employee_id: employeeId, submitted_at: { gte: startOfMonth, lte: endOfMonth } },
    }),
    p.auditEvent.count({
      where: {
        actor_id: employeeId,
        action: 'DAILY_REPORT_BELOW_TARGET',
        created_at: { gte: startOfMonth, lte: endOfMonth },
      },
    }),
    p.auditEvent.count({
      where: {
        actor_id: employeeId,
        action: 'DAILY_REPORT_TARGET_EXCEEDED',
        created_at: { gte: startOfMonth, lte: endOfMonth },
      },
    }),
    p.task.count({
      where: {
        assignee_id: employeeId,
        status: 'OVERDUE',
        updated_at: { gte: startOfMonth, lte: endOfMonth },
      },
    }),
    p.auditEvent.count({
      where: {
        actor_id: employeeId,
        action: 'UNINFORMED_ABSENT',
        created_at: { gte: cronStart, lte: cronEnd },
      },
    }),
    p.auditEvent.count({
      where: {
        actor_id: employeeId,
        action: 'ATTENDANCE_AUTO_CHECKOUT_MIDNIGHT',
        created_at: { gte: cronStart, lte: cronEnd },
      },
    }),
    p.auditEvent.count({
      where: {
        actor_id: employeeId,
        action: 'MISSING_DAILY_REPORT',
        created_at: { gte: cronStart, lte: cronEnd },
      },
    }),
    p.auditEvent.count({
      where: {
        actor_id: employeeId,
        action: 'COMPLETED_ALL_WORK',
        created_at: { gte: cronStart, lte: cronEnd },
      },
    }),
    p.auditEvent.count({
      where: {
        actor_id: employeeId,
        action: 'PROPERTY_BOOKED_CONTRIBUTION',
        created_at: { gte: startOfMonth, lte: endOfMonth },
      },
    }),
    p.performanceAdjustment.findMany({
      where: {
        employee_id: employeeId,
        created_at: { gte: startOfMonth, lte: endOfMonth },
      },
    }),
    p.attendanceLog.findMany({
      where: { employee_id: employeeId, check_in_at: { gte: startOfMonth, lte: endOfMonth } },
      include: { employee: { select: { employment_type: true } } },
    }),
  ]);
  const manualAdjustmentsTotal = manualAdjustments.reduce((sum, adj) => sum + adj.points, 0);
  const manualAdjustmentsCount = manualAdjustments.length;

  let presentCount = 0;
  let lateCount = 0;
  let halfDayCount = 0;
  let attendanceBoost = 0;
  for (const log of attendanceLogs) {
    if (log.status === 'PRESENT' || log.status === 'APPROVED_LATE') presentCount++;
    if (log.status === 'LATE') lateCount++;
    if (log.status === 'HALF_DAY') halfDayCount++;
    if (log.status === 'PRESENT') {
      attendanceBoost += calculateAttendancePoints(
        log.status as AttendanceStatusType,
        log.check_in_at,
        log.employee.employment_type || 'FULL_TIME',
      );
    }
  }

  return calculatePerformanceScore(
    {
      completedTasks: taskEvents,
      overdueTasks: overdueTasksCount,
      dailyReports: reportEvents,
      belowTargetEvents,
      targetExceededEvents,
      uninformedAbsentEvents,
      midnightAutoCheckoutEvents,
      missingDailyReportEvents,
      completedAllWorkEvents,
      propertyBookingContributions,
      presentCount,
      attendanceBoost,
      lateCount,
      halfDayCount,
      manualAdjustmentsTotal,
      manualAdjustmentsCount,
    },
    tierBasisScore,
  );
}

router.get('/my-score', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeId = req.user!.employeeId;
    const [istYear, istMonth] = getISTComponents().dateString.split('-').map(Number);
    const year = req.query.year ? Number(req.query.year) : istYear;
    const month = req.query.month ? Number(req.query.month) : istMonth;
    const { startOfMonth, endOfMonth } = getISTMonthRange(year, month);

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevRange = getISTMonthRange(prevYear, prevMonth);
    const { score: tierBasisScore } = await computeMonthScore(
      employeeId,
      prevRange.startOfMonth,
      prevRange.endOfMonth,
    );

    const { score: totalScore, breakdown } = await computeMonthScore(
      employeeId,
      startOfMonth,
      endOfMonth,
      tierBasisScore,
    );

    return res.status(200).json({ employeeId, score: totalScore, breakdown });
  } catch (error) {
    logger.error('Performance score calculation error:', error);
    return res.status(500).json({ error: 'Failed to calculate performance score' });
  }
});

router.get('/history', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeId = req.user!.employeeId;
    const [istYear, istMonth] = getISTComponents().dateString.split('-').map(Number);
    const year = req.query.year ? Number(req.query.year) : istYear;
    const month = req.query.month ? Number(req.query.month) : istMonth;
    const { startOfMonth, endOfMonth } = getISTMonthRange(year, month);
    const cronStart = new Date(startOfMonth.getTime() + 6 * 60 * 60 * 1000);
    const cronEnd = new Date(endOfMonth.getTime() + 6 * 60 * 60 * 1000);
    const events: any[] = [];

    // The six reads below are independent; they used to run one after
    // another (6 s on staging). Start them all now, await each where used.
    const completedTasksQuery = p.task.findMany({
      where: {
        assignee_id: employeeId,
        status: 'COMPLETED',
        updated_at: { gte: startOfMonth, lte: endOfMonth },
        // Keep in sync with /my-score: self-assigned tasks don't earn points,
        // so they must not appear here as if they did.
        created_by: { not: employeeId },
      },
      orderBy: { completed_at: 'desc' },
    });
    const overdueTasksQuery = p.task.findMany({
      where: {
        assignee_id: employeeId,
        status: 'OVERDUE',
        updated_at: { gte: startOfMonth, lte: endOfMonth },
      },
      orderBy: { updated_at: 'desc' },
    });
    const dailyReportsQuery = p.dailyReport.findMany({
      where: { employee_id: employeeId, submitted_at: { gte: startOfMonth, lte: endOfMonth } },
      orderBy: { submitted_at: 'desc' },
    });
    const auditEventsQuery = p.auditEvent.findMany({
      where: {
        actor_id: employeeId,
        OR: [
          {
            action: {
              in: [
                'UNINFORMED_ABSENT',
                'ATTENDANCE_AUTO_CHECKOUT_MIDNIGHT',
                'MISSING_DAILY_REPORT',
                'COMPLETED_ALL_WORK',
              ],
            },
            created_at: { gte: cronStart, lte: cronEnd },
          },
          {
            action: {
              notIn: [
                'UNINFORMED_ABSENT',
                'ATTENDANCE_AUTO_CHECKOUT_MIDNIGHT',
                'MISSING_DAILY_REPORT',
                'COMPLETED_ALL_WORK',
              ],
            },
            created_at: { gte: startOfMonth, lte: endOfMonth },
          },
        ],
      },
      orderBy: { created_at: 'desc' },
    });
    const attendanceLogsQuery = p.attendanceLog.findMany({
      where: { employee_id: employeeId, check_in_at: { gte: startOfMonth, lte: endOfMonth } },
      include: { employee: { select: { employment_type: true } } },
    });
    const manualAdjustmentsQuery = p.performanceAdjustment.findMany({
      where: {
        employee_id: employeeId,
        created_at: { gte: startOfMonth, lte: endOfMonth },
      },
      include: { adjuster: { select: { full_name: true, employee_code: true } } },
    });

    events.push({
      id: 'base-50',
      action: 'INITIAL_BASE_SCORE',
      title: 'Initial Base Performance Index',
      points: 50.0,
      type: 'BOOST',
      description: 'Default starting performance index for all team members',
      timestamp: startOfMonth,
    });

    const completedTasks = await completedTasksQuery;
    for (const t of completedTasks) {
      events.push({
        id: `task-${t.id}`,
        action: 'TASK_COMPLETED',
        title: 'Task Completed',
        points: +2.0,
        type: 'BOOST',
        description: `Completed task: "${t.title}"`,
        timestamp: t.completed_at || t.updated_at,
      });
    }

    const overdueTasks = await overdueTasksQuery;
    for (const t of overdueTasks) {
      events.push({
        id: `task-od-${t.id}`,
        action: 'TASK_OVERDUE',
        title: 'Task Overdue',
        points: -1.0,
        type: 'PENALTY',
        description: `Overdue task: "${t.title}"`,
        timestamp: t.updated_at,
      });
    }

    const dailyReports = await dailyReportsQuery;
    for (const r of dailyReports) {
      events.push({
        id: `report-${r.id}`,
        action: 'DAILY_REPORT_SUBMIT',
        title: 'Daily Report Submitted',
        points: +0.5,
        type: 'BOOST',
        description: 'Submitted EOD report',
        timestamp: r.submitted_at,
      });
    }

    const auditEvents = await auditEventsQuery;
    for (const b of auditEvents) {
      if (b.action === 'DAILY_REPORT_BELOW_TARGET') {
        events.push({
          id: `bt-${b.id}`,
          action: b.action,
          title: 'Sub-Target Log Penalty',
          points: -1.0,
          type: 'PENALTY',
          description: 'Submitted daily report below assigned target',
          timestamp: b.created_at,
        });
      } else if (b.action === 'DAILY_REPORT_TARGET_EXCEEDED') {
        events.push({
          id: `te-${b.id}`,
          action: b.action,
          title: 'Target Exceeded',
          points: +0.5,
          type: 'BOOST',
          description: 'Submitted daily report exceeding targets',
          timestamp: b.created_at,
        });
      } else if (b.action === 'UNINFORMED_ABSENT') {
        events.push({
          id: `ua-${b.id}`,
          action: b.action,
          title: 'Uninformed Absence',
          points: -2.0,
          type: 'PENALTY',
          description: 'Absent without prior approval',
          timestamp: b.created_at,
        });
      } else if (b.action === 'PROPERTY_BOOKED_CONTRIBUTION') {
        events.push({
          id: `bk-${b.id}`,
          action: b.action,
          title: 'Lead Converted to Booking',
          points: +10.0,
          type: 'BOOST',
          description: b.reason || 'Contributed to a Lead that converted to a Booking',
          timestamp: b.created_at,
        });
      }
    }

    const attendanceLogs = await attendanceLogsQuery;
    for (const log of attendanceLogs) {
      const ts = log.check_in_at || new Date();
      if (log.status === 'LATE') {
        events.push({
          id: `att-late-${log.id}`,
          action: 'LATE_CHECKIN',
          title: 'Late Check-In Penalty',
          points: -1.0,
          type: 'PENALTY',
          description: 'Check-in recorded late',
          timestamp: ts,
        });
      } else if (log.status === 'HALF_DAY') {
        events.push({
          id: `att-hd-${log.id}`,
          action: 'HALF_DAY_CHECKIN',
          title: 'Half Day Check-In Penalty',
          points: -1.0,
          type: 'PENALTY',
          description: 'Check-in recorded after 11:30 AM',
          timestamp: ts,
        });
      } else if (log.status === 'APPROVED_LATE') {
        // § Phase 4: an approval means "not penalized", not "still earns the
        // on-time bonus" — this used to be lumped in with PRESENT at +0.5.
        events.push({
          id: `att-apl-${log.id}`,
          action: 'APPROVED_LATE_CHECKIN',
          title: 'Approved Late Check-In',
          points: 0.0,
          type: 'NEUTRAL',
          description: 'Late check-in was approved — no gain, no penalty',
          timestamp: ts,
        });
      } else if (log.status === 'APPROVED_HALF_DAY') {
        events.push({
          id: `att-aphd-${log.id}`,
          action: 'APPROVED_HALF_DAY_CHECKIN',
          title: 'Approved Half-Day Check-In',
          points: 0.0,
          type: 'NEUTRAL',
          description: 'Half-day check-in was approved — no gain, no penalty',
          timestamp: ts,
        });
      } else if (log.status === 'PRESENT') {
        const points = calculateAttendancePoints(
          log.status as AttendanceStatusType,
          log.check_in_at,
          log.employee.employment_type || 'FULL_TIME',
        );
        const title =
          points >= 1.0
            ? 'Early Check-In'
            : points >= 0.5
              ? 'On-Time Check-In (Grace Period)'
              : 'On-Time Check-In';
        events.push({
          id: `att-present-${log.id}`,
          action: 'PRESENT_CHECKIN',
          title,
          points,
          type: points > 0 ? 'BOOST' : 'NEUTRAL',
          description: 'Checked in before the 10:30 AM cutoff',
          timestamp: ts,
        });
      }
    }

    const manualAdjustments = await manualAdjustmentsQuery;

    for (const adj of manualAdjustments) {
      events.push({
        id: `manual-adj-${adj.id}`,
        action: 'MANUAL_SCORE_ADJUSTMENT',
        title: 'Manual Score Adjustment',
        points: adj.points,
        type: adj.points > 0 ? 'BOOST' : 'PENALTY',
        description: `${adj.reason} (by ${adj.adjuster.full_name || adj.adjuster.employee_code})`,
        timestamp: adj.created_at,
      });
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.status(200).json({ events });
  } catch (error) {
    logger.error('Fetch performance history error:', error);
    return res.status(500).json({ error: 'Failed to fetch performance history' });
  }
});

router.get('/team', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const roles = req.user!.roles;
    const isMD = roles.includes(Roles.MD);
    const isAdmin = roles.includes(Roles.ADMIN);
    const isHR = roles.includes(Roles.HR_MANAGER);

    const hasTeamPermission = (req.user!.permissions || []).includes(
      Permissions.PERFORMANCE_READ_TEAM,
    );
    const canViewTeam = hasTeamPermission || isAdmin;
    if (!canViewTeam)
      return res
        .status(403)
        .json({ error: 'Access denied: Manager or above permission required.' });

    const whereClause: any = {
      company_id: req.user!.companyId,
      deleted_at: null,
      AND: [
        { roles: { none: { role: { is_invisible: true } } } },
        { roles: { none: { role: { name: Roles.ADMIN } } } },
      ],
    };
    if (!isMD && !isAdmin && !isHR) whereClause.reporting_manager_id = req.user!.employeeId;

    const [istYear, istMonth] = getISTComponents().dateString.split('-').map(Number);
    const year = req.query.year ? Number(req.query.year) : istYear;
    const month = req.query.month ? Number(req.query.month) : istMonth;
    const { startOfMonth, endOfMonth } = getISTMonthRange(Number(year), Number(month));

    // The dailyAttendanceRollupJob cron runs at 05:30 AM IST (Midnight UTC) on the morning *after*
    // the day it evaluates. To correctly group these overnight events into the calendar month they
    // actually belong to (e.g. August 31st's absence runs on Sept 1st 05:30), we shift the bounds by 6 hours.
    const cronStart = new Date(startOfMonth.getTime() + 6 * 60 * 60 * 1000);
    const cronEnd = new Date(endOfMonth.getTime() + 6 * 60 * 60 * 1000);

    const employees = await p.employee.findMany({
      where: whereClause,
      include: { branch: true, roles: { include: { role: true } } },
      orderBy: { employee_code: 'asc' },
    });

    const teamScores = await Promise.all(
      employees.map(async (emp: any) => {
        const [
          tasksDone,
          tasksOverdue,
          reportsDone,
          belowTargetCount,
          targetExceededEvents,
          attendanceLogs,
          uninformedAbsent,
          midnightAutoCheckout,
          missingDailyReport,
          completedAllWork,
          propertyBookingContributions,
        ] = await Promise.all([
          p.task.count({
            where: {
              assignee_id: emp.id,
              status: 'COMPLETED',
              updated_at: { gte: startOfMonth, lte: endOfMonth },
              created_by: { not: emp.id },
            },
          }),
          p.task.count({
            where: {
              assignee_id: emp.id,
              status: 'OVERDUE',
              updated_at: { gte: startOfMonth, lte: endOfMonth },
            },
          }),
          p.dailyReport.count({
            where: { employee_id: emp.id, submitted_at: { gte: startOfMonth, lte: endOfMonth } },
          }),
          p.auditEvent.count({
            where: {
              actor_id: emp.id,
              action: 'DAILY_REPORT_BELOW_TARGET',
              created_at: { gte: startOfMonth, lte: endOfMonth },
            },
          }),
          p.auditEvent.count({
            where: {
              actor_id: emp.id,
              action: 'DAILY_REPORT_TARGET_EXCEEDED',
              created_at: { gte: startOfMonth, lte: endOfMonth },
            },
          }),
          p.attendanceLog.findMany({
            where: { employee_id: emp.id, check_in_at: { gte: startOfMonth, lte: endOfMonth } },
            select: { status: true, check_in_at: true },
          }),
          p.auditEvent.count({
            where: {
              actor_id: emp.id,
              action: 'UNINFORMED_ABSENT',
              created_at: { gte: cronStart, lte: cronEnd },
            },
          }),
          p.auditEvent.count({
            where: {
              actor_id: emp.id,
              action: 'ATTENDANCE_AUTO_CHECKOUT_MIDNIGHT',
              created_at: { gte: cronStart, lte: cronEnd },
            },
          }),
          p.auditEvent.count({
            where: {
              actor_id: emp.id,
              action: 'MISSING_DAILY_REPORT',
              created_at: { gte: cronStart, lte: cronEnd },
            },
          }),
          p.auditEvent.count({
            where: {
              actor_id: emp.id,
              action: 'COMPLETED_ALL_WORK',
              created_at: { gte: cronStart, lte: cronEnd },
            },
          }),
          p.auditEvent.count({
            where: {
              actor_id: emp.id,
              action: 'PROPERTY_BOOKED_CONTRIBUTION',
              created_at: { gte: startOfMonth, lte: endOfMonth },
            },
          }),
        ]);

        let presentCount = 0;
        let lateCount = 0;
        let halfDayCount = 0;
        let attendanceBoost = 0;
        for (const log of attendanceLogs) {
          if (log.status === 'PRESENT' || log.status === 'APPROVED_LATE') presentCount++;
          else if (log.status === 'LATE') lateCount++;
          else if (log.status === 'HALF_DAY') halfDayCount++;
          // Only PRESENT feeds the boost — LATE/HALF_DAY stay penalized via
          // lateCount/halfDayCount below; adding calculateAttendancePoints's
          // -1.0 for those here too would double-count the penalty.
          if (log.status === 'PRESENT') {
            attendanceBoost += calculateAttendancePoints(
              log.status as AttendanceStatusType,
              log.check_in_at,
              emp.employment_type || 'FULL_TIME',
            );
          }
        }

        const manualAdjustments = await p.performanceAdjustment.findMany({
          where: {
            employee_id: emp.id,
            created_at: { gte: startOfMonth, lte: endOfMonth },
          },
        });
        const manualAdjustmentsTotal = manualAdjustments.reduce((sum, adj) => sum + adj.points, 0);
        const manualAdjustmentsCount = manualAdjustments.length;

        const { score, breakdown } = calculatePerformanceScore({
          completedTasks: tasksDone,
          overdueTasks: tasksOverdue,
          dailyReports: reportsDone,
          belowTargetEvents: belowTargetCount,
          targetExceededEvents,
          uninformedAbsentEvents: uninformedAbsent,
          midnightAutoCheckoutEvents: midnightAutoCheckout,
          missingDailyReportEvents: missingDailyReport,
          completedAllWorkEvents: completedAllWork,
          propertyBookingContributions,
          presentCount,
          attendanceBoost,
          lateCount,
          halfDayCount,
          manualAdjustmentsTotal,
          manualAdjustmentsCount,
        });

        return {
          id: emp.id,
          employeeCode: emp.employee_code,
          fullName: emp.full_name || emp.employee_code,
          branch: emp.branch?.name || '—',
          roles: emp.roles.map((r: any) => r.role.name),
          score,
          breakdown: {
            tasksDone,
            tasksOverdue,
            reportsDone,
            belowTargetCount,
            targetExceededEvents,
            presentCount,
            lateCount,
            halfDayCount,
            uninformedAbsent,
            midnightAutoCheckoutEvents: midnightAutoCheckout,
            missingDailyReportEvents: missingDailyReport,
            propertyBookingContributions,
            manualAdjustmentsTotal,
            manualAdjustmentsCount,
          },
          zone:
            score >= 86
              ? 'EXCELLENT'
              : score >= 66
                ? 'SAFE'
                : score >= 41
                  ? 'SATISFACTORY'
                  : 'DANGER',
        };
      }),
    );

    teamScores.sort((a, b) => b.score - a.score);
    return res.status(200).json({ team: teamScores, total: teamScores.length });
  } catch (error: any) {
    logger.error('Team performance error:', error);
    return res.status(500).json({ error: 'Failed to fetch team performance' });
  }
});

router.get(
  '/telecaller-metrics',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { telecallerId, startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1)); // Default to start of month
      const end = endDate ? new Date(endDate as string) : new Date();

      const tId = telecallerId ? parseInt(telecallerId as string, 10) : undefined;

      // In production, add authorization to verify they are allowed to check this user

      const { PerformanceTrackingService } =
        await import('../services/performanceTracking.service');
      const metrics = await PerformanceTrackingService.getTelecallerMetrics(
        req.user!,
        start,
        end,
        tId,
      );

      return res.status(200).json({ metrics });
    } catch (error) {
      logger.error('Fetch telecaller metrics error:', error);
      return res.status(500).json({ error: 'Failed to fetch telecaller metrics' });
    }
  },
);

router.get('/pm-metrics', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pmId, startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1));
    const end = endDate ? new Date(endDate as string) : new Date();

    const pId = pmId ? parseInt(pmId as string, 10) : undefined;

    // In production, add authorization checks

    const { PerformanceTrackingService } = await import('../services/performanceTracking.service');
    const metrics = await PerformanceTrackingService.getPmMetrics(req.user!, start, end, pId);

    return res.status(200).json({ metrics });
  } catch (error) {
    logger.error('Fetch pm metrics error:', error);
    return res.status(500).json({ error: 'Failed to fetch pm metrics' });
  }
});

// --- Achievements Endpoint ---
router.get('/achievements', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isMDOrAdmin =
      req.user!.roles.includes(Roles.MD) ||
      req.user!.roles.includes(Roles.ADMIN) ||
      req.user!.roles.includes(Roles.MARKETING_DIRECTOR);

    const targetEmployeeId =
      isMDOrAdmin && req.query.employeeId && req.query.employeeId !== 'ALL'
        ? Number(req.query.employeeId)
        : req.query.employeeId === 'ALL'
          ? 'ALL'
          : req.user!.employeeId;

    const getStatsForEmployee = async (empId: number) => {
      // 1. Leads Sourced
      const leadsSourced = await p.lead.count({ where: { created_by_id: empId } });

      // 2. Site Visits Scheduled (Telecaller)
      const siteVisitsScheduled = await p.siteVisitBooking.count({
        where: { telecaller_id: empId },
      });

      // 3. Site Visits Executed (PM)
      const siteVisitsExecuted = await p.siteVisitBooking.count({
        where: { project_manager_id: empId, status: 'COMPLETED' },
      });

      // 4. Deals Closed (Booking Assigned Employee)
      const dealsClosed = await p.booking.count({
        where: { assigned_employee_id: empId, status: { not: 'CANCELLED' } },
      });

      // 5. Assisted Conversions
      const assistedBookings = await p.booking.findMany({
        where: {
          assigned_employee_id: { not: empId },
          status: { not: 'CANCELLED' },
          customer: {
            origin_lead: {
              OR: [
                { created_by_id: empId },
                { assigned_to_id: empId },
                {
                  site_visits: {
                    some: {
                      OR: [
                        { telecaller_id: empId },
                        { project_manager_id: empId },
                        { assigned_agent_id: empId },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
        select: { id: true },
      });
      const assistedConversions = assistedBookings.length;

      return {
        employeeId: empId,
        leadsSourced,
        siteVisitsScheduled,
        siteVisitsExecuted,
        dealsClosed,
        assistedConversions,
      };
    };

    if (targetEmployeeId === 'ALL') {
      if (!isMDOrAdmin) return res.status(403).json({ error: 'Forbidden' });

      const allEmployees = await p.employee.findMany({
        where: {
          status: 'ACTIVE',
          roles: {
            none: { role: { name: Roles.ADMIN } },
          },
        },
        select: {
          id: true,
          full_name: true,
          employee_code: true,
          roles: true,
          profile_image_url: true,
        },
      });

      const leaderboard = await Promise.all(
        allEmployees.map(async (emp) => {
          const stats = await getStatsForEmployee(emp.id);
          return {
            ...emp,
            ...stats,
          };
        }),
      );

      leaderboard.sort(
        (a, b) =>
          b.dealsClosed - a.dealsClosed ||
          b.assistedConversions - a.assistedConversions ||
          b.siteVisitsExecuted - a.siteVisitsExecuted,
      );

      return res.status(200).json({ leaderboard });
    } else {
      const stats = await getStatsForEmployee(targetEmployeeId as number);
      return res.status(200).json(stats);
    }
  } catch (error) {
    logger.error('Achievements fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

export default router;
