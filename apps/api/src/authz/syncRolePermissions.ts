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
}
