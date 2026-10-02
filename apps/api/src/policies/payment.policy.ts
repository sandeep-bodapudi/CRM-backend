import { TokenPayload } from '../utils/jwt';
import { Roles } from '../shared';
import { Payment } from '@prisma/client';

/**
 * Phase 5 - Payment Resource Scope Policy
 * Enforces ownership and cross-company boundaries before mutating data.
 */
export class PaymentPolicy {
  /**
   * Identifies if a user holds a management role with global payment access within their company.
   */
  private static isManagement(user: TokenPayload): boolean {
    return user.roles.some((r) =>
      [
        Roles.MD,
        Roles.ADMIN,
        Roles.HR_MANAGER,
        Roles.FINANCE,
        Roles.MARKETING_DIRECTOR,
        Roles.DIGITAL_LEAD_OPERATOR,
        Roles.PROJECT_MANAGER,
      ].includes(r as any),
    );
  }

  /**
   * Determines if the user is permitted to view the payment.
   * - Must belong to the same company.
   * - Management can view all payments in the company.
   * - Agents/Telecallers can only view payments they recorded.
   */
  static canView(user: TokenPayload, payment: Payment): boolean {
    if (payment.company_id !== user.companyId) {
      return false; // Never allow cross-company access
    }

    if (this.isManagement(user)) {
      return true;
    }

    // Agents can only see payments they recorded themselves (or we rely on Booking scope).
    return payment.recorded_by_id === user.employeeId;
  }

  /**
   * Determines if the user is permitted to mutate (update/cancel) the payment.
   * Note: SUCCESS/REFUNDED states shouldn't be mutated regardless of this policy.
   */
  static canMutate(user: TokenPayload, payment: Payment): boolean {
    return this.canView(user, payment);
  }
}
