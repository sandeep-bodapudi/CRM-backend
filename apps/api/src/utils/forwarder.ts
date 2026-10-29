import crypto from 'crypto';
import http from 'http';
import https from 'https';
import type { Request, Response } from 'express';

// "Forward everything" mode (2026-10-29). Hostinger's firewall blocked this
// server's address from reaching the database, so production moved to a new
// server. The public websites still call this old address, so with
// FORWARD_ALL_TO set this server passes every request on to the new one
// untouched, adding the visitor's real address (signed, so only our own
// forwarder can set it -- see trustedForwardedIp).

const HEADER_IP = 'x-rrh-client-ip';
const HEADER_SIG = 'x-rrh-forward-sig';

/** Signature over the visitor address, keyed by the login secret both servers share. */
const sign = (ip: string) => {
  const key = process.env.JWT_ACCESS_SECRET || '';
  return key ? crypto.createHmac('sha256', key).update(`rrh-forward:${ip}`).digest('hex') : '';
};

/** The visitor address passed on by our forwarder, when its signature checks out. */
export function trustedForwardedIp(req: any): string | null {
  const ip = req.headers?.[HEADER_IP];
  const sig = req.headers?.[HEADER_SIG];
  if (typeof ip !== 'string' || typeof sig !== 'string' || !ip) return null;
  const expected = sign(ip);
  if (!expected || expected.length !== sig.length) return null;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig)) ? ip : null;
}

const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection'];

export function forwardAll(target: string, clientIp: (req: any) => string) {
  const base = new URL(target);
  const client = base.protocol === 'https:' ? https : http;
  return (req: Request, res: Response) => {
    const headers: Record<string, any> = { ...req.headers };
    for (const h of [...HOP_BY_HOP, 'host', HEADER_IP, HEADER_SIG]) delete headers[h];
    const ip = clientIp(req);
    headers.host = base.host;
    headers[HEADER_IP] = ip;
    headers[HEADER_SIG] = sign(ip);

    const upstream = client.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port || undefined,
        method: req.method,
        path: req.originalUrl,
        headers,
        // The new server may be waking up (about a minute on Render's free plan).
        timeout: 120_000,
      },
      (up) => {
        const out: Record<string, any> = { ...up.headers };
        for (const h of HOP_BY_HOP) delete out[h];
        res.writeHead(up.statusCode || 502, out);
        up.pipe(res);
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Server is busy, please try again in a minute.' });
      } else {
        res.end();
      }
    });
    req.pipe(upstream);
  };
}
