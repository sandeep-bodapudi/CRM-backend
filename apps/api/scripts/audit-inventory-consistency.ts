/**
 * READ-ONLY consistency check between bookings and inventory state.
 *
 * Finds the damage the old releaseInventoryLock / markInventoryBooked bugs
 * could have left behind (a confirmed booking whose unit is back on sale, a
 * unit held by a cancelled booking, a unit with two confirmed bookings).
 * Writes nothing -- it only prints what a human should review.
 *
 *   DATABASE_URL=... npx ts-node apps/api/scripts/audit-inventory-consistency.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Finding = { issue: string; item: string; detail: string };

async function main() {
  const findings: Finding[] = [];

  const confirmed = await prisma.booking.findMany({
    where: { status: { in: ['CONFIRMED', 'COMPLETED'] } },
    select: {
      id: true,
      booking_code: true,
      status: true,
      property_id: true,
      project_unit_id: true,
      property: { select: { status: true, locked_by_booking_id: true } },
      project_unit: { select: { sales_status: true, locked_by_booking_id: true } },
    },
  });

  // 1. Confirmed booking, but the item is not BOOKED/SOLD (back on sale).
  const confirmedPerItem = new Map<string, string[]>();
  for (const b of confirmed) {
    const key = b.property_id ? `property#${b.property_id}` : `unit#${b.project_unit_id}`;
    confirmedPerItem.set(key, [...(confirmedPerItem.get(key) || []), b.booking_code]);
    const state = b.property?.status ?? b.project_unit?.sales_status;
    if (state && !['BOOKED', 'SOLD'].includes(state)) {
      findings.push({
        issue: 'CONFIRMED booking but item not BOOKED',
        item: key,
        detail: `${b.booking_code} (${b.status}) -> item status ${state}`,
      });
    }
  }

  // 2. Same item confirmed by more than one booking (double sale).
  for (const [item, codes] of confirmedPerItem) {
    if (codes.length > 1) {
      findings.push({ issue: 'Item has >1 confirmed booking', item, detail: codes.join(', ') });
    }
  }

  // 3. Item held by a booking that is CANCELLED (never released).
  const heldProps = await prisma.property.findMany({
    where: { status: { in: ['LOCKED', 'BOOKED'] }, locked_by_booking_id: { not: null } },
    select: { id: true, status: true, locked_by_booking_id: true },
  });
  const heldUnits = await prisma.projectUnit.findMany({
    where: { sales_status: { in: ['RESERVED', 'BOOKED'] }, locked_by_booking_id: { not: null } },
    select: { id: true, sales_status: true, locked_by_booking_id: true },
  });
  const holderIds = [...heldProps, ...heldUnits].map((r) => r.locked_by_booking_id!) as number[];
  const holders = new Map(
    (
      await prisma.booking.findMany({
        where: { id: { in: holderIds } },
        select: { id: true, booking_code: true, status: true },
      })
    ).map((b) => [b.id, b]),
  );
  for (const r of heldProps) {
    const h = holders.get(r.locked_by_booking_id!);
    if (!h || h.status === 'CANCELLED') {
      findings.push({
        issue: 'Item held by cancelled/missing booking',
        item: `property#${r.id}`,
        detail: `status ${r.status}, holder ${h ? `${h.booking_code} (${h.status})` : `#${r.locked_by_booking_id} missing`}`,
      });
    }
  }
  for (const r of heldUnits) {
    const h = holders.get(r.locked_by_booking_id!);
    if (!h || h.status === 'CANCELLED') {
      findings.push({
        issue: 'Item held by cancelled/missing booking',
        item: `unit#${r.id}`,
        detail: `status ${r.sales_status}, holder ${h ? `${h.booking_code} (${h.status})` : `#${r.locked_by_booking_id} missing`}`,
      });
    }
  }

  console.log(
    `Checked ${confirmed.length} confirmed/completed bookings, ${heldProps.length} held properties, ${heldUnits.length} held units.`,
  );
  if (findings.length === 0) {
    console.log('No inconsistencies found.');
  } else {
    console.log(`${findings.length} finding(s):`);
    console.table(findings);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
