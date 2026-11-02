-- 2026-11-02: 2-step login with an authenticator app (MD, Admin, Finance).
-- Run BEFORE deploying the code that reads these columns (every request
-- checks them). Safe to re-run.
ALTER TABLE `Employee`
  ADD COLUMN IF NOT EXISTS `totp_secret` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `totp_enabled_at` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `totp_last_step` INT NULL;
