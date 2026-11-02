import { logger } from '../../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../../middleware/auth';
import { Roles } from '../../shared';
import { getAccessibleCompanyIds } from '../../authz/dataScope';
import { getISTComponents, getISTMidnightInstant } from '../../utils/time';
import { Prisma } from '@prisma/client';
import { CRM_ACTION, crmActionLabel, crmActionUrl } from '../../middleware/recordCrmAction';

const router = Router();
const p = prisma;

// Roles that must use 2-step login (middleware/auth.ts TWO_STEP_ROLES, plus the
// Technical Manager, who signs in with Admin's access).
const TWO_STEP_DB_ROLES = [Roles.MD, Roles.ADMIN, Roles.FINANCE, Roles.TECHNICAL_MANAGER];

// GET /api/v1/admin/tech-overview - the Technical Manager's dashboard
// (2026-11-02): the system, security, people and today's business on one
// screen, plus a live feed of what everyone is doing in the CRM. Counts only;
// each block links to the page that has the detail.
router.get(
  '/tech-overview',
  authenticateToken,
  requireRole([Roles.ADMIN, Roles.MD]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const companyIds = await getAccessibleCompanyIds(req.user!);
      const company = { company_id: { in: companyIds } };
      const dateString = getISTComponents(new Date()).dateString;
      const start = getISTMidnightInstant(dateString);
      const end = new Date(start.getTime() + 24 * 3600 * 1000);
      const today = { gte: start, lt: end };
      const now = new Date();
      const staff = {
        ...company,
        status: 'ACTIVE',
        roles: { none: { role: { is_invisible: true } } },
      };

      const [
        activeStaff,
        attendanceToday,
        reportsToday,
        needAttendance,
        needReport,
        noTwoStep,
        signInsToday,
        failedSignIns,
        lockedAccounts,
        permissionChanges,
        passwordResets,
        jobFailures,
        openSessions,
        leadsToday,
        unassignedLeads,
        callsToday,
        visitsToday,
        visitsDone,
        visitsWaiting,
        bookingsToday,
        bookingsWaiting,
        paymentsWaiting,
        overdueTasks,
        projectsInReview,
        openComplaints,
        actionsToday,
        recentActions,
        myAttendance,
        myReport,
      ] = await Promise.all([
        p.employee.count({ where: staff }),
        p.attendanceLog.findMany({
          where: { employee: company, check_in_at: today },
          select: { employee_id: true, status: true, check_out_at: true },
        }),
        p.dailyReport.count({ where: { employee: company, submitted_at: today } }),
        p.employee.count({ where: { ...staff, attendance_required: true } }),
        p.employee.count({ where: { ...staff, report_required: true } }),
        p.employee.findMany({
          where: {
            ...company,
            status: 'ACTIVE',
            totp_enabled_at: null,
            roles: { some: { role: { name: { in: TWO_STEP_DB_ROLES } } } },
          },
          select: { id: true, full_name: true, employee_code: true },
          take: 50,
        }),
        p.auditEvent.count({ where: { action: 'LOGIN', created_at: today, ...company } }),
        p.auditEvent.count({
          where: { action: 'SECURITY_ALERT', entity_type: 'AUTH_FAILED', created_at: today },
        }),
        p.auditEvent.count({
          where: { action: 'SECURITY_ALERT', entity_type: 'ACCOUNT_LOCKED', created_at: today },
        }),
        p.auditEvent.count({
          where: {
            created_at: today,
            action: {
              in: [
                'UPDATE_ROLE_PERMISSIONS',
                'RESET_ROLE_PERMISSIONS',
                'UNDO_ROLE_PERMISSIONS',
                'REDO_ROLE_PERMISSIONS',
                'CLEAR_EMPLOYEE_PERMISSION_OVERRIDE',
              ],
            },
          },
        }),
        p.auditEvent.count({
          where: {
            action: CRM_ACTION,
            created_at: today,
            new_value: { contains: '/reset-password' },
            ...company,
          },
        }),
        p.notification.findMany({
          where: { type: 'JOB_FAILED', employee_id: req.user!.employeeId, created_at: today },
          select: { title: true, message: true, created_at: true },
          orderBy: { created_at: 'desc' },
          take: 10,
        }),
        // One live (not yet rotated) key per signed-in device.
        p.authSession.count({
          where: { revoked: false, consumed: false, expires_at: { gt: now } },
        }),
        p.lead.count({ where: { ...company, created_at: today } }),
        p.lead.count({
          where: { ...company, assigned_to_id: null, status: { notIn: ['BOOKED', 'DROPPED'] } },
        }),
        p.leadActivity.count({
          where: { activity_type: 'CALL_LOGGED', created_at: today, lead: company },
        }),
        p.siteVisitBooking.count({
          where: { scheduled_date: today, status: { not: 'CANCELLED' }, lead: company },
        }),
        p.siteVisitBooking.count({
          where: { status: 'COMPLETED', completed_at: today, lead: company },
        }),
        p.siteVisitBooking.count({
          where: {
            status: { in: ['REQUESTED', 'PENDING_ACCEPTANCE', 'REASSIGNED'] },
            lead: company,
          },
        }),
        p.booking.count({ where: { ...company, created_at: today } }),
        p.booking.count({ where: { ...company, status: 'PENDING_MD_APPROVAL' } }),
        p.payment.count({ where: { ...company, status: 'PENDING' } }),
        p.task.count({
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
            target_date: { lt: now },
            assignee: company,
          },
        }),
        p.project.count({
          where: {
            ...company,
            verification_status: { in: ['PENDING_DM_POLISH', 'PENDING_MD_APPROVAL'] },
          },
        }),
        p.complaint.count({
          where: { ...company, status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] } },
        }),
        p.auditEvent.count({ where: { action: CRM_ACTION, created_at: today, ...company } }),
        p.auditEvent.findMany({
          where: { action: CRM_ACTION, ...company },
          select: { actor_id: true, new_value: true, created_at: true },
          orderBy: { created_at: 'desc' },
          take: 40,
        }),
        p.attendanceLog.findFirst({
          where: { employee_id: req.user!.employeeId, check_in_at: today },
          select: { check_in_at: true, check_out_at: true },
        }),
        p.dailyReport.findFirst({
          where: { employee_id: req.user!.employeeId, submitted_at: today },
          select: { submitted_at: true },
        }),
      ]);

      // Charts: the last 7 days (IST) and today's activity by hour.
      const weekStart = new Date(start.getTime() - 6 * 24 * 3600 * 1000);
      const ids = Prisma.join(companyIds.length ? companyIds : [0]);
      const istDay = (col: string) => Prisma.raw(`DATE(DATE_ADD(${col}, INTERVAL 330 MINUTE))`);
      type DayCount = { d: Date | string; n: bigint | number };
      const [leadDays, callDays, visitDays, bookingDays, hours, topActors] = await Promise.all([
        p.$queryRaw<DayCount[]>`SELECT ${istDay('created_at')} d, COUNT(*) n FROM Lead
          WHERE company_id IN (${ids}) AND created_at >= ${weekStart} GROUP BY d`,
        p.$queryRaw<DayCount[]>`SELECT ${istDay('la.created_at')} d, COUNT(*) n FROM LeadActivity la
          JOIN Lead l ON l.id = la.lead_id
          WHERE la.activity_type = 'CALL_LOGGED' AND l.company_id IN (${ids})
            AND la.created_at >= ${weekStart} GROUP BY d`,
        p.$queryRaw<
          DayCount[]
        >`SELECT ${istDay('s.completed_at')} d, COUNT(*) n FROM SiteVisitBooking s
          JOIN Lead l ON l.id = s.lead_id
          WHERE s.status = 'COMPLETED' AND l.company_id IN (${ids})
            AND s.completed_at >= ${weekStart} GROUP BY d`,
        p.$queryRaw<DayCount[]>`SELECT ${istDay('created_at')} d, COUNT(*) n FROM Booking
          WHERE company_id IN (${ids}) AND created_at >= ${weekStart} GROUP BY d`,
        p.$queryRaw<
          { h: number; n: bigint | number }[]
        >`SELECT HOUR(DATE_ADD(created_at, INTERVAL 330 MINUTE)) h,
          COUNT(*) n FROM AuditEvent
          WHERE action = ${CRM_ACTION} AND company_id IN (${ids})
            AND created_at >= ${start} AND created_at < ${end} GROUP BY h`,
        p.auditEvent.groupBy({
          by: ['actor_id'],
          where: { action: CRM_ACTION, created_at: today, ...company },
          _count: { _all: true },
          orderBy: { _count: { actor_id: 'desc' } },
          take: 8,
        }),
      ]);
      const dayKey = (d: Date | string) =>
        typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
      const byDay = (rows: DayCount[]) => new Map(rows.map((r) => [dayKey(r.d), Number(r.n)]));
      const [leadMap, callMap, visitMap, bookingMap] = [
        leadDays,
        callDays,
        visitDays,
        bookingDays,
      ].map(byDay);
      const trend = Array.from({ length: 7 }, (_, i) => {
        const key = getISTComponents(
          new Date(weekStart.getTime() + (i * 24 + 12) * 3600 * 1000),
        ).dateString;
        return {
          date: key,
          leads: leadMap.get(key) || 0,
          calls: callMap.get(key) || 0,
          visits: visitMap.get(key) || 0,
          bookings: bookingMap.get(key) || 0,
        };
      });
      const hourMap = new Map(hours.map((h) => [Number(h.h), Number(h.n)]));
      const byHour = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        actions: hourMap.get(h) || 0,
      }));

      const names = new Map(
        (
          await p.employee.findMany({
            where: {
              id: {
                in: [
                  ...new Set([
                    ...recentActions.map((a) => a.actor_id),
                    ...topActors.map((a) => a.actor_id),
                  ]),
                ],
              },
            },
            select: { id: true, full_name: true, employee_code: true },
          })
        ).map((e) => [e.id, e.full_name || e.employee_code]),
      );

      return res.status(200).json({
        date: dateString,
        system: {
          version: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || null,
          uptime_minutes: Math.round(process.uptime() / 60),
          open_sessions: openSessions,
          job_failures: jobFailures,
        },
        security: {
          sign_ins_today: signInsToday,
          failed_sign_ins_today: failedSignIns,
          accounts_locked_today: lockedAccounts,
          permission_changes_today: permissionChanges,
          password_resets_today: passwordResets,
          without_two_step: noTwoStep.map((e) => ({
            id: e.id,
            name: e.full_name || e.employee_code,
          })),
        },
        people: {
          active_staff: activeStaff,
          need_attendance: needAttendance,
          checked_in: attendanceToday.length,
          late: attendanceToday.filter((a) => a.status === 'LATE').length,
          checked_out: attendanceToday.filter((a) => a.check_out_at).length,
          need_report: needReport,
          reports_sent: reportsToday,
        },
        business: {
          leads_today: leadsToday,
          unassigned_leads: unassignedLeads,
          calls_today: callsToday,
          visits_today: visitsToday,
          visits_done_today: visitsDone,
          visits_waiting_acceptance: visitsWaiting,
          bookings_today: bookingsToday,
          bookings_waiting_md: bookingsWaiting,
          payments_pending: paymentsWaiting,
          overdue_tasks: overdueTasks,
          projects_in_review: projectsInReview,
          open_complaints: openComplaints,
        },
        activity: {
          actions_today: actionsToday,
          recent: recentActions.map((a) => ({
            at: a.created_at,
            who: names.get(a.actor_id) || 'Someone',
            label: crmActionLabel(a.new_value),
            url: crmActionUrl(a.new_value),
          })),
          by_hour: byHour,
          top_people: topActors.map((a) => ({
            id: a.actor_id,
            name: names.get(a.actor_id) || 'Someone',
            actions: a._count._all,
          })),
        },
        trend,
        me: {
          checked_in_at: myAttendance?.check_in_at || null,
          checked_out_at: myAttendance?.check_out_at || null,
          report_sent_at: myReport?.submitted_at || null,
        },
      });
    } catch (error) {
      logger.error('Tech overview error:', error);
      return res.status(500).json({ error: 'Could not load the overview' });
    }
  },
);

export default router;
