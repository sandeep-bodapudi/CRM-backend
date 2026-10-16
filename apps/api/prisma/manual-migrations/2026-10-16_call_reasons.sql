-- F-3: call reasons.
--
-- 1. LeadActivity gets two nullable columns so a call's outcome and the reason
--    behind "not interested" / "wrong number" are stored as data, not only as
--    text inside the note. Existing rows keep NULL and are read from their note
--    as before.
-- 2. Lead.exit_reason (native MySQL ENUM) gains two values used when a lead is
--    dropped from a call: MARKETING_CALL and BROKER_OR_AGENT. Appending values
--    to the end of an ENUM does not touch existing rows.
--
-- Additive only. Run on staging, then production, BEFORE the code that writes
-- these columns is deployed. Safe to re-run? No: ADD COLUMN fails if the column
-- already exists; run the checks first.

-- Check (read-only): both must return 0 rows before running.
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'LeadActivity'
  AND column_name IN ('call_outcome', 'call_reason');

ALTER TABLE `LeadActivity`
  ADD COLUMN `call_outcome` VARCHAR(40) NULL,
  ADD COLUMN `call_reason` VARCHAR(40) NULL;

ALTER TABLE `Lead`
  MODIFY COLUMN `exit_reason` ENUM(
    'NO_MATCHING_INVENTORY',
    'CHOSE_COMPETITOR',
    'BUDGET_MISMATCH',
    'NOT_READY',
    'DO_NOT_CONTACT',
    'UNRESPONSIVE',
    'INVALID_CONTACT',
    'DUPLICATE_LEAD',
    'FINANCING_ISSUE',
    'LOCATION_MISMATCH',
    'ALREADY_PURCHASED',
    'JUST_ENQUIRING',
    'SITE_VISIT_NO_SHOW',
    'NEGOTIATION_FAILED',
    'OUT_OF_SERVICE_AREA',
    'OTHER',
    'MARKETING_CALL',
    'BROKER_OR_AGENT'
  ) NULL;

-- Verify (read-only): two rows, and the enum type ends with the two new values.
SELECT column_name, column_type FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'LeadActivity' AND column_name IN ('call_outcome', 'call_reason'))
    OR (table_name = 'Lead' AND column_name = 'exit_reason'));
