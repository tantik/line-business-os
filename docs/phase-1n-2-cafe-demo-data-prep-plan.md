# Phase 1N-2 — Cafe Demo Data Prep Plan (Cloud Dev Data Planning Only)

## A. Scope

This document plans, but does not execute, preparation of client-demo data
for the Cafe Workforce v0.1 product path (the real `/dashboard/workforce`
app, not `/demo/cafe`) against the existing Supabase Cloud dev project.

This is data planning only:

- No SQL is executed as part of producing this document.
- No Cloud commands (`db push`, `db pull`, `link`, migration repair) are run.
- No `service_role` is used or proposed.
- No RLS bypass is proposed.
- No migration is added or edited.
- No app code (`apps/web`, `apps/api`) is added or edited.
- No schema column is invented — every column/table name below is taken
  directly from `supabase/migrations/0009`, `0020`–`0031` and the
  corresponding `apps/web/src/lib/workforce/*` helpers.

This document is not a production-readiness or client-demo-readiness
sign-off. See `docs/phase-1m-cafe-workforce-smoke-closeout.md` §7 for the
known pre-demo cleanup item this plan responds to.

## B. Current known tenant/location/staff data

From the Phase 1M manual smoke (not re-verified here — Section E gives the
read-only queries to re-verify before acting):

| Entity | Value |
| --- | --- |
| Tenant | Smoke Tenant B |
| `tenant_id` | `37088bfe-14f9-4604-af39-61dd09d37b0c` |
| Location | Smoke Cafe B |
| `location_id` | `a902c7f6-b050-46c4-9891-c358755aae53` |
| Staff | Test Staff B |
| `employee_id` | `1fc49df1-258b-48e5-89b9-8f69f9549e37` |
| Smoke week | 2026-07-06 to 2026-07-12 |
| Known state | Thu 2026-07-09: AM, published. Fri 2026-07-10: PM, draft (stray test data). |

## C. Desired client-demo dataset

For one clean demo week, under the existing tenant/location above (see
Section F for the reuse-vs-new-tenant decision):

1. **3–4 Japanese-looking staff records** (`workforce.employees`), e.g.:
   - 田中 美咲 — 店長 (manager/店長 position)
   - 佐藤 健太 — バリスタ
   - 鈴木 陽子 — ホールスタッフ
   - 高橋 大輔 — キッチン (optional 4th)
2. **One clean demo week** of `workforce.shifts` (assignment rows), using
   the shift types already present at this location: `ALL`, `AM`, `PM`,
   `A-P`, `SHORT_AM` (`workforce.shift_types`, confirmed present per the
   Phase 1M smoke's Cloud dev setup assumptions).
3. **Realistic shift preferences**: a handful of
   `workforce.shift_requests` rows with `kind = 'preference'`, one per
   staff member per day (or a subset of days), respecting the existing
   partial-unique constraint (`wf_shift_requests_one_preference_per_day`:
   at most one `preference` row per `employee_id` + `work_date`).
4. **Published schedule**: the demo week's `workforce.shifts` rows with
   `published = true` (matches how `publishShiftAssignments` in
   `apps/web/src/lib/workforce/shift-assignments.ts` bulk-flips
   `published` for a location/date range).
5. **1–2 work reports**: `workforce.attendance` rows with `daily_message`
   and/or `transportation_cost` set, for 1–2 completed demo days (mirrors
   `submitWorkReport` in `apps/web/src/lib/workforce/attendance.ts`).
6. **1 correction request example**: one `workforce.shift_requests` row
   with `kind = 'correction'`, `attendance_id` pointing at one of the work
   reports above, `status = 'pending'` (or `'approved'` if the demo wants
   to show the resolved state) — mirrors `submitCorrectionRequest` /
   `decideCorrectionRequest` in `apps/web/src/lib/workforce/shift-requests.ts`.
7. **Optional recipe/manual examples** — see Section H. Flagged as
   feasibility-uncertain, not committed to in this plan.

## D. Tables likely involved

All under the `workforce` schema (defined across `0009`, `0020`–`0029`,
extended by `0026`–`0028`; read via `api.workforce_*` views from `0030`/`0031`):

| Table | Purpose | Written via (app layer) |
| --- | --- | --- |
| `workforce.employees` | Staff profiles | `api.workforce_staff_manage` (manager-only view, `0031`) |
| `workforce.shift_types` | Named shift templates (`ALL`/`AM`/`PM`/`A-P`/`SHORT_AM`) | `api.workforce_shift_types` |
| `workforce.shifts` | Concrete shift occurrences (the schedule) | `api.workforce_shift_assignments` |
| `workforce.shift_requests` | Preferences (`kind='preference'`) and correction requests (`kind='correction'`) | `api.workforce_shift_requests` |
| `workforce.attendance` | Work reports / clock data | `api.workforce_attendance` |
| `workforce.recipe_categories`, `workforce.recipes`, `workforce.recipe_ingredients/_steps/_notes` | Recipe/manual content | **No app-facing write path exists today** — see Section H |
| `core.tenants`, `core.locations`, `core.tenant_modules` | Tenant/location/module context (read-only reference for this plan) | n/a |

## E. Safe inspection SQL only

All queries are `SELECT`-only, filter by the known `tenant_id` and, where
the table has one, `location_id`. No `DELETE`, `UPDATE`, or `INSERT`. These
are meant to be run in the Supabase SQL editor (or via `psql` against the
Cloud dev project) by a human with appropriate access — not executed by an
agent in this session.

```sql
-- E1. Confirm tenant + module enablement
select id, slug, name, kind, status
from core.tenants
where id = '37088bfe-14f9-4604-af39-61dd09d37b0c';

select tenant_id, module, is_enabled
from core.tenant_modules
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c';

-- E2. Confirm location
select id, tenant_id, name, timezone, is_active
from core.locations
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c'
  and id = 'a902c7f6-b050-46c4-9891-c358755aae53';

-- E3. Existing staff at this tenant/location
select id, tenant_id, location_id, position_label, employment_type, is_active,
       created_at, updated_at
from workforce.employees
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c'
  and location_id = 'a902c7f6-b050-46c4-9891-c358755aae53';
-- Note: name_encrypted/name_hash are PII columns; do not select/decrypt them
-- outside the app's server-side decryption path.

-- E4. Confirm shift types present at this location
select id, tenant_id, location_id, code, label_ja, label_en,
       starts_at_local, ends_at_local, break_minutes, is_active, sort_order
from workforce.shift_types
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c'
  and location_id = 'a902c7f6-b050-46c4-9891-c358755aae53'
order by sort_order;

-- E5. All shifts (assignments) in the current smoke week, with publish state
select id, tenant_id, location_id, employee_id, shift_type_id,
       starts_at, ends_at, break_minutes, role, notes, published,
       created_at, updated_at
from workforce.shifts
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c'
  and location_id = 'a902c7f6-b050-46c4-9891-c358755aae53'
  and starts_at >= '2026-07-06T00:00:00+09:00'
  and starts_at <  '2026-07-13T00:00:00+09:00'
order by starts_at;

-- E6. Isolate the known stray PM draft (Fri 2026-07-10) for review
select id, tenant_id, location_id, employee_id, shift_type_id,
       starts_at, ends_at, published, notes
from workforce.shifts
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c'
  and location_id = 'a902c7f6-b050-46c4-9891-c358755aae53'
  and starts_at >= '2026-07-10T00:00:00+09:00'
  and starts_at <  '2026-07-11T00:00:00+09:00';

-- E7. Existing shift_requests (preferences + corrections) in the smoke week
select id, tenant_id, location_id, employee_id, shift_id, shift_type_id,
       work_date, kind, status, is_unavailable, attendance_id,
       created_at, updated_at
from workforce.shift_requests
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c'
  and location_id = 'a902c7f6-b050-46c4-9891-c358755aae53'
  and work_date >= '2026-07-06'
  and work_date <= '2026-07-12'
order by work_date;

-- E8. Existing attendance/work-report rows in the smoke week
select id, tenant_id, location_id, employee_id, shift_id, work_date,
       clock_in, clock_out, status, transportation_cost, daily_message
from workforce.attendance
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c'
  and location_id = 'a902c7f6-b050-46c4-9891-c358755aae53'
  and work_date >= '2026-07-06'
  and work_date <= '2026-07-12'
order by work_date;

-- E9. Sanity check: confirm the known tenant/location slice's employee count,
-- scoped to this one tenant_id + location_id (not a cross-tenant scan).
select tenant_id, location_id, count(*) as employee_count
from workforce.employees
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c'
  and location_id = 'a902c7f6-b050-46c4-9891-c358755aae53'
group by tenant_id, location_id;

-- E9b. Optional: this tenant's employee distribution across its own
-- locations only (still filtered by tenant_id; never a cross-tenant query).
select tenant_id, location_id, count(*) as employee_count
from workforce.employees
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c'
group by tenant_id, location_id
order by location_id;

-- E10. Existing recipe content (if any) at this tenant/location, for Section H
select id, tenant_id, location_id, title_ja, status, is_popular
from workforce.recipes
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c'
  and location_id = 'a902c7f6-b050-46c4-9891-c358755aae53';
```

## F. Proposed data-prep approach after inspection

**Option 1 — Rename/reuse current smoke staff/data.**
Rename "Smoke Tenant B" → a demo-appropriate tenant name (e.g. a fictional
cafe name), rename "Smoke Cafe B" → a demo location name, and either
rename "Test Staff B" to one of the Japanese demo names or add it alongside
2–3 new staff rows. Reuses existing `tenant_id`/`location_id`, so all
existing shift-type/shift/attendance/request rows already scoped to them
stay valid with zero FK rework.

- Pro: no new tenant provisioning, no risk of missing a `core.tenant_modules`
  enablement step, reuses already-verified-working IDs.
- Con: renaming a tenant/location whose name embeds "Smoke"/"Test" could
  read as sloppy if a screenshot or DB export ever leaks the word "smoke"
  in an audit log or `updated_at` trail; also mixes true smoke-test
  provenance with demo-facing data in the same row history.

**Option 2 — Add a separate demo tenant/location/staff.**
Provision a new `core.tenants` row (with `core.tenant_modules` workforce
enabled) and a new `core.locations` row, then add all-new staff/shift-type/
shift/request/attendance rows under the new IDs, leaving Smoke Tenant B
untouched.

- Pro: total separation from smoke-test history; the smoke tenant remains
  available for future engineering smoke tests without any demo-data risk
  of contamination.
- Con: requires provisioning `core.tenants` + `core.tenant_modules` +
  `core.locations` + `workforce.shift_types` (`ALL`/`AM`/`PM`/`A-P`/
  `SHORT_AM`) from scratch — more setup, more surface area for something to
  be missed before demo day (e.g. forgetting to enable the workforce module
  for the new tenant).

**Recommendation: Option 1 (rename/reuse).**
The Phase 1M smoke already proved this tenant/location/shift-type set
works end-to-end. Reuse minimizes new setup steps and new failure modes
right before a client demo. The "Smoke"-named provenance risk is mitigated
by simply renaming `core.tenants.name` / `core.locations.name` to demo-
appropriate values (a single `UPDATE` each, covered under Section G's
approval gate) — the `id` values and internal history remain the same,
which is invisible to anyone viewing the UI.

## G. Draft cleanup options

**Default: do not delete anything.** No `DELETE` statement is proposed
anywhere in this plan. All cleanup below is either "leave as-is" or a
narrowly-scoped `UPDATE`/insert-more, executed only after human review of
Section E's inspection results.

Options for the known stray PM Draft (Fri 2026-07-10, `published = false`),
in order of preference:

1. **Leave it as a real demo draft.** If the demo week is being repurposed
   entirely (Section F, Option 1), this row can simply become one of the
   demo week's legitimate draft-then-published shifts — assign it a real
   demo employee_id and a real shift_type_id, then include it in the same
   publish step as the rest of the week. No special-case cleanup needed;
   it stops being "stray" because the whole week is being redone.
2. **Update, not delete, if it must be removed from the visible schedule.**
   Because `api.workforce_shift_assignments` only grants
   `select, insert, update` to `authenticated` (0026, 0030, 0031 — no
   `delete` grant anywhere in the app-facing surface), the *app itself* has
   no delete path for this row today. If the row should not appear at all,
   the only options are: (a) leave it unpublished and out of the demo
   week's date range shown in a walkthrough, or (b) a human with direct
   Cloud dev SQL access performs a deliberate, single-row `DELETE ... where
   id = <that row's id> and tenant_id = <tenant_id>` — which is outside
   this plan's SQL-execution boundary (Section E is SELECT-only) and would
   need separate, explicit human approval and execution, not agent-run SQL.
3. **Do not decide which option until Section E5/E6's actual current data
   is reviewed by a human** — the row might already look fine once
   staff/shift-type assignment is set, making cleanup unnecessary.

Exact conditions required before any cleanup UPDATE (not proposed as SQL
here, only as conditions):

- Section E5/E6 inspection output has been reviewed by a human.
- The specific row's `id`, `employee_id`, `shift_type_id`, and `starts_at`/
  `ends_at` are confirmed against the demo week plan before any UPDATE.
- The UPDATE is scoped by both `tenant_id` and the row's own `id` (never a
  broad date-range or location-only UPDATE for this single-row fix).
- A human explicitly approves running it (Section J).

## H. Recipe/manual data feasibility

**Finding: no client-safe write path exists today.** Per
`supabase/migrations/0023_workforce_api_facade.sql`'s header note: "Workforce
mutations go exclusively through the `apps/api` service-role path... This
migration adds zero INSERT/UPDATE/DELETE grants anywhere, on tables or
views." Checked `0030`/`0031` (the later Cafe-specific facade migrations):
neither adds an `api.workforce_recipes*` write view or RPC — only the
schedule/attendance/shift-request/staff-manage surfaces got write grants.

RLS policies for recipe INSERT/UPDATE/DELETE do exist
(`0022_workforce_staff_recipes_rls_policies.sql`: `wf_recipes_insert`,
`wf_recipes_update`, plus child-table insert/update/delete policies), but
RLS alone does not grant access — Postgres still requires the underlying
table/view privilege grant, and `authenticated` was only ever granted
`SELECT` on `workforce.recipes`/`recipe_categories`/`recipe_ingredients`/
`recipe_steps`/`recipe_notes` (0023) and no `api.*` writable surface exists
for them.

Given this plan's hard constraints (no `service_role`, no `apps/api`, no
backend code, no migrations), **recipe/manual demo data cannot be inserted
by this plan or its follow-up execution step** through the normal app
path. Two honest options, both **out of scope for this plan**:

- A human with direct Cloud dev SQL access and explicit approval performs
  manual `INSERT`s directly (bypassing the app layer entirely, still
  respecting RLS if run as an authenticated role, or via the Supabase
  dashboard's table editor) — this is a distinct, separate decision from
  everything else in this document and would need its own approval.
- A future slice adds an `api.workforce_recipes_manage`-style write view/RPC
  (mirroring `api.workforce_staff_manage`) — that is engineering work, not
  data prep, and is out of scope here.

**Marked as follow-up, not committed to in this demo-data pass.**

## I. Risks

- **Cross-tenant leakage risk**: any query or future write missing a
  `tenant_id` filter could touch another tenant's rows. Mitigated by every
  query in Section E, including E9/E9b's employee-count checks, filtering
  on the known `tenant_id` (and, for E9, also `location_id`) — none of
  Section E performs a cross-tenant scan.
- **Renaming risk (Option 1)**: renaming `core.tenants.name` /
  `core.locations.name` is a real `UPDATE` against production-adjacent
  Cloud dev data. Low blast radius (dev project, not production; scoped to
  one tenant/location row) but still requires explicit approval (Section J)
  since it is a write, not a read.
- **No delete path**: Section G's finding that the app has no DELETE grant
  on shift assignments means any "must actually disappear" cleanup requires
  a manual, human-run, single-row SQL delete outside this plan's own
  execution boundary — a separate approval decision, flagged rather than
  silently assumed possible.
- **Recipe/manual data gap**: Section H's finding that no write path exists
  means the "optional recipe/manual examples" part of the original demo
  data goal cannot be delivered without either a manual SQL insert (its own
  approval) or new engineering work (out of scope).
- **PII columns**: `workforce.employees.name_encrypted`/`name_hash` and
  `workforce.employee_line_links.line_user_id_encrypted`/`_hash` must never
  be selected/decrypted outside the app's existing server-side decryption
  helpers (`apps/web/src/lib/workforce/employees.ts`). Section E's
  inspection queries deliberately exclude these columns.
- **Stale IDs**: the `tenant_id`/`location_id`/`employee_id` values in
  Section B come from a prior manual smoke record, not a fresh query. They
  must be reconfirmed via Section E1–E3 before anything is built on top of
  them.

## J. Manual approval gates

Every one of these requires explicit human approval before execution, and
none is executed by this plan:

1. Running Section E's read-only inspection queries against Cloud dev.
2. Any `UPDATE` to `core.tenants.name` / `core.locations.name` (Option 1
   rename).
3. Any `INSERT` of new staff/shift-type/shift/preference/attendance/
   correction-request rows (whether via the real app UI as a demo-tenant
   manager, or via direct SQL).
4. Any `UPDATE` to the known stray PM Draft row (Section G).
5. Any manual SQL `DELETE`, if a human decides that is the right path for
   the stray PM Draft (Section G, option 2b) — this is a distinct, higher-
   risk approval, separate from the rest.
6. Any recipe/manual data insert, if a human decides to proceed with
   Section H's "direct SQL insert" option.
7. Any production deployment or production Supabase action — explicitly
   out of scope for this entire document; not proposed anywhere above.

## K. Final visual smoke checklist

To be run manually (by a human) on Vercel dev Preview + Supabase Cloud dev,
after data prep is approved and executed, before calling the demo dataset
ready:

- [ ] Sign in as the demo tenant's manager user; `/dashboard/workforce`
      loads without error.
- [ ] Manager dashboard shows all 3–4 Japanese-named staff.
- [ ] Manager schedule view shows the full demo week with the published
      shifts visible, using `ALL`/`AM`/`PM`/`A-P`/`SHORT_AM` labels
      correctly.
- [ ] No unexplained stray draft shift remains visible in the manager
      schedule for the demo week (the former Fri 2026-07-10 PM Draft is
      either now a legitimate part of the week or is out of the displayed
      range).
- [ ] Sign in as (or impersonate, per existing smoke procedure) a demo
      staff member; `/dashboard/workforce/staff` shows only their own
      published shifts, preferences, and work reports — never another
      staff member's data.
- [ ] Staff view shows the submitted shift preferences correctly reflected
      in the published schedule.
- [ ] Staff view shows the 1–2 prepared work reports.
- [ ] Staff and manager views both show the 1 correction request example
      with correct status/context (per the Phase 1M `#97` UI clarity
      pass).
- [ ] Confirm, by re-running Section E9's tenant/location-scoped employee
      count and comparing against the pre-prep baseline, that only this
      known tenant/location's employee count changed as expected (no
      cross-tenant query is needed or performed for this check).

## L. Next step after this plan

1. Human review and approval of this document.
2. Human (or an explicitly re-scoped follow-up task) runs Section E's
   read-only inspection queries and reviews the actual current state.
3. Based on that review, a follow-up task/PR proposes the specific
   `UPDATE`/`INSERT` statements for Section F's chosen option (recommended:
   Option 1) and Section G's cleanup decision, still gated by Section J's
   approval list — this plan does not pre-approve or pre-write that SQL.
4. Recipe/manual data (Section H) is explicitly deferred to a separate,
   later decision and is not part of this pass's execution scope.
