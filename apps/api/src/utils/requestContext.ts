import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';

// The request a piece of code is running for, without passing `req` down
// through every service. Used to stamp audit records with the company, IP
// address and device (lib/prisma.ts) -- background jobs have no request and
// leave those empty.
interface RequestContext {
  req: Request;
  ip: string;
  userAgent: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext = (req: Request, _res: Response, next: NextFunction) => {
  // Loaded here, not at the top: rateLimiter imports lib/prisma, which
  // imports this file.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { clientIp } = require('../middleware/rateLimiter');
  storage.run(
    {
      req,
      ip: clientIp(req).slice(0, 64),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
    },
    next,
  );
};

/** Company, IP and device of the current request, if there is one. */
export const auditContext = () => {
  const ctx = storage.getStore();
  if (!ctx) return null;
  const user = (ctx.req as any).user;
  return {
    company_id: typeof user?.companyId === 'number' ? user.companyId : null,
    ip: ctx.ip || null,
    user_agent: ctx.userAgent || null,
  };
};
