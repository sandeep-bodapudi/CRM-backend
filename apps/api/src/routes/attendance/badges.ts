import { logger } from '../../utils/logger';
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../../middleware/auth';
import { Roles } from '../../shared';
import { getAccessibleCompanyIds } from '../../authz/dataScope';
import { buildBadgePayload } from '../../utils/qr';
import { generatePin } from '../../services/kioskBadge.service';

const router = Router();
const p = prisma;

const HR_ROLES = [Roles.MD, Roles.HR_MANAGER, Roles.ADMIN];

/** The employee, if the requester manages their company. */
async function loadManaged(req: AuthenticatedRequest, res: Response) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid employee ID' });
    return null;
  }
  const emp = await p.employee.findUnique({
    where: { id },
    select: {
      id: true,
      employee_code: true,
      full_name: true,
      company_id: true,
      status: true,
      static_badge_enabled: true,
      badge_version: true,
    },
  });
  if (
    !emp ||
    (!req.user!.roles.includes(Roles.ADMIN) &&
      !(await getAccessibleCompanyIds(req.user!)).includes(emp.company_id))
  ) {
    res.status(404).json({ error: 'Employee not found' });
    return null;
  }
  return emp;
}

const audit = (actorId: number, action: string, empId: number, extra: object = {}) =>
  p.auditEvent.create({
    data: {
      actor_id: actorId,
      action,
      entity_type: 'EMPLOYEE',
      entity_id: empId,
      new_value: JSON.stringify(extra),
    },
  });

// GET /api/v1/attendance/badge/:id - the printable badge of someone whose badge is on
// (the PIN is never shown again; re-issue to get a new one)
router.get(
  '/badge/:id',
  authenticateToken,
  requireRole(HR_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const emp = await loadManaged(req, res);
      if (!emp) return;
      res.set('Cache-Control', 'no-store');
      if (!emp.static_badge_enabled) {
        return res.status(200).json({ enabled: false });
      }
      return res.status(200).json({
        enabled: true,
        badge: buildBadgePayload(emp.id, emp.employee_code, emp.badge_version),
      });
    } catch (error) {
      logger.error('Badge fetch error:', error);
      return res.status(500).json({ error: 'Failed to load the badge' });
    }
  },
);

// POST /api/v1/attendance/badge/:id/enable - switch the printed badge on (or re-issue it):
// a new PIN, shown once, and a new badge that cancels any earlier one.
router.post(
  '/badge/:id/enable',
  authenticateToken,
  requireRole(HR_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const emp = await loadManaged(req, res);
      if (!emp) return;
      if (emp.status !== 'ACTIVE') {
        return res.status(409).json({ error: 'Only an active employee can have a badge.' });
      }
      const pin = generatePin();
      const reissue = emp.static_badge_enabled;
      const version = reissue ? emp.badge_version + 1 : emp.badge_version;
      await p.employee.update({
        where: { id: emp.id },
        data: {
          static_badge_enabled: true,
          badge_version: version,
          badge_pin_hash: await bcrypt.hash(pin, 10),
          badge_pin_failures: 0,
          badge_locked_until: null,
        },
      });
      await audit(req.user!.employeeId, reissue ? 'BADGE_REISSUED' : 'BADGE_ENABLED', emp.id, {
        badge_version: version,
      });
      res.set('Cache-Control', 'no-store');
      return res.status(200).json({
        message: reissue ? 'Badge re-issued. The old badge no longer works.' : 'Badge switched on.',
        pin, // shown to HR this once; only its hash is kept
        badge: buildBadgePayload(emp.id, emp.employee_code, version),
      });
    } catch (error) {
      logger.error('Badge enable error:', error);
      return res.status(500).json({ error: 'Failed to switch the badge on' });
    }
  },
);

// POST /api/v1/attendance/badge/:id/disable - the printed badge stops working
router.post(
  '/badge/:id/disable',
  authenticateToken,
  requireRole(HR_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const emp = await loadManaged(req, res);
      if (!emp) return;
      await p.employee.update({
        where: { id: emp.id },
        data: {
          static_badge_enabled: false,
          badge_version: emp.badge_version + 1,
          badge_pin_hash: null,
          badge_pin_failures: 0,
          badge_locked_until: null,
        },
      });
      await audit(req.user!.employeeId, 'BADGE_DISABLED', emp.id);
      return res.status(200).json({ message: 'Badge switched off.' });
    } catch (error) {
      logger.error('Badge disable error:', error);
      return res.status(500).json({ error: 'Failed to switch the badge off' });
    }
  },
);

export default router;
