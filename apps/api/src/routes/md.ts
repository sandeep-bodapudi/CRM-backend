import { logger } from '../utils/logger';
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { getAccessibleCompanyIds, buildEmployeeScope } from '../authz/dataScope';
import { getISTComponents, getISTMidnightInstant } from '../utils/time';
import { requireAuthz } from '../middleware/authz';
import { Roles, Permissions } from '../shared';
import { AnalyticsService } from '../services/analytics.service';

const router = Router();

const p = prisma;

// GET /api/v1/md/team-today?date=YYYY-MM-DD — what each employee actually did
// on a given IST day, built only from system records (attendance, CRM
// actions, tasks, site visits), with their self-typed daily report next to
// it. The MD's complaint was "employees are working but I don't know what
// they did today; I can't trust the daily reports" — this is that answer.
router.get(
  '/team-today',
  authenticateToken,
  requireRole([Roles.MD, Roles.ADMIN, Roles.HR_MANAGER]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const reqDate = typeof req.query.date === 'string' ? req.query.date.slice(0, 10) : '';
      const dateString = /^\d{4}-\d{2}-\d{2}$/.test(reqDate)
        ? reqDate
        : getISTComponents(new Date()).dateString;
      const start = getISTMidnightInstant(dateString);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const inDay = { gte: start, lt: end };

      const scope = await buildEmployeeScope(req.user!);
      const employees = await p.employee.findMany({
        where: { ...scope, status: 'ACTIVE' },
        select: {
          id: true,
          full_name: true,
          employee_code: true,
          attendance_required: true,
          roles: { select: { role: { select: { name: true } } } },
        },
        orderBy: { full_name: 'asc' },
      });
      const ids = employees.map((e) => e.id);
      if (ids.length === 0) return res.status(200).json({ date: dateString, employees: [] });

      const [byType, firstLast, attendance, tasksDone, reports, visitsDone, leadsWorked] =
        await Promise.all([
          p.leadActivity.groupBy({
            by: ['actor_id', 'activity_type'],
            where: { actor_id: { in: ids }, created_at: inDay },
            _count: { _all: true },
          }),
          p.leadActivity.groupBy({
            by: ['actor_id'],
            where: {
              actor_id: { in: ids },
              created_at: inDay,
              activity_type: { notIn: ['LEAD_CREATED', 'ASSIGNED_TO_AGENT'] },
            },
            _min: { created_at: true },
            _max: { created_at: true },
          }),
          p.attendanceLog.findMany({
            where: { employee_id: { in: ids }, check_in_at: inDay },
            select: {
              employee_id: true,
              check_in_at: true,
              check_out_at: true,
              status: true,
              source: true,
            },
            orderBy: { check_in_at: 'asc' },
          }),
          p.task.groupBy({
            by: ['assignee_id'],
            where: { assignee_id: { in: ids }, status: 'COMPLETED', completed_at: inDay },
            _count: { _all: true },
          }),
          p.dailyReport.findMany({
            where: { employee_id: { in: ids }, submitted_at: inDay },
            select: { employee_id: true, call_count: true, summary: true, submitted_at: true },
          }),
          p.siteVisitBooking.groupBy({
            by: ['assigned_agent_id'],
            where: { assigned_agent_id: { in: ids }, status: 'COMPLETED', completed_at: inDay },
            _count: { _all: true },
          }),
          p.leadActivity.findMany({
            where: {
              actor_id: { in: ids },
              created_at: inDay,
              activity_type: { notIn: ['LEAD_CREATED', 'ASSIGNED_TO_AGENT'] },
            },
            select: { actor_id: true, lead_id: true },
            distinct: ['actor_id', 'lead_id'],
          }),
        ]);

      const count = (empId: number, types: string[]) =>
        byType
          .filter((r) => r.actor_id === empId && types.includes(r.activity_type))
          .reduce((n, r) => n + r._count._all, 0);

      const rows = employees.map((e) => {
        const att = attendance.find((a) => a.employee_id === e.id);
        const fl = firstLast.find((f) => f.actor_id === e.id);
        const report = reports.find((r) => r.employee_id === e.id);
        const calls = count(e.id, ['CALL_LOGGED']);
        const leads = leadsWorked.filter((l) => l.actor_id === e.id).length;
        const workActions = byType
          .filter(
            (r) =>
              r.actor_id === e.id &&
              !['LEAD_CREATED', 'ASSIGNED_TO_AGENT'].includes(r.activity_type),
          )
          .reduce((n, r) => n + r._count._all, 0);
        const tasks = tasksDone.find((t) => t.assignee_id === e.id)?._count._all || 0;
        const visits = visitsDone.find((v) => v.assigned_agent_id === e.id)?._count._all || 0;

        const flags: string[] = [];
        if (att && workActions === 0 && tasks === 0 && visits === 0) {
          flags.push('Present, but no work recorded in the CRM');
        }
        if (report && report.call_count > calls + 5) {
          flags.push(`Report claims ${report.call_count} calls; ${calls} logged`);
        }
        // REMOTE = approved work-from-home check-in from the app; PROPOSAL =
        // created by approving a field-work request. Neither is a hand edit.
        if (att && !['QR_SCAN', 'REMOTE', 'PROPOSAL'].includes(att.source)) {
          flags.push('Attendance entered or edited by hand');
        }

        return {
          id: e.id,
          name: e.full_name || e.employee_code,
          employee_code: e.employee_code,
          roles: e.roles.map((r) => r.role.name),
          attendance: att
            ? {
                check_in_at: att.check_in_at,
                check_out_at: att.check_out_at,
                status: att.status,
                source: att.source,
              }
            : null,
          attendance_required: e.attendance_required,
          calls_logged: calls,
          leads_worked: leads,
          contacted: count(e.id, ['STATUS_CHANGED']),
          qualified: count(e.id, ['QUALIFIED']),
          dropped: count(e.id, ['LEAD_DROPPED']),
          site_visit_actions: byType
            .filter((r) => r.actor_id === e.id && r.activity_type.startsWith('SITE_VISIT'))
            .reduce((n, r) => n + r._count._all, 0),
          visits_completed: visits,
          tasks_completed: tasks,
          leads_imported: count(e.id, ['LEAD_CREATED']),
          first_action: fl?._min.created_at || null,
          last_action: fl?._max.created_at || null,
          report: report
            ? {
                submitted_at: report.submitted_at,
                reported_calls: report.call_count,
                summary: (report.summary || '').slice(0, 200),
              }
            : null,
          flags,
        };
      });

      return res.status(200).json({ date: dateString, employees: rows });
    } catch (error) {
      logger.error('Team today error:', error);
      return res.status(500).json({ error: "Failed to load the team's day" });
    }
  },
);

// GET /api/v1/md/approvals-inbox — everything waiting on the MD, in one place.
// The MD's pending work used to be spread over six screens (Action Center,
// Payments & Refunds, PM Approvals, HR Approvals, Complaints, dashboard
// escalations) with no counts, so he had to open each one to find out if
// anything was waiting. Each section returns a count, its 5 oldest items,
// and the screen where it's acted on.
router.get(
  '/approvals-inbox',
  authenticateToken,
  requireRole([Roles.MD, Roles.ADMIN]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const isAdmin = req.user!.roles.includes(Roles.ADMIN);
      const companyIds = await getAccessibleCompanyIds(req.user!);
      const co = isAdmin ? {} : { company_id: { in: companyIds } };
      // AttendanceProposal has no employee relation -- filter by employee ids.
      const companyEmployees = await p.employee.findMany({
        where: isAdmin ? {} : { company_id: { in: companyIds } },
        select: { id: true, full_name: true, employee_code: true },
      });
      const nameOf = new Map(companyEmployees.map((e) => [e.id, e.full_name || e.employee_code]));
      const empCo = isAdmin ? {} : { employee_id: { in: companyEmployees.map((e) => e.id) } };
      const leadCo = isAdmin ? {} : { lead: { company_id: { in: companyIds } } };
      const now = new Date();
      const take = 5;
      const visitWhere = { status: { in: ['REQUESTED', 'PENDING_ACCEPTANCE'] as any }, ...leadCo };

      const [
        properties,
        propertiesN,
        projects,
        projectsN,
        bookings,
        bookingsN,
        refunds,
        refundsN,
        proposals,
        proposalsN,
        visits,
        visitsN,
        complaints,
        complaintsN,
      ] = await Promise.all([
        p.property.findMany({
          where: { ...co, status: 'PENDING_MD_APPROVAL' },
          select: { id: true, title: true, property_code: true, updated_at: true },
          orderBy: { updated_at: 'asc' },
          take,
        }),
        p.property.count({ where: { ...co, status: 'PENDING_MD_APPROVAL' } }),
        p.project.findMany({
          where: { ...co, verification_status: 'PENDING_MD_APPROVAL' },
          select: { id: true, name: true, project_code: true, updated_at: true },
          orderBy: { updated_at: 'asc' },
          take,
        }),
        p.project.count({ where: { ...co, verification_status: 'PENDING_MD_APPROVAL' } }),
        p.booking.findMany({
          where: { ...co, form_status: 'SUBMITTED' },
          select: { id: true, booking_code: true, updated_at: true },
          orderBy: { updated_at: 'asc' },
          take,
        }),
        p.booking.count({ where: { ...co, form_status: 'SUBMITTED' } }),
        p.expenseRefund.findMany({
          where: { ...co, status: 'ACCOUNTANT_APPROVED' },
          select: {
            id: true,
            amount: true,
            purpose: true,
            created_at: true,
            employee: { select: { full_name: true } },
          },
          orderBy: { created_at: 'asc' },
          take,
        }),
        p.expenseRefund.count({ where: { ...co, status: 'ACCOUNTANT_APPROVED' } }),
        p.attendanceProposal.findMany({
          where: { status: 'PENDING', ...empCo },
          select: {
            id: true,
            type: true,
            target_date: true,
            created_at: true,
            employee_id: true,
          },
          orderBy: { created_at: 'asc' },
          take,
        }),
        p.attendanceProposal.count({ where: { status: 'PENDING', ...empCo } }),
        // Visits nobody on the PM side has accepted yet, including ones whose
        // date has already gone by (production: every visit ever booked).
        p.siteVisitBooking.findMany({
          where: visitWhere,
          select: {
            id: true,
            booking_code: true,
            scheduled_date: true,
            lead: { select: { customer_name: true } },
            project_manager: { select: { full_name: true } },
          },
          orderBy: { scheduled_date: 'asc' },
          take,
        }),
        p.siteVisitBooking.count({ where: visitWhere }),
        p.complaint.findMany({
          where: { ...co, status: { in: ['OPEN', 'REOPENED'] } },
          select: { id: true, title: true, created_at: true },
          orderBy: { created_at: 'asc' },
          take,
        }),
        p.complaint.count({ where: { ...co, status: { in: ['OPEN', 'REOPENED'] } } }),
      ]);

      const sections = [
        {
          key: 'properties',
          label: 'Properties to approve',
          link: '/action-center',
          count: propertiesN,
          items: properties.map((x) => ({
            id: x.id,
            title: x.title,
            subtitle: x.property_code,
            since: x.updated_at,
          })),
        },
        {
          key: 'projects',
          label: 'Projects to approve',
          link: '/action-center',
          count: projectsN,
          items: projects.map((x) => ({
            id: x.id,
            title: x.name,
            subtitle: x.project_code,
            since: x.updated_at,
          })),
        },
        {
          key: 'bookings',
          label: 'Booking forms to approve',
          link: '/action-center',
          count: bookingsN,
          items: bookings.map((x) => ({ id: x.id, title: x.booking_code, since: x.updated_at })),
        },
        {
          key: 'refunds',
          label: 'Expense refunds (checked by accountant)',
          link: '/finance',
          count: refundsN,
          items: refunds.map((x) => ({
            id: x.id,
            title: `Rs ${x.amount.toLocaleString('en-IN')} - ${x.employee?.full_name || ''}`,
            subtitle: x.purpose,
            since: x.created_at,
          })),
        },
        {
          key: 'leave',
          label: 'Leave & attendance requests',
          link: '/approvals',
          count: proposalsN,
          items: proposals.map((x) => ({
            id: x.id,
            title: `${nameOf.get(x.employee_id) || ''} - ${x.type.replace(/_/g, ' ').toLowerCase()}`,
            subtitle: `for ${getISTComponents(x.target_date).dateString}`,
            since: x.created_at,
          })),
        },
        {
          key: 'site_visits',
          label: 'Site visits not accepted by PM',
          link: '/site-visits',
          count: visitsN,
          items: visits.map((x) => ({
            id: x.id,
            title: `${x.booking_code} - ${x.lead?.customer_name || ''}`,
            subtitle: `PM: ${x.project_manager?.full_name || 'none'}`,
            since: x.scheduled_date,
            overdue: x.scheduled_date < now,
          })),
        },
        {
          key: 'complaints',
          label: 'Open complaints',
          link: '/complaints',
          count: complaintsN,
          items: complaints.map((x) => ({ id: x.id, title: x.title, since: x.created_at })),
        },
      ];

      return res.status(200).json({
        total: sections.reduce((n, sec) => n + sec.count, 0),
        sections,
      });
    } catch (error) {
      logger.error('Approvals inbox error:', error);
      return res.status(500).json({ error: 'Failed to load approvals' });
    }
  },
);

// GET /api/v1/md/employees - List employees for MD Control (Admin filtered out)
router.get(
  '/employees',
  authenticateToken,
  requireAuthz(Permissions.EMPLOYEES_READ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const employees = await p.employee.findMany({
        where: {
          // Packet D (15-16): company-scoped to req.user.companyId
          company_id: req.user!.companyId,
          // Filter out Admin or invisible system roles per SDD Golden Rule #2
          roles: {
            none: {
              role: {
                is_invisible: true,
              },
            },
          },
        },
        include: {
          company: true,
          branch: true,
          roles: {
            include: {
              role: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      });

      const formatted = employees.map((emp: any) => ({
        id: emp.id,
        employeeCode: emp.employee_code,
        fullName: emp.full_name || emp.employee_code,
        company: emp.company.name,
        branch: emp.branch?.name || 'All Branches',
        roles: emp.roles.map((r: any) => r.role.name),
        status: emp.status,
        attendanceRequired: emp.attendance_required,
        firstLoginDone: emp.first_login_done,
      }));

      return res.status(200).json({ employees: formatted });
    } catch (error) {
      logger.error('MD employees fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch employee list' });
    }
  },
);

// PATCH /api/v1/md/employees/:id/attendance-requirement - Toggle attendance requirement
router.patch(
  '/employees/:id/attendance-requirement',
  authenticateToken,
  requireAuthz(Permissions.EMPLOYEES_UPDATE),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetId = parseInt(req.params.id, 10);
      const { attendanceRequired } = req.body;

      if (typeof attendanceRequired !== 'boolean') {
        return res.status(400).json({ error: 'attendanceRequired must be a boolean' });
      }

      const existing = await p.employee.findUnique({
        where: { id: targetId },
        include: { roles: { include: { role: true } } },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // Safeguard: Never modify invisible Admin
      if (existing.roles.some((r: any) => r.role.is_invisible)) {
        return res.status(403).json({ error: 'Cannot modify Admin technical account' });
      }

      const updated = await p.employee.update({
        where: { id: targetId },
        data: { attendance_required: attendanceRequired },
      });

      const actorId = req.user?.employeeId || 1;

      // Write Audit Event per SDD Golden Rule #6
      await p.auditEvent.create({
        data: {
          actor_id: actorId,
          action: 'TOGGLE_ATTENDANCE_REQUIREMENT',
          entity_type: 'EMPLOYEE',
          entity_id: targetId,
          old_value: JSON.stringify({ attendance_required: existing.attendance_required }),
          new_value: JSON.stringify({ attendance_required: updated.attendance_required }),
        },
      });

      return res.status(200).json({
        message: `Updated attendance requirement for ${updated.employee_code} to ${updated.attendance_required}`,
        employeeId: updated.id,
        attendanceRequired: updated.attendance_required,
      });
    } catch (error: any) {
      next(error);
    }
  },
);

// GET /api/v1/md/executive-metrics - Real DB Metrics Aggregator for MD Executive Dashboard
// Delegates to the centralized AnalyticsService (Phase 16 Packet B extraction) so the
// KPI calculations are shared with /api/v1/analytics/kpis. The flat response contract
// below is preserved EXACTLY (same field names) - this is behavior-preserving.
router.get(
  '/executive-metrics',
  authenticateToken,
  requireAuthz(Permissions.ADMIN_SYSTEM_METRICS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId || 1;
      const metrics = await AnalyticsService.getExecutiveMetrics(companyId);
      return res.status(200).json(metrics);
    } catch (error: any) {
      logger.error('Fetch executive metrics error:', error);
      return res.status(500).json({ error: 'Failed to fetch executive metrics' });
    }
  },
);

// GET /api/v1/md/recent-activity - Portal-wide activity feed for the MD dashboard
router.get(
  '/recent-activity',
  authenticateToken,
  requireAuthz(Permissions.ADMIN_SYSTEM_METRICS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId || 1;
      const activity = await AnalyticsService.getRecentActivity(companyId);
      return res.status(200).json({ activity });
    } catch (error: any) {
      logger.error('Fetch recent activity error:', error);
      return res.status(500).json({ error: 'Failed to fetch recent activity' });
    }
  },
);

// GET /api/v1/md/lead-pipeline-counts - Per-stage lead counts (NEW..BOOKED) for
// the MD/Admin dashboard's pipeline tabs. Polled by the frontend for a
// near-real-time count without requiring a manual page refresh.
router.get(
  '/lead-pipeline-counts',
  authenticateToken,
  requireAuthz(Permissions.ADMIN_SYSTEM_METRICS),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId || 1;
      const stages = await AnalyticsService.getLeadPipelineCounts(companyId);
      return res.status(200).json({ stages });
    } catch (error: any) {
      logger.error('Fetch lead pipeline counts error:', error);
      return res.status(500).json({ error: 'Failed to fetch lead pipeline counts' });
    }
  },
);

export default router;
