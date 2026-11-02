-- 2026-11-02 — read-only checks after the project workflow audit fixes.
-- Nothing here changes data. Run on staging/prod before the push and keep the
-- output: each result is a short list someone should look at by hand.

-- 1. Unit numbers used twice in one project. The API now refuses a new
--    duplicate, but rows created before the fix stay. Rename one of each pair
--    in the CRM (Units tab) so buyers and sales staff see one "Plot 12".
SELECT project_id, unit_number, COUNT(*) AS copies, GROUP_CONCAT(id ORDER BY id) AS unit_ids
FROM `ProjectUnit`
GROUP BY project_id, unit_number
HAVING COUNT(*) > 1
ORDER BY project_id, unit_number;

-- 2. Old Property rows still hanging off a project (the pre-rebuild unit
--    model). The Units tab, prices, pins and websites only use ProjectUnit.
SELECT pr.project_id, pr.id AS property_id, pr.property_code, pr.title, pr.status
FROM `Property` pr
WHERE pr.project_id IS NOT NULL
ORDER BY pr.project_id, pr.id;

-- 3. Layout pins still pointing at old Property rows. The pin map now shows
--    only ProjectUnit pins; these need placing again on the matching unit.
SELECT r.id AS region_id, i.project_id, r.property_id
FROM `PropertyLayoutRegion` r
JOIN `ProjectLayoutImage` i ON i.id = r.layout_image_id
WHERE r.property_id IS NOT NULL AND r.project_unit_id IS NULL;

-- 4. Units on HOLD with no end date (set by hand before holds started
--    expiring after 48 hours). Release or re-hold them deliberately.
SELECT id, unit_code, project_id, updated_at
FROM `ProjectUnit`
WHERE sales_status = 'HOLD' AND hold_until IS NULL;
