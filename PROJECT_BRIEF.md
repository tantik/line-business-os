# PROJECT_BRIEF.md — LINE Business OS

High-level strategy brief so AI agents and contributors can understand the
whole project before working. Read this **first** (see the read order in
`AGENTS.md`). For machine-enforced rules see `.cursor/rules/*`; for deeper
detail see `docs/architecture/*` and `docs/security/*`.

## 1. What this is

LINE Business OS is a **single multi-tenant SaaS platform** for Japanese small
and medium businesses (SMBs). It is **one platform, not a collection of apps**.
Every product is a module that runs inside one shared Core (auth, tenant
context, RBAC, audit, database client). LINE is the primary customer channel.

## 2. Target scale

The platform is designed to eventually serve **300+ client tenants** on shared
multi-tenant infrastructure. Architecture decisions are made so that growth
happens through multi-tenancy (`tenant_id` + RLS), not by spinning up
per-client repos, projects, or databases.

## 3. Current constraint

We currently have **zero clients**. Therefore we keep infrastructure
**minimal and free where possible**. Do **not** provision paid or dedicated
infrastructure ahead of real demand. Optimize for low cost and fast iteration
now, while keeping the design ready for 300+ tenants later.

## 4. Current infrastructure strategy

At this stage, the whole platform runs on a single shared stack:

- **One GitHub repo** — `tantik/line-business-os` (this repo).
- **One Vercel project** — single deployment target for the web app.
- **One Supabase / PostgreSQL database** — shared, multi-tenant, RLS-isolated.
- **Local-first development where possible** — run Supabase and the apps
  locally so day-to-day work needs no paid cloud resources.

Scale via multi-tenancy, never by duplicating this stack per client.

## 5. Product architecture

```
Core Platform  (auth · tenant context · RBAC · audit · db client · LINE · AI)
├── Workforce        (shift / staff scheduling — cafe reference)
├── Booking          (reservations — salon reference)
└── Future modules:
    ├── Logistics
    ├── CRM
    ├── Inventory
    └── AI Assistant
```

- **Core Platform** is shared by every module and is never duplicated.
- **Workforce** and **Booking** are the first two modules.
- **Logistics, CRM, Inventory, AI Assistant** are planned future modules.

## 6. Modules, not separate apps

Workforce and Booking (and every future module) are **modules inside this one
platform** — not separate apps, repos, or Vercel/Supabase projects. They depend
on `@line-os/core`, `@line-os/db`, etc., and share the same Core. Never scaffold
a standalone project for a module.

## 7. Demo vs client-template

Demo and client-template are **tenants, not separate codebases**. They differ
only by `tenant.kind`, `settings`, and seed data.

- **Demo tenants** — for sales: fake but realistic data, no real PII.
- **Client-template tenants** — clean, production-auth, strict-RLS starters
  used to set up a real client.
- **No separate codebases** for demo vs client versions. Never fork the
  codebase to create them.

## 8. Legacy repo strategy

Legacy repos are **source references only**, each mapped to one module:

- **`tantik/cafe-shift`** — source reference for the **Workforce** (cafe)
  module only.
- **`tantik/line-app`** — source reference for the **Booking** (salon) module
  only.

Rules:

- Do **not** copy legacy projects wholesale into this platform.
- Do **not** modify the legacy repos destructively (create backup tags first if
  you must touch them at all).
- Do **not** use cafe-shift for Booking, or line-app for Workforce.
- Extract domain logic, then re-implement it inside the platform with
  `tenant_id`/`location_id`, RLS/RBAC, audit, and demo + client-template seed.

## 9. Security principles

- **`tenant_id` on every business table** (`uuid not null`, no exceptions).
- **`location_id`** for data that belongs to a physical branch/store/salon/
  warehouse.
- **PostgreSQL RLS is mandatory** — tenant isolation lives in the database, not
  the frontend. Every new table gets an RLS policy in the same migration.
- **`service_role` is never exposed to the frontend** — server-only; the web app
  uses the anon key + RLS only.
- **PII encryption + blind index** — encrypt email/phone/address/customer name/
  employee name/LINE user id; searchable PII uses `*_encrypted` + `*_hash`.
- **Audit logs for critical changes** — every create/update/delete of business
  data calls `writeAudit`.

## 10. AI-first principle

AI assists; it never mutates business data on its own. Every AI-driven change
follows this pipeline:

1. **AI proposes** a structured change (no direct DB writes).
2. **Manager approves** (RBAC-gated human decision).
3. **Backend applies** the approved change via normal Core APIs (tenant context,
   RLS, validation).
4. **Audit records** the action with `writeAudit`.

Proposals are inert data until approved.

## 11. Current completed state

- **Phase 0 scaffold complete** — monorepo layout, apps, packages, docs.
- **Phase 1A complete and merged into `dev`** — Core Database / Supabase
  **local** setup is done: migrations, seed, and RLS/security checks land and
  apply cleanly to a local database.
- **Supabase scaffold hardening complete** — PR #3 "Add Supabase scaffold
  hardening and DB tests" was merged into `dev`.
- **Supabase migrations `0000`–`0012` exist** and apply cleanly locally.
- **Workforce / Booking / AI migrations remain scaffold-only module DDL** —
  the tables and RLS are real, but no product feature is built on them yet.
- **`main` protected** — stable baseline (commit `8ad90af`); never pushed to
  directly.
- **`dev` clean and green** — integration branch after Phase 1A and Phase 1B
  completion.
- **Phase 1C planning branch** — `feature/phase-1c-app-foundation-plan` was
  created from `dev` for this docs-only planning PR.
- **Phase 1C planning underway** — the **app-layer foundation for authenticated
  multi-tenant access** is being scoped in a **docs-only** planning PR. No code,
  migrations, Supabase commands, or secrets are introduced. See
  `docs/phase-1c-app-foundation.md`.
- **Cursor project rules added** — `.cursor/rules/*` guardrails merged.
- **Local quality gate passed** — `pnpm install --frozen-lockfile` PASS;
  `turbo run typecheck test build lint` 27/27 PASS.
- **Supabase CLI** — version `2.107.0` installed locally.
- **Phase 1B Cloud dev apply complete** — the human-created Supabase **Cloud
  dev** project was prepared, linked, and the scaffold migrations `0000`–`0012`
  were applied to it under the full approval gate. Post-push
  `supabase migration list` verified **Local = Remote** for `0000`–`0012`. The
  Cloud project is a **dev environment only**; **no production project exists
  yet**. No product features were added, and `cafe-shift`/`line-app` were not
  moved. `supabase db pull` and destructive resets remain unrun. See
  `docs/supabase-cloud-dev-setup.md` →
  "Phase 1B Cloud dev apply — completed status".

## 12. Phase 1B complete — Supabase Cloud dev project preparation

Phase 1A delivered the **local-first** database. Phase 1B prepared a separate
**Supabase Cloud dev project** so the team can run the same migrations against a
hosted environment — kept separate from any future production project, and only
after explicit human approval. This phase is **complete**: under the approval
gate, the scaffold migrations `0000`–`0012` were applied to the human-created
Cloud **dev** project, and post-push `supabase migration list` verified
**Local = Remote** for `0000`–`0012`. The Cloud project remains a **dev
environment only**; **no production project exists yet**. No product features
were added, and `cafe-shift`/`line-app` were not moved. Any future Cloud schema
change must be a **new forward migration** applied under the same gate.

The Supabase schema scaffold already exists (`supabase/migrations`, including
the `workforce`/`booking`/`ai` module schemas) and applies cleanly to a local
database. See `docs/phase-1-core-db.md`.

No cafe-shift (Workforce) or line-app (Booking) migration yet. Those are
deliberate, scoped tasks for later phases.

## 13. Phase 1B Goal

- **Create/prepare a separate Supabase Cloud dev project** dedicated to
  development (kept distinct from any future production project).
- **Prepare required local docs/checklists/env examples** — a Cloud setup
  checklist and env name documentation using placeholders only.
- **Safely link only after review** — `supabase link` is performed only after
  the Cloud project and link details have been reviewed.
- **Use migration list and dry-run before any Cloud write** — inspect the
  migration list and run `supabase db push --dry-run` before any real write.
- **Do not apply migrations to Cloud until explicit human approval** — no real
  `supabase db push` to Cloud without an explicit human go-ahead.

## 14. Supabase Cloud Safety Rules

- **Cloud push requires explicit approval** — a real `supabase db push` to
  Cloud is only run after an explicit human approval.
- **Cloud reset is forbidden** — never run a destructive Cloud reset
  (`supabase db reset` against Cloud).
- **`db pull` is forbidden unless approved** — do not run `supabase db pull`
  without explicit approval.
- **`db push --dry-run` is allowed only after Cloud project/link review** — the
  dry run is permitted once the Cloud project and link have been reviewed, and
  it performs no writes.
- **No secrets in git** — never commit real project refs, URLs, keys,
  passwords, service-role keys, or other secrets.
- **Use placeholders only in docs/examples** — all documented env values are
  placeholders, never real credentials.

## 15. Migration Policy

- **Existing migrations are append-only.**
- **Do not delete, renumber, squash, rewrite, reorder, or replace existing
  migrations** (`0000`–`0012`).
- **Workforce / Booking / AI migrations stay scaffold-only module DDL** — keep
  them as-is (Decision: Option A).
- **Any future schema change must be a new forward migration** added on top of
  the existing series.

## 16. Definition of Done for Phase 1B

Phase 1B is **complete** — all criteria below are satisfied:

- **`PROJECT_BRIEF.md` updated** to reflect the current state and Phase 1B.
- **Supabase Cloud dev project setup checklist documented.**
- **Required secrets/env names documented with placeholders only.**
- **Supabase Cloud safety rules documented.**
- **No real secrets committed.**
- **Cloud push performed only after explicit human approval** — scaffold
  migrations `0000`–`0012` applied to the human-created Cloud **dev** project;
  post-push `supabase migration list` verified **Local = Remote**.
- **Local checks still pass** (`pnpm install --frozen-lockfile`; typecheck /
  test / build / lint).

## 17. Current next phase — Phase 1C planning (app-layer foundation)

**Phase 1A (Core DB / Supabase local) is complete.** **Phase 1B (Supabase Cloud
dev project preparation + scaffold apply) is complete.** The current next phase
is **Phase 1C — App-layer foundation for authenticated multi-tenant access**,
and it is in **planning (docs-only)** right now.

- **Goal** — prepare the **application layer** so future Workforce, Booking, and
  AI modules can safely use **Supabase Auth, tenant context, protected routes,
  and RLS**. Phase 1C does **not** implement product features.
- **Planned (later) implementation** — Supabase browser/server client
  utilities, an env variable contract + validation, an auth/session baseline, a
  protected-route pattern, a tenant context + membership access pattern, an
  optional dashboard/route skeleton (only if approved), safe
  error/loading/unauthorized patterns, and a test strategy.
- **Non-goals** — no Workforce/Booking/AI/LINE product logic, no customer-facing
  product logic, no `cafe-shift`/`line-app` migration, and no new DB migrations
  unless separately reviewed and approved.
- **Cloud stays dev-only.** The Supabase Cloud project remains a **dev
  environment only**; **no production project exists yet**. Any Cloud schema
  change is a **new forward migration** applied under the Phase 1B approval gate.
- **Destructive-command restrictions still apply.** No `supabase link`,
  `db push`, `db pull`, `db reset`, or `migration repair` without the documented
  approval gate; never push to `main`; never edit `0000`–`0012`.

Full detail: `docs/phase-1c-app-foundation.md`.

## 18. Expected long-term result

A platform where **new modules and new clients can be launched quickly without
rewriting Core**. Adding a client is creating a tenant; adding a product is
adding a module on top of the shared Core — not a new repo, project, or
database.
