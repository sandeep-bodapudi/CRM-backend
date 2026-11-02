-- 2026-11-01: audit records get the company, IP address and device, and the
-- before/after columns become TEXT (VARCHAR(191) was too short for a price
-- rule or unit snapshot). Run BEFORE deploying the code that writes them.
-- Safe to run once; MariaDB "IF NOT EXISTS" makes a re-run harmless.
ALTER TABLE `AuditEvent`
  MODIFY `old_value` TEXT NULL,
  MODIFY `new_value` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `company_id` INT NULL,
  ADD COLUMN IF NOT EXISTS `ip` VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS `user_agent` VARCHAR(255) NULL,
  ADD INDEX IF NOT EXISTS `AuditEvent_company_id_created_at_idx` (`company_id`, `created_at`);
