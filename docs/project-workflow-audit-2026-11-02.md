# Project workflow audit — 2026-11-02

A full read of everything to do with projects: the lifecycle, the details page, units and
inventory, pricing, linked leads, visits and bookings, the public websites and My Property portal,
notifications, and role access. API routes, web screens, schema and jobs were read together.
The main flows were run on the local stack (`rrh_local`) with real roles.

This is a report only. Nothing new was fixed, and nothing was committed, pushed or deployed.
Test data was left in place.

Related: [Project wizard & pricing review](project-wizard-pricing-review-2026-11-02.md), from
earlier today. It covers pricing and the wizard in depth, and its changes are built locally but
not committed. This audit assumes those local changes:

- price basis fixed per unit type;
- unit-type-driven screens;
- the review lock fix;
- the narrower Inventory/Data-entry visibility;
- status chips on the project list.

## How this was checked

**Run against the real local API with real roles** (tokens for the seeded `rrh_local` employees;
2-step login switched off locally with `TWO_STEP_DISABLED=true` so MD could act):

- Read access for 9 roles: Sales manager, Agent, PM, Telecaller, Staff, Digital lead operator,
  HR, Data Entry, Inventory Executive. Each was tried on the list, a verified project's
  detail/units/rules/media, and a draft.
- The full lifecycle on a new project ("AUDIT lifecycle 9", project 9):
  - the Inventory Executive creates it;
  - the PM submits;
  - MD does "verify as-is", then rejects with a reason;
  - the PM edits and resubmits;
  - the PM tries to rename while it is in review;
  - the PM adds a pricing rule while it is in review;
  - MD approves;
  - the PM renames after it is verified;
  - MD changes the name and the PM in one save;
  - MD adds a unit, then the same unit number again;
  - MD's booking picker.

**Clicked through in the browser** (local web on :5174, as the test PM):

- earlier today: the wizard for a plotted and an apartment project, the pricing rules, the
  calculator, Add Unit, Generate Units, and the project list;
- now: project 9's details page as a PM who no longer owns it.

**Read in code only:**

- the DM polish screen (there is no DM employee locally);
- the Media, Documents, Buyer updates and Activity tabs;
- the layout pin editor;
- the public websites (they need an API key);
- the My Property portal;
- bookings and payments end to end;
- site-visit routing;
- the lock/hold expiry job;
- the Admin, MD and Finance roles in the UI (2-step login).

## Fixed since the audit (2026-11-02, local only, not committed)

The owner approved fixing the four high findings. All four are built and checked on the local
stack. Tests: `tests/api/project-review-fixes.test.ts`, 5 tests, all pass.

1. **Stale project lists.** `routes/projects.ts` now clears every cached project list before
   any successful write response under `/projects` goes out. That covers create, edit,
   submit, Marketing review, approve, reject, cancel, units and rules.
   - Local API: a new project is in the creator's list at once (it was missing before).
   - Local API: the MD's pending queue shows a project the moment Marketing passes it on
     (0 → 1).
2. **Review notifications.** `notifyProjectReview()` in `services/project.service.ts` uses
   `notifyEmployee`, so each one is in-app plus push, with a link to the project.
   - On submit: the DM Head(s), or the MD(s) if the company has none.
   - When Marketing passes it on (polish or verify-as-is): the MD(s).
   - On reject: the creator and the PM, with the reason.
   - On approve: the creator and the PM.
   - The person acting is never notified of their own step.
   - The approve/reject message now says "The PM and the person who added it have been
     notified" only when someone was.
   - Local API: the PM got the rejection, then the approval.
3. **Units on the websites.** The rule:
   - MD approval publishes all of the project's units, and a rejection unpublishes them (in
     the same transaction as the project).
   - A unit added to an already approved project is published straight away.
   - The public detail lists published units **only while AVAILABLE**
     (`routes/public.ts` `PUBLIC_PROJECT_DETAIL_SELECT`). The websites' unit shape has no
     sales status, so a sold unit would look buyable.
   - Backfill: `docs/changes/sql/2026-11-02_publish_units_of_approved_projects.sql`. Run on
     `rrh_local` only: 6 units published. Local website API: Lakeside Villas went from 0 units
     to 3.
   - Website check (Radha/Sonthillu `src/lib/dto.ts`, `crm.ts`): nothing else hides units. Two
     website-side issues remain in those repos, not fixed:
     - `toPublicProjectDetail` maps any type that isn't an apartment or villa, **plots
       included**, to "INDEPENDENT_HOUSE";
     - `getProjectByCode` / `getProjectDetailByCode` call `/projects/code/:code`, which the
       API doesn't have (both are unused today).
4. **Unit code clashes.** `projectUnit.service.ts` now:
   - takes the next number from the highest existing code **in that project**;
   - retries with the next number on a unit-code clash, both for single adds and Generate
     Units.

   The clash was reproduced locally first: two throwaway units added, the first one deleted,
   then a third add returned **500**. After the fix the same steps return **201** with the
   next free code. The test also adds three units at once and gets three distinct codes.

Suites run: the related project, unit, public, pricing, inventory and booking suites.

New failures: none.

Failures that were already there (same as before):

- `projects.test` and `dataScope.test` (stale expectations);
- test 18 in `project-units-pricing`;
- `wr5-project-publication` / `public-project-api` (their setup creates unverified projects,
  which the public API has refused since before today);
- `phase1-public-boundary` (lead source and image approval);
- `project-unit-features-activity` (a leftover employee row from an earlier crashed run blocks
  its setup).

`tsc` is clean for the API and the web app.

### Second round — the rest of the findings (2026-11-02, local only, not committed)

The owner asked for everything else to be fixed except #8 (editing after approval), which is
still undecided. Tests: `tests/api/project-remaining-fixes.test.ts`, 10 tests;
`project-layout.test.ts`, moved to project units, 7 tests; `Sonthillu/src/lib/dto.plot.test.ts`,
2 tests. All pass.

**#5 Name + PM save, and the PM field** (`services/project.service.ts`)

- `updateProject` now writes every changed field, the status and the PM in **one** update.
  Before, the status and PM paths wrote only their own column and dropped the rest. The PM
  notifications still go out.
- Create, edit and reassign accept as PM only an **active Project Manager of the project's
  company**. The Inventory Executive and DM Head are now refused with a 400.
- Project codes now come from the highest number used that year, plus a retry, instead of a
  count.

**#6 Unit numbers are unique per project** (`projectUnit.service.ts`). Checked on Add Unit,
on edit, and in Generate Units: a number repeated inside one batch is caught too. The error is
409 "Unit number "D-1" is already used in this project. Choose another number."

- _(Third round: now also enforced by the database. See "Two people, same unit number"
  below.)_

**#7 Verified-only pickers.**

- The booking/visit inventory list now offers units only from VERIFIED projects that are not
  cancelled or on hold (`inventory.service.ts`).
- Claiming a unit for a booking re-checks this (`inventory/reference.ts`: "project is not
  approved yet" / "cancelled").
- A site visit refuses units of such projects with a 400 (`siteVisit/shared.ts`). That file
  also looks the project up within the company now, and routes a project with no PM by the
  project's own city/location rather than the lead's.

**#9 Layout pins reconnected.**

- The API stores pins on `project_unit_id`; the schema allows this in both shared copies.
- Listing pins returns the unit with its live sales status.
- The Location tab has a new **Site Plan & Unit Pins** section (`ProjectLayoutTab.tsx`):
  upload a plan, tap a pin to see the unit card, "Edit pins" to place, drag and save.
- `ProjectLayoutEditor` and `ProjectLayoutViewer` now work on project units, with pins
  coloured by sales status.
- Old pins on Property rows are left out; read-only check 3 lists them.

**#10 Brochures and videos.**

- A new `projectMediaUpload` (`storage.service.ts`) accepts images, PDF and MP4/WebM/MOV, with
  the declared type and extension required to agree.
- `ProjectService.storeMediaFile` checks each kind and the real file bytes (`%PDF`, `ftyp`,
  WebM header):
  - Cover and Gallery: image only.
  - Video: video only, up to 50 MB.
  - Brochure and plans: PDF up to 20 MB, or an image.
  - Images are still re-encoded to WebP, up to 10 MB.
- The Media tab's file picker and hint change with the kind. PDFs show as a card and videos
  play inline. The delete button is now visible on phones (it used to appear on hover only).

**MD approve scope.** `md-approve` now uses the same `projectInScope()` check as every other
project write.

**Low findings:**

- **DM verify-as-is:** limited to the DM Head (or MD/Admin) in the API (403) and in the UI.
- **Role names:** the DM-Executive list filter uses the `Roles` constants.
- **Buttons follow ownership:** `projectAccess.ts` mirrors `ProjectPolicy`. Edit, Hold and
  Cancel only show to someone the server allows, and the Settings tab explains who can cancel.
- **Chips:** they now read "Construction: …" and "Review: …".
- **Overview:** a plotted project shows "Blocks / Phases" instead of towers/floors.
- **Dead components removed:** `ProjectDossier.tsx` and `BulkUnitWizard.tsx` (nothing rendered
  them).
- **HOLD expiry:** a manual HOLD now ends after 48 hours (`UNIT_HOLD_HOURS`), so the existing
  sweep releases it. Leaving HOLD clears the end date.
- **Public detail:** it no longer serves a cancelled project.
- **`ProjectPolicy.canRead`:** its comment now says reads follow the data scope, not this
  policy.
- **Legacy Property units:** read-only check 2 lists them.

**From the pricing review:**

- **Pricing rules can be edited in place** (pencil icon, then "Save Changes"). The no-GST-on-
  plots rule also applies when editing.
- **Generate Units for villas** asks for the built-up area, as a default and per row, and
  prices on it.
- **Wizard step 6** now embeds the real `ProjectAmenityEditor` (ProjectAmenity rows, which
  pricing reads) instead of the unused checklist. Step 7 counts those amenities.

**Websites** (Radha + Sonthillu, edited locally only; not built, uploaded or pushed):

- `PropertyType` gains `PLOT`. The shared mapper maps plot/land to it, and the project detail
  uses the mapper instead of its inline "anything else is an Independent House" guess. "Plot"
  labels were added to the project card, info, inventory and compare views, and to the CRM and
  alternatives maps.
- The unused `getProjectByCode` / `getProjectDetailByCode`, which called a route that doesn't
  exist, were removed.
- **Found while testing (and fixed):** the websites' `formatArea` crashed on a unit with no
  `area_sqft`, and CRM units usually have none (plots store Sq.Yd, flats store super
  built-up). With units now published, that would have broken every project page.
  - The public API now sends a Sq.Ft area from the unit's own field (plot Sq.Yd × 9, else
    super/built-up/carpet), plus `plot_area_sqyd`.
  - The websites now show "—" when there is no area.
- Both websites type-check. Sonthillu's 162 tests pass, plus the 2 new ones. Radha has no test
  script.

**Checked on the local stack** (API on `rrh_local`, web on :5174, as the test PM):

- **Through the real API on project 7:**
  - added unit "L-12";
  - uploaded a site plan and saved a pin on that unit (impossible before);
  - uploaded a brochure PDF, which was accepted;
  - uploaded a PDF as "Gallery", which was refused with "Upload an image (JPG, PNG, WebP or
    GIF)".
- **In the browser on project 7:**
  - the header chips read "Construction: PLANNING" and "Review: Not Submitted";
  - the overview shows "Blocks / Phases";
  - the Location tab shows the plan with a green pin, whose card reads "Plot L-12 · PLOT ·
    EAST · ₹25.9 L · Available";
  - "Edit pins" opened the editor, and saving gave "Layout pins saved";
  - in the Media tab, Brochure takes PDF and the brochure shows as a PDF card;
  - in Pricing, a rule was edited from ₹15,000 to ₹16,000 / Sq.Yd ("Pricing rule updated");
  - wizard step 6 shows the amenity editor.
- **Website API:** Lakeside Villas still shows its 3 units.
- **Not clicked in the browser:**
  - a PDF/video upload through the file picker (the browser pane can't pick local files; this
    was done through the API);
  - the DM screens (no DM employee locally);
  - the booking form's picker (covered by the tests).

**Suites:**

- New failures: none.
- Fixtures updated to the new "approved projects only" booking rule:
  `project-units-pricing` (its test project is now VERIFIED) and
  `inventory-project-hold-gate` (its claim fixture carries the project verification).
- Failures that were already there (unchanged):
  - `projects.test`, `dataScope.test`;
  - test 18 in `project-units-pricing`;
  - `wr5-project-publication`, `public-project-api`, `phase1-public-boundary`;
  - `project-unit-features-activity` (a leftover employee row);
  - the e2e lifecycle and opportunities tests: 403s from the lead-status and task endpoints;
  - the site-visit suites: role-permission and cross-company 403-vs-404 expectations.
- `tsc` is clean for the API, the web app, Sonthillu and Radha.

**Still open (owner decisions, deliberately not built):**

- ~~**#8** — whether prices, units and core details can change after MD approval without
  re-review.~~ Answered and built in the third round below.
- Whether development charges are inside the per-Sq.Yd rate.
- GST on the whole flat price.
- Floor rise charged per floor.
- Payment-stage templates.
- Discount limits and who approves them.

### Third round — owner answers: changes after approval, and duplicate unit numbers (2026-11-02, local only, not committed)

Tests: `tests/api/project-change-history.test.ts`, 3 tests, all pass.

**#8 Changes after approval: allowed, and every change is kept** (owner: "yes, but audit should
be clear what changed").

- An approved (VERIFIED) project's details, prices, pricing rules and units can be changed
  without another review. No new log table: each change is one `AuditEvent` row per field,
  written so it also reads plainly in the table itself:
  `action "PRICING_CHANGE:Base price (Plot)"`, `old_value "₹15,000 / Sq.Yd"`,
  `new_value "₹16,000 / Sq.Yd"`, `reason`, `actor_id`, `created_at`
  (`services/projectChangeLog.ts`).
- **What is recorded:**
  - Project details: every field that really changed (name, RERA, location, approvals, area,
    phase and so on), plus the PM by name and the construction status.
  - Pricing rules: added, changed (rate before and after, with its unit) and removed.
  - Unit price set by hand, or put back to the calculated price.
  - "Recalculate all units": one summary line, plus each unit whose price moved (up to 50).
  - Units: added (with price), removed, and each edited field, plus the price it moved to.
  - Generate Units: one line listing the numbers added.
  - The MD's approval or rejection itself, so History shows where "after approval" starts.
- **Reason:** required for every price change on an approved project (rule add, edit or
  remove; unit price set or cleared). Without one the API answers 400: "This project is
  already approved. Give a reason for the price change — it is kept in the project history."
  Project detail and unit edits accept an optional reason (`change_reason`).
- **MD is told** of every price change on an approved project: an in-app and push
  notification `PROJECT_PRICE_CHANGED`, e.g. "X changed prices on approved project "…"
  (RRH-PJ-…). Base price (Plot): ₹12,000 / Sq.Yd → ₹13,000 / Sq.Yd. Reason: …". The MD who
  made the change is not notified of their own change.
- **Screens:**
  - The details page tab "Activity" is now **History**. Each line shows a Price, Unit or
    Details chip, then "field: before → after", then the reason and "by name · date, time",
    newest first. It can be filtered to Prices, Units or Details.
  - The raw request log (rows like `PUT /api/v1/projects/:id/...`) is no longer mixed in. It
    stays in the table for the audit trail, but its id was often a rule's or unit's id, not
    the project's.
  - On an approved project, the pricing rule form has a "Reason for this price change" box,
    and Remove asks for a reason. The unit price override's "Clear Override" now sends the
    reason typed.
- Before approval (draft or in review) nothing extra is recorded and no reason is asked.
  Editing during review is unchanged: the review lock still covers core fields only.

**Two people, same unit number: what it means and what changed** (owner: "we need a solution
for that and explain about it clearly").

_Without the fix:_ when someone saves a unit, the system first asks "is Plot 12 already
taken?", then saves. If two people (or two browser tabs, or a double-tap on Save) save "Plot
12" in the same split second, both can get "no, it's free" before either has saved. Both
saves go through, and the project has two Plot 12s. The site plan, the booking picker and the
websites then show two Plot 12s, possibly at different prices. A customer could be booked on
one while sales quote the other, and a booking or receipt naming "Plot 12" becomes ambiguous.
This already happened once locally ("A-1" twice in project 9).

_Now:_ the database itself holds the rule "one unit number per project" (a unique key on
project + unit number). However close together two saves arrive, the database accepts exactly
one and refuses the other. The person whose save was refused sees the same plain message as
before, "Unit number "12" is already used in this project. Choose another number.", and
nothing half-saved is left behind. This also covers renaming a unit onto a taken number, and
Generate Units. Upper and lower case count as the same number ("a-1" = "A-1").

_Old duplicates have to be cleaned first_, because the database will not add the rule while
two units already share a number. `docs/changes/sql/2026-11-02_unit_number_unique.sql` does
this in four steps:

1. Lists every repeated number (read-only).
2. Renames the spare copies: `A-1` → `A-1-dup2` (and `-dup3`…). Each rename gets a History
   line on the project with the old and new number and the unit's code. The copy that keeps
   the number is one that is reserved, booked, sold or has booking history, otherwise the
   oldest. **A reserved, booked or sold unit is never renamed.**
3. Checks nothing is left (read-only). Anything listed here is a number shared by two
   _committed_ units. A person has to fix that in the CRM, because the file will not guess
   which customer's unit to rename.
4. Adds the unique key. It fails safely if step 3 still lists anything.

After the clean-up the PMs should give each `-dupN` unit its real number in the Units tab.

**Checked:**

- **Tests** (`project-change-history.test.ts`):
  - a rule change on an approved project without a reason → 400;
  - with a reason, History shows "Base price (Plot) ₹15,000 / Sq.Yd → ₹16,000 / Sq.Yd", the
    reason and the person, and the MD gets the notification;
  - RERA number, unit added, plot area 100 → 120 and price ₹15,00,000 → ₹18,00,000 are
    listed;
  - a draft project records nothing;
  - 2 simultaneous saves of the same number give 201 + 409;
  - with the "is it free?" check switched off, 5 simultaneous saves give exactly one 201 and
    four 409s with the friendly message, so the database key alone holds;
  - renaming onto a taken number gives 409.
- **SQL on `rrh_local`:**
  - Ran the unique-number file with throwaway units added first: one number shared by an
    AVAILABLE, a SOLD and another AVAILABLE unit, and one shared by a BOOKED and a SOLD unit.
  - Result: the SOLD unit kept its number; the two AVAILABLE copies became `-dup2` and
    `-dup3`. The BOOKED/SOLD pair was listed in step 3, and step 4 refused.
  - After deleting only those throwaway units and their two History lines, it ran clean. The
    real duplicate (project 9, unit 7) is now `A-1-dup2`, and the key is in place.
  - The same key was added to the local test database `rrh_test`, which had no duplicates.
- **Browser** (local API on :3020, web on :5176, a throwaway local MD login), on approved
  project 9:
  - "Save Changes" on the base rule without a reason → "This project is approved. Say why
    the price is changing.";
  - with a reason, saved at ₹13,000;
  - "Recalculate All Units" applied;
  - History lists the base price line with its reason, the recalculation summary, each
    unit's ₹12,00,000 → ₹13,00,000, and the duplicate rename.
- **Related suites:**
  - New failures: none.
  - `project-units-pricing` (its project is approved) now passes a reason on its rule and
    price calls; only the old test 18 fails.
  - `projects.test`, `wr5-project-publication` and `project-unit-features-activity` fail as
    before (leftover employee rows), not because of these changes.
- `tsc` is clean for the API and the web app.
- **Not done:** `prisma generate` couldn't replace the query-engine file because another
  local process had it open. The code doesn't depend on the new key's generated types, and
  the next `npm install`/build regenerates it.

**Also fixed:** the three earlier SQL files named tables in lowercase (`projectunit`). That
works on Windows but not on the Linux MariaDB that staging and prod run, where table names are
case-sensitive. They now use the real names (`ProjectUnit`, `Project`, `Property`,
`PropertyLayoutRegion`, `ProjectLayoutImage`), like the other release files.

### Before the push: staging, then prod, in this order

Run these only after the owner approves. Prod runs them **before** the push, because the prod
API auto-deploys from main. There is one schema change, the unique key in step 4, and it is
added by that SQL file (prod doesn't run Prisma migrations).

1. `docs/changes/sql/2026-11-02_plot_units_price_basis.sql`: step 1 (read-only, keep the
   output), then step 2 (the UPDATE).
2. `apps/api/scripts/reprice-plot-units.ts`: a dry run first, then `--apply`. It skips
   reserved, booked and sold units unless `--include-sold`.
3. `docs/changes/sql/2026-11-02_publish_units_of_approved_projects.sql`: step 1 (read-only),
   then step 2 (the UPDATE).
4. `docs/changes/sql/2026-11-02_unit_number_unique.sql`: set `@actor_id` to the id of the
   person running it, then:
   - step 1 (read-only; keep the output);
   - step 2 (renames spare copies; never booked or sold ones);
   - step 3 (read-only; must be empty, otherwise fix the listed units by hand in the CRM first);
   - step 4 (adds the unique key).
     Run it in a client that sends UTF-8 (phpMyAdmin does; the file starts with
     `SET NAMES utf8mb4`).
5. `docs/changes/sql/2026-11-02_project_audit_readonly_checks.sql`: read-only. Keep the output
   and hand the lists to the PMs:
   - check 1 should now be empty (step 4 cleaned it up);
   - old Property units;
   - old pins to place again;
   - HOLD units with no end date.
     Also hand the PMs the `-dupN` units from step 2, to give each its real number.
6. Then push the API and the CRM web app. The website repos (Radha, Sonthillu) are a separate
   build and upload, after the API, because they rely on the API sending an area. Confirm the
   scope before any frontend deploy.

On `rrh_local`, items 1–5 have been run (item 2 re-priced 1 seeded unit; item 3 published 6
units; item 4 renamed 1 duplicate and added the key).

## Top findings

| #   | Severity | Finding                                                                                                                                |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **High** | Project list is cached 5 minutes per user and never cleared. New projects and approval queues don't show up.                           |
| 2   | **High** | Submit, reject and approve send no notifications. The MD screen says "The PM has been informed", but nothing is sent.                  |
| 3   | **High** | The public websites show no units for any project. `ProjectUnit.is_published` is never set to true anywhere.                           |
| 4   | **High** | Unit codes are "count of all units + 1". Deleting a unit makes the next new unit collide, and adding units then fails.                 |
| 5   | Medium   | Saving a name change and a PM change together silently drops the name. The PM can also be set to an employee who isn't a PM.           |
| 6   | Medium   | The same unit number can be created twice in a project.                                                                                |
| 7   | Medium   | The booking and visit pickers offer units from unverified (draft/rejected) projects.                                                   |
| 8   | Medium   | Everything stays editable after MD approval, including prices and units, with no re-review. Pricing rules stay editable during review. |
| 9   | Medium   | The layout/site-plan pin map is disconnected: the save code still looks up the old Property model.                                     |
| 10  | Medium   | Brochures and videos can't be uploaded. The Media tab offers them, but the upload accepts images only.                                 |

Details for these and the smaller findings are below.

---

## 1. Lifecycle

### 1.1 Create — the 7-step wizard

_Works:_

- Step 1 creates the project as a DRAFT, `is_published = false`. Each later step saves itself
  ("Save & Finish Later" and resume both work).
- The Inventory Executive must name the PM.
- A PM who creates a project is auto-assigned to it.
- The PM gets a "New Project Assigned" notification and a push.
- Unit-type-driven steps 3 and 5 work (see the earlier review).

| Finding                        | Where                                 | What goes wrong                                                                                                                                                                                               | Sev.   | Fix                                                                        |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Project code from a count      | `services/project.service.ts:80-85`   | The code is `RRH-PJ-<year>-<count+1>`. If a project row is ever hard-deleted, every new code collides, and the 3 retries recompute the same number. (Today the DELETE route only cancels, so this is latent.) | Low    | Take the next number from `max(id)` or a sequence table, or retry with +1. |
| Step 6 amenities don't connect | `ProjectWizard.tsx` step 6            | They are saved to the deprecated `Project.amenities` JSON. The Amenities tab and pricing use `ProjectAmenity`, so wizard ticks show nowhere useful.                                                           | Medium | Write `ProjectAmenity` rows, or remove the checklist and link to the tab.  |
| PM picker is any employee      | `project.service.ts:174-179, 334-339` | `assigned_pm_id` is only checked against the company. The audit run set the PM to the Inventory Executive and it was accepted.                                                                                | Medium | Require the Project Manager role.                                          |

### 1.2 Submit → Marketing review → MD approval → reject/resubmit

Flow: `DRAFT → PENDING_DM_POLISH → PENDING_MD_APPROVAL → VERIFIED | REJECTED`
(`routes/projects/core.ts:243-440`).

_Works:_

- Each step checks the state it comes from.
- Rejection stores the reason, and the page shows it to the PM.
- Resubmit is allowed from REJECTED and clears the old notes.
- Approval publishes the project and triggers recovery for dropped leads.
- The review lock now blocks a PM's core-field edits while the project is in review (local fix).

| Finding                                      | Where                                                                                     | What goes wrong                                                                                                                                                                                                                                                                                                                                  | Sev. | Fix                                                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| **No notifications**                         | `routes/projects/core.ts:256-440` (no `notification` call anywhere in the project routes) | Nothing is sent on submit, DM forward, approve or reject. The audit run counted **0** new notifications for the PM and MD across the whole cycle. The reject message says "The PM has been informed", which isn't true. Reviewers only find work by opening the list, which is itself stale (next row).                                          | High | Notify, with push and a link: Marketing on submit; MD on forward; PM (and the creator) on approve and on reject, with the reason. |
| **Stale lists / queues**                     | `services/project.service.ts:122-139` + `utils/cache.ts` (5-min TTL, no invalidation)     | The list is cached per user and filter for 5 minutes and never cleared on create, update or approve. Audit run: the IE created a project, re-listed, and the **new project was missing**. A project waiting for MD approval did **not** appear in MD's pending queue (`?verification_status=PENDING_MD_APPROVAL`, used by the MD Action Center). | High | Drop the cache for projects, or clear the user's/company's `projects_*` keys on every project write.                              |
| `md-approve` loads the project without scope | `core.ts:375-385`                                                                         | `requireAuthz(PROJECTS_VERIFY)` has no resource loader, and the lookup is `findFirst({ id })`. Fine with one company; cross-company once there are two.                                                                                                                                                                                          | Low  | Add `projectInScope()`.                                                                                                           |
| DM Executive can "verify as-is"              | `core.ts:336-370`                                                                         | It uses the same `PROJECTS_DM_POLISH` permission as the head, so an executive can skip their own polish step.                                                                                                                                                                                                                                    | Low  | Limit verify-as-is to the DM Head (role check).                                                                                   |
| Wrong role names                             | `core.ts:66-70`                                                                           | The DM-Executive-only filter checks `'Marketing Director'`, `'md'` and `'admin'`, but the real role names are `'marketing director'`, `'Managing director'` and `'Admin (Technical)'`. Only matters for someone holding two roles.                                                                                                               | Low  | Use the `Roles` constants.                                                                                                        |

### 1.3 Verified, edits after verification, hold, cancel

_Works:_

- The status machine (`workflows/project.workflow.ts`) allows PLANNING → UNDER_CONSTRUCTION →
  COMPLETED, plus ON_HOLD and CANCELLED. Status changes are audited.
- Cancel is a soft cancel, blocked while any unit is AVAILABLE, HOLD, RESERVED, BOOKED or SOLD.
- ON_HOLD blocks new bookings (`inventory/reference.ts:157`).

| Finding                                                                                           | Where                                                               | What goes wrong                                                                                                                                                                                                                                                                                                  | Sev.                    | Fix                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name + PM change loses the name**                                                               | `project.service.ts:385-450`                                        | When `assigned_pm_id` changes, the transaction writes **only** the PM and returns, so every other changed field is dropped. Audit run: MD saved a new name and a new PM, and the PM changed but the name didn't. The status-change branch (`:361-384`) skips the PM notifications the same way.                  | Medium                  | Write `updateData` in the same transaction as the PM change and notifications.                                                               |
| ~~No re-review after approval~~ _(owner: allowed with a clear History; built in the third round)_ | `project.service.ts:277+`, `routes/projects/pricing.ts`, `units.ts` | After VERIFIED, the name, RERA no., pricing rules and units can all change with no review, and the project stays public. Rules also stay editable during review: the audit run added a rule while the project was pending.                                                                                       | Medium (owner decision) | Decide (earlier review §7 item 4). For example, rule and core changes on a VERIFIED project send it back to PENDING_MD_APPROVAL, or need MD. |
| Actions shown to people who can't do them                                                         | `ProjectDashboard.tsx:163, 510-535, 1110-1125`                      | Buttons show from the permission alone, not ownership. A PM who isn't assigned sees "Edit Project" and "Put On Hold" on a verified project (seen in the browser), and the server then refuses. "Cancel Project" shows to anyone without the delete permission.                                                   | Low                     | Use the same ownership rule as `ProjectPolicy.canUpdate` / `canDelete`.                                                                      |
| Project status and review status look alike                                                       | Details page header                                                 | "PLANNING" and "Verified" appear side by side as similar chips. Users read "Planning" as not approved.                                                                                                                                                                                                           | Low                     | Label them "Construction: Planning" and "Review: Verified".                                                                                  |
| `ProjectPolicy.canRead` isn't what governs reads                                                  | `policies/project.policy.ts:48-82`                                  | It says a PM sees only their assigned projects and a Telecaller only non-PLANNING ones. In practice reads follow `buildProjectScope` (a Telecaller opened a verified PLANNING project: 200). The comments mislead, and `projects.test.ts` still expects the old rules (its failures are listed as pre-existing). | Low                     | Align the policy and tests with the scope, or remove the unused branch.                                                                      |

## 2. Details page (`ProjectDashboard.tsx`)

Tabs: Overview, Units, Pricing, Amenities, Location, Media, Documents, Buyer updates, Activity,
Settings.

_Works:_

- The header shows the unit counts by status and the review badge.
- Rejection reasons show on the page.
- Units have filters by status.
- The pricing tab reuses the rules panel (now unit-type aware).
- Buyer updates post with photos and are scoped to the project.
- Activity reads the audit events.
- Documents check permissions.
- Every API route behind the tabs passes a scope check (`projectInScope()` /
  `assertProjectInScope`).

| Finding                                  | Where                                                                               | What goes wrong                                                                                                                                                                                                                               | Sev.   | Fix                                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Layout / site-plan pins disconnected** | `ProjectDashboard.tsx` Location tab note; `project.service.ts:777`                  | The tab says the pin map "will reappear shortly". The save code still looks up `tx.property` (the old unit model), so pins can't attach to `ProjectUnit` rows. `ProjectLayoutEditor/Viewer` are only used by the unrendered `ProjectDossier`. | Medium | Point regions at `project_unit_id` (the schema already has `@@unique([layout_image_id, project_unit_id])`) and mount the editor in the Location tab. |
| **Brochure / video upload impossible**   | `routes/projects/core.ts:578` (`imageOnlyUpload`); `ProjectMediaTab.tsx:14-21, 117` | The tab offers Video and Brochure kinds, but the route and the file input accept images only.                                                                                                                                                 | Medium | Use `memoryUpload` with a PDF/video allow-list for those kinds, or drop the two kinds.                                                               |
| Overview not unit-type aware             | `ProjectDashboard.tsx:713`                                                          | A plotted project still shows "Towers / Blocks / Floors" (seen in the browser).                                                                                                                                                               | Low    | Reuse `unitTypeProfile.hasBuildings`.                                                                                                                |
| Dead components                          | `ProjectDossier.tsx`, `BulkUnitWizard.tsx`, `ProjectLayoutEditor/Viewer.tsx`        | They are not rendered anywhere, so readers can't tell which screen is live.                                                                                                                                                                   | Low    | Remove them, or wire the layout pieces back in (row above).                                                                                          |

## 3. Units and inventory

_Works:_

- Add Unit and Generate Units are server-priced. Generate Units has per-row pricing in one
  transaction.
- RESERVED and BOOKED can only be set by bookings. SOLD only from BOOKED.
- Locked units can't change state by hand.
- Deleting a unit is blocked when it is booked or sold, has booking history, or has lead interest.
- Status changes are audited.
- An AVAILABLE unit triggers dropped-lead recovery only when its project is VERIFIED
  (`utils/matchingEngine.ts:370-380`).
- The lock-expiry sweep handles RESERVED units with the agreed keep/cancel rules
  (`jobs/tasks.ts:1131+`).

| Finding                                           | Where                                                                                       | What goes wrong                                                                                                                                                                                                                                                                                                                                                                                      | Sev.       | Fix                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit code collisions**                          | `projectUnit.service.ts:45-52`                                                              | The code is `<project code>-U<count of ALL units + 1>`. After any unit is deleted, the count drops. The next unit added to the project that owns the highest number gets a code that already exists, which is a unique-constraint error and a 500. It stays broken until a unit is created somewhere else. `createUnit` has no retry. _(Read in code; not reproduced, because that needs a delete.)_ | High       | Use a per-project next number from `max()` in the same transaction, or a retry loop like the site-visit code generator.                  |
| **Duplicate unit numbers**                        | Schema `ProjectUnit` (no `@@unique([project_id, unit_number])`); `projectUnit.service.ts`   | Audit run: "A-1" was created twice in project 9, both 201. Two "Plot 12"s then show in the picker, on the layout and in bookings.                                                                                                                                                                                                                                                                    | Medium     | Check in the service now. Add the unique index after cleaning up duplicates (SQL before deploy).                                         |
| Manual HOLD never expires                         | `jobs/tasks.ts:1146-1149`; `hold_until` is never written anywhere in `services` or `routes` | The sweep releases HOLD units whose `hold_until` has passed, but nothing sets `hold_until`. A unit put on HOLD stays held until someone changes it back.                                                                                                                                                                                                                                             | Low–Medium | Ask for a hold period when setting HOLD (e.g. 48 h), or drop the sweep branch.                                                           |
| Booking/visit picker includes unverified projects | `services/inventory.service.ts:108-113`; `inventory/reference.ts:153-175`                   | The picker filters only by the user's project scope, and claiming a unit checks only ON_HOLD. Audit run: MD's picker offered **2 units from unverified projects**. A PM can do the same with their own drafts. The md-approve comment claims booking is gated on VERIFIED.                                                                                                                           | Medium     | Add `project: { verification_status: 'VERIFIED', status: { not: 'CANCELLED' } }` to the AVAILABLE picker query and to `assertClaimable`. |
| Two inventory models side by side                 | `getProject` includes `properties`; `Property.project_id`                                   | Old Property-based units and new `ProjectUnit` rows both hang off a project. The Units tab and counts show only `ProjectUnit`.                                                                                                                                                                                                                                                                       | Low        | One-off check for Property rows with `project_id` set; migrate or archive them.                                                          |

## 4. Pricing and cost sheet

Covered in detail in the [earlier review](project-wizard-pricing-review-2026-11-02.md).

Still open there:

- GST on the whole price for flats;
- per-floor floor rise;
- editing rules in place;
- the villa Generate Units area;
- the booking `agreed_price` is free text with only a warning.

## 5. Linked areas

### Leads and site visits

_Works:_

- A visit's PM comes from the project's assigned PM.
- All units in one visit must belong to one project.
- Dropped-lead recovery waits for VERIFIED.

| Finding                                                 | Where                                  | What goes wrong                                                                                                                                                       | Sev.       | Fix                                                                                                                            |
| ------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Fallback PM uses the lead's location, not the project's | `services/siteVisit/shared.ts:139-145` | A project with no PM routes the visit by the **lead's** preferred location. The project's own city is ignored, and `PMLocationAssignment` is never used for projects. | Low–Medium | Fall back to the project's `city`/`location` first, and warn on unassigned projects (the list already has `?unassigned=true`). |
| Visit's project looked up without company               | `siteVisit/shared.ts:141`              | `project.findFirst({ id })` is not company-scoped, so the client could pass any project id.                                                                           | Low        | Add `company_id`.                                                                                                              |
| Visits for unverified projects                          | same                                   | No verification check, same as the booking picker.                                                                                                                    | Low        | Same fix as §3.                                                                                                                |

### Bookings and payments

_Works:_

- Claim, lock, book and release are row-locked (`FOR UPDATE`) and release only their own hold.
- The expiry sweep keeps bookings that have a form or money.
- A held (ON_HOLD) project blocks new bookings.

Open:

- `agreed_price` is still only warned against, not approved (owner: not decided).
- Installments are entered by hand; payment-stage templates were not built (owner: not sure).
- The picker issue in §3.

### PM location assignment

`PMLocationAssignment` is used to route standalone properties (`property.service.ts:380+`) and
visits with no project. It is **not** used to suggest a PM for a new project. See the visit row
above.

### Public websites (Radha / Sonthillu)

_Works:_

- The project list requires `is_published`, `VERIFIED` and not CANCELLED (`routes/public.ts:676-683`).
- Units hide internal fields.
- Inventory counts come from live statuses.

| Finding                           | Where                                                                                                                                     | What goes wrong                                                                                                                                                                                     | Sev. | Fix                                                                                                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No units ever public**          | `routes/public.ts:175-176` filters `units` on `is_published: true`; schema default is `false`; nothing in `services`/`routes`/web sets it | Every project page on the websites lists **zero units**, while its summary still says "N available". Local data: Lakeside Villas is VERIFIED and published, and all 3 of its units are unpublished. | High | Publish AVAILABLE units when the project is approved (and new units in a verified project), or add a per-unit toggle. Run the same on the prod data. **Check prod first:** `SELECT COUNT(*) FROM projectunit WHERE is_published = 1;` |
| Cancelled project reachable by id | `routes/public.ts:737-742`                                                                                                                | The detail endpoint doesn't exclude CANCELLED; the list does.                                                                                                                                       | Low  | Add `status: { not: 'CANCELLED' }`.                                                                                                                                                                                                   |

### My Property portal

_Works:_ buyer updates only show for projects where the customer has a live (not draft or
cancelled) booking, and they are company-scoped (`projectUpdate.service.ts:168-190`). No issues
found in the code read.

### Notifications

_Works:_

- PM assignment on create.
- PM change through the edit form, to both the old and new PM.
- Buyer-update posts.
- Booking expiry / auto-cancel.

**Missing:** everything in the review chain (§1.2). Also missing on cancel / hold / complete.

## 6. Role access (measured)

Local API, real role permissions, local changes included. "Own" means created by or assigned to
the user.

| Role                                                 | Project list                                        | Verified project detail / units / rules / media | Someone else's draft                 |
| ---------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- | ------------------------------------ |
| Admin, MD                                            | all                                                 | yes                                             | yes (MD tested in the lifecycle run) |
| Project manager                                      | assigned + own + verified                           | yes                                             | own/assigned yes; others no          |
| Inventory Executive                                  | verified + own                                      | yes                                             | own yes; others no (local change)    |
| Data Entry                                           | verified + own                                      | yes                                             | no                                   |
| Sales manager, Telecaller, HR, Digital lead operator | verified                                            | yes                                             | no (404)                             |
| Agent                                                | only verified projects where they have a site visit | none without a visit (404)                      | no                                   |
| Staff                                                | no project permission (403)                         | 403                                             | 403                                  |
| DM Head / DM Executive                               | verified + their polish queue                       | (code read)                                     | (code read)                          |
| Finance                                              | `projects.read`; 2-step                             | (not run)                                       | —                                    |

Write rights (`policies/project.policy.ts`):

- Admin, MD and the "management" roles can edit any project in the company. Management here
  includes HR, Marketing Director, Digital lead operator and DM Head, but only where the role
  holds `projects.update`.
- The Digital lead operator holds `projects.update` (`packages/shared/src/auth.ts`), so they can
  edit any verified project they see. _Check this is intended._
- Inventory Executive and Data Entry can edit any project they can see.
- A PM can edit only assigned projects, or projects they created that have no PM.

## 7. What works well

- Every project, unit, pricing, amenity, media and document route checks both permission and
  data scope. No route was found that skips the scope check, apart from `md-approve` (§1.2).
- Prices are computed only on the server and stored as line items, so a quote can be reproduced.
- Booking locks are race-safe and release only their own hold.
- The review chain is a proper state machine with from-state checks, and rejection reasons
  reach the PM on the page.
- Cancelling a project can't strand a customer: it is blocked while units are live.
- The public API only exposes MD-approved projects.
- Dropped-lead recovery respects verification.

## 8. Prioritised fix list

1. **Remove or invalidate the project list cache** (§1.2). It's a small change and unblocks the
   MD queue and "I can't see my project".
2. **Review-chain notifications** (§1.2), with a link to the project.
3. **Publish units for the public sites** (§5). Check the prod count first, then backfill with
   SQL before deploying.
4. **Unit code generation** (§3), plus a per-project unit-number uniqueness check.
5. **Name + PM save drops fields**, and restrict the PM picker to PMs (§1.1, §1.3).
6. **Verified-only booking/visit picker** (§3).
7. **Decide the post-approval edit rule** (re-review for prices/core fields), then implement it.
8. Media upload for brochures and videos; reconnect layout pins (§2).
9. Smaller items:
   - HOLD expiry;
   - `md-approve` scope;
   - DM verify-as-is limited to the head;
   - role-name constants;
   - button visibility by ownership;
   - the Overview tab for plots;
   - cancelled projects on the public detail endpoint;
   - removing dead components.

## 9. Test data left in `rrh_local`

- Project 9 ("AUDIT lifecycle 9 …"): VERIFIED, PM now the Inventory Executive, from the
  name+PM test. Its second "A-1" (unit 7) was renamed `A-1-dup2` by the unique-number SQL. Its
  base rule is now ₹13,000 / Sq.Yd and its 5 units were recalculated (third-round browser
  check), so its History has those lines.
- Employee 999941 "History Check MD" (RRH-TST-941): a throwaway local login for the browser
  check. Its sessions are removed and it is set INACTIVE; it is kept so the History lines it
  wrote still show a name.
- Projects 5–8 and unit 5 from earlier today.
- Deleted: only the five throwaway duplicate units (ids 16–20) and their two History lines,
  created to test the clean-up SQL.
