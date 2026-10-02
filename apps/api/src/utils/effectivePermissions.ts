import { prisma } from '../lib/prisma';

/**
 * An employee's effective permission names (role grants, then per-employee
 * overrides applied on top) in ONE database round trip.
 *
 * Loading this through Prisma includes (employee -> roles -> role ->
 * permissions -> permission, plus overrides -> permission) issues one query
 * per relation level, back to back. With the database in another region
 * every level costs a full network round trip, and /auth/refresh and
 * /auth/me sit on the critical path of every page load.
 */
export async function getEffectivePermissionNames(employeeId: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ name: string; granted: number; is_override: number }[]>`
    SELECT p.name AS name, 1 AS granted, 0 AS is_override
      FROM EmployeeRole er
      JOIN RolePermission rp ON rp.role_id = er.role_id
      JOIN Permission p ON p.id = rp.permission_id
     WHERE er.employee_id = ${employeeId}
    UNION ALL
    SELECT p.name AS name, o.is_granted AS granted, 1 AS is_override
      FROM EmployeePermissionOverride o
      JOIN Permission p ON p.id = o.permission_id
     WHERE o.employee_id = ${employeeId}`;

  const permissions = new Set<string>();
  for (const r of rows) if (!Number(r.is_override)) permissions.add(r.name);
  for (const r of rows) {
    if (!Number(r.is_override)) continue;
    if (Number(r.granted)) permissions.add(r.name);
    else permissions.delete(r.name);
  }
  return Array.from(permissions);
}
