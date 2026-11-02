import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { generateAccessToken, generateRefreshToken, REFRESH_TOKEN_TTL_MS } from '../utils/jwt';
import { authenticateToken, AuthenticatedRequest, needsTwoStep } from '../middleware/auth';
import { newTotpSecret, totpUri, verifyTotp } from '../utils/totp';
import { LoginSchema, ChangePasswordSchema, Roles } from '../shared';
import { validateRequestBody } from '../middleware/validate';
import {
  clientIp,
  loginRateLimiter,
  loginRateLimitKey,
  refreshRateLimiter,
} from '../middleware/rateLimiter';
import { publicAssetUrl } from '../utils/media';
import { decryptData, encryptData } from '../utils/crypto';
import { lastWorkingDayPassed } from '../utils/time';
import { getEffectivePermissionNames, getRoleNames } from '../utils/effectivePermissions';

const router = Router();

const p = prisma;

const mapEmployeeToUser = (employee: any, roleNames: string[], permissions: string[]) => ({
  id: employee.id,
  employeeCode: employee.employee_code,
  fullName: employee.full_name,
  department: employee.department,
  company: employee.company?.name || 'RS CRM',
  branch: employee.branch?.name || 'All Branches',
  roles: roleNames,
  permissions,
  attendanceRequired: employee.attendance_required,
  reportRequired: employee.report_required !== false,
  firstLoginDone: employee.first_login_done,
  phone: employee.phone,
  secondaryPhone: employee.secondary_phone,
  whatsappNumber: employee.whatsapp_number,
  email: employee.email,
  bloodGroup: employee.blood_group,
  socialLinks: employee.social_links,
  currentAddress: employee.current_address,
  permanentAddress: employee.permanent_address,
  emergencyContactName: employee.emergency_contact_name,
  emergencyContactRelation: employee.emergency_contact_relation,
  emergencyContactPhone: employee.emergency_contact_phone,
  profileImageUrl: publicAssetUrl(employee.profile_image_url),
  panNumber: decryptData(employee.pan_number),
  aadhaarNumber: decryptData(employee.aadhaar_number),
  bankName: decryptData(employee.bank_name),
  bankAccountNumber: decryptData(employee.bank_account_number),
  bankIfsc: decryptData(employee.bank_ifsc),
  bankBranch: decryptData(employee.bank_branch),
});

// Account lockout. The per-IP limit alone allowed ~7,200 guesses a day per
// address (and unlimited across addresses). After LOCK_AFTER wrong passwords
// within LOCK_WINDOW_MS the account refuses every attempt -- right or wrong --
// until the window has passed.
const LOCK_AFTER = 10;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const recentFailedLogins = (employeeId: number) =>
  p.auditEvent.count({
    where: {
      action: 'SECURITY_ALERT',
      entity_type: 'AUTH_FAILED',
      entity_id: employeeId,
      created_at: { gte: new Date(Date.now() - LOCK_WINDOW_MS) },
    },
  });

// POST /api/v1/auth/login
router.post(
  '/login',
  loginRateLimiter,
  validateRequestBody(LoginSchema),
  async (req, res: Response) => {
    try {
      const { employee_code, password } = req.body;

      // Find active employee by employee_code
      const employee = await p.employee.findUnique({
        where: { employee_code },
        include: {
          company: true,
          branch: true,
          roles: {
            include: {
              role: {
                include: { permissions: { include: { permission: true } } },
              },
            },
          },
          permission_overrides: { include: { permission: true } },
        },
      });

      const ip = clientIp(req);
      if (
        !employee ||
        employee.status !== 'ACTIVE' ||
        lastWorkingDayPassed(employee.last_working_day)
      ) {
        await p.auditEvent.create({
          data: {
            actor_id: 0,
            action: 'SECURITY_ALERT',
            entity_type: 'AUTH_FAILED',
            entity_id: employee?.id ?? 0,
            // The code that was tried and from where, so repeated guessing is visible.
            new_value: `Login with ${employee ? 'inactive' : 'unknown'} code "${String(employee_code).slice(0, 40)}" from ${ip}`,
          },
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if ((await recentFailedLogins(employee.id)) >= LOCK_AFTER) {
        return res.status(429).json({
          error:
            'This account is locked for 15 minutes after too many wrong passwords. Try again later, or ask Admin to reset your password.',
          code: 'ACCOUNT_LOCKED',
        });
      }

      const isMatch = await bcrypt.compare(password, employee.password_hash);
      if (!isMatch) {
        await p.auditEvent.create({
          data: {
            actor_id: employee.id,
            action: 'SECURITY_ALERT',
            entity_type: 'AUTH_FAILED',
            entity_id: employee.id,
            new_value: `Invalid password attempt from ${ip}`,
          },
        });
        if ((await recentFailedLogins(employee.id)) === LOCK_AFTER) {
          await p.auditEvent.create({
            data: {
              actor_id: employee.id,
              action: 'SECURITY_ALERT',
              entity_type: 'ACCOUNT_LOCKED',
              entity_id: employee.id,
              new_value: `Locked for 15 minutes after ${LOCK_AFTER} wrong passwords (last from ${ip})`,
            },
          });
        }
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // 2-step login: right password, now the authenticator-app code. A wrong
      // code counts toward the same lockout as a wrong password.
      if (employee.totp_enabled_at && employee.totp_secret) {
        if (!req.body.otp) {
          return res.status(401).json({
            error: 'Enter the 6-digit code from your authenticator app.',
            code: 'OTP_REQUIRED',
          });
        }
        const step = verifyTotp(decryptData(employee.totp_secret) || '', req.body.otp);
        if (step === null || (employee.totp_last_step ?? -1) >= step) {
          await p.auditEvent.create({
            data: {
              actor_id: employee.id,
              action: 'SECURITY_ALERT',
              entity_type: 'AUTH_FAILED',
              entity_id: employee.id,
              new_value: `Wrong 2-step code from ${ip}`,
            },
          });
          return res.status(401).json({
            error: 'That code is wrong or already used. Wait for the next code and try again.',
            code: 'OTP_INVALID',
          });
        }
        await p.employee.update({ where: { id: employee.id }, data: { totp_last_step: step } });
      }

      const roleNames = employee.roles.map((r: any) => r.role.name);
      const permissionsSet = new Set<string>();
      employee.roles.forEach((r: any) => {
        if (r.role.permissions) {
          r.role.permissions.forEach((rp: any) => permissionsSet.add(rp.permission.name));
        }
      });
      if (employee.permission_overrides) {
        employee.permission_overrides.forEach((po: any) => {
          if (po.is_granted) permissionsSet.add(po.permission.name);
          else permissionsSet.delete(po.permission.name);
        });
      }
      const permissions = Array.from(permissionsSet);

      const tokenPayload = {
        employeeId: employee.id,
        employeeCode: employee.employee_code,
        companyId: employee.company_id,
        branchId: employee.branch_id,
        roles: roleNames,
        permissions,
        tokenVersion: employee.token_version,
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const familyToken = crypto.randomUUID();

      await p.authSession.create({
        data: {
          employee_id: employee.id,
          family_token: familyToken,
          refresh_token_hash: refreshTokenHash,
          expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });

      // Reset rate limiter on success
      // Only this account's own counter -- see loginRateLimitKey.
      loginRateLimiter.resetKey(loginRateLimitKey(req));

      // Successful sign-ins were never recorded, so "who signed in when, from
      // where" could not be answered. IP and device are added automatically.
      await p.auditEvent.create({
        data: {
          actor_id: employee.id,
          action: 'LOGIN',
          entity_type: 'EMPLOYEE',
          entity_id: employee.id,
          company_id: employee.company_id,
        },
      });

      // Set httpOnly refresh cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: REFRESH_TOKEN_TTL_MS,
      });

      return res.status(200).json({
        message: 'Login successful',
        accessToken,
        refreshToken, // Return in body for IndexedDB storage fallback
        firstLoginDone: employee.first_login_done,
        attendanceRequired: employee.attendance_required,
        twoStepSetupRequired: !employee.totp_enabled_at && needsTwoStep(roleNames),
        user: mapEmployeeToUser(employee, roleNames, permissions),
      });
    } catch (error) {
      logger.error('Login error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  },
);

// POST /api/v1/auth/change-password
router.post(
  '/change-password',
  authenticateToken,
  validateRequestBody(ChangePasswordSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { current_password, new_password } = req.body;
      const employeeId = req.user!.employeeId;

      const employee = await p.employee.findUnique({
        where: { id: employeeId },
      });

      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const match = await bcrypt.compare(current_password, employee.password_hash);
      if (!match) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(new_password, 12);

      await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            password_hash: newHash,
            first_login_done: true,
            token_version: { increment: 1 },
          },
        });

        await tx.authSession.updateMany({
          where: { employee_id: employeeId, revoked: false },
          data: { revoked: true, revocation_reason: 'PASSWORD_CHANGED' },
        });

        await tx.auditEvent.create({
          data: {
            actor_id: employeeId,
            action: 'PASSWORD_CHANGED',
            entity_type: 'EMPLOYEE',
            entity_id: employeeId,
            new_value: JSON.stringify({ firstLogin: !employee.first_login_done }),
          },
        });
      });

      // Fetch updated employee for new token version
      const updatedEmployee = await p.employee.findUnique({
        where: { id: employeeId },
        include: {
          roles: {
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
          permission_overrides: { include: { permission: true } },
          company: true,
          branch: true,
        },
      });

      if (!updatedEmployee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const roleNames = updatedEmployee.roles.map((r: any) => r.role.name);
      const permissionsSet = new Set<string>();
      updatedEmployee.roles.forEach((r: any) => {
        if (r.role.permissions) {
          r.role.permissions.forEach((rp: any) => permissionsSet.add(rp.permission.name));
        }
      });
      if (updatedEmployee.permission_overrides) {
        updatedEmployee.permission_overrides.forEach((po: any) => {
          if (po.is_granted) permissionsSet.add(po.permission.name);
          else permissionsSet.delete(po.permission.name);
        });
      }
      const permissions = Array.from(permissionsSet);

      const tokenPayload = {
        employeeId: updatedEmployee.id,
        employeeCode: updatedEmployee.employee_code,
        companyId: updatedEmployee.company_id,
        branchId: updatedEmployee.branch_id,
        roles: roleNames,
        permissions,
        tokenVersion: updatedEmployee.token_version,
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const familyToken = crypto.randomUUID();

      await p.authSession.create({
        data: {
          employee_id: updatedEmployee.id,
          family_token: familyToken,
          refresh_token_hash: refreshTokenHash,
          expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });

      // Set httpOnly refresh cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: REFRESH_TOKEN_TTL_MS,
      });

      return res.status(200).json({
        message: 'Password updated successfully',
        accessToken,
        refreshToken, // Return in body for IndexedDB storage fallback
        firstLoginDone: true,
        user: mapEmployeeToUser(updatedEmployee, roleNames, permissions),
      });
    } catch (error) {
      logger.error('Change password error:', error);
      return res.status(500).json({ error: 'Failed to update password' });
    }
  },
);

// GET /api/v1/auth/me
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Profile and permissions in parallel; permissions come from a single
    // joined query (see utils/effectivePermissions.ts) instead of a chain of
    // per-relation queries.
    const [employee, roleNames, permissions] = await Promise.all([
      p.employee.findUnique({
        where: { id: req.user!.employeeId },
        include: { company: true, branch: true },
      }),
      getRoleNames(req.user!.employeeId),
      getEffectivePermissionNames(req.user!.employeeId),
    ]);

    if (!employee) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    return res.status(200).json({
      user: mapEmployeeToUser(employee, roleNames, permissions),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

import { z } from 'zod';
const EmptyBodySchema = z.object({}).strict();

router.post(
  '/refresh',
  refreshRateLimiter,
  validateRequestBody(EmptyBodySchema),
  async (req, res: Response) => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.headers['x-refresh-token'];
      if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required', code: 'UNAUTHORIZED' });
      }

      let refreshPayload: any;
      try {
        refreshPayload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string);
      } catch (err) {
        return res
          .status(401)
          .json({ error: 'Invalid or expired refresh token', code: 'TOKEN_EXPIRED' });
      }

      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const tokenEmployeeId = Number(refreshPayload?.employeeId);

      const REUSE_GRACE_MS = 30 * 1000;
      const revokeFamily = async (familyToken: string, employeeId: number) => {
        await p.authSession.updateMany({
          where: { family_token: familyToken },
          data: { revoked: true, revocation_reason: 'REFRESH_TOKEN_REUSE_DETECTED' },
        });
        await p.auditEvent.create({
          data: {
            actor_id: employeeId,
            action: 'SECURITY_ALERT',
            entity_type: 'TOKEN_FAMILY_REVOKED',
            entity_id: employeeId,
            new_value: `Refresh token reuse detected`,
          },
        });
      };

      // Every page load waits on this request, and with the database in
      // another region each sequential query is a full round trip. So the
      // reads and the consume step run together in one round:
      //  - the conditional updateMany is the atomic "use this token once"
      //    step: only one request can flip consumed false -> true;
      //  - the session row is read alongside to explain a failed consume
      //    (unknown / revoked / reused) and to get the token family;
      //  - employee, roles and permissions load by the id inside the
      //    (signature-verified) refresh token.
      const [consumed, session, employee, roleNames, freshPermissions] = await Promise.all([
        p.authSession.updateMany({
          where: { refresh_token_hash: refreshTokenHash, consumed: false, revoked: false },
          data: { consumed: true },
        }),
        p.authSession.findFirst({ where: { refresh_token_hash: refreshTokenHash } }),
        Number.isInteger(tokenEmployeeId)
          ? p.employee.findUnique({ where: { id: tokenEmployeeId } })
          : Promise.resolve(null),
        Number.isInteger(tokenEmployeeId) ? getRoleNames(tokenEmployeeId) : Promise.resolve([]),
        Number.isInteger(tokenEmployeeId)
          ? getEffectivePermissionNames(tokenEmployeeId)
          : Promise.resolve([]),
      ]);

      const fail = (error: string) => {
        res.clearCookie('refreshToken');
        return res.status(401).json({ error, code: 'UNAUTHORIZED' });
      };

      if (!session) return fail('Invalid session');
      if (consumed.count === 0) {
        if (session.revoked) return fail('Session revoked');
        // Already consumed. Two tabs (or the app and its background sync)
        // refreshing at the same moment send the same key; that used to
        // revoke the whole sign-in as "token reuse" and log people out 1-4
        // times a day (audit 2026-11-01). A reuse within a few seconds of the
        // first use is that race: give this request its own new key in the
        // same sign-in. Anything later is still treated as a stolen key.
        const justUsed =
          session.consumed && Date.now() - new Date(session.updated_at).getTime() < REUSE_GRACE_MS;
        if (!justUsed) {
          await revokeFamily(session.family_token, session.employee_id);
          return fail('Session compromised');
        }
      }
      if (
        !employee ||
        employee.id !== session.employee_id ||
        employee.status !== 'ACTIVE' ||
        lastWorkingDayPassed(employee.last_working_day)
      ) {
        return fail('Account inactive');
      }

      const tokenPayload = {
        employeeId: employee.id,
        employeeCode: employee.employee_code,
        companyId: employee.company_id,
        branchId: employee.branch_id,
        roles: roleNames,
        permissions: freshPermissions,
        tokenVersion: employee.token_version,
      };

      const newAccessToken = generateAccessToken(tokenPayload);
      const newRefreshToken = generateRefreshToken(tokenPayload);
      const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

      await p.authSession.create({
        data: {
          employee_id: employee.id,
          family_token: session.family_token,
          refresh_token_hash: newRefreshTokenHash,
          expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });

      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: REFRESH_TOKEN_TTL_MS,
      });

      return res.status(200).json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    } catch (error) {
      logger.error('Refresh error:', error);
      return res.status(500).json({ error: 'Refresh failed' });
    }
  },
);

router.post('/logout', validateRequestBody(EmptyBodySchema), async (req, res: Response) => {
  const refreshToken = req.cookies?.refreshToken || req.headers['x-refresh-token'];
  if (typeof refreshToken === 'string' && refreshToken) {
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    try {
      await p.authSession.updateMany({
        // Already-revoked sessions keep their reason (e.g. PASSWORD_CHANGED).
        where: { refresh_token_hash: refreshTokenHash, revoked: false },
        data: { revoked: true, revocation_reason: 'LOGGED_OUT' },
      });
    } catch (error) {
      // The client is logging out either way -- still clear the cookie and
      // answer 200 rather than leaving the request hanging.
      logger.error('Logout session revoke error:', error);
    }
  }
  res.clearCookie('refreshToken', { path: '/' });
  return res.status(200).json({ message: 'Logged out successfully' });
});

// Sign-ins = token families still usable on some device.
const activeFamilies = async (employeeId: number) => {
  const rows = await p.authSession.findMany({
    where: {
      employee_id: employeeId,
      consumed: false,
      revoked: false,
      expires_at: { gt: new Date() },
    },
    select: { family_token: true },
  });
  return new Set(rows.map((r: { family_token: string }) => r.family_token));
};

const currentFamily = async (req: any): Promise<string | null> => {
  const refreshToken = req.cookies?.refreshToken || req.headers['x-refresh-token'];
  if (typeof refreshToken !== 'string' || !refreshToken) return null;
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const session = await p.authSession.findFirst({
    where: { refresh_token_hash: hash, employee_id: req.user.employeeId },
    select: { family_token: true },
  });
  return session?.family_token || null;
};

// GET /api/v1/auth/sessions -- how many devices this person is signed in on.
router.get('/sessions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const families = await activeFamilies(req.user!.employeeId);
    return res.json({ devices: families.size });
  } catch (error) {
    logger.error('List sessions error:', error);
    return res.status(500).json({ error: 'Could not load your sign-ins' });
  }
});

// POST /api/v1/auth/sessions/sign-out-others -- sign out every other phone or
// browser (a lost phone, a shared computer), keeping this one.
router.post(
  '/sessions/sign-out-others',
  authenticateToken,
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;
      const keep = await currentFamily(req);
      if (!keep) {
        return res.status(400).json({ error: 'Sign in again on this device, then try once more.' });
      }
      const result = await p.$transaction(
        async (tx: import('@prisma/client').Prisma.TransactionClient) => {
          const revoked = await tx.authSession.updateMany({
            where: { employee_id: employeeId, revoked: false, NOT: { family_token: keep } },
            data: { revoked: true, revocation_reason: 'SIGNED_OUT_OTHER_DEVICES' },
          });
          // Their access tokens would otherwise keep working until they expire;
          // this device simply gets a fresh one on its next refresh.
          await tx.employee.update({
            where: { id: employeeId },
            data: { token_version: { increment: 1 } },
          });
          await tx.auditEvent.create({
            data: {
              actor_id: employeeId,
              action: 'SIGNED_OUT_OTHER_DEVICES',
              entity_type: 'EMPLOYEE',
              entity_id: employeeId,
              new_value: JSON.stringify({ sessions: revoked.count }),
            },
          });
          return revoked.count;
        },
      );
      return res.json({ message: 'Signed out of all other devices', sessions: result });
    } catch (error) {
      logger.error('Sign out other devices error:', error);
      return res.status(500).json({ error: 'Could not sign out the other devices' });
    }
  },
);

// ---- 2-step login (authenticator app) ----------------------------------
// Required for MD, Admin and Finance (middleware/auth.ts TWO_STEP_ROLES),
// available to anyone. Setup: /setup gives a secret + QR link, /enable
// checks the first code and turns it on.

const OtpSchema = z.object({ otp: z.string().trim().min(6).max(10) }).strict();
const DisableTwoStepSchema = z
  .object({ password: z.string().min(1), otp: z.string().trim().min(6).max(10) })
  .strict();

// GET /api/v1/auth/two-step -- is it on, and must it be?
router.get('/two-step', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employee = await p.employee.findUnique({
      where: { id: req.user!.employeeId },
      select: { totp_enabled_at: true },
    });
    return res.json({
      enabled: !!employee?.totp_enabled_at,
      enabledAt: employee?.totp_enabled_at ?? null,
      required: needsTwoStep(req.user!.roles),
    });
  } catch (error) {
    logger.error('2-step status error:', error);
    return res.status(500).json({ error: 'Could not load 2-step login' });
  }
});

// POST /api/v1/auth/two-step/setup -- a fresh secret (not active until /enable).
router.post(
  '/two-step/setup',
  authenticateToken,
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employee = await p.employee.findUnique({
        where: { id: req.user!.employeeId },
        select: { employee_code: true, totp_enabled_at: true },
      });
      if (!employee) return res.status(404).json({ error: 'Employee not found' });
      if (employee.totp_enabled_at) {
        return res.status(409).json({ error: '2-step login is already on.' });
      }
      const secret = newTotpSecret();
      await p.employee.update({
        where: { id: req.user!.employeeId },
        data: { totp_secret: encryptData(secret), totp_last_step: null },
      });
      return res.json({ secret, uri: totpUri(secret, employee.employee_code) });
    } catch (error) {
      logger.error('2-step setup error:', error);
      return res.status(500).json({ error: 'Could not start 2-step login setup' });
    }
  },
);

// POST /api/v1/auth/two-step/enable -- first code from the app turns it on.
router.post(
  '/two-step/enable',
  authenticateToken,
  validateRequestBody(OtpSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;
      const employee = await p.employee.findUnique({
        where: { id: employeeId },
        select: { totp_secret: true, totp_enabled_at: true },
      });
      if (!employee?.totp_secret) {
        return res.status(400).json({ error: 'Start the setup again.' });
      }
      if (employee.totp_enabled_at) {
        return res.status(409).json({ error: '2-step login is already on.' });
      }
      const step = verifyTotp(decryptData(employee.totp_secret) || '', req.body.otp);
      if (step === null) {
        return res.status(400).json({
          error:
            'That code did not match. Check the phone clock is right and enter the newest code.',
        });
      }
      await p.employee.update({
        where: { id: employeeId },
        data: { totp_enabled_at: new Date(), totp_last_step: step },
      });
      await p.auditEvent.create({
        data: {
          actor_id: employeeId,
          action: 'TWO_STEP_ENABLED',
          entity_type: 'EMPLOYEE',
          entity_id: employeeId,
        },
      });
      return res.json({ message: '2-step login is on' });
    } catch (error) {
      logger.error('2-step enable error:', error);
      return res.status(500).json({ error: 'Could not turn on 2-step login' });
    }
  },
);

// POST /api/v1/auth/two-step/disable -- only for people who don't need it;
// MD/Admin/Finance ask a colleague to reset it instead (lost phone).
router.post(
  '/two-step/disable',
  authenticateToken,
  validateRequestBody(DisableTwoStepSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (needsTwoStep(req.user!.roles)) {
        return res.status(403).json({ error: 'Your role must keep 2-step login on.' });
      }
      const employeeId = req.user!.employeeId;
      const employee = await p.employee.findUnique({
        where: { id: employeeId },
        select: { password_hash: true, totp_secret: true, totp_enabled_at: true },
      });
      if (!employee?.totp_enabled_at || !employee.totp_secret) {
        return res.status(400).json({ error: '2-step login is not on.' });
      }
      const passwordOk = await bcrypt.compare(req.body.password, employee.password_hash);
      const step = verifyTotp(decryptData(employee.totp_secret) || '', req.body.otp);
      if (!passwordOk || step === null) {
        return res.status(400).json({ error: 'Password or code is wrong.' });
      }
      await p.employee.update({
        where: { id: employeeId },
        data: { totp_secret: null, totp_enabled_at: null, totp_last_step: null },
      });
      await p.auditEvent.create({
        data: {
          actor_id: employeeId,
          action: 'TWO_STEP_DISABLED',
          entity_type: 'EMPLOYEE',
          entity_id: employeeId,
        },
      });
      return res.json({ message: '2-step login is off' });
    } catch (error) {
      logger.error('2-step disable error:', error);
      return res.status(500).json({ error: 'Could not turn off 2-step login' });
    }
  },
);

// POST /api/v1/auth/two-step/reset/:employeeId -- MD or Admin clears someone
// else's 2-step login (lost or new phone); they set it up again on next use.
router.post(
  '/two-step/reset/:employeeId',
  authenticateToken,
  validateRequestBody(EmptyBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const roles = req.user!.roles || [];
      if (!roles.includes(Roles.MD) && !roles.includes(Roles.ADMIN)) {
        return res.status(403).json({ error: 'Only the MD or Admin can reset 2-step login.' });
      }
      const targetId = Number(req.params.employeeId);
      if (!Number.isInteger(targetId) || targetId <= 0 || targetId === req.user!.employeeId) {
        return res.status(400).json({ error: 'Pick another employee.' });
      }
      const target = await p.employee.findFirst({
        where: { id: targetId, company_id: req.user!.companyId },
        select: { id: true },
      });
      if (!target) return res.status(404).json({ error: 'Employee not found' });
      await p.employee.update({
        where: { id: targetId },
        data: { totp_secret: null, totp_enabled_at: null, totp_last_step: null },
      });
      await p.auditEvent.create({
        data: {
          actor_id: req.user!.employeeId,
          action: 'TWO_STEP_RESET',
          entity_type: 'EMPLOYEE',
          entity_id: targetId,
        },
      });
      return res.json({
        message: '2-step login reset. They will set it up again at their next sign-in.',
      });
    } catch (error) {
      logger.error('2-step reset error:', error);
      return res.status(500).json({ error: 'Could not reset 2-step login' });
    }
  },
);

export default router;
