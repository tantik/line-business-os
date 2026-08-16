# Workforce Data Model

Status: **Design doc only. No SQL migrations are created in Phase 1K, and no
production database behavior changes as part of this phase.** Phase 1L will
create new, forward-only migrations after review; already-applied migrations
are never edited.
Phase: 1K. Read with:
[`workforce-production-mvp-architecture.md`](./workforce-production-mvp-architecture.md),
[`workforce-rls-security-plan.md`](./workforce-rls-security-plan.md),
[`multi-tenancy.md`](./multi-tenancy.md), and the historical
`supabase/migrations/0009_workforce.sql` (referenced here for context only).

This document proposes the Workforce production data model conceptually —
tables, fields, relationships, indexes, and status values. It builds on the
schema already scaffolded in the historical `0009_workforce.sql` migration
via new tables and new, forward-only migrations in Phase 1L — it does not
propose editing that migration, and no SQL is written here. Final column
types, constraint syntax, and migration ordering are decided at
implementation time (Phase 1L), not here.

## Schemas involved

- **`core`** — tenants, locations, users, memberships, roles/permissions,
  LINE registry. Workforce tables reference `core.tenants`/`core.locations`/
  `core.users`; Workforce does not add its own tenant or user concept.
- **`workforce`** — all Workforce business tables (this document's main
  subject).
- **`audit`** — `audit.audit_logs`, already defined in
  `0005_audit.sql`. Workforce writes to it; it does not add Workforce-specific
  audit tables.
- **`api`** — app-facing security-invoker views/functions exposed to
  `apps/web`, following the pattern in `0015_api_facade.sql`. Workforce adds
  views here for reads that should not require an `apps/api` round trip
  (e.g. `manager_alerts`, monthly report query), not raw table access.

## tenant_id / location_id rules

Same golden rules as `multi-tenancy.md`:

1. Every `workforce` business table has `tenant_id uuid not null references
   core.tenants(id) on delete cascade`.
2. Every table whose rows are tied to a physical cafe location also has
   `location_id uuid references core.locations(id)`. For the first MVP
   (one tenant, one location) this is still populated on every row — it is
   not deferred, because retrofitting it later across live data is the
   expensive path.
3. RLS on every table uses `core.has_permission(tenant_id, key,
   location_id)`, matching `0009_workforce.sql`'s existing policies. Detailed
   policy design is in
   [`workforce-rls-security-plan.md`](./workforce-rls-security-plan.md).
4. No table stores a tenant/location id supplied directly by the client; it
   is always derived server-side from membership (`overview.md`, "Data
   ownership rules").

## Common columns (conceptual convention)

Unless noted otherwise, every table below carries:

- `id uuid primary key default gen_random_uuid()`
- `tenant_id uuid not null` (per above)
- `location_id uuid` where physical (per above)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`, maintained by the existing
  `core.set_updated_at()` trigger pattern already used in
  `0009_workforce.sql`
- `created_by uuid references core.users(id)` where knowing the author
  matters for audit/ownership (mutation-heavy tables); omitted on
  low-mutation reference tables where it adds no value
- `updated_by uuid references core.users(id)` alongside `created_by` where
  the row is expected to be edited by someone other than its creator (e.g.
  Manager editing a Staff-submitted row)
- Soft delete: Workforce MVP tables use `is_active boolean not null default
  true` (matching `workforce.employees`'s existing pattern) for
  staff/recipe/reference data that should disappear from active UI without
  losing history; append-only/event tables (work reports, corrections,
  requests) are never soft-deleted — their `status` column is the lifecycle,
  and rows are retained for the audit/reporting trail

## Proposed tables

### `workforce.staff_profiles`

Builds on the role of the existing `workforce.employees` table (created in
the historical `0009_workforce.sql` migration). Phase 1L decides, via a new,
forward-only migration, whether this is a new migration that adds columns
to `workforce.employees`, a new migration that renames it (e.g. `ALTER
TABLE workforce.employees RENAME TO staff_profiles`), or a genuinely new
`staff_profiles` table — decision deferred to Phase 1L, but in every case
the historical `0009_workforce.sql` file itself is not modified.

| Field | Notes |
| --- | --- |
| `tenant_id`, `location_id` | per rules above; `location_id` not null — a staff profile belongs to one home location in this MVP |
| `user_id` | `references core.users(id)`, nullable until the staff member has a login/LINE link |
| `name_encrypted`, `name_hash` | PII pattern already used in `0009_workforce.sql`'s `employees.name_encrypted`/`name_hash` |
| `role_label` | display-only text (e.g. "キッチン", "ホール") — not an access-control role; access control stays in `core.role_assignments` |
| `employment_type` | carried over from `employees.employment_type` |
| `is_active` | soft delete / deactivation |
| `created_by`, `updated_by` | Manager who created/edited the profile |

Relationships: referenced by `shift_assignments`, `shift_requests`,
`work_reports`, `staff_line_links`.
Indexes: `(tenant_id, location_id)`, `(tenant_id)` for tenant-wide Manager
views.
MVP vs. later: `employment_type` and `role_label` are MVP; richer HR fields
(hourly wage, hire date) are explicitly deferred — payroll is out of scope
per the production architecture doc §3.

### `workforce.staff_line_links`

New table. Links a staff profile to a LINE user id, separate from
`core.line_accounts` (which links a `core.users` row generally) so Workforce
can resolve "which staff profile did this LINE user tap through to" even
before/independent of a full `core.users` account existing — see
[`workforce-line-liff-entry-plan.md`](./workforce-line-liff-entry-plan.md)
§8. MVP may in fact just reuse `core.line_accounts` directly if a staff
profile always has a `core.users` row by the time LINE entry ships (Phase
1M decision, not this doc's).

| Field | Notes |
| --- | --- |
| `tenant_id` | per rules |
| `staff_profile_id` | `references workforce.staff_profiles(id) on delete cascade` |
| `line_user_id_encrypted`, `line_user_id_hash` | same PII/blind-index pattern as `core.line_accounts` |
| `linked_at` | timestamp |

Relationships: one staff profile ↔ one LINE user id per tenant (`unique
(tenant_id, line_user_id_hash)`, mirroring `core.line_accounts`).
MVP vs. later: this entire table is Phase 1M scope (LINE entry), listed here
for data-model completeness; it is not created in the phase-3/4 slices of
§15 of the production architecture doc.

### `workforce.shift_types`

New table. Named shift definitions (the demo's `SHIFT_TYPES` legend, e.g.
早番/遅番/中番), currently hardcoded client-side.

| Field | Notes |
| --- | --- |
| `tenant_id`, `location_id` | shift types are typically location-specific |
| `label` | e.g. "早番" |
| `starts_at_local`, `ends_at_local` | time-of-day, not timestamptz — a shift type is a template, not an instance |
| `color_code` | UI legend color, carried from the demo's `SettingsPanel` |
| `is_active` | soft delete |

Relationships: referenced by `shift_assignments.shift_type_id`.
MVP vs. later: MVP includes basic CRUD (matching the demo's
`SettingsPanel`); later work could add break-duration defaults per shift
type.

### `workforce.shift_requests`

Already exists as `workforce.shift_requests` in the historical
`0009_workforce.sql` migration (`kind` = swap/pickup/drop, `status`,
`details jsonb`) — referenced here for context only; that migration is not
edited. Production MVP proposes a new, forward-only migration that builds on
this table (a new allowed `kind` value and, if needed, a new
`requested_period` column) to also cover the demo's next-month
shift-preference submission, rather than creating a parallel table:

| Field (new, via a new migration) | Notes |
| --- | --- |
| `kind` | add `preference` as a new allowed value (the demo's shift-preference calendar), alongside existing `swap`/`pickup`/`drop` — since `kind` is already a free-form `text` column in the historical migration, this needs no schema change, only new rows using the new value |
| `requested_period` | conceptually: which month/week the preference applies to, when `kind = 'preference'`; if added, ships as a new column via its own new migration |
| `details` | keep as `jsonb` — preference-day selections vary in shape and don't need first-class columns for MVP |
| `status` | reuse existing `workforce.request_status` enum (`pending`/`approved`/`rejected`/`cancelled`) |
| `decided_by` | already present |

No new enum or migration is needed for `kind` itself, since it is already a
free-form `text` column in the historical migration; a new
`requested_period` column, if built, is added via its own new, forward-only
migration rather than by editing `0009_workforce.sql`.

### `workforce.shift_assignments`

A new table, proposed to take over the conceptual role the existing
`workforce.shifts` table plays for the demo's actual weekly-shift-table use
case. `shifts` (created in the historical `0009_workforce.sql` migration) is
already a schedulable shift instance; `shift_assignments` is the same
concept. Phase 1L decides, via a new forward-only migration, whether this
is a genuinely new table or a rename of `shifts` performed by a new
migration (e.g. `ALTER TABLE workforce.shifts RENAME TO
shift_assignments`) — in either case the historical `0009_workforce.sql`
file itself is not edited. Documented here as a distinct concept for
clarity.

| Field | Notes |
| --- | --- |
| `tenant_id`, `location_id` | not null |
| `staff_profile_id` | `references workforce.staff_profiles(id)`, nullable = unassigned/open shift |
| `shift_type_id` | `references workforce.shift_types(id)` |
| `work_date` | `date`, not a timestamptz range — shift assignments in the demo are per-day |
| `status` | conceptually `scheduled` / `published` / `cancelled` — a new migration may build on the existing `shifts.published boolean` column (historical `0009_workforce.sql`, not edited) by adding new columns/values |
| `created_by`, `updated_by` | Manager who scheduled/edited it |

Relationships: source for the weekly shift table (staff and manager views);
referenced by `work_reports.shift_assignment_id` (optional link).
Indexes: `(tenant_id, location_id, work_date)` for the weekly view query;
`(staff_profile_id, work_date)` for a staff member's own view.
MVP vs. later: auto-schedule generation logic is explicitly excluded from
this MVP per the production architecture doc §3 — this table only needs to
support manual create/edit.

### `workforce.work_reports`

New table. The persisted equivalent of the demo's clock in/out plus
transportation cost and daily message, currently local React state.

| Field | Notes |
| --- | --- |
| `tenant_id`, `location_id` | not null |
| `staff_profile_id` | not null, `references workforce.staff_profiles(id)` |
| `shift_assignment_id` | optional link to the scheduled shift this report is for |
| `work_date` | `date` |
| `clock_in_at`, `clock_out_at` | `timestamptz`, nullable until the corresponding action happens |
| `transportation_cost` | integer (yen), nullable |
| `daily_message` | `text`, nullable — free-text, treated as potential PII/sensitive content per the security plan |
| `status` | conceptually `open` (clocked in, not out) / `submitted` (clocked out) / `corrected` (has an approved correction) |

Relationships: parent of `workforce.work_report_breaks` and
`workforce.work_report_corrections`.
Indexes: `(tenant_id, location_id, work_date)`; `(staff_profile_id,
work_date)` unique-ish (one report per staff per day in MVP — a `unique
(tenant_id, staff_profile_id, work_date)` constraint is a reasonable MVP
default, revisited if split-shift-per-day becomes a real need).
Audit: every clock in/out write is audited per the production architecture
doc §13.

### `workforce.work_report_breaks`

New table. Breaks within a single work report (the demo's 休憩開始/休憩終了).

| Field | Notes |
| --- | --- |
| `tenant_id` | not null (denormalized from parent for direct RLS checks without a join, matching common Postgres RLS practice) |
| `work_report_id` | `references workforce.work_reports(id) on delete cascade` |
| `break_start_at`, `break_end_at` | `timestamptz`, `break_end_at` nullable until break ends |

Relationships: child of `work_reports`.
Indexes: `(work_report_id)`.
MVP vs. later: MVP supports multiple breaks per report (the demo already
allows more than one break/day); no later fields anticipated.

### `workforce.work_report_corrections`

New table. The persisted equivalent of the demo's correction-request flow,
now with a real approve/reject action (the one gap the Phase 1J-2 closeout
explicitly flagged: the demo has no approve/reject at all).

| Field | Notes |
| --- | --- |
| `tenant_id`, `location_id` | not null |
| `work_report_id` | `references workforce.work_reports(id) on delete cascade` |
| `staff_profile_id` | who submitted it (should match the work report's own staff, enforced by RLS/app logic, not just by convention) |
| `requested_change` | `text` or `jsonb` — the staff member's free-text explanation of what should be corrected (this is the demo's "actual staff correction-request text" per the PR #75 fix) |
| `status` | `workforce.request_status` (`pending`/`approved`/`rejected`/`cancelled`) |
| `decided_by` | `references core.users(id)`, the Manager who decided |
| `decided_at` | `timestamptz`, nullable until decided |
| `decision_note` | optional Manager-facing note on why approved/rejected |

Relationships: child of `work_reports`.
Audit: submission and decision are both separately audited per the
production architecture doc §13 — this is the platform's clearest example of
"human approval for correction requests," so the audit trail here matters
more than most.

### `workforce.transportation_expenses`

Modeled as a field on `work_reports` (`transportation_cost`) for MVP rather
than a separate table, since the demo captures it per-day alongside the
clock in/out, not as an independently dated expense claim. A dedicated
`workforce.transportation_expenses` table is listed in scope for
completeness but is **not needed for MVP** unless a client needs
transportation cost tracked independently of a work report (e.g. an expense
submitted on a day with no shift). If that need appears, it would look like:

| Field | Notes |
| --- | --- |
| `tenant_id`, `location_id` | not null |
| `staff_profile_id` | not null |
| `expense_date` | `date` |
| `amount` | integer (yen) |
| `note` | optional text |

MVP vs. later: start with the `work_reports.transportation_cost` field;
promote to a dedicated table only if a real client need surfaces.

### `workforce.daily_messages`

Modeled as a field on `work_reports` (`daily_message`) for the same reason as
transportation cost — the demo captures one daily message alongside the
day's clock in/out, not as an independent stream. A dedicated
`workforce.daily_messages` table (e.g. for messages not tied to a specific
work report, or multiple messages per day) is **not needed for MVP**.

### `workforce.recipe_categories`

New table.

| Field | Notes |
| --- | --- |
| `tenant_id` | not null; recipes are shared across a tenant's locations in MVP, so no `location_id` unless a client needs per-location recipe books |
| `label_ja`, `label_en` | parallel-language labels, matching the demo's JA/EN pattern |
| `sort_order` | integer, for the demo's category ordering |
| `is_active` | soft delete |

### `workforce.recipes`

New table.

| Field | Notes |
| --- | --- |
| `tenant_id` | not null |
| `recipe_category_id` | `references workforce.recipe_categories(id)` |
| `title_ja`, `title_en` | parallel-language, no auto-translation (production architecture doc §9) |
| `description_ja`, `description_en` | optional |
| `is_popular` | boolean — the demo's 人気 sort-first flag |
| `is_active` | soft delete/archive |
| `created_by`, `updated_by` | Manager |

Relationships: parent of `recipe_ingredients`, `recipe_steps`,
`recipe_notes`.
Indexes: `(tenant_id, is_active, is_popular)` for the demo's grid sort order.

### `workforce.recipe_ingredients`

New table.

| Field | Notes |
| --- | --- |
| `tenant_id` | denormalized for direct RLS |
| `recipe_id` | `references workforce.recipes(id) on delete cascade` |
| `label_ja`, `label_en` | ingredient pill text |
| `sort_order` | integer |

### `workforce.recipe_steps`

New table.

| Field | Notes |
| --- | --- |
| `tenant_id` | denormalized for direct RLS |
| `recipe_id` | `references workforce.recipes(id) on delete cascade` |
| `step_number` | integer |
| `instruction_ja`, `instruction_en` | numbered step text |

### `workforce.recipe_notes`

New table. The demo's optional titled memo block (e.g. 抹茶液の作り方).

| Field | Notes |
| --- | --- |
| `tenant_id` | denormalized for direct RLS |
| `recipe_id` | `references workforce.recipes(id) on delete cascade` |
| `title_ja`, `title_en` | optional block title |
| `body_ja`, `body_en` | supplemental instructions |

### `workforce.manager_alerts` — table or view?

**Recommendation: view, not table.** The demo's 要確認 alerts are entirely
derived from other data — missing clock-outs, pending correction requests,
understaffed shift assignments. A view (in the `api` schema, security-invoker,
per the production architecture doc §12) stays correct automatically as the
underlying data changes, with no risk of a stale/forgotten-to-update alerts
table. A stored table would only be justified if alerts needed to be
manually dismissed/snoozed independent of the underlying condition — not a
demo behavior, and not required for MVP. If that need appears later, the
correct shape is a small `workforce.manager_alert_dismissals` table
recording a dismissal against a computed alert key, not a fully
denormalized alerts table.

Conceptual `api.workforce_manager_alerts` view inputs: work reports with
`clock_in_at` set and `clock_out_at` still null past a reasonable cutoff;
`work_report_corrections` with `status = 'pending'`; shift_assignments for
today/upcoming with no `staff_profile_id` assigned. Scoped by
`tenant_id`/`location_id` via the same `core.has_permission` check pattern,
since it is security-invoker over RLS-protected base tables.

### `workforce.location_workforce_settings`

New table. Per-location Workforce configuration (the demo's `SettingsPanel`
scope beyond shift types).

| Field | Notes |
| --- | --- |
| `tenant_id`, `location_id` | not null, one row per location |
| `clock_out_alert_after_hours` | how long after expected clock-out to raise a 要確認 alert |
| `default_transportation_cost` | optional prefill value |
| `updated_by` | Manager/Owner who last changed settings |

Indexes: `unique (tenant_id, location_id)`.

## Status enums / check constraints (conceptual)

Reuse existing enums where they already fit rather than inventing parallel
ones:

- `workforce.request_status` (`pending`/`approved`/`rejected`/`cancelled`) —
  already defined in `0009_workforce.sql`; reused by `shift_requests` and
  `work_report_corrections`.
- Work report status: conceptually `open`/`submitted`/`corrected` — new
  enum, small enough to be `text` with a `check` constraint instead of a
  full `create type` if preferred at implementation time.
- Shift assignment status: conceptually `scheduled`/`published`/`cancelled` —
  a new migration may build on the existing `shifts.published boolean`
  column (historical `0009_workforce.sql`, not edited) or introduce a new
  enum column if a third state is needed; implementation decision, not
  fixed here.

## Relationships summary

```
core.tenants ──< core.locations
core.tenants ──< workforce.staff_profiles >── core.users
workforce.staff_profiles ──< workforce.staff_line_links
workforce.staff_profiles ──< workforce.shift_assignments >── workforce.shift_types
workforce.staff_profiles ──< workforce.shift_requests
workforce.staff_profiles ──< workforce.work_reports ──< workforce.work_report_breaks
workforce.work_reports ──< workforce.work_report_corrections
workforce.recipe_categories ──< workforce.recipes ──< workforce.recipe_ingredients
                                                   ──< workforce.recipe_steps
                                                   ──< workforce.recipe_notes
core.tenants/core.locations ── workforce.location_workforce_settings (1:1 per location)
(derived, not stored) workforce.manager_alerts ← work_reports, work_report_corrections, shift_assignments
```

## Indexes (summary)

In addition to per-table notes above, follow `0009_workforce.sql`'s existing
convention of a `tenant_id`-leading composite index per table
(`wf_<table>_tenant_idx`), plus a second index for the table's dominant
query pattern (date range, status, or staff member) — mirrored from
`wf_shift_requests_tenant_idx(tenant_id, status)` and
`wf_attendance_tenant_idx(tenant_id, work_date)`.

## MVP vs. later fields — summary

| Deferred to later | Reason |
| --- | --- |
| `staff_profiles` wage/hire-date fields | Payroll is out of scope (production architecture doc §3) |
| `shift_types` break-duration defaults | Not required for the demo-parity MVP |
| Dedicated `transportation_expenses` table | Field on `work_reports` is sufficient until a real independent-expense need appears |
| Dedicated `daily_messages` table | Field on `work_reports` is sufficient |
| `manager_alerts` as a stored/dismissable table | Start as a view; add dismissals only if needed |
| `staff_line_links` | Phase 1M (LINE entry) scope, not phase 3/4 of the MVP |
| Auto-schedule-related fields on `shift_assignments` | Auto-schedule is explicitly excluded from this MVP |
