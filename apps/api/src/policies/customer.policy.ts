import { TokenPayload } from '../utils/jwt';
import { Roles } from '../shared';
import { Customer } from '@prisma/client';

/**
 * Phase 3 - Customer Resource Scope Policy
 * Enforces ownership and cross-company boundaries before mutating data.
 */
export class CustomerPolicy {
  /**
   * Identifies if a user holds a management role with global customer access.
   */
  private static isManagement(user: TokenPayload): boolean {
    return user.roles.some((r) =>
      [
        Roles.MD,
        Roles.ADMIN,
        Roles.HR_MANAGER,
        Roles.MARKETING_DIRECTOR,
        Roles.DIGITAL_LEAD_OPERATOR,
        Roles.PROJECT_MANAGER,
      ].includes(r as any),
    );
  }

  /**
   * Determines if the user is permitted to view the customer.
   * - Must belong to the same company.
   * - Management/PMs can view all customers in the company.
   * - Agents/Telecallers can only view customers assigned to them.
   */
  static canView(user: TokenPayload, customer: Customer): boolean {
    if (customer.company_id !== user.companyId) {
      return false; // Never allow cross-company access
    }

    if (this.isManagement(user)) {
      return true;
    }

    // Telecallers/Agents: Assigned access only
    return customer.assigned_to_id === user.employeeId;
  }

  /**
   * Determines if the user is permitted to mutate (update/convert) the customer.
   * - Applies the same rules as canView.
   */
  static canMutate(user: TokenPayload, customer: Customer): boolean {
    return this.canView(user, customer);
  }
}
