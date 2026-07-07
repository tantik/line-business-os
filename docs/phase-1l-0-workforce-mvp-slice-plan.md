# Phase 1L-0 Workforce First MVP Slice Implementation Plan

Status: **Planning only. No SQL migrations, no Supabase migrations, no app
code, no backend code, and no database behavior change in this phase.**
Phase 1L-1 will create new, forward-only migrations after this plan is
reviewed; already-applied migrations are never edited. This revision closes
the two implementation decisions the initial draft left open — the recipe
publish-state mechanism (§5) and the Workforce permission-key scheme (§6) —
by docs-only edits; no migration or code file changes.
Phase: 1L-0. Read with:
[`architecture/workforce-production-mvp-architecture.md`](./architecture/workforce-production-mvp-architecture.md),
[`architecture/workforce-data-model.md`](./architecture/workforce-data-model.md),
[`architecture/workforce-rls-security-plan.md`](./architecture/workforce-rls-security-plan.md),
[`architecture/workforce-line-liff-entry-plan.md`](./architecture/workforce-line-liff-entry-plan.md),
[`phase-1k-workforce-production-mvp-architecture.md`](./phase-1k-workforce-production-mvp-architecture.md),
[`product/mvp-roadmap.md`](./product/mvp-roadmap.md).

## 1. Executive Summary

Phase 1K produced a complete, docs-only architecture, data model, and RLS
plan for a real (persisted, tenant/location-scoped) Workforce module. It
deliberately stopped short of choosing exactly which slice of that large
design ships first, and deliberately wrote no SQL. Phase 1L-0 exists to close
that gap: it inspects the current repository state (migrations, RBAC, audit,
API-facade patterns, and pgTAP tests) to confirm the Phase 1K design still
matches reality, validates the Phase 1K recommendation that "staff profiles +
recipes" should be the first implementation slice, and turns that
recommendation into a concrete, reviewable data-model/RLS/API/test/migration
plan that Phase 1L-1 can execute without re-deriving any of this analysis.

This document creates no migrations and changes no code. Its only outputs are
this plan file and a minimal roadmap pointer. Everything it recommends is
subject to human review before Phase 1L-1 writes a single `CREATE TABLE`.

## 2. Current Repository Inspection

Inspection covered `supabase/migrations/0000`–`0019`, `supabase/tests/`,
`packages/core/src/permissions.ts`, and the Phase 1K docs. Summary of what
matters for implementation:

- **Core tenancy/RBAC backbone** (`0000`–`0003`, `0006`, `0008`) is in place
  and stable: `core.tenants`, `core.locations`, `core.users`,
  `core.tenant_memberships` (source of truth for tenant isolation),
  `core.tenant_modules` (module entitlement), and a full RBAC layer
  (`core.permissions`, `core.roles`, `core.role_permissions`,
  `core.role_assignments`). `core.has_permission(tenant_id, permission,
  location_id)` (`0006_helpers.sql`) is the single RLS decision function used
  by every module, including the existing Workforce tables — Phase 1L should
  reuse it unchanged, not invent a parallel check.
- **RBAC seed data** (`0008_rbac_seed.sql`) already defines the
  Owner/Manager/Employee system roles Phase 1K's role matrix maps onto
  (`tenant_owner`, `manager`, `employee`), but the permission catalog
  currently only has four `workforce.*` keys: `workforce.shift.read`,
  `workforce.shift.write`, `workforce.attendance.manage`,
  `workforce.request.manage` (confirmed identically in
  `packages/core/src/permissions.ts`). None of the five permissions this
  slice needs — `workforce.staff.read`, `workforce.staff.manage`,
  `workforce.recipe.read`, `workforce.recipe.manage`,
  `workforce.recipe.publish` (§6) — exist yet in either the DB catalog or
  code. Because `packages/core/src/permissions.ts` currently mirrors the DB
  catalog key-for-key, Phase 1L-1 must add both: new rows in
  `core.permissions`/`core.role_permissions` (a new migration, following
  `0008_rbac_seed.sql`'s pattern) and matching constants in
  `permissions.ts`, in the same reviewed PR — not just new tables.
- **Audit** (`0005_audit.sql`) is a single, append-only, cross-module
  `audit.audit_logs` table (enforced append-only by a `BEFORE UPDATE OR
  DELETE` trigger, not just convention). Workforce writes into this existing
  table; no new audit table is needed.
- **API facade pattern** (`0015`, `0017`, `0018`, `0019`) is well-established
  and directly reusable: a dedicated `api` schema holding only
  `security_invoker = true` views and non-`SECURITY DEFINER` SQL functions,
  `anon` granted nothing, `authenticated` granted narrow `SELECT`/`EXECUTE`
  only on exactly the objects it needs. `core` itself is never in the Data
  API's exposed-schema list. This is the pattern Phase 1K's RLS plan (§9)
  already commits to for Workforce reads.
- **pgTAP/RLS tests exist** at `supabase/tests/0001`–`0006`. The
  security-invariant suite, `0002_security_rls.sql`, is directly relevant and
  is **not to be edited** in this phase. It currently asserts, among other
  things: (a) every base table in `core`/`audit`/`workforce`/`booking`/`ai`
  has RLS enabled, and (b) — this is the important finding for this
  slice — **`authenticated` and `anon` currently hold zero table grants on
  the `workforce`, `audit`, `booking`, or `ai` schemas.** In other words,
  today nothing in Workforce is reachable directly from the browser; all
  Workforce reads/writes happen through the backend service-role path only.
  Implementing this slice's `security_invoker` `api` views over
  `workforce.staff_profiles`/`workforce.recipes*` will require granting
  `authenticated` `SELECT` on those specific new tables (so RLS can engage
  for the caller) — which will require **updating** `0002_security_rls.sql`'s
  "zero grants on workforce" assertion to "zero grants except these specific
  new read surfaces," mirroring how `0013`→`0017` narrowed/extended the
  equivalent `core` assertion. That test edit belongs to Phase 1L-3, not this
  plan, but it is called out here because it changes an existing safety
  invariant and must be a deliberate, reviewed change, not an incidental
  side effect.

## 3. Existing Workforce Scaffold

`supabase/migrations/0009_workforce.sql` (historical, immutable) already
created:

- `workforce.employees` — tenant/location-scoped staff record with
  `name_encrypted`/`name_hash` PII pattern, `position`, `employment_type`,
  `is_active`.
- `workforce.shifts`, `workforce.shift_requests`, `workforce.leave_requests`,
  `workforce.attendance` — all tenant-scoped (location-scoped where
  physical), RLS-gated via `core.has_permission(tenant_id, key,
  location_id)`.
- Two enums: `workforce.request_status`, `workforce.attendance_status`.
- RLS already enabled and policies already installed on all five tables,
  keyed to `workforce.shift.read`/`workforce.shift.write`/
  `workforce.attendance.manage`/`workforce.request.manage`.

None of this is edited by Phase 1L. For this slice specifically:

- **`workforce.employees` is reused, not replaced.** It already has the
  exact tenant/location/PII shape Phase 1K's `staff_profiles` needs. Per
  §4/§5 below, Phase 1L-1 should extend it in place with new, additive
  columns via a new migration (`role_label`, `created_by`, `updated_by`) —
  not create a parallel `workforce.staff_profiles` table and not rename
  `employees`. A rename was one option the Phase 1K data-model doc left
  open; inspection of the actual table shows it already fits the MVP need
  well enough that a rename adds churn (existing FKs from `shifts`,
  `shift_requests`, `leave_requests`, `attendance` all point at
  `employees.id`) without a corresponding benefit.
- `workforce.shifts`/`shift_requests`/`leave_requests`/`attendance` are
  **out of scope for this slice** and are not touched — they belong to
  later Phase 1L slices (shift requests/assignments, then work
  reports/corrections) per the Phase 1K phasing (§15 of the architecture
  doc). Recipes have no existing scaffold at all; every recipe-related table
  is new.
- Nothing in the existing scaffold should be avoided or worked around —
  `employees` is fit for purpose as the staff-profile base table.

## 4. First Slice Recommendation

**Confirmed: the first Phase 1L implementation slice is staff profiles
(extending `workforce.employees`) + recipe/manual sharing**, exactly as
Phase 1K's architecture doc (§15) and the current `mvp-roadmap.md` "Next
Recommended Step" already propose. Inspection in §2–§3 does not surface a
better alternative; if anything it strengthens the case:

- **Lowest schema risk.** `workforce.employees` already exists with the
  right tenant/location/PII shape — this slice is additive columns plus five
  brand-new, self-contained recipe tables with no dependency on
  shifts/attendance/work-reports.
- **No payroll/legal-attendance exposure.** Nothing in this slice touches
  clock-in/out, breaks, transportation cost, or corrections — the areas
  flagged as legally sensitive in the architecture doc §3.
- **Read-heavy, easy to get RLS right.** Recipes are tenant-wide read for
  Staff (§5–§7 below) with Manager/Owner-only writes — a simpler policy
  shape than the self-scoped, per-row-ownership rules that work reports and
  corrections will need later.
- **Immediately useful to the first cafe client** independent of anything
  else shipping — recipe sharing was already identified as an easy, low-risk
  sell in the Phase 1J-2 closeout, and turns the sales demo's hardcoded
  recipe array into real, tenant-owned data.
- **Establishes the reusable pattern.** This slice is the first place a new
  Workforce table gets an `api`-schema `security_invoker` view and new
  `workforce.*` permission keys added end-to-end — later slices (shift
  assignments, work reports) follow the same pattern rather than inventing
  their own.

No change to this recommendation is proposed.

## 5. Data Model Delta for First Slice

Conceptual delta only — final column types/constraints/migration ordering
are decided in Phase 1L-1, not here.

**`workforce.employees` (extend in place, new migration, no rename):**

- Add `role_label text` — display-only text (e.g. "キッチン", "ホール"), not
  an access-control role.
- Add `created_by uuid references core.users(id)`,
  `updated_by uuid references core.users(id)` — Manager who created/edited
  the profile. Nullable (existing rows, if any local/dev seed data exists,
  have no historical author).
- No change to `tenant_id`, `location_id`, `user_id`, `name_encrypted`,
  `name_hash`, `position`, `employment_type`, `is_active` — reused as-is.
- `location_id` stays nullable at the column level (matches the historical
  migration's `on delete set null`), but Phase 1L-1 should decide whether
  this slice's write path requires it to be set for new rows (the Phase 1K
  data model treats a staff profile's home location as required in
  practice) — an application/API-layer constraint if the column itself
  isn't tightened, to avoid an incompatible constraint change on a
  historical table.

**New tables (all new, forward-only migration(s)):**

- `workforce.recipe_categories` — `tenant_id` (not null; tenant-wide, no
  `location_id`), `label_ja`, `label_en`, `sort_order`, `is_active`,
  `created_at`/`updated_at`.
- `workforce.recipes` — `tenant_id` (not null), `recipe_category_id`
  (`references recipe_categories(id)`), `title_ja`, `title_en`,
  `description_ja`, `description_en` (nullable), `is_popular boolean`,
  a **publish-state column** — see below, `is_active boolean` (archive),
  `created_by`, `updated_by`, `created_at`/`updated_at`.
- `workforce.recipe_ingredients` — `tenant_id` (denormalized, for direct RLS
  without a join), `recipe_id` (`references recipes(id) on delete cascade`),
  `label_ja`, `label_en`, `sort_order`.
- `workforce.recipe_steps` — `tenant_id` (denormalized), `recipe_id`
  (cascade), `step_number`, `instruction_ja`, `instruction_en`.
- `workforce.recipe_notes` — `tenant_id` (denormalized), `recipe_id`
  (cascade), `title_ja`, `title_en` (nullable), `body_ja`, `body_en`.

**Published/draft/archive status — decided.** `workforce.recipes` gets a
`status text not null default 'draft' check (status in ('draft',
'published', 'archived'))` column, not a PostgreSQL enum, and not an
overload of `is_active`:

- **Not `is_active`.** `is_active` alone cannot distinguish "Manager is
  still drafting this recipe" from "this recipe was retired" — two
  different concerns need two different signals. `status = 'archived'`
  fully supersedes a separate `is_active` flag on `recipes` (§ Soft delete,
  below), so `recipes` does not carry both columns.
- **`text` + `check`, not `create type ... as enum`.** `0009_workforce.sql`
  does set a precedent for PostgreSQL enums in this module
  (`workforce.request_status`, `workforce.attendance_status`), but those
  enums model fixed, unlikely-to-change lifecycle states shared across
  several tables. Recipe `status` is a single-table, content-authoring
  concept more likely to gain a state (e.g. an `in_review` step) as the
  recipe/manual feature matures, and a PostgreSQL enum requires its own
  `ALTER TYPE ... ADD VALUE` migration with more operational friction than
  a `text` column (a `check` constraint is dropped and re-added with a
  single `ALTER TABLE` in one new, forward-only migration). For a
  three-value MVP status with no cross-table reuse, that flexibility
  outweighs the type-safety benefit an enum would otherwise offer, so this
  slice does not extend the existing enum precedent to `recipes.status`.
- The RLS plan (§6) reads this column directly (`status = 'published'`) for
  the Staff-read predicate.

**Tenant/location scoping:** every new table has `tenant_id uuid not null
references core.tenants(id) on delete cascade`. None of the recipe tables
get `location_id` — recipes are tenant-wide reference material per the
architecture doc §9 and data model doc §5, not per-store. `employees`
keeps its existing `location_id`.

**`created_by`/`updated_by`:** on `employees` (added) and `recipes` (new);
omitted on `recipe_ingredients`/`recipe_steps`/`recipe_notes` (child rows
inherit authorship context from their parent recipe, per the data model
doc's convention of skipping these on low-mutation child/reference rows) and
on `recipe_categories` (low-mutation reference data, matching the
convention already used for `workforce.shift_types` in the Phase 1K doc).

**Soft delete:** `recipe_categories.is_active` (unchanged pattern);
`recipes` uses the new `status` column's `archived` state instead of a
separate `is_active` (see above) to avoid two overlapping flags. Child
tables (`recipe_ingredients`/`recipe_steps`/`recipe_notes`) are never
independently soft-deleted — they are deleted/replaced with their parent
recipe (`on delete cascade`) or edited in place; archiving happens at the
recipe level only.

**Indexes:** following the existing `wf_<table>_tenant_idx` convention from
`0009_workforce.sql`:

- `employees`: existing `wf_employees_tenant_idx` unchanged; no new index
  needed for the two added columns.
- `recipe_categories`: `(tenant_id, is_active, sort_order)`.
- `recipes`: `(tenant_id, status, is_popular)` — matches the demo's grid
  sort order and the Staff-read-published-only query pattern.
- `recipe_ingredients`, `recipe_steps`, `recipe_notes`: `(recipe_id)` on
  each (dominant access pattern is "all children of one recipe"); a
  `(tenant_id)` index is optional given the low row count per tenant
  expected in this MVP, decided at implementation time.

## 6. RLS Plan for First Slice

Conceptual policies only; exact SQL is written in Phase 1L-1/1L-2.

- **`anon` denied everywhere.** No policy grants `anon` anything on
  `workforce.employees` or any recipe table, and — per §2's finding —
  `anon` gets no `GRANT` on these tables or their `api` views either. This
  matches the existing `0009_workforce.sql` posture and the platform-wide
  "anon granted nothing" rule.
- **Authenticated access gated by tenant membership**, via the same
  `core.has_permission(tenant_id, permission, location_id)` predicate every
  other Workforce table already uses — no new/bespoke tenant-check
  expression.
- **`employees` (extended, not new) — new permissions, decided.** Its
  existing policies (`wf_employees_read`/`wf_employees_write`) are keyed to
  `workforce.shift.read`/`workforce.shift.write` today, but Phase 1L-1 adds
  new policies keyed to the new `workforce.staff.read`/
  `workforce.staff.manage` permissions and does not continue to gate staff
  profile access on the shift permissions — "read a staff profile" and
  "read a shift" are different concerns that only shared a permission key
  because `employees` predates this distinction. This is a new migration
  adding new policies (`drop policy` + `create policy` on the existing
  table is allowed; only the historical migration *file* is immutable, not
  the live policy), not an edit to `0009_workforce.sql`.
- **Staff read own profile only**, matched by `employees.user_id =
  core.current_user_id()` — the direct fix for the demo's hardcoded
  `CURRENT_STAFF_ID`, per the RLS plan doc §6. Staff get no read access to
  other staff members' `employees` rows in this slice (no directory
  feature).
- **Manager read/write staff profiles scoped to their assigned
  location(s)**, via `core.has_permission(tenant_id,
  'workforce.staff.manage', location_id)` matching `employees.location_id`.
- **Owner read/write tenant-wide** — `core.has_permission`'s existing
  tenant-wide semantics when a Manager/Owner's `role_assignments` row has
  `location_id is null`; no separate Owner-specific policy needed (same
  mechanism `core.has_permission` already provides platform-wide).
- **Recipe permissions — three keys, decided.** Recipes use three distinct
  permission keys rather than a single read/write pair, so that "read,"
  "author," and "publish" are independently grantable and auditable:
  `workforce.recipe.read` (view published recipes), `workforce.recipe.manage`
  (create/update recipe content and archive a recipe), and
  `workforce.recipe.publish` (transition `status` between `draft` and
  `published`). For this MVP, Owner and Manager roles are seeded with all
  three; the split exists so a future narrower role (e.g. a content editor
  without publish authority) is possible later without a schema change —
  not because this MVP grants them separately.
- **Staff read only *published* recipes for their tenant** — `recipes`
  policy predicate: `core.has_permission(tenant_id, 'workforce.recipe.read')
  and status = 'published'` for a holder of only `recipe.read`, vs. no
  `status` filter for anyone who also holds `workforce.recipe.manage` (who
  needs to see drafts and archived recipes to edit/restore them). Expressed
  as two permissive policies — one unconditional for `recipe.manage`
  holders, one `published`-only for `recipe.read`-only holders — since
  Postgres RLS `OR`s multiple permissive policies together.
- **Manager CRUD recipes for their tenant** — recipes are tenant-wide, not
  location-scoped (§5), so Manager write access here is effectively
  tenant-wide once they hold `workforce.recipe.manage` in any location
  within that tenant, matching the architecture/RLS-plan docs' explicit
  "recipes are not location-scoped" decision. Ordinary content writes
  (title/description/ingredients/steps/notes, archive/restore) check
  `workforce.recipe.manage`; a write that changes `status` to/from
  `published` additionally requires `workforce.recipe.publish` — enforced
  in the `with check` clause on `recipes` and/or in `apps/api` (§7), so a
  `recipe.manage`-only holder (if that role ever exists) can edit content
  but cannot publish. Recipe child tables (`recipe_ingredients`/
  `recipe_steps`/`recipe_notes`) mirror the parent recipe's `recipe.manage`
  policy via a `recipe_id in (select id from recipes where ...)` predicate
  (denormalized `tenant_id` lets this stay a simple tenant check, not a
  second full permission re-evaluation) — child rows have no independent
  publish concept.
- **Owner tenant-wide recipe management** — same `core.has_permission`
  tenant-wide semantics as staff profiles, across all three recipe
  permission keys.
- **Cross-tenant isolation**: every predicate above starts from
  `tenant_id`, so a user with no active membership in tenant B can never
  satisfy any policy for tenant B's rows — no code path accepts a
  client-supplied `tenant_id` (`core.has_permission` always evaluates
  against the caller's own `role_assignments`).
- **`service_role` never exposed to the frontend.** Nothing in this slice
  changes that — `apps/web` continues to use the anon key only, and any
  write not covered by RLS-permitted direct access (see §7) goes through
  `apps/api`'s service-role path.

## 7. API/View Boundary Plan

Recommend a **mixed approach**, consistent with §12 of the architecture doc
and §9 of the RLS plan doc:

- **Reads: `api`-schema `security_invoker` views**, following
  `0015_api_facade.sql`'s exact pattern:
  - `api.workforce_my_staff_profile` — the caller's own `employees` row
    (self-scoped, no PII beyond what the view's consumer needs — likely
    excludes `name_encrypted`/`name_hash` raw bytes, exposing only
    `display`-safe fields plus whatever decrypted-name resolution already
    happens at the app layer for the current `employees` table, which is
    out of scope for this doc).
  - `api.workforce_recipes` (+ companion views or a single JSON-aggregated
    view for ingredients/steps/notes — implementation-time choice) —
    tenant-scoped, `security_invoker`, relying on the underlying `recipes`
    RLS to filter to published rows for Staff and all rows for
    Manager/Owner. No `SECURITY DEFINER` object, matching the existing
    `api` schema invariant.
  - Manager/Owner staff-directory reads (list of staff in their
    location/tenant) can also be a view — `api.workforce_staff_directory`
    — scoped the same way as the underlying table's RLS.
- **Writes: exclusively through `apps/api`**, following the architecture
  doc §12's existing "privileged write" flow — derive tenant/location from
  membership, call `requirePermission` for the relevant new key
  (`workforce.staff.manage` for staff-profile writes,
  `workforce.recipe.manage` for recipe content writes, and
  `workforce.recipe.publish` specifically for the publish/unpublish status
  transition), write via the service-role client, write an audit entry.
  This matches the RLS plan doc §9's explicit rule that mutation-sensitive
  tables should not get a direct
  `authenticated` `INSERT`/`UPDATE`/`DELETE` grant even where RLS would
  technically allow it — RLS stays defense-in-depth, `apps/api` is the
  primary gate, for consistency with how every other Workforce write is
  planned.
- **Why not direct table access with RLS for writes:** it would work
  (`employees`/`shifts` already prove RLS-gated direct writes are technically
  possible in this schema), but it would break from the pattern the
  architecture doc has already committed to for every other Workforce
  mutation (work reports, corrections, shift decisions), and it would mean
  two different write postures inside the same module depending on which
  slice shipped first. Consistency across the whole Workforce module is
  worth more than the small amount of `apps/api` boilerplate this slice
  would otherwise skip.
- **Why not RPC-functions-only for reads:** views are simpler than RPCs for
  plain filtered `SELECT`s (no PostgREST RPC contract to maintain) and match
  every existing read-facade precedent (`api.my_tenant_memberships`,
  `api.my_tenant_locations`, `api.my_tenant_modules`); reserve RPC functions
  (like `api.has_permission`) for cases that return a computed scalar/small
  result, not a filtered row set.

## 8. Audit Plan

Per the architecture doc §13 and RLS plan doc §11, this slice's mutations
that need an `audit.audit_logs` row (`module = 'workforce'`):

- Staff profile created.
- Staff profile updated (any field, including `role_label`,
  `employment_type`, `location_id` reassignment).
- Staff profile deactivated (`is_active` flip to `false`).
- Recipe created.
- Recipe updated (title/description/ingredients/steps/notes changes).
- Recipe published (`status` → `published`).
- Recipe unpublished (`status` → `draft`, if that transition is allowed
  post-publish).
- Recipe archived (`status` → `archived`).

Role/access changes (who is Manager vs. Staff) are **not** a new audit
requirement here — they already flow through the existing Core
`role_assignments` write path per the architecture doc §13, and this slice
does not add a Workforce-specific role concept.

`before`/`after` payloads follow the existing `redactPII` pattern — staff
profile audit entries must never store decrypted `name_encrypted` content;
recipe audit entries have no PII concern (recipe text is not personal data)
so `before`/`after` can be closer to a full field diff there.

## 9. pgTAP / RLS Test Plan

New test file(s) in Phase 1L-3 (not written by this plan), following the
existing `supabase/tests/0001`–`0006` naming/structure and the platform's
"own-tenant, cross-tenant, anon, no-JWT" pattern:

1. Same-tenant Staff can read their own `employees` row; same-tenant
   Manager can read/write staff profiles within their assigned location.
2. Cross-tenant access denied: a user authenticated in tenant A cannot
   read/write tenant B's `employees` or `recipes*` rows, for every new/
   extended table.
3. `anon` denied: no `SELECT`/`INSERT`/`UPDATE`/`DELETE` on `employees` or
   any recipe table, and no `SELECT` on the new `api` views, from `anon`.
4. No-JWT / expired JWT denied: a request with no valid session gets the
   same denial as `anon` on every new/extended table and view.
5. Staff cannot edit `employees` (their own or anyone else's) — only
   Manager/Owner with `workforce.staff.manage` can.
6. Staff cannot edit `recipes`/`recipe_ingredients`/`recipe_steps`/
   `recipe_notes` — read-only for Staff (`workforce.recipe.read` only).
   Separately, a `workforce.recipe.manage` holder without
   `workforce.recipe.publish` cannot transition `status` to/from
   `published` — content edits succeed, the publish transition is denied.
7. Manager can edit `employees`/`recipes` only within their own
   tenant/location (a Manager scoped to location A cannot write a staff
   profile whose `location_id = B` in the same tenant).
8. Owner can manage `employees`/`recipes` tenant-wide, across every
   location.
9. Published vs. draft recipe access: Staff can read `status = 'published'`
   recipes but not `draft`/`archived` ones; Manager/Owner can read all
   three states.
10. Archived recipe behavior: an archived recipe disappears from the
    Staff-facing `api.workforce_recipes` view but remains queryable by
    Manager/Owner (retained, not hard-deleted).
11. `0002_security_rls.sql`'s existing "zero grants on workforce" assertion
    must be updated (per §2's finding) to reflect the new, intentional
    `authenticated` `SELECT` grants on `workforce.employees`/`recipes*` —
    written and reviewed as its own explicit change, not silently left
    failing or silently loosened.
12. Audit coverage: every mutation in §8 produces exactly one
    `audit.audit_logs` row with correct `actor_id`, `module = 'workforce'`,
    `entity`, `action`.

## 10. Local Verification Plan

Conceptual commands only — none run as part of this docs-only phase:

- `pnpm exec supabase db reset` — rebuild local DB from all migrations
  (historical + new Phase 1L-1 ones) plus seed data.
- `pnpm exec supabase test db` — run the full pgTAP suite, including the
  new Phase 1L-3 tests and the updated `0002_security_rls.sql` assertion.
- Typecheck (`pnpm typecheck` or equivalent) — only once Phase 1L-4/1L-5
  touch `packages/core/src/permissions.ts` or any app code.
- Lint/build — only once app code is touched (Phase 1L-5), not for the
  DB-only phases (1L-1/1L-2/1L-3).
- No Cloud command of any kind (`db push`, `db pull`, `link`, `migration
  repair`) is part of local verification — those require explicit human
  approval per `CLAUDE.md` and are out of scope for every phase of this
  plan, not just this planning step.

## 11. Migration Plan for Phase 1L

- **Naming**: continue the existing flat numeric sequence —
  `0020_workforce_staff_profiles.sql` (extends `employees`, adds the
  `workforce.staff.read`/`workforce.staff.manage` permission rows) and
  `0021_workforce_recipes.sql` (new recipe tables + RLS + `api` views + the
  `workforce.recipe.read`/`workforce.recipe.manage`/
  `workforce.recipe.publish` permission rows) as illustrative next
  filenames — exact numbers depend on what else merges first; Phase 1L-1
  should check `ls supabase/migrations` again immediately before authoring
  to avoid a numbering collision.
- **Order**: staff-profile extension before recipes, since recipes'
  `created_by`/`updated_by` conceptually reference the same Manager
  identity model, and because the RLS plan's staff-directory read is a
  smaller, lower-risk first migration to validate the new
  `workforce.staff.*` permission keys before adding a second, larger table
  group. Splitting into two migrations (rather than one large one) keeps
  each migration independently reviewable and revertable.
- **Rollback considerations**: both migrations are purely additive
  (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`, `CREATE POLICY`, `INSERT
  INTO core.permissions`) — no destructive `ALTER`/`DROP` against
  historical objects. A rollback, if ever needed, is a new down-migration
  (or manual `DROP TABLE`/`ALTER TABLE ... DROP COLUMN` script) applied
  forward, never a rewrite of `0020`/`0021` themselves once merged.
- **Review before Cloud**: both migrations run locally (`supabase db
  reset` + pgTAP) and are code-reviewed before any Supabase Cloud
  `db push` — which itself requires separate, explicit human approval per
  `CLAUDE.md`'s highest-risk constraints and is not part of Phase 1L-1's
  scope.
- **No historical migration is edited.** `0009_workforce.sql` is not
  touched; `employees` is extended by `ALTER TABLE` in the new migration
  only.

No migration files are created as part of this plan.

## 12. Implementation Task Breakdown

- **1L-1 — DB foundation for staff profiles + recipes.** New forward-only
  migration(s): extend `workforce.employees` (§5), create the five recipe
  tables (§5), add the five new permission catalog rows —
  `workforce.staff.read`, `workforce.staff.manage`,
  `workforce.recipe.read`, `workforce.recipe.manage`,
  `workforce.recipe.publish` — and role-permission mappings (mirroring
  `0008_rbac_seed.sql`'s pattern), **and**, in the same reviewed PR, add the
  matching constants to `packages/core/src/permissions.ts` so the DB
  catalog and the code constants do not drift out of sync. Both decisions
  this task implements (permission scheme: §6; publish-state column: §5)
  are closed by this Phase 1L-0 revision — 1L-1's job is to implement them,
  not to re-decide them.
- **1L-2 — RLS policies.** Enable RLS on every new table (already required
  in the same migration that creates it, per platform convention);
  implement the policies in §6, including the Staff-published-only /
  Manager-all-states recipe read split.
- **1L-3 — pgTAP tests.** Implement every test in §9, including the
  deliberate, reviewed update to `0002_security_rls.sql`'s grant-count
  assertion.
- **1L-4 — API/facade.** Create the `api`-schema views in §7
  (`api.workforce_my_staff_profile`, `api.workforce_recipes` and any
  companion views, `api.workforce_staff_directory`), plus the
  `apps/api` write endpoints/service methods for staff-profile and recipe
  CRUD (permission check → service-role write → audit entry).
- **1L-5 — Minimal app integration, later, if approved.** New authenticated
  Workforce routes in `apps/web` (distinct from `/demo/cafe*` and
  `/dashboard`, per the architecture doc §14) wiring the 1L-4 API/views into
  a real staff/manager UI. Explicitly gated on separate approval — not
  assumed to follow automatically from 1L-1–1L-4.

Each of 1L-1 through 1L-4 should be small enough to land as its own
reviewable PR, matching the platform's existing per-phase PR pattern.

## 13. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Duplicate table risk — creating a parallel `staff_profiles` table alongside `employees` | §3/§5 confirm `employees` is reused and extended, not duplicated; FKs from `shifts`/`shift_requests`/`leave_requests`/`attendance` to `employees.id` are a concrete reason a parallel table would fragment staff identity across the module. |
| Tenant isolation risk | Every new table carries `tenant_id not null`; every policy starts from `core.has_permission`/`core.is_member_of`, the platform's single already-tested isolation mechanism (§6, §9). |
| Location isolation risk | `employees.location_id` scoping is unchanged from the historical migration; recipes are deliberately tenant-wide, not location-scoped, per an explicit, documented decision (§5, §6) rather than an oversight. |
| Over-engineering risk | This slice adds exactly the tables/columns/views needed for staff profiles + recipes — no shift/work-report/correction schema, no payroll fields, no LINE linkage table (`staff_line_links` stays Phase 1M per the data model doc). |
| Payroll/legal-attendance scope creep | Nothing in this slice touches clock in/out, hours, or pay; §5 explicitly keeps wage/hire-date fields deferred, matching the architecture doc §3's exclusions. |
| Editing a historical migration | `0009_workforce.sql` is not modified; `employees` changes ship as `ALTER TABLE` in a new migration (§5, §11). |
| `service_role` exposure risk | Writes stay behind `apps/api` (§7); `apps/web` never gets a direct write grant on `employees`/`recipes*`, and `anon` gets nothing at all (§6). |
| Japanese personal data / LINE user ID risk | This slice adds no new LINE-linked PII — `staff_line_links` is out of scope (Phase 1M). The one PII surface touched, `employees.name_encrypted`/`name_hash`, is unchanged, already-established pattern; recipe content has no personal-data concern. |
| Weakening an existing safety test unintentionally | §2/§9 explicitly flag that `0002_security_rls.sql`'s "zero grants on workforce" assertion must change as a deliberate, reviewed edit in 1L-3, with a replacement assertion checking the exact new grant set — not a silent loosening. |
| Publish/draft/archive states left ambiguous | Closed by this revision (§5): a `text` column with a `check` constraint (`draft`/`published`/`archived`), not an enum and not an overload of `is_active`, decided rather than left to be improvised during 1L-1 implementation. |
| Conflating staff/recipe access with unrelated `workforce.shift.*` permissions, or DB permission catalog drifting from `packages/core/src/permissions.ts` | Closed by this revision (§6): five new explicit permission keys (`workforce.staff.read`/`.manage`, `workforce.recipe.read`/`.manage`/`.publish`) are seeded instead of reusing `workforce.shift.*`; §12 requires the DB migration and the `permissions.ts` constants to land in the same 1L-1 PR so the two never drift. |

## 14. Recommended Next Step

**Phase 1L-1 — Workforce Staff Profiles + Recipes DB Foundation.**

Both implementation decisions this plan originally left open are now
closed by this revision:

1. **Recipe publish state** (§5): `workforce.recipes.status` is a `text`
   column with a `check (status in ('draft', 'published', 'archived'))`
   constraint — not a PostgreSQL enum, not an overload of `is_active`.
2. **Workforce permission scheme** (§6): Phase 1L-1 adds five new, explicit
   permission keys — `workforce.staff.read`, `workforce.staff.manage`,
   `workforce.recipe.read`, `workforce.recipe.manage`,
   `workforce.recipe.publish` — and does not reuse `workforce.shift.*` for
   staff-profile or recipe/manual management.

Phase 1L-0 is docs-only: this document does not create migrations, does not
add permission rows to `core.permissions`, and does not add constants to
`packages/core/src/permissions.ts`. Phase 1L-1 implements both decisions
above as new, forward-only migration(s) plus the matching
`packages/core/src/permissions.ts` constants, landed together in one
reviewed migration/code PR (§12) — not re-litigated, and not split across
separate PRs that could let the DB catalog and the code constants drift
apart. Phase 1L-1 should create that PR only after this plan (Phase 1L-0)
has been reviewed.
