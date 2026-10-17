-- Call reasons, round 2 (2026-10-17): "Salesperson from another company".
--
-- Lead.exit_reason (native ENUM) gains one value, OTHER_COMPANY_SALESPERSON, used
-- when a telecaller finds the contact is a salesperson of another company: the lead
-- is dropped and never called again. Appending a value to the end of an ENUM does
-- not touch existing rows. (The new "could not get through" reasons need no database
-- change: LeadActivity.call_reason is a VARCHAR(40).)
--
-- Additive only. Run on staging, then production, BEFORE the code that writes it.
-- Run after 2026-10-16_call_reasons.sql (this list includes its two values).

-- Check (read-only): must return 0 rows (value not there yet).
SELECT column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'Lead' AND column_name = 'exit_reason'
  AND column_type LIKE '%OTHER_COMPANY_SALESPERSON%';

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
    'BROKER_OR_AGENT',
    'OTHER_COMPANY_SALESPERSON'
  ) NULL;

-- Verify (read-only): 1 row whose column_type ends with 'OTHER_COMPANY_SALESPERSON').
SELECT column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'Lead' AND column_name = 'exit_reason';
