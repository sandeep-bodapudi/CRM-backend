-- F-7: Lead.source_detail -- the name of the source when Lead.source is OTHER
-- (or the original wording of a free-text source that was not recognised).
-- Additive and nullable: no existing row changes. Run on staging, then
-- production, BEFORE the code that writes it is deployed.

-- Check (read-only): must return 0 rows.
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'Lead' AND column_name = 'source_detail';

ALTER TABLE `Lead` ADD COLUMN `source_detail` VARCHAR(80) NULL;

-- Verify (read-only): 1 row, varchar(80).
SELECT column_name, column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'Lead' AND column_name = 'source_detail';
