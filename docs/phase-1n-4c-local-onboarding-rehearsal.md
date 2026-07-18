# Phase 1N-4C — Mame To Cha Local Onboarding Rehearsal (Slice C1)

- Status: Slice C1 tooling is **fully implemented**, including the real
  `apply`/`verify`/`cleanup`/`auth-provision` code paths (transactional
  writes/deletes against an injected `QueryRunner`, and a local Supabase
  Auth admin client). **None of it was executed against a real local
  database or a real Supabase Auth instance in this task** — every test
  uses a fake runner/client (dependency injection), and the only command
  actually run against this repository was the read-only `dry-run`. No
  Auth-user creation, no SQL mutation, no migration, no Cloud, no
  Vercel/DNS change, and no commit/push occurred while producing this
  document or its code.
- Builds on: Slice A ([phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md](phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md)),
  Slice B1 (read shell, merged), Slice B2a/B2b (preview manager/staff writes,
  merged — see [phase-1n-4c-b2-preview-writes-plan.md](phase-1n-4c-b2-preview-writes-plan.md)).
- Scope: **local-only rehearsal tooling** for onboarding the acceptance
  tenant `mame-to-cha`. This document originally covered C1's planning-only
  tooling; it has since been extended (same C1 slice) to implement the real
  transactional `apply`/`verify`/`cleanup` code and a local Auth-provisioning
  script, all gated by the same fail-closed local-environment guard. **C2**
  (a later, separately approved task) is the human-run execution of these
  now-complete code paths against a real local Supabase stack: starting the
  stack, running `auth-provision` for real, running `apply --confirm-apply`
  for real, running the authenticated manager/staff mutation smoke, and
  optionally `cleanup --confirm-cleanup`.

## 1. Two-phase workflow

| Slice | Does | Does NOT |
| --- | --- | --- |
| **C1 (this slice)** | Fixture manifest, local safety guard, plan builder, read-only schema-existence check, real transactional `apply`/`verify`/`cleanup`/`auth-provision` implementations (all unit-tested with fakes; a `dry-run` CLI subcommand actually executed against nothing but read-only schema checks) | Actually invoke `apply`, `cleanup --confirm-cleanup`, `auth-provision`, or `verify` against a real local database/Auth instance |
| **C2 (future, separately approved)** | Start/verify local Supabase, run `auth-provision` for real, run `apply --confirm-apply` for real, run `verify` for real, run the manager/staff mutation smoke (Section 11), run the RLS negative checks (Section 12), optionally `cleanup --confirm-cleanup` | — |

C1's job was to make C2 a matter of "start Supabase, export the right env
vars, run four already-implemented, already-tested commands" — not a new
implementation effort.

## 2. Repository conventions discovered

- `packages/db/scripts/onboard-tenant.ts` (+ `onboard-db.ts`, `onboard-write.ts`,
  `onboard-commit.ts`, `onboard-preflight.ts`, `onboard-backup-gate.ts`) is the
  existing, hardened, **local-only, generic tenant onboarding tool**
  (`pnpm db:onboard-tenant`). It already has:
  - `assertLocalDatabaseUrl` — rejects any `*.supabase.co`/`*.pooler.supabase.com`
    host, requires `127.0.0.1`/`localhost`/`::1` + port `54322`.
  - `RESERVED_TENANT_SLUGS` — already includes `mame-to-cha-tokyo` (the
    seeded sales-demo tenant) and does **not** include `mame-to-cha`.
  - A commit path gated on `--commit --yes --i-understand-this-writes-local-db
    --target local --backup-artifact <path>`, a fresh-backup check, and a
    dry-run transaction that always rolls back.
- This tool onboards a **generic** tenant/location/owner/module — it has no
  concept of a manager+staff pair, an employee binding, shift types, recipes,
  or schedule/attendance/request data. The Workforce-specific fixture in this
  slice is new, additive tooling that sits alongside it, following the same
  file-per-concern layout and `node:test` conventions.
- `docs/operations/client-onboarding-runbook.md` documents the existing
  generic tool's procedure, safety rules, and idempotency rules in full; this
  document does not repeat them, only the Workforce-fixture-specific
  additions.
- No YAML-parsing dependency exists anywhere in the repository. The Slice A
  architecture plan sketched a YAML manifest under `docs/onboarding/`, but
  that section explicitly deferred the concrete choice to this slice ("Slice
  C, not by this Slice A document"), and the C1 task brief allows either "a
  tracked manifest **or** typed fixture definition." Adding a new parser
  dependency for one non-secret fixture is unwarranted, so this slice uses a
  **typed TypeScript fixture module** instead —
  [`packages/db/scripts/mame-to-cha-fixture.ts`](../packages/db/scripts/mame-to-cha-fixture.ts) —
  which is exactly as reviewable/tracked as a YAML file (plain committed
  source) without adding a dependency.

## 3. Files added in this slice

All under `packages/db/scripts/` (existing onboarding-tool location), plus
this document.

| File | Purpose |
| --- | --- |
| `mame-to-cha-fixture.ts` (+ `.test.ts`) | The tracked, non-secret fixture manifest (tenant slug/location/modules/roles/shift types/recipes/acceptance-data markers) + its own internal-consistency validator. |
| `mame-to-cha-env-guard.ts` (+ `.test.ts`) | The fail-closed local-environment guard (Section 4). Reuses `assertLocalDatabaseUrl` from `onboard-tenant.ts` rather than re-implementing it. |
| `mame-to-cha-dates.ts` (+ `.test.ts`) | Pure date/timezone helpers: relative day-offset → ISO date, and local wall-clock → UTC instant (same technique `apps/web/src/lib/workforce/timezone.ts` uses, independently implemented since this package cannot import from `apps/web`). |
| `mame-to-cha-plan.ts` (+ `.test.ts`) | Pure idempotent plan builder (create vs. reuse vs. conflict per fixture entity) + a redacted, log-safe summary. |
| `mame-to-cha-state.ts` (+ `.test.ts`) | Read-only state loader (SELECT-only, mirrors `onboard-db.ts`): resolves the fixture's current DB state and ids from an injected `QueryRunner`. |
| `mame-to-cha-write.ts` (+ `.test.ts`) | **The real `apply` write path.** Parameterized INSERT/UPSERT SQL + executor, reusing the already-hardened `withLocalDryRunTransaction`/`withLocalCommitTransaction` wrappers from `onboard-write.ts`/`onboard-commit.ts` for transaction control. |
| `mame-to-cha-verify.ts` (+ `.test.ts`) | **The real `verify` read-only checklist** (tenant/location/module/membership/permission/employee-binding/shift-type/recipe/acceptance-data checks, duplicate detection). |
| `mame-to-cha-cleanup.ts` (+ `.test.ts`) | **The real `cleanup` delete path.** Parameterized, tenant-and-natural-key-scoped DELETE SQL + executor, reusing the same transaction wrappers. |
| `mame-to-cha-auth.ts` (+ `.test.ts`) | **The real local Auth-provisioning script.** Local-only Supabase Auth Admin API client (outside `apps/web`), idempotent find-or-create for the manager/staff users. |
| `mame-to-cha-schema-check.ts` (+ `.test.ts`) | Read-only local connection (the only other file that imports `pg`, alongside `mame-to-cha-write.ts`/`mame-to-cha-cleanup.ts` which reach it only via the reused wrappers), pinned `default_transaction_read_only = on` for schema checks; checks `information_schema` for the tables/views/functions this fixture depends on. |
| `mame-to-cha-rehearsal.ts` (+ `.test.ts`) | The CLI: `dry-run` / `apply [--confirm-apply]` / `verify` / `cleanup [--dry-run\|--confirm-cleanup]` / `auth-provision` subcommand routing. |

`packages/db/package.json` gained a `mame-to-cha-rehearsal` script and the
four new test files were added to its `test` script's file list. Root
`package.json` gained `db:mame-to-cha-rehearsal` (mirrors
`db:onboard-tenant`'s existing alias pattern).

## 4. Fixture manifest design

Fixture identity (exact, deterministic, never a variant):

- Tenant slug: **`mame-to-cha`** (`FIXTURE_TENANT_SLUG`).
- Protected slugs this tool must never match/update/delete:
  `PROTECTED_TENANT_SLUGS`, re-exported directly from `onboard-tenant.ts`'s
  existing `RESERVED_TENANT_SLUGS` (already includes `mame-to-cha-tokyo`) —
  one shared list, so the two tools can never silently diverge.

Fixture contents (all non-secret; every field is a slug, label, code, env-var
**name**, or relative day offset — never an email, password, token, or UUID):

- One tenant (`kind: client`), one active location (`main-cafe`, `Asia/Tokyo`).
- Modules: `core` (force-included, matching `db:onboard-tenant`'s existing
  convention) + `workforce`.
- Two role identities:
  - `manager-1` → `core.roles.key = 'manager'` (seeded by
    `0008_rbac_seed.sql`), no employee binding.
  - `staff-1` → `core.roles.key = 'employee'`, **requires** an employee
    binding (`workforce.employees.user_id`).
  - Each role references its email/password by **environment-variable name
    only**: `MAME_TO_CHA_LOCAL_MANAGER_EMAIL` / `_PASSWORD`,
    `MAME_TO_CHA_LOCAL_STAFF_EMAIL` / `_PASSWORD`.
- Two active shift types (`AM` 09:00–13:00, `PM` 13:00–18:00), matching
  `workforce.shift_types`' schema (0025) and the product's AM/PM contract.
- One minimal recipe (category `ドリンク`, recipe `ハンドドリップ手順`), matching
  `workforce.recipe_categories`/`workforce.recipes` (0021).
- Minimal acceptance data, as relative day offsets (no absolute dates, no
  UUIDs): one future shift assignment, one shift-preference request, one
  past work-report/attendance row, one correction request referencing it —
  covering the B2a/B2b smoke matrix's read prerequisites (Section 5).

Every field was derived directly from the current migrations/services cited
in Section 2 and in
[phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md](phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md)
Sections B7–B10/L/W1 and
[phase-1n-4c-b2-preview-writes-plan.md](phase-1n-4c-b2-preview-writes-plan.md)
Sections 1/3.1a — nothing here is invented.

## 5. Local-only safety guard

`checkMameToChaLocalEnvironment` (pure, no I/O) is the fail-closed gate every
future `apply`/`cleanup` must pass before any network or database mutation.
It blocks (severity `error`) when:

- `DATABASE_URL` is absent, malformed, or not local (delegates to the
  existing `assertLocalDatabaseUrl` — same Cloud-host/port rejection as
  `db:onboard-tenant`).
- Any of the four required credential env vars
  (`MAME_TO_CHA_LOCAL_MANAGER_EMAIL/PASSWORD`,
  `MAME_TO_CHA_LOCAL_STAFF_EMAIL/PASSWORD`) is missing (presence only is
  checked — **values are never read into a log line**).
- The fixture's tenant slug is not exactly `mame-to-cha`, or collides with a
  protected slug (defense-in-depth: the tracked fixture always passes this,
  but the check exists so a future fixture edit cannot silently drift).
- A configured manager/staff email doesn't look like an obviously local/test
  address (`.test`/`.local`/`example.com`/`example.jp` — see
  `looksLikeLocalTestEmail`). **This blocks** (`severity: error`), it does
  not merely warn — aligned with `mame-to-cha-auth.ts`'s
  `provisionMameToChaLocalAuthUsers`, which hard-rejects the identical
  condition before any Auth admin call. An earlier revision of this guard
  only warned here while `auth-provision` hard-rejected the same condition;
  that inconsistency is fixed so both surfaces agree on one fail-closed
  policy for the exact same input. The failure message never echoes the
  configured email value — only the env var name and the accepted domain
  convention.

## 6. Credential handling

- No password, token, or service-role value is ever committed, logged, or
  included in a CLI output line — every guard/plan/verify/cleanup/auth
  message is statically worded or reports presence/absence/ids only
  (verified by dedicated tests across every new file).
- Local-only env vars (documented placeholders, never real values):
  `MAME_TO_CHA_LOCAL_MANAGER_EMAIL`, `MAME_TO_CHA_LOCAL_MANAGER_PASSWORD`,
  `MAME_TO_CHA_LOCAL_STAFF_EMAIL`, `MAME_TO_CHA_LOCAL_STAFF_PASSWORD`. Set
  these in a local, gitignored `.env.local`-style file or your shell only.
- `DATABASE_URL` must be the **local** Postgres connection string, e.g.
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres` — never a Cloud
  URL; the guard rejects Cloud-like hosts before anything else runs.
- **`auth-provision`** (`mame-to-cha-auth.ts`) additionally reads
  `MAME_TO_CHA_LOCAL_SUPABASE_URL` and
  `MAME_TO_CHA_LOCAL_SUPABASE_SERVICE_ROLE_KEY` — the local Supabase Auth
  Admin API endpoint and its local service-role key. `assertLocalSupabaseUrl`
  rejects any non-loopback host and any `*.supabase.co`/
  `*.pooler.supabase.com` host **before constructing any admin client or
  making any network call**. This script lives only in
  `packages/db/scripts/`, is never imported by `apps/web` (enforced by a
  dedicated test), reads no `NEXT_PUBLIC_*` variable, and never returns or
  logs a password or the full email — only the resulting Auth user id and a
  `created` boolean.

## 7. Dry-run (executable in C1)

```bash
pnpm db:mame-to-cha-rehearsal -- dry-run
```

(Or, from `packages/db`: `pnpm mame-to-cha-rehearsal dry-run`.)

What it does, in order:

1. Self-checks the tracked fixture manifest (`validateMameToChaFixtureManifest`)
   — a failure here is a tooling bug, not an operator error, and throws loudly.
2. Runs the local environment guard (Section 5). A failure here **blocks
   before any DB connection is attempted** (`connectionAttempted: false`).
3. If the guard passes (local `DATABASE_URL` confirmed), opens **one**
   read-only local `pg.Client` (`mame-to-cha-schema-check.ts`) and confirms
   every required `core.*`/`workforce.*` table, `api.*` view, and
   `core.has_permission`/`api.has_permission` function exists via
   `information_schema` — **no business-table row is read or written**. A
   missing relation/function is reported as a **no-go** (a migration may be
   needed) rather than silently proceeding.
4. Builds the idempotent fixture plan (`buildMameToChaFixturePlan`) against
   an **empty** existing-state assumption (C1 never reads fixture-owned
   business rows) and prints a redacted plan: entity, fixture-owned key
   (role logical id / shift-type code / recipe title — never a UUID),
   create/reuse intention, and per-entity/action counts. No password, token,
   service-role value, or raw UUID ever appears.
5. Prints the fixed "never executed" footer: Cloud not touched, no Auth user
   created, no SQL mutation executed, no migration run, no local database
   write.

## 8. `apply` — real implementation (never executed in this task)

```bash
pnpm db:mame-to-cha-rehearsal -- apply --manager-user-id <UUID> --staff-user-id <UUID>            # dry-run (always rolls back)
pnpm db:mame-to-cha-rehearsal -- apply --manager-user-id <UUID> --staff-user-id <UUID> --confirm-apply  # real commit
```

Implementation (`mame-to-cha-write.ts`):

- Identity is **explicit only** — `--manager-user-id`/`--staff-user-id` — the
  same MVP Option A discipline as `onboard-tenant.ts`'s owner: never
  resolved from an email lookup. `validateMameToChaIdentityOrThrow`
  (`mame-to-cha-state.ts`) rejects an identical manager/staff id **before any
  query** — the fixture requires two distinct identities, and a shared id
  would conflate the manager and staff logical roles onto one underlying row.
- `loadExistingMameToChaFixtureState` (`mame-to-cha-state.ts`, SELECT-only)
  loads current state fresh inside the transaction; `buildMameToChaFixturePlan`
  decides create/reuse/conflict per entity; `validateMameToChaWritePlanOrThrow`
  fails **before any write** on an empty/wrong/protected tenant slug or an
  unresolved plan conflict (e.g. a suspended membership).
- **`core.users` mirror rows are an explicit, modeled plan entity
  (`user_mirror`), not an incidental query.** `core.tenant_memberships.user_id`
  and `workforce.employees.user_id` both FK to `core.users(id)`, and there is
  no auto-mirror trigger from `auth.users` — the exact fact
  `docs/operations/client-onboarding-runbook.md` documents for the generic
  onboarding tool's owner identity. `executeMameToChaFixtureWritePlan`
  therefore inserts the manager's and staff's `core.users` mirror rows
  (reusing `onboard-write.ts`'s exact `ONBOARD_WRITE_SQL.insertUser` — `insert
  into core.users (id) values ($1) on conflict (id) do nothing`, no invented
  email/name, no password ever stored) **immediately after the tenant is
  resolved and before any membership/employee-binding write** — see Section
  "Write order" below.
- `executeMameToChaFixtureWritePlan` issues fully parameterized SQL for:
  tenant, manager/staff `core.users` mirrors, location, `core`+`workforce`
  tenant modules, manager/staff memberships, role assignments
  (`manager`/`employee` role keys, tenant-wide `location_id is null`,
  matching `core.has_permission`'s own
  `location_id is null OR location_id = p_location_id` semantics), the staff
  employee binding (name written via `protectSearchablePII`, never
  plaintext), AM/PM shift types, one recipe category + recipe, and the four
  acceptance-data rows (shift assignment, shift preference, work report,
  correction request) — every insert is idempotent (`on conflict do
  nothing`/`where not exists`/plan-gated), so a re-run never duplicates a row.
- **Transaction control is reused, not reimplemented**: without
  `--confirm-apply`, the CLI calls `runMameToChaApplyDryRunTransactionFromEnv`,
  which wraps the whole write path in `onboard-write.ts`'s
  `withLocalDryRunTransaction` (always `ROLLBACK`s — proven by
  `mame-to-cha-write.test.ts`'s fake-client transaction test, which asserts
  `begin`/`rollback` ran and `commit` never did). With `--confirm-apply`,
  `runMameToChaApplyCommitTransactionFromEnv` wraps it in
  `onboard-commit.ts`'s `withLocalCommitTransaction`, which commits **only**
  when `changedOperationCount > 0` (an all-reuse re-run is rolled back as a
  no-op — proven by a dedicated test).
- Every write is scoped to the tenant id resolved from the exact
  `mame-to-cha` slug; `mame-to-cha-write.test.ts` asserts every parameterized
  call's first bound value equals that resolved id (never a different
  tenant, never `mame-to-cha-tokyo`).
- Audit rows (`audit.audit_logs`, `module: 'workforce'`) carry only the
  tenant slug, operation label, and fixture-owned key — never a UUID, email,
  or secret (asserted by a dedicated leak test).

**Write order (FK-driven):** tenant → manager/staff `core.users` mirrors →
location → tenant modules → per role: membership → role assignment →
(staff only) employee binding → shift types → recipes → acceptance data.
The `core.users` mirror step is mandatory and must run before any
membership/employee-binding write, because both of those tables FK to
`core.users(id)`. This was a **critical gap in an earlier revision of this
slice** — apply would fail with a Postgres `23503` foreign-key violation on
its very first membership insert against a freshly `auth-provision`-ed user,
because no `core.users` mirror existed yet. It is fixed as described above;
`mame-to-cha-write.test.ts` and `mame-to-cha-plan.test.ts` both assert the
`user_mirror` step is planned/executed strictly before `membership` and
`employee_binding`.

**Concurrency note:** this is a local, single-operator rehearsal tool.
`workforce.employees` (and `workforce.recipe_categories`/`workforce.recipes`)
have no DB-level unique constraint on their fixture-matching natural key, so
idempotency there relies on this module's own state-then-write sequencing,
not a database guarantee. **Do not run two `apply --confirm-apply` processes
concurrently** against the same fixture — no migration or locking framework
is introduced to enforce this; it is a documented operational constraint,
not a database-enforced one. `core.users`/`core.tenant_memberships` writes
remain safe under this constraint regardless (both have real unique/FK
constraints), so a concurrency violation can duplicate at most an employee
binding or a recipe/category row, never a tenant, membership, or user
mirror — and `verify` (Section 9) detects any such duplicate.

**Not executed in this task.** Every test above uses a fake `QueryRunner`/
`pg.Client`; `pnpm db:mame-to-cha-rehearsal -- apply ...` was never run.

## 9. `verify` — real implementation (never executed in this task)

```bash
pnpm db:mame-to-cha-rehearsal -- verify [--manager-user-id <UUID>] [--staff-user-id <UUID>]
```

Implementation (`mame-to-cha-verify.ts`, SELECT-only):

- Refuses to run at all (before any query) unless the fixture's own tenant
  slug is exactly `mame-to-cha` and not in `PROTECTED_TENANT_SLUGS` — a
  structural, test-verified guarantee that this file's SQL catalog never
  references `mame-to-cha-tokyo` literally.
- Checks: tenant exists **exactly once** (and reports a duplicate, not just
  "missing"); tenant `kind`; **exactly one** active location (0 or 2+ both
  fail); `workforce` module enabled; **for each identity supplied, a
  `core.users` mirror row exists exactly once** (checked explicitly, by
  name, before the membership check that depends on it); manager/staff
  membership `status = 'active'`; manager's role assignment holds all three
  permission keys every B2a wrapper needs (`workforce.staff.manage`,
  `workforce.shift.write`, `workforce.request.manage` — Section 3.1a of the
  B2 writes plan); the staff employee binding exists **exactly once**
  (duplicate detection), is active, and has a location; each shift type
  exists, is active, and is scoped to the resolved location; each recipe
  exists exactly once; the four acceptance-data rows exist, matched by the
  exact deterministic key the write path used (same `mame-to-cha-dates.ts`
  helpers, so verify and apply can never silently disagree about "today").
- **Identical manager/staff ids are rejected as a failure** (not silently
  accepted) before any query, for the same reason `apply` rejects them.
- **Identity is optional.** When `--manager-user-id`/`--staff-user-id` is
  omitted, the identity-scoped checks (including the new `user_mirror.*`
  checks) report `not_checked` (not a failure) so a structural check can
  still run without both Auth users yet existing. `not_checked` is a
  distinct status from `pass`/`fail` and never contributes to `ok`/
  `failures` — omitting identity can never turn a real failure into a pass.
- Returns a deterministic `{ ok, checks[], failures[] }` report; no check
  message ever contains a UUID or an email-shaped string (asserted by a
  dedicated leak test).

**Not executed in this task.** `mame-to-cha-verify.test.ts` exercises every
branch (missing tenant, duplicate tenant, 0/2+ locations, module disabled,
missing/duplicate `core.users` mirror, missing permission, duplicate
employee binding, identical manager/staff ids, missing identity) against a
fake runner; `runLocalMameToChaVerify` (the real, `pg`-connecting entry
point) was never invoked.

## 10. `cleanup` — real implementation (never executed in this task)

```bash
pnpm db:mame-to-cha-rehearsal -- cleanup --manager-user-id <UUID> --staff-user-id <UUID> --dry-run          # preview only
pnpm db:mame-to-cha-rehearsal -- cleanup --manager-user-id <UUID> --staff-user-id <UUID> --confirm-cleanup  # real delete
```

Implementation (`mame-to-cha-cleanup.ts`):

- `validateMameToChaCleanupOrThrow` refuses an empty (wildcard-shaped),
  wrong, or protected tenant slug **before building any plan**.
- `buildMameToChaCleanupPlan` lists removal targets in safe dependency
  order: correction request → shift preference request → work report →
  shift assignment → employee binding → role assignments → memberships →
  shift types → recipes → recipe categories. **It never includes the
  tenant, the location, or `core.tenant_modules`** — by design (matching
  `docs/operations/client-onboarding-runbook.md` §12.K's existing "leave the
  tenant in place as a reusable local fixture" convention), tearing down the
  tenant itself is out of scope for automatic cleanup.
- Every DELETE statement is scoped to **both** the resolved tenant id and a
  fixture-owned natural key (employee id + work date, shift-type code,
  recipe title, user id) — never a bare `tenant_id`-only wildcard delete
  (asserted by a dedicated test that every cleanup SQL statement binds ≥2
  parameters and includes `tenant_id = $1`). No statement ever references
  `mame-to-cha-tokyo`, and no `TRUNCATE`/`DROP` appears anywhere.
- A row not present is skipped (no DELETE issued for it) — a second cleanup
  run over already-cleaned rows is a safe no-op.
- Reuses the same transaction wrappers as `apply`: `cleanup --dry-run` uses
  `withLocalDryRunTransaction` (always rolls back, even when rows are
  present — proven by a dedicated test); `cleanup --confirm-cleanup` uses
  `withLocalCommitTransaction` (commits only when `removedCount > 0`; a
  cleanup against a tenant that doesn't exist is a rolled-back no-op).
- Never deletes shared/global reference data (`core.roles`,
  `core.permissions`, `core.role_permissions`) — no cleanup SQL statement
  touches any of those tables.
- **`core.users` mirror rows and the underlying Supabase `auth.users`
  identities are never deleted, in any cleanup mode.** There is no
  `deleteUserMirror`/`deleteAuthUser` statement in `MAME_TO_CHA_CLEANUP_SQL`.
  Cleanup removes the membership and employee binding first (safe
  dependency order), which is sufficient to detach the identity from the
  `mame-to-cha` fixture; there is no safe, fixture-owned way to tell whether
  a `core.users`/`auth.users` row is used by anything else (another tenant,
  another local fixture), so both are left intact by design. Removing an
  Auth user, if ever needed, remains a separate, explicit, manual step —
  this cleanup command is deliberately never broadened to include it.

**Not executed in this task.** `mame-to-cha-cleanup.test.ts` exercises the
full plan/execute/transaction pipeline against a fake runner/client;
`runMameToChaCleanupCommitFromEnv` (the real, mutating entry point) was
never invoked.

## 10a. `auth-provision` — real implementation (never executed in this task)

```bash
pnpm db:mame-to-cha-rehearsal -- auth-provision
```

Implementation (`mame-to-cha-auth.ts`, outside `apps/web`):

- `assertLocalSupabaseUrl` rejects any non-loopback host and any
  `*.supabase.co`/`*.pooler.supabase.com` host **before** constructing any
  admin client or making any network call.
- Reads `MAME_TO_CHA_LOCAL_SUPABASE_URL`,
  `MAME_TO_CHA_LOCAL_SUPABASE_SERVICE_ROLE_KEY`, and the same
  `MAME_TO_CHA_LOCAL_{MANAGER,STAFF}_{EMAIL,PASSWORD}` vars the env guard
  already validates the presence of — never a hardcoded value.
- Every email is checked with `looksLikeLocalTestEmail` (Section 5) before
  any admin call; a real-looking client email is refused.
- `findOrCreateLocalAuthUser` is idempotent: it attempts `createUser` first,
  and on an "already registered" response paginates `listUsers` to find the
  existing user by case-insensitive email match — a second run against an
  already-provisioned email finds the same user id instead of creating a
  duplicate (proven by a dedicated test).
- Returns **only** `{ managerUserId, staffUserId, managerCreated,
  staffCreated }` — never an email or password, in any log line, return
  value, or thrown error (proven by a dedicated leak test using a
  synthetic, unmistakable secret value).
- Structurally verified to never be imported by `apps/web` and to never
  read a `NEXT_PUBLIC_*` variable.

**Not executed in this task.** `mame-to-cha-auth.test.ts` exercises
find/create/idempotency/error-mapping against a fake Admin API client; no
`@supabase/supabase-js` client was ever constructed and no network call was
ever made.

## 11. Manager/staff acceptance mutation smoke matrix (C2 — documented, not executed)

All identities/routes below already exist and are merged
(`apps/web/src/lib/preview/actions/*`, `/mame-to-cha/manager`,
`/mame-to-cha/staff`). This slice adds no new route or action — it only
prepares the fixture data these flows need.

### Manager (`manager-1`, `/mame-to-cha/manager`)

| # | Operation | Route/action | Prerequisite fixture | Expected UI result | Expected DB/read result | Isolation assertion | Cleanup/rollback |
| - | --- | --- | --- | --- | --- | --- | --- |
| 1 | Create employee | `previewUpsertEmployee` | Manager membership + role assignment, active location | New row appears in staff table | New `workforce.employees` row, tenant/location = fixture's | Row's `tenant_id`/`location_id` match the resolved `mame-to-cha` tenant/location only | Deactivate or leave as fixture-owned (matched by employee code) |
| 2 | Edit employee | `previewUpsertEmployee` (with `id`) | Employee row from #1 or the `staff-1` fixture employee | Updated fields render | Row updated, `tenant_id` unchanged | Edit rejected if `id` belongs to another tenant/location (`not_found`) | No rollback needed (idempotent edit) |
| 3 | Deactivate/reactivate employee | `previewSetEmployeeActive` | Employee row exists | `is_active` toggles in UI | `workforce.employees.is_active` toggles | Same tenant/location scoping as #2 | Restore fixture's intended `is_active` state |
| 4 | Create shift assignment | `previewCreateShiftAssignment` | Active shift type (`AM`/`PM`), active employee | New cell appears in weekly grid | New `workforce.shifts` row, `shift_type_id`/`employee_id` verified against tenant+location | `employeeId`/`shiftTypeId` from another tenant/location → `not_found` | Delete/unassign the created row |
| 5 | Update/unassign shift assignment | `previewUpdateShiftAssignment` | Assignment from #4 | Cell updates/clears | Row updated; `assignmentId` from a different tenant/location → `not_found` | Same as #4 | N/A (idempotent update) |
| 6 | Auto-distribution (≥1 positive staffing requirement) | `previewRunAutoDistribution` | ≥1 active employee, ≥1 active shift type, ≥1 staffing requirement > 0 | Draft shifts appear across the period | Bulk `workforce.shifts` insert, all rows scoped to resolved tenant/location | Bulk insert never targets another tenant's location (server-resolved location only) | Delete the draft rows created by this run |
| 7 | Publish schedule | `previewPublishSchedule` | Draft shifts from #6 | Shifts become visible to staff | `workforce.shifts.published` → `true` for the period | Publish scoped to resolved tenant/location only | Revert to draft if needed (unpublish not implemented; document as a known gap) |
| 8 | Approve/reject correction request | `previewDecideCorrectionRequest` | Correction request from the staff fixture (#11) | Request moves to "decided" | `workforce.shift_requests.status`/`decided_by` updated | `correctionRequestId` from another tenant/location → `not_found` | N/A (terminal state) |

### Staff (`staff-1`, `/mame-to-cha/staff`)

| # | Operation | Route/action | Prerequisite fixture | Expected UI result | Expected DB/read result | Isolation assertion | Cleanup/rollback |
| - | --- | --- | --- | --- | --- | --- | --- |
| 9 | Submit shift preference | `previewSubmitShiftPreference` | Employee binding (`staff-1`), active location | Preference appears in own row | New `workforce.shift_requests` row, `kind='preference'`, `employee_id` = caller's own binding only | `employeeId` is never client-suppliable; only the caller's own binding is ever used | Fixture-owned row; safe to leave |
| 10 | Submit work report | `previewSubmitWorkReport` | Employee binding, `workforce.attendance` row for the day | Report appears in own history | `workforce.attendance` row created/updated for caller's own `employee_id` only | Same as #9 | Fixture-owned row; safe to leave |
| 11 | Submit correction request | `previewSubmitCorrectionRequest` | Work report from #10 | Request appears as pending | New `workforce.shift_requests` row, `kind='correction'`, `attendance_id` set | Same as #9; a correction cannot reference another employee's attendance row | Consumed by manager smoke #8 |

## 12. RLS and isolation negative-test plan (C2 — documented, not executed)

Every check below must use **only local fixture data** (`mame-to-cha`'s own
manager/staff Auth users and rows) — no production/Cloud data, ever.

| # | Negative case | Expected result |
| - | --- | --- |
| 1 | Manager acts on a foreign tenant's `employeeId`/`assignmentId`/`correctionRequestId` | `not_found` (Section 3.0/8.1 of the B2 writes plan) |
| 2 | Manager acts on another/inactive location's target row | `not_found` (location re-verified independently of the tenant filter) |
| 3 | Staff submits another employee's id | Impossible by construction — no B2b form field accepts an `employeeId`; the caller's own binding is always looked up |
| 4 | Staff attempts to override location via `FormData` | Ignored — no B2 wrapper reads a client-supplied `locationId` (Section 8.1) |
| 5 | Staff references another employee's attendance row | `getMyWorkforceStaffProfile` + `wf_employees_self_read`'s `user_id = core.current_user_id()` predicate make this structurally impossible |
| 6 | Active-tenant cookie (`lbo_active_tenant_id`) set to a different (valid, own) tenant, then a preview write submitted | Still pins to `mame-to-cha` via `resolvePreviewTenantContext` — cookie ignored (Section G/H of the architecture plan) |
| 7 | A membership for `mame-to-cha-tokyo` is used to try to satisfy `mame-to-cha` | Fails — `selectPreviewMembership` filters on `tenant_slug === 'mame-to-cha'` exactly; a `mame-to-cha-tokyo` membership never matches |
| 8 | Unauthenticated request to any preview route | Redirects to `/sign-in` (`requireUser()`) |
| 9 | Root (`/mame-to-cha`) / recipes (`/mame-to-cha/recipes[/…]`) routes | Continue to register **zero** Server Actions (confirmed: root registers 0, recipes register 0, manager registers exactly 7, staff registers exactly 3 — unchanged by this slice, which adds no route code) |

## 13. Tests added

All under `packages/db/scripts/`, using the existing `node --import tsx
--test` convention (no new test framework). Every test that would otherwise
need a real database or network call uses an injected fake `QueryRunner`/
`pg.Client`/Supabase Admin client instead.

- `mame-to-cha-fixture.test.ts` — exact tenant slug, protected-slug exclusion,
  manifest self-validation (version, role shape, shift-type shape, timezone).
- `mame-to-cha-env-guard.test.ts` — local URL acceptance, Cloud URL rejection,
  malformed/missing DATABASE_URL rejection, missing-credential rejection,
  secret-value non-echo (parameterized over all four required env vars),
  protected-tenant-slug rejection, local-test-email heuristic.
- `mame-to-cha-dates.test.ts` — day-offset arithmetic (incl. month rollover),
  local→UTC conversion for a fixed-offset zone (Asia/Tokyo) and a
  DST-observing zone (summer/winter).
- `mame-to-cha-plan.test.ts` — from-scratch plan (all create), fully-existing
  plan (all reuse, idempotent — no dependent writes), suspended-membership
  conflict (no silent reactivation), invited-membership activation, redacted
  summary never leaks a UUID/email.
- `mame-to-cha-state.test.ts` — tenant-absent short-circuits every dependent
  read, full-state resolution, an inactive location is never resolved as
  active, every statement is a `SELECT`.
- `mame-to-cha-write.test.ts` — **idempotent apply plan** (from-scratch
  create vs. fully-existing reuse), **exact tenant scope** (every write's
  first bound parameter equals the resolved tenant id), a suspended
  membership blocks the entire write **before any query runs**, employee
  name is written only as encrypted PII, missing PII env fails safely,
  **transaction rollback behavior** (dry-run always rolls back and never
  issues `commit`), commit-only-when-changed / no-op-when-nothing-changed,
  audit metadata never leaks a UUID/email, no bare DELETE/DROP/TRUNCATE/ALTER
  appears in the write SQL catalog.
- `mame-to-cha-verify.test.ts` — a fully-correct fixture passes; **detects
  missing and duplicate resources** (tenant, employee binding); detects
  0/2+ active locations; detects the Workforce module disabled; **checks
  manager permissions** (all three B2a keys, and a missing one is reported
  by name) **and staff binding**; missing identity produces `not_checked`,
  not a failure; every statement is read-only; the file never queries
  `mame-to-cha-tokyo` literally.
- `mame-to-cha-cleanup.test.ts` — safe dependency order; the plan never
  touches tenant/location/tenant_module; **cleanup requires confirmation**
  (`--confirm-cleanup`) at the CLI layer (below); **refuses wildcard/empty/
  foreign/protected slug**; idempotent no-op when nothing is present; every
  delete statement is tenant **and** natural-key scoped (never a bare
  `tenant_id`-only wildcard); dry-run always rolls back even with rows
  present; commit is a no-op when the tenant doesn't exist.
- `mame-to-cha-auth.test.ts` — **local Auth URL acceptance**, **Cloud Auth
  URL rejection**, malformed-URL rejection; **create/find behavior is
  idempotent** (second call finds the existing user, matched
  case-insensitively); a non-"already registered" failure surfaces a safe
  error; **credentials never appear in logs/results** (a synthetic,
  unmistakable secret value is asserted absent from every thrown message);
  a real-looking (non-local-test) email is refused before any client is
  built; never imported by `apps/web`; no `NEXT_PUBLIC_*` read.
- `mame-to-cha-schema-check.test.ts` — all-relations-exist pass, a missing
  relation is reported by name, every query is a read against
  `information_schema` only.
- `mame-to-cha-rehearsal.test.ts` — CLI arg parsing (incl. the new
  `--manager-user-id`/`--staff-user-id`/`--confirm-apply`/`--dry-run` flags);
  unknown/missing subcommand rejection; dry-run blocked before connecting on
  a missing/Cloud DATABASE_URL or a missing credential; dry-run end-to-end
  pass with a fake all-exists schema check; dry-run no-go on a missing
  relation; no secret leakage in dry-run output; `apply` requires both
  identity flags and routes to the dry-run-vs-commit path correctly (via
  injected fakes); `verify` reports pass/fail via exit code; `cleanup`
  requires identity and one of `--dry-run`/`--confirm-cleanup`; every
  apply/cleanup/auth-provision test supplies an explicit fake dependency —
  **none exercises the default lazy import that would touch a real `pg`
  connection or Supabase Admin API**.

**Result: all new tests pass** (see Section 14).

## 14. Verification results

```
pnpm --filter @line-os/db test        → 410 passed, 0 failed (includes all new suites above)
pnpm --filter @line-os/db typecheck   → clean
pnpm --filter @line-os/db lint        → clean
pnpm --filter @line-os/web test       → 528 passed, 0 failed (unchanged; apps/web was not touched)
pnpm --filter @line-os/web typecheck  → clean
pnpm --filter @line-os/web lint       → clean
pnpm db:mame-to-cha-rehearsal -- dry-run   → fails safely with no local env configured
                                              (no DATABASE_URL, no credential env vars):
                                              blocked before any DB connection, exit 1.
```

The `dry-run` end-to-end success path (env guard passes → schema check runs
→ plan prints → footer) is covered by `mame-to-cha-rehearsal.test.ts` using
an injected fake schema-check dependency, so it is verified without
requiring a running local Supabase stack. `apply`, `verify`, `cleanup`, and
`auth-provision` are exercised only through their own dedicated test files
(fake runner/client/Admin API) and through the CLI test file's injected
fakes — never through the real, `pg`/Supabase-connecting default code paths,
and never via a live invocation of the CLI in this task.

## 15. Remaining risks / explicit approvals required for C2

- **Fixed: the `core.users` mirror gap found by final review.** A
  pre-push security/correctness review found that `apply` never created the
  `core.users` mirror row for the manager/staff auth user ids, which would
  have made the first real `apply` fail with a Postgres `23503`
  foreign-key violation (safely rolled back, no data corruption — but a
  hard correctness blocker for C2). This is fixed: `mame-to-cha-plan.ts`
  models `user_mirror` as an explicit plan entity, `mame-to-cha-state.ts`
  loads its existence, and `mame-to-cha-write.ts` inserts it (reusing
  `onboard-write.ts`'s `ONBOARD_WRITE_SQL.insertUser`) immediately after the
  tenant and before any membership/employee-binding write. `verify` now
  checks the mirror explicitly per identity. See Section 8's "Write order"
  note for detail.
- **Fixed: email-guard strictness inconsistency.** The general rehearsal
  env guard (`mame-to-cha-env-guard.ts`) previously only warned on a
  non-local-looking manager/staff email while `auth-provision` hard-rejected
  the identical condition. Both now hard-fail identically (Section 5/6).
- **C2 is now "run it," not "build it."** Every code path `apply`/`verify`/
  `cleanup`/`auth-provision` needs is implemented and unit-tested; C2's job
  is to start a local Supabase stack, export the real local env vars, and
  run the four commands in order (`auth-provision` → `apply` dry-run review
  → `apply --confirm-apply` → `verify` → the manual mutation smoke, Section
  11 → optionally `cleanup`).
- **Nothing in this task was executed against a real database or a real
  Supabase Auth instance.** The first real execution of `apply`,
  `cleanup --confirm-cleanup`, `auth-provision`, or a live `verify` is a C2
  activity, and (per this task's own restrictions) did not happen here.
- The B2 writes plan's Section 8 finding (workforce FKs to `core.locations`
  are single-column, not composite `(tenant_id, location_id)`) is a
  pre-existing schema note, not something this slice changes or needs to
  change — the fixture's single-location design sidesteps it exactly as the
  B2 plan already established.
- No migration was found necessary for this fixture (every table/view/
  function it needs already exists — see Section 7's schema-check design);
  if a real run's read-only schema check ever reports a missing relation,
  the dry-run's no-go path already surfaces that as a blocking finding
  rather than a silent proceed.
- `cleanup` intentionally never removes the tenant/location/tenant_modules
  rows (Section 10) — if a full teardown of the acceptance tenant is ever
  needed, that remains a separate, explicitly-approved manual step, matching
  the generic onboarding tool's own existing convention.
- The employee display name written by `apply` (`Acceptance Staff One` by
  default, from the fixture manifest) is synthetic, non-real content — per
  Architecture Plan Section K, real client-provided names for an acceptance
  walkthrough should be entered through the same encrypted path with the
  fixture manifest updated accordingly, not hardcoded here.
