# Architecture Overview

LINE Business OS is one platform with many modules over a shared Core.

## Layers

1. **Core** (`packages/core`, `core` DB schema): tenants, locations, users,
   memberships, RBAC, LINE registry, audit. The foundation every module builds on.
2. **Modules** (`workforce`, `booking`, `inventory`, ... each its own DB schema
   + package): business features. Each is tenant-scoped and entitlement-gated
   via `core.tenant_modules`. `inventory`'s first capability is Daily Stock
   Check (see `docs/phase-1o-inventory-daily-stock-check-implementation-report.md`) —
   a reusable module, not tied to any single tenant.
3. **Apps**:
   - `apps/web` — Next.js UI. Talks to Supabase with the **anon key + RLS** and
     to `apps/api` for privileged operations. Never holds `service_role`.
   - `apps/api` — NestJS. Authenticates the user, derives tenant context from
     membership, enforces RBAC, applies changes, writes audit logs, receives
     LINE webhooks.
   - `apps/worker` — scheduled jobs (booking reminders, async processing).

### Dashboard vs. platform admin

`/dashboard` in `apps/web` is the **tenant-scoped customer/client admin
dashboard** — what a tenant's own members see for their own tenant, location,
and enabled modules. It is **not** an internal SaaS owner/operator admin
panel. Any future internal platform/operator tooling (cross-tenant
visibility, platform-wide operations, support/ops workflows) belongs in a
separate area — for example `/platform` or `/ops` — kept architecturally
distinct from `/dashboard`, including route namespace and any future RBAC
distinction between "tenant member" and "platform operator." Client/tenant
users must only ever see their own tenant/location/module data.

## Request flow (privileged write)

```
Browser (anon, RLS)
   │  authenticated request
   ▼
apps/api  ── resolveTenantContext(user) ──► tenant_id + permissions (from DB)
   │  requirePermission(...)
   ▼
module service ── service-role DB write ──► writeAudit(...)
```

## Why a service-role API path?

RLS protects data even if the API has a bug, but the API uses the service-role
client for writes so it can also enforce richer business rules and always record
audit entries. Tenant context is still derived from membership and every action
is permission-checked in code — RLS is defense-in-depth, not the only gate.

## Data ownership rules

- Every business table: `tenant_id uuid not null`.
- Physical-location data: add `location_id uuid`.
- Cross-tenant joins are forbidden. Iterate tenants explicitly in jobs.

See also: `multi-tenancy.md`, `rbac.md`, `../security/security-requirements.md`.
