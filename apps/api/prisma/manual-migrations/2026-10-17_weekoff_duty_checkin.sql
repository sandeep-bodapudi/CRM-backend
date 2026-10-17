-- Week-off per person, duty days, comp-off and selfie check-in (2026-10-17).
--  * Employee.weekly_off_day: 0 = Sunday ... 6 = Saturday, NULL = no fixed weekly off.
--    Default 0 (Sunday), so nothing changes for anyone until HR sets a person's day.
--  * Branch.latitude / longitude: the office pin; an app check-in far from it is flagged.
--  * AttendanceCheckinProof: selfie + surroundings photo + location behind an app check-in.
--  * CompOffCredit: one comp-off day earned per approved duty day worked.
-- Additive only. Run on staging, then production, BEFORE the code that uses them.
-- Table names are case-sensitive on the Linux servers: keep the capitals.

-- Check (read-only): must return 0 rows.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'Employee' AND column_name = 'weekly_off_day')
    OR (table_name = 'Branch' AND column_name IN ('latitude', 'longitude')));

ALTER TABLE `Branch`
  ADD COLUMN `latitude` DOUBLE NULL,
  ADD COLUMN `longitude` DOUBLE NULL;

ALTER TABLE `Employee`
  ADD COLUMN `weekly_off_day` INTEGER NULL DEFAULT 0;

CREATE TABLE `AttendanceCheckinProof` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `attendance_log_id` INTEGER NULL,
  `place_type` VARCHAR(191) NOT NULL,
  `branch_id` INTEGER NULL,
  `project_id` INTEGER NULL,
  `selfie_url` VARCHAR(191) NOT NULL,
  `surroundings_url` VARCHAR(191) NOT NULL,
  `latitude` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `accuracy_m` DOUBLE NULL,
  `distance_m` INTEGER NULL,
  `flags` TEXT NULL,
  `ai_note` TEXT NULL,
  `review_status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `reviewed_by` INTEGER NULL,
  `reviewed_at` DATETIME(3) NULL,
  `review_note` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AttendanceCheckinProof_employee_id_created_at_idx`(`employee_id`, `created_at`),
  INDEX `AttendanceCheckinProof_review_status_idx`(`review_status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CompOffCredit` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `earned_date` DATE NOT NULL,
  `expires_at` DATE NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'AVAILABLE',
  `used_date` DATE NULL,
  `proposal_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `CompOffCredit_employee_id_status_idx`(`employee_id`, `status`),
  UNIQUE INDEX `CompOffCredit_employee_id_earned_date_key`(`employee_id`, `earned_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Verify (read-only): 3 column rows + 2 tables.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'Employee' AND column_name = 'weekly_off_day')
    OR (table_name = 'Branch' AND column_name IN ('latitude', 'longitude')));
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('AttendanceCheckinProof', 'CompOffCredit');
