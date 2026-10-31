-- Legal / compliance details per company (shown on the brand websites):
-- legal name, registered address, RERA number, GSTIN, CIN, grievance / privacy
-- contact, disclaimer. Stored as JSON, edited in Super Admin -> Legal & compliance.
--
-- Additive only. Run on staging, then production, BEFORE the code that reads it.

-- Check (read-only): must return 0 rows before running.
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'Company' AND column_name = 'legal_info';

ALTER TABLE `Company` ADD COLUMN `legal_info` JSON NULL;

-- Verify (read-only): one row.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'Company' AND column_name = 'legal_info';
