import { TokenPayload } from '../utils/jwt';
import { Roles, Permissions } from '../shared';

/**
 * Phase 5 Packet 3 — ProjectPolicy
 *
 * Enforces object-level authorization for Project resources.
 *
 * Authorization rules per Phase 5 authoritative documentation:
 * - docs/archive/2026-08/roadmap/phase-5/03-project-level-authorization.md
 * - docs/archive/2026-08/roadmap/phase-5/06-phase-5-acceptance-criteria.md
 *
 * ADMIN / MD / MANAGEMENT: Full visibility and mutation rights within company_id.
 * PROJECT_MANAGER: Only projects explicitly assigned to them (assigned_pm_id = user.employeeId).
 * TELECALLER / AGENT: Read-only on launched projects (no write rights).
 */
export class ProjectPolicy {
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

  /**
   * Determines whether a user may read (view) a specific Project.
   * - Management: may read any project in their company.
   * - Project Manager: may only read projects explicitly assigned to them.
   * - Telecaller/Agent: may read non-PLANNING, non-CANCELLED projects (read-only for pitching).
   */
  static canRead(
    user: TokenPayload,
    project: { company_id: number; assigned_pm_id: number | null; status: string },
  ): boolean {
    // Cross-company access is always forbidden (except Admin who has no company_id restriction)
    if (!user.roles.includes(Roles.ADMIN) && project.company_id !== user.companyId) {
      return false;
    }

    // Admin: global access
    if (user.roles.includes(Roles.ADMIN)) {
      return true;
    }

    // Management: full company visibility
    if (this.isManagement(user)) {
      return true;
    }

    // Project Manager: ONLY explicitly assigned projects
    if (user.roles.includes(Roles.PROJECT_MANAGER)) {
      return this.isOwningPm(user, project);
    }

    // Telecaller / Agent: read launched projects (UNDER_CONSTRUCTION or COMPLETED)
    if (user.roles.includes(Roles.TELECALLER) || user.roles.includes(Roles.AGENT)) {
      return !['PLANNING', 'CANCELLED'].includes(project.status);
    }

    // All others: no access
    return false;
  }

  /**
   * Determines whether a user may create a Project.
   * Only roles with PROJECTS_CREATE permission.
   */
  static canCreate(user: TokenPayload): boolean {
    return (user.permissions || []).includes(Permissions.PROJECTS_CREATE);
  }

  /**
   * Determines whether a user may update a specific Project.
   * - Management: may update any project in their company.
   * - Project Manager: may ONLY update projects explicitly assigned to them.
   * - Telecaller/Agent: NO write access to projects.
   */
  static canUpdate(
    user: TokenPayload,
    project: { company_id: number; assigned_pm_id: number | null },
  ): boolean {
    if (!(user.permissions || []).includes(Permissions.PROJECTS_UPDATE)) {
      return false;
    }
    if (!user.roles.includes(Roles.ADMIN) && project.company_id !== user.companyId) {
      return false;
    }
    if (user.roles.includes(Roles.ADMIN)) return true;
    if (this.isManagement(user)) return true;

    // Project Manager: assignment-based
    // Inventory Executive edits every project/property in the company on
    // the PMs' behalf (no delete -- they don't hold the delete permission).
    if (
      user.roles.includes(Roles.INVENTORY_EXECUTIVE) ||
      user.roles.includes(Roles.DATA_ENTRY_OPERATOR)
    )
      return true;

    if (user.roles.includes(Roles.PROJECT_MANAGER)) {
      return this.isOwningPm(user, project);
    }

    return false;
  }

  /**
   * Determines whether a user may delete (archive/cancel) a specific Project.
   * Same rules as canUpdate.
   */
  static canDelete(
    user: TokenPayload,
    project: { company_id: number; assigned_pm_id: number | null },
  ): boolean {
    if (!(user.permissions || []).includes(Permissions.PROJECTS_DELETE)) {
      return false;
    }
    if (!user.roles.includes(Roles.ADMIN) && project.company_id !== user.companyId) {
      return false;
    }
    if (user.roles.includes(Roles.ADMIN)) return true;
    if (this.isManagement(user)) return true;

    // Project Manager: assignment-based
    if (user.roles.includes(Roles.PROJECT_MANAGER)) {
      return this.isOwningPm(user, project);
    }

    return false;
  }
}
