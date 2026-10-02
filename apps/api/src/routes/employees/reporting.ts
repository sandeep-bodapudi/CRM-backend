import { logger } from '../../utils/logger';
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../../middleware/auth';
import { validateRequestBody } from '../../middleware/validate';
import { Roles } from '../../shared';
import { getCompanyLeaders, suggestManager } from '../../utils/reportingRules';

// Reporting-structure suggestions. Production had a reporting manager on 1
// of 13 active employees, so every "my team" view was empty for managers.
// GET lists who would get which manager under the company's default rule
// (utils/reportingRules.ts); POST applies the ones the MD/HR ticked. Only
// empty or fallback assignments are suggested -- a manager chosen by hand is
// never changed.
const router = Router();
const p = prisma;
const REVIEWERS = [Roles.MD, Roles.ADMIN, Roles.HR_MANAGER];

const ApplySchema = z.object({
  employee_ids: z.array(z.number().int().positive()).min(1).max(500),
});

const computeSuggestions = async (companyId: number) => {
  const [leaders, employees] = await Promise.all([
    getCompanyLeaders(companyId),
    p.employee.findMany({
      where: {
        company_id: companyId,
        status: 'ACTIVE',
        roles: { none: { role: { is_invisible: true } } },
      },
      select: {
        id: true,
        full_name: true,
        employee_code: true,
        reporting_manager_id: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { full_name: 'asc' },
    }),
  ]);

  // No relation to the manager's row in the schema; resolve names here.
  const nameOf = new Map(employees.map((e) => [e.id, e.full_name || e.employee_code]));
  const rows = employees.flatMap((e) => {
    const roleNames = e.roles.map((r) => r.role.name);
    const suggested = suggestManager(e.id, roleNames, e.reporting_manager_id, leaders);
    if (!suggested) return [];
    return [
      {
        id: e.id,
        name: e.full_name || e.employee_code,
        employee_code: e.employee_code,
        roles: roleNames,
        current_manager:
          e.reporting_manager_id != null
            ? nameOf.get(e.reporting_manager_id) || `Employee #${e.reporting_manager_id}`
            : null,
        suggested_manager_id: suggested.id,
        suggested_manager: suggested.name,
      },
    ];
  });
  return {
    leaders: {
      md: leaders.MD?.name || null,
      marketing_director: leaders.MARKETING_DIRECTOR?.name || null,
      digital_head: leaders.DIGITAL_HEAD?.name || null,
    },
    suggestions: rows,
  };
};

// GET /api/v1/employees/reporting-suggestions
router.get(
  '/reporting-suggestions',
  authenticateToken,
  requireRole(REVIEWERS),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      return res.status(200).json(await computeSuggestions(req.user!.companyId));
    } catch (error) {
      logger.error('Reporting suggestions error:', error);
      return res.status(500).json({ error: 'Failed to load reporting suggestions' });
    }
  },
);

// POST /api/v1/employees/reporting-suggestions/apply { employee_ids }
// Recomputes on the server (the client only chooses who), so a stale page
// can't set a manager the rule no longer suggests.
router.post(
  '/reporting-suggestions/apply',
  authenticateToken,
  requireRole(REVIEWERS),
  validateRequestBody(ApplySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const wanted = new Set<number>(req.body.employee_ids);
      const { suggestions } = await computeSuggestions(req.user!.companyId);
      const toApply = suggestions.filter((s) => wanted.has(s.id));

      await p.$transaction([
        ...toApply.map((s) =>
          p.employee.update({
            where: { id: s.id },
            data: { reporting_manager_id: s.suggested_manager_id },
          }),
        ),
        p.auditEvent.create({
          data: {
            actor_id: req.user!.employeeId,
            action: 'APPLY_DEFAULT_REPORTING_MANAGERS',
            entity_type: 'EMPLOYEE',
            entity_id: 0,
            new_value: JSON.stringify(
              toApply.map((s) => ({
                employee_id: s.id,
                from: s.current_manager,
                to: s.suggested_manager,
              })),
            ),
          },
        }),
      ]);

      return res.status(200).json({ updated: toApply.length });
    } catch (error) {
      logger.error('Apply reporting suggestions error:', error);
      return res.status(500).json({ error: 'Failed to update reporting managers' });
    }
  },
);

export default router;
