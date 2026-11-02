-- 2026-11-02 — plot units saved with a flat's price basis
--
-- Before the 2026-11-02 fix, a PLOT unit created without an explicit
-- price_basis got the column default SUPER_BUILT_UP. A plot has no super
-- built-up area, so every per-Sq.Yd rule priced it at 0. Owner's decision
-- (2026-11-02): plots are priced on plot area (Sq.Yd), flats on super
-- built-up area — correct and re-price the wrong ones.
--
-- Order: run on rrh_local first, then staging, then prod — staging/prod only
-- after the owner approves. Apply BEFORE pushing the code (prod API
-- auto-deploys from main).
--
-- Step 1 (read-only): what will change. Save this output; it is the record of
-- the old prices. BOOKED/SOLD units are listed too — see step 3.

SELECT pu.id, pu.unit_code, pu.project_id, pu.sales_status, pu.price_basis,
       pu.plot_area_sqyd, pu.base_price, pu.calculated_price, pu.final_price,
       pu.override_price
FROM `ProjectUnit` pu
WHERE pu.unit_type = 'PLOT' AND pu.price_basis <> 'PLOT_AREA'
ORDER BY pu.project_id, pu.id;

-- Flats on any basis other than super built-up (owner: flats are priced on
-- super built-up only). Read-only — reported, not changed, by this file.
SELECT pu.id, pu.unit_code, pu.project_id, pu.sales_status, pu.price_basis
FROM `ProjectUnit` pu
WHERE pu.unit_type = 'FLAT' AND pu.price_basis <> 'SUPER_BUILT_UP';

-- Step 2: correct the basis.
START TRANSACTION;
UPDATE `ProjectUnit`
SET price_basis = 'PLOT_AREA'
WHERE unit_type = 'PLOT' AND price_basis <> 'PLOT_AREA';
-- Expect the same row count step 1 returned for plots, then:
COMMIT;

-- Step 3: re-price. Prices come from the pricing engine, not SQL, so run
--   apps/api/scripts/reprice-plot-units.ts
-- with DATABASE_URL pointing at the same database. It recalculates the PLOT
-- units whose saved base line was not on plot area. It skips BOOKED/SOLD
-- units (their price is what the customer agreed) unless --include-sold.
