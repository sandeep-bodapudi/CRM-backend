import { TokenPayload } from '../utils/jwt';
import { Roles } from '../shared';
import { Booking } from '@prisma/client';

/**
 * Phase 5 - Booking Resource Scope Policy
 * Enforces ownership and cross-company boundaries before mutating data.
 */
export class BookingPolicy {
  /**
   * Identifies if a user holds a management role with global booking access within their company.
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
   * Determines if the user is permitted to view the booking.
   * - Must belong to the same company.
   * - Management can view all bookings in the company.
   * - Agents/Telecallers can only view bookings assigned to them.
   */
  static canView(user: TokenPayload, booking: Booking): boolean {
    if (booking.company_id !== user.companyId) {
      return false; // Never allow cross-company access
    }

    if (this.isManagement(user)) {
      return true;
    }

    // Telecallers/Agents: Assigned access only
    return booking.assigned_employee_id === user.employeeId;
  }

  /**
   * Determines if the user is permitted to mutate (update/cancel/confirm) the booking.
   */
  static canMutate(user: TokenPayload, booking: Booking): boolean {
    return this.canView(user, booking);
  }
}
