import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { validateRequestBody } from '../middleware/validate';
import { DailyTargetSetSchema, Roles, Permissions } from '../shared';
import { requireAuthz } from '../middleware/authz';
import { can } from '../authz/authorization';
import { getDownstreamEmployeeIds } from '../utils/hierarchy';
import {
  TARGET_METRICS,
  TARGET_PERIODS,
  METRIC_LABELS,
  progressFor,
  TargetMetric,
} from '../services/targets.service';

const router = Router();

const p = prisma;

// Helper to generate basic schema for roles
const generateBasicSchema = (metrics: string[], hasChecklist = false): any[] => {
  const schema: any[] = metrics.map((m) => ({
    id: m,
    label: m.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()),
    type: 'COUNT',
    required: true,
    targetValue: 0, // Will be overridden manually by MD, but provides structure
  }));
  if (hasChecklist) {
    schema.push({
      id: 'dailyTaskListCompleted',
      label: 'Daily Task List Completed',
      type: 'CHECKLIST',
      required: true,
    });
    schema.push({
      id: 'endOfDayCleanup',
      label: 'End Of Day Cleanup',
      type: 'CHECKLIST',
      required: true,
    });
  }
  schema.push({
    id: 'feedback',
    label: 'Daily Feedback & Notes',
    type: 'LONG_TEXT',
    required: false,
  });
  return schema;
};

// Standard 1-Click Role Presets (Saving MD & Marketing Director time)
const ROLE_PRESETS: Record<
  string,
  { target_type: string; targets_json: Record<string, any>; form_schema_json: any[] }
> = {
  [Roles.TELECALLER]: {
    target_type: 'COUNT',
    targets_json: { callsMade: 50, newCalls: 35, followupsDone: 15, leadsQualified: 5 },
    form_schema_json: generateBasicSchema([
      'callsMade',
      'newCalls',
      'followupsDone',
      'leadsQualified',
    ]),
  },
  [Roles.PROJECT_MANAGER]: {
    target_type: 'COUNT',
    targets_json: { siteVisits: 3, propertyVerifications: 2 },
    form_schema_json: generateBasicSchema(['siteVisits', 'propertyVerifications']),
  },
  [Roles.DIGITAL_LEAD_OPERATOR]: {
    target_type: 'COUNT',
    targets_json: { leadsProcessed: 100, telecallerAssignments: 5 },
    form_schema_json: generateBasicSchema(['leadsProcessed', 'telecallerAssignments']),
  },
  [Roles.DIGITAL_MARKETING_HEAD]: {
    target_type: 'COUNT',
    targets_json: { adSpendMonitored: 1, contentPosts: 3, leadsGenerated: 20 },
    form_schema_json: generateBasicSchema(['adSpendMonitored', 'contentPosts', 'leadsGenerated']),
  },
  [Roles.HR_MANAGER]: {
    target_type: 'COUNT',
    targets_json: { interviewsConducted: 5, attendanceQueueCleared: 1 },
    form_schema_json: generateBasicSchema(['interviewsConducted', 'attendanceQueueCleared']),
  },
  [Roles.FINANCE]: {
    target_type: 'COUNT',
    targets_json: { invoicesProcessed: 10, paymentAudits: 1 },
    form_schema_json: generateBasicSchema(['invoicesProcessed', 'paymentAudits']),
  },
  // The fields Channel Partner Managers already report (from their daily
  // reports in production); the report form shows the work-log count for
  // each next to it (apps/web DailyReportModal, CPM_FIELD_SOURCES).
  // Daily report fields for data-entry roles: what they entered/updated.
  [Roles.INVENTORY_EXECUTIVE]: {
    target_type: 'COUNT',
    targets_json: {},
    form_schema_json: generateBasicSchema(['projectsUpdated', 'propertiesUpdated', 'unitsAdded']),
  },
  [Roles.DATA_ENTRY_OPERATOR]: {
    target_type: 'COUNT',
    targets_json: {},
    form_schema_json: generateBasicSchema([
      'leadsEntered',
      'leadsCorrected',
      'propertiesUpdated',
      'customersUpdated',
      'bookingsUpdated',
    ]),
  },
  [Roles.CHANNEL_PARTNER_MANAGER]: {
    target_type: 'COUNT',
    targets_json: { newProspects: 10, associateSiteVisits: 5, associateOfficeVisits: 3 },
    form_schema_json: [
      ...[
        ['existingProspectsFollowup', 'Existing prospects followed up'],
        ['newCalls', 'New calls (new associates)'],
        ['totalCalls', 'Total calls made'],
        ['newProspects', 'New prospects'],
        ['associateOfficeVisits', "Associates' office visits"],
        ['enrollments', 'Enrollments'],
        ['associateSiteVisits', 'Associate site visits'],
        ['bookings', 'Bookings'],
      ].map(([id, label]) => ({
        id,
        label,
        type: 'COUNT',
        required: true,
        targetValue:
          ({ newProspects: 10, associateSiteVisits: 5, associateOfficeVisits: 3 } as any)[id] || 0,
      })),
      { id: 'feedback', label: 'Daily Feedback & Notes', type: 'LONG_TEXT', required: false },
    ],
  },
};

// GET /api/v1/targets/presets - Get 1-click default preset suggestions
router.get('/presets', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({ presets: ROLE_PRESETS });
});

// GET /api/v1/targets/my-target - Effective target resolution with Priority Hierarchy
router.get('/my-target', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeId = req.user!.employeeId;
    const requestedRole = req.query.role as string;
    const roleName =
      requestedRole && req.user!.roles.includes(requestedRole) ? requestedRole : req.user!.roles[0];

    // Priority 1: Employee-Specific Target (if active)
    let empTarget: any = null;
    if (p.dailyTarget) {
      empTarget = await p.dailyTarget.findFirst({
        where: {
          employee_id: employeeId,
          company_id: req.user!.companyId,
        },
        orderBy: { created_at: 'desc' },
      });
    }

    if (empTarget) {
      return res.status(200).json({
        source: 'EMPLOYEE_SPECIFIC',
        target: empTarget,
      });
    }

    // Priority 2: Active Role-Based Target
    let roleTarget: any = null;
    if (p.dailyTarget) {
      roleTarget = await p.dailyTarget.findFirst({
        where: {
          role_name: roleName,
          employee_id: null,
          company_id: req.user!.companyId,
        },
        orderBy: { created_at: 'desc' },
      });
    }

    if (roleTarget) {
      return res.status(200).json({
        source: 'ROLE_BASED',
        target: roleTarget,
      });
    }

    // Priority 3: System Default Preset Fallback
    const preset = ROLE_PRESETS[roleName] || {
      target_type: 'COUNT',
      targets_json: {},
      form_schema_json: generateBasicSchema([]),
    };

    return res.status(200).json({
      source: 'SYSTEM_PRESET',
      target: {
        role_name: roleName || 'UNKNOWN',
        target_type: preset.target_type,
        targets_json: preset.targets_json,
        form_schema_json: preset.form_schema_json,
      },
    });
  } catch (error) {
    logger.error('Fetch my-target error:', error);
    return res.status(500).json({ error: 'Failed to resolve active target' });
  }
});

// GET /api/v1/targets/all - List all targets (MD & Marketing Director view)
router.get('/all', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const roles = req.user!.roles;
    if (
      !roles.includes(Roles.MD) &&
      !roles.includes(Roles.MARKETING_DIRECTOR) &&
      !roles.includes(Roles.ADMIN)
    ) {
      return res
        .status(403)
        .json({ error: 'Access denied: MD or Marketing Director permission required.' });
    }

    let targets: any[] = [];
    if (p.dailyTarget) {
      targets = await p.dailyTarget.findMany({
        where: { company_id: req.user!.companyId },
        include: { employee: true },
        orderBy: { created_at: 'desc' },
      });
    }

    return res.status(200).json({ targets });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch targets' });
  }
});

// POST /api/v1/targets - Set/Update Target (MD & Marketing Director)
router.post(
  '/',
  authenticateToken,
  requireAuthz(Permissions.REPORTS_TARGETS_CONFIGURE),
  validateRequestBody(DailyTargetSetSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { role_name, employee_id, target_type, targets_json, form_schema_json } = req.body;
      const creatorId = req.user!.employeeId;

      if (employee_id) {
        const targetEmployee = await p.employee.findUnique({
          where: { id: employee_id },
        });
        if (!targetEmployee) {
          return res.status(404).json({ error: 'Target employee not found' });
        }

        if (!can(req.user!, Permissions.REPORTS_TARGETS_CONFIGURE, targetEmployee)) {
          return res
            .status(403)
            .json({ error: 'Forbidden: Cannot configure targets for this employee' });
        }

        const downstreamIds = await getDownstreamEmployeeIds(
          req.user!.companyId,
          req.user!.employeeId,
        );
        const isMDOrAdmin = req.user!.roles.some((r) => [Roles.MD, Roles.ADMIN].includes(r as any));
        if (!isMDOrAdmin && !downstreamIds.includes(employee_id)) {
          return res
            .status(403)
            .json({ error: 'Forbidden: Employee is not within your reporting hierarchy' });
        }
      }

      let newTarget: any = null;
      if (p.dailyTarget) {
        newTarget = await p.dailyTarget.create({
          data: {
            company_id: req.user!.companyId,
            role_name,
            employee_id: employee_id || null,
            // A number that was not given means "no target" (0), not 50 / 3 / 1:
            // those defaults used to be judged against roles that never do that work.
            calls_target: Number(targets_json?.callsMade) || 0,
            site_visits_target: Number(targets_json?.siteVisits) || 0,
            closed_deals_target: Number(targets_json?.closedDeals) || 0,
            form_schema_json: form_schema_json || null,
          },
        });
      }

      // Write Audit Event
      await p.auditEvent.create({
        data: {
          actor_id: creatorId,
          action: 'SET_DAILY_TARGET',
          entity_type: 'DAILY_TARGET',
          entity_id: newTarget?.id || 1,
          new_value: JSON.stringify({ role_name, employee_id, target_type, targets_json }),
        },
      });

      return res.status(201).json({ message: 'Daily target set successfully', target: newTarget });
    } catch (error) {
      logger.error('Set target error:', error);
      return res.status(500).json({ error: 'Failed to set target' });
    }
  },
);

// ---------------------------------------------------------------------------
// Measured targets (F-9): day / week / month, counted from what the system
// recorded. The DailyTarget routes above stay for the daily-report form.
// ---------------------------------------------------------------------------
const isTopManagement = (roles: string[]) =>
  roles.some((r) => [Roles.MD, Roles.ADMIN, Roles.MARKETING_DIRECTOR].includes(r as any));

// GET /api/v1/targets/progress - my targets and how far along I am
router.get('/progress', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const progress = await progressFor({
      id: req.user!.employeeId,
      company_id: req.user!.companyId,
      roles: req.user!.roles,
    });
    return res.status(200).json({ progress });
  } catch (error) {
    logger.error('Target progress error:', error);
    return res.status(500).json({ error: 'Failed to load your targets' });
  }
});

// GET /api/v1/targets/progress/team - progress of the people I manage (everyone, for top management)
router.get(
  '/progress/team',
  authenticateToken,
  requireAuthz(Permissions.REPORTS_TARGETS_CONFIGURE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const where: any = { company_id: req.user!.companyId, status: 'ACTIVE', deleted_at: null };
      if (!isTopManagement(req.user!.roles)) {
        where.id = {
          in: await getDownstreamEmployeeIds(req.user!.companyId, req.user!.employeeId),
        };
      }
      const people = await p.employee.findMany({
        where,
        select: {
          id: true,
          full_name: true,
          employee_code: true,
          roles: { select: { role: { select: { name: true } } } },
        },
        take: 200,
        orderBy: { full_name: 'asc' },
      });
      const employees: any[] = [];
      for (const person of people) {
        const progress = await progressFor({
          id: person.id,
          company_id: req.user!.companyId,
          roles: person.roles.map((r) => r.role.name),
        });
        if (progress.length > 0) {
          employees.push({
            id: person.id,
            name: person.full_name || person.employee_code,
            employee_code: person.employee_code,
            roles: person.roles.map((r) => r.role.name),
            progress,
          });
        }
      }
      return res.status(200).json({ employees });
    } catch (error) {
      logger.error('Team target progress error:', error);
      return res.status(500).json({ error: 'Failed to load team targets' });
    }
  },
);

// GET /api/v1/targets/rules - the active measured targets
router.get(
  '/rules',
  authenticateToken,
  requireAuthz(Permissions.REPORTS_TARGETS_CONFIGURE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rules = await p.performanceTarget.findMany({
        where: { company_id: req.user!.companyId, is_active: true },
        orderBy: [{ role_name: 'asc' }, { employee_id: 'asc' }, { metric: 'asc' }],
      });
      const ids = [...new Set(rules.map((r) => r.employee_id).filter((x): x is number => !!x))];
      const people = ids.length
        ? await p.employee.findMany({
            where: { id: { in: ids } },
            select: { id: true, full_name: true, employee_code: true },
          })
        : [];
      const byId = new Map(people.map((x) => [x.id, x.full_name || x.employee_code]));
      return res.status(200).json({
        rules: rules.map((r) => ({
          ...r,
          metric_label: METRIC_LABELS[r.metric as TargetMetric] || r.metric,
          employee_name: r.employee_id ? byId.get(r.employee_id) || null : null,
        })),
        metrics: TARGET_METRICS.map((m) => ({ key: m, label: METRIC_LABELS[m] })),
        periods: TARGET_PERIODS,
      });
    } catch (error) {
      logger.error('List target rules error:', error);
      return res.status(500).json({ error: 'Failed to load targets' });
    }
  },
);

// POST /api/v1/targets/rules - set a target for a role or a person
// ({ role_name | employee_id, metric, period, value, valid_from?, valid_to? });
// it replaces the current one for the same role/person, metric and period.
router.post(
  '/rules',
  authenticateToken,
  requireAuthz(Permissions.REPORTS_TARGETS_CONFIGURE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { role_name, employee_id, metric, period, value, valid_from, valid_to } =
        req.body || {};
      if (!TARGET_METRICS.includes(metric)) {
        return res.status(400).json({ error: 'Choose what to measure.' });
      }
      if (!TARGET_PERIODS.includes(period)) {
        return res.status(400).json({ error: 'Choose day, week or month.' });
      }
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 100000) {
        return res.status(400).json({ error: 'The target must be a whole number of 1 or more.' });
      }
      if (!!role_name === !!employee_id) {
        return res
          .status(400)
          .json({ error: 'Set a target for a role or for one person, not both.' });
      }
      const from = valid_from ? new Date(valid_from) : new Date();
      const to = valid_to ? new Date(valid_to) : null;
      if (isNaN(from.getTime()) || (to && (isNaN(to.getTime()) || to < from))) {
        return res.status(400).json({ error: 'The end date must come after the start date.' });
      }

      const top = isTopManagement(req.user!.roles);
      if (role_name) {
        if (!top) {
          return res
            .status(403)
            .json({ error: 'Only the MD or Marketing Director sets a role-wide target.' });
        }
        const role = await p.role.findFirst({ where: { name: role_name } });
        if (!role) return res.status(404).json({ error: 'That role does not exist.' });
      } else {
        const person = await p.employee.findFirst({
          where: { id: Number(employee_id), company_id: req.user!.companyId },
          select: { id: true },
        });
        if (!person) return res.status(404).json({ error: 'Employee not found.' });
        if (!top) {
          const downstream = await getDownstreamEmployeeIds(
            req.user!.companyId,
            req.user!.employeeId,
          );
          if (!downstream.includes(person.id)) {
            return res.status(403).json({ error: 'That person is not in your reporting line.' });
          }
        }
      }

      const scope = role_name
        ? { role_name: String(role_name), employee_id: null }
        : { role_name: null, employee_id: Number(employee_id) };
      const created = await p.$transaction(async (tx) => {
        await tx.performanceTarget.updateMany({
          where: { company_id: req.user!.companyId, is_active: true, metric, period, ...scope },
          data: { is_active: false },
        });
        const row = await tx.performanceTarget.create({
          data: {
            company_id: req.user!.companyId,
            ...scope,
            metric,
            period,
            value: n,
            valid_from: from,
            valid_to: to,
            created_by_id: req.user!.employeeId,
          },
        });
        await tx.auditEvent.create({
          data: {
            actor_id: req.user!.employeeId,
            action: 'PERFORMANCE_TARGET_SET',
            entity_type: 'PERFORMANCE_TARGET',
            entity_id: row.id,
            new_value: JSON.stringify({ ...scope, metric, period, value: n }),
          },
        });
        return row;
      });
      return res.status(201).json({ message: 'Target saved', target: created });
    } catch (error) {
      logger.error('Set target rule error:', error);
      return res.status(500).json({ error: 'Failed to save the target' });
    }
  },
);

// DELETE /api/v1/targets/rules/:id - stop using a target (kept for history)
router.delete(
  '/rules/:id',
  authenticateToken,
  requireAuthz(Permissions.REPORTS_TARGETS_CONFIGURE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const rule = await p.performanceTarget.findFirst({
        where: { id, company_id: req.user!.companyId, is_active: true },
      });
      if (!rule) return res.status(404).json({ error: 'Target not found.' });
      if (!isTopManagement(req.user!.roles)) {
        const downstream = await getDownstreamEmployeeIds(
          req.user!.companyId,
          req.user!.employeeId,
        );
        if (!rule.employee_id || !downstream.includes(rule.employee_id)) {
          return res.status(403).json({ error: 'You cannot remove this target.' });
        }
      }
      await p.performanceTarget.update({ where: { id }, data: { is_active: false } });
      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'PERFORMANCE_TARGET_REMOVED',
          entity_type: 'PERFORMANCE_TARGET',
          entity_id: id,
          old_value: JSON.stringify({
            metric: rule.metric,
            period: rule.period,
            value: rule.value,
          }),
        },
      });
      return res.status(200).json({ message: 'Target removed' });
    } catch (error) {
      logger.error('Remove target rule error:', error);
      return res.status(500).json({ error: 'Failed to remove the target' });
    }
  },
);

export default router;
