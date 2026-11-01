import { z } from 'zod';
import { blankAsAbsent, phoneNumber } from './zodHelpers';

// ─────────────────────────────────────────────────────────────
// CUSTOMER SCHEMAS
// ─────────────────────────────────────────────────────────────

export const CustomerCreateSchema = z.object({
  first_name: z.string().min(2),
  last_name: z.string().optional(),
  phone: phoneNumber(),
  email: blankAsAbsent(z.string().email().optional()),
  status: z.string().default('ACTIVE'),
  source: z.string().default('MANUAL_ENTRY'),
  assigned_to_id: z.number().optional(),
});

export const CustomerUpdateSchema = z.object({
  first_name: blankAsAbsent(z.string().min(2).optional()),
  last_name: z.string().optional(),
  phone: blankAsAbsent(phoneNumber().optional()),
  email: blankAsAbsent(z.string().email().optional()),
  status: z.string().optional(),
});
