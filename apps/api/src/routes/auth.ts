import { logger } from '../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { generateAccessToken, generateRefreshToken, REFRESH_TOKEN_TTL_MS } from '../utils/jwt';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { LoginSchema, ChangePasswordSchema, Roles } from '../shared';
import { validateRequestBody } from '../middleware/validate';
import { loginRateLimiter, loginRateLimitKey, refreshRateLimiter } from '../middleware/rateLimiter';
import { publicAssetUrl } from '../utils/media';
import { decryptData } from '../utils/crypto';
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

      if (!employee || employee.status !== 'ACTIVE') {
        await p.auditEvent.create({
          data: {
            actor_id: 0,
            action: 'SECURITY_ALERT',
            entity_type: 'AUTH_FAILED',
            entity_id: 0,
            new_value: `Attempted login with invalid/inactive code`,
          },
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, employee.password_hash);
      if (!isMatch) {
        await p.auditEvent.create({
          data: {
            actor_id: employee.id,
            action: 'SECURITY_ALERT',
            entity_type: 'AUTH_FAILED',
            entity_id: employee.id,
            new_value: `Invalid password attempt`,
          },
        });
        return res.status(401).json({ error: 'Invalid credentials' });
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
        // Already consumed: reuse of an old refresh token, or two refreshes
        // racing with the same one. Either way revoke the whole family.
        await revokeFamily(session.family_token, session.employee_id);
        return fail('Session compromised');
      }
      if (!employee || employee.id !== session.employee_id || employee.status !== 'ACTIVE') {
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
        where: { refresh_token_hash: refreshTokenHash },
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

export default router;
