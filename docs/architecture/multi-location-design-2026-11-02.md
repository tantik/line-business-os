# DEBT-139 — Several locations per client: design (2026-11-02)

Status: **design approved, Founder decisions F1–F5 answered 2026-11-02 (§5)**. Debt entry:
`docs/operations/deferred-debt-register.md` DEBT-139 (also closes / absorbs
DEBT-091 a-rest, DEBT-120 d, DEBT-129 "two locations").

## 1. Where we are (verified in code, 2026-11-02)

The **data model is already per location**: `location_id` on shifts, shift
types, schedule settings, attendance, inventory items / counts / sessions,
purchases, receipts and receipt settings, recipes (nullable = tenant-wide),
operations templates / schedules / instances, issues, staff messages;
`core.role_assignments.location_id` (NULL = all locations) and
`core.has_permission(tenant, perm, location)` already check per location.

The **product runs one location per tenant**:

| Gap | Where |
|---|---|
| No way to add / rename / archive a location | only the 0068 seed and 0133 `core.provision_tenant` insert `core.locations` |
| Pages pick the location in two incompatible ways | **fail closed on 2+ active**: `manager/page.tsx`, `recipes/page.tsx`, `weekly-review-actions.ts`, `recipe-actions.ts`, `attendance-month-actions.ts`, `post-login-redirect.ts` (`soleActiveLocation`, DEBT-120 d). **silently take the membership's / first active location**: `purchases/page.tsx` (and the same pattern in inventory / operations / issues / staff pages) — wrong data with two stores |
| Every member sees every location of the tenant | `api.my_tenant_locations` (0017): membership-scoped, not role-scoped |
| A Manager is tenant-wide only | 0138 appointment writes `location_id = null` (DEBT-091) |
| One employee row per account per tenant | 0063 unique `(tenant_id, user_id)` = earlier Founder decision 2 |
| No switcher, no remembered choice | tenant switcher exists (cookie hint, `lib/tenant/select.ts`), location has none |
| Owner reports are per one location | weekly review, spend / receipts, issues, purchases |
| Billing per location not wired | pricing v1 is per location (`docs/commercial/pricing-v1.md`), Stripe not built yet |

## 2. How others do it (research, 2026-11-02)

- **Square**: team members are assigned to locations and only see / change
  data of their locations; some permissions exist in an "assigned locations"
  and an "all locations" variant; one permission set per person, not per
  location. <https://square.com/help/us/en/article/5822>,
  <https://community.squareup.com/t5/Questions-How-To/Team-Permissions-for-each-location/m-p/285167>
- **7shifts**: priced per location; one employee can be assigned to several
  locations, salary split across them by percentage, hourly wage per role.
  <https://kb.7shifts.com/hc/en-us/articles/52649365106579/>,
  <https://www.7shifts.com/multi-location-restaurant-management/>
- **Airシフト** (Recruit): central management of several stores; a person who
  works at several stores is registered **once per store**.
  <https://meetsmore.com/products/air-shift>

Takeaway: location-scoped access + an "all locations" grant for owners is
the norm (matches our `location_id null` model); per-location pricing is
normal; sharing one person across stores is either per-store registration
(simple) or multi-assignment (complex: wage split, cross-store hour limits).

## 3. Design

### 3.1 Location lifecycle (DB, one migration + pgTAP)

- `api.create_location(p_tenant_id, p_name, p_timezone)` — Owner / Admin
  (`core.location.manage`, new permission key, tenant-wide) and platform
  console (service_role path in `admin`). Creates the location **and its
  per-location defaults by reusing the 0133 provisioning pieces**: shift
  types, schedule settings and operations / HACCP templates of the tenant's
  package template (same manifest version as the tenant), no receipt
  settings row (= defaults). Modules stay tenant-level (no per-location
  module switch in v1). Audit row.
- `api.rename_location`, `api.set_location_active(p_location_id, false)` —
  archive = `is_active false`: hidden from switchers, read-only history kept,
  refused while it is the last active location. No physical delete (purge
  stays tenant-level, DEBT-103).
- Limit: entitlement `max_locations` from the plan (F4); refuse
  `location_limit_reached`.

### 3.2 Who sees which location

One SQL source of truth, `api.my_locations` (new view or a field in
`api.my_page_context`): for the current user and tenant, each location with
`access`:

- `all` — holds a tenant-wide role (Owner, Admin, tenant-wide Manager): every
  active location;
- `manage` — Manager role assignment with that `location_id`;
- `staff` — bound employee row at that location.

A location the user has no relation to is **not listed** (today every member
sees every location name). RLS on the data tables already enforces this; the
view only stops the UI from offering it.

### 3.3 Active location: one resolver, one switcher (web)

- `resolveActiveLocation(myLocations, { requested, candidate })` in
  `lib/tenant/` — same shape and rules as `selectActiveTenant`: `requested`
  (URL `?loc=`) strict → `unauthorized`; `candidate` (cookie
  `oruwa_location`, per tenant) lenient; default = first by name among the
  locations with the strongest access. Pure, unit-tested.
- Called once in the request-scoped page context, so every page gets the
  same location; **all "sole active" and "first active" code paths above are
  replaced** (the list in §1 is the checklist). Server actions keep taking
  `locationId` from the page and re-check permission (they already do, RLS
  is the boundary).
- Switcher in the header next to the tenant switcher, shown only with 2+
  locations; built on `@line-os/ui` menu (fixes DEBT-120 a/b/c on the way).
  Choice stored in the cookie; Staff with one store never see it.
- Owner pages get an extra 「全店舗」 (all stores) choice where a total makes
  sense (§3.5); operational pages (schedule, stock count, purchases,
  checklists) always need one store.

### 3.4 Managers and staff per location

- Manager appointment (0138) gets an optional `location_id`: Owner / Admin
  choose 「この店舗のみ」 (this store only) or 「全店舗」 (all stores). Invites
  carry the location (already have `location_id` on tenant invitations).
- Staff: per F3. Recommended v1 = **one home store per person** (keeps 0063
  and all invite / deactivate logic as is); moving a person = change of
  `employees.location_id` by the Owner. "Help shifts" at another store
  (ヘルプ) = follow-up (shift at location B for an employee of A, wage and
  monthly hours counted on the person) once a client asks.

### 3.5 Owner views across stores

Weekly review, spend / receipts summary, issues list, purchases history:
per store as today + 「全店舗」 total (sum, with a per-store column). Read
RPCs take `p_location_id null` = all stores the caller may see; pgTAP that a
location Manager gets only their store.

### 3.6 Billing and limits

Stripe subscription item quantity = number of **active** locations; tier
per F2; adding a location mid-month = Stripe proration (default behaviour),
archiving = quantity −1 from the next period. Built with the Stripe work
(plan A), not before; until then `max_locations` from the plan row is the
only gate.

### 3.7 LINE

Per F5. Recommended: one LINE Official Account per **client** (one QR code,
one bill for the client), the store is chosen inside the app; per-store OA
only on request.

## 4. Build plan (after F answers)

| Step | Content | Review | Size |
|---|---|---|---|
| L1 | DB: `core.location.manage`, create / rename / archive RPCs with defaults, `api.my_locations`, Manager `location_id`, `max_locations`; pgTAP incl. "location Manager sees nothing of store B" | oruwa-db-security-reviewer | 2–3 d |
| L2 | Web: `resolveActiveLocation` + page context, replace every sole / first-active path, switcher, post-login (DEBT-120 d) | oruwa-reviewer + oruwa-ux-i18n-reviewer, live 375 px | 3–4 d |
| L3 | Owner cabinet + console: add / rename / archive store, Manager scope choice | ux + live | 1–2 d |
| L4 | 「全店舗」 totals in Owner views | db + ux | 2 d |
| L5 | QA: 4C "two locations" live on Cloud DEV (two stores, two Managers, one Owner), cross-store probes | Lead | 1 d |
| L6 | Billing quantity | with Stripe | — |

Total ≈ 2 weeks with reviews, as estimated in DEBT-139.

## 5. Founder decisions (F) — answered 2026-11-02

- **F1 = yes:** the Owner adds / renames / archives stores in the cabinet,
  ORUWA can do the same in the console.
- **F2 = per store:** tier S / M per store by that store's staff count.
- **F3 = no (v1):** one home store per person; the Owner can move a person to
  another store; "help shifts" (ヘルプ) at another store are a follow-up.
- **F4 = up to 3 stores self-service**, more via sales; from the 3rd store
  on, a surcharge (as for headcount). Amounts belong to the pricing documents
  (Founder); the system provides active store count and per-store staff
  count for billing, and `max_locations = 3` as the self-service limit.
- **F5 = one LINE Official Account per client**; the store is chosen inside
  the app; a per-store OA only on request.

Status: decisions closed, build starts with L1.
