# Resign → hand over work (plan, 2026-11-02)

**Status (2026-11-02): built and tested locally, not committed or released.**

- SQL for prod: `docs/changes/sql/2026-11-02-employee-handover.sql` (run before the API push).
- Code: `apps/api/src/services/employeeOffboard.service.ts`, routes in
  `routes/employees/lifecycle.ts`, job "Offboard Leavers" in `jobs/scheduler.ts`,
  UI `apps/web/src/components/employees/LeaverModal.tsx`.
- Tests: `tests/api/employee-offboard-handover.test.ts` (8 pass). The related suites fail the same 47
  old tests before and after this change.
- Built differently from the plan below: the job runs **hourly at :05** (and on start), not once at 00:05.

## Problem

`POST /employees/:id/resign` (`apps/api/src/routes/employees/lifecycle.ts`) locks the
person out **immediately**, even when the last working day is weeks away. It also
touches none of their work. Their open leads, call-backs, opportunities and upcoming
visits stay in their name. The nightly jobs keep sending them follow-up reminders that
nobody reads, and after 5 days they escalate each lead to the manager as "stale".
The only way to fix this today is to transfer each lead by hand.

## Decision (user, 2026-11-02)

The lockout and handover both happen **on the last working day**, not when HR records the
resignation. Until then the person works normally (serving notice).

## Lifecycle

| When                                                                    | Status                                                                                                  | Can log in                                  | Their work                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| HR records the resignation, last day in the future                      | `ACTIVE` (+ `resignation_date`, `last_working_day`, `handover_to_id` set) — shown as **Serving notice** | Yes                                         | Unchanged; still gets leads, reminders, attendance, reports |
| End of the last working day (from 00:00 IST the next day)               | `RESIGNED`                                                                                              | No (sessions revoked, token_version bumped) | Handed over to `handover_to_id`                             |
| HR records the resignation with no last day, or one already in the past | `RESIGNED` straight away (today's behaviour)                                                            | No                                          | Handed over straight away if a target was picked            |

HR can **change the last day / target** or **withdraw the resignation** while the person is serving notice.

## What a leaver can still own (from schema.prisma)

| Work                                          | Field                                                                               | Auto-moved?                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| Open leads (not BOOKED / DROPPED)             | `Lead.assigned_to_id`                                                               | **Yes**                                 |
| Open tasks, including call-backs              | `Task.assignee_id` (PENDING / IN_PROGRESS / OVERDUE)                                | **Yes**                                 |
| Opportunities on those leads                  | `Opportunity.owner_id`                                                              | **Yes**                                 |
| Upcoming visits where they are the telecaller | `SiteVisitBooking.telecaller_id`                                                    | **Yes**                                 |
| Customers                                     | `Customer.assigned_to_id`                                                           | **Yes**                                 |
| Visits where they are the agent / PM          | `SiteVisitBooking.assigned_agent_id`, `project_manager_id`                          | Listed only (PM/agent role rules apply) |
| Projects / properties they manage             | `Project.assigned_pm_id`, `Property.assigned_pm_id`, `PMLocationAssignment`         | Listed only (existing PM reassign flow) |
| Open complaints, demos, in-progress bookings  | `Complaint.assigned_employee_id`, `Demo.handler_id`, `Booking.assigned_employee_id` | Listed only                             |
| People who report to them                     | `Employee.reporting_manager_id`                                                     | Listed only                             |

History fields (created_by, actor, uploaded_by, recorded_by…) stay as they are, because they record who did the work.

"Listed only" means the screen shows how many there are, with links. They need
someone with the right role (a PM, for example), so a single "give everything to X" choice can't handle them safely.
The notice period gives HR time to sort these out before the last day.

## Database (run on prod BEFORE the API push)

```sql
ALTER TABLE employees
  ADD COLUMN handover_to_id INT NULL,
  ADD COLUMN offboarded_at DATETIME NULL,
  ADD CONSTRAINT fk_employees_handover_to FOREIGN KEY (handover_to_id) REFERENCES employees(id);
```

(Exact table/column names to be checked against schema.prisma `@@map` when building.)

- `handover_to_id`: who gets the work on the last day.
- `offboarded_at`: set when the last-day step has run. This makes the job safe to re-run.

## Design

### API

1. **`POST /employees/:id/resign`** — `{ resignation_date?, last_working_day?, reason?, handover_to_id? }`
   - Future last day: save the dates and target, keep ACTIVE, audit `EMPLOYEE_RESIGNATION_RECORDED`,
     notify the employee ("Your last working day is …").
   - No last day / already past: run **offboard** (below) now.
   - The target must be ACTIVE, in the same company, have `LEADS_UPDATE` and not be the leaver.
2. **`PATCH /employees/:id/resignation`** changes the last day / target while serving notice.
   **`DELETE /employees/:id/resignation`** withdraws it (clears the fields; audit row).
3. **`GET /employees/:id/handover-summary`** returns the counts for every row in the table above. HR / MD only.
4. **`POST /employees/:id/handover`** `{ to_employee_id, reason }` hands over now. Use it for
   people already RESIGNED with work still in their name (e.g. the one marked today), or when the
   last-day handover was skipped.
5. **Offboard** (shared function, used by #1 and the nightly job), per employee:
   - Set `RESIGNED`, revoke sessions, bump `token_version`, set `offboarded_at`, audit `EMPLOYEE_RESIGNED`.
   - If `handover_to_id` is set and still valid, hand over the "Yes" rows. If the target has
     left in the meantime or can't take leads, skip the handover and notify HR/MD to pick someone.
   - Leads: pull the per-lead moves out of `transferLead` (call-backs, opportunity, visits,
     `transitionLead`, activity note) into a shared `moveLeadOwnership(tx, …)` helper, so the
     single transfer and the bulk handover run the same code. Process in chunks of ~50 per transaction.
   - Audit: per-lead `LEAD_HANDED_OVER`, plus one `EMPLOYEE_HANDOVER` row with the totals. It uses a
     different action from `LEAD_TRANSFERRED`, so the poaching alert (10 transfers / 24h) doesn't fire.
   - Notifications: **one** summary to the new owner ("42 leads, 7 call-backs… from X").

### Making sure the last day is honoured (Render free plan sleeps)

- **Nightly job `offboardLeavers`** at 00:05 IST: everyone with `status = ACTIVE`,
  `last_working_day < today (IST)` and `offboarded_at IS NULL` → offboard. It's also added to the
  **on-start catch-up** in `jobs/scheduler.ts` `initJobs()`, so a sleeping server catches up when it wakes.
- **Login guard**: in `middleware/auth.ts` and `routes/auth.ts` login/refresh, also reject when
  `last_working_day` is before today (IST). The lockout is exact even if the job hasn't run yet.
  The job only adds the status change and the handover.

### Web (`EmployeeManagement.tsx`)

- Resign modal: last working day, reason, a **"Hand over work to"** picker (active employees who can
  work leads, pre-filled with their reporting manager, or "Decide later"), plus the summary counts.
  The button text says what will happen: "Lock out and hand over on 15 Nov" / "Lock out now".
- Employee list / profile: a **Serving notice — last day 15 Nov** badge, with **Change** and **Withdraw resignation** actions.
- A RESIGNED employee who still owns work gets a banner ("12 open leads still with this person")
  with a **Hand over** button (endpoint #4).
- The "Listed only" rows appear under the picker with links to the existing pages.

### Background jobs (`apps/api/src/jobs/tasks.ts`)

- Follow-up reminder (2 days): skip leads whose owner isn't ACTIVE.
- Stale-lead escalation (5 days): if the owner isn't ACTIVE say "owner has left — hand over their
  leads" and link to the employee.

## Tests (local test DB suite)

- Future last day: still ACTIVE and can log in; nothing moved.
- Day after the last day: login rejected by the guard even before the job runs; the job sets RESIGNED,
  revokes sessions and moves leads/call-backs/opportunities/telecaller visits/customers; it leaves
  BOOKED/DROPPED leads and COMPLETED/CANCELLED visits and tasks alone.
- The job is safe to re-run (`offboarded_at`); the on-start catch-up picks up a missed night.
- No last day / past date → immediate, same as above.
- Withdraw / change last day while serving notice.
- Target left before the last day → handover skipped, HR/MD notified, the leaver still locked out.
- The poaching alert doesn't fire on a handover of more than 10 leads.
- Single `transferLead` behaves exactly as before (refactor safety).

## Rollout

1. Build and test on staging. Check with a test employee whose last day is yesterday and one whose last day is tomorrow.
2. Prod: run the SQL above **first**, then push (api-rscrm auto-deploys from main), then upload the web build.
3. Afterwards: use **Hand over** for the employee already marked RESIGNED today.

## Open question

One target for everything, or let HR split leads between several people (for example round-robin
across a team)? This plan assumes one target. Splitting could come later.
