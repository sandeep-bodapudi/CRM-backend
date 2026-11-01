# My Property portal: rebuild on the CRM (plan, 2026-11-01)

## Decisions (user, 2026-11-01)

| Question                       | Answer                                                                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the portal gets its data | **The CRM.** The portal becomes a front end of `apps/api`. The old portal server (`My property portal/backend`, Express + its own DB) and its DB (`u988844918_myproperty_db`, test data only) are retired. |
| Who uses it                    | **Customers and staff.** Staff use their CRM employee login.                                                                                                                                               |
| Customer login                 | **Phone + password.** At booking the CRM already creates a temporary password (24 h, must be changed on first login) and the PM sends it on WhatsApp.                                                      |
| Look                           | **Follows the customer's company.** A Radha customer sees Radha's logo and colours; a Sonthillu customer sees Sonthillu's.                                                                                 |

## Why

- The separate portal backend lived on Render (`my-property-ybck`), which has since been deleted. The live site at myproperty.sonthilluconstructions.com can't log in or load anything, and every page except `/` returns 404.
- Keeping the portal on the CRM means one server and one database, with no copying of bookings or payments between them.

## Phases

1. **CRM customer API.** No DB change. Mounted at `/api/v1/customer`, with its own token (customers' tokens never work on staff routes).
   - `POST /customer/auth/login`, `POST /customer/auth/change-password`, `GET /customer/me`. Branding comes from the company.
   - `GET /customer/bookings`, `GET /customer/bookings/:id`. These cover the property or unit, project, price, instalments, payments and receipts.
   - Notifications: list, mark read.
   - Requests/complaints: list, create.
   - Project documents and photos the company has published.
2. **New portal front end (customer side).** Mobile-first, branded per company. Screens:
   - Home: next payment due, booking status, latest updates.
   - My property.
   - Payments: schedule, paid, due, receipts.
   - Documents.
   - Updates.
   - Help/requests.
   - Profile, including password change.
3. **Staff side.** CRM login.
   - Post construction-progress updates with photos for a project. This needs a new CRM table, which is a DB change (staging first, production SQL by the user).
   - Send announcements to a project's customers.
   - Answer customer requests.
   - See which customers have activated the portal.

   **Done 2026-11-01 (local, not deployed):**
   - New table `ProjectUpdate` (`apps/api/prisma/manual-migrations/2026-11-01_project_updates.sql`). Run it on staging, then production, before the code goes live.
   - CRM, Projects → project → **Buyer updates**: post construction progress (up to 6 photos) or an announcement. Every buyer (booking not draft/cancelled) gets a notification. Removing a post also hides its notifications.
   - CRM, Customers: a **Portal** column (Not invited / Invited / Invite expired / Using the portal), and **Give portal access** in the customer details. It issues a 24-hour temporary password and a WhatsApp message with the portal link (`MY_PROPERTY_URL`, default myproperty.sonthilluconstructions.com). The same button resets a forgotten password.
   - Requests: the employee on the booking (else the customer's assigned employee) is notified of a new request. Resolving a complaint notifies the customer and shows the answer in the portal.
   - The customer API no longer sends `password_hash` to staff.
   - Portal: Updates shows site posts with photos. Home shows the latest site post that has photos.
   - Checks: `D:/HYD/claude-work/scripts/my-property-phase3-check.mjs` (26/26), plus phase 1 (17/17).

4. **Go live.**
   - Deploy to myproperty.sonthilluconstructions.com, with an `.htaccess` fallback so links work. Add a Radha address if wanted.
   - ~~Switch the booking flow's credential message to the portal link.~~ Done in phase 3. Set `MY_PROPERTY_URL` on the API if the address changes.
   - Retire the old portal server and DB.

## Security fixes carried over from the 31 Oct audit

These portal findings disappear with the old backend:

- #6: any user could replace documents.
- #7: the login secret had a default.
- #9: a mock app with a hard-coded secret.
- #14: rate limits behind the proxy.

The new endpoints get the following from the start:

- An ownership check on every read.
- A login rate limit per phone number.
- A token tied to the password, so a password change logs out other devices.
