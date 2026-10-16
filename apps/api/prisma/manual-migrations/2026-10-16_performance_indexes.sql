-- DB-1: indexes for the lists, counts and reports that were slow on a remote
-- database (lead lists/counts by owner and status, call history, audit-event
-- scores, task queues). Additive only: no data changes, no column changes.
-- Creating an index briefly reads the table; run at a quiet hour on large tables.
--
-- Run on staging first, then production. These are independent of the code
-- release (the code works with or without them), so they may go before or after.
-- Names match what Prisma would generate, so `prisma db pull` will not drift.

-- Check (read-only): returns the indexes that already exist; rerun-safe only if empty.
SELECT table_name, index_name FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND index_name IN (
    'Lead_assigned_to_id_status_idx', 'Lead_company_id_status_idx', 'Lead_created_by_id_idx', 'Lead_source_idx',
    'LeadActivity_lead_id_activity_type_idx', 'LeadActivity_actor_id_created_at_idx',
    'AuditEvent_action_created_at_idx', 'AuditEvent_actor_id_action_created_at_idx',
    'Task_assignee_id_status_target_date_idx'
  )
GROUP BY table_name, index_name;

CREATE INDEX `Lead_assigned_to_id_status_idx` ON `Lead` (`assigned_to_id`, `status`);
CREATE INDEX `Lead_company_id_status_idx` ON `Lead` (`company_id`, `status`);
CREATE INDEX `Lead_created_by_id_idx` ON `Lead` (`created_by_id`);
CREATE INDEX `Lead_source_idx` ON `Lead` (`source`);
CREATE INDEX `LeadActivity_lead_id_activity_type_idx` ON `LeadActivity` (`lead_id`, `activity_type`);
CREATE INDEX `LeadActivity_actor_id_created_at_idx` ON `LeadActivity` (`actor_id`, `created_at`);
CREATE INDEX `AuditEvent_action_created_at_idx` ON `AuditEvent` (`action`, `created_at`);
CREATE INDEX `AuditEvent_actor_id_action_created_at_idx` ON `AuditEvent` (`actor_id`, `action`, `created_at`);
CREATE INDEX `Task_assignee_id_status_target_date_idx` ON `Task` (`assignee_id`, `status`, `target_date`);

-- Verify (read-only): 9 rows.
SELECT table_name, index_name FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND index_name IN (
    'Lead_assigned_to_id_status_idx', 'Lead_company_id_status_idx', 'Lead_created_by_id_idx', 'Lead_source_idx',
    'LeadActivity_lead_id_activity_type_idx', 'LeadActivity_actor_id_created_at_idx',
    'AuditEvent_action_created_at_idx', 'AuditEvent_actor_id_action_created_at_idx',
    'Task_assignee_id_status_target_date_idx'
  )
GROUP BY table_name, index_name;
