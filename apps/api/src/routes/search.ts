import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { hasEffectivePermission } from '../middleware/authz';
import { buildLeadScope, buildProjectScope } from '../authz/dataScope';
import { Permissions, DO_NOT_CALL_EXIT_REASONS, LEAD_EXIT_REASON_LABELS } from '../shared';
import { findLeadIdByPhone } from '../services/lead/duplicates';

const router = Router();

const MIN_QUERY_LENGTH = 3;

/**
 * Global search. Each kind of result is returned only to someone who may
 * open that kind of record, and leads/projects go through the same data
 * scope as their own list pages. This used to return every lead's name,
 * phone and email in the company (and every booking and customer name) to
 * any logged-in employee, whatever their role.
 */
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const q = String(req.query.q ?? '')
      .trim()
      .slice(0, 100);
    if (q.length < MIN_QUERY_LENGTH) {
      return res.status(200).json({ leads: [], bookings: [], projects: [] });
    }

    const [canLeads, canBookings, canProjects] = await Promise.all([
      hasEffectivePermission(user, Permissions.LEADS_READ),
      hasEffectivePermission(user, Permissions.BOOKINGS_READ),
      hasEffectivePermission(user, Permissions.PROJECTS_READ),
    ]);

    const [leads, bookings, projects] = await Promise.all([
      canLeads
        ? (async () => {
            const scope = await buildLeadScope(user);
            return prisma.lead.findMany({
              // AND, not a merged object: a non-management scope already uses `OR`.
              where: {
                AND: [
                  scope,
                  {
                    OR: [
                      { customer_name: { contains: q } },
                      { phone: { contains: q } },
                      { email: { contains: q } },
                      { lead_code: { contains: q } },
                    ],
                  },
                ],
              },
              take: 5,
              select: {
                id: true,
                customer_name: true,
                phone: true,
                status: true,
                exit_reason: true,
              },
            });
          })()
        : [],
      canBookings
        ? prisma.booking.findMany({
            // Same visibility as the bookings list: the whole company.
            where: { company_id: user.companyId, booking_code: { contains: q } },
            take: 5,
            select: {
              id: true,
              booking_code: true,
              status: true,
              customer: { select: { first_name: true, last_name: true } },
            },
          })
        : [],
      canProjects
        ? (async () => {
            const scope = await buildProjectScope(user);
            return prisma.project.findMany({
              where: { AND: [scope, { name: { contains: q } }] },
              take: 5,
              select: { id: true, name: true, status: true },
            });
          })()
        : [],
    ]);

    // A phone number marked "do not call" anywhere in the company (asked not to be
    // called, or a salesperson from another company). Said even when the lead is
    // not the searcher's, so nobody calls it; nothing else about it is shown.
    let doNotCall: { reason: string; label: string } | null = null;
    if (q.replace(/\D/g, '').length >= 7) {
      const hitId = await findLeadIdByPhone(user.companyId, q);
      if (hitId) {
        const hit = await prisma.lead.findUnique({
          where: { id: hitId },
          select: { exit_reason: true },
        });
        if (hit?.exit_reason && (DO_NOT_CALL_EXIT_REASONS as string[]).includes(hit.exit_reason)) {
          doNotCall = {
            reason: hit.exit_reason,
            label:
              (LEAD_EXIT_REASON_LABELS as Record<string, string>)[hit.exit_reason] ||
              hit.exit_reason,
          };
        }
      }
    }

    return res.status(200).json({ leads, bookings, projects, do_not_call: doNotCall });
  } catch (error) {
    return res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
