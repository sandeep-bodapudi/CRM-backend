import { Roles, Permissions } from '../../shared';

// Mirrors the API's ProjectPolicy.canUpdate / canDelete
// (apps/api/src/policies/project.policy.ts), so a button only shows to
// someone the server will let through — a PM who isn't assigned used to see
// "Edit Project" / "Put On Hold" and then be refused.

type User = { id: number; roles: string[]; permissions?: string[] } | null | undefined;
type Project = { assigned_pm_id?: number | null; created_by_id?: number | null } | null | undefined;

const MANAGEMENT = [
  Roles.MD,
  Roles.ADMIN,
  Roles.HR_MANAGER,
  Roles.MARKETING_DIRECTOR,
  Roles.DIGITAL_LEAD_OPERATOR,
  Roles.DIGITAL_MARKETING_HEAD,
] as string[];

const isOwningPm = (user: NonNullable<User>, project: NonNullable<Project>) =>
  project.assigned_pm_id === user.id ||
  (project.assigned_pm_id == null && project.created_by_id === user.id);

export function canUpdateProject(user: User, project: Project): boolean {
  if (!user || !project || !user.permissions?.includes(Permissions.PROJECTS_UPDATE)) return false;
  if (user.roles.some((r) => MANAGEMENT.includes(r))) return true;
  if (
    user.roles.includes(Roles.INVENTORY_EXECUTIVE) ||
    user.roles.includes(Roles.DATA_ENTRY_OPERATOR)
  )
    return true;
  return user.roles.includes(Roles.PROJECT_MANAGER) && isOwningPm(user, project);
}

export function canDeleteProject(user: User, project: Project): boolean {
  if (!user || !project || !user.permissions?.includes(Permissions.PROJECTS_DELETE)) return false;
  if (user.roles.some((r) => MANAGEMENT.includes(r))) return true;
  return user.roles.includes(Roles.PROJECT_MANAGER) && isOwningPm(user, project);
}
