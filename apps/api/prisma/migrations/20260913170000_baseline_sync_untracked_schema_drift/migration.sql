-- Baseline migration: reconciles tracked migration history with the actual
-- schema, which had drifted far apart because most schema changes between
-- the initial import and 2026-09-07 were applied with `prisma db push`
-- (including a few tables that were pushed and later dropped again) rather
-- than `prisma migrate dev`, so they never became migration files.
--
-- Generated via: prisma migrate diff --from-url <db built from only the
-- previously-tracked migrations> --to-url <the real, already-running dev
-- database> --script
--
-- This file is applied for real only on genuinely fresh databases. On the
-- existing local dev and production databases (which already have this
-- schema from the untracked `db push` calls), it is registered via
-- `prisma migrate resolve --applied` instead of executed, since running
-- these CREATE/ALTER statements against a database that already has the
-- columns/tables would fail.

-- DropForeignKey
ALTER TABLE `Booking` DROP FOREIGN KEY `Booking_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `Booking` DROP FOREIGN KEY `Booking_customer_id_fkey`;

-- DropForeignKey
ALTER TABLE `Booking` DROP FOREIGN KEY `Booking_property_id_fkey`;

-- DropForeignKey
ALTER TABLE `Branch` DROP FOREIGN KEY `Branch_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `Customer` DROP FOREIGN KEY `Customer_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `Employee` DROP FOREIGN KEY `Employee_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `Installment` DROP FOREIGN KEY `Installment_customer_id_fkey`;

-- DropForeignKey
ALTER TABLE `LeadPropertyInterest` DROP FOREIGN KEY `LeadPropertyInterest_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `Opportunity` DROP FOREIGN KEY `Opportunity_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `Payment` DROP FOREIGN KEY `Payment_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `Project` DROP FOREIGN KEY `Project_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `Property` DROP FOREIGN KEY `Property_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `Property` DROP FOREIGN KEY `Property_created_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `PropertyImage` DROP FOREIGN KEY `PropertyImage_uploaded_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `PropertyVerificationLog` DROP FOREIGN KEY `PropertyVerificationLog_actor_id_fkey`;

-- DropForeignKey
ALTER TABLE `SiteVisitBooking` DROP FOREIGN KEY `SiteVisitBooking_assigned_to_fkey`;

-- DropForeignKey
ALTER TABLE `SiteVisitBooking` DROP FOREIGN KEY `SiteVisitBooking_customer_id_fkey`;

-- DropForeignKey
ALTER TABLE `SiteVisitBooking` DROP FOREIGN KEY `SiteVisitBooking_property_id_fkey`;

-- DropForeignKey
ALTER TABLE `SiteVisitBooking` DROP FOREIGN KEY `sitevisitbooking_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `SiteVisitReassignment` DROP FOREIGN KEY `SiteVisitReassignment_to_employee_id_fkey`;

-- DropIndex
DROP INDEX `AttendanceLog_employee_id_date_idx` ON `AttendanceLog`;

-- DropIndex
DROP INDEX `Complaint_branch_id_idx` ON `Complaint`;

-- DropIndex
DROP INDEX `DailyReport_employee_id_date_idx` ON `DailyReport`;

-- DropIndex
DROP INDEX `DailyTarget_employee_id_date_idx` ON `DailyTarget`;

-- DropIndex
DROP INDEX `EmployeeBranch_employee_id_idx` ON `EmployeeBranch`;

-- DropIndex
DROP INDEX `EmployeePermissionOverride_employee_id_idx` ON `EmployeePermissionOverride`;

-- DropIndex
DROP INDEX `EmployeeQrCode_slug_key` ON `EmployeeQrCode`;

-- DropIndex
DROP INDEX `EmployeeRole_employee_id_idx` ON `EmployeeRole`;

-- DropIndex
DROP INDEX `LeadMatchingRequirement_lead_id_idx` ON `LeadMatchingRequirement`;

-- DropIndex
DROP INDEX `Opportunity_stage_idx` ON `Opportunity`;

-- DropIndex
DROP INDEX `Property_slug_key` ON `Property`;

-- DropIndex
DROP INDEX `Task_branch_id_idx` ON `Task`;

-- DropIndex
DROP INDEX `Task_company_id_idx` ON `Task`;

-- DropIndex
DROP INDEX `Task_created_by_idx` ON `Task`;

-- AlterTable
ALTER TABLE `AttendanceLog` DROP COLUMN `check_in`,
    DROP COLUMN `check_out`,
    DROP COLUMN `created_at`,
    DROP COLUMN `date`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `half_day`,
    DROP COLUMN `late_minutes`,
    DROP COLUMN `updated_at`,
    ADD COLUMN `branch_id` INTEGER NULL,
    ADD COLUMN `check_in_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `check_out_at` DATETIME(3) NULL,
    ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'QR_SCAN',
    ADD COLUMN `working_duration_minutes` INTEGER NULL,
    MODIFY `notes` varchar(191) NULL;

-- AlterTable
ALTER TABLE `AuditEvent` DROP COLUMN `deleted_at`,
    DROP COLUMN `updated_at`;

-- AlterTable
ALTER TABLE `Booking` DROP COLUMN `deleted_at`,
    ADD COLUMN `area_sqyd` DOUBLE NULL,
    ADD COLUMN `booking_amount_words` VARCHAR(191) NULL,
    ADD COLUMN `charges_per_sqyd` DOUBLE NULL,
    ADD COLUMN `emi_charges` DOUBLE NULL,
    ADD COLUMN `emi_interest_rate` DOUBLE NULL,
    ADD COLUMN `emi_months` INTEGER NULL,
    ADD COLUMN `facing` VARCHAR(191) NULL,
    ADD COLUMN `form_status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN `form_submitted_at` DATETIME(3) NULL,
    ADD COLUMN `form_submitted_by_id` INTEGER NULL,
    ADD COLUMN `is_legacy` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `legacy_booking_date` DATETIME(3) NULL,
    ADD COLUMN `legacy_notes` TEXT NULL,
    ADD COLUMN `md_approved_at` DATETIME(3) NULL,
    ADD COLUMN `md_approved_by_id` INTEGER NULL,
    ADD COLUMN `md_rejection_reason` TEXT NULL,
    ADD COLUMN `plot_no` VARCHAR(191) NULL,
    ADD COLUMN `price_per_sqyd` DOUBLE NULL,
    ADD COLUMN `project_unit_id` INTEGER NULL,
    ADD COLUMN `receipt_date` DATETIME(3) NULL,
    ADD COLUMN `receipt_no` VARCHAR(191) NULL,
    ADD COLUMN `referred_by` VARCHAR(191) NULL,
    ADD COLUMN `referred_by_code` VARCHAR(191) NULL,
    ADD COLUMN `sale_price_per_sqyd` DOUBLE NULL,
    ADD COLUMN `serial_no` VARCHAR(191) NULL,
    ADD COLUMN `tc_accepted_at` DATETIME(3) NULL,
    ADD COLUMN `tc_accepted_by_name` VARCHAR(191) NULL,
    ADD COLUMN `total_cost` DOUBLE NULL,
    ADD COLUMN `total_cost_words` VARCHAR(191) NULL,
    MODIFY `property_id` int(11) NULL,
    MODIFY `agreed_price` double NOT NULL,
    MODIFY `booking_amount` double NOT NULL,
    MODIFY `balance_amount` double NOT NULL;

-- AlterTable
ALTER TABLE `Complaint` DROP COLUMN `branch_id`,
    DROP COLUMN `complaint_type`,
    DROP COLUMN `deleted_at`,
    ADD COLUMN `assigned_employee_id` INTEGER NULL,
    ADD COLUMN `category` VARCHAR(191) NULL,
    ADD COLUMN `closed_at` DATETIME(3) NULL,
    ADD COLUMN `closure_reason` VARCHAR(191) NULL,
    ADD COLUMN `complaint_code` VARCHAR(191) NOT NULL,
    ADD COLUMN `priority` VARCHAR(191) NOT NULL DEFAULT 'MEDIUM',
    ADD COLUMN `project_unit_id` INTEGER NULL,
    ADD COLUMN `resolution_description` VARCHAR(191) NULL,
    ADD COLUMN `resolved_at` DATETIME(3) NULL,
    ADD COLUMN `resolved_by` INTEGER NULL,
    MODIFY `description` varchar(191) NULL,
    MODIFY `company_id` int(11) NOT NULL,
    MODIFY `customer_id` int(11) NOT NULL;

-- AlterTable
ALTER TABLE `Customer` DROP COLUMN `deleted_at`,
    ADD COLUMN `avatar_url` VARCHAR(191) NULL,
    ADD COLUMN `force_password_reset` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `password_hash` VARCHAR(191) NULL,
    ADD COLUMN `temp_password_expiry` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `CustomerNotification` DROP COLUMN `deleted_at`,
    DROP COLUMN `description`,
    ADD COLUMN `booking_id` INTEGER NULL,
    ADD COLUMN `company_id` INTEGER NOT NULL,
    ADD COLUMN `message` VARCHAR(191) NOT NULL,
    ADD COLUMN `type` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `DailyReport` DROP COLUMN `attachments`,
    DROP COLUMN `content`,
    DROP COLUMN `created_at`,
    DROP COLUMN `date`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `report_type`,
    DROP COLUMN `updated_at`,
    ADD COLUMN `below_target_reason` VARCHAR(191) NULL,
    ADD COLUMN `call_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `closed_deal_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `metrics_json` LONGTEXT NULL,
    ADD COLUMN `site_visit_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `summary` VARCHAR(191) NOT NULL,
    ADD COLUMN `target_met` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `DailyTarget` DROP COLUMN `actual_value`,
    DROP COLUMN `date`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `target_type`,
    DROP COLUMN `target_value`,
    ADD COLUMN `calls_target` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `closed_deals_target` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `company_id` INTEGER NOT NULL,
    ADD COLUMN `form_schema_json` LONGTEXT NULL,
    ADD COLUMN `role_name` VARCHAR(191) NOT NULL,
    ADD COLUMN `site_visits_target` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `target_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `employee_id` int(11) NULL;

-- AlterTable
ALTER TABLE `Employee` ADD COLUMN `profile_image_url` VARCHAR(191) NULL,
    MODIFY `salary_ctc` double NULL;

-- AlterTable
ALTER TABLE `EmployeeBranch` DROP PRIMARY KEY,
    DROP COLUMN `created_at`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `id`,
    DROP COLUMN `is_primary`,
    DROP COLUMN `updated_at`,
    ADD PRIMARY KEY (`employee_id` ASC, `branch_id` ASC);

-- AlterTable
ALTER TABLE `EmployeePermissionOverride` DROP PRIMARY KEY,
    DROP COLUMN `created_at`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `id`,
    DROP COLUMN `permission`,
    DROP COLUMN `updated_at`,
    DROP COLUMN `value`,
    ADD COLUMN `is_granted` BOOLEAN NOT NULL,
    ADD COLUMN `permission_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`employee_id` ASC, `permission_id` ASC);

-- AlterTable
ALTER TABLE `EmployeeQrCode` DROP COLUMN `active`,
    DROP COLUMN `created_at`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `slug`,
    DROP COLUMN `updated_at`,
    ADD COLUMN `expires_at` DATETIME(3) NULL,
    ADD COLUMN `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `qr_token` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `EmployeeRole` DROP PRIMARY KEY,
    DROP COLUMN `created_at`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `id`,
    DROP COLUMN `role`,
    DROP COLUMN `updated_at`,
    ADD COLUMN `role_id` INTEGER NOT NULL,
    ADD PRIMARY KEY (`employee_id` ASC, `role_id` ASC);

-- AlterTable
ALTER TABLE `Installment` DROP COLUMN `amount_due`,
    DROP COLUMN `amount_paid`,
    DROP COLUMN `customer_id`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `verified_at`,
    DROP COLUMN `verified_by`,
    ADD COLUMN `expected_amount` DOUBLE NOT NULL,
    ADD COLUMN `installment_number` INTEGER NOT NULL,
    ADD COLUMN `received_amount` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `received_date` DATETIME(3) NULL,
    ADD COLUMN `recorded_by_id` INTEGER NULL,
    ADD COLUMN `remarks` TEXT NULL,
    MODIFY `due_date` datetime(3) NOT NULL;

-- AlterTable
ALTER TABLE `Lead` DROP COLUMN `deleted_at`,
    DROP COLUMN `demo_handler_id`,
    DROP COLUMN `demo_scheduled_at`,
    DROP COLUMN `expected_bedrooms`,
    DROP COLUMN `expected_budget_max`,
    DROP COLUMN `expected_budget_min`,
    DROP COLUMN `expected_location`,
    DROP COLUMN `expected_property_type`,
    DROP COLUMN `first_name`,
    DROP COLUMN `last_name`,
    DROP COLUMN `lead_assign_reason`,
    DROP COLUMN `priority`,
    DROP COLUMN `secondary_phone`,
    DROP COLUMN `whatsapp_number`,
    ADD COLUMN `assigned_at` DATETIME(3) NULL,
    ADD COLUMN `assignment_type` VARCHAR(191) NULL,
    ADD COLUMN `budget_max` DOUBLE NULL,
    ADD COLUMN `budget_min` DOUBLE NULL,
    ADD COLUMN `created_by_id` INTEGER NULL,
    ADD COLUMN `customer_name` VARCHAR(191) NOT NULL,
    ADD COLUMN `enquiry_type` VARCHAR(191) NULL,
    ADD COLUMN `exit_reason_detail` VARCHAR(191) NULL,
    ADD COLUMN `introduced_by_id` INTEGER NULL,
    ADD COLUMN `last_contacted_at` DATETIME(3) NULL,
    ADD COLUMN `lead_score` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `ownership_type` ENUM('POOL', 'DIRECT') NOT NULL DEFAULT 'POOL',
    ADD COLUMN `preferred_contact_time` VARCHAR(191) NULL,
    ADD COLUMN `preferred_location` VARCHAR(191) NULL,
    ADD COLUMN `previous_lead_id` INTEGER NULL,
    ADD COLUMN `project_id` INTEGER NULL,
    ADD COLUMN `property_ids` LONGTEXT NULL,
    ADD COLUMN `property_type_preference` VARCHAR(191) NULL,
    ADD COLUMN `sla_breach_at` DATETIME(3) NULL,
    MODIFY `phone` varchar(191) NOT NULL,
    MODIFY `exit_reason` enum('NO_MATCHING_INVENTORY','CHOSE_COMPETITOR','BUDGET_MISMATCH','NOT_READY','DO_NOT_CONTACT','UNRESPONSIVE','INVALID_CONTACT','DUPLICATE_LEAD','FINANCING_ISSUE','LOCATION_MISMATCH','ALREADY_PURCHASED','JUST_ENQUIRING','SITE_VISIT_NO_SHOW','NEGOTIATION_FAILED','OUT_OF_SERVICE_AREA','OTHER') NULL;

-- AlterTable
ALTER TABLE `LeadActivity` DROP COLUMN `deleted_at`,
    DROP COLUMN `updated_at`;

-- AlterTable
ALTER TABLE `LeadMatchingRequirement` DROP COLUMN `updated_at`,
    MODIFY `max_budget` double NOT NULL;

-- AlterTable
ALTER TABLE `LeadPropertyInterest` DROP COLUMN `deleted_at`,
    DROP COLUMN `updated_at`,
    ADD COLUMN `project_unit_id` INTEGER NULL,
    MODIFY `property_id` int(11) NULL;

-- AlterTable
ALTER TABLE `MessageTemplate` DROP COLUMN `deleted_at`;

-- AlterTable
ALTER TABLE `Opportunity` DROP COLUMN `customer_id`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `stage`,
    ADD COLUMN `branch_id` INTEGER NULL,
    ADD COLUMN `project_unit_id` INTEGER NULL,
    MODIFY `probability` double NULL DEFAULT 10,
    MODIFY `expected_value` double NULL,
    MODIFY `budget_min` double NULL,
    MODIFY `budget_max` double NULL;

-- AlterTable
ALTER TABLE `Payment` DROP COLUMN `deleted_at`,
    DROP COLUMN `receipt_text`,
    DROP COLUMN `transaction_id`,
    ADD COLUMN `external_transaction_id` VARCHAR(191) NULL,
    ADD COLUMN `portal_payment_id` VARCHAR(191) NULL,
    ADD COLUMN `recorded_by_id` INTEGER NOT NULL,
    ADD COLUMN `reference_number` VARCHAR(191) NULL,
    ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'CRM',
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `sync_status` VARCHAR(191) NOT NULL DEFAULT 'LOCAL',
    MODIFY `amount` double NOT NULL,
    ALTER COLUMN `payment_method` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Project` DROP COLUMN `deleted_at`,
    ADD COLUMN `address` TEXT NULL,
    ADD COLUMN `approval_authorities` LONGTEXT NULL,
    ADD COLUMN `approval_authority` VARCHAR(191) NULL,
    ADD COLUMN `approval_number` VARCHAR(191) NULL,
    ADD COLUMN `blocks_count` INTEGER NULL,
    ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `completion_date` DATETIME(3) NULL,
    ADD COLUMN `cover_image_url` TEXT NULL,
    ADD COLUMN `default_area_unit` ENUM('SQFT', 'SQYD', 'SQM', 'ACRE', 'GUNTA', 'CENT', 'ANKANAM', 'HECTARE') NULL,
    ADD COLUMN `default_price_basis` ENUM('CARPET', 'BUILT_UP', 'SUPER_BUILT_UP', 'PLOT_AREA', 'LUMPSUM') NULL,
    ADD COLUMN `developer_name` VARCHAR(191) NULL,
    ADD COLUMN `district` VARCHAR(191) NULL,
    ADD COLUMN `floors_count` INTEGER NULL,
    ADD COLUMN `is_published` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `locality` VARCHAR(191) NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `lp_number` VARCHAR(191) NULL,
    ADD COLUMN `mandal` VARCHAR(191) NULL,
    ADD COLUMN `maps_link` TEXT NULL,
    ADD COLUMN `pincode` VARCHAR(191) NULL,
    ADD COLUMN `project_phase` VARCHAR(191) NULL,
    ADD COLUMN `project_type` ENUM('PLOTTED', 'APARTMENT', 'VILLA', 'MIXED', 'COMMERCIAL') NULL,
    ADD COLUMN `rera_number` VARCHAR(191) NULL,
    ADD COLUMN `rera_status` VARCHAR(191) NULL,
    ADD COLUMN `state` VARCHAR(191) NULL,
    ADD COLUMN `total_area_unit` ENUM('SQFT', 'SQYD', 'SQM', 'ACRE', 'GUNTA', 'CENT', 'ANKANAM', 'HECTARE') NULL,
    ADD COLUMN `total_area_value` DOUBLE NULL,
    ADD COLUMN `total_units` INTEGER NULL,
    ADD COLUMN `towers_count` INTEGER NULL,
    ADD COLUMN `verification_notes` TEXT NULL,
    ADD COLUMN `verification_status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN `verified_at` DATETIME(3) NULL,
    ADD COLUMN `verified_by_id` INTEGER NULL,
    ADD COLUMN `village` VARCHAR(191) NULL,
    ALTER COLUMN `slug` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Property` DROP COLUMN `deleted_at`,
    DROP COLUMN `details`,
    DROP COLUMN `price`,
    ADD COLUMN `area_sqyd` DOUBLE NULL,
    ADD COLUMN `area_unit` ENUM('SQFT', 'SQYD', 'SQM', 'ACRE', 'GUNTA', 'CENT', 'ANKANAM', 'HECTARE') NULL,
    ADD COLUMN `area_value` DOUBLE NULL,
    ADD COLUMN `base_price` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `base_rate` DOUBLE NULL,
    ADD COLUMN `base_rate_unit` ENUM('FIXED', 'PER_SQFT', 'PER_SQYD', 'PERCENT_OF_BASE', 'QTY_X_RATE') NULL,
    ADD COLUMN `built_up_area_sqft` DOUBLE NULL,
    ADD COLUMN `calculated_price` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `carpet_area_sqft` DOUBLE NULL,
    ADD COLUMN `charges_total` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `construction_year` INTEGER NULL,
    ADD COLUMN `digital_marketing_executive_id` INTEGER NULL,
    ADD COLUMN `discount_amount` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `discount_reason` VARCHAR(191) NULL,
    ADD COLUMN `final_price` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `first_floor_area_sqft` DOUBLE NULL,
    ADD COLUMN `ground_floor_area_sqft` DOUBLE NULL,
    ADD COLUMN `held_for_lead_id` INTEGER NULL,
    ADD COLUMN `hold_until` DATETIME(3) NULL,
    ADD COLUMN `is_corner` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_main_road_facing` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_park_facing` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_premium_location` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_road_facing` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `location_confirmed_by_pm` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `overridden_at` DATETIME(3) NULL,
    ADD COLUMN `overridden_by_id` INTEGER NULL,
    ADD COLUMN `override_price` DOUBLE NULL,
    ADD COLUMN `override_reason` TEXT NULL,
    ADD COLUMN `plot_area_sqyd` DOUBLE NULL,
    ADD COLUMN `plot_length_ft` DOUBLE NULL,
    ADD COLUMN `plot_width_ft` DOUBLE NULL,
    ADD COLUMN `premiums_total` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `price_basis` ENUM('CARPET', 'BUILT_UP', 'SUPER_BUILT_UP', 'PLOT_AREA', 'LUMPSUM') NOT NULL DEFAULT 'SUPER_BUILT_UP',
    ADD COLUMN `price_computed_at` DATETIME(3) NULL,
    ADD COLUMN `road_width_ft` DOUBLE NULL,
    ADD COLUMN `sales_status` ENUM('AVAILABLE', 'HOLD', 'RESERVED', 'BOOKED', 'SOLD', 'BLOCKED', 'UNAVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
    ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'INTERNAL',
    ADD COLUMN `super_built_up_area_sqft` DOUBLE NULL,
    ADD COLUMN `taxes_total` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `total_floors` INTEGER NULL,
    ADD COLUMN `view` VARCHAR(191) NULL,
    MODIFY `area_sqft` double NOT NULL,
    MODIFY `created_by_id` int(11) NULL,
    MODIFY `latitude` double NULL,
    MODIFY `longitude` double NULL;

-- AlterTable
ALTER TABLE `PropertyImage` DROP COLUMN `deleted_at`,
    DROP COLUMN `updated_at`;

-- AlterTable
ALTER TABLE `PropertyLayoutRegion` ADD COLUMN `project_unit_id` INTEGER NULL,
    MODIFY `property_id` int(11) NULL;

-- AlterTable
ALTER TABLE `PropertyPublication` DROP COLUMN `deleted_at`;

-- AlterTable
ALTER TABLE `PropertyVerificationLog` DROP COLUMN `deleted_at`,
    DROP COLUMN `updated_at`;

-- AlterTable
ALTER TABLE `SiteVisitBooking` DROP COLUMN `accepted_at`,
    DROP COLUMN `assigned_to`,
    DROP COLUMN `cancelled_at`,
    DROP COLUMN `current_location`,
    DROP COLUMN `customer_id`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `duration_minutes`,
    DROP COLUMN `last_visit_date`,
    DROP COLUMN `next_visit_date`,
    DROP COLUMN `parking_info`,
    DROP COLUMN `purpose`,
    DROP COLUMN `rejected_at`,
    DROP COLUMN `rejection_reason`,
    DROP COLUMN `repeat_visits_count`,
    DROP COLUMN `rescheduled_at`,
    DROP COLUMN `special_instructions`,
    DROP COLUMN `visit_date`,
    DROP COLUMN `visit_status_details`,
    DROP COLUMN `visit_time`,
    ADD COLUMN `assigned_agent_id` INTEGER NULL,
    ADD COLUMN `cancellation_confirmed_by_pm_id` INTEGER NULL,
    ADD COLUMN `completed_at` DATETIME(3) NULL,
    ADD COLUMN `feedback_notes` TEXT NULL,
    ADD COLUMN `opportunity_id` INTEGER NULL,
    ADD COLUMN `project_manager_id` INTEGER NULL,
    ADD COLUMN `project_unit_id` INTEGER NULL,
    ADD COLUMN `proof_photo_url` VARCHAR(191) NULL,
    ADD COLUMN `rating` VARCHAR(191) NULL,
    ADD COLUMN `scheduled_date` DATETIME(3) NOT NULL,
    ADD COLUMN `telecaller_id` INTEGER NOT NULL,
    ADD COLUMN `verification_call_notes` TEXT NULL,
    MODIFY `property_id` int(11) NULL,
    MODIFY `status` enum('REQUESTED','PENDING_ACCEPTANCE','REASSIGNED','ESCALATED_TO_MARKETING_DIRECTOR','ACCEPTED','PENDING_CUSTOMER_RECONFIRMATION','RESCHEDULE_REQUESTED','PENDING_PM_RECONFIRMATION','CONFIRMED','ACTIVE','COMPLETED','CANCELLED','ON_HOLD','CANCELLATION_PENDING_PM_CONFIRMATION') NOT NULL DEFAULT 'REQUESTED';

-- AlterTable
ALTER TABLE `SiteVisitProperty` DROP COLUMN `deleted_at`,
    DROP COLUMN `notes`,
    DROP COLUMN `status`,
    DROP COLUMN `visit_duration_minutes`,
    DROP COLUMN `visit_order`,
    ADD COLUMN `outcome` VARCHAR(191) NULL,
    ADD COLUMN `outcome_reason` TEXT NULL,
    ADD COLUMN `project_unit_id` INTEGER NULL,
    MODIFY `property_id` int(11) NULL;

-- AlterTable
ALTER TABLE `SiteVisitReassignment` DROP COLUMN `deleted_at`,
    DROP COLUMN `issue_date`,
    DROP COLUMN `outcome`,
    DROP COLUMN `outcome_reason`,
    DROP COLUMN `updated_at`;

-- AlterTable
ALTER TABLE `Task` DROP COLUMN `branch_id`,
    DROP COLUMN `company_id`,
    DROP COLUMN `deleted_at`,
    DROP COLUMN `due_date`,
    DROP COLUMN `priority`,
    ADD COLUMN `assignee_id` INTEGER NOT NULL,
    ADD COLUMN `completed_at` DATETIME(3) NULL,
    ADD COLUMN `lead_id` INTEGER NULL,
    ADD COLUMN `opportunity_id` INTEGER NULL,
    ADD COLUMN `target_date` DATETIME(3) NOT NULL,
    MODIFY `description` varchar(191) NULL,
    MODIFY `status` varchar(191) NOT NULL DEFAULT 'PENDING',
    MODIFY `created_by` int(11) NOT NULL;

-- DropTable
DROP TABLE `companynotification`;

-- DropTable
DROP TABLE `customersourcereferral`;

-- DropTable
DROP TABLE `employeenotification`;

-- DropTable
DROP TABLE `opportunityhistory`;

-- CreateTable
CREATE TABLE `Amenity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `icon` VARCHAR(191) NULL,
    `category` ENUM('SECURITY', 'RECREATION', 'CONVENIENCE', 'ENVIRONMENT', 'SPORTS', 'UTILITY', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `Amenity_company_id_idx`(`company_id` ASC),
    UNIQUE INDEX `Amenity_company_id_name_key`(`company_id` ASC, `name` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceProposal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `target_date` DATETIME(3) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewed_by` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `family_token` VARCHAR(191) NOT NULL,
    `refresh_token_hash` VARCHAR(191) NOT NULL,
    `consumed` BOOLEAN NOT NULL DEFAULT false,
    `revoked` BOOLEAN NOT NULL DEFAULT false,
    `revocation_reason` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `AuthSession_employee_id_idx`(`employee_id` ASC),
    INDEX `AuthSession_family_token_idx`(`family_token` ASC),
    INDEX `AuthSession_refresh_token_hash_idx`(`refresh_token_hash` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingPortalMapping` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `crms_booking_id` INTEGER NOT NULL,
    `crms_customer_id` INTEGER NOT NULL,
    `portal_customer_id` VARCHAR(191) NULL,
    `portal_booking_id` VARCHAR(191) NULL,
    `handoff_status` VARCHAR(191) NOT NULL DEFAULT 'CREATED',
    `last_sync_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `BookingPortalMapping_company_id_idx`(`company_id` ASC),
    INDEX `BookingPortalMapping_crms_booking_id_idx`(`crms_booking_id` ASC),
    UNIQUE INDEX `BookingPortalMapping_crms_booking_id_key`(`crms_booking_id` ASC),
    INDEX `BookingPortalMapping_crms_customer_id_idx`(`crms_customer_id` ASC),
    INDEX `BookingPortalMapping_handoff_status_idx`(`handoff_status` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanyHoliday` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `notes` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CompanyHoliday_company_id_date_key`(`company_id` ASC, `date` ASC),
    INDEX `CompanyHoliday_company_id_idx`(`company_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Demo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `handler_id` INTEGER NOT NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `summary` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `accepted_by` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',

    INDEX `Demo_handler_id_fkey`(`handler_id` ASC),
    INDEX `Demo_lead_id_fkey`(`lead_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DemoInterestedProperty` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `demo_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_unit_id` INTEGER NULL,

    UNIQUE INDEX `DemoInterestedProperty_demo_id_project_unit_id_key`(`demo_id` ASC, `project_unit_id` ASC),
    UNIQUE INDEX `DemoInterestedProperty_demo_id_property_id_key`(`demo_id` ASC, `property_id` ASC),
    INDEX `DemoInterestedProperty_project_unit_id_idx`(`project_unit_id` ASC),
    INDEX `DemoInterestedProperty_property_id_fkey`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseRefund` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `company_id` INTEGER NOT NULL,
    `purpose` TEXT NOT NULL,
    `amount` DOUBLE NOT NULL,
    `proof_image_url` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `accountant_id` INTEGER NULL,
    `accountant_note` VARCHAR(191) NULL,
    `accountant_reviewed_at` DATETIME(3) NULL,
    `md_id` INTEGER NULL,
    `md_note` VARCHAR(191) NULL,
    `md_reviewed_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `refunded_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ExpenseRefund_accountant_id_fkey`(`accountant_id` ASC),
    INDEX `ExpenseRefund_company_id_idx`(`company_id` ASC),
    INDEX `ExpenseRefund_employee_id_idx`(`employee_id` ASC),
    INDEX `ExpenseRefund_md_id_fkey`(`md_id` ASC),
    INDEX `ExpenseRefund_refunded_by_fkey`(`refunded_by` ASC),
    INDEX `ExpenseRefund_status_idx`(`status` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IntegrationEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_type` VARCHAR(191) NOT NULL,
    `payload` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CREATED',
    `company_id` INTEGER NOT NULL,
    `crms_booking_id` INTEGER NULL,
    `crms_customer_id` INTEGER NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `max_retries` INTEGER NOT NULL DEFAULT 3,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,

    INDEX `IntegrationEvent_company_id_idx`(`company_id` ASC),
    INDEX `IntegrationEvent_created_at_idx`(`created_at` ASC),
    INDEX `IntegrationEvent_crms_booking_id_idx`(`crms_booking_id` ASC),
    INDEX `IntegrationEvent_crms_customer_id_idx`(`crms_customer_id` ASC),
    INDEX `IntegrationEvent_status_idx`(`status` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryFeature` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_unit_id` INTEGER NULL,
    `property_id` INTEGER NULL,
    `amenity_id` INTEGER NULL,
    `label` VARCHAR(191) NOT NULL,
    `charge_amount` DOUBLE NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InventoryFeature_amenity_id_fkey`(`amenity_id` ASC),
    INDEX `InventoryFeature_project_unit_id_idx`(`project_unit_id` ASC),
    INDEX `InventoryFeature_property_id_idx`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KioskCredential` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `credential_version` INTEGER NOT NULL DEFAULT 1,
    `created_by_id` INTEGER NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `KioskCredential_branch_id_idx`(`branch_id` ASC),
    INDEX `KioskCredential_company_id_idx`(`company_id` ASC),
    UNIQUE INDEX `KioskCredential_company_id_username_key`(`company_id` ASC, `username` ASC),
    INDEX `KioskCredential_created_by_id_idx`(`created_by_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadPreferredLocation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LeadPreferredLocation_lead_id_idx`(`lead_id` ASC),
    UNIQUE INDEX `LeadPreferredLocation_lead_id_location_key`(`lead_id` ASC, `location` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_employee_id_idx`(`employee_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PerformanceSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `snapshot_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `score` DOUBLE NOT NULL DEFAULT 50,
    `tasks_completed` INTEGER NOT NULL DEFAULT 0,
    `on_time_logins` INTEGER NOT NULL DEFAULT 0,
    `late_logins` INTEGER NOT NULL DEFAULT 0,
    `sub_target_reports` INTEGER NOT NULL DEFAULT 0,
    `uninformed_absences` INTEGER NOT NULL DEFAULT 0,

    INDEX `PerformanceSnapshot_employee_id_idx`(`employee_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,

    UNIQUE INDEX `Permission_name_key`(`name` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PMLocationAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pm_id` INTEGER NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NOT NULL DEFAULT 'CITY',
    `company_id` INTEGER NOT NULL,

    INDEX `PMLocationAssignment_company_id_fkey`(`company_id` ASC),
    UNIQUE INDEX `PMLocationAssignment_pm_id_location_company_id_key`(`pm_id` ASC, `location` ASC, `company_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PMReassignmentHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_visit_booking_id` INTEGER NOT NULL,
    `reassigned_by_pm_id` INTEGER NOT NULL,
    `reassigned_to_pm_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PMReassignmentHistory_reassigned_by_pm_id_fkey`(`reassigned_by_pm_id` ASC),
    INDEX `PMReassignmentHistory_reassigned_to_pm_id_fkey`(`reassigned_to_pm_id` ASC),
    INDEX `PMReassignmentHistory_site_visit_booking_id_fkey`(`site_visit_booking_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_unit_id` INTEGER NULL,
    `property_id` INTEGER NULL,
    `rule_id` INTEGER NULL,
    `property_rule_id` INTEGER NULL,
    `label` VARCHAR(191) NOT NULL,
    `kind` ENUM('BASE_RATE', 'PREMIUM', 'CHARGE', 'DISCOUNT', 'TAX') NOT NULL,
    `category` ENUM('FACING', 'FLOOR', 'CORNER', 'ROAD', 'PARK', 'VIEW', 'BHK', 'AMENITY', 'PARKING', 'INFRA', 'MAINTENANCE', 'LEGAL', 'CLUB', 'TAX', 'OTHER') NOT NULL,
    `calc_method` ENUM('FIXED', 'PER_SQFT', 'PER_SQYD', 'PERCENT_OF_BASE', 'QTY_X_RATE') NOT NULL,
    `rate` DOUBLE NOT NULL,
    `quantity` DOUBLE NOT NULL DEFAULT 1,
    `area_basis` ENUM('CARPET', 'BUILT_UP', 'SUPER_BUILT_UP', 'PLOT_AREA', 'LUMPSUM') NULL,
    `amount` DOUBLE NOT NULL,
    `is_manual` BOOLEAN NOT NULL DEFAULT false,
    `is_refundable` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PriceLine_project_unit_id_idx`(`project_unit_id` ASC),
    INDEX `PriceLine_property_id_idx`(`property_id` ASC),
    INDEX `PriceLine_property_rule_id_idx`(`property_rule_id` ASC),
    INDEX `PriceLine_rule_id_idx`(`rule_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectAmenity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `amenity_id` INTEGER NOT NULL,
    `availability` ENUM('INCLUDED', 'OPTIONAL', 'CHARGEABLE') NOT NULL DEFAULT 'INCLUDED',
    `charge_calc_method` ENUM('FIXED', 'PER_SQFT', 'PER_SQYD', 'PERCENT_OF_BASE', 'QTY_X_RATE') NULL,
    `charge_amount` DOUBLE NULL,
    `applicability` ENUM('ALL_UNITS', 'SELECTED_UNITS', 'BY_UNIT_TYPE') NOT NULL DEFAULT 'ALL_UNITS',
    `applicable_unit_type` ENUM('PLOT', 'FLAT', 'VILLA', 'HOUSE', 'COMMERCIAL', 'OTHER') NULL,
    `notes` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ProjectAmenity_amenity_id_fkey`(`amenity_id` ASC),
    UNIQUE INDEX `ProjectAmenity_project_id_amenity_id_key`(`project_id` ASC, `amenity_id` ASC),
    INDEX `ProjectAmenity_project_id_idx`(`project_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectDocument` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `kind` ENUM('RERA', 'APPROVAL', 'LEGAL', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `url` TEXT NOT NULL,
    `title` VARCHAR(191) NULL,
    `uploaded_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectDocument_project_id_kind_idx`(`project_id` ASC, `kind` ASC),
    INDEX `ProjectDocument_uploaded_by_id_fkey`(`uploaded_by_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectMedia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `kind` ENUM('COVER', 'GALLERY', 'VIDEO', 'BROCHURE', 'MASTER_PLAN', 'LAYOUT_PLAN', 'FLOOR_PLAN') NOT NULL,
    `url` TEXT NOT NULL,
    `title` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `uploaded_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectMedia_project_id_kind_idx`(`project_id` ASC, `kind` ASC),
    INDEX `ProjectMedia_uploaded_by_id_fkey`(`uploaded_by_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectPricingRule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `kind` ENUM('BASE_RATE', 'PREMIUM', 'CHARGE', 'DISCOUNT', 'TAX') NOT NULL,
    `category` ENUM('FACING', 'FLOOR', 'CORNER', 'ROAD', 'PARK', 'VIEW', 'BHK', 'AMENITY', 'PARKING', 'INFRA', 'MAINTENANCE', 'LEGAL', 'CLUB', 'TAX', 'OTHER') NOT NULL,
    `calc_method` ENUM('FIXED', 'PER_SQFT', 'PER_SQYD', 'PERCENT_OF_BASE', 'QTY_X_RATE') NOT NULL,
    `rate` DOUBLE NOT NULL,
    `area_basis` ENUM('CARPET', 'BUILT_UP', 'SUPER_BUILT_UP', 'PLOT_AREA', 'LUMPSUM') NULL,
    `applies_to_unit_type` ENUM('PLOT', 'FLAT', 'VILLA', 'HOUSE', 'COMMERCIAL', 'OTHER') NULL,
    `is_mandatory` BOOLEAN NOT NULL DEFAULT true,
    `is_tax` BOOLEAN NOT NULL DEFAULT false,
    `is_refundable` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `match_facing` VARCHAR(191) NULL,
    `match_corner` BOOLEAN NULL,
    `match_park_facing` BOOLEAN NULL,
    `match_road_facing` BOOLEAN NULL,
    `match_main_road_facing` BOOLEAN NULL,
    `match_floor_min` INTEGER NULL,
    `match_floor_max` INTEGER NULL,
    `match_bhk` VARCHAR(191) NULL,
    `match_type_code` VARCHAR(191) NULL,
    `match_view` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ProjectPricingRule_project_id_is_active_idx`(`project_id` ASC, `is_active` ASC),
    INDEX `ProjectPricingRule_project_id_kind_idx`(`project_id` ASC, `kind` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectUnit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `unit_code` VARCHAR(191) NOT NULL,
    `project_id` INTEGER NOT NULL,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `unit_number` VARCHAR(191) NOT NULL,
    `unit_type` ENUM('PLOT', 'FLAT', 'VILLA', 'HOUSE', 'COMMERCIAL', 'OTHER') NOT NULL,
    `plot_number` VARCHAR(191) NULL,
    `survey_number` VARCHAR(191) NULL,
    `tower` VARCHAR(191) NULL,
    `block` VARCHAR(191) NULL,
    `floor` INTEGER NULL,
    `flat_number` VARCHAR(191) NULL,
    `villa_number` VARCHAR(191) NULL,
    `type_code` VARCHAR(191) NULL,
    `bhk` VARCHAR(191) NULL,
    `bedrooms` INTEGER NULL,
    `bathrooms` INTEGER NULL,
    `balconies` INTEGER NULL,
    `living_rooms` INTEGER NULL,
    `kitchens` INTEGER NULL,
    `utility_rooms` INTEGER NULL,
    `has_pooja_room` BOOLEAN NOT NULL DEFAULT false,
    `has_study_room` BOOLEAN NOT NULL DEFAULT false,
    `area_value` DOUBLE NULL,
    `area_unit` ENUM('SQFT', 'SQYD', 'SQM', 'ACRE', 'GUNTA', 'CENT', 'ANKANAM', 'HECTARE') NULL,
    `area_sqft` DOUBLE NULL,
    `area_sqyd` DOUBLE NULL,
    `plot_area_sqyd` DOUBLE NULL,
    `plot_length_ft` DOUBLE NULL,
    `plot_width_ft` DOUBLE NULL,
    `carpet_area_sqft` DOUBLE NULL,
    `built_up_area_sqft` DOUBLE NULL,
    `super_built_up_area_sqft` DOUBLE NULL,
    `ground_floor_area_sqft` DOUBLE NULL,
    `first_floor_area_sqft` DOUBLE NULL,
    `total_floors` INTEGER NULL,
    `price_basis` ENUM('CARPET', 'BUILT_UP', 'SUPER_BUILT_UP', 'PLOT_AREA', 'LUMPSUM') NOT NULL DEFAULT 'SUPER_BUILT_UP',
    `facing` VARCHAR(191) NULL,
    `is_corner` BOOLEAN NOT NULL DEFAULT false,
    `is_road_facing` BOOLEAN NOT NULL DEFAULT false,
    `is_park_facing` BOOLEAN NOT NULL DEFAULT false,
    `is_main_road_facing` BOOLEAN NOT NULL DEFAULT false,
    `road_width_ft` DOUBLE NULL,
    `view` VARCHAR(191) NULL,
    `parking_included` BOOLEAN NOT NULL DEFAULT false,
    `parking_type` VARCHAR(191) NULL,
    `parking_count` INTEGER NULL,
    `parking_slots` VARCHAR(191) NULL,
    `base_rate` DOUBLE NULL,
    `base_rate_unit` ENUM('FIXED', 'PER_SQFT', 'PER_SQYD', 'PERCENT_OF_BASE', 'QTY_X_RATE') NULL,
    `base_price` DOUBLE NOT NULL DEFAULT 0,
    `premiums_total` DOUBLE NOT NULL DEFAULT 0,
    `charges_total` DOUBLE NOT NULL DEFAULT 0,
    `taxes_total` DOUBLE NOT NULL DEFAULT 0,
    `discount_amount` DOUBLE NOT NULL DEFAULT 0,
    `discount_reason` VARCHAR(191) NULL,
    `calculated_price` DOUBLE NOT NULL DEFAULT 0,
    `override_price` DOUBLE NULL,
    `override_reason` TEXT NULL,
    `overridden_by_id` INTEGER NULL,
    `overridden_at` DATETIME(3) NULL,
    `final_price` DOUBLE NOT NULL DEFAULT 0,
    `price_computed_at` DATETIME(3) NULL,
    `sales_status` ENUM('AVAILABLE', 'HOLD', 'RESERVED', 'BOOKED', 'SOLD', 'BLOCKED', 'UNAVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
    `hold_until` DATETIME(3) NULL,
    `held_for_lead_id` INTEGER NULL,
    `locked_until` DATETIME(3) NULL,
    `locked_by_booking_id` INTEGER NULL,
    `is_published` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `created_by_id` INTEGER NULL,
    `migrated_from_property_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `selected_optional_rule_ids` LONGTEXT NULL,
    `listing_type` VARCHAR(191) NULL,

    INDEX `ProjectUnit_area_sqft_idx`(`area_sqft` ASC),
    INDEX `ProjectUnit_branch_id_fkey`(`branch_id` ASC),
    INDEX `ProjectUnit_company_id_idx`(`company_id` ASC),
    INDEX `ProjectUnit_created_by_id_fkey`(`created_by_id` ASC),
    INDEX `ProjectUnit_final_price_idx`(`final_price` ASC),
    UNIQUE INDEX `ProjectUnit_locked_by_booking_id_key`(`locked_by_booking_id` ASC),
    INDEX `ProjectUnit_overridden_by_id_fkey`(`overridden_by_id` ASC),
    INDEX `ProjectUnit_project_id_bhk_idx`(`project_id` ASC, `bhk` ASC),
    INDEX `ProjectUnit_project_id_sales_status_idx`(`project_id` ASC, `sales_status` ASC),
    INDEX `ProjectUnit_project_id_tower_floor_idx`(`project_id` ASC, `tower` ASC, `floor` ASC),
    INDEX `ProjectUnit_project_id_unit_type_idx`(`project_id` ASC, `unit_type` ASC),
    UNIQUE INDEX `ProjectUnit_unit_code_key`(`unit_code` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectUnitDocument` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_unit_id` INTEGER NOT NULL,
    `url` TEXT NOT NULL,
    `title` VARCHAR(191) NULL,
    `uploaded_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectUnitDocument_project_unit_id_idx`(`project_unit_id` ASC),
    INDEX `ProjectUnitDocument_uploaded_by_id_fkey`(`uploaded_by_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectUnitImage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_unit_id` INTEGER NOT NULL,
    `image_url` TEXT NOT NULL,
    `alt_text` VARCHAR(191) NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `uploaded_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectUnitImage_project_unit_id_idx`(`project_unit_id` ASC),
    INDEX `ProjectUnitImage_uploaded_by_id_fkey`(`uploaded_by_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyApartmentDetails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `tower` VARCHAR(191) NULL,
    `block` VARCHAR(191) NULL,
    `floor` VARCHAR(191) NULL,
    `unit_number` VARCHAR(191) NULL,
    `flat_number` VARCHAR(191) NULL,
    `bhk` VARCHAR(191) NULL,
    `balcony_count` INTEGER NULL,
    `has_study_room` BOOLEAN NULL DEFAULT false,
    `has_servant_room` BOOLEAN NULL DEFAULT false,
    `carpet_area` DOUBLE NULL,
    `built_up_area` DOUBLE NULL,
    `super_built_up_area` DOUBLE NULL,
    `parking_included` BOOLEAN NULL DEFAULT false,
    `parking_type` VARCHAR(191) NULL,
    `parking_slots` INTEGER NULL,
    `structure_type` VARCHAR(191) NULL,
    `flooring` VARCHAR(191) NULL,
    `kitchen_type` VARCHAR(191) NULL,
    `windows` VARCHAR(191) NULL,
    `doors` VARCHAR(191) NULL,
    `balcony_area` DOUBLE NULL,
    `bathroom_type` VARCHAR(191) NULL,
    `electrical` VARCHAR(191) NULL,
    `fixtures` VARCHAR(191) NULL,
    `has_additional_parking` BOOLEAN NULL DEFAULT false,
    `has_utility_area` BOOLEAN NULL DEFAULT false,
    `is_city_view` BOOLEAN NULL DEFAULT false,
    `is_covered_parking` BOOLEAN NULL DEFAULT false,
    `is_garden_view` BOOLEAN NULL DEFAULT false,
    `is_higher_floor` BOOLEAN NULL DEFAULT false,
    `is_main_road_view` BOOLEAN NULL DEFAULT false,
    `is_near_lift` BOOLEAN NULL DEFAULT false,
    `is_near_staircase` BOOLEAN NULL DEFAULT false,
    `is_pool_view` BOOLEAN NULL DEFAULT false,
    `is_road_view` BOOLEAN NULL DEFAULT false,
    `paint` VARCHAR(191) NULL,
    `parking_number` VARCHAR(191) NULL,
    `plumbing` VARCHAR(191) NULL,
    `terrace_area` DOUBLE NULL,

    UNIQUE INDEX `PropertyApartmentDetails_property_id_key`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyCommercialOfficeDetails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `office_number` VARCHAR(191) NULL,
    `tower` VARCHAR(191) NULL,
    `floor` VARCHAR(191) NULL,
    `block` VARCHAR(191) NULL,
    `office_type` VARCHAR(191) NULL,
    `cabins` INTEGER NULL,
    `workstations` INTEGER NULL,
    `meeting_rooms` INTEGER NULL,
    `has_reception` BOOLEAN NULL DEFAULT false,
    `has_pantry` BOOLEAN NULL DEFAULT false,
    `washrooms` INTEGER NULL,
    `has_server_room` BOOLEAN NULL DEFAULT false,
    `is_city_view` BOOLEAN NULL DEFAULT false,
    `is_higher_floor` BOOLEAN NULL DEFAULT false,
    `has_parking` BOOLEAN NULL DEFAULT false,
    `has_power_backup` BOOLEAN NULL DEFAULT false,
    `has_lift` BOOLEAN NULL DEFAULT false,
    `has_security` BOOLEAN NULL DEFAULT false,
    `has_fire_safety` BOOLEAN NULL DEFAULT false,
    `has_hvac` BOOLEAN NULL DEFAULT false,
    `has_internet` BOOLEAN NULL DEFAULT false,
    `has_ev_charging` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `PropertyCommercialOfficeDetails_property_id_key`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyCommercialShopDetails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `shop_number` VARCHAR(191) NULL,
    `building` VARCHAR(191) NULL,
    `block` VARCHAR(191) NULL,
    `floor` VARCHAR(191) NULL,
    `shop_type` VARCHAR(191) NULL,
    `frontage` DOUBLE NULL,
    `depth` DOUBLE NULL,
    `ceiling_height` DOUBLE NULL,
    `is_mall_facing` BOOLEAN NULL DEFAULT false,
    `is_entrance_facing` BOOLEAN NULL DEFAULT false,
    `is_parking_facing` BOOLEAN NULL DEFAULT false,
    `is_high_footfall_location` BOOLEAN NULL DEFAULT false,
    `has_parking` BOOLEAN NULL DEFAULT false,
    `has_power` BOOLEAN NULL DEFAULT false,
    `has_water` BOOLEAN NULL DEFAULT false,
    `has_washroom` BOOLEAN NULL DEFAULT false,
    `has_lift` BOOLEAN NULL DEFAULT false,
    `has_security` BOOLEAN NULL DEFAULT false,
    `has_fire_safety` BOOLEAN NULL DEFAULT false,
    `has_signage_space` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `PropertyCommercialShopDetails_property_id_key`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyFarmLandDetails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `farm_land_number` VARCHAR(191) NULL,
    `parcel_number` VARCHAR(191) NULL,
    `survey_number` VARCHAR(191) NULL,
    `subdivision` VARCHAR(191) NULL,
    `road_frontage` DOUBLE NULL,
    `boundary_details` TEXT NULL,
    `is_near_water_source` BOOLEAN NULL DEFAULT false,
    `has_internal_road` BOOLEAN NULL DEFAULT false,
    `has_electricity` BOOLEAN NULL DEFAULT false,
    `has_water` BOOLEAN NULL DEFAULT false,
    `has_borewell` BOOLEAN NULL DEFAULT false,
    `has_irrigation` BOOLEAN NULL DEFAULT false,
    `has_fencing` BOOLEAN NULL DEFAULT false,
    `has_plantation` BOOLEAN NULL DEFAULT false,
    `has_drainage` BOOLEAN NULL DEFAULT false,
    `has_farmhouse_permission` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `PropertyFarmLandDetails_property_id_key`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyHouseDetails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `house_number` VARCHAR(191) NULL,
    `house_type` VARCHAR(191) NULL,
    `bhk` VARCHAR(191) NULL,
    `has_kitchen` BOOLEAN NULL DEFAULT false,
    `has_pooja_room` BOOLEAN NULL DEFAULT false,
    `has_study_room` BOOLEAN NULL DEFAULT false,
    `has_servant_room` BOOLEAN NULL DEFAULT false,
    `has_utility_room` BOOLEAN NULL DEFAULT false,
    `garden_area` DOUBLE NULL,
    `terrace_area` DOUBLE NULL,
    `is_covered_parking` BOOLEAN NULL DEFAULT false,
    `parking_capacity` INTEGER NULL,
    `parking_number` VARCHAR(191) NULL,
    `has_additional_parking` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `PropertyHouseDetails_property_id_key`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyPlotDetails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `plot_number` VARCHAR(191) NULL,
    `phase` VARCHAR(191) NULL,
    `sector_block` VARCHAR(191) NULL,
    `survey_number` VARCHAR(191) NULL,
    `subdivision_number` VARCHAR(191) NULL,
    `length` DOUBLE NULL,
    `width` DOUBLE NULL,
    `frontage` DOUBLE NULL,
    `dimension_string` VARCHAR(191) NULL,
    `north_boundary` VARCHAR(191) NULL,
    `south_boundary` VARCHAR(191) NULL,
    `east_boundary` VARCHAR(191) NULL,
    `west_boundary` VARCHAR(191) NULL,
    `road_width` DOUBLE NULL,
    `number_of_roads` INTEGER NULL,
    `is_corner` BOOLEAN NULL DEFAULT false,
    `is_park_facing` BOOLEAN NULL DEFAULT false,
    `is_main_road_facing` BOOLEAN NULL DEFAULT false,
    `near_entrance` BOOLEAN NULL DEFAULT false,
    `near_clubhouse` BOOLEAN NULL DEFAULT false,
    `near_park` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `PropertyPlotDetails_property_id_key`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyPricing` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `base_price_per_unit` DOUBLE NULL,
    `base_price` DOUBLE NOT NULL DEFAULT 0,
    `facing_premium` DOUBLE NULL DEFAULT 0,
    `corner_premium` DOUBLE NULL DEFAULT 0,
    `park_facing_premium` DOUBLE NULL DEFAULT 0,
    `road_facing_premium` DOUBLE NULL DEFAULT 0,
    `floor_rise_charge` DOUBLE NULL DEFAULT 0,
    `development_charges` DOUBLE NULL DEFAULT 0,
    `maintenance_charges` DOUBLE NULL DEFAULT 0,
    `documentation_charges` DOUBLE NULL DEFAULT 0,
    `registration_charges` DOUBLE NULL DEFAULT 0,
    `other_charges` DOUBLE NULL DEFAULT 0,
    `discount` DOUBLE NULL DEFAULT 0,
    `final_price` DOUBLE NOT NULL DEFAULT 0,

    UNIQUE INDEX `PropertyPricing_property_id_key`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyPricingRule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `kind` ENUM('BASE_RATE', 'PREMIUM', 'CHARGE', 'DISCOUNT', 'TAX') NOT NULL,
    `category` ENUM('FACING', 'FLOOR', 'CORNER', 'ROAD', 'PARK', 'VIEW', 'BHK', 'AMENITY', 'PARKING', 'INFRA', 'MAINTENANCE', 'LEGAL', 'CLUB', 'TAX', 'OTHER') NOT NULL,
    `calc_method` ENUM('FIXED', 'PER_SQFT', 'PER_SQYD', 'PERCENT_OF_BASE', 'QTY_X_RATE') NOT NULL,
    `rate` DOUBLE NOT NULL,
    `area_basis` ENUM('CARPET', 'BUILT_UP', 'SUPER_BUILT_UP', 'PLOT_AREA', 'LUMPSUM') NULL,
    `is_mandatory` BOOLEAN NOT NULL DEFAULT true,
    `is_tax` BOOLEAN NOT NULL DEFAULT false,
    `is_refundable` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `match_facing` VARCHAR(191) NULL,
    `match_corner` BOOLEAN NULL,
    `match_park_facing` BOOLEAN NULL,
    `match_road_facing` BOOLEAN NULL,
    `match_main_road_facing` BOOLEAN NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `PropertyPricingRule_property_id_is_active_idx`(`property_id` ASC, `is_active` ASC),
    INDEX `PropertyPricingRule_property_id_kind_idx`(`property_id` ASC, `kind` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyVillaDetails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `villa_number` VARCHAR(191) NULL,
    `villa_type` VARCHAR(191) NULL,
    `bhk` VARCHAR(191) NULL,
    `has_second_floor` BOOLEAN NULL DEFAULT false,
    `second_floor_area` DOUBLE NULL,
    `has_servant_room` BOOLEAN NULL DEFAULT false,
    `has_pooja_room` BOOLEAN NULL DEFAULT false,
    `has_study_room` BOOLEAN NULL DEFAULT false,
    `has_family_room` BOOLEAN NULL DEFAULT false,
    `garden_area` DOUBLE NULL,
    `terrace_area` DOUBLE NULL,
    `is_clubhouse_facing` BOOLEAN NULL DEFAULT false,
    `is_pool_facing` BOOLEAN NULL DEFAULT false,
    `has_private_garden` BOOLEAN NULL DEFAULT false,
    `has_private_pool` BOOLEAN NULL DEFAULT false,
    `has_terrace` BOOLEAN NULL DEFAULT false,
    `has_compound_wall` BOOLEAN NULL DEFAULT false,
    `has_gate` BOOLEAN NULL DEFAULT false,
    `number_of_cars` INTEGER NULL,
    `has_ev_charging` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `PropertyVillaDetails_property_id_key`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicApiKey` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `api_key` VARCHAR(191) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `PublicApiKey_api_key_idx`(`api_key` ASC),
    UNIQUE INDEX `PublicApiKey_api_key_key`(`api_key` ASC),
    INDEX `PublicApiKey_company_id_idx`(`company_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `endpoint` TEXT NOT NULL,
    `p256dh` TEXT NOT NULL,
    `auth` VARCHAR(191) NOT NULL,
    `user_agent` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PushSubscription_employee_id_endpoint_key`(`employee_id` ASC, `endpoint`(200) ASC),
    INDEX `PushSubscription_employee_id_idx`(`employee_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `is_invisible` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `Role_name_key`(`name` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `role_id` INTEGER NOT NULL,
    `permission_id` INTEGER NOT NULL,

    INDEX `RolePermission_permission_id_fkey`(`permission_id` ASC),
    PRIMARY KEY (`role_id` ASC, `permission_id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteVisitEscalation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_visit_booking_id` INTEGER NOT NULL,
    `marketing_director_notified_at` DATETIME(3) NULL,
    `managing_director_notified_at` DATETIME(3) NULL,

    UNIQUE INDEX `SiteVisitEscalation_site_visit_booking_id_key`(`site_visit_booking_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteVisitFeedback` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_visit_id` INTEGER NOT NULL,
    `rated_employee_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `submitted_at` DATETIME(3) NULL,
    `rating` INTEGER NULL,
    `on_time` BOOLEAN NULL,
    `answered_questions` BOOLEAN NULL,
    `property_as_described` BOOLEAN NULL,
    `comment` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SiteVisitFeedback_expires_at_idx`(`expires_at` ASC),
    INDEX `SiteVisitFeedback_rated_employee_id_idx`(`rated_employee_id` ASC),
    UNIQUE INDEX `SiteVisitFeedback_site_visit_id_key`(`site_visit_id` ASC),
    UNIQUE INDEX `SiteVisitFeedback_token_hash_key`(`token_hash` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebAuthnCredential` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `credential_id` VARCHAR(191) NOT NULL,
    `public_key` TEXT NOT NULL,
    `counter` INTEGER NOT NULL DEFAULT 0,
    `device_label` VARCHAR(191) NULL,
    `transports` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NULL,

    UNIQUE INDEX `WebAuthnCredential_credential_id_key`(`credential_id` ASC),
    INDEX `WebAuthnCredential_employee_id_idx`(`employee_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebsiteAccount` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `full_name` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `token_version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WebsiteAccount_company_id_email_key`(`company_id` ASC, `email` ASC),
    INDEX `WebsiteAccount_company_id_idx`(`company_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebsiteActivityEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `account_id` INTEGER NULL,
    `anonymous_id` VARCHAR(191) NULL,
    `event_name` VARCHAR(191) NOT NULL,
    `page` VARCHAR(191) NULL,
    `property_id` INTEGER NULL,
    `project_id` INTEGER NULL,
    `search_context` LONGTEXT NULL,
    `metadata` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebsiteActivityEvent_account_id_idx`(`account_id` ASC),
    INDEX `WebsiteActivityEvent_anonymous_id_idx`(`anonymous_id` ASC),
    INDEX `WebsiteActivityEvent_company_id_created_at_idx`(`company_id` ASC, `created_at` ASC),
    INDEX `WebsiteActivityEvent_event_name_idx`(`event_name` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebsiteCompareItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebsiteCompareItem_account_id_idx`(`account_id` ASC),
    UNIQUE INDEX `WebsiteCompareItem_account_id_project_unit_id_key`(`account_id` ASC, `project_unit_id` ASC),
    UNIQUE INDEX `WebsiteCompareItem_account_id_property_id_key`(`account_id` ASC, `property_id` ASC),
    INDEX `WebsiteCompareItem_project_unit_id_fkey`(`project_unit_id` ASC),
    INDEX `WebsiteCompareItem_property_id_fkey`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebsiteShortlistItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebsiteShortlistItem_account_id_idx`(`account_id` ASC),
    UNIQUE INDEX `WebsiteShortlistItem_account_id_project_unit_id_key`(`account_id` ASC, `project_unit_id` ASC),
    UNIQUE INDEX `WebsiteShortlistItem_account_id_property_id_key`(`account_id` ASC, `property_id` ASC),
    INDEX `WebsiteShortlistItem_project_unit_id_fkey`(`project_unit_id` ASC),
    INDEX `WebsiteShortlistItem_property_id_fkey`(`property_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `AttendanceLog_employee_id_check_in_at_idx` ON `AttendanceLog`(`employee_id` ASC, `check_in_at` ASC);

-- CreateIndex
CREATE INDEX `AttendanceLog_employee_id_check_out_at_idx` ON `AttendanceLog`(`employee_id` ASC, `check_out_at` ASC);

-- CreateIndex
CREATE INDEX `AttendanceLog_employee_id_idx` ON `AttendanceLog`(`employee_id` ASC);

-- CreateIndex
CREATE INDEX `Booking_form_status_idx` ON `Booking`(`form_status` ASC);

-- CreateIndex
CREATE INDEX `Booking_form_submitted_by_id_fkey` ON `Booking`(`form_submitted_by_id` ASC);

-- CreateIndex
CREATE INDEX `Booking_is_legacy_idx` ON `Booking`(`is_legacy` ASC);

-- CreateIndex
CREATE INDEX `Booking_md_approved_by_id_fkey` ON `Booking`(`md_approved_by_id` ASC);

-- CreateIndex
CREATE INDEX `Booking_project_unit_id_idx` ON `Booking`(`project_unit_id` ASC);

-- CreateIndex
CREATE INDEX `Complaint_assigned_employee_id_idx` ON `Complaint`(`assigned_employee_id` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `Complaint_complaint_code_key` ON `Complaint`(`complaint_code` ASC);

-- CreateIndex
CREATE INDEX `Complaint_created_at_idx` ON `Complaint`(`created_at` ASC);

-- CreateIndex
CREATE INDEX `Complaint_priority_idx` ON `Complaint`(`priority` ASC);

-- CreateIndex
CREATE INDEX `Complaint_project_unit_id_fkey` ON `Complaint`(`project_unit_id` ASC);

-- CreateIndex
CREATE INDEX `Complaint_status_idx` ON `Complaint`(`status` ASC);

-- CreateIndex
CREATE INDEX `Customer_kyc_status_idx` ON `Customer`(`kyc_status` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `Customer_origin_lead_id_key` ON `Customer`(`origin_lead_id` ASC);

-- CreateIndex
CREATE INDEX `CustomerNotification_company_id_customer_id_created_at_idx` ON `CustomerNotification`(`company_id` ASC, `customer_id` ASC, `created_at` ASC);

-- CreateIndex
CREATE INDEX `CustomerNotification_company_id_idx` ON `CustomerNotification`(`company_id` ASC);

-- CreateIndex
CREATE INDEX `CustomerNotification_created_at_idx` ON `CustomerNotification`(`created_at` ASC);

-- CreateIndex
CREATE INDEX `CustomerNotification_customer_id_is_read_idx` ON `CustomerNotification`(`customer_id` ASC, `is_read` ASC);

-- CreateIndex
CREATE INDEX `CustomerNotification_is_read_idx` ON `CustomerNotification`(`is_read` ASC);

-- CreateIndex
CREATE INDEX `DailyReport_employee_id_idx` ON `DailyReport`(`employee_id` ASC);

-- CreateIndex
CREATE INDEX `DailyTarget_company_id_fkey` ON `DailyTarget`(`company_id` ASC);

-- CreateIndex
CREATE INDEX `DailyTarget_employee_id_idx` ON `DailyTarget`(`employee_id` ASC);

-- CreateIndex
CREATE INDEX `DailyTarget_role_name_idx` ON `DailyTarget`(`role_name` ASC);

-- CreateIndex
CREATE INDEX `Employee_company_id_created_at_idx` ON `Employee`(`company_id` ASC, `created_at` ASC);

-- CreateIndex
CREATE INDEX `Employee_email_idx` ON `Employee`(`email` ASC);

-- CreateIndex
CREATE INDEX `Employee_phone_idx` ON `Employee`(`phone` ASC);

-- CreateIndex
CREATE INDEX `EmployeePermissionOverride_permission_id_fkey` ON `EmployeePermissionOverride`(`permission_id` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `EmployeeQrCode_qr_token_key` ON `EmployeeQrCode`(`qr_token` ASC);

-- CreateIndex
CREATE INDEX `EmployeeRole_role_id_fkey` ON `EmployeeRole`(`role_id` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `Installment_booking_id_installment_number_key` ON `Installment`(`booking_id` ASC, `installment_number` ASC);

-- CreateIndex
CREATE INDEX `Installment_recorded_by_id_fkey` ON `Installment`(`recorded_by_id` ASC);

-- CreateIndex
CREATE INDEX `Installment_status_idx` ON `Installment`(`status` ASC);

-- CreateIndex
CREATE INDEX `Lead_company_id_created_at_idx` ON `Lead`(`company_id` ASC, `created_at` ASC);

-- CreateIndex
CREATE INDEX `Lead_created_by_id_fkey` ON `Lead`(`created_by_id` ASC);

-- CreateIndex
CREATE INDEX `Lead_email_idx` ON `Lead`(`email` ASC);

-- CreateIndex
CREATE INDEX `Lead_introduced_by_id_fkey` ON `Lead`(`introduced_by_id` ASC);

-- CreateIndex
CREATE INDEX `Lead_phone_idx` ON `Lead`(`phone` ASC);

-- CreateIndex
CREATE INDEX `Lead_previous_lead_id_fkey` ON `Lead`(`previous_lead_id` ASC);

-- CreateIndex
CREATE INDEX `Lead_project_id_fkey` ON `Lead`(`project_id` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `LeadMatchingRequirement_lead_id_key` ON `LeadMatchingRequirement`(`lead_id` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `LeadPropertyInterest_lead_id_project_unit_id_key` ON `LeadPropertyInterest`(`lead_id` ASC, `project_unit_id` ASC);

-- CreateIndex
CREATE INDEX `LeadPropertyInterest_project_unit_id_idx` ON `LeadPropertyInterest`(`project_unit_id` ASC);

-- CreateIndex
CREATE INDEX `MessageTemplate_is_active_idx` ON `MessageTemplate`(`is_active` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `Opportunity_booking_id_key` ON `Opportunity`(`booking_id` ASC);

-- CreateIndex
CREATE INDEX `Opportunity_branch_id_idx` ON `Opportunity`(`branch_id` ASC);

-- CreateIndex
CREATE INDEX `Opportunity_created_at_idx` ON `Opportunity`(`created_at` ASC);

-- CreateIndex
CREATE INDEX `Opportunity_owner_id_idx` ON `Opportunity`(`owner_id` ASC);

-- CreateIndex
CREATE INDEX `Opportunity_project_id_idx` ON `Opportunity`(`project_id` ASC);

-- CreateIndex
CREATE INDEX `Opportunity_project_unit_id_fkey` ON `Opportunity`(`project_unit_id` ASC);

-- CreateIndex
CREATE INDEX `Opportunity_property_id_idx` ON `Opportunity`(`property_id` ASC);

-- CreateIndex
CREATE INDEX `Payment_portal_payment_id_idx` ON `Payment`(`portal_payment_id` ASC);

-- CreateIndex
CREATE INDEX `Payment_recorded_by_id_fkey` ON `Payment`(`recorded_by_id` ASC);

-- CreateIndex
CREATE INDEX `Payment_status_idx` ON `Payment`(`status` ASC);

-- CreateIndex
CREATE INDEX `Project_city_idx` ON `Project`(`city` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `Project_company_id_slug_key` ON `Project`(`company_id` ASC, `slug` ASC);

-- CreateIndex
CREATE INDEX `Project_project_type_idx` ON `Project`(`project_type` ASC);

-- CreateIndex
CREATE INDEX `Project_verified_by_id_fkey` ON `Project`(`verified_by_id` ASC);

-- CreateIndex
CREATE INDEX `Property_brand_type_idx` ON `Property`(`brand_type` ASC);

-- CreateIndex
CREATE INDEX `Property_category_idx` ON `Property`(`category` ASC);

-- CreateIndex
CREATE INDEX `Property_city_idx` ON `Property`(`city` ASC);

-- CreateIndex
CREATE INDEX `Property_company_id_created_at_idx` ON `Property`(`company_id` ASC, `created_at` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `Property_company_id_slug_key` ON `Property`(`company_id` ASC, `slug` ASC);

-- CreateIndex
CREATE INDEX `Property_digital_marketing_executive_id_idx` ON `Property`(`digital_marketing_executive_id` ASC);

-- CreateIndex
CREATE INDEX `Property_final_price_idx` ON `Property`(`final_price` ASC);

-- CreateIndex
CREATE INDEX `Property_listing_type_idx` ON `Property`(`listing_type` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `Property_locked_by_booking_id_key` ON `Property`(`locked_by_booking_id` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `PropertyLayoutRegion_layout_image_id_project_unit_id_key` ON `PropertyLayoutRegion`(`layout_image_id` ASC, `project_unit_id` ASC);

-- CreateIndex
CREATE INDEX `PropertyLayoutRegion_project_unit_id_idx` ON `PropertyLayoutRegion`(`project_unit_id` ASC);

-- CreateIndex
CREATE INDEX `SiteVisitBooking_assigned_agent_id_idx` ON `SiteVisitBooking`(`assigned_agent_id` ASC);

-- CreateIndex
CREATE INDEX `SiteVisitBooking_cancellation_confirmed_by_pm_id_fkey` ON `SiteVisitBooking`(`cancellation_confirmed_by_pm_id` ASC);

-- CreateIndex
CREATE INDEX `SiteVisitBooking_opportunity_id_idx` ON `SiteVisitBooking`(`opportunity_id` ASC);

-- CreateIndex
CREATE INDEX `SiteVisitBooking_project_manager_id_idx` ON `SiteVisitBooking`(`project_manager_id` ASC);

-- CreateIndex
CREATE INDEX `SiteVisitBooking_project_unit_id_fkey` ON `SiteVisitBooking`(`project_unit_id` ASC);

-- CreateIndex
CREATE INDEX `SiteVisitBooking_telecaller_id_idx` ON `SiteVisitBooking`(`telecaller_id` ASC);

-- CreateIndex
CREATE INDEX `SiteVisitProperty_project_unit_id_idx` ON `SiteVisitProperty`(`project_unit_id` ASC);

-- CreateIndex
CREATE UNIQUE INDEX `SiteVisitProperty_visit_id_project_unit_id_key` ON `SiteVisitProperty`(`visit_id` ASC, `project_unit_id` ASC);

-- CreateIndex
CREATE INDEX `Task_assignee_id_idx` ON `Task`(`assignee_id` ASC);

-- CreateIndex
CREATE INDEX `Task_lead_id_idx` ON `Task`(`lead_id` ASC);

-- CreateIndex
CREATE INDEX `Task_opportunity_id_idx` ON `Task`(`opportunity_id` ASC);

-- AddForeignKey
ALTER TABLE `Amenity` ADD CONSTRAINT `Amenity_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceLog` ADD CONSTRAINT `AttendanceLog_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthSession` ADD CONSTRAINT `AuthSession_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_form_submitted_by_id_fkey` FOREIGN KEY (`form_submitted_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_md_approved_by_id_fkey` FOREIGN KEY (`md_approved_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingPortalMapping` ADD CONSTRAINT `BookingPortalMapping_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompanyHoliday` ADD CONSTRAINT `CompanyHoliday_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_assigned_employee_id_fkey` FOREIGN KEY (`assigned_employee_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerNotification` ADD CONSTRAINT `CustomerNotification_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerNotification` ADD CONSTRAINT `CustomerNotification_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyReport` ADD CONSTRAINT `DailyReport_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyTarget` ADD CONSTRAINT `DailyTarget_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyTarget` ADD CONSTRAINT `DailyTarget_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Demo` ADD CONSTRAINT `Demo_handler_id_fkey` FOREIGN KEY (`handler_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Demo` ADD CONSTRAINT `Demo_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DemoInterestedProperty` ADD CONSTRAINT `DemoInterestedProperty_demo_id_fkey` FOREIGN KEY (`demo_id`) REFERENCES `Demo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DemoInterestedProperty` ADD CONSTRAINT `DemoInterestedProperty_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DemoInterestedProperty` ADD CONSTRAINT `DemoInterestedProperty_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeBranch` ADD CONSTRAINT `EmployeeBranch_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeBranch` ADD CONSTRAINT `EmployeeBranch_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeePermissionOverride` ADD CONSTRAINT `EmployeePermissionOverride_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeePermissionOverride` ADD CONSTRAINT `EmployeePermissionOverride_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeQrCode` ADD CONSTRAINT `EmployeeQrCode_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeRole` ADD CONSTRAINT `EmployeeRole_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeRole` ADD CONSTRAINT `EmployeeRole_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRefund` ADD CONSTRAINT `ExpenseRefund_accountant_id_fkey` FOREIGN KEY (`accountant_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRefund` ADD CONSTRAINT `ExpenseRefund_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRefund` ADD CONSTRAINT `ExpenseRefund_md_id_fkey` FOREIGN KEY (`md_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRefund` ADD CONSTRAINT `ExpenseRefund_refunded_by_fkey` FOREIGN KEY (`refunded_by`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Installment` ADD CONSTRAINT `Installment_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IntegrationEvent` ADD CONSTRAINT `IntegrationEvent_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryFeature` ADD CONSTRAINT `InventoryFeature_amenity_id_fkey` FOREIGN KEY (`amenity_id`) REFERENCES `Amenity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryFeature` ADD CONSTRAINT `InventoryFeature_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryFeature` ADD CONSTRAINT `InventoryFeature_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KioskCredential` ADD CONSTRAINT `KioskCredential_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KioskCredential` ADD CONSTRAINT `KioskCredential_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KioskCredential` ADD CONSTRAINT `KioskCredential_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_introduced_by_id_fkey` FOREIGN KEY (`introduced_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_previous_lead_id_fkey` FOREIGN KEY (`previous_lead_id`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadActivity` ADD CONSTRAINT `LeadActivity_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadActivity` ADD CONSTRAINT `LeadActivity_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadMatchingRequirement` ADD CONSTRAINT `LeadMatchingRequirement_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadPreferredLocation` ADD CONSTRAINT `LeadPreferredLocation_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadPropertyInterest` ADD CONSTRAINT `LeadPropertyInterest_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadPropertyInterest` ADD CONSTRAINT `LeadPropertyInterest_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PerformanceSnapshot` ADD CONSTRAINT `PerformanceSnapshot_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PMLocationAssignment` ADD CONSTRAINT `PMLocationAssignment_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PMLocationAssignment` ADD CONSTRAINT `PMLocationAssignment_pm_id_fkey` FOREIGN KEY (`pm_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PMReassignmentHistory` ADD CONSTRAINT `PMReassignmentHistory_reassigned_by_pm_id_fkey` FOREIGN KEY (`reassigned_by_pm_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PMReassignmentHistory` ADD CONSTRAINT `PMReassignmentHistory_reassigned_to_pm_id_fkey` FOREIGN KEY (`reassigned_to_pm_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PMReassignmentHistory` ADD CONSTRAINT `PMReassignmentHistory_site_visit_booking_id_fkey` FOREIGN KEY (`site_visit_booking_id`) REFERENCES `SiteVisitBooking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceLine` ADD CONSTRAINT `PriceLine_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceLine` ADD CONSTRAINT `PriceLine_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceLine` ADD CONSTRAINT `PriceLine_property_rule_id_fkey` FOREIGN KEY (`property_rule_id`) REFERENCES `PropertyPricingRule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceLine` ADD CONSTRAINT `PriceLine_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `ProjectPricingRule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_verified_by_id_fkey` FOREIGN KEY (`verified_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAmenity` ADD CONSTRAINT `ProjectAmenity_amenity_id_fkey` FOREIGN KEY (`amenity_id`) REFERENCES `Amenity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAmenity` ADD CONSTRAINT `ProjectAmenity_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocument` ADD CONSTRAINT `ProjectDocument_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocument` ADD CONSTRAINT `ProjectDocument_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMedia` ADD CONSTRAINT `ProjectMedia_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMedia` ADD CONSTRAINT `ProjectMedia_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectPricingRule` ADD CONSTRAINT `ProjectPricingRule_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_locked_by_booking_id_fkey` FOREIGN KEY (`locked_by_booking_id`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_overridden_by_id_fkey` FOREIGN KEY (`overridden_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnitDocument` ADD CONSTRAINT `ProjectUnitDocument_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnitDocument` ADD CONSTRAINT `ProjectUnitDocument_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnitImage` ADD CONSTRAINT `ProjectUnitImage_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnitImage` ADD CONSTRAINT `ProjectUnitImage_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_digital_marketing_executive_id_fkey` FOREIGN KEY (`digital_marketing_executive_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyApartmentDetails` ADD CONSTRAINT `PropertyApartmentDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyCommercialOfficeDetails` ADD CONSTRAINT `PropertyCommercialOfficeDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyCommercialShopDetails` ADD CONSTRAINT `PropertyCommercialShopDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyFarmLandDetails` ADD CONSTRAINT `PropertyFarmLandDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyHouseDetails` ADD CONSTRAINT `PropertyHouseDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyImage` ADD CONSTRAINT `PropertyImage_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyLayoutRegion` ADD CONSTRAINT `PropertyLayoutRegion_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyPlotDetails` ADD CONSTRAINT `PropertyPlotDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyPricing` ADD CONSTRAINT `PropertyPricing_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyPricingRule` ADD CONSTRAINT `PropertyPricingRule_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyVerificationLog` ADD CONSTRAINT `PropertyVerificationLog_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyVillaDetails` ADD CONSTRAINT `PropertyVillaDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicApiKey` ADD CONSTRAINT `PublicApiKey_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_assigned_agent_id_fkey` FOREIGN KEY (`assigned_agent_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_cancellation_confirmed_by_pm_id_fkey` FOREIGN KEY (`cancellation_confirmed_by_pm_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `Opportunity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_project_manager_id_fkey` FOREIGN KEY (`project_manager_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_telecaller_id_fkey` FOREIGN KEY (`telecaller_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitEscalation` ADD CONSTRAINT `SiteVisitEscalation_site_visit_booking_id_fkey` FOREIGN KEY (`site_visit_booking_id`) REFERENCES `SiteVisitBooking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitFeedback` ADD CONSTRAINT `SiteVisitFeedback_rated_employee_id_fkey` FOREIGN KEY (`rated_employee_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitFeedback` ADD CONSTRAINT `SiteVisitFeedback_site_visit_id_fkey` FOREIGN KEY (`site_visit_id`) REFERENCES `SiteVisitBooking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitProperty` ADD CONSTRAINT `SiteVisitProperty_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitReassignment` ADD CONSTRAINT `SiteVisitReassignment_to_employee_id_fkey` FOREIGN KEY (`to_employee_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assignee_id_fkey` FOREIGN KEY (`assignee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `Opportunity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebAuthnCredential` ADD CONSTRAINT `WebAuthnCredential_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteAccount` ADD CONSTRAINT `WebsiteAccount_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteActivityEvent` ADD CONSTRAINT `WebsiteActivityEvent_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `WebsiteAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteActivityEvent` ADD CONSTRAINT `WebsiteActivityEvent_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteCompareItem` ADD CONSTRAINT `WebsiteCompareItem_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `WebsiteAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteCompareItem` ADD CONSTRAINT `WebsiteCompareItem_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteCompareItem` ADD CONSTRAINT `WebsiteCompareItem_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteShortlistItem` ADD CONSTRAINT `WebsiteShortlistItem_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `WebsiteAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteShortlistItem` ADD CONSTRAINT `WebsiteShortlistItem_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteShortlistItem` ADD CONSTRAINT `WebsiteShortlistItem_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RedefineIndex
CREATE INDEX `Booking_branch_id_fkey` ON `Booking`(`branch_id` ASC);
DROP INDEX `Booking_branch_id_idx` ON `Booking`;

-- RedefineIndex
CREATE UNIQUE INDEX `Booking_booking_code_key` ON `Booking`(`booking_code` ASC);
DROP INDEX `booking_code` ON `Booking`;

-- RedefineIndex
CREATE INDEX `Employee_reporting_manager_id_fkey` ON `Employee`(`reporting_manager_id` ASC);
DROP INDEX `Employee_reporting_manager_id_idx` ON `Employee`;

-- RedefineIndex
CREATE INDEX `EmployeeBranch_branch_id_fkey` ON `EmployeeBranch`(`branch_id` ASC);
DROP INDEX `EmployeeBranch_branch_id_idx` ON `EmployeeBranch`;

-- RedefineIndex
CREATE INDEX `Payment_installment_id_fkey` ON `Payment`(`installment_id` ASC);
DROP INDEX `Payment_installment_id_idx` ON `Payment`;

-- RedefineIndex
CREATE INDEX `Property_branch_id_fkey` ON `Property`(`branch_id` ASC);
DROP INDEX `Property_branch_id_idx` ON `Property`;

-- RedefineIndex
CREATE INDEX `SiteVisitBooking_property_id_fkey` ON `SiteVisitBooking`(`property_id` ASC);
DROP INDEX `SiteVisitBooking_property_id_idx` ON `SiteVisitBooking`;

-- RedefineIndex
-- No DROP INDEX here: MySQL's case-insensitive identifier matching on this
-- server treats `sitevisitbooking_project_id_fkey` (the name the diff tool
-- thought it needed to drop) as the same index as the one just created below
-- (`SiteVisitBooking_project_id_fkey`) — that index still backs the
-- `SiteVisitBooking_project_id_fkey` foreign key, so dropping it fails with
-- "needed in a foreign key constraint". Only the CREATE is needed to bring a
-- fresh database up to the same state the live databases already have.
CREATE INDEX `SiteVisitBooking_project_id_fkey` ON `SiteVisitBooking`(`project_id` ASC);

