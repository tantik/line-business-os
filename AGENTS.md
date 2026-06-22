# AGENTS.md — LINE Business OS

Operating rules for AI agents and contributors working in this repository.
Read this before changing anything.

## What this is

A single **multi-tenant SaaS platform** for Japanese SMBs. Multiple products
(Workforce, Booking, Logistics, CRM, Inventory, AI) run inside one shared Core.
**Do not build isolated one-off projects.** Every product runs inside this
platform.

## Non-negotiable rules

1. **Every business table includes `tenant_id uuid not null`.** If the data
   belongs to a physical branch/store/salon/warehouse, also include
   `location_id uuid`. Never create a business table without `tenant_id`.
2. **RLS is mandatory.** Tenant isolation lives in the database, not the
   frontend. Add RLS policies for every new table (see `supabase/migrations`).
3. **Derive `tenant_id` from the authenticated user's membership**, never from
   the request body (`packages/core/src/tenant-context.ts`).
4. **`service_role` is server-only.** Never import `@line-os/db`'s
   `createServiceClient` (or read `SUPABASE_SERVICE_ROLE_KEY`) in `apps/web`.
5. **Verify LINE webhook signatures** against the raw body before processing
   (`@line-os/line/webhook`).
6. **Protect PII**: encrypt email/phone/address/customer name/employee name/LINE
   user id. Searchable PII uses `*_encrypted` + `*_hash` (blind index) via
   `@line-os/db/crypto`.
7. **Audit every mutation** with `writeAudit` (actor, tenant, module, entity,
   action, before/after when safe, timestamp).
8. **AI never writes business data directly.** AI proposes → manager approves →
   backend applies → audit logs (`@line-os/ai`).

## Before implementing any module feature

1. Check `docs/architecture`.
2. Check the `tenant_id` requirement.
3. Check RLS impact.
4. Check RBAC permissions (`packages/core/src/permissions.ts`).
5. Check audit log requirement.
6. Check cross-module impact.
7. Run lint/build/tests.
8. Summarize risks before commit.

## Git rules

- `main` = stable, `dev` = integration, `feature/*` = task branches.
- **Never push directly to `main`.**
- Every task notes: scope, changed files, build/lint result, security impact,
  migration impact, rollback note.

## Migration rules (legacy → platform)

Legacy repos (`tantik/cafe-shift`, `tantik/line-app`) are **source references
only**. Do not modify them destructively; create backup tags first. Do not copy
wholesale. Order: preserve UI/UX → extract domain logic → replace mock data with
Core API → add `tenant_id`/`location_id` → add RLS/RBAC → add audit logs → add
demo + client-template seed → test module isolation.

## Demo vs client template

Both are **tenants**, not separate codebases. Differences come from
`tenant.kind`, `settings`, and seed data only. Demo has fake realistic data and
no real PII; client template is a clean, production-auth, strict-RLS starter.

## Cursor project rules

Machine-enforced guardrails for AI agents live in `.cursor/rules` (architecture,
security, database/RLS, git workflow, AI-agent workflow, legacy-migration
boundaries). They restate and operationalize the rules in this file; keep both
in sync when either changes.

## Layout

- `apps/web` Next.js · `apps/api` NestJS · `apps/worker` jobs/reminders
- `packages/core|db|line|ai|ui|config|workforce|booking`
- `supabase/migrations|seed` (canonical SQL + RLS) · `docs/`
