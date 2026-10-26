# DMS implementation and release checklist

## Sign-in resend update — 22 October 2026

- `POST /api/dms/auth/request-code` accepts `{email}`. Each accepted request for a unique active distributor sends a new six-digit, one-use code (10-minute expiry); a successful resend replaces the previous code. Codes are never returned in the API response. Missing/ambiguous logins retain a generic response to avoid account enumeration.
- Existing limits remain: one request per email per 60 seconds and 20 requests per IP per 10 minutes. Rapid requests return HTTP 429. Email rejection returns HTTP 503 and does not replace an existing unexpired challenge.
- The sign-in page has a direct **Send a new code** action with a 60-second countdown, plus a separate **Change email address** action. Verification remains available during the resend cooldown. The message distinguishes a request accepted by Salesforce from confirmed inbox delivery.
- Local regression tests cover replacement, old-code rejection, cooldown and failed resends. Inbox delivery remains unconfirmed; the recipient reported missing emails. Do not describe the SMTP/Gmail delivery issue as resolved by this UI change.

Updated 21 October 2026, after distributor self-service primary ordering. This is a working development release, not a completed production rollout. DMS uses review backend 4001 and web app 8082. The existing SFA backend on 4000 has not been restarted or replaced.

## Distributor Place Primary Order

- DMS → Orders → Primary orders → Place Primary Order now supports multiple products, whole case quantities, optional product-linked Primary schemes, order notes, review and submission. Visible field labels do not depend on placeholders. The base value is explicitly before scheme discounts and GST; Salesforce calculates the final order value.
- New authenticated routes: `GET /api/dms/primary/catalogue` and `POST /api/dms/primary/orders`. Distributor identity comes from the verified session. Clients cannot supply an employee, distributor, approver or price. Catalogue reads current active sellable products and active, in-date, product-linked Primary schemes matching the distributor geography. Salesforce repeats eligibility/quantity validation at save time.
- Both entry paths share `DmsEmployeeTransactions` pricing and the existing Company Officer Approval process. Distributor entries use action `distributorPrimaryOrder`, leave Employee empty intentionally, and store Order Source = Distributor DMS. SFA still requires the authenticated allocated employee; no employee menu flag, SFA runtime or APK was changed.
- All three active distributors were verified as assigned to active company officer **Dhanush SFA**. Approval assigns the distributor's configured Officer field, not a hard-coded user. Approval alone does not increase inventory; goods receipt remains separate.
- Orders are persisted in the existing distributor-specific device outbox before sending. Retries retain the same UUID and payload. Salesforce locks the distributor and prevents duplicates or changed-payload replay; header, lines and approval submission are atomic. Rejected requests remain visible in Sync for correction, not shown as successful orders.
- Salesforce deployment `0AfjV000004agjCSAQ` succeeded: 19 Apex tests, zero failures. These cover distributor schemes, approval assignment, replay, rejection of invalid requests, no partial writes, unchanged employee ordering and existing receiving/return workflows. Test records roll back; no real customer order was placed.
- Backend: 41 tests passed, including the new authenticated routes through the actual HTTP transport against the existing local Salesforce simulation. It covers catalogue selection, submission, replay and validation. The mock reflects the local Apex contract, not a substitute for live business-order acceptance. Simulation has been stopped; no Postman workspace push was performed.
- DMS TypeScript, form/render tests and web export passed. SFA's 26 mobile tests passed. The new button was observed in the actual browser. DMS backend was restarted with user approval; its existing session needs renewal. Authenticated live form submission has not been completed.
- Live production-transport catalogue checks returned 24 products for each distributor, **0 products ready with valid case prices/conversions**, and **0 applicable Primary schemes**. Approved Primary Case Price, whole Units Per Case and real scheme rules must be configured before placing real orders. No business prices or promotions were invented. Read-only verification script: `sales-rep-mobile/backend/scripts/check-primary-catalogue.ts`.
- Release manifest: `manifest/dms-distributor-order.xml`. No new mobile APK or cloud hosting deployment was performed.

## Latest management-report update

- Home now prioritises Sales vs Target, Beat Productivity, Outlet Coverage and Distributor Stock. More → Dashboard and reports provides employee, area and product breakdowns and batch details. Purchases vs sold remains below the four priority reports.
- `DMS_Sales_Target__c` stores first-of-month targets by distributor, optionally one employee, area or product. A unique generated key rejects duplicate scope/month targets. Configure an overall target separately: breakdowns are never added together to invent one. No target amounts were invented.
- Sales means booked secondary orders in Submitted/Fulfilled state, excluding distributor rejection. This is deliberately distinct from issued invoice revenue. Current India-calendar month is compared with the previous full month. Order totals may include tax; product rows use stored line amounts.
- Beat reporting counts this distributor's distinct active assigned outlets in approved monthly PJP beats. Visits are Checked In or Completed; productive shops have an order associated with a qualifying visit. Current outlet beat/area assignments are used; plans are beat-level, not per-day call-frequency targets. Ad-hoc visited shops can exceed planned shops.
- Coverage means active assigned outlets with positive booked sales this month divided by all active assigned outlets, with area breakdowns. Empty denominators and missing targets produce null/not-configured, not fabricated percentages.
- Stock uses current Salesforce inventory batches. Near expiry means within 30 days. No invoice stock movement in 30 days is a review flag, not proof of low demand; new stock can also be flagged. Actual invoice posting/stock deduction remains a separate unfinished workflow.
- DMS now reads Asset Survey records for its assigned outlets, including asset code, condition, given date and employee. Existing scoped orders, returns, SFA tickets and stock checks remain available.
- Distributor support categories remain Product, Portal and Delivery. Salesforce enforces Open → In Progress → Closed, or rejection from Open/In Progress. Only the assigned officer or a user with the new support-administrator permission can change status. Closure/rejection requires a reason. The existing company officer already has ticket access; the existing integration/admin user received the new report/target/support permissions.
- The active app refreshes activity every 20 seconds and reports approximately once per minute; manual Sync refreshes both. Background apps do not poll. This is near-real-time polling, NOT instant push/CDC. Offline employee drafts cannot reach DMS until committed to Salesforce. Polling/API quota must be reviewed before production scale.
- One-time scoped repairs linked eight inspected historical submitted orders and one historical return to their outlets' existing distributors. Only previously null distributor/status fields changed; all remain Pending, never auto-approved. Distributor 1 has six orders and one return; Distributor 2 has two orders. Repair scripts retain IDs and preconditions in `scripts/apex/`.
- Salesforce deployment `0AfjV000004a4duSAA` succeeded with 12 selected Apex tests. Backend: 38 tests passed including six actual-HTTP Postman simulation cases. SFA mobile: 26 tests passed and typecheck passed. DMS typecheck, rendered-component checks and web export passed. Live read queries verified report fields/relationships and asset retrieval, including the production DMS query transport.
- Distributor 1 now has a configured login email; Distributor 2 and 3 still have none. The user signed into Distributor 1 during verification. The live browser showed ₹41,606.21 booked sales, 5/32 active buyers (15.6%), 14 visited/21 planned shops, and six pending orders. Detailed reports, assets and support-category/status screens were inspected without placing orders or making approvals. No APK or instant-push configuration was produced in this update.

## Implemented in this release

| Requirement | Current implementation |
| --- | --- |
| Separate distributor app | `dms-mobile` contains sign-in, dashboard, primary orders, secondary decisions, returns, inventory, support tickets, outlets, stock checks and pending-sync screens. The local review URL is http://localhost:8082/. |
| Employee primary orders | New SFA Primary screen and `/api/primary` routes create orders in cases using Salesforce prices/conversions and submit to the company officer. This additive screen is hidden until `EXPO_PUBLIC_ENABLE_DMS_PRIMARY=true` is set for a release with the updated backend. Existing outlet ordering is unchanged. |
| Primary returns | Employees select original received purchase lines and a reason. Return quantity cannot exceed received cases less other non-rejected returns. Salesforce submits the return to the company officer. This submits an approval request; it does not issue a credit note or post a stock adjustment. |
| Officer approvals | Existing company officer approval processes remain the authority for primary orders and returns. The distributor app shows their statuses and cannot approve them. |
| Secondary decisions | Distributor sessions can approve/reject only orders and returns assigned to that distributor. Rejection requires a reason. Approval alone does not move inventory. |
| Goods receipts | The DMS command receives paid or free cases separately against approved primary lines. It checks remaining entitlements, snapshots product conversions, records batch/expiry and increases stock atomically. Replays do not increase stock twice. Different-product free cases use their own snapshotted conversion and zero cost. |
| Primary schemes | Employee primary entry accepts one eligible Primary scheme per product. Salesforce validates dates, product links, geography and whole case thresholds. Discounts, free cases and gifts repeat per complete buy block; percentage discount applies to the paid line. Order lines store the scheme, free product and its conversion. Blank-channel legacy schemes remain usable only in the existing secondary flow; Primary schemes are excluded from secondary selection and new secondary order items. |
| Dashboard | Home has a purchased-versus-sold chart for six calendar months plus lifetime totals, independently aggregated from received goods cost and issued invoice values. It is not a profit calculation or net-of-returns report. Pending/rejected orders are not counted as received goods or sales. |
| Company officer surveys | New private Distributor Survey object, product, observed cases, movement/demand notes, officer, visit date and next monthly visit due. Related on Distributor; available in DMS Management. Only the assigned officer can create/edit surveys. Dhanush SFA has the scoped survey permission. |
| Support tickets | New `DMS_Support_Ticket__c`: Product, Portal or Delivery; Open → In Progress → Closed, or Open/In Progress → Rejected. A resolution is required for closure/rejection. Tickets belong to the company officer. The DMS app also reads relevant outlet tickets from SFA. |
| Inventory visibility | Distributor/product/batch quantities, expiry and low-stock flags appear in DMS. |
| Offline handling | DMS caches a labelled Salesforce snapshot and persists requests before sending. SFA primary requests have an employee-specific queue. Stable request keys protect retries after lost responses. Rejected requests remain visible for review. First login/data download and server approval need connectivity. |
| Scope protection | DMS has a separate token audience/signing key. SFA tokens cannot enter DMS. Employee and distributor IDs are derived on the backend, not trusted from the submitted form. Salesforce writes require the trusted-backend custom permission. |

## Work still required before claiming all recording requirements are complete

- Configure actual Primary schemes and valid case prices/conversions before live primary ordering. The implementation is present; no business prices or promotions were invented.
- Secondary invoice creation and verified stock deduction, payment/credit-note handling and return stock disposition. Invoice totals shown today are existing issued records, not an implemented invoice-creation flow.
- Lifecycle protection for manual Salesforce GRN/invoice edits. Current stock posting occurs through the command; manual edits do not invoke a complete stock ledger. Gifts are snapshotted as text/quantity, not treated as inventory products.
- Production scale review of report pagination/performance and polling API usage. The four operational reports now read complete scoped queries; detail lists/order pipeline remain capped and clearly labelled.
- End-to-end real distributor login, phone offline/reconnect testing, stable HTTPS hosting and an installable APK. Browser export is not an APK.
- Review the dependency audit before production release: the DMS dependency tree currently reports 35 advisories, including transitive tooling packages. No breaking Expo/React Native upgrade was forced into the existing SFA project.

## Business data needed

### 22 October: goods-receipt form and confirmation

The DMS receipt form now accepts ISO `2026-12-14` and day-first `14-12-2026`,
normalising to ISO before the existing API call. Invalid calendar dates, fractional
or out-of-range cases and empty/overlength batches are rejected beside the form.
Review scrolls to the existing Confirm and save panel; review alone does not post
stock. Salesforce-confirmed receipt identifiers and the refreshed Goods Receipts
list now appear under Orders. Offline/unconfirmed work stays in the queue and is
not described as received. No SFA code or live backend implementation changed.

Verification: DMS TypeScript and UI regression checks passed; local Postman
HTTP simulation passed 8 tests, including authenticated receipt submission,
same-key replay and read-back. The existing deployed Salesforce test
`DmsPortalApiTest.receivesApprovedGoodsOnceWithoutOverReceiving` passed in run
`707jV000007p2iH`, verifying receipt/line creation, stock posting, retry safety and
over-receipt rejection using rolled-back test records. No real receipt was
submitted on the user's behalf as part of these checks. The production API still
accepts ISO dates only; the UI is responsible for conversion.

### 22 October: authorised DMS demo-data batch

Batch `DEMO-20261022` added 19 records across all 15 DMS business objects. The
internal `DMS_Allocation_State__c` singleton was deliberately not duplicated or
changed. These are illustrative records, not actual stock, orders or accounting
transactions. Seed: `scripts/apex/seedDmsDemo20261022.apex`; read-only verification:
`scripts/apex/verifyDmsDemo20261022.apex`. The seed refuses a second run when its
unique batch distributor already exists. Failed first attempts rolled back all
business writes (auto-number gaps can remain).

- Distributor 1 opening stock: Yippee Magic Masala 10 cases / 720 pieces;
  Aashirvaad Atta 5kg 5 cases / 50 pieces; Bingo Mad Angles 8 cases / 384 pieces.
  Batches are prefixed `DEMO-20261022-OPENING-`; warehouse says DEMO ONLY. Total
  available is 1,154 pieces, with zero reserved. Demo stock contributes to the
  distributor's displayed inventory; do not treat it as physically available.
- One draft primary order + line, draft receipt + line, draft invoice + line,
  draft primary return + line, and draft primary credit + line. Parent notes and
  stock/receipt batches identify the examples. No order was submitted or approved,
  no receipt posted, no invoice or credit issued, and no payment recorded.
- The draft invoice references existing SO-00000/OI-00000 only because the schema
  requires a secondary source order. Those SFA records were not edited; do not
  issue this demonstration invoice.
- Three Open tickets, one per Product/Portal/Delivery category, explicitly titled
  DEMO and describing training-only issues.
- One separate `DEMO ONLY - Training Distributor`, one monthly target and one
  product survey. These are isolated from Distributor 1's real targets and officer.
  The demo distributor has no login email/user and allocation priority zero, so
  it cannot authenticate as an existing distributor or enter the employee pool.
- The existing DMS Monthly Surveys permission set was assigned only to the current
  System Administrator to access required survey notes. Its existing validation
  and assigned-officer rule remain enabled. Some fields excluded by permissions
  initially appeared absent in describe/anonymous Apex; no duplicate fields were
  created and no validations bypassed.

Live verification confirmed all 15 business objects now contain records, inventory
formulas total 1,154 available pieces, existing PO-000001 remains Approved at
963.90, and GRN-000001 remains Draft with no lines. SFA processes on ports 4000
and 8081 were not restarted. Audit output is under
`diagnostics/dms-demo-20261022/`.

DMS-only presentation deployment `0AfjV000004dlBFSAY` succeeded: hid the unused
Assigned Employee and Parent Distributor inputs and child-distributor related list
on the DMS Distributor layout, and removed the redundant standalone Order Items
tab from DMS Management navigation. Employee allocations still use the Employees
related list. All fields, records, permissions and objects remain; SFA application
navigation and shared SFA layouts were not deployed. Live pre-change app/layout
metadata is backed up in `diagnostics/dms-demo-20261022/before/` for restoration.
Inventory list deployment `0AfjV000004dmgnSAA` also succeeded, adding batch,
on-hand pieces, available pieces and expiry columns so the DEMO marker and stock
quantities are visible without opening each record. Its original list view is
backed up under `diagnostics/dms-demo-20261022/before-inventory-list/`.

Application visual verification requires an authenticated Distributor 1 session;
the browser tab available during this change was at code verification. No login
code or authentication bypass was used to inspect another session.

1. Real, controlled login emails for Distributor 2 and Distributor 3. Distributor 1 is configured. The unique active distributor email receives the sign-in code. No distributor code has been sent by these tests.
2. Valid primary case prices and whole pieces-per-case values for the catalogue. The 24 active sellable products are readable, but incomplete pricing prevents primary ordering. Prices must not be invented.
3. Primary or Secondary classification for the 11 existing unclassified schemes, plus confirmed free-goods/discount rules.
4. Distributor mapping for the remaining 68 unassigned outlets. Existing mappings have not been redistributed.
5. Actual monthly target values in DMS Sales Targets. The report uses India-calendar months and a disclosed 30-day stock review window; confirm any different business thresholds. A stable approved HTTPS backend address is still needed for mobile release.

## Verification completed

Earlier primary-workflow release: deployment `0AfjV000004aA3QSAU` succeeded after adding case scheme rules, free-product snapshots/receipts, monthly surveys, field permissions and secondary scheme separation. Its same-suite deployment ran 21 Apex tests with zero failures. Its historical transaction lists were empty before the scoped legacy-order repairs described above. The latest report release and verification results are recorded at the top of this document.

The older first-release results below remain as history, not the latest test counts.

- Salesforce deployment `0AfjV000004ZB9cSAG` succeeded: 24 selected Apex tests, zero failures and no coverage warnings. These cover DMS commands, primary workflow, routing, allocation and the SFA visit controller. Apex tests roll back their business test records.
- Backend: 29 tests pass, including original SFA tests, authentication/scope checks and actual HTTP dependency simulation.
- SFA mobile: 26 tests pass; TypeScript check passes. Includes logout protection, existing form labels/product fields and primary queue retry/isolation tests.
- DMS mobile: TypeScript check and web export pass. Browser sign-in screen renders with visible labels; empty-email validation reaches the review backend correctly.
- Seventeen read queries ran against the live org: 12 distributor overview lists and five employee primary-entry queries. Distributor 1 returned 32 linked outlets; primary catalogue returned 24 products. Empty transaction lists were genuine zero-record results, not mocked data.
- A live Apex connectivity probe returned the expected validation error without writing business records.
- HTTP simulation checked stable-key replay, changed-payload rejection, validation errors, HTML 530 errors and malformed HTTP 200 responses. The mock is local only. Postman workspace mock discovery was skipped because the CLI is not signed in.

These checks do not establish physical-device behavior, email delivery, production-scale performance or completion of the remaining workflows.

## Developer entry points

- `force-app/main/default/classes/DmsPortalApi.cls`: trusted atomic command entry.
- `force-app/main/default/classes/DmsEmployeeTransactions.cls`: employee order/return submission and receipt-based validation.
- `force-app/main/default/classes/DmsTicketRules.cls`: support ticket lifecycle.
- `sales-rep-mobile/backend/src/dms/router.ts`: distributor login, scoped reads and command routes.
- `sales-rep-mobile/backend/src/dms/employeeRouter.ts`: additive employee routes, mounted after SFA authentication.
- `sales-rep-mobile/backend/src/dms/transport.ts`: HTTP error handling; no Salesforce token reaches the phone.
- `sales-rep-mobile/mobile/src/screens/PrimaryScreen.tsx` and `storage/primaryQueue.ts`: new SFA entry and employee-specific pending work.
- `dms-mobile/src/DmsApp.tsx`, `api.ts`, `storage.ts`: separate distributor UI, connection and cache/outbox.
- `sales-rep-mobile/docs/dms-api.yaml` and `dms-salesforce-command.yaml`: API contracts.
- `manifest/dms-portal.xml`: explicit deployable components for this release. Do not deploy the whole project indiscriminately; the older undeployed `DmsTransactionApi.cls` prototype is not used by this implementation and still requires cleanup.

`DMS_Backend_Transactions` is for the backend integration user only, not mobile users. `DMS_Ticket_Officer` was assigned to the existing administrator and Dhanush SFA, the selected company officer. Existing private sharing remains in effect.

## Local verification commands

From `sales-rep-mobile`:

```powershell
postman simulation run postman/simulations/dms-salesforce.sim.yaml --port 4900 --no-history --output ndjson
```

In a second terminal, from `sales-rep-mobile/backend`:

```powershell
$env:DMS_SIMULATION_URL='http://localhost:4900/salesforce'
npm test
npm run build
```

For the read-only org check, configure `SALESFORCE_INSTANCE_URL` and the existing CLI alias, then run `npx tsx scripts/check-dms-queries.ts DISTRIBUTOR_ID EMPLOYEE_ID`. This prints list counts, not credentials or record contents.

The current review backend runs on 4001 with a separate temporary session secret. SFA continues on its existing 4000 service. To run DMS web against review, set `EXPO_PUBLIC_API_URL=http://localhost:4001/api` in the shell and run `npm run web` from `dms-mobile`. A phone build requires a reachable HTTPS URL; localhost on a phone is not this computer.

Before enabling the new SFA Primary menu, release the updated backend, configure the missing business data, verify the real approval flow, and then build SFA with `EXPO_PUBLIC_ENABLE_DMS_PRIMARY=true`. Do not overwrite the existing SFA APK as part of an unverified DMS release.
