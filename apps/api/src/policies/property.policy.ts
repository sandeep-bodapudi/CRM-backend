import { TokenPayload } from '../utils/jwt';
import { Roles, Permissions } from '../shared';
import { Property } from '@prisma/client';

export class PropertyPolicy {
  /**
   * A Project Manager "owns" a record when it is assigned to them, or when
   * they created it and nobody has been assigned yet -- without the second
   * case a PM who creates something with no PM set could not edit their own
   * new record.
   */
  private static isOwningPm(
    user: TokenPayload,
    rec: { assigned_pm_id: number | null; created_by_id?: number | null },
  ): boolean {
    if (rec.assigned_pm_id === user.employeeId) return true;
    return rec.assigned_pm_id == null && rec.created_by_id === user.employeeId;
  }

  private static isManagement(user: TokenPayload): boolean {
    return user.roles.some((r) =>
      [
        Roles.MD,
        Roles.ADMIN,
        Roles.HR_MANAGER,
        Roles.MARKETING_DIRECTOR,
        Roles.DIGITAL_LEAD_OPERATOR,
        Roles.DIGITAL_MARKETING_HEAD,
      ].includes(r as any),
    );
  }

  static canCreate(user: TokenPayload): boolean {
    return (user.permissions || []).includes(Permissions.PROPERTIES_CREATE);
  }

  /**
   * Determines whether a user may update a specific Property.
   * Mirrors ProjectPolicy.canUpdate. Was previously routed through canVerify
   * in authorization.ts's switch statement — incorrect, since that requires
   * PROPERTIES_VERIFY specifically and assignment-as-PM, which would wrongly
   * block e.g. a DM Executive with PROPERTIES_UPDATE editing SEO fields.
   * (Latent until now: no caller passed a resource for this action.)
   */
  static canUpdate(user: TokenPayload, property: Property): boolean {
    if (!(user.permissions || []).includes(Permissions.PROPERTIES_UPDATE)) {
      return false;
    }
    // ADMIN bypasses company scoping entirely — matches buildPropertyScope's
    // own `user.roles.includes(Roles.ADMIN) ? {} : ...` and ProjectPolicy's
    // equivalent methods. Was previously an unconditional mismatch check that
    // would 403 an Admin acting on a property outside their own companyId.
    if (!user.roles.includes(Roles.ADMIN) && property.company_id !== user.companyId) {
      return false;
    }
    if (user.roles.includes(Roles.ADMIN) || this.isManagement(user)) {
      return true;
    }
    if (user.roles.includes(Roles.PROJECT_MANAGER)) {
      return this.isOwningPm(user, property);
    }
    return false;
  }

  /**
   * Determines whether a user may delete (archive) a specific Property.
   * Same rules as canUpdate.
   */
  static canDelete(user: TokenPayload, property: Property): boolean {
    if (!(user.permissions || []).includes(Permissions.PROPERTIES_DELETE)) {
      return false;
    }
    if (!user.roles.includes(Roles.ADMIN) && property.company_id !== user.companyId) {
      return false;
    }
    if (user.roles.includes(Roles.ADMIN) || this.isManagement(user)) {
      return true;
    }
    if (user.roles.includes(Roles.PROJECT_MANAGER)) {
      return this.isOwningPm(user, property);
    }
    return false;
  }

  static canVerify(user: TokenPayload, property: Property): boolean {
    if (!(user.permissions || []).includes(Permissions.PROPERTIES_VERIFY)) {
      return false;
    }
    // Same ADMIN-bypass fix as canUpdate/canDelete above — this had the same
    // latent bug (unconditional company mismatch check ahead of the Admin
    // check), just never exercised by a cross-company Admin verify before.
    if (!user.roles.includes(Roles.ADMIN) && property.company_id !== user.companyId) {
      return false;
    }
    // MD/Admin can bypass assignment check
    if (user.roles.includes(Roles.MD) || user.roles.includes(Roles.ADMIN)) {
      return true;
    }
    // Must be explicitly assigned to this PM
    return property.assigned_pm_id === user.employeeId;
  }

  static canDMPolish(user: TokenPayload, property: Property): boolean {
    if (!(user.permissions || []).includes(Permissions.PROPERTIES_DM_POLISH)) {
      return false;
    }
    return user.roles.includes(Roles.ADMIN) || property.company_id === user.companyId;
  }

  static canMDApprove(user: TokenPayload, property: Property): boolean {
    if (!(user.permissions || []).includes(Permissions.PROPERTIES_MD_APPROVE)) {
      return false;
    }
    return user.roles.includes(Roles.ADMIN) || property.company_id === user.companyId;
  }
}
