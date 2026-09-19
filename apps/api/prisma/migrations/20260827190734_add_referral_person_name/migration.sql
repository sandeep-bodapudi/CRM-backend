-- AlterTable
ALTER TABLE `Lead` ADD COLUMN `referral_employee_id` INTEGER NULL,
    ADD COLUMN `referral_person_name` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_referral_employee_id_fkey` FOREIGN KEY (`referral_employee_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
