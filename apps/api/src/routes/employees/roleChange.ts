import { Prisma } from '@prisma/client';
import { Roles } from '../../shared';
import { TokenPayload } from '../../utils/jwt';

/**
 * Shared rules for giving an employee a new system role, used by both
 * PUT /employees/:id (Edit) and POST /employees/:id/promote. Promote used to
 * have none of these checks, so anyone with employees.update (e.g. HR) could
 * "promote" themselves or anyone else straight to Admin or MD.
 *
 * Returns an error message, or null when the change is allowed.
 */
export function roleAssignmentError(
  actor: TokenPayload,
  targetEmployeeId: number,
  currentRoleNames: string[],
  newRoleName: string,
): string | null {
  const isChange = !currentRoleNames.includes(newRoleName);
  if (!isChange) return null; // re-saving a role they already have is a no-op

  if (targetEmployeeId === actor.employeeId) {
    return 'Forbidden: You cannot change your own role';
  }
  if (newRoleName === Roles.ADMIN && !actor.roles.includes(Roles.ADMIN)) {
    return 'Forbidden: Only Admin can assign the Admin role';
  }
  if (
    newRoleName === Roles.MD &&
    !actor.roles.includes(Roles.ADMIN) &&
    !actor.roles.includes(Roles.MD)
  ) {
    return 'Forbidden: Only MD or Admin can assign the MD role';
  }
  return null;
}

/**
 * Gives the employee `newRoleName`. When `replacesRoleName` is one of their
 * current roles, only that role is swapped and any other roles are kept.
 * Without it, the employee ends up with just the new role (the old
 * behaviour). Edit used to always take the second path, so editing
 * anything about someone with two roles (even just a phone number) silently
 * deleted their second role.
 *
 * Returns true when the employee's roles actually changed.
 */
export async function applyRoleChange(
  tx: Prisma.TransactionClient,
  employeeId: number,
  newRoleName: string,
  replacesRoleName?: string | null,
): Promise<boolean> {
  const targetRole = await tx.role.findUnique({ where: { name: newRoleName } });
  if (!targetRole) return false;

  const currentRoles = await tx.employeeRole.findMany({
    where: { employee_id: employeeId },
    include: { role: true },
  });
  if (currentRoles.some((r) => r.role.name === newRoleName)) return false;

  const replaced = replacesRoleName
    ? currentRoles.find((r) => r.role.name === replacesRoleName)
    : undefined;

  if (replaced) {
    await tx.employeeRole.deleteMany({
      where: { employee_id: employeeId, role_id: replaced.role_id },
    });
  } else {
    await tx.employeeRole.deleteMany({ where: { employee_id: employeeId } });
  }
  await tx.employeeRole.create({ data: { employee_id: employeeId, role_id: targetRole.id } });
  return true;
}
