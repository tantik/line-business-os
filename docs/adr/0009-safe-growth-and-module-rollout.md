# ADR 0009: Safe growth and module rollout

- Status: Accepted
- Date: 2026-06-26
- Phase: 1H Stage 1 — Operations Docs Foundation
- Relates to: ADR 0002 (multi-tenant RLS), ADR 0005 (data access model),
  ADR 0008 (`api` facade schema)

## Context

The Phase 1H audit is complete and we adopted **Option 2.5**: a professional
SaaS foundation with scalable boundaries targeting **300+ client tenants** on
shared multi-tenant infrastructure. After Option 2.5, the platform may onboard
its **first real clients**.

From that point, the platform is never empty. Future modules — Workforce,
Booking, AI Support, CRM, Logistics, Inventory, and others — will be built and
shipped **while active tenants depend on the system**. New development must not
break or negatively affect already-onboarded clients, and the architecture must
stay safe to grow toward hundreds of tenants without per-client forks.

## Decision

The following rules govern how new modules and schema changes ship once real
tenants exist.

1. **New modules ship disabled by default for existing tenants.** Adding a module
   to the platform must not auto-activate it for tenants that did not opt in.
   Enablement is an explicit, per-tenant action.

2. **`core.tenant_modules` is the entitlement source of truth.** Whether a tenant
   can use a module is decided by its `tenant_modules` row, not by code presence,
   deploy state, or hardcoded flags.

3. **Future module enablement is per tenant.** Modules are turned on tenant by
   tenant (via `tenant_modules`), never globally flipped for everyone.

4. **Migrations must be additive / append-only.** New schema arrives through new,
   forward, additive migrations. Do not delete or renumber existing migrations.

5. **No destructive changes without separate approval.** Dropping/renaming
   columns or tables, backfills that rewrite data, or anything that can lose or
   corrupt tenant data requires its own explicitly approved task — never an
   implicit side effect of feature work.

6. **Every business table has `tenant_id` and RLS.** Each new business table
   includes `tenant_id uuid not null` (and `location_id` for physical-site data)
   and enables RLS in the **same** migration that creates it. A table without RLS
   is a bug.

7. **App-facing access goes through the `api` schema / facade.** The browser and
   app clients read/operate through the curated `api` facade (ADR 0008), not raw
   internal schemas.

8. **Internal / product schemas are not exposed through the Data API.** Schemas
   such as `core`, `audit`, `workforce`, `booking`, and `ai` are never added to
   the Data API exposed-schemas list. Only `public` + `api` are exposed.

9. **New product modules must not break existing tenants.** Any new module is
   built so that tenants without it enabled see no behavior change, no
   performance regression, and no access leakage.

## Rationale

- First real clients may be onboarded right after Option 2.5, so the system is no
  longer a greenfield prototype — it carries live, isolated client data.
- Future development is continuous and parallel to live usage; it must not affect
  active tenants. Disabled-by-default + per-tenant entitlement + additive-only
  migrations make new work safe to ship behind explicit gates.
- These boundaries are what let the platform scale via multi-tenancy
  (`tenant_id` + RLS + facade) toward 300+ tenants without per-client repos,
  projects, or databases.

## Consequences

- **More up-front discipline.** Each module must wire entitlement checks, RLS,
  facade exposure, and additive migrations before it can ship.
- **Slower but safer module rollout.** Per-tenant enablement and approval gates
  add steps, trading raw speed for tenant safety.
- **Less risk for 300+ tenant growth.** Strict tenant isolation and append-only
  change discipline keep blast radius small as the tenant count grows.
