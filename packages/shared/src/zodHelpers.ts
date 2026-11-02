import { z } from 'zod';

/**
 * Treat an empty (or whitespace-only) string as "not provided".
 *
 * HTML forms submit "" for every input the user left untouched. A field like
 * `bank_ifsc: z.string().regex(IFSC).optional()` therefore rejects the whole
 * submit ("Invalid IFSC format") even though the user never typed anything —
 * `.optional()` only accepts `undefined`, and "" still has to pass the regex.
 *
 * Wrap such fields with this helper. The blank is mapped to `null` when the
 * wrapped schema accepts null (so an edit form can clear a stored value) and
 * to `undefined` otherwise (field simply omitted). Non-blank input is passed
 * through untouched and still has to satisfy the schema's constraints.
 *
 * Do NOT use this on identity/required fields (name, phone) whose blank
 * submission genuinely should be rejected.
 */
export function blankAsAbsent<T extends z.ZodTypeAny>(schema: T) {
  const absent = schema.safeParse(null).success ? null : undefined;
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? absent : value),
    schema,
  );
}

/**
 * One phone rule everywhere (audit 2026-11-01): the number is cleaned first --
 * spaces, dashes, dots and brackets dropped; "+91", "91" or a leading 0 in
 * front of an Indian number reduced to its 10 digits; other international
 * numbers keep their "+" -- and then checked. Before, any 10+ characters were
 * accepted and stored exactly as typed ("+91 98765 43210", "098765-43210").
 */
export function cleanPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

const PHONE_PATTERN = /^([2-9]\d{9}|\+\d{11,15})$/;

export const phoneNumber = (message = 'Enter a valid 10-digit phone number') =>
  z.preprocess(
    (value) => (typeof value === 'string' ? cleanPhone(value) : value),
    z.string().regex(PHONE_PATTERN, message),
  );
