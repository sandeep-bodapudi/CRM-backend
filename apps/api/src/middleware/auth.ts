import { logger } from '../utils/logger';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { prisma } from '../lib/prisma';
import { PERMISSIONS_VERSION } from '../shared/auth';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export interface KioskAuthenticatedRequest extends Request {
  kiosk?: {
    companyId: number;
    branchId: number;
    kioskCredentialId: number;
    credentialVersion: number;
    label: string;
    branchName: string;
  };
}

export interface ServiceRequest extends Request {
  service?: { service: string };
}

const timingSafeEqual = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

/**
 * Service-to-service authentication for Portal callbacks.
 * Validates a Service Bearer Secret against PORTAL_CRM_SECRET (constant-time comparison).
 * Does NOT require a user JWT — service tokens do not carry user identity.
 */
export const authenticateServiceToken = (
  req: ServiceRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Service token required',
      code: 'UNAUTHORIZED',
    });
  }

  const expected = process.env.PORTAL_CRM_SECRET;
  if (!expected) {
    return res.status(500).json({
      error: 'Service secret not configured',
      code: 'SERVER_ERROR',
    });
  }

  if (!timingSafeEqual(token, expected)) {
    return res.status(401).json({
      error: 'Invalid service token',
      code: 'UNAUTHORIZED',
    });
  }

  req.service = { service: 'portal' };
  next();
};

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Access token required',
      code: 'UNAUTHORIZED',
    });
  }

  try {
    const payload = verifyAccessToken(token);

    if (payload.tokenVersion === undefined) {
      logger.error('AUTH_FAIL: Token version missing (legacy token)');
      return res.status(401).json({
        error: 'Token version missing (legacy token)',
        code: 'TOKEN_EXPIRED',
      });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: payload.employeeId },
      select: { status: true, token_version: true },
    });

    if (!employee) {
      logger.error('AUTH_FAIL: User not found in DB');
      return res.status(401).json({ error: 'User not found', code: 'UNAUTHORIZED' });
    }

    if (employee.status !== 'ACTIVE') {
      logger.error('AUTH_FAIL: User status is not ACTIVE');
      return res.status(401).json({ error: 'User is inactive or suspended', code: 'UNAUTHORIZED' });
    }

    if (payload.permsVersion !== PERMISSIONS_VERSION) {
      logger.error('AUTH_FAIL: Permissions version stale');
      return res
        .status(401)
        .json({ error: 'Permissions updated. Please log in again.', code: 'TOKEN_EXPIRED' });
    }

    if (payload.tokenVersion !== employee.token_version) {
      logger.error('AUTH_FAIL: Token version stale');
      return res.status(401).json({ error: 'Token version stale', code: 'TOKEN_EXPIRED' });
    }

    req.user = payload;
    next();
  } catch (err: any) {
    // A database outage is not an expired token. Reporting it as
    // TOKEN_EXPIRED (as on 2026-09-28, "Can't reach database server") makes
    // every open app burn a refresh-token rotation and can push users to the
    // login screen; tell the client to retry instead.
    if (typeof err?.name === 'string' && err.name.startsWith('PrismaClient')) {
      logger.error('AUTH_DB_UNAVAILABLE:', err.message);
      return res.status(503).json({
        error: 'Service temporarily unavailable, please retry.',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
    logger.error('JWT VERIFICATION ERROR:', err.name, err.message, err);
    // If token expired, return clear code so frontend automatically throws user to login page
    return res.status(401).json({
      error: 'Token expired or invalid',
      code: 'TOKEN_EXPIRED',
    });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated', code: 'UNAUTHORIZED' });
    }

    const hasRole = (req.user.roles || []).some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return res
        .status(403)
        .json({ error: 'Forbidden: Insufficient privileges', code: 'FORBIDDEN' });
    }

    next();
  };
};

export const requirePermission = (requiredPermissions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated', code: 'UNAUTHORIZED' });
    }

    if (!req.user.permissions || !Array.isArray(req.user.permissions)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const userPermissions = req.user.permissions;
    const hasPermission = requiredPermissions.some((perm) => userPermissions.includes(perm));
    if (!hasPermission) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    next();
  };
};

/**
 * authenticateKioskToken — accepts ONLY type:'KIOSK' tokens.
 * Verifies credential_version matches the current DB value so rotations
 * kill active sessions immediately.
 * Attaches kiosk info to req.kiosk.
 */
export const authenticateKioskToken = async (
  req: KioskAuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Kiosk token required',
      code: 'UNAUTHORIZED',
    });
  }

  try {
    const payload = verifyAccessToken(token);

    if (payload.type !== 'KIOSK') {
      return res.status(401).json({
        error: 'Token is not a kiosk token',
        code: 'UNAUTHORIZED',
      });
    }

    if (payload.kioskCredentialId === undefined) {
      return res.status(401).json({
        error: 'Kiosk token missing credential ID',
        code: 'UNAUTHORIZED',
      });
    }

    const kioskCred = await prisma.kioskCredential.findUnique({
      where: { id: payload.kioskCredentialId },
      include: { branch: true },
    });

    if (!kioskCred) {
      return res.status(401).json({ error: 'Kiosk credential not found', code: 'UNAUTHORIZED' });
    }

    if (!kioskCred.is_active) {
      return res
        .status(401)
        .json({ error: 'Kiosk credential is deactivated', code: 'UNAUTHORIZED' });
    }

    if (payload.credentialVersion !== kioskCred.credential_version) {
      return res
        .status(401)
        .json({ error: 'Kiosk token version stale — please log in again', code: 'TOKEN_EXPIRED' });
    }

    req.kiosk = {
      companyId: kioskCred.company_id,
      branchId: kioskCred.branch_id,
      kioskCredentialId: kioskCred.id,
      credentialVersion: kioskCred.credential_version,
      label: kioskCred.label,
      branchName: kioskCred.branch.name,
    };
    next();
  } catch (err: any) {
    logger.error('KIOSK JWT VERIFICATION ERROR:', err);
    return res.status(401).json({
      error: 'Kiosk token expired or invalid',
      code: 'TOKEN_EXPIRED',
    });
  }
};
