-- My Property: construction progress and announcements that staff post for a
-- project's buyers (CRM -> Projects -> project -> Customer updates). Each post
-- also creates a CustomerNotification for every buyer of the project.
--
-- Additive only (one new table). Run on staging, then production, BEFORE the
-- code that reads it.

-- Check (read-only): must return 0 rows before running.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'ProjectUpdate';

CREATE TABLE `ProjectUpdate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `project_id` INTEGER NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'PROGRESS',
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `photos` JSON NULL,
    `notified_count` INTEGER NOT NULL DEFAULT 0,
    `posted_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectUpdate_project_id_created_at_idx`(`project_id`, `created_at`),
    INDEX `ProjectUpdate_company_id_idx`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProjectUpdate` ADD CONSTRAINT `ProjectUpdate_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ProjectUpdate` ADD CONSTRAINT `ProjectUpdate_posted_by_id_fkey` FOREIGN KEY (`posted_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Verify (read-only): one row.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'ProjectUpdate';
