-- 2026-11-02 — publish the units of MD-approved, public projects
--
-- ProjectUnit.is_published defaults to 0 and nothing in the app ever set it,
-- while the public API (routes/public.ts) lists only published units. So the
-- Radha/Sonthillu websites showed every project with no units. From this
-- release, MD approval publishes a project's units (and a unit added to an
-- approved project is published straight away); the website shows a
-- published unit only while it is AVAILABLE.
--
-- This backfill gives existing approved projects the same state.
-- Run on rrh_local (done 2026-11-02), then staging, then prod — staging/prod
-- only after the owner approves, and BEFORE pushing the code.

-- Step 1 (read-only): what will change.
SELECT p.id AS project_id, p.project_code, p.name,
       COUNT(u.id) AS units,
       SUM(u.is_published = 0) AS unpublished_units,
       SUM(u.sales_status = 'AVAILABLE') AS available_units
FROM `Project` p
JOIN `ProjectUnit` u ON u.project_id = p.id
WHERE p.is_published = 1
  AND p.verification_status = 'VERIFIED'
  AND p.status <> 'CANCELLED'
GROUP BY p.id, p.project_code, p.name
ORDER BY p.id;

-- Step 2: publish them (all units; the website itself hides any that are not AVAILABLE).
START TRANSACTION;
UPDATE `ProjectUnit` u
JOIN `Project` p ON p.id = u.project_id
SET u.is_published = 1
WHERE p.is_published = 1
  AND p.verification_status = 'VERIFIED'
  AND p.status <> 'CANCELLED'
  AND u.is_published = 0;
-- Expect the sum of "unpublished_units" from step 1, then:
COMMIT;
