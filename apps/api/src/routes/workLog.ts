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
// Channel Partner Manager work with associates (external agents). The
// associates themselves live in a separate portal for now; entries keep the
// portal's associate ID so they link up when the two are combined.
export const ASSOCIATE_KINDS = [
  'ASSOCIATE_CALL',
  'ASSOCIATE_NEW_CALL',
  'ASSOCIATE_OFFICE_VISIT',
  'ASSOCIATE_ENROLLMENT',
  'ASSOCIATE_SITE_VISIT',
  'ASSOCIATE_PROSPECT',
  'ASSOCIATE_BOOKING',
] as const;

export const WORK_LOG_KINDS = [
  ...ASSOCIATE_KINDS,
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
    associate_name: z.string().trim().max(120).optional(),
    associate_id: z.string().trim().max(60).optional(),
  })
  .refine((v) => v.kind !== 'OTHER' || (v.title && v.title.length >= 3), {
    message: 'Say what you did (at least 3 characters)',
    path: ['title'],
  })
  // Every associate activity except cold-calling a new agent names the
  // associate it was with.
  .refine(
    (v) =>
      !v.kind.startsWith('ASSOCIATE_') ||
      v.kind === 'ASSOCIATE_NEW_CALL' ||
      (!!v.associate_name && v.associate_name.length >= 2),
    { message: 'Enter the associate name', path: ['associate_name'] },
  );

export type WorkLogEntry = {
  id: number;
  kind: string;
  note: string;
  link: string | null;
  count: number;
  title: string | null;
  associate_name: string | null;
  associate_id: string | null;
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
      associate_name: v.associate_name ? String(v.associate_name) : null,
      associate_id: v.associate_id ? String(v.associate_id) : null,
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
      const { kind, note, link, count, title, associate_name, associate_id } = req.body as z.infer<
        typeof WorkLogSchema
      >;
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
            associate_name: kind.startsWith('ASSOCIATE_') ? associate_name || null : null,
            associate_id: kind.startsWith('ASSOCIATE_') ? associate_id || null : null,
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

/** Sum of `count` per kind. */
export const countByKind = (entries: WorkLogEntry[]) => {
  const out: Record<string, number> = {};
  for (const e of entries) out[e.kind] = (out[e.kind] || 0) + (e.count || 1);
  return out;
};

type AssociateRef = {
  associate_id: string | null;
  name: string;
  phone: string | null;
  company: string | null;
  last_contact: Date;
};

/**
 * Associates this employee has worked with -- from their work log and from
 * leads they entered (external_agent_*), most recent first. Interim until
 * the associates portal is connected.
 */
const associatesFor = async (employeeId: number): Promise<AssociateRef[]> => {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const [logRows, leads] = await Promise.all([
    p.auditEvent.findMany({
      where: { actor_id: employeeId, action: WORK_LOG_ACTION, created_at: { gte: since } },
      select: { id: true, new_value: true, created_at: true },
      orderBy: { created_at: 'desc' },
    }),
    p.lead.findMany({
      where: { created_by_id: employeeId, external_agent_name: { not: null } },
      select: {
        external_agent_name: true,
        external_agent_phone: true,
        external_agent_associate_id: true,
        external_agent_company: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    }),
  ]);
  const map = new Map<string, AssociateRef>();
  const add = (ref: AssociateRef) => {
    const key = (ref.associate_id || ref.name).trim().toLowerCase();
    const prev = map.get(key);
    if (!prev) {
      map.set(key, ref);
      return;
    }
    if (ref.last_contact > prev.last_contact) prev.last_contact = ref.last_contact;
    prev.phone = prev.phone ?? ref.phone;
    prev.company = prev.company ?? ref.company;
    prev.associate_id = prev.associate_id ?? ref.associate_id;
  };
  for (const row of logRows) {
    const e = parseWorkLog(row);
    if (e?.associate_name) {
      add({
        associate_id: e.associate_id,
        name: e.associate_name,
        phone: null,
        company: null,
        last_contact: e.at,
      });
    }
  }
  for (const l of leads) {
    add({
      associate_id: l.external_agent_associate_id,
      name: l.external_agent_name as string,
      phone: l.external_agent_phone,
      company: l.external_agent_company,
      last_contact: l.created_at,
    });
  }
  return [...map.values()].sort((a, b) => b.last_contact.getTime() - a.last_contact.getTime());
};

// GET /api/v1/work-log/associates -- suggestions for associate fields
router.get('/associates', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    return res.status(200).json({ associates: await associatesFor(req.user!.employeeId) });
  } catch (error) {
    logger.error('Associates list error:', error);
    return res.status(500).json({ error: 'Failed to load associates' });
  }
});

// GET /api/v1/work-log/cpm-summary -- Channel Partner Manager dashboard
router.get('/cpm-summary', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeId = req.user!.employeeId;
    const { dateString, range } = dayRange(undefined);
    const monthStart = getISTMidnightInstant(`${dateString.slice(0, 8)}01`);
    const [monthRows, associates, leadsThisMonth, visitsThisMonth] = await Promise.all([
      p.auditEvent.findMany({
        where: { actor_id: employeeId, action: WORK_LOG_ACTION, created_at: { gte: monthStart } },
        select: { id: true, new_value: true, created_at: true },
      }),
      associatesFor(employeeId),
      p.lead.count({
        where: {
          created_by_id: employeeId,
          external_agent_name: { not: null },
          created_at: { gte: monthStart },
        },
      }),
      p.siteVisitBooking.count({
        where: {
          lead: { created_by_id: employeeId, external_agent_name: { not: null } },
          created_at: { gte: monthStart },
          status: { not: 'CANCELLED' },
        },
      }),
    ]);
    const entries = monthRows.map(parseWorkLog).filter((e): e is WorkLogEntry => !!e);
    const today = entries.filter((e) => e.at >= range.gte && e.at < range.lt);
    const staleCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return res.status(200).json({
      date: dateString,
      today: countByKind(today),
      month: countByKind(entries),
      leads_from_associates_month: leadsThisMonth,
      visits_from_associates_month: visitsThisMonth,
      associates_total: associates.length,
      not_contacted_7_days: associates
        .filter((a) => a.last_contact.getTime() < staleCutoff)
        .slice(0, 20),
      recent_associates: associates.slice(0, 10),
    });
  } catch (error) {
    logger.error('CPM summary error:', error);
    return res.status(500).json({ error: 'Failed to load summary' });
  }
});

// DELETE /api/v1/work-log/:id -- remove one of your own entries, same IST
// day only (to fix a mistake; past days stay as recorded).
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const { range } = dayRange(undefined);
    const removed = await p.auditEvent.deleteMany({
      where: {
        id,
        actor_id: req.user!.employeeId,
        action: WORK_LOG_ACTION,
        created_at: range,
      },
    });
    if (removed.count === 0) {
      return res
        .status(404)
        .json({ error: "Entry not found (only today's own entries can be removed)." });
    }
    return res.status(200).json({ removed: true });
  } catch (error) {
    logger.error('Work log delete error:', error);
    return res.status(500).json({ error: 'Failed to remove entry' });
  }
});

export default router;
