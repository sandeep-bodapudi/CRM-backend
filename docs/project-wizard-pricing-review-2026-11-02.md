# Project wizard, verification and pricing review — 2026-11-02

Scope: the 7-step project wizard (`apps/web/src/components/projects/ProjectWizard.tsx`,
`PricingRulesPanel.tsx`), the project verification flow (`apps/api/src/routes/projects/core.ts`),
and the server pricing engine (`apps/api/src/services/pricing/engine.ts`, `pricing.service.ts`).
Each is compared with how plot ventures and apartments are actually sold around Hyderabad.

See also: [Project workflow audit](project-workflow-audit-2026-11-02.md), which covers the
whole project workflow and its linked areas.

Status: built and checked on the local stack only. Nothing is committed, pushed or deployed.
Staging and prod come after the owner approves (§7).

Changes since the first version of this report:

- The owner answered the questions (§6).
- Every project screen now follows the unit type (§2).
- The visibility rule, the review lock, and the below-list-price warning are done (§3).
- The data fix for existing plots is prepared and was run locally (§1).

---

## 1. The bug the user saw on step 5 (fixed)

**What happened.** Step 5's Sample Unit Calculator: PLOT, 150 Sq.Yd, EAST, with the rules
"Base price ₹15,000 / Sq.Yd" and "East Facing". It showed `Base price (0 × ₹15,000) ₹0`
and "needs SUPER_BUILT_UP area but the unit has none — charged 0".

**Why.** Three defaults stacked up:

1. The wizard's "Default Price Basis" started at `SUPER_BUILT_UP` for every project.
2. The rule form left "Area Basis" on "Use unit's own basis", so rules were saved with
   `area_basis = NULL`.
3. The calculator sent no `price_basis`, so the preview fell back to the project default.

A plot has no super built-up area, so every per-Sq.Yd rule priced it at 0. The same fallback hit
plot units created through the API without a basis: they got the column default `SUPER_BUILT_UP`.

The flat calculator had a second, separate bug. It sent the area as a generic `area_value`, which
is stored as `area_sqft`. A flat is priced on `super_built_up_area_sqft`, so a flat sample also
came out at 0.

**Fix.** The price basis is now fixed by unit type (owner's answer, §6 Q2):

| Unit type     | Priced on                  | Rate unit |
| ------------- | -------------------------- | --------- |
| Plot          | plot area                  | ₹ / Sq.Yd |
| Flat          | super built-up area        | ₹ / Sq.Ft |
| Villa / House | built-up area (unchanged)  | ₹ / Sq.Ft |
| Commercial    | super built-up (unchanged) | ₹ / Sq.Ft |

- **Server** (`shared/measurement.ts`): `FIXED_PRICE_BASIS` and `resolveUnitPriceBasis()`.
  They are used by the preview, unit create, unit update and recalculation, so a plot or flat
  can't be priced on any other basis even if a client sends one. Updating an old wrong row also
  corrects its basis.
- **Web**: the calculator sends the right area field and the fixed basis for the chosen type.

**Existing data.** `docs/changes/sql/2026-11-02_plot_units_price_basis.sql` has three steps:

1. A read-only list of the plots and flats on the wrong basis. Save it: it is the record of the
   old prices.
2. An `UPDATE` that sets the plots' basis to `PLOT_AREA`.
3. Run `apps/api/scripts/reprice-plot-units.ts`. It re-prices those plots through the real
   pricing engine: a dry run by default, `--apply` to write. It skips RESERVED/BOOKED/SOLD units
   unless `--include-sold`, because their price is what the customer agreed. Units with an
   override keep the override.

Run locally on `rrh_local` (no wrong rows existed there, so one was seeded in test project 6):
the SQL corrected 1 row, and the script re-priced it from ₹0 to ₹23,25,000
(150 × 15,000 + 150 × 500). Flats on a non-super-built-up basis are only reported by the SQL,
not changed.

## 2. Screens now follow the unit type

The owner asked that a flat shows only flat details and a plot only plot details, everywhere.

The project's **Project Type** (step 1) decides which unit types it sells. The mapping lives in
`apps/web/src/components/projects/unitTypeProfile.ts`:

| Project type                                  | Unit types offered          |
| --------------------------------------------- | --------------------------- |
| Plotted Development, Agricultural / Farm Land | Plot                        |
| Apartment / Flats                             | Flat                        |
| Villas, Row Houses                            | Villa                       |
| Independent Houses                            | House                       |
| Commercial Shops / Office                     | Commercial                  |
| Mixed Residential                             | Flat, Villa                 |
| Mixed Use                                     | Flat, Commercial            |
| Farm Houses                                   | Villa, Plot                 |
| Township, Gated Community, Other, none        | all types (per-unit choice) |

When a project sells more than one type, each screen shows a unit-type choice and then only that
type's fields ("mixed project: per unit type").

| Screen                         | Plot shows                                                                                                                                                                                     | Flat shows                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wizard step 3                  | Total area, Blocks / Phases, Planned Plots, phase, dates. No towers or floors.                                                                                                                 | Towers, Blocks, Floors, Planned Flats, …                                                                                                                                                                           |
| Wizard step 5                  | Price basis is no longer a free choice: it is saved from the unit type (Plot Area + Sq.Yd, or Super Built-up + Sq.Ft).                                                                         | —                                                                                                                                                                                                                  |
| Rule form                      | "Applies to: Plots". Categories: Facing, Corner, Road-facing, Park-facing, Development / Infrastructure, Maintenance, Legal, Club, Other. Rates: ₹/Sq.Yd, fixed, % of base. **No Tax option.** | "Applies to: Flats". Categories: Facing, Floor rise, Corner, View, BHK, Car Parking, Development, Maintenance, Legal, Club, Other, and Tax (GST). Rates: ₹/Sq.Ft, fixed, % of base, ₹ per car park (parking only). |
| Sample calculator              | Plot area (Sq.Yd), facing, corner / road-facing / park-facing                                                                                                                                  | Super built-up (Sq.Ft), floor, BHK, car parks, facing, corner flat                                                                                                                                                 |
| Add Unit                       | Plot no., survey no., plot area, length/width, road width, facing, corner/road/park/main-road                                                                                                  | Tower, floor, flat no., BHK, bedrooms/bathrooms/balconies, **super built-up only** (carpet and built-up inputs removed), view, car parks, facing, corner                                                           |
| Generate Units (the bulk path) | Plot mode only                                                                                                                                                                                 | Flat mode only. Each row now also takes its own super built-up area.                                                                                                                                               |

The rule form also no longer has the per-rule "Area Basis" override; a rule always uses the
unit's fixed basis. Every new rule is saved with its unit type (`applies_to_unit_type`). In a mixed
project this also fixes the old "first BASE_RATE wins" problem: plots and flats each get their own
base rate.

**Bulk upload:** `BulkUnitWizard.tsx` is only reachable from `ProjectDossier.tsx`, which nothing
renders, so it is dead code and was left alone. Generate Units is the live bulk path. There is no
CSV upload for project units.

**No GST on plots** (Q1): enforced in three places.

- The rule form offers no Tax option for plots.
- The API refuses a tax rule for plots (400).
- The engine never applies a tax rule to a plot, even a project-wide one in a mixed project.

**Development charges** (Q1, still open): there is no separate field for them. Add them, if
needed, as their own "Charge → Development / Infrastructure" rule (the empty-state text says so).
The per-unit "optional rule" mechanism (`is_mandatory = false`) has no UI for ticking a rule on a
unit, so it isn't offered.

## 3. Verification, visibility and lock

Flow: `DRAFT → PENDING_DM_POLISH → PENDING_MD_APPROVAL → VERIFIED | REJECTED`.
MD approval publishes the project.

**Who sees a project before it is verified** (Q3: "only the person who added it, the person
assigned to verify it, Admin and MD"). In `authz/dataScope.ts` `buildProjectScope`:

| Role                                  | Sees unverified projects                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin, MD                             | all                                                                                                                                                            |
| Person who added it (`created_by_id`) | their own, in every role                                                                                                                                       |
| Assigned PM                           | their assigned projects. Kept: the PM owns the project and is the one who submits it. When an Inventory Executive enters it, it is entered on the PM's behalf. |
| Digital Marketing Head                | projects waiting for Marketing review (they verify that step)                                                                                                  |
| DM Executive                          | projects assigned to them for polish                                                                                                                           |
| **Inventory Executive, Data Entry**   | **changed:** before, they saw every project, including other people's drafts. Now they see only VERIFIED projects plus the ones they added.                    |
| Everyone else                         | VERIFIED only, plus their own (unchanged)                                                                                                                      |

**Status shown clearly.** Every project card in the list now has a review chip: Draft, Pending
Marketing Review, Pending MD Approval, Verified or Rejected. The project page already showed one.

**Lock (kept small, as asked).** The old check read `project.status === 'PENDING_VERIFICATION'`,
a value the operational `status` field never holds, so it never locked anything. Now:

- While a project is in review (`PENDING_DM_POLISH` / `PENDING_MD_APPROVAL`), its core details
  are locked for everyone except Admin and MD: name, type, location, RERA no., PM, status and
  dates.
- Only a value that actually changes counts as an edit. The wizard re-sends whole steps, so
  opening and re-saving a pending project still works.
- Pricing rules and units are **not** locked; that is left as an owner decision (§7 item 4).

**Submit checks:** none added. RERA and LP numbers stay optional (Q4).

## 4. Pricing engine vs. real cost sheets

The engine's model is sound and matches a builder cost sheet: base (BSP) + PLC premiums +
charges − discount = consideration, with taxes kept separate and lines persisted so a quote stays
reproducible. Remaining gaps:

| Gap                                                              | Real practice                                                                          | Status                                                                                                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| GST only as `% of base`.                                         | GST on an under-construction flat is on the whole consideration: base + PLC + charges. | Open (§7). Plots: no GST, now enforced.                                                                                                         |
| Stamp duty / registration.                                       | Paid to the government; not part of the builder total.                                 | **Decided: stays off the cost sheet** (Q5).                                                                                                     |
| Wizard step 6 amenities don't price.                             | Club and corpus lines are standard.                                                    | Open (§7).                                                                                                                                      |
| Rules can't be edited in place, only added and removed.          | —                                                                                      | Open.                                                                                                                                           |
| Floor rise is a flat amount per floor band.                      | Usually ₹X/Sq.Ft per floor above a set floor.                                          | Open. Bands work today, e.g. "Floor rise 5–10: ₹100/Sq.Ft". A true per-floor rate needs a new calculation method, which means a DB enum change. |
| Booking agreed price not compared with the unit's price.         | —                                                                                      | **Done: warning only** (Q7). The booking form shows "Below the list price of ₹X by ₹Y (Z%)". No approval step.                                  |
| Payment schedule templates.                                      | Stage-linked plans.                                                                    | **Not built** (Q6: not sure).                                                                                                                   |
| Villa generation prices on built-up but only asks for plot area. | —                                                                                      | Found while testing; not fixed (§7 item 6).                                                                                                     |

## 5. What was checked

- **Tests:** `tests/api/plot-price-basis.test.ts`, 11 tests, all pass on the local `rrh_test` DB.
  They cover:
  - the fixed basis rules;
  - the 150 Sq.Yd plot preview (₹23,25,000);
  - a plot sent with a flat basis;
  - a plot created without a basis;
  - a flat forced to super built-up;
  - the plot tax rule refused;
  - a project-wide tax never landing on a plot;
  - Inventory/Data-entry visibility;
  - the review lock (a PM change is refused, an unchanged re-save is allowed, Admin can still
    correct).
- **Existing suites:** `pricing-engine.test.ts` (34) passes. `project-units-pricing.test.ts` is
  21/22.
- **Failures that were already there before this work:**
  - test 18 cancels a booking with no reason, which the API now requires;
  - `projects.test.ts` and `dataScope.test.ts` have older expectations (403 vs 404, `company_id`
    shape, telecaller scope) in code this work didn't touch.
- **Type checks:** `tsc --noEmit` is clean for `apps/api` and `apps/web`.
- **In the browser,** on the local stack (API on `rrh_local`, web on :5174), signed in as the
  local test PM:
  - Plotted project, desktop:
    - step 3 shows Blocks / Phases and Planned Plots, with no Towers or Floors;
    - in step 5, the rule form offers no Tax, Floor, View, BHK, Parking or Sq.Ft options;
    - "Base price ₹15,000/Sq.Yd" and "East Facing ₹500/Sq.Yd" were added through the form;
    - the calculator showed 150 × 15,000 = ₹22,50,000, + 150 × 500 = ₹75,000, total ₹23,25,000,
      with no warnings;
    - the project saved Plot Area + Sq.Yd;
    - Add Unit shows plot fields only, with no type picker;
    - Generate Units offers Plot only.
  - Apartment project, phone width (375 px):
    - step 3 shows Towers and Planned Flats;
    - the rule form shows flat categories, ₹/Sq.Ft and Tax;
    - the calculator shows Super Built-up, Floor, BHK and Car Parks;
    - a ₹6,000/Sq.Ft base gave 1200 × 6,000 = ₹72,00,000.
  - The project list shows the review chips.
- **Not checked in the browser:**
  - the booking below-list-price warning (type-checked only);
  - a mixed project's per-type picker;
  - the Inventory Executive view.
- **Local test data left in `rrh_local`:** projects 5–8 and unit 5.

## 6. Owner's answers (2026-11-02)

1. **Plots:** no GST. Whether development charges are part of the per-Sq.Yd rate is still open,
   so they stay an optional separate rule.
2. **Area basis:** flats are priced on super built-up area only; residential plots on plot area
   in Sq.Yd.
3. **Visibility:** a project waiting for verification is visible only to the person who added
   it, the person assigned to verify it, Admin and MD. Each of them sees its status clearly.
   _(The answer covered who sees it, not what is locked; the small lock in §3 is our choice.)_
4. **Submission:** RERA and LP/approval numbers are optional; no blocking on them.
5. **Cost sheet:** stamp duty and registration estimates stay off it.
6. **Payment stages:** not sure; not built.
7. **Discounts:** maximum discount and approver not decided; no approval built. A warning when
   the agreed price is below list is fine (built).
8. **Existing plots on the wrong basis:** correct and re-price them. SQL prepared and run
   locally; staging/prod after approval.

## 7. Plan from here

**Release steps for this work, once approved, in order:**

1. Staging DB: run step 1 of the SQL and keep its output, then step 2, then the re-price script
   (dry run, then `--apply`).
2. Push to staging and re-check the step-5 calculator there.
3. Prod: the same SQL and script **before** pushing. The prod API auto-deploys from main.
4. Frontend deploy: confirm the scope first (no staging gate on the frontend).

No schema change is needed for this work.

**Still open, in priority order:**

1. GST on the whole consideration for flats: a new calculation method (DB enum change).
2. ~~Connect wizard step 6 amenities to the charge model.~~ **Done 2026-11-02:** step 6 now
   embeds the Amenities editor (see the [workflow audit](project-workflow-audit-2026-11-02.md)).
3. ~~Edit rules in place~~ (**done 2026-11-02**). Per-floor floor rise is still open (DB enum
   change; owner decision).
4. ~~Decide whether pricing rules and units should lock while a project is in review or after it is
   VERIFIED.~~ **Owner, 2026-11-02:** they stay editable after approval, with a clear record.
   Built: every change to an approved project is kept in its History tab (before → after, who,
   when), a reason is required for price changes, and the MD is notified (see the third round in
   the [workflow audit](project-workflow-audit-2026-11-02.md)). Not locked during review either
   (unchanged).
5. Development charges: the owner to confirm whether they are inside the per-Sq.Yd rate.
6. ~~Villa generation: ask for built-up area.~~ **Done 2026-11-02.**
7. Payment-stage templates and discount approval: wait for the owner's numbers.
8. ~~`md-approve` loads the project without a company filter.~~ **Done 2026-11-02.**
