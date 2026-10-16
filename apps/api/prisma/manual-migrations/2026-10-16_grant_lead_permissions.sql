-- D10: every role works its own leads. Role permissions are DATA: changing the
-- code matrix alone does nothing for a role that already has permissions, so
-- this grants the same permissions in the database. Safe to re-run
-- (INSERT IGNORE). Run on staging, then production. Users of these roles must
-- log in again to pick up the new permissions.
--
-- HR and Digital Marketing head are intentionally NOT included: their data scope
-- is every lead in the company, so lead access would expose all leads.

-- Check (read-only): who already has what.
SELECT r.name AS role, p.name AS permission
FROM RolePermission rp
JOIN Role r ON r.id = rp.role_id
JOIN Permission p ON p.id = rp.permission_id
WHERE p.name IN ('leads.create', 'leads.read', 'leads.update')
  AND r.name IN ('accountant','project managers','Agent','digital marketing executive','Inventory Executive','Staff','Sales manager')
ORDER BY r.name, p.name;

INSERT IGNORE INTO RolePermission (role_id, permission_id)
SELECT r.id, p.id FROM Role r JOIN Permission p
  ON ((r.name IN ('accountant','project managers','Agent') AND p.name IN ('leads.create','leads.update'))
   OR (r.name IN ('digital marketing executive','Sales manager') AND p.name = 'leads.create')
   OR (r.name IN ('Inventory Executive','Staff') AND p.name IN ('leads.create','leads.read','leads.update')));

-- Verify (read-only): rerun the check above; every listed role now has its permissions.
