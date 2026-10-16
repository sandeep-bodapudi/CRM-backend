-- F-15/F-16: walk-in visits.
--  * SiteVisitBooking.visit_type: SCHEDULED (default, every existing row) or WALK_IN.
--  * SiteVisitFeedback.rated_employee_id becomes nullable: a walk-in has no
--    project manager or agent to rate.
-- Both are additive/relaxing: no existing row changes. Run on staging, then
-- production, BEFORE the code that writes them is deployed.

-- Check (read-only): must return 0 rows.
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'SiteVisitBooking' AND column_name = 'visit_type';

ALTER TABLE `SiteVisitBooking`
  ADD COLUMN `visit_type` VARCHAR(191) NOT NULL DEFAULT 'SCHEDULED';

ALTER TABLE `SiteVisitFeedback`
  MODIFY COLUMN `rated_employee_id` INT NULL;

-- Verify (read-only): visit_type exists; rated_employee_id is_nullable = YES.
SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'SiteVisitBooking' AND column_name = 'visit_type')
    OR (table_name = 'SiteVisitFeedback' AND column_name = 'rated_employee_id'));
