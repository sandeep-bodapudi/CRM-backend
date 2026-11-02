-- 2026-11-02: resignation hand-over. A resigned employee keeps working until
-- their last working day; on that day they are locked out and their open work
-- goes to `handover_to_id`. `offboarded_at` records that the last-day step ran.
-- Run BEFORE deploying the code that reads them.
-- Safe to run once; MariaDB "IF NOT EXISTS" makes a re-run harmless.
ALTER TABLE `Employee`
  ADD COLUMN IF NOT EXISTS `handover_to_id` INT NULL,
  ADD COLUMN IF NOT EXISTS `offboarded_at` DATETIME(3) NULL,
  ADD INDEX IF NOT EXISTS `Employee_handover_to_id_fkey` (`handover_to_id`);

ALTER TABLE `Employee`
  ADD CONSTRAINT `Employee_handover_to_id_fkey` FOREIGN KEY IF NOT EXISTS (`handover_to_id`)
  REFERENCES `Employee` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Anyone already marked RESIGNED was locked out at the time: mark them done so
-- the nightly job leaves them alone (their work can still be handed over from
-- their profile).
UPDATE `Employee` SET `offboarded_at` = NOW(3)
  WHERE `status` = 'RESIGNED' AND `offboarded_at` IS NULL;
