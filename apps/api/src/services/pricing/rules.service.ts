import { prisma } from '../../lib/prisma';
import { TokenPayload } from '../../utils/jwt';
import { buildProjectScope } from '../../authz/dataScope';
import { can } from '../../authz/authorization';
import { Permissions } from '../../shared';
import {
  ProjectPricingRuleCreateInput,
  ProjectPricingRuleUpdateInput,
} from '../../shared/projectUnit';
import {
  isApproved,
  notifyPricingChange,
  recordChanges,
  requireReason,
  ruleChanges,
  ruleName,
  ruleRate,
} from '../projectChangeLog';

const p = prisma;

/** CRUD for a project's pricing rules — the facing/floor/corner tables and
 * mandatory charges an admin configures once per project (spec sections 16-19).
 * Gated on PROJECTS_UPDATE: rules are part of managing the project, the same
 * way layout images and PM assignment are, not a separate permission surface. */
export class PricingRulesService {
  private static async assertProjectInScope(user: TokenPayload, projectId: number) {
    const scope = await buildProjectScope(user);
    const project = await p.project.findFirst({ where: { id: projectId, ...scope } });
    if (!project) throw { status: 404, message: 'Project not found' };
    return project;
  }

  static async listRules(user: TokenPayload, projectId: number) {
    await this.assertProjectInScope(user, projectId);
    return p.projectPricingRule.findMany({
      where: { project_id: projectId },
      orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }],
    });
  }

  static async createRule(
    user: TokenPayload,
    projectId: number,
    data: ProjectPricingRuleCreateInput,
  ) {
    const project = await this.assertProjectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }
    // Owner, 2026-11-02: plot sales carry no GST.
    if (data.applies_to_unit_type === 'PLOT' && (data.kind === 'TAX' || data.is_tax)) {
      throw { status: 400, message: 'Plots carry no GST — a tax rule cannot apply to plots.' };
    }
    const { change_reason: reason, ...fields } = data;
    requireReason(project, reason);
    const rule = await p.projectPricingRule.create({
      data: { project_id: projectId, ...fields },
    });
    if (isApproved(project)) {
      const changes = [{ field: `${ruleName(rule)} added`, before: '—', after: ruleRate(rule) }];
      await recordChanges(p, {
        projectId,
        actorId: user.employeeId!,
        area: 'PRICING',
        changes,
        reason,
      });
      await notifyPricingChange(project, user.employeeId!, changes, reason);
    }
    return rule;
  }

  static async updateRule(
    user: TokenPayload,
    projectId: number,
    ruleId: number,
    data: ProjectPricingRuleUpdateInput,
  ) {
    const project = await this.assertProjectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }
    const rule = await p.projectPricingRule.findFirst({
      where: { id: ruleId, project_id: projectId },
    });
    if (!rule) throw { status: 404, message: 'Pricing rule not found' };
    // Same rule as createRule, now that rules can be edited in place.
    const unitType =
      data.applies_to_unit_type !== undefined
        ? data.applies_to_unit_type
        : rule.applies_to_unit_type;
    const isTax = (data.kind ?? rule.kind) === 'TAX' || (data.is_tax ?? rule.is_tax);
    if (unitType === 'PLOT' && isTax) {
      throw { status: 400, message: 'Plots carry no GST — a tax rule cannot apply to plots.' };
    }
    const { change_reason: reason, ...fields } = data;
    const changes = ruleChanges(rule, fields);
    if (changes.length) requireReason(project, reason);
    const updated = await p.projectPricingRule.update({ where: { id: ruleId }, data: fields });
    if (isApproved(project) && changes.length) {
      await recordChanges(p, {
        projectId,
        actorId: user.employeeId!,
        area: 'PRICING',
        changes,
        reason,
      });
      await notifyPricingChange(project, user.employeeId!, changes, reason);
    }
    return updated;
  }

  static async deleteRule(
    user: TokenPayload,
    projectId: number,
    ruleId: number,
    reason?: string | null,
  ) {
    const project = await this.assertProjectInScope(user, projectId);
    if (!can(user, Permissions.PROJECTS_UPDATE, project)) {
      throw { status: 403, message: 'Forbidden: Missing projects.update permission' };
    }
    const rule = await p.projectPricingRule.findFirst({
      where: { id: ruleId, project_id: projectId },
    });
    if (!rule) throw { status: 404, message: 'Pricing rule not found' };
    // Soft-deactivate rather than hard delete: PriceLine rows reference rules by
    // id (rule_id, onDelete: SetNull) so a past cost sheet stays legible even
    // after the rule that produced it is retired — hard-deleting would either
    // orphan those lines silently (SetNull) or block the delete outright.
    requireReason(project, reason);
    await p.projectPricingRule.update({ where: { id: ruleId }, data: { is_active: false } });
    if (isApproved(project)) {
      const changes = [{ field: `${ruleName(rule)} removed`, before: ruleRate(rule), after: '—' }];
      await recordChanges(p, {
        projectId,
        actorId: user.employeeId!,
        area: 'PRICING',
        changes,
        reason,
      });
      await notifyPricingChange(project, user.employeeId!, changes, reason);
    }
    return { deactivated: true };
  }
}
