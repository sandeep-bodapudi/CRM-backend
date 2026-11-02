-- 2026-11-02 — one unit number per project, enforced by the database.
--
-- Why: the API checks "is this number free?" and then saves. Two people
-- saving the same number at the same instant can both pass the check, and
-- the project ends up with two "Plot 12"s. A unique key on
-- (project_id, unit_number) makes the database refuse the second save; the
-- API turns that refusal into "Unit number "12" is already used in this
-- project. Choose another number."
--
-- The key cannot be added while old duplicates exist, so this file:
--   Step 1  lists them                                   (read-only)
--   Step 2  renames the spare copies, e.g. A-1 -> A-1-dup2, and records each
--           rename in the project's History (AuditEvent)  (changes data)
--   Step 3  checks nothing is left that blocks the key    (read-only)
--   Step 4  adds the unique key                           (schema change)
--
-- Which copy keeps the number: a unit that is reserved, booked, sold, locked
-- by a booking or has any booking history, else the oldest (lowest id).
-- A booked/sold unit is NEVER renamed. If two committed units share a number
-- they are listed in Step 3 and must be sorted out by hand (rename one in the
-- CRM's Units tab) before Step 4 will succeed.
--
-- Note: the column's collation ignores letter case, so "a-1" and "A-1" count
-- as the same number (the API already treated them that way).
--
-- Run each step separately and keep the output of Steps 1 and 3.

-- Text in this file is UTF-8 (the "·" below); without this the Windows mysql
-- client stores it garbled.
SET NAMES utf8mb4;

-- Who is running this: put YOUR Employee id here. History shows the renames as
-- "by <that person>"; an id that matches no one shows "by Unknown user".
SET @actor_id = 1;

-- ── Step 1 (read-only): every unit whose number is repeated in its project ──
SELECT u.project_id, u.unit_number, u.id AS unit_id, u.unit_code, u.sales_status,
       (SELECT COUNT(*) FROM `Booking` b WHERE b.project_unit_id = u.id) AS bookings
FROM `ProjectUnit` u
JOIN (SELECT project_id, unit_number FROM `ProjectUnit`
      GROUP BY project_id, unit_number HAVING COUNT(*) > 1) d
  ON d.project_id = u.project_id AND d.unit_number = u.unit_number
ORDER BY u.project_id, u.unit_number, u.id;

-- ── Step 2 (changes data): rename the spare copies, with a History record ───
DROP TEMPORARY TABLE IF EXISTS unit_dup_rank;
CREATE TEMPORARY TABLE unit_dup_rank AS
SELECT u.id, u.project_id, u.company_id, u.unit_number, u.unit_type, u.unit_code,
       (u.sales_status IN ('RESERVED', 'BOOKED', 'SOLD')
        OR u.locked_by_booking_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM `Booking` b WHERE b.project_unit_id = u.id)) AS is_committed,
       ROW_NUMBER() OVER (
         PARTITION BY u.project_id, u.unit_number
         ORDER BY (u.sales_status IN ('RESERVED', 'BOOKED', 'SOLD')
                   OR u.locked_by_booking_id IS NOT NULL
                   OR EXISTS (SELECT 1 FROM `Booking` b WHERE b.project_unit_id = u.id)) DESC,
                  u.id
       ) AS copy_no
FROM `ProjectUnit` u
JOIN (SELECT project_id, unit_number FROM `ProjectUnit`
      GROUP BY project_id, unit_number HAVING COUNT(*) > 1) d
  ON d.project_id = u.project_id AND d.unit_number = u.unit_number;

START TRANSACTION;

INSERT INTO `AuditEvent` (actor_id, action, entity_type, entity_id, old_value, new_value, reason, company_id, created_at)
SELECT @actor_id,
       LEFT(CONCAT('UNITS_CHANGE:',
              CASE r.unit_type WHEN 'PLOT' THEN 'Plot' WHEN 'FLAT' THEN 'Flat' WHEN 'VILLA' THEN 'Villa'
                               WHEN 'HOUSE' THEN 'House' WHEN 'COMMERCIAL' THEN 'Commercial' ELSE 'Unit' END,
              ' ', r.unit_number, ' · number (duplicate renamed)'), 191),
       'PROJECT', r.project_id,
       r.unit_number,
       CONCAT(r.unit_number, '-dup', r.copy_no),
       CONCAT('Copy ', r.copy_no, ' of a unit number used more than once in this project (unit ',
              r.unit_code, ', id ', r.id, '). Renamed before the database started refusing duplicates (2026-11-02).'),
       r.company_id, UTC_TIMESTAMP(3) -- the app stores and reads times as UTC
FROM unit_dup_rank r
WHERE r.copy_no > 1 AND r.is_committed = 0;

UPDATE `ProjectUnit` u
JOIN unit_dup_rank r ON r.id = u.id
SET u.unit_number = CONCAT(r.unit_number, '-dup', r.copy_no)
WHERE r.copy_no > 1 AND r.is_committed = 0;

COMMIT;

-- ── Step 3 (read-only): must return NO rows before Step 4 ────────────────────
-- Anything here is a number still shared by units that are all booked/sold
-- (fix by hand in the CRM), or a "-dupN" name that was already taken.
SELECT project_id, unit_number, COUNT(*) AS copies, GROUP_CONCAT(id ORDER BY id) AS unit_ids,
       GROUP_CONCAT(sales_status ORDER BY id) AS statuses
FROM `ProjectUnit`
GROUP BY project_id, unit_number
HAVING COUNT(*) > 1;

-- ── Step 4 (schema change): the unique key ────────────────────────────────
-- Same name Prisma gives @@unique([project_id, unit_number]) in schema.prisma.
ALTER TABLE `ProjectUnit`
  ADD UNIQUE INDEX `ProjectUnit_project_id_unit_number_key` (`project_id`, `unit_number`);
