import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

// "Who changed what" for routes that kept no audit record (audit 2026-11-01):
// projects, units, pricing rules, properties, holidays, offers, banner,
// message templates, PM routing, customers and amenities. Mounted in front of
// a router; once a change succeeds (2xx) it records who did it, the route,
// the record and the values sent. For prices and units the record as it was
// before the change is saved too.

// Field names whose values are never copied into the audit log.
const SECRET_KEYS =
  /password|token|secret|otp|ifsc|account_number|aadhaar|(^|_)(pan|pin)(_|$)|^(pan|pin)[A-Z]/i;
const MAX = 4000;

const clean = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.slice(0, 50).map(clean);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? '[hidden]' : clean(v);
    }
    return out;
  }
  return value;
};
const text = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const s = JSON.stringify(clean(value));
  return s.length > MAX ? `${s.slice(0, MAX)}...` : s;
};

/** Reads the record before it changes, for the routes where "before" matters. */
type Snapshot = (req: Request) => Promise<unknown>;

const idOf = (req: Request, body: any): number => {
  const fromParams = Object.values(req.params || {})
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (fromParams.length) return fromParams[fromParams.length - 1];
  const fromBody = [body?.id, body?.data?.id, ...Object.values(body || {}).map((v: any) => v?.id)]
    .map(Number)
    .find((n) => Number.isInteger(n) && n > 0);
  return fromBody || 0;
};

export const auditWrites =
  (entityType: string, snapshot?: Snapshot) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    // Previews only calculate, they change nothing.
    if (/preview/i.test(req.path)) return next();

    let before: unknown;
    let responseBody: any;
    const url = req.originalUrl.split('?')[0];
    const json = res.json.bind(res);
    res.json = (body: any) => {
      responseBody = body;
      return json(body);
    };

    res.on('finish', () => {
      const user = (req as any).user;
      if (!user?.employeeId || res.statusCode >= 400) return;
      prisma.auditEvent
        .create({
          data: {
            actor_id: user.employeeId,
            // e.g. "PUT /api/v1/projects/:id/pricing-rules/:id" -- ids are in entity_id.
            action: `${req.method} ${url.replace(/\/\d+(?=\/|$)/g, '/:id')}`.slice(0, 191),
            entity_type: entityType,
            entity_id: idOf(req, responseBody),
            old_value: text(before),
            new_value: text(req.method === 'DELETE' ? { deleted: true } : req.body),
          },
        })
        .catch((err) => logger.error({ err }, '[audit] could not record change'));
    });

    // Changes and deletes, plus the POSTs that change a price or status.
    const changesExisting = req.method !== 'POST' || /override-price|\/status$/.test(req.path);
    if (snapshot && changesExisting) {
      try {
        before = await snapshot(req);
      } catch {
        before = undefined; // a missing snapshot must never block the change
      }
    }
    next();
  };

// Before-values for the routes where they matter most.
const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
const seg = (path: string, name: string) => {
  const m = new RegExp(`/${name}/(\\d+)`).exec(path);
  return m ? Number(m[1]) : null;
};

export const projectSnapshot: Snapshot = async (req) => {
  const p = req.path;
  const ruleId = seg(p, 'pricing-rules');
  if (ruleId) return prisma.projectPricingRule.findUnique({ where: { id: ruleId } });
  const unitId = seg(p, 'units');
  if (unitId) return prisma.projectUnit.findUnique({ where: { id: unitId } });
  const projectId = num(p.split('/')[1]);
  if (projectId && p.split('/').length === 2)
    return prisma.project.findUnique({ where: { id: projectId } });
  return undefined;
};

export const propertySnapshot: Snapshot = async (req) => {
  const p = req.path;
  const ruleId = seg(p, 'pricing-rules');
  if (ruleId) return prisma.propertyPricingRule.findUnique({ where: { id: ruleId } });
  const propertyId = num(p.split('/')[1]);
  if (propertyId && (p.split('/').length === 2 || /override-price$/.test(p))) {
    return prisma.property.findUnique({ where: { id: propertyId } });
  }
  return undefined;
};
