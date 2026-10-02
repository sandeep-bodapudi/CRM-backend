import { logger } from '../../utils/logger';
import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma';
import {
  authenticateToken,
  AuthenticatedRequest,
  requireRole,
  authenticateKioskToken,
  KioskAuthenticatedRequest,
} from '../../middleware/auth';
import { buildLiveQrPayload, verifyLiveQr, verifyQrHmac } from '../../utils/qr';
import {
  calculateAttendanceStatus,
  getISTComponents,
  getISTDayOfWeek,
  getISTMidnightInstant,
  toHolidayDateKey,
} from '../../utils/time';
import { Roles, AttendanceQRPayloadSchema } from '../../shared';
import { validateRequestBody } from '../../middleware/validate';
import { getAccessibleCompanyIds } from '../../authz/dataScope';

const router = Router();

const p = prisma;

// Kiosk scanner type — not yet in @rrh-ems/shared; defined locally to avoid a circular dep.
export type ScannerType = 'KIOSK' | 'EMPLOYEE_DEVICE';

// GET /api/v1/attendance/my-qr - live attendance QR for the logged-in employee.
// The app re-fetches it every 30 s; each code is accepted for 2 minutes.
router.get('/my-qr', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(buildLiveQrPayload(req.user!.employeeId, req.user!.employeeCode));
  } catch (error) {
    logger.error('QR fetch error:', error);
    return res.status(500).json({ error: 'Failed to generate QR token' });
  }
});

// GET /api/v1/attendance/employee-qr/:id - Generate/fetch HMAC QR payload for a specific employee (Admin/HR)
router.get(
  '/employee-qr/:id',
  authenticateToken,
  requireRole([Roles.MD, Roles.HR_MANAGER, Roles.ADMIN]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const targetId = parseInt(req.params.id);
      if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid employee ID' });

      const employee = await p.employee.findUnique({ where: { id: targetId } });
      if (!employee) return res.status(404).json({ error: 'Employee not found' });
      // A live code checks this person in at a kiosk -- only for employees
      // of the companies the HR/MD user actually manages.
      if (
        !req.user!.roles.includes(Roles.ADMIN) &&
        !(await getAccessibleCompanyIds(req.user!)).includes(employee.company_id)
      ) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // A live code (valid 2 minutes) for HR to show on screen. Printed
      // permanent badges were the codes being shared, so none are issued.
      res.set('Cache-Control', 'no-store');
      return res.status(200).json(buildLiveQrPayload(employee.id, employee.employee_code));
    } catch (error) {
      logger.error('Admin QR fetch error:', error);
      return res.status(500).json({ error: 'Failed to generate QR token' });
    }
  },
);

// GET /api/v1/attendance/my-status - Check today's check-in status
router.get('/my-status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeId = req.user!.employeeId;
    const { dateString } = getISTComponents(new Date());

    // Find attendance log for today IST
    const logs = await p.attendanceLog.findMany({
      where: { employee_id: employeeId },
      orderBy: { check_in_at: 'desc' },
      take: 5,
    });

    const todayLog = logs.find((l: any) => {
      if (!l.check_in_at) return false;
      return getISTComponents(new Date(l.check_in_at)).dateString === dateString;
    });

    return res.status(200).json({
      date: dateString,
      checkedIn: !!todayLog,
      status: todayLog ? todayLog.status : null,
      checkInAt: todayLog?.check_in_at || null,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch attendance status' });
  }
});

// An AttendanceLog still open from an EARLIER IST day (the employee forgot
// to check out and the nightly rollup didn't close it -- the host sleeps
// overnight, so it often doesn't run) used to block every later scan: the
// check-in path saw "already checked in" and never created today's log.
// Close it exactly the way dailyAttendanceRollupJob would (at the IST
// midnight ending its check-in day, same audit action), so the scan can
// carry on. Returns true if the log was stale and has been closed.
const closeIfStaleOpenLog = async (
  tx: import('@prisma/client').Prisma.TransactionClient,
  log: { id: number; employee_id: number; check_in_at: Date; check_out_at: Date | null },
  todayDateString: string,
): Promise<boolean> => {
  if (log.check_out_at !== null) return false;
  const checkInDay = getISTComponents(new Date(log.check_in_at)).dateString;
  if (checkInDay >= todayDateString) return false;

  const checkOutAt = new Date(getISTMidnightInstant(checkInDay).getTime() + 24 * 60 * 60 * 1000);
  const durationMinutes = Math.round(
    (checkOutAt.getTime() - new Date(log.check_in_at).getTime()) / 60000,
  );
  await tx.attendanceLog.update({
    where: { id: log.id },
    data: { check_out_at: checkOutAt, working_duration_minutes: Math.max(0, durationMinutes) },
  });
  await tx.auditEvent.create({
    data: {
      actor_id: log.employee_id,
      action: 'ATTENDANCE_AUTO_CHECKOUT_MIDNIGHT',
      entity_type: 'ATTENDANCE_LOG',
      entity_id: log.id,
      new_value: JSON.stringify({ check_out_at: checkOutAt }),
      reason: 'Employee did not check out; auto-closed at midnight (on next scan).',
    },
  });
  return true;
};

// Old permanent badges (version 1) stop working unless
// ALLOW_STATIC_ATTENDANCE_QR=true is set -- a temporary switch for the
// changeover, not something to leave on.
const allowStaticQr = () => process.env.ALLOW_STATIC_ATTENDANCE_QR === 'true';

type QrCheck = { payload: any } | { error: string };

// Parse and verify a scanned attendance QR.
const parseAndVerifyQR = (_req: AuthenticatedRequest, qrPayload: any): QrCheck => {
  let payload = qrPayload;
  if (typeof qrPayload === 'string') {
    try {
      payload = JSON.parse(qrPayload);
    } catch (e) {}
  }

  if (!payload || !payload.employeeId) return { error: 'Invalid QR Code.' };

  if (Number(payload.version) === 2) {
    const result = verifyLiveQr({
      employeeId: Number(payload.employeeId),
      employeeCode: String(payload.employeeCode),
      issuedAt: Number(payload.issuedAt),
      signedToken: payload.signedToken,
    });
    if (result === 'expired') {
      return {
        error:
          'This QR code has expired. Open the CRM app on your own phone and show the live code.',
      };
    }
    return result === 'ok' ? { payload } : { error: 'Invalid QR Code.' };
  }

  const isValid = verifyQrHmac(
    payload.employeeId,
    payload.employeeCode,
    payload.version || 1,
    payload.signedToken || payload,
  );
  if (!isValid) return { error: 'Invalid QR Code.' };
  if (!allowStaticQr()) {
    return {
      error:
        'Printed / saved QR badges are no longer accepted. Open the CRM app on your phone (Profile -> Attendance QR) and show the live code.',
    };
  }
  return { payload };
};

// POST /api/v1/attendance/scan - Verify QR and Stamp Attendance (IST rules)
// Kiosk-only: must be authenticated with a type:'KIOSK' token.
// The token's embedded branchId is written to AttendanceLog.branch_id so the
// attendance record carries the physical scan location, not the employee's
// assigned branch.
router.post(
  '/scan',
  authenticateKioskToken,
  validateRequestBody(AttendanceQRPayloadSchema),
  async (req: KioskAuthenticatedRequest, res: Response) => {
    const targetCompanyId = req.kiosk!.companyId;
    const branchId = req.kiosk!.branchId; // physical scan location

    try {
      const rawPayload = req.body.qrPayload || req.body.qr_token || req.body.payload;
      const check = parseAndVerifyQR(req, rawPayload);
      if ('error' in check) return res.status(400).json({ error: check.error });
      const payload = check.payload;

      const targetEmployeeId = payload.employeeId;

      // Load employee and verify Tenant Isolation & Status
      const scannedEmployee = await p.employee.findUnique({
        where: { id: targetEmployeeId },
      });

      if (!scannedEmployee) return res.status(404).json({ error: 'Employee not found' });
      if (scannedEmployee.company_id !== targetCompanyId) {
        return res.status(403).json({ error: 'Company mismatch.' });
      }
      if (scannedEmployee.status !== 'ACTIVE' || !scannedEmployee.attendance_required) {
        return res.status(403).json({ error: 'Not eligible for attendance.' });
      }

      const now = new Date();
      const { dateString, timeString } = getISTComponents(now);

      if (getISTDayOfWeek(dateString) === 0) {
        return res.status(400).json({ error: 'Today is a holiday.' });
      }
      const holidayCheck = await p.companyHoliday.findFirst({
        where: { company_id: targetCompanyId, date: toHolidayDateKey(dateString) },
      });
      if (holidayCheck) {
        return res.status(400).json({ error: 'Today is a holiday.' });
      }

      // Concurrency Protection via Transaction
      const result = await p.$transaction(
        async (tx: import('@prisma/client').Prisma.TransactionClient) => {
          const existingLogs = await tx.attendanceLog.findMany({
            where: { employee_id: targetEmployeeId },
            orderBy: { check_in_at: 'desc' },
            take: 5,
          });

          let activeCheckIn = existingLogs.find((l: any) => l.check_out_at === null);
          if (activeCheckIn && (await closeIfStaleOpenLog(tx, activeCheckIn, dateString))) {
            activeCheckIn = undefined;
          }
          if (activeCheckIn) return { alreadyStamped: true, log: activeCheckIn };

          const alreadyCheckedInToday = existingLogs.find((l: any) => {
            if (!l.check_in_at) return false;
            return getISTComponents(new Date(l.check_in_at)).dateString === dateString;
          });

          if (alreadyCheckedInToday) return { alreadyStamped: true, log: alreadyCheckedInToday };

          // Check for an approved late-checkin proposal covering today (IST)
          const istTodayStart = new Date(`${dateString}T00:00:00+05:30`);
          const istTodayEnd = new Date(`${dateString}T23:59:59+05:30`);
          const approvedProposal = await tx.attendanceProposal.findFirst({
            where: {
              employee_id: targetEmployeeId,
              type: 'LATE_CHECKIN',
              status: 'APPROVED',
              target_date: { gte: istTodayStart, lte: istTodayEnd },
            },
          });
          const hasApprovedProposal = !!approvedProposal;

          const calculatedStatus = calculateAttendanceStatus(
            now,
            hasApprovedProposal,
            scannedEmployee.employment_type || 'FULL_TIME',
          );
          const newLog = await tx.attendanceLog.create({
            data: {
              employee_id: targetEmployeeId,
              check_in_at: now,
              status: calculatedStatus,
              source: 'QR_SCAN',
              ...(branchId != null ? { branch_id: branchId } : {}), // populate only for kiosk scans
            },
          });
          return { alreadyStamped: false, log: newLog };
        },
        { isolationLevel: 'Serializable' },
      );

      if (result.alreadyStamped) {
        return res.status(200).json({
          message: 'Already logged in for today',
          alreadyStamped: true,
          status: result.log?.status,
          checkInAt: result.log?.check_in_at,
          timeIST: timeString,
          full_name: scannedEmployee.full_name,
        });
      }

      return res.status(200).json({
        message: `Login stamped successfully as ${result.log?.status}`,
        alreadyStamped: false,
        status: result.log?.status,
        checkInAt: result.log?.check_in_at,
        timeIST: timeString,
        full_name: scannedEmployee.full_name,
      });
    } catch (error: any) {
      if (error.code === 'P2034') {
        // Transaction conflict / deadlock. Another request won the race.
        // We can safely assume they are already logged in.
        return res.status(200).json({
          message: 'Already logged in (handled concurrent request)',
          alreadyStamped: true,
          status: 'PRESENT',
          timeIST: getISTComponents(new Date()).timeString,
        });
      }
      logger.error('Scan attendance error:', error);
      return res.status(500).json({ error: 'Scan failed, please try again.' });
    }
  },
);

// POST /api/v1/attendance/checkout - Stamp Checkout (IST rules)
router.post(
  '/checkout',
  authenticateKioskToken,
  validateRequestBody(AttendanceQRPayloadSchema),
  async (req: KioskAuthenticatedRequest, res: Response) => {
    const targetCompanyId = req.kiosk!.companyId;
    const branchId = req.kiosk!.branchId;

    try {
      const rawPayload = req.body.qrPayload || req.body.qr_token || req.body.payload;
      const check = parseAndVerifyQR(req, rawPayload);
      if ('error' in check) return res.status(400).json({ error: check.error });
      const payload = check.payload;

      const targetEmployeeId = payload.employeeId;

      const scannedEmployee = await p.employee.findUnique({ where: { id: targetEmployeeId } });
      if (!scannedEmployee || scannedEmployee.company_id !== targetCompanyId) {
        return res.status(403).json({ error: 'Company mismatch.' });
      }

      const now = new Date();
      const { dateString, timeString } = getISTComponents(now);

      if (getISTDayOfWeek(dateString) === 0) {
        return res.status(400).json({ error: 'Today is a holiday.' });
      }
      const holidayCheck = await p.companyHoliday.findFirst({
        where: { company_id: targetCompanyId, date: toHolidayDateKey(dateString) },
      });
      if (holidayCheck) {
        return res.status(400).json({ error: 'Today is a holiday.' });
      }

      // getISTComponents().timeString is "HH:MM" (no seconds) — comparing
      // against "18:00:00" made "18:00" (a valid prefix, but shorter) always
      // sort as less-than, so a checkout landing anywhere in the 18:00
      // minute was wrongly treated as "before 18:00" and blocked.
      if (timeString < '18:00') {
        // Check for approved early logout proposal
        const earlyProposal = await p.attendanceProposal.findFirst({
          where: {
            employee_id: targetEmployeeId,
            type: 'EARLY_CHECKOUT',
            status: 'APPROVED',
            target_date: {
              gte: new Date(`${dateString}T00:00:00.000+05:30`),
              lte: new Date(`${dateString}T23:59:59.999+05:30`),
            },
          },
        });

        if (!earlyProposal) {
          return res
            .status(400)
            .json({ error: 'Logout is not allowed before 18:00 IST without an emergency request' });
        }
      }

      // Kiosk logout gate: employees with report_required=true must submit today's
      // daily report before checking out. Reuses the same lookup logic as GET /reports/today-status.
      if (scannedEmployee.report_required) {
        const todayReport = await p.dailyReport.findFirst({
          where: {
            employee_id: targetEmployeeId,
            submitted_at: {
              gte: new Date(`${dateString}T00:00:00.000+05:30`),
              lte: new Date(`${dateString}T23:59:59.999+05:30`),
            },
          },
        });
        if (!todayReport) {
          return res.status(400).json({
            error: 'Please submit your daily report first.',
          });
        }
      }

      const result = await p.$transaction(
        async (tx: import('@prisma/client').Prisma.TransactionClient) => {
          // Find active check-in
          const activeLog = await tx.attendanceLog.findFirst({
            where: { employee_id: targetEmployeeId, check_out_at: null },
            orderBy: { check_in_at: 'desc' },
          });

          if (!activeLog)
            return { error: 'Already logged out, no need to scan again. You can leave now.' };

          // A log left open from an earlier day is not today's check-in --
          // close it at its own midnight rather than stretching it to now.
          if (await closeIfStaleOpenLog(tx, activeLog, dateString)) {
            return { error: 'No check-in found for today. Please contact HR.' };
          }

          const checkInTime = new Date(activeLog.check_in_at).getTime();
          const diffMs = now.getTime() - checkInTime;
          const durationMinutes = Math.max(0, Math.round(diffMs / 60000));

          const updatedLog = await tx.attendanceLog.update({
            where: { id: activeLog.id },
            data: {
              check_out_at: now,
              working_duration_minutes: durationMinutes,
              ...(branchId != null ? { branch_id: branchId } : {}), // populate only for kiosk scans
            },
          });

          return { log: updatedLog };
        },
        { isolationLevel: 'Serializable' },
      );

      if (result.error) return res.status(400).json({ error: result.error });

      return res.status(200).json({
        message: 'Logged out successfully',
        checkOutAt: result.log?.check_out_at,
        working_duration_minutes: result.log?.working_duration_minutes,
        timeIST: timeString,
        full_name: scannedEmployee.full_name,
      });
    } catch (error) {
      logger.error('Logout error:', error);
      return res.status(500).json({ error: 'Attendance logout failed' });
    }
  },
);

export default router;
