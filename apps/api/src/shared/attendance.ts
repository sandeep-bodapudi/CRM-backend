import { z } from 'zod';

// Attendance Status
export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  APPROVED_LATE: 'APPROVED_LATE',
  HALF_DAY: 'HALF_DAY',
  APPROVED_HALF_DAY: 'APPROVED_HALF_DAY',
  ABSENT: 'ABSENT',
  LEAVE: 'LEAVE',
} as const;

export type AttendanceStatusType = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

// Password Change Schema (Forced first login) — same complexity bar as
// EmployeeCreateSchema.initial_password so a self-chosen password can never
// be weaker than an admin-set one.
export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// Late Proposal Schema (< 09:30 AM IST)
export const LateProposalSchema = z.object({
  date: z.string().min(1, 'Date is required'), // YYYY-MM-DD
  expected_time: z.string().min(1, 'Expected arrival time is required'), // HH:mm
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

export type LateProposalInput = z.infer<typeof LateProposalSchema>;

// Leave Proposal Schema (>= 1 day advance)
export const LeaveProposalSchema = z.object({
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().nullable().optional(),
  leave_type: z.enum(['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF']).optional(),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
  // Sick leave may start today (before 11:00 IST); other leave needs a day's notice.
  sick: z.boolean().optional(),
});

export type LeaveProposalInput = z.infer<typeof LeaveProposalSchema>;

export const AttendanceQRPayloadSchema = z.object({
  qrPayload: z.string().optional(),
  qr_token: z.string().optional(),
  payload: z.string().optional(),
});

export const AttendanceHolidaySchema = z.object({
  date: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

const attendanceStatusValues = Object.values(AttendanceStatus) as [string, ...string[]];

// Manual attendance record creation — the kiosk-is-down fallback. Requires a
// reason so there's always an audit trail explaining why a record exists
// with no QR scan behind it.
export const AdminAttendanceCreateSchema = z.object({
  employee_id: z.number().int().positive(),
  check_in_at: z.string().min(1, 'Check-in time is required'),
  check_out_at: z.string().optional(),
  status: z.enum(attendanceStatusValues),
  notes: z.string().min(1, 'A reason is required when adding a record manually'),
});
export type AdminAttendanceCreateInput = z.infer<typeof AdminAttendanceCreateSchema>;

// Manual attendance record correction — same "kiosk is down / kiosk got it
// wrong" fallback, applied to an existing record instead of a new one.
export const AdminAttendanceUpdateSchema = z.object({
  status: z.enum(attendanceStatusValues).optional(),
  check_in_at: z.string().optional(),
  check_out_at: z.string().nullable().optional(),
  notes: z.string().optional(),
});
export type AdminAttendanceUpdateInput = z.infer<typeof AdminAttendanceUpdateSchema>;
