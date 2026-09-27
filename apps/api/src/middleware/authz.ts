import { Response, NextFunction } from 'express';
import { can } from '../authz/authorization';
import { checkDbPermission } from '../authz/dbPermissions';
import { AuthenticatedRequest } from './auth';
import { Permission, Permissions } from '../shared';
import { prisma } from '../lib/prisma';

/**
 * Actions whose object-level policy is enforced here whenever the route
 * supplies the resource. Deliberately a short allowlist, not every action:
 * the READ/DM-polish/submit-verify policies in authorization.ts have drifted
 * from the data scopes the resource fetchers already apply (e.g.
 * ProjectPolicy.canRead only lets a PM read their assigned projects, while
 * buildProjectScope intentionally shows them every VERIFIED project), so
 * enforcing those here would 403 pages people legitimately use today. For
 * these mutations the policy is the documented rule and was being skipped.
 */
const RESOURCE_POLICY_ACTIONS = new Set<string>([
  Permissions.PROJECTS_UPDATE,
  Permissions.PROJECTS_DELETE,
  Permissions.PROPERTIES_UPDATE,
  Permissions.PROPERTIES_DELETE,
  Permissions.CUSTOMERS_KYC_WRITE,
]);

/**
 * Does this user hold `action` right now?
 * - Token (baked at login, already includes per-employee grant/deny
 *   overrides -- changing an override bumps token_version, forcing a fresh
 *   login) is the normal answer.
 * - A permission added to the user's ROLE in the DB after they logged in
 *   takes effect immediately -- unless this employee has an explicit deny
 *   override for it. That deny used to be ignored: the role grant
 *   short-circuited before the token was ever consulted.
 */
async function hasEffectivePermission(
  user: NonNullable<AuthenticatedRequest['user']>,
  action: string,
): Promise<boolean> {
  if ((user.permissions || []).includes(action)) return true;

  const dbGrant = await checkDbPermission(user, action);
  if (dbGrant !== true) return false;

  const override = await prisma.employeePermissionOverride.findFirst({
    where: { employee_id: user.employeeId, permission: { name: action } },
    select: { is_granted: true },
  });
  return override?.is_granted !== false;
}

/**
 * requireAuthz Middleware — v3
 * 1. Base permission (token, plus live DB role grants, minus employee denies).
 * 2. When the route loads the resource: 404 if it's out of scope, and for the
 *    mutation actions above, the object-level policy (e.g. a Project Manager
 *    may only edit projects assigned to them). Previously a DB role grant
 *    returned early here and skipped step 2 entirely -- and since every
 *    role's permissions are synced into the DB, that was nearly always.
 */
export const requireAuthz = (
  action: Permission,
  getResource?: (req: AuthenticatedRequest) => Promise<any>,
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthenticated', code: 'UNAUTHORIZED' });
      }

      let resource = undefined;
      if (getResource) {
        resource = await getResource(req);
        if (!resource) {
          return res.status(404).json({ error: 'Resource not found', code: 'NOT_FOUND' });
        }
      }

      if (!(await hasEffectivePermission(req.user, action))) {
        return res
          .status(403)
          .json({ error: `Forbidden: Missing required permission (${action})`, code: 'FORBIDDEN' });
      }

      if (resource && RESOURCE_POLICY_ACTIONS.has(action)) {
        // The policies re-check the base permission against user.permissions;
        // include `action` so a live DB role grant (step 1) isn't rejected
        // again just because it isn't in the token yet.
        const userWithAction = {
          ...req.user,
          permissions: Array.from(new Set([...(req.user.permissions || []), action])),
        };
        if (!can(userWithAction, action, resource)) {
          return res.status(403).json({
            error: 'Forbidden: You can only change records assigned to you',
            code: 'FORBIDDEN',
          });
        }
      }

      if (resource) {
        (req as any).authorizedResource = resource;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
