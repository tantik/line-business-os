# Platform Foundation ↔ dev Reconciliation — Implementation Handoff (2026-08-29)

Status: **PR OPEN on branch `feat/platform-foundation-reconciliation`
(RED path — migrations — autonomous `dev` merge forbidden, left for Founder
merge). No Cloud apply. `main` untouched.**

Supersedes the read-only triage
`docs/ai/PLATFORM_FOUNDATION_MAIN_DEV_RECONCILIATION_TRIAGE_2026-08-23.md`
and the pre-apply forensic report (Operations Cloud DEV mission, 2026-08-29).

## 1. Why `main` and `dev` diverged

`git merge-base origin/main origin/dev` = `e03f93b` (2026-08-16 17:01 JST).
Since then:

- **`main`** got 19 commits: the **Platform Foundation critical path** — 5
  PRs #254/256/258/260/262, historically numbered `0069`–`0073`
  (Entitlements engine → Module Registry → Shared Navigation/Settings →
  Notifications → Event Bus), plus PR #264 (restored a lost `0060`), PR
  #266/267 (Surface A retirement), PR #268 (a New-Tenant Provisioning Test
  doc), and 3 Cafe P1 fixes.
- **`dev`** got 213 commits: every Cafe v2.1 + v2.2 mission since, including
  the entire Operations module (`0099`–`0105`).

Neither branch is an ancestor of the other. `dev`'s `current-task.md` (the
sole canonical mission-state doc per `AGENTS.md`) had no awareness of `main`'s
history.

## 2. The historical `0069` collision + why no `migration repair`

- On **2026-08-16** the Founder ran `supabase link` + `supabase db push`
  (agent is permission-denied) and pushed `main`'s `0069`–`0073` to Supabase
  **Cloud dev**. The ledger then matched local through `0073`.
- On **2026-08-20** (PR #329, "Recipe photo upload WP-6", on `dev`) someone
  ran `supabase migration repair --status reverted 0060 0070 0071 0072 0073`
  against Cloud dev so a `dev`-branch migration could `db push` past the
  drift. **This edited only the ledger** (`supabase_migrations.schema_migrations`);
  **every Foundation schema object stayed physically present on Cloud dev.**
  Verified 2026-08-29 against a fresh logical dump — every object is
  byte-exact to `main`'s migrations.
- Crucially the repair list **excluded `0069`**. So Cloud dev's ledger still
  says `0069` is applied (content = `main`'s entitlements engine). `dev`'s
  own `0069` file — `0069_workforce_my_pending_invitations_fix.sql`, a
  DIFFERENT migration (an identity-leak security fix) — is therefore
  **skipped by every `db push` from `dev`** and never reached Cloud dev.

**Founder decision (2026-08-29):** Option A. `dev` is the authoritative
lineage. Re-express the retained Foundation as **new forward-only
migrations**. **No `migration repair`. No restoring old files under
historical numbers. No edits to applied historical migrations.** `main`
reconciliation / release governance is a separate future task. Cloud dev
read-only for this mission.

## 3. Cloud state right now (fact, unchanged by this PR)

- Cloud dev physically has all 5 Foundation subsystems (`core.entitlement_plans`,
  `plan_default_limits`, `tenant_plans`, `tenant_entitlement_limits`,
  `module_registry`, `module_dependencies`, `tenant_settings`, `notifications`,
  `events` + 4 enums + `can_enable_module` / `get_entitlement_limit` /
  `check_entitlement_limit` / `tenant_plans_default_on_tenant_insert` /
  `prevent_event_mutation` + `core.settings.manage` permission + seed rows).
- Cloud dev ledger: `0000`–`0098` (with `0060`/`0070`–`0073` marked reverted),
  **not** `0099`–`0105`, **not** `0106`–`0113`.
- Cloud dev `core.has_module_access` = the **simple** `0093` form (a later
  `dev` push overwrote `main`'s `0069` redefinition).
- Cloud dev has **no `operations` `module_registry` row** and **no
  `workforce.my_pending_employee_invitations` / `api.my_pending_employee_invitations`**.

Fresh pre-mission logical backup:
`D:\Dev\oruwa-backups\2026-08-29-pre-platform-reconciliation\` (`schema.sql`
309 KB, `data.sql` 404 KB — DB + auth + storage-metadata; **NOT** Storage
object bytes).

## 4. Eventual Cloud `db push` order (mission §2)

A future `db push` from `dev` applies pending migrations in numeric order:

```
0099 0100 0101 0102 0103 0104 0105   (Operations — already qualified, still pending)
0106 0107 0108 0109 0110 0111 0112 0113   (this PR)
```

The reconciliation is **designed for this order**: Operations (`0099`–`0105`)
touches no Foundation object, and `0111` (Operations registration) only needs
`core.module_registry` (from `0107`) and the `operations` enum value (from
`0099`) — both present by then. On a fresh local `db reset` the same numeric
order holds and is equally safe.

## 5. New migrations (exact list)

| # | File | What | Idempotency for Cloud (objects already present) |
|---|---|---|---|
| **0106** | `core_platform_foundation_entitlements.sql` | `tenant_plan_status` enum; `entitlement_plans` (+3 seed), `plan_default_limits`, `tenant_plans` (+ per-tenant backfill + `tenant_plans_default_on_tenant_insert` trigger), `tenant_entitlement_limits`; `get/check_entitlement_limit`; RLS (platform-staff writes); `api.my_tenant_plan` view. **`core.has_module_access` is NOT redefined** — see §6. | explicit `pg_type` guard for the enum; `create table if not exists`; `insert … on conflict do nothing` (never overwrites a tenant's plan/status); `create or replace function/view`; `drop policy if exists` + recreate |
| **0107** | `core_platform_foundation_module_registry.sql` | `module_lifecycle_status` enum; `module_registry` (**with** the nav columns folded in) + 7-row seed + workforce/inventory nav seed; `module_dependencies`; `can_enable_module` (enablement pre-check, **not** the runtime gate); RLS. | enum guard; `create table if not exists` + `alter … add column if not exists` (defensive); `on conflict do nothing` seed; nav via `update` (safe re-run); `create or replace`; `drop policy` + recreate |
| **0108** | `core_platform_foundation_navigation_settings.sql` | `core.tenant_settings` + `core.settings.manage` permission + owner/admin role grants. (Nav metadata lives in 0107.) | `create table if not exists`; `insert … on conflict do update` (permission) / `do nothing` (role grants); `drop policy` + recreate |
| **0109** | `core_platform_foundation_notifications.sql` | `notification_channel` / `notification_status` enums; `core.notifications` outbox (system-write-only) + indexes; RLS. | enum guards; `create table if not exists`; `create index if not exists`; `drop policy` + recreate |
| **0110** | `core_platform_foundation_event_bus.sql` | `core.events` append-only log + `prevent_event_mutation` trigger; RLS. | `create table if not exists`; `create or replace function`; `drop trigger if exists` + recreate; `drop policy` + recreate |
| **0111** | `operations_module_registration.sql` | one `core.module_registry` row: `operations`, lifecycle `beta`, no deps, `nav_route` NULL, no `min_plan_code`. | `insert … on conflict (module) do nothing` |
| **0112** | `workforce_my_pending_invitations_fix_rehome.sql` | re-issues the exact `0069` definitions of `workforce.my_pending_employee_invitations()` (SECURITY DEFINER) + `api.my_pending_employee_invitations()` (SECURITY INVOKER passthrough). | `create or replace function` — identical redefinition on `dev` local (0069 ran), creates the pair on Cloud |
| **0113** | `workforce_recipe_tenant_wide_update_fix.sql` | current `dev` (`0081`) body of `api.upsert_workforce_recipe` with the one-line tenant-wide fix in both UPDATE branches (`and (r.location_id = p_location_id or r.location_id is null)`). | `create or replace function` — converges on both targets |

**No `EXCEPTION WHEN others`.** No `DROP TABLE`/`TRUNCATE`. No historical
migration edited or renamed. No migration-number collision (`0106`–`0113`
are free on `dev`).

## 6. `core.has_module_access` — deliberately NOT changed

`main`'s historical `0069` also **redefined `core.has_module_access`** to
join `core.tenant_plans` (plan suspended/canceled → no access) and add an
`is_platform_staff()` bypass. **0106 omits that.** `dev`'s canonical
`core.has_module_access` is migration **`0093`** ("Module Access Security
Remediation"): a pure `tenant_modules.is_enabled` lookup, fail-closed, **no
platform-staff bypass** — and every RLS call site (`0094`–`0105`, all of
Operations) plus its pgTAP coverage is built against exactly that contract.
`0093`'s own header anticipates "a future Entitlement layer can be added
inside this function body without changing any RLS call site." **Wiring
plan-suspension into module access is that separate, later, explicit
decision — not this reconciliation.** 0052's pgTAP asserts
`has_module_access` still has no `tenant_plans` join and no staff bypass.

## 7. Operations registration (0111)

Founder-approved semantics: `module = operations`, `lifecycle_status = beta`
(backend complete + pgTAP-covered; no Manager/Staff Operations UI —
same as inventory/ai), **no dependencies** (Operations has no Workforce
dependency by design), `nav_route = NULL`, `min_plan_code = NULL`.

- **Does NOT enable Operations for any tenant** — no `core.tenant_modules`
  row is inserted.
- `core.has_module_access` remains the canonical runtime Module-OFF gate; a
  missing `core.tenant_modules` row stays fail-closed (0052 asserts).
- `core.can_enable_module('operations')` now returns `true` (beta, no deps,
  no min-plan) — an **enablement pre-check**, not the runtime gate.

## 8. Workforce `0069` finding / fix (mission §6)

**Reproduced on current `dev` (2026-08-29):** a Manager (`workforce.staff.manage`)
querying `api.workforce_employee_invitations WHERE status='pending'` sees a
pending invitation addressed to a **different** user — the OR'd
`wf_employee_invitations_manager_read` / `_self_read` policies (0064). The
fix RPC `api.my_pending_employee_invitations()` returns **only the caller's
own** pending invitations. `apps/web/src/lib/workforce/invitations.ts:120`
calls that RPC — which is **absent on Cloud dev**.

0069's exact solution is still correct against current `dev` (checked: no
later migration altered `workforce.employee_invitations`, its policies, or
the RPC). **0112 re-homes it verbatim.** Regression test:
`supabase/tests/0053_workforce_my_pending_invitations_rehome.sql` (leak
reproduced on the raw view path + RPC self-scoping proven for Manager /
target / bystander). The historical `dev` file
`0069_workforce_my_pending_invitations_fix.sql` is **not renamed or edited**.

## 9. Recipe tenant-wide finding / fix (mission §7)

**Reproduced on current `dev` (2026-08-29):** `api.upsert_workforce_recipe`
UPDATE branch matched `r.location_id = p_location_id` — `NULL = <uuid>` is
NULL (never true) for a tenant-wide recipe (`location_id IS NULL`), so a
Manager editing/publishing one always got `recipe_not_found`.
Location-scoped recipes were unaffected.

**NOT a restore of `main`'s `0060`** — that predates `dev`'s `0081` (which
added `p_status = 'archived'`); applying it verbatim would revert `0081`.
**0113 takes the current `dev` (`0081`) body and applies only the one-line
fix** (`and (r.location_id = p_location_id or r.location_id is null)`) in both
language branches. Widens no privilege — `wf_recipes_update` RLS
(`has_permission_in_tenant`) is the boundary and already permits it; a
cross-location edit stays rejected. Regression test:
`supabase/tests/0054_workforce_recipe_tenant_wide_update.sql` (control:
location-scoped still works; fix: tenant-wide edit+publish works;
location isolation: L1 Manager still can't touch an L2 recipe; tenant
isolation).

## 10. Security model

- **Tenant isolation** on every Foundation table: `_select` = `core.is_member_of(tenant_id)`
  (or `current_user_id() is not null` for the global catalogs
  `entitlement_plans` / `plan_default_limits` / `module_registry` /
  `module_dependencies`). 0052 asserts cross-tenant reads return 0 rows.
- **Writes**: `entitlement_plans`, `plan_default_limits`, `tenant_plans`,
  `tenant_entitlement_limits`, `module_registry`, `module_dependencies`,
  `notifications`, `events` — **platform-staff-only** RLS `_write` policy AND
  **no `INSERT`/`UPDATE`/`DELETE` grant to `authenticated`** (system /
  service_role / future admin-RPC path). `core.tenant_settings` is the one
  exception — `INSERT/UPDATE/DELETE` granted to `authenticated`, gated by
  `core.has_permission(tenant_id, 'core.settings.manage')` (tenant-admin
  self-serve, by design).
- **`core.events`** append-only: `prevent_event_mutation` trigger raises on
  any UPDATE/DELETE (0052 asserts).
- **ADR 0008** (no `SECURITY DEFINER` in `api`): the only new `SECURITY
  DEFINER` functions are in `core` (`get/check_entitlement_limit`,
  `can_enable_module`, `tenant_plans_default_on_tenant_insert`) and
  `workforce` (`my_pending_employee_invitations`). `api.my_tenant_plan` is a
  `security_invoker` view; `api.my_pending_employee_invitations` is a
  `security invoker` passthrough. `0005`/`0006`/`0009`/`0012` stay green.
- **No `service_role` frontend dependency** introduced.
- **No RLS weakening** anywhere — the reconciliation only re-creates the
  same policies `main` defined.

## 11. Deferred decisions (Founder, not this PR)

- **`core.tenant_settings` + module-OFF**: `tenant_settings_write` does NOT
  check `core.has_module_access` for the row's `module` value — a tenant
  admin can write a `module='workforce'` settings row while Workforce is OFF.
  This matches `main`'s `0071` and is retained as-is (`core.tenant_settings`
  is a core platform table, not a product-data schema; the Module Access
  Security Remediation scoped OFF-gating to the product schemas). **0052
  asserts the current behavior** so a future change is visible. If the
  Founder wants OFF-module settings writes blocked, that is an explicit
  follow-on.
- **Wiring plan lifecycle (`tenant_plans.status`) into `core.has_module_access`**
  — the `main` `0069` behavior that 0106 deliberately omits (§6). A separate
  decision once Billing / a Customer Portal exists.
- **`main` branch reconciliation / release governance** — out of scope by
  Founder direction.
- **Tenant read access to its own entitlement limits** (review P3-a):
  `core.plan_default_limits` / `core.tenant_entitlement_limits` `_select`
  policies are inert until a `grant select … to authenticated` is added —
  do that as part of whatever surface first needs a tenant to see its limits.
- **UI/worker adoption** of any Foundation contract (nav from
  `module_registry`, a `/dashboard/settings` route, a `core.notifications`
  dispatch worker, any `core.events` producer/consumer) — each its own
  bounded mission.
- **Cloud apply** of `0099`–`0105` + `0106`–`0113` — a subsequent
  Founder-approved mission with its own evidence package.

## 12. Local verification (VERIFIED, this session)

- `pnpm exec supabase db reset` — `0000`–`0113` apply clean.
- **Idempotency**: re-applied each of `0106`–`0113` against the populated DB
  (simulating Cloud "objects already exist") — **zero errors, zero data
  duplication** (`entitlement_plans` 3, `module_registry` 8, `tenant_plans`
  = tenant count, `core.settings.manage` 1 perm / 2 grants, `operations`
  registry 1).
- `pnpm exec supabase test db supabase/tests/` — `0052` (46), `0053`, `0054`
  new and green; Operations `0046`–`0051` (189) green; full suite = **exactly
  the 11 known pre-existing failures** (`0002`×3, `0006`×1, `0008`×1,
  `0012`×2, `0023`×4), **zero new**. 52 files, 1246 tests.
- `pnpm exec turbo run typecheck lint build test --force` — **30/30**.
- §6 + §7 bugs reproduced on pre-fix `dev`, both confirmed fixed after.

## 13. Independent review — DONE, **PASS**

A fresh-context reviewer ran its own SQL against a clean `db reset`, re-applied
all 8 migrations against the populated DB (idempotency), diffed `0112`/`0113`
against their historical sources, dumped `pg_policies` / `pg_get_functiondef`,
and ran the full `supabase test db` (52 files / 1246 tests — exactly the 11
known pre-existing failures, zero new). **Verdict: PASS. No P0/P1/P2.**

Cleared: idempotency (re-apply = zero errors, zero duplicate rows, no
`tenant_plans` overwrite; no `EXCEPTION WHEN others`); `core.has_module_access`
byte-identical to `0093`'s simple form (no `tenant_plans` join, no staff
bypass); every RLS policy matches `main` `0069`–`0073` with none weakened;
`can_enable_module` used in no RLS policy and fail-closed on an absent registry
row; `0111` inserts no `tenant_modules` row and `has_module_access(t,'operations')`
stays false; `0112` bodies byte-identical to `dev` `0069` with correct
DEFINER/INVOKER split; `0113` = `dev` `0081` body + only the two `WHERE`-clause
disjuncts, keeps `p_status … 'archived'` (not `main` `0060`'s stale set),
location + tenant isolation intact; `0106`–`0113` free numbers, forward-only,
no historical file modified/renamed/deleted; Cloud push order `0099…0105` then
`0106…0113` is safe.

**Three P3 notes — non-blocking, no fix required (all "faithful to `main`"):**
- **P3-a.** `core.plan_default_limits` and `core.tenant_entitlement_limits`
  have `_select` RLS policies but **no table-level `SELECT` grant to
  `authenticated`**, so those policies are currently inert for tenant users
  (reads fail-closed at the grant layer) — exactly as `main`'s `0069` left
  `tenant_plans`/`entitlement_plans` (which DID get the grant). A future
  "tenant can view its own effective limits" surface must add the grant; not
  doing it now keeps the reconciliation faithful and fail-closed.
- **P3-b.** `notifications_write` is `FOR ALL` not `FOR INSERT` — matches
  `main` `0072`; moot (no DML grant to `authenticated`).
- **P3-c.** `0108` upserts the `core.settings.manage` permission with
  `on conflict (key) do update` (to static literal values) rather than
  `do nothing` — identical effect, matches `main` `0071`.

## 14. Boundaries honoured

No `supabase db push` / `migration repair` / Cloud write of any kind. No
`main` change. No historical migration edited or renamed. No `DROP`/`TRUNCATE`.
No `core.tenant_modules` change / module enablement. No credential rotation.
No deploy. RED path — autonomous `dev` merge forbidden; PR left for Founder.
