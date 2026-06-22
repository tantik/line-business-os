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
- **Scaffold hardening complete** — build/lint/test and RLS guardrails.
- **`main` protected** — stable baseline; never pushed to directly.
- **`dev` clean and green** — integration branch passing verification.
- **Cursor project rules added** — `.cursor/rules/*` guardrails merged.
- **Verification pipeline stabilized** — typecheck/test/build/lint run green.

## 12. Next phase

**Phase 1 — Core Database / Supabase Local Setup:**

- migrations
- seed
- RLS / security checks

No cafe-shift (Workforce) or line-app (Booking) migration yet. Those are
deliberate, scoped tasks for later phases.

## 13. Expected long-term result

A platform where **new modules and new clients can be launched quickly without
rewriting Core**. Adding a client is creating a tenant; adding a product is
adding a module on top of the shared Core — not a new repo, project, or
database.
