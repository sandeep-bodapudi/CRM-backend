/**
 * Normalizes a phone number to the digit string a wa.me link expects: country
 * code + subscriber number, no symbols, no leading zero. Mirrors
 * apps/api/src/utils/phone.ts -- keep both in sync.
 */
export function normalizeIndianPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export function buildWhatsAppUrl(phone: string, text?: string): string {
  const base = `https://wa.me/${normalizeIndianPhone(phone)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
