-- CreateTable
CREATE TABLE `Company` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `property_type_group` VARCHAR(191) NOT NULL DEFAULT 'RADHA_REAL_HOMES',
    `announcement_image_url` TEXT NULL,
    `announcement_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `Company_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Branch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `Branch_company_id_idx`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Employee` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_code` VARCHAR(191) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `token_version` INTEGER NOT NULL DEFAULT 1,
    `attendance_required` BOOLEAN NOT NULL DEFAULT true,
    `first_login_done` BOOLEAN NOT NULL DEFAULT false,
    `report_required` BOOLEAN NOT NULL DEFAULT true,
    `full_name` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `secondary_phone` VARCHAR(191) NULL,
    `whatsapp_number` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `blood_group` VARCHAR(191) NULL,
    `social_links` VARCHAR(191) NULL,
    `profile_image_url` VARCHAR(191) NULL,
    `current_address` VARCHAR(191) NULL,
    `permanent_address` VARCHAR(191) NULL,
    `emergency_contact_name` VARCHAR(191) NULL,
    `emergency_contact_relation` VARCHAR(191) NULL,
    `emergency_contact_phone` VARCHAR(191) NULL,
    `pan_number` VARCHAR(191) NULL,
    `aadhaar_number` VARCHAR(191) NULL,
    `bank_name` VARCHAR(191) NULL,
    `bank_account_number` VARCHAR(191) NULL,
    `bank_ifsc` VARCHAR(191) NULL,
    `bank_branch` VARCHAR(191) NULL,
    `job_title` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `employment_type` VARCHAR(191) NULL DEFAULT 'FULL_TIME',
    `reporting_manager_id` INTEGER NULL,
    `date_of_joining` DATETIME(3) NULL,
    `salary_ctc` DOUBLE NULL,
    `background_education` VARCHAR(191) NULL,
    `resignation_date` DATETIME(3) NULL,
    `last_working_day` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `Employee_employee_code_key`(`employee_code`),
    INDEX `Employee_company_id_idx`(`company_id`),
    INDEX `Employee_branch_id_idx`(`branch_id`),
    INDEX `Employee_company_id_created_at_idx`(`company_id`, `created_at`),
    UNIQUE INDEX `Employee_company_id_phone_key`(`company_id`, `phone`),
    UNIQUE INDEX `Employee_company_id_email_key`(`company_id`, `email`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `WebAuthnCredential_credential_id_key`(`credential_id`),
    INDEX `WebAuthnCredential_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `SiteVisitFeedback_site_visit_id_key`(`site_visit_id`),
    UNIQUE INDEX `SiteVisitFeedback_token_hash_key`(`token_hash`),
    INDEX `SiteVisitFeedback_rated_employee_id_idx`(`rated_employee_id`),
    INDEX `SiteVisitFeedback_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `is_invisible` BOOLEAN NOT NULL DEFAULT false,
    `permission_history_position` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `Role_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermissionHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role_id` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `before` TEXT NOT NULL,
    `after` TEXT NOT NULL,
    `actor_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RolePermissionHistory_role_id_idx`(`role_id`),
    UNIQUE INDEX `RolePermissionHistory_role_id_seq_key`(`role_id`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,

    UNIQUE INDEX `Permission_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `role_id` INTEGER NOT NULL,
    `permission_id` INTEGER NOT NULL,

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeRole` (
    `employee_id` INTEGER NOT NULL,
    `role_id` INTEGER NOT NULL,

    PRIMARY KEY (`employee_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeBranch` (
    `employee_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,

    PRIMARY KEY (`employee_id`, `branch_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeCompanyAccess` (
    `employee_id` INTEGER NOT NULL,
    `company_id` INTEGER NOT NULL,

    PRIMARY KEY (`employee_id`, `company_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeePermissionOverride` (
    `employee_id` INTEGER NOT NULL,
    `permission_id` INTEGER NOT NULL,
    `is_granted` BOOLEAN NOT NULL,

    PRIMARY KEY (`employee_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeQrCode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `qr_token` VARCHAR(191) NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,

    UNIQUE INDEX `EmployeeQrCode_qr_token_key`(`qr_token`),
    INDEX `EmployeeQrCode_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `check_in_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `check_out_at` DATETIME(3) NULL,
    `working_duration_minutes` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'QR_SCAN',
    `branch_id` INTEGER NULL,
    `notes` VARCHAR(191) NULL,

    INDEX `AttendanceLog_employee_id_idx`(`employee_id`),
    INDEX `AttendanceLog_employee_id_check_in_at_idx`(`employee_id`, `check_in_at`),
    INDEX `AttendanceLog_employee_id_check_out_at_idx`(`employee_id`, `check_out_at`),
    PRIMARY KEY (`id`)
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

    INDEX `KioskCredential_company_id_idx`(`company_id`),
    INDEX `KioskCredential_branch_id_idx`(`branch_id`),
    INDEX `KioskCredential_created_by_id_idx`(`created_by_id`),
    UNIQUE INDEX `KioskCredential_company_id_username_key`(`company_id`, `username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceProposal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `leave_type` VARCHAR(191) NOT NULL DEFAULT 'FULL_DAY',
    `target_date` DATETIME(3) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewed_by` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
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

    INDEX `CompanyHoliday_company_id_idx`(`company_id`),
    UNIQUE INDEX `CompanyHoliday_company_id_date_key`(`company_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `assignee_id` INTEGER NOT NULL,
    `target_date` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `created_by` INTEGER NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `lead_id` INTEGER NULL,
    `opportunity_id` INTEGER NULL,
    `priority` VARCHAR(191) NOT NULL DEFAULT 'MEDIUM',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `Task_assignee_id_idx`(`assignee_id`),
    INDEX `Task_lead_id_idx`(`lead_id`),
    INDEX `Task_opportunity_id_idx`(`opportunity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `summary` VARCHAR(191) NOT NULL,
    `call_count` INTEGER NOT NULL DEFAULT 0,
    `site_visit_count` INTEGER NOT NULL DEFAULT 0,
    `closed_deal_count` INTEGER NOT NULL DEFAULT 0,
    `target_met` BOOLEAN NOT NULL DEFAULT true,
    `below_target_reason` VARCHAR(191) NULL,
    `metrics_json` JSON NULL,

    INDEX `DailyReport_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actor_id` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` INTEGER NOT NULL,
    `old_value` VARCHAR(191) NULL,
    `new_value` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_actor_id_idx`(`actor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `is_dismissed` BOOLEAN NOT NULL DEFAULT false,
    `dismissed_at` DATETIME(3) NULL,
    `entity_type` VARCHAR(191) NULL,
    `entity_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyTarget` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `role_name` VARCHAR(191) NOT NULL,
    `employee_id` INTEGER NULL,
    `target_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `calls_target` INTEGER NOT NULL DEFAULT 0,
    `site_visits_target` INTEGER NOT NULL DEFAULT 0,
    `closed_deals_target` INTEGER NOT NULL DEFAULT 0,
    `form_schema_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `DailyTarget_role_name_idx`(`role_name`),
    INDEX `DailyTarget_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PerformanceSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `snapshot_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `score` DOUBLE NOT NULL DEFAULT 50.0,
    `tasks_completed` INTEGER NOT NULL DEFAULT 0,
    `on_time_logins` INTEGER NOT NULL DEFAULT 0,
    `late_logins` INTEGER NOT NULL DEFAULT 0,
    `sub_target_reports` INTEGER NOT NULL DEFAULT 0,
    `uninformed_absences` INTEGER NOT NULL DEFAULT 0,

    INDEX `PerformanceSnapshot_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lead` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_code` VARCHAR(191) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `customer_name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'MANUAL_ENTRY',
    `ownership_type` ENUM('POOL', 'DIRECT') NOT NULL DEFAULT 'POOL',
    `status` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `assigned_to_id` INTEGER NULL,
    `assigned_at` DATETIME(3) NULL,
    `assignment_type` VARCHAR(191) NULL,
    `property_type_preference` VARCHAR(191) NULL,
    `budget_min` DOUBLE NULL,
    `budget_max` DOUBLE NULL,
    `preferred_location` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_by_id` INTEGER NULL,
    `introduced_by_id` INTEGER NULL,
    `last_contacted_at` DATETIME(3) NULL,
    `campaign` VARCHAR(191) NULL,
    `utm_source` VARCHAR(191) NULL,
    `utm_medium` VARCHAR(191) NULL,
    `utm_campaign` VARCHAR(191) NULL,
    `lead_score` INTEGER NOT NULL DEFAULT 0,
    `sla_breach_at` DATETIME(3) NULL,
    `referral_person_name` VARCHAR(191) NULL,
    `referral_employee_id` INTEGER NULL,
    `previous_lead_id` INTEGER NULL,
    `external_agent_name` VARCHAR(191) NULL,
    `external_agent_phone` VARCHAR(191) NULL,
    `external_agent_associate_id` VARCHAR(191) NULL,
    `external_agent_company` VARCHAR(191) NULL,
    `project_id` INTEGER NULL,
    `enquiry_type` VARCHAR(191) NULL,
    `preferred_contact_time` VARCHAR(191) NULL,
    `property_ids` JSON NULL,
    `exit_reason` ENUM('NO_MATCHING_INVENTORY', 'CHOSE_COMPETITOR', 'BUDGET_MISMATCH', 'NOT_READY', 'DO_NOT_CONTACT', 'UNRESPONSIVE', 'INVALID_CONTACT', 'DUPLICATE_LEAD', 'FINANCING_ISSUE', 'LOCATION_MISMATCH', 'ALREADY_PURCHASED', 'JUST_ENQUIRING', 'SITE_VISIT_NO_SHOW', 'NEGOTIATION_FAILED', 'OUT_OF_SERVICE_AREA', 'OTHER') NULL,
    `exit_reason_detail` VARCHAR(191) NULL,
    `exited_from_status` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Lead_lead_code_key`(`lead_code`),
    INDEX `Lead_company_id_idx`(`company_id`),
    INDEX `Lead_branch_id_idx`(`branch_id`),
    INDEX `Lead_assigned_to_id_idx`(`assigned_to_id`),
    INDEX `Lead_status_idx`(`status`),
    INDEX `Lead_company_id_created_at_idx`(`company_id`, `created_at`),
    INDEX `Lead_phone_idx`(`phone`),
    INDEX `Lead_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadPreferredLocation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LeadPreferredLocation_lead_id_idx`(`lead_id`),
    UNIQUE INDEX `LeadPreferredLocation_lead_id_location_key`(`lead_id`, `location`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadActivity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `actor_id` INTEGER NOT NULL,
    `activity_type` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LeadActivity_lead_id_idx`(`lead_id`),
    INDEX `LeadActivity_actor_id_idx`(`actor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadMatchingRequirement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `property_type` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `max_budget` DOUBLE NOT NULL,
    `min_bedrooms` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LeadMatchingRequirement_lead_id_key`(`lead_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadPropertyInterest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LeadPropertyInterest_property_id_idx`(`property_id`),
    INDEX `LeadPropertyInterest_project_unit_id_idx`(`project_unit_id`),
    INDEX `LeadPropertyInterest_created_by_idx`(`created_by`),
    UNIQUE INDEX `LeadPropertyInterest_lead_id_property_id_key`(`lead_id`, `property_id`),
    UNIQUE INDEX `LeadPropertyInterest_lead_id_project_unit_id_key`(`lead_id`, `project_unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_code` VARCHAR(191) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `project_type` ENUM('PLOTTED', 'APARTMENT', 'VILLA', 'INDEPENDENT_HOUSE', 'ROW_HOUSE', 'AGRICULTURAL_LAND', 'FARM_HOUSE', 'COMMERCIAL_SHOP', 'COMMERCIAL_OFFICE', 'MIXED_RESIDENTIAL', 'MIXED_USE', 'TOWNSHIP', 'GATED_COMMUNITY', 'MIXED', 'COMMERCIAL', 'OTHER') NULL,
    `developer_name` VARCHAR(191) NULL,
    `location` VARCHAR(191) NOT NULL,
    `total_area` VARCHAR(191) NULL,
    `total_units` INTEGER NULL,
    `launch_date` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PLANNING',
    `project_phase` VARCHAR(191) NULL,
    `rera_number` VARCHAR(191) NULL,
    `amenities` JSON NULL,
    `assigned_pm_id` INTEGER NULL,
    `slug` VARCHAR(191) NOT NULL,
    `total_area_value` DOUBLE NULL,
    `total_area_unit` ENUM('SQFT', 'SQYD', 'SQM', 'ACRE', 'GUNTA', 'CENT', 'ANKANAM', 'HECTARE') NULL,
    `towers_count` INTEGER NULL,
    `blocks_count` INTEGER NULL,
    `floors_count` INTEGER NULL,
    `completion_date` DATETIME(3) NULL,
    `rera_status` VARCHAR(191) NULL,
    `approval_authority` VARCHAR(191) NULL,
    `approval_authorities` JSON NULL,
    `approval_number` VARCHAR(191) NULL,
    `lp_number` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `mandal` VARCHAR(191) NULL,
    `village` VARCHAR(191) NULL,
    `locality` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `pincode` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `maps_link` TEXT NULL,
    `default_price_basis` ENUM('CARPET', 'BUILT_UP', 'SUPER_BUILT_UP', 'PLOT_AREA', 'LUMPSUM') NULL,
    `default_area_unit` ENUM('SQFT', 'SQYD', 'SQM', 'ACRE', 'GUNTA', 'CENT', 'ANKANAM', 'HECTARE') NULL,
    `cover_image_url` TEXT NULL,
    `is_published` BOOLEAN NOT NULL DEFAULT false,
    `verification_status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `verified_by_id` INTEGER NULL,
    `verified_at` DATETIME(3) NULL,
    `verification_notes` TEXT NULL,
    `created_by_id` INTEGER NULL,
    `digital_marketing_executive_id` INTEGER NULL,
    `seo_title` VARCHAR(191) NULL,
    `seo_keywords` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Project_project_code_key`(`project_code`),
    INDEX `Project_company_id_idx`(`company_id`),
    INDEX `Project_branch_id_idx`(`branch_id`),
    INDEX `Project_assigned_pm_id_idx`(`assigned_pm_id`),
    INDEX `Project_project_type_idx`(`project_type`),
    INDEX `Project_city_idx`(`city`),
    INDEX `Project_digital_marketing_executive_id_idx`(`digital_marketing_executive_id`),
    UNIQUE INDEX `Project_company_id_slug_key`(`company_id`, `slug`),
    PRIMARY KEY (`id`)
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
    `listing_type` VARCHAR(191) NULL,
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
    `selected_optional_rule_ids` JSON NULL,
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

    UNIQUE INDEX `ProjectUnit_unit_code_key`(`unit_code`),
    UNIQUE INDEX `ProjectUnit_locked_by_booking_id_key`(`locked_by_booking_id`),
    INDEX `ProjectUnit_project_id_sales_status_idx`(`project_id`, `sales_status`),
    INDEX `ProjectUnit_project_id_unit_type_idx`(`project_id`, `unit_type`),
    INDEX `ProjectUnit_project_id_tower_floor_idx`(`project_id`, `tower`, `floor`),
    INDEX `ProjectUnit_project_id_bhk_idx`(`project_id`, `bhk`),
    INDEX `ProjectUnit_company_id_idx`(`company_id`),
    INDEX `ProjectUnit_final_price_idx`(`final_price`),
    INDEX `ProjectUnit_area_sqft_idx`(`area_sqft`),
    PRIMARY KEY (`id`)
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

    INDEX `ProjectPricingRule_project_id_kind_idx`(`project_id`, `kind`),
    INDEX `ProjectPricingRule_project_id_is_active_idx`(`project_id`, `is_active`),
    PRIMARY KEY (`id`)
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

    INDEX `PropertyPricingRule_property_id_kind_idx`(`property_id`, `kind`),
    INDEX `PropertyPricingRule_property_id_is_active_idx`(`property_id`, `is_active`),
    PRIMARY KEY (`id`)
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

    INDEX `PriceLine_project_unit_id_idx`(`project_unit_id`),
    INDEX `PriceLine_property_id_idx`(`property_id`),
    INDEX `PriceLine_rule_id_idx`(`rule_id`),
    INDEX `PriceLine_property_rule_id_idx`(`property_rule_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

    INDEX `Amenity_company_id_idx`(`company_id`),
    UNIQUE INDEX `Amenity_company_id_name_key`(`company_id`, `name`),
    PRIMARY KEY (`id`)
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

    INDEX `ProjectAmenity_project_id_idx`(`project_id`),
    UNIQUE INDEX `ProjectAmenity_project_id_amenity_id_key`(`project_id`, `amenity_id`),
    PRIMARY KEY (`id`)
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

    INDEX `InventoryFeature_project_unit_id_idx`(`project_unit_id`),
    INDEX `InventoryFeature_property_id_idx`(`property_id`),
    PRIMARY KEY (`id`)
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

    INDEX `ProjectMedia_project_id_kind_idx`(`project_id`, `kind`),
    PRIMARY KEY (`id`)
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

    INDEX `ProjectDocument_project_id_kind_idx`(`project_id`, `kind`),
    PRIMARY KEY (`id`)
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

    INDEX `ProjectUnitImage_project_unit_id_idx`(`project_unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectUnitDocument` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_unit_id` INTEGER NOT NULL,
    `url` TEXT NOT NULL,
    `title` VARCHAR(191) NULL,
    `uploaded_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectUnitDocument_project_unit_id_idx`(`project_unit_id`),
    PRIMARY KEY (`id`)
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

    INDEX `WebsiteAccount_company_id_idx`(`company_id`),
    UNIQUE INDEX `WebsiteAccount_company_id_email_key`(`company_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebsiteShortlistItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebsiteShortlistItem_account_id_idx`(`account_id`),
    UNIQUE INDEX `WebsiteShortlistItem_account_id_property_id_key`(`account_id`, `property_id`),
    UNIQUE INDEX `WebsiteShortlistItem_account_id_project_unit_id_key`(`account_id`, `project_unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebsiteCompareItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebsiteCompareItem_account_id_idx`(`account_id`),
    UNIQUE INDEX `WebsiteCompareItem_account_id_property_id_key`(`account_id`, `property_id`),
    UNIQUE INDEX `WebsiteCompareItem_account_id_project_unit_id_key`(`account_id`, `project_unit_id`),
    PRIMARY KEY (`id`)
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
    `search_context` JSON NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebsiteActivityEvent_company_id_created_at_idx`(`company_id`, `created_at`),
    INDEX `WebsiteActivityEvent_account_id_idx`(`account_id`),
    INDEX `WebsiteActivityEvent_anonymous_id_idx`(`anonymous_id`),
    INDEX `WebsiteActivityEvent_event_name_idx`(`event_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectLayoutImage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `image_url` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `uploaded_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ProjectLayoutImage_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyLayoutRegion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `layout_image_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `PropertyLayoutRegion_property_id_idx`(`property_id`),
    INDEX `PropertyLayoutRegion_project_unit_id_idx`(`project_unit_id`),
    UNIQUE INDEX `PropertyLayoutRegion_layout_image_id_property_id_key`(`layout_image_id`, `property_id`),
    UNIQUE INDEX `PropertyLayoutRegion_layout_image_id_project_unit_id_key`(`layout_image_id`, `project_unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Property` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_code` VARCHAR(191) NOT NULL,
    `project_id` INTEGER NULL,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `brand_type` VARCHAR(191) NOT NULL DEFAULT 'SONTHILLU',
    `category` VARCHAR(191) NOT NULL DEFAULT 'VILLA',
    `area_sqft` DOUBLE NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `address` TEXT NULL,
    `bedrooms` INTEGER NULL,
    `bathrooms` INTEGER NULL,
    `facing` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_VERIFICATION',
    `assigned_pm_id` INTEGER NULL,
    `digital_marketing_executive_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `verified_by_pm_at` DATETIME(3) NULL,
    `location_confirmed_by_pm` BOOLEAN NOT NULL DEFAULT false,
    `dm_polished_at` DATETIME(3) NULL,
    `md_approved_at` DATETIME(3) NULL,
    `rejection_reason` TEXT NULL,
    `seo_title` VARCHAR(191) NULL,
    `seo_keywords` VARCHAR(191) NULL,
    `amenities` TEXT NULL,
    `state` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `locality` VARCHAR(191) NULL,
    `pincode` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `listing_type` VARCHAR(191) NULL DEFAULT 'NEW',
    `possession_status` VARCHAR(191) NULL,
    `slug` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'INTERNAL',
    `sales_status` ENUM('AVAILABLE', 'HOLD', 'RESERVED', 'BOOKED', 'SOLD', 'BLOCKED', 'UNAVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
    `hold_until` DATETIME(3) NULL,
    `held_for_lead_id` INTEGER NULL,
    `area_value` DOUBLE NULL,
    `area_unit` ENUM('SQFT', 'SQYD', 'SQM', 'ACRE', 'GUNTA', 'CENT', 'ANKANAM', 'HECTARE') NULL,
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
    `construction_year` INTEGER NULL,
    `price_basis` ENUM('CARPET', 'BUILT_UP', 'SUPER_BUILT_UP', 'PLOT_AREA', 'LUMPSUM') NOT NULL DEFAULT 'SUPER_BUILT_UP',
    `view` VARCHAR(191) NULL,
    `road_width_ft` DOUBLE NULL,
    `is_corner` BOOLEAN NOT NULL DEFAULT false,
    `is_park_facing` BOOLEAN NOT NULL DEFAULT false,
    `is_road_facing` BOOLEAN NOT NULL DEFAULT false,
    `is_main_road_facing` BOOLEAN NOT NULL DEFAULT false,
    `is_premium_location` BOOLEAN NOT NULL DEFAULT false,
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
    `locked_until` DATETIME(3) NULL,
    `locked_by_booking_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Property_property_code_key`(`property_code`),
    UNIQUE INDEX `Property_locked_by_booking_id_key`(`locked_by_booking_id`),
    INDEX `Property_company_id_idx`(`company_id`),
    INDEX `Property_project_id_idx`(`project_id`),
    INDEX `Property_brand_type_idx`(`brand_type`),
    INDEX `Property_status_idx`(`status`),
    INDEX `Property_assigned_pm_id_idx`(`assigned_pm_id`),
    INDEX `Property_city_idx`(`city`),
    INDEX `Property_listing_type_idx`(`listing_type`),
    INDEX `Property_digital_marketing_executive_id_idx`(`digital_marketing_executive_id`),
    INDEX `Property_company_id_created_at_idx`(`company_id`, `created_at`),
    INDEX `Property_final_price_idx`(`final_price`),
    INDEX `Property_category_idx`(`category`),
    UNIQUE INDEX `Property_company_id_slug_key`(`company_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyImage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `image_url` VARCHAR(191) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `uploaded_by_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `alt_text` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PropertyImage_property_id_idx`(`property_id`),
    INDEX `PropertyImage_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyPublication` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `company_id` INTEGER NOT NULL,
    `is_published` BOOLEAN NOT NULL DEFAULT false,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `PropertyPublication_company_id_idx`(`company_id`),
    INDEX `PropertyPublication_property_id_idx`(`property_id`),
    UNIQUE INDEX `PropertyPublication_property_id_company_id_key`(`property_id`, `company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyVerificationLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `actor_id` INTEGER NOT NULL,
    `from_status` VARCHAR(191) NOT NULL,
    `to_status` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PropertyVerificationLog_property_id_idx`(`property_id`),
    INDEX `PropertyVerificationLog_actor_id_idx`(`actor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteVisitBooking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_code` VARCHAR(191) NOT NULL,
    `lead_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `telecaller_id` INTEGER NOT NULL,
    `project_manager_id` INTEGER NULL,
    `assigned_agent_id` INTEGER NULL,
    `project_id` INTEGER NULL,
    `scheduled_date` DATETIME(3) NOT NULL,
    `status` ENUM('REQUESTED', 'PENDING_ACCEPTANCE', 'REASSIGNED', 'ESCALATED_TO_MARKETING_DIRECTOR', 'ACCEPTED', 'PENDING_CUSTOMER_RECONFIRMATION', 'RESCHEDULE_REQUESTED', 'PENDING_PM_RECONFIRMATION', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ON_HOLD', 'CANCELLATION_PENDING_PM_CONFIRMATION') NOT NULL DEFAULT 'REQUESTED',
    `cancellation_reason` TEXT NULL,
    `cancellation_confirmed_by_pm_id` INTEGER NULL,
    `verification_call_notes` TEXT NULL,
    `feedback_notes` TEXT NULL,
    `rating` VARCHAR(191) NULL,
    `proof_photo_url` VARCHAR(191) NULL,
    `completed_at` DATETIME(3) NULL,
    `opportunity_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SiteVisitBooking_booking_code_key`(`booking_code`),
    INDEX `SiteVisitBooking_lead_id_idx`(`lead_id`),
    INDEX `SiteVisitBooking_opportunity_id_idx`(`opportunity_id`),
    INDEX `SiteVisitBooking_telecaller_id_idx`(`telecaller_id`),
    INDEX `SiteVisitBooking_project_manager_id_idx`(`project_manager_id`),
    INDEX `SiteVisitBooking_assigned_agent_id_idx`(`assigned_agent_id`),
    INDEX `SiteVisitBooking_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteVisitProperty` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `visit_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `outcome` VARCHAR(191) NULL,
    `outcome_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `SiteVisitProperty_visit_id_idx`(`visit_id`),
    INDEX `SiteVisitProperty_property_id_idx`(`property_id`),
    INDEX `SiteVisitProperty_project_unit_id_idx`(`project_unit_id`),
    UNIQUE INDEX `SiteVisitProperty_visit_id_property_id_key`(`visit_id`, `property_id`),
    UNIQUE INDEX `SiteVisitProperty_visit_id_project_unit_id_key`(`visit_id`, `project_unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteVisitReassignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `visit_id` INTEGER NOT NULL,
    `from_employee_id` INTEGER NULL,
    `to_employee_id` INTEGER NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SiteVisitReassignment_visit_id_idx`(`visit_id`),
    INDEX `SiteVisitReassignment_from_employee_id_idx`(`from_employee_id`),
    INDEX `SiteVisitReassignment_to_employee_id_idx`(`to_employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageTemplate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `body_text` TEXT NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MessageTemplate_template_key_key`(`template_key`),
    INDEX `MessageTemplate_template_key_idx`(`template_key`),
    INDEX `MessageTemplate_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
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

    INDEX `ExpenseRefund_employee_id_idx`(`employee_id`),
    INDEX `ExpenseRefund_status_idx`(`status`),
    INDEX `ExpenseRefund_company_id_idx`(`company_id`),
    PRIMARY KEY (`id`)
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

    INDEX `PushSubscription_employee_id_idx`(`employee_id`),
    UNIQUE INDEX `PushSubscription_employee_id_endpoint_key`(`employee_id`, `endpoint`(200)),
    PRIMARY KEY (`id`)
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

    INDEX `AuthSession_employee_id_idx`(`employee_id`),
    INDEX `AuthSession_family_token_idx`(`family_token`),
    INDEX `AuthSession_refresh_token_hash_idx`(`refresh_token_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Complaint` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `complaint_code` VARCHAR(191) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `booking_id` INTEGER NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `priority` VARCHAR(191) NOT NULL DEFAULT 'MEDIUM',
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `assigned_employee_id` INTEGER NULL,
    `resolution_description` VARCHAR(191) NULL,
    `resolved_by` INTEGER NULL,
    `resolved_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `closure_reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Complaint_complaint_code_key`(`complaint_code`),
    INDEX `Complaint_company_id_idx`(`company_id`),
    INDEX `Complaint_customer_id_idx`(`customer_id`),
    INDEX `Complaint_booking_id_idx`(`booking_id`),
    INDEX `Complaint_property_id_idx`(`property_id`),
    INDEX `Complaint_status_idx`(`status`),
    INDEX `Complaint_priority_idx`(`priority`),
    INDEX `Complaint_assigned_employee_id_idx`(`assigned_employee_id`),
    INDEX `Complaint_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_code` VARCHAR(191) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `first_name` VARCHAR(191) NOT NULL,
    `last_name` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `temp_password_expiry` DATETIME(3) NULL,
    `force_password_reset` BOOLEAN NOT NULL DEFAULT false,
    `password_hash` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `source` VARCHAR(191) NOT NULL DEFAULT 'MANUAL_ENTRY',
    `campaign` VARCHAR(191) NULL,
    `utm_source` VARCHAR(191) NULL,
    `utm_medium` VARCHAR(191) NULL,
    `utm_campaign` VARCHAR(191) NULL,
    `assigned_to_id` INTEGER NULL,
    `origin_lead_id` INTEGER NULL,
    `pan_number` VARCHAR(191) NULL,
    `aadhaar_number` VARCHAR(191) NULL,
    `kyc_status` VARCHAR(191) NULL,
    `kyc_verified_at` DATETIME(3) NULL,
    `kyc_rejected_reason` TEXT NULL,
    `kyc_submission_status` VARCHAR(191) NULL,
    `kyc_submitted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_customer_code_key`(`customer_code`),
    UNIQUE INDEX `Customer_origin_lead_id_key`(`origin_lead_id`),
    INDEX `Customer_company_id_idx`(`company_id`),
    INDEX `Customer_branch_id_idx`(`branch_id`),
    INDEX `Customer_assigned_to_id_idx`(`assigned_to_id`),
    INDEX `Customer_kyc_status_idx`(`kyc_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_code` VARCHAR(191) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `customer_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `assigned_employee_id` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `agreed_price` DOUBLE NOT NULL,
    `booking_amount` DOUBLE NOT NULL,
    `balance_amount` DOUBLE NOT NULL,
    `booking_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(191) NULL,
    `campaign` VARCHAR(191) NULL,
    `utm_source` VARCHAR(191) NULL,
    `utm_medium` VARCHAR(191) NULL,
    `utm_campaign` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `serial_no` VARCHAR(191) NULL,
    `plot_no` VARCHAR(191) NULL,
    `area_sqyd` DOUBLE NULL,
    `facing` VARCHAR(191) NULL,
    `price_per_sqyd` DOUBLE NULL,
    `sale_price_per_sqyd` DOUBLE NULL,
    `charges_per_sqyd` DOUBLE NULL,
    `emi_months` INTEGER NULL,
    `emi_charges` DOUBLE NULL,
    `emi_interest_rate` DOUBLE NULL,
    `total_cost` DOUBLE NULL,
    `total_cost_words` VARCHAR(191) NULL,
    `receipt_no` VARCHAR(191) NULL,
    `receipt_date` DATETIME(3) NULL,
    `booking_amount_words` VARCHAR(191) NULL,
    `referred_by` VARCHAR(191) NULL,
    `referred_by_code` VARCHAR(191) NULL,
    `form_status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `form_submitted_at` DATETIME(3) NULL,
    `form_submitted_by_id` INTEGER NULL,
    `md_approved_at` DATETIME(3) NULL,
    `md_approved_by_id` INTEGER NULL,
    `md_rejection_reason` TEXT NULL,
    `tc_accepted_at` DATETIME(3) NULL,
    `tc_accepted_by_name` VARCHAR(191) NULL,
    `is_legacy` BOOLEAN NOT NULL DEFAULT false,
    `legacy_booking_date` DATETIME(3) NULL,
    `legacy_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Booking_booking_code_key`(`booking_code`),
    INDEX `Booking_company_id_idx`(`company_id`),
    INDEX `Booking_customer_id_idx`(`customer_id`),
    INDEX `Booking_property_id_idx`(`property_id`),
    INDEX `Booking_project_unit_id_idx`(`project_unit_id`),
    INDEX `Booking_status_idx`(`status`),
    INDEX `Booking_form_status_idx`(`form_status`),
    INDEX `Booking_is_legacy_idx`(`is_legacy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payment_code` VARCHAR(191) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `booking_id` INTEGER NOT NULL,
    `installment_id` INTEGER NULL,
    `amount` DOUBLE NOT NULL,
    `payment_method` VARCHAR(191) NOT NULL,
    `reference_number` VARCHAR(191) NULL,
    `payment_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `notes` TEXT NULL,
    `portal_payment_id` VARCHAR(191) NULL,
    `external_transaction_id` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'CRM',
    `sync_status` VARCHAR(191) NOT NULL DEFAULT 'LOCAL',
    `recorded_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payment_payment_code_key`(`payment_code`),
    INDEX `Payment_company_id_idx`(`company_id`),
    INDEX `Payment_booking_id_idx`(`booking_id`),
    INDEX `Payment_status_idx`(`status`),
    INDEX `Payment_portal_payment_id_idx`(`portal_payment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Installment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_id` INTEGER NOT NULL,
    `installment_number` INTEGER NOT NULL,
    `expected_amount` DOUBLE NOT NULL,
    `received_amount` DOUBLE NOT NULL DEFAULT 0,
    `due_date` DATETIME(3) NOT NULL,
    `received_date` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `recorded_by_id` INTEGER NULL,
    `remarks` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `Installment_booking_id_idx`(`booking_id`),
    INDEX `Installment_status_idx`(`status`),
    UNIQUE INDEX `Installment_booking_id_installment_number_key`(`booking_id`, `installment_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Opportunity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `opportunity_code` VARCHAR(191) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `lead_id` INTEGER NOT NULL,
    `project_id` INTEGER NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `booking_id` INTEGER NULL,
    `expected_value` DOUBLE NULL,
    `probability` DOUBLE NULL DEFAULT 10.0,
    `budget_min` DOUBLE NULL,
    `budget_max` DOUBLE NULL,
    `expected_close_date` DATETIME(3) NULL,
    `drop_reason` TEXT NULL,
    `owner_id` INTEGER NOT NULL,
    `source` VARCHAR(191) NULL,
    `campaign` VARCHAR(191) NULL,
    `utm_source` VARCHAR(191) NULL,
    `utm_medium` VARCHAR(191) NULL,
    `utm_campaign` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Opportunity_opportunity_code_key`(`opportunity_code`),
    UNIQUE INDEX `Opportunity_booking_id_key`(`booking_id`),
    INDEX `Opportunity_company_id_idx`(`company_id`),
    INDEX `Opportunity_branch_id_idx`(`branch_id`),
    INDEX `Opportunity_owner_id_idx`(`owner_id`),
    INDEX `Opportunity_lead_id_idx`(`lead_id`),
    INDEX `Opportunity_project_id_idx`(`project_id`),
    INDEX `Opportunity_property_id_idx`(`property_id`),
    INDEX `Opportunity_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `BookingPortalMapping_crms_booking_id_key`(`crms_booking_id`),
    INDEX `BookingPortalMapping_company_id_idx`(`company_id`),
    INDEX `BookingPortalMapping_crms_booking_id_idx`(`crms_booking_id`),
    INDEX `BookingPortalMapping_crms_customer_id_idx`(`crms_customer_id`),
    INDEX `BookingPortalMapping_handoff_status_idx`(`handoff_status`),
    PRIMARY KEY (`id`)
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

    INDEX `IntegrationEvent_company_id_idx`(`company_id`),
    INDEX `IntegrationEvent_status_idx`(`status`),
    INDEX `IntegrationEvent_crms_booking_id_idx`(`crms_booking_id`),
    INDEX `IntegrationEvent_crms_customer_id_idx`(`crms_customer_id`),
    INDEX `IntegrationEvent_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerNotification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `booking_id` INTEGER NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `is_dismissed` BOOLEAN NOT NULL DEFAULT false,
    `dismissed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `CustomerNotification_company_id_idx`(`company_id`),
    INDEX `CustomerNotification_customer_id_idx`(`customer_id`),
    INDEX `CustomerNotification_is_read_idx`(`is_read`),
    INDEX `CustomerNotification_created_at_idx`(`created_at`),
    INDEX `CustomerNotification_company_id_customer_id_created_at_idx`(`company_id`, `customer_id`, `created_at`),
    INDEX `CustomerNotification_customer_id_is_read_idx`(`customer_id`, `is_read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicApiKey` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `api_key` VARCHAR(191) NOT NULL,
    `company_id` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PublicApiKey_api_key_key`(`api_key`),
    INDEX `PublicApiKey_company_id_idx`(`company_id`),
    INDEX `PublicApiKey_api_key_idx`(`api_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PMLocationAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pm_id` INTEGER NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NOT NULL DEFAULT 'CITY',
    `company_id` INTEGER NOT NULL,

    UNIQUE INDEX `PMLocationAssignment_pm_id_location_company_id_key`(`pm_id`, `location`, `company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PMReassignmentHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_visit_booking_id` INTEGER NOT NULL,
    `reassigned_by_pm_id` INTEGER NOT NULL,
    `reassigned_to_pm_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteVisitEscalation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_visit_booking_id` INTEGER NOT NULL,
    `marketing_director_notified_at` DATETIME(3) NULL,
    `managing_director_notified_at` DATETIME(3) NULL,

    UNIQUE INDEX `SiteVisitEscalation_site_visit_booking_id_key`(`site_visit_booking_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Demo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `handler_id` INTEGER NOT NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `summary` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `accepted_by` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DemoInterestedProperty` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `demo_id` INTEGER NOT NULL,
    `property_id` INTEGER NULL,
    `project_unit_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DemoInterestedProperty_project_unit_id_idx`(`project_unit_id`),
    UNIQUE INDEX `DemoInterestedProperty_demo_id_property_id_key`(`demo_id`, `property_id`),
    UNIQUE INDEX `DemoInterestedProperty_demo_id_project_unit_id_key`(`demo_id`, `project_unit_id`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `PropertyPricing_property_id_key`(`property_id`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `PropertyPlotDetails_property_id_key`(`property_id`),
    PRIMARY KEY (`id`)
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
    `has_utility_area` BOOLEAN NULL DEFAULT false,
    `carpet_area` DOUBLE NULL,
    `built_up_area` DOUBLE NULL,
    `super_built_up_area` DOUBLE NULL,
    `balcony_area` DOUBLE NULL,
    `terrace_area` DOUBLE NULL,
    `is_pool_view` BOOLEAN NULL DEFAULT false,
    `is_garden_view` BOOLEAN NULL DEFAULT false,
    `is_road_view` BOOLEAN NULL DEFAULT false,
    `is_main_road_view` BOOLEAN NULL DEFAULT false,
    `is_city_view` BOOLEAN NULL DEFAULT false,
    `is_higher_floor` BOOLEAN NULL DEFAULT false,
    `is_near_lift` BOOLEAN NULL DEFAULT false,
    `is_near_staircase` BOOLEAN NULL DEFAULT false,
    `parking_included` BOOLEAN NULL DEFAULT false,
    `parking_type` VARCHAR(191) NULL,
    `parking_slots` INTEGER NULL,
    `parking_number` VARCHAR(191) NULL,
    `is_covered_parking` BOOLEAN NULL DEFAULT false,
    `has_additional_parking` BOOLEAN NULL DEFAULT false,
    `structure_type` VARCHAR(191) NULL,
    `flooring` VARCHAR(191) NULL,
    `kitchen_type` VARCHAR(191) NULL,
    `windows` VARCHAR(191) NULL,
    `doors` VARCHAR(191) NULL,
    `electrical` VARCHAR(191) NULL,
    `plumbing` VARCHAR(191) NULL,
    `bathroom_type` VARCHAR(191) NULL,
    `paint` VARCHAR(191) NULL,
    `fixtures` VARCHAR(191) NULL,

    UNIQUE INDEX `PropertyApartmentDetails_property_id_key`(`property_id`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `PropertyVillaDetails_property_id_key`(`property_id`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `PropertyHouseDetails_property_id_key`(`property_id`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `PropertyCommercialShopDetails_property_id_key`(`property_id`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `PropertyCommercialOfficeDetails_property_id_key`(`property_id`),
    PRIMARY KEY (`id`)
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

    UNIQUE INDEX `PropertyFarmLandDetails_property_id_key`(`property_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PerformanceAdjustment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `adjuster_id` INTEGER NOT NULL,
    `points` DOUBLE NOT NULL,
    `reason` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PerformanceAdjustment_employee_id_idx`(`employee_id`),
    INDEX `PerformanceAdjustment_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_reporting_manager_id_fkey` FOREIGN KEY (`reporting_manager_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebAuthnCredential` ADD CONSTRAINT `WebAuthnCredential_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitFeedback` ADD CONSTRAINT `SiteVisitFeedback_site_visit_id_fkey` FOREIGN KEY (`site_visit_id`) REFERENCES `SiteVisitBooking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitFeedback` ADD CONSTRAINT `SiteVisitFeedback_rated_employee_id_fkey` FOREIGN KEY (`rated_employee_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermissionHistory` ADD CONSTRAINT `RolePermissionHistory_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeRole` ADD CONSTRAINT `EmployeeRole_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeRole` ADD CONSTRAINT `EmployeeRole_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeBranch` ADD CONSTRAINT `EmployeeBranch_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeBranch` ADD CONSTRAINT `EmployeeBranch_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeCompanyAccess` ADD CONSTRAINT `EmployeeCompanyAccess_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeCompanyAccess` ADD CONSTRAINT `EmployeeCompanyAccess_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeePermissionOverride` ADD CONSTRAINT `EmployeePermissionOverride_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeePermissionOverride` ADD CONSTRAINT `EmployeePermissionOverride_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeQrCode` ADD CONSTRAINT `EmployeeQrCode_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceLog` ADD CONSTRAINT `AttendanceLog_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KioskCredential` ADD CONSTRAINT `KioskCredential_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KioskCredential` ADD CONSTRAINT `KioskCredential_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KioskCredential` ADD CONSTRAINT `KioskCredential_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompanyHoliday` ADD CONSTRAINT `CompanyHoliday_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assignee_id_fkey` FOREIGN KEY (`assignee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `Opportunity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyReport` ADD CONSTRAINT `DailyReport_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyTarget` ADD CONSTRAINT `DailyTarget_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyTarget` ADD CONSTRAINT `DailyTarget_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PerformanceSnapshot` ADD CONSTRAINT `PerformanceSnapshot_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_introduced_by_id_fkey` FOREIGN KEY (`introduced_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_referral_employee_id_fkey` FOREIGN KEY (`referral_employee_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_previous_lead_id_fkey` FOREIGN KEY (`previous_lead_id`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadPreferredLocation` ADD CONSTRAINT `LeadPreferredLocation_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadActivity` ADD CONSTRAINT `LeadActivity_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadActivity` ADD CONSTRAINT `LeadActivity_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadMatchingRequirement` ADD CONSTRAINT `LeadMatchingRequirement_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadPropertyInterest` ADD CONSTRAINT `LeadPropertyInterest_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadPropertyInterest` ADD CONSTRAINT `LeadPropertyInterest_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadPropertyInterest` ADD CONSTRAINT `LeadPropertyInterest_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadPropertyInterest` ADD CONSTRAINT `LeadPropertyInterest_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_assigned_pm_id_fkey` FOREIGN KEY (`assigned_pm_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_verified_by_id_fkey` FOREIGN KEY (`verified_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_digital_marketing_executive_id_fkey` FOREIGN KEY (`digital_marketing_executive_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_overridden_by_id_fkey` FOREIGN KEY (`overridden_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnit` ADD CONSTRAINT `ProjectUnit_locked_by_booking_id_fkey` FOREIGN KEY (`locked_by_booking_id`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectPricingRule` ADD CONSTRAINT `ProjectPricingRule_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyPricingRule` ADD CONSTRAINT `PropertyPricingRule_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceLine` ADD CONSTRAINT `PriceLine_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceLine` ADD CONSTRAINT `PriceLine_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceLine` ADD CONSTRAINT `PriceLine_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `ProjectPricingRule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceLine` ADD CONSTRAINT `PriceLine_property_rule_id_fkey` FOREIGN KEY (`property_rule_id`) REFERENCES `PropertyPricingRule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Amenity` ADD CONSTRAINT `Amenity_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAmenity` ADD CONSTRAINT `ProjectAmenity_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAmenity` ADD CONSTRAINT `ProjectAmenity_amenity_id_fkey` FOREIGN KEY (`amenity_id`) REFERENCES `Amenity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryFeature` ADD CONSTRAINT `InventoryFeature_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryFeature` ADD CONSTRAINT `InventoryFeature_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryFeature` ADD CONSTRAINT `InventoryFeature_amenity_id_fkey` FOREIGN KEY (`amenity_id`) REFERENCES `Amenity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMedia` ADD CONSTRAINT `ProjectMedia_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMedia` ADD CONSTRAINT `ProjectMedia_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocument` ADD CONSTRAINT `ProjectDocument_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocument` ADD CONSTRAINT `ProjectDocument_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnitImage` ADD CONSTRAINT `ProjectUnitImage_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnitImage` ADD CONSTRAINT `ProjectUnitImage_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnitDocument` ADD CONSTRAINT `ProjectUnitDocument_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUnitDocument` ADD CONSTRAINT `ProjectUnitDocument_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteAccount` ADD CONSTRAINT `WebsiteAccount_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteShortlistItem` ADD CONSTRAINT `WebsiteShortlistItem_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `WebsiteAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteShortlistItem` ADD CONSTRAINT `WebsiteShortlistItem_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteShortlistItem` ADD CONSTRAINT `WebsiteShortlistItem_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteCompareItem` ADD CONSTRAINT `WebsiteCompareItem_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `WebsiteAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteCompareItem` ADD CONSTRAINT `WebsiteCompareItem_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteCompareItem` ADD CONSTRAINT `WebsiteCompareItem_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteActivityEvent` ADD CONSTRAINT `WebsiteActivityEvent_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebsiteActivityEvent` ADD CONSTRAINT `WebsiteActivityEvent_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `WebsiteAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectLayoutImage` ADD CONSTRAINT `ProjectLayoutImage_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectLayoutImage` ADD CONSTRAINT `ProjectLayoutImage_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyLayoutRegion` ADD CONSTRAINT `PropertyLayoutRegion_layout_image_id_fkey` FOREIGN KEY (`layout_image_id`) REFERENCES `ProjectLayoutImage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyLayoutRegion` ADD CONSTRAINT `PropertyLayoutRegion_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyLayoutRegion` ADD CONSTRAINT `PropertyLayoutRegion_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyLayoutRegion` ADD CONSTRAINT `PropertyLayoutRegion_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_assigned_pm_id_fkey` FOREIGN KEY (`assigned_pm_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_digital_marketing_executive_id_fkey` FOREIGN KEY (`digital_marketing_executive_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_locked_by_booking_id_fkey` FOREIGN KEY (`locked_by_booking_id`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyImage` ADD CONSTRAINT `PropertyImage_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyImage` ADD CONSTRAINT `PropertyImage_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyPublication` ADD CONSTRAINT `PropertyPublication_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyPublication` ADD CONSTRAINT `PropertyPublication_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyVerificationLog` ADD CONSTRAINT `PropertyVerificationLog_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyVerificationLog` ADD CONSTRAINT `PropertyVerificationLog_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `Opportunity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_telecaller_id_fkey` FOREIGN KEY (`telecaller_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_project_manager_id_fkey` FOREIGN KEY (`project_manager_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_cancellation_confirmed_by_pm_id_fkey` FOREIGN KEY (`cancellation_confirmed_by_pm_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitBooking` ADD CONSTRAINT `SiteVisitBooking_assigned_agent_id_fkey` FOREIGN KEY (`assigned_agent_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitProperty` ADD CONSTRAINT `SiteVisitProperty_visit_id_fkey` FOREIGN KEY (`visit_id`) REFERENCES `SiteVisitBooking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitProperty` ADD CONSTRAINT `SiteVisitProperty_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitProperty` ADD CONSTRAINT `SiteVisitProperty_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitReassignment` ADD CONSTRAINT `SiteVisitReassignment_visit_id_fkey` FOREIGN KEY (`visit_id`) REFERENCES `SiteVisitBooking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitReassignment` ADD CONSTRAINT `SiteVisitReassignment_from_employee_id_fkey` FOREIGN KEY (`from_employee_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitReassignment` ADD CONSTRAINT `SiteVisitReassignment_to_employee_id_fkey` FOREIGN KEY (`to_employee_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRefund` ADD CONSTRAINT `ExpenseRefund_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRefund` ADD CONSTRAINT `ExpenseRefund_accountant_id_fkey` FOREIGN KEY (`accountant_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRefund` ADD CONSTRAINT `ExpenseRefund_md_id_fkey` FOREIGN KEY (`md_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseRefund` ADD CONSTRAINT `ExpenseRefund_refunded_by_fkey` FOREIGN KEY (`refunded_by`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthSession` ADD CONSTRAINT `AuthSession_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_assigned_employee_id_fkey` FOREIGN KEY (`assigned_employee_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_origin_lead_id_fkey` FOREIGN KEY (`origin_lead_id`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_assigned_employee_id_fkey` FOREIGN KEY (`assigned_employee_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_form_submitted_by_id_fkey` FOREIGN KEY (`form_submitted_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_md_approved_by_id_fkey` FOREIGN KEY (`md_approved_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_installment_id_fkey` FOREIGN KEY (`installment_id`) REFERENCES `Installment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Installment` ADD CONSTRAINT `Installment_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Installment` ADD CONSTRAINT `Installment_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingPortalMapping` ADD CONSTRAINT `BookingPortalMapping_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IntegrationEvent` ADD CONSTRAINT `IntegrationEvent_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerNotification` ADD CONSTRAINT `CustomerNotification_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerNotification` ADD CONSTRAINT `CustomerNotification_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicApiKey` ADD CONSTRAINT `PublicApiKey_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PMLocationAssignment` ADD CONSTRAINT `PMLocationAssignment_pm_id_fkey` FOREIGN KEY (`pm_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PMLocationAssignment` ADD CONSTRAINT `PMLocationAssignment_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PMReassignmentHistory` ADD CONSTRAINT `PMReassignmentHistory_site_visit_booking_id_fkey` FOREIGN KEY (`site_visit_booking_id`) REFERENCES `SiteVisitBooking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PMReassignmentHistory` ADD CONSTRAINT `PMReassignmentHistory_reassigned_by_pm_id_fkey` FOREIGN KEY (`reassigned_by_pm_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PMReassignmentHistory` ADD CONSTRAINT `PMReassignmentHistory_reassigned_to_pm_id_fkey` FOREIGN KEY (`reassigned_to_pm_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteVisitEscalation` ADD CONSTRAINT `SiteVisitEscalation_site_visit_booking_id_fkey` FOREIGN KEY (`site_visit_booking_id`) REFERENCES `SiteVisitBooking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Demo` ADD CONSTRAINT `Demo_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Demo` ADD CONSTRAINT `Demo_handler_id_fkey` FOREIGN KEY (`handler_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DemoInterestedProperty` ADD CONSTRAINT `DemoInterestedProperty_demo_id_fkey` FOREIGN KEY (`demo_id`) REFERENCES `Demo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DemoInterestedProperty` ADD CONSTRAINT `DemoInterestedProperty_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DemoInterestedProperty` ADD CONSTRAINT `DemoInterestedProperty_project_unit_id_fkey` FOREIGN KEY (`project_unit_id`) REFERENCES `ProjectUnit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyPricing` ADD CONSTRAINT `PropertyPricing_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyPlotDetails` ADD CONSTRAINT `PropertyPlotDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyApartmentDetails` ADD CONSTRAINT `PropertyApartmentDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyVillaDetails` ADD CONSTRAINT `PropertyVillaDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyHouseDetails` ADD CONSTRAINT `PropertyHouseDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyCommercialShopDetails` ADD CONSTRAINT `PropertyCommercialShopDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyCommercialOfficeDetails` ADD CONSTRAINT `PropertyCommercialOfficeDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyFarmLandDetails` ADD CONSTRAINT `PropertyFarmLandDetails_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PerformanceAdjustment` ADD CONSTRAINT `PerformanceAdjustment_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PerformanceAdjustment` ADD CONSTRAINT `PerformanceAdjustment_adjuster_id_fkey` FOREIGN KEY (`adjuster_id`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

