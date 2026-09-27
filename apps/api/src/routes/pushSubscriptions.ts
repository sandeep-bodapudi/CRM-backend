import { logger } from '../utils/logger';
/**
 * pushSubscriptions.ts
 *
 * Manages Web Push subscription registration per employee device.
 * Employees subscribe when they allow browser notifications.
 */

import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const p = prisma;

// GET /api/v1/push/vapid-public-key
// Returns the VAPID public key so the frontend can subscribe
router.get('/vapid-public-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY || '';
  if (!key) {
    return res.status(503).json({ error: 'Push notifications not configured on this server.' });
  }
  return res.status(200).json({ publicKey: key });
});

// POST /api/v1/push/subscribe
// Save a new push subscription for the logged-in employee
router.post('/subscribe', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { endpoint, keys } = req.body;
  const employeeId = req.user!.employeeId;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid push subscription payload.' });
  }

  try {
    // Upsert: if already subscribed with same endpoint, just update
    await p.pushSubscription.upsert({
      where: {
        employee_id_endpoint: {
          employee_id: employeeId,
          // Full endpoint, same value `create` stores below. The unique index
          // only covers the first 200 chars, but Prisma compares this field
          // against the whole column -- passing a truncated value here never
          // matched any endpoint longer than 200 chars, so every re-subscribe
          // fell through to `create` and hit the unique index (500).
          endpoint,
        },
      },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: req.headers['user-agent'] || null,
      },
      create: {
        employee_id: employeeId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: req.headers['user-agent'] || null,
      },
    });

    return res.status(200).json({ message: 'Push subscription saved.' });
  } catch (error) {
    logger.error('[PushSubscribe] Error:', error);
    return res.status(500).json({ error: 'Failed to save push subscription.' });
  }
});

// DELETE /api/v1/push/unsubscribe
// Remove all push subscriptions for this employee (on logout)
router.delete(
  '/unsubscribe',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = req.user!.employeeId;
    const { endpoint } = req.body;

    try {
      if (endpoint) {
        // Remove specific device subscription
        await p.pushSubscription.deleteMany({
          where: { employee_id: employeeId, endpoint },
        });
      } else {
        // Remove all subscriptions for this employee
        await p.pushSubscription.deleteMany({
          where: { employee_id: employeeId },
        });
      }
      return res.status(200).json({ message: 'Push subscription removed.' });
    } catch (error) {
      logger.error('[PushUnsubscribe] Error:', error);
      return res.status(500).json({ error: 'Failed to remove push subscription.' });
    }
  },
);

export default router;
