/**
 * Normalizes a phone number to the digit string WhatsApp's wa.me links and
 * SMS/OTP providers expect: a country code followed by the subscriber number,
 * no symbols, no leading zero.
 *
 * Every call site that built a wa.me link used to do
 * `cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone`, which is
 * wrong twice over: a 10-digit Indian mobile number that happens to start
 * with "91" (e.g. 9198xxxxxx) is mistaken for "already has the country code"
 * and sent with no code at all, and an 11-digit number entered with a
 * domestic leading 0 (0xxxxxxxxxx) gets "91" glued onto the 0 instead of
 * replacing it.
 */
export function normalizeIndianPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}
