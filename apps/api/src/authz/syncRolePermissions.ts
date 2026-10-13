import { prisma } from '../lib/prisma';
import { RolePermissionsMatrix } from '../shared/auth';
import { logger } from '../utils/logger';

/**
 * Pushes RolePermissionsMatrix (the source of truth in code) into the DB's
 * Role/Permission/RolePermission tables.
 * Behavior:
 * - Adds any brand-new permissions to the `Permission` table.
 * - If a role has ZERO permissions in the DB, it seeds the full matrix for that role.
 * - If a role already has permissions, it ONLY adds brand-new permissions to it,
 *   respecting any admin revokes made in the UI for existing permissions.
 */
export async function syncRolePermissions(): Promise<void> {
  const allPermissions = new Set<string>();
  for (const role of Object.keys(RolePermissionsMatrix)) {
    for (const perm of RolePermissionsMatrix[role as keyof typeof RolePermissionsMatrix]) {
      allPermissions.add(perm);
    }
  }

  // 1. Fetch existing permissions to know which ones are brand new
  const existingPerms = await prisma.permission.findMany({ select: { name: true } });
  const existingPermNames = new Set(existingPerms.map((p) => p.name));

  const brandNewPerms = new Set<string>();
  for (const permName of allPermissions) {
    if (!existingPermNames.has(permName)) {
      brandNewPerms.add(permName);
      await prisma.permission.create({
        data: { name: permName, description: permName },
      });
    }
  }

  // 2. Sync roles
  for (const roleName of Object.keys(RolePermissionsMatrix)) {
    const matrixPermissions = RolePermissionsMatrix[roleName as keyof typeof RolePermissionsMatrix];
    // A role added to the matrix in code (e.g. Inventory Executive) has no
    // Role row yet; create it so it appears in the employee role picker and
    // gets its default permissions seeded below. Existing roles untouched.
    let role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      role = await prisma.role.create({ data: { name: roleName } });
      logger.info(`[authz] Created new role "${roleName}".`);
    }

    const existingRolePermsCount = await prisma.rolePermission.count({
      where: { role_id: role.id },
    });

    const isRoleEmpty = existingRolePermsCount === 0;

    for (const permName of matrixPermissions) {
      // Only grant if the role is completely empty OR the permission is brand new
      if (isRoleEmpty || brandNewPerms.has(permName)) {
        const permission = await prisma.permission.findUnique({ where: { name: permName } });
        if (!permission) continue;

        await prisma.rolePermission.upsert({
          where: { role_id_permission_id: { role_id: role.id, permission_id: permission.id } },
          update: {},
          create: { role_id: role.id, permission_id: permission.id },
        });
      }
    }
  }

  logger.info(`[authz] Role permissions synced. Added ${brandNewPerms.size} new permissions.`);

  await logPermissionDrift();
}

/**
 * Read-only report: where the permissions in code (RolePermissionsMatrix) and
 * the permissions the database really grants differ. The sync above never
 * grants an existing permission to a role that already has some, and never
 * removes one, so a change made only in code silently does nothing on a live
 * system -- this makes that visible in the server log at every start.
 */
async function logPermissionDrift(): Promise<void> {
  try {
    const rows = await prisma.rolePermission.findMany({
      select: { role: { select: { name: true } }, permission: { select: { name: true } } },
    });
    const inDb = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!inDb.has(r.role.name)) inDb.set(r.role.name, new Set());
      inDb.get(r.role.name)!.add(r.permission.name);
    }

    let driftedRoles = 0;
    for (const roleName of Object.keys(RolePermissionsMatrix)) {
      const code = new Set<string>(
        RolePermissionsMatrix[roleName as keyof typeof RolePermissionsMatrix] as readonly string[],
      );
      const db = inDb.get(roleName) ?? new Set<string>();
      const missingInDb = [...code].filter((x) => !db.has(x));
      const extraInDb = [...db].filter((x) => !code.has(x));
      if (missingInDb.length === 0 && extraInDb.length === 0) continue;
      driftedRoles++;
      const show = (list: string[]) =>
        list.length > 12
          ? `${list.slice(0, 12).join(', ')} (+${list.length - 12} more)`
          : list.join(', ');
      logger.warn(
        `[authz] Permission drift for "${roleName}": in code but not granted in DB: [${show(missingInDb)}]; granted in DB but not in code: [${show(extraInDb)}]`,
      );
    }
    logger.info(
      `[authz] Permission drift check: ${driftedRoles} role(s) differ from the code matrix.`,
    );
  } catch (err: any) {
    logger.error('[authz] Permission drift check failed:', err?.message);
  }
}
