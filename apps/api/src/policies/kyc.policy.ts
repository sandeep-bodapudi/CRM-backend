import { TokenPayload } from '../utils/jwt';
import { Roles, Permissions } from '../shared';

interface CustomerLike {
  company_id: number;
}

// KYC-authorized tier (Phase 11). Note: KYC status is now owned by
// by the customer portal and surfaces back via IntegrationService.processKycCallback.
const KYC_AUTHORIZED_ROLES = [Roles.MD, Roles.ADMIN, Roles.HR_MANAGER, Roles.FINANCE];

/**
 * Phase 11 Packet 3C - Customer KYC Resource Scope Policy.
 * Enforces the CUSTOMERS_KYC_WRITE permission and hard company boundaries
 * before any mutation of HIGH-class customer KYC data.
 */
export class KycPolicy {
  static isKYCRole(user: TokenPayload): boolean {
    return user.roles.some((r) => KYC_AUTHORIZED_ROLES.includes(r as any));
  }

  static canWrite(user: TokenPayload, customer: CustomerLike): boolean {
    if (!(user.permissions || []).includes(Permissions.CUSTOMERS_KYC_WRITE)) {
      return false;
    }
    if (customer.company_id !== user.companyId) {
      return false; // Never allow cross-company KYC access (customer.policy.ts:33-35 pattern)
    }
    return true;
  }
}
