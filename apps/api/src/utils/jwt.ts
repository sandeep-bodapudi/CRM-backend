import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be provided.');
}

export interface TokenPayload {
  employeeId: number;
  employeeCode: string;
  companyId: number;
  branchId: number | null;
  roles: string[];
  permissions: string[];
  permsVersion?: number;
  tokenVersion?: number;
  /** Kiosk-only fields — only present when type === 'KIOSK' */
  type?: 'KIOSK' | 'EMPLOYEE';
  kioskCredentialId?: number;
  credentialVersion?: number;
  createdAt?: number;
}

import { PERMISSIONS_VERSION } from '../shared/auth';

// § Phase 6: a staff session is now meant to persist until the employee
// explicitly logs out (or gets revoked via token_version) — like Instagram,
// not a 30-minute-idle web app. A KIOSK token has no refresh flow at all
// today (see kiosk-auth.ts), so it needs its own long expiresIn passed
// explicitly rather than relying on the default.
export const generateAccessToken = (payload: TokenPayload, expiresIn: string = '24h'): string => {
  const finalPayload = {
    ...payload,
    tokenVersion: payload.tokenVersion ?? 1,
    permsVersion: PERMISSIONS_VERSION,
  };
  return jwt.sign(finalPayload, JWT_ACCESS_SECRET, { expiresIn } as jwt.SignOptions);
};

// 30 days, renewed on every use: someone who opens the app at least once a
// month stays signed in; a phone or browser left unused for 30 days is
// signed out. Was 400 days, so every old device stayed signed in for over a
// year (audit 2026-11-01: 97 live sign-ins for 14 staff, up to 27 each) and
// a stolen refresh key worked just as long. Revocation stays instant and
// independent of this via token_version (middleware/auth.ts).
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
    jwtid: crypto.randomUUID(),
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_ACCESS_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
};
