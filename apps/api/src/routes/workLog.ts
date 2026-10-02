import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { validateRequestBody } from '../middleware/validate';
import { getISTComponents, getISTMidnightInstant } from '../utils/time';

// Work log: what someone did outside the CRM -- an Instagram post, a reel,
// an ad campaign, a client meeting, a site trip. The digital team's real
// output never touched the CRM, so Team Today showed them as idle. Entries
// are stored as AuditEvent rows (action WORK_LOG) -- append-only, no schema
// change -- and shown on Team Today next to the CRM's own records.
const router = Router();
const p = prisma;

export const WORK_LOG_ACTION = 'WORK_LOG';
export const WORK_LOG_KINDS = [
  'INSTAGRAM_POST',
  'INSTAGRAM_REEL',
  'INSTAGRAM_STORY',
  'FACEBOOK_POST',
  'YOUTUBE_VIDEO',
  'AD_CAMPAIGN',
  'WHATSAPP_BROADCAST',
  'CONTENT_DESIGN',
  'CLIENT_MEETING',
  'SITE_VISIT',
  'PROPERTY_INSPECTION',
  'PARTNER_MEETING',
  'OTHER',
] as const;

const WorkLogSchema = z
  .object({
    kind: z.enum(WORK_LOG_KINDS),
    note: z.string().trim().min(3, 'Add a short note').max(500),
    link: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Link must start with http(s)://')
      .optional(),
    count: z.number().int().min(1).max(100).optional(),
    // Free-text name of the activity when none of the listed kinds fits.
    title: z.string().trim().max(80).optional(),
  })
  .refine((v) => v.kind !== 'OTHER' || (v.title && v.title.length >= 3), {
    message: 'Say what you did (at least 3 characters)',
    path: ['title'],
  });

export type WorkLogEntry = {
  id: number;
  kind: string;
  note: string;
  link: string | null;
  count: number;
  title: string | null;
  at: Date;
};

export const parseWorkLog = (row: {
  id: number;
  new_value: string | null;
  created_at: Date;
}): WorkLogEntry | null => {
  try {
    const v = JSON.parse(row.new_value || '{}');
    return {
      id: row.id,
      kind: String(v.kind || 'OTHER'),
      note: String(v.note || ''),
      link: v.link ? String(v.link) : null,
      count: Number(v.count) || 1,
      title: v.title ? String(v.title) : null,
      at: row.created_at,
    };
  } catch {
    return null;
  }
};

const dayRange = (raw: unknown) => {
  const req = typeof raw === 'string' ? raw.slice(0, 10) : '';
  const dateString = /^\d{4}-\d{2}-\d{2}$/.test(req)
    ? req
    : getISTComponents(new Date()).dateString;
  const start = getISTMidnightInstant(dateString);
  return { dateString, range: { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) } };
};

// POST /api/v1/work-log
router.post(
  '/',
  authenticateToken,
  validateRequestBody(WorkLogSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { kind, note, link, count, title } = req.body as z.infer<typeof WorkLogSchema>;
      const row = await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: WORK_LOG_ACTION,
          entity_type: 'WORK_LOG',
          entity_id: req.user!.employeeId,
          new_value: JSON.stringify({
            kind,
            note,
            link: link || null,
            count: count || 1,
            title: kind === 'OTHER' ? title : null,
          }),
        },
      });
      return res.status(201).json({ entry: parseWorkLog(row) });
    } catch (error) {
      logger.error('Work log create error:', error);
      return res.status(500).json({ error: 'Failed to save work log' });
    }
  },
);

// GET /api/v1/work-log/my?date=YYYY-MM-DD
router.get('/my', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { dateString, range } = dayRange(req.query.date);
    const rows = await p.auditEvent.findMany({
      where: { actor_id: req.user!.employeeId, action: WORK_LOG_ACTION, created_at: range },
      select: { id: true, new_value: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json({
      date: dateString,
      entries: rows.map(parseWorkLog).filter(Boolean),
    });
  } catch (error) {
    logger.error('Work log list error:', error);
    return res.status(500).json({ error: 'Failed to load work log' });
  }
});

export default router;
