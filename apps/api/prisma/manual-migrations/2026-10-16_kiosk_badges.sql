-- F-12: printed badge + PIN at the kiosk, for staff with no phone or data (decision D2).
-- Five new columns on Employee, all with safe defaults: the feature is OFF for
-- everyone until HR switches it on for a person. Run on staging, then production,
-- BEFORE the code that uses them is deployed.

-- Check (read-only): must return 0 rows.
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'Employee' AND column_name LIKE 'badge_%';

ALTER TABLE `Employee`
  ADD COLUMN `static_badge_enabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `badge_version` INT NOT NULL DEFAULT 1,
  ADD COLUMN `badge_pin_hash` VARCHAR(191) NULL,
  ADD COLUMN `badge_pin_failures` INT NOT NULL DEFAULT 0,
  ADD COLUMN `badge_locked_until` DATETIME(3) NULL;

-- Verify (read-only): 5 rows.
SELECT column_name, column_default, is_nullable FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'Employee'
  AND (column_name LIKE 'badge_%' OR column_name = 'static_badge_enabled');
