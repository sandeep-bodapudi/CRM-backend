import { prisma } from '../../lib/prisma';
import { normalizeIndianPhone } from '../../utils/phone';

/**
 * The id of a lead in this company whose phone is the same number, however it was
 * typed: "98765 43210", "+91 98765-43210", "09876543210" and "919876543210" are one
 * person. Leads store the phone as it was typed, so an exact comparison lets the same
 * customer in twice. Separators are stripped in the database, the last ten digits are
 * compared, and the candidates are then confirmed with the same normalisation the
 * WhatsApp links use.
 */
export async function findLeadIdByPhone(companyId: number, phone: string): Promise<number | null> {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  const tail = digits.slice(-10);
  const rows = await prisma.$queryRaw<{ id: number; phone: string }[]>`
    SELECT id, phone FROM Lead
    WHERE company_id = ${companyId}
      AND RIGHT(
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), '.', ''),
            ${tail.length}
          ) = ${tail}
    LIMIT 20`;
  const wanted = normalizeIndianPhone(phone);
  const hit = rows.find((r) => normalizeIndianPhone(r.phone) === wanted);
  return hit ? Number(hit.id) : null;
}
