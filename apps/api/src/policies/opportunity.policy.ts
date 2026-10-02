import { TokenPayload } from '../utils/jwt';
import { Roles } from '../shared';
import { Opportunity } from '@prisma/client';

/**
 * Phase 8 - Opportunity Resource Scope Policy
 * Enforces ownership and cross-company boundaries before mutating data.
 */
export class OpportunityPolicy {
  /**
   * Identifies if a user holds a management role with global opportunity access within the company.
   */
  private static isManagement(user: TokenPayload): boolean {
    return user.roles.some((r) =>
      [
        Roles.MD,
        Roles.ADMIN,
        Roles.HR_MANAGER,
        Roles.MARKETING_DIRECTOR,
        Roles.PROJECT_MANAGER,
      ].includes(r as any),
    );
  }

  /**
   * Generates a Prisma Prisma.OpportunityWhereInput condition for fetching opportunities safely.
   */
  static canList(user: TokenPayload): any {
    const isManagement = this.isManagement(user);

    // Unconditional tenant isolation via explicit AND
    const whereCondition: any = {
      AND: [{ company_id: user.companyId }],
    };

    if (!isManagement) {
      // Non-management restricted to their owned opportunities
      whereCondition.AND.push({
        owner_id: user.employeeId,
      });
    }

    return whereCondition;
  }

  /**
   * Determines if the user is permitted to view the opportunity.
   */
  static canView(user: TokenPayload, opp: Opportunity): boolean {
    if (opp.company_id !== user.companyId) {
      return false; // Never allow cross-company access
    }

    if (this.isManagement(user)) {
      return true;
    }

    // Telecallers/Agents: Owned access only
    return opp.owner_id === user.employeeId;
  }

  /**
   * Determines if the user is permitted to mutate (update fields) the opportunity.
   */
  static canMutate(user: TokenPayload, opp: Opportunity): boolean {
    // Currently, mutation rules are identical to view rules for assigned users.
    return this.canView(user, opp);
  }

  /**
   * Determines if the user can transition the stage of the opportunity.
   */
  static canChangeStage(user: TokenPayload, opp: Opportunity): boolean {
    return this.canView(user, opp);
  }
}
