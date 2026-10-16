-- F-9: measured targets (day / week / month) for a role or a person.
-- A brand-new table: nothing existing changes. Run on staging, then production,
-- BEFORE the code that uses it is deployed.

-- Check (read-only): must return 0 rows.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'PerformanceTarget';

CREATE TABLE `PerformanceTarget` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `company_id` INT NOT NULL,
  `role_name` VARCHAR(191) NULL,
  `employee_id` INT NULL,
  `metric` VARCHAR(191) NOT NULL,
  `period` VARCHAR(191) NOT NULL,
  `value` INT NOT NULL,
  `valid_from` DATETIME(3) NOT NULL,
  `valid_to` DATETIME(3) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by_id` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `PerformanceTarget_company_id_is_active_idx` (`company_id`, `is_active`),
  INDEX `PerformanceTarget_employee_id_idx` (`employee_id`),
  INDEX `PerformanceTarget_role_name_idx` (`role_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Verify (read-only): 1 row.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'PerformanceTarget';
