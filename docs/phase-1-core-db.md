# Phase 1 — Core Database / Supabase Local

This is the working guide for the database layer during **Phase 1**. Read it
before touching anything under `supabase/`. It explains what already exists,
what is intentionally *not* built yet, and the safety rules for running the
database locally.

> TL;DR — The Supabase schema scaffold already exists and applies cleanly to a
> **local** database. Product features are **not** implemented yet. Do not push
> to or reset any Supabase **Cloud** project during Phase 1. Local-first only.

## 1. What already exists

The canonical SQL lives in `supabase/migrations/` and applies in order via the
Supabase CLI. As of Phase 1A the scaffold is complete and covers:

| Migration | Area | Status |
| --- | --- | --- |
| `0000_extensions_and_schemas.sql` | `pgcrypto`, `citext`, `core`/`audit` schemas | core |
| `0001_core_enums.sql` | module/role/tenant/membership enums | core |
| `0002_core_tables.sql` | tenants, locations, users, memberships, modules | core |
| `0003_rbac.sql` | permissions, roles, role_permissions, role_assignments | core |
| `0004_line_registry.sql` | LINE channels + accounts (PII-protected) | core |
| `0005_audit.sql` | append-only `audit.audit_logs` + immutability trigger | audit |
| `0006_helpers.sql` | `core.is_member_of` / `has_permission` / `is_platform_staff`, `set_updated_at` | core |
| `0007_rls_policies.sql` | RLS enable + policies for core + audit | core/audit |
| `0008_rbac_seed.sql` | permission catalog + system roles (platform reference data) | core |
| `0009_workforce.sql` | **workforce** schema: employees, shifts, requests, leave, attendance | **scaffold-only** |
| `0010_booking.sql` | **booking** schema: services, staff, hours, slots, bookings, events | **scaffold-only** |
| `0011_ai.sql` | **ai** schema: proposals + prompt logs | **scaffold-only** |
| `0012_protect_platform_staff.sql` | trigger blocking self-escalation to platform staff | security |
| `0013_authenticated_tenant_access.sql` | first narrow `authenticated` SELECT surface (`core.tenants`, `core.tenant_memberships`) + `shares_tenant_with` helper + Option T1 membership policies | security |
| `0014_core_helper_execute_hardening.sql` | remove implicit PUBLIC EXECUTE on all `core` helpers; explicit minimal EXECUTE grants (authenticated for the five RLS/app helpers; none for the two trigger helpers) | security |
| `0015_api_facade.sql` | app-facing `api` facade schema + security-invoker view `api.my_tenant_memberships` (Phase 1E-3); local Data API exposes only `public` + `api`; `core` stays internal | security |

> Migration `0013` (Phase 1D) opens the **first** narrow direct-DB read surface
> for the `authenticated` role. See `docs/phase-1d-db-access-hardening.md` and
> ADR 0006. It is validated **locally only**; Cloud apply needs explicit approval.

> Migration `0014` (Phase 1E-1) makes the EXECUTE posture of every `core` helper
> explicit (no implicit `PUBLIC` grant) **before** any Data API exposure of
> `core`. It changes privileges only — no bodies, RLS, or table grants. `core`
> is **not** exposed by this work; Phase 1E Stage 2 stays blocked until `0015`
> is merged/applied and Cloud dev `api` exposure is explicitly approved. See
> `docs/phase-1e-data-api-exposure.md` and ADR 0007.

> Migration `0015` (Phase 1E-3) adds the production-safe **`api` facade** — a new
> `api` schema with the security-invoker view `api.my_tenant_memberships` — and
> narrows the **local** Data API (`config.toml`) to expose only `public` + `api`.
> The app reads tenant context through `api`, not raw `core`. **`core` is never
> exposed to the Data API** (locally or in Cloud). Validated locally only; Cloud
> apply and Cloud `api` exposure remain approval-gated. See
> `docs/phase-1e-data-api-exposure.md` and ADR 0008.

### "Scaffold-only" means

`0009_workforce.sql`, `0010_booking.sql`, and `0011_ai.sql` are **real schema
migrations** — they create real schemas, tables, enums, indexes, `updated_at`
triggers, and RLS policies, all with `tenant_id` (and `location_id` where the
data is physical). They are correct and should not be deleted or renumbered.

What they are **not** is a finished product. There is **no product feature code**
(UI, API endpoints, services, jobs) built on top of these schemas yet. The
tables exist so that:

- the multi-tenant + RLS shape of each module is committed and reviewable, and
- future module work has a stable, audited foundation to build on.

> Treat `workforce`, `booking`, and `ai` as **module DDL scaffolding**, not as a
> completed product migration. Building the actual Workforce / Booking / AI
> features is separate, deliberately scoped, later work.

### Legacy repos are source references only

The old repositories are **read-only design references**, each mapped to exactly
one future module. They are **not** to be migrated, copied wholesale, or
modified during Phase 1.

- `tantik/cafe-shift` → reference for the future **Workforce** module only.
- `tantik/line-app` → reference for the future **Booking** module only.

See `.cursor/rules/05-legacy-migration-boundaries.mdc` and `PROJECT_BRIEF.md` §8.

## 2. Local-first database flow

Phase 1 runs entirely against the **local** Supabase stack (Docker). No cloud
project is linked, and none should be linked during this phase.

Prerequisites: Docker running, Supabase CLI (pinned as a root dev dependency in
`package.json` — run it via `pnpm exec supabase ...`).

```powershell
# Start the local stack (first run pulls Docker images; can take a while)
pnpm exec supabase start

# Recreate the local DB from scratch: runs all migrations then supabase/seed/seed.sql
pnpm exec supabase db reset

# Run the database tests (pgTAP) under supabase/tests
pnpm exec supabase test db

# Seed PII-bearing demo data (encrypted) — local only
pnpm db:seed

# Stop the local stack when done
pnpm exec supabase stop
```

Convenience wrappers exist as package scripts: `pnpm db:start`, `pnpm db:stop`,
`pnpm db:reset`, `pnpm db:test`, `pnpm db:status`. See §4.

### Config note (`supabase/config.toml`)

`db.major_version` is pinned to **15** (`supabase/postgres:15.8.1.085`). The
Supabase CLI only accepts `15` or `17` here; `16` is not a published image and
is rejected by the CLI's config validation. All migrations use
version-agnostic SQL, so the exact local major version is not significant — it
only needs to be a value the CLI accepts.

## 3. Cloud safety guardrails (read before running anything destructive)

During Phase 1 we are **local-first** and there is **no linked cloud project**.
The following rules keep it that way and prevent an accidental production wipe.

- **`pnpm exec supabase db reset` is destructive — and local-only *only while
  unlinked*.** It drops and recreates the database. With no linked project it
  hits your local Docker Postgres. If a project is ever linked, the same
  command and `db push` can target **Cloud**. Never run `db reset` casually
  against anything you did not personally verify is local.
- **Do not run `supabase db push` during Phase 1.** `db push` applies local
  migrations to the **linked remote** database. It must not run until: (a) a
  local `db reset` + `supabase test db` pass cleanly, and (b) the repo owner
  explicitly approves linking and pushing. The `db:migrate` script maps to
  `supabase db push` for *future* use — it is **not** part of the Phase 1 flow.
- **Do not link Supabase Cloud during Phase 1** (`supabase link`), and do not
  run any command against a cloud project.
- **Do not include local/demo seed in production/cloud.** `supabase/seed/seed.sql`
  and `pnpm db:seed` create demo tenants and fake data. They are for local/demo
  use only and must never be applied to a real client database unless that is
  explicitly intended for a fresh client-template setup.
- **Never expose the service role key to the browser/client.**
  `SUPABASE_SERVICE_ROLE_KEY` is server-only (`apps/api`, `apps/worker`,
  `packages/db` seed). It bypasses RLS by design. `apps/web` uses the anon key
  + RLS only. See ADR 0005 and `docs/security/security-requirements.md`.

### Command risk reference

| Command | Targets | Risk | Phase 1 |
| --- | --- | --- | --- |
| `supabase start` / `stop` / `status` | local Docker | none | ✅ allowed |
| `supabase db reset` | local DB (while unlinked) | destructive (local) | ✅ allowed locally |
| `supabase test db` | local DB | none | ✅ allowed |
| `db:seed` (TS seeder) | local DB | inserts demo data | ✅ local only |
| `supabase db push` (`db:migrate`) | **linked remote** | destructive (cloud) | ❌ not in Phase 1 |
| `supabase link` | links cloud project | enables cloud targeting | ❌ not in Phase 1 |

## 4. Package scripts

Root `package.json` database scripts (run with `pnpm <script>`):

| Script | Maps to | Notes |
| --- | --- | --- |
| `db:start` | `supabase start` | local stack up |
| `db:stop` | `supabase stop` | local stack down |
| `db:status` | `supabase status` | show local stack status |
| `db:reset` | `supabase db reset` | **local** rebuild + seed (destructive locally) |
| `db:test` | `supabase test db` | run pgTAP tests in `supabase/tests` |
| `db:diff` | `supabase db diff` | inspect schema drift |
| `db:seed` | `pnpm --filter @line-os/db seed` | encrypted demo PII (local) |
| `db:migrate` | `supabase db push` | **cloud-targeting; not for Phase 1** (see §3) |

`db:migrate` was kept (not removed) because it is the intended future
production-apply path. It is deliberately **not** part of the documented Phase 1
flow, and the table above plus §3 make its cloud-targeting risk explicit.

## 5. Database tests (`supabase/tests`)

pgTAP tests under `supabase/tests/` assert the structural and security
invariants of the scaffold. Run them with:

```powershell
pnpm exec supabase db reset   # ensure a clean, migrated DB
pnpm exec supabase test db
```

The tests cover (at minimum):

- all migrations apply successfully (the reset/run itself proves this);
- expected schemas exist: `core`, `audit`, `workforce`, `booking`, `ai`;
- expected core tables exist;
- expected product scaffold tables exist (`workforce`, `booking`, `ai`);
- RLS is **enabled on every business table**, and **no** business table has RLS
  disabled;
- every product table has a `tenant_id` column;
- `audit.audit_logs` is append-only (update/delete are rejected);
- the platform-staff self-escalation guard exists (function + trigger from
  `0012`);
- client grants stay minimal (ADR 0005 + ADR 0006): `anon` has **no** business
  grants and no `core` schema usage; `authenticated` has exactly `USAGE` on
  schema `core` plus `SELECT` on **only** `core.tenants` and
  `core.tenant_memberships` (Phase 1D), and nothing else on the business schemas;
- the local Data API (`config.toml` `api.schemas`) exposes only `public` + `api`
  (Phase 1E-3); `core` and the product schemas (`audit`/`workforce`/`booking`/`ai`)
  are **not** PostgREST-exposed, and product schemas have no client grants either;
- Phase 1D authenticated access behaves correctly under RLS: own-only membership
  reads, manager-gated managed reads, cross-tenant denial, preserved co-member
  visibility via `core.shares_tenant_with`, anon/no-JWT denial, writes blocked
  (`supabase/tests/0003_authenticated_access.sql`).

If pgTAP is unavailable in your local stack, `supabase test db` will error
rather than silently pass. Do not fake a pass — see the test file header for the
exact requirement.
