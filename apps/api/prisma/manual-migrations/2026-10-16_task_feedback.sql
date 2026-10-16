-- F-13: task feedback. When someone finishes a task they say how it went
-- (completed / not completed / blocked / need more time), with a note, and the
-- assigner can accept the report or send the task back.
-- Additive, all nullable: no existing task changes. Run on staging, then
-- production, BEFORE the code that writes these columns is deployed.

-- Check (read-only): must return 0 rows.
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'Task'
  AND column_name IN ('outcome', 'feedback', 'feedback_at', 'reschedule_to', 'reviewed_at', 'reviewed_by', 'review_note');

ALTER TABLE `Task`
  ADD COLUMN `outcome` VARCHAR(20) NULL,
  ADD COLUMN `feedback` TEXT NULL,
  ADD COLUMN `feedback_at` DATETIME(3) NULL,
  ADD COLUMN `reschedule_to` DATETIME(3) NULL,
  ADD COLUMN `reviewed_at` DATETIME(3) NULL,
  ADD COLUMN `reviewed_by` INT NULL,
  ADD COLUMN `review_note` TEXT NULL;

-- Verify (read-only): 7 rows.
SELECT column_name, column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'Task'
  AND column_name IN ('outcome', 'feedback', 'feedback_at', 'reschedule_to', 'reviewed_at', 'reviewed_by', 'review_note');
