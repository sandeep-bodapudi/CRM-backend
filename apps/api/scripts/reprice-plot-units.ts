/**
 * Re-prices PLOT units that were priced on the wrong area basis.
 *
 * Step 3 of docs/changes/sql/2026-11-02_plot_units_price_basis.sql: run it
 * after that file's UPDATE. Finds PLOT units whose saved base-price line was
 * not on plot area and recalculates them with the project's current rules, through
 * the same PricingService a manual "Recalculate" uses.
 *
 * BOOKED/SOLD/RESERVED units are skipped unless --include-sold: their stored
 * price is what the customer was quoted. A unit with an override keeps it.
 *
 *   DATABASE_URL=... npx ts-node -T apps/api/scripts/reprice-plot-units.ts            # dry run
 *   DATABASE_URL=... npx ts-node -T apps/api/scripts/reprice-plot-units.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { PricingService } from '../src/services/pricing/pricing.service';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const includeSold = process.argv.includes('--include-sold');

async function main() {
  const plots = await prisma.projectUnit.findMany({
    where: { unit_type: 'PLOT', plot_area_sqyd: { gt: 0 } },
    select: {
      id: true,
      unit_code: true,
      sales_status: true,
      calculated_price: true,
      final_price: true,
      price_lines: { where: { kind: 'BASE_RATE' }, select: { area_basis: true, amount: true } },
    },
  });

  const wrong = plots.filter((u) => {
    const base = u.price_lines[0];
    // No base line means no base rate was configured — re-pricing changes nothing.
    return !!base && base.area_basis !== null && base.area_basis !== 'PLOT_AREA';
  });

  let repriced = 0;
  for (const u of wrong) {
    const sold = ['RESERVED', 'BOOKED', 'SOLD'].includes(u.sales_status);
    if (sold && !includeSold) {
      console.log(`SKIP  ${u.unit_code} (${u.sales_status}) — pass --include-sold to re-price`);
      continue;
    }
    if (!apply) {
      console.log(`WOULD ${u.unit_code} (${u.sales_status}) calculated ₹${u.calculated_price}`);
      continue;
    }
    const after = await PricingService.recalculateUnit(u.id);
    repriced++;
    console.log(
      `DONE  ${u.unit_code}: calculated ₹${u.calculated_price} → ₹${after.calculated_price}, final ₹${u.final_price} → ₹${after.final_price}`,
    );
  }
  console.log(
    `${wrong.length} plot unit(s) priced on the wrong basis; ${apply ? `${repriced} re-priced` : 'dry run, nothing written'}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
