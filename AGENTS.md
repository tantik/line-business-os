# AGENTS.md — LINE Business OS

Operating rules for AI agents and contributors working in this repository.
Read this before changing anything.

## What this is

A single **multi-tenant SaaS platform** for Japanese SMBs. Multiple products
(Workforce, Booking, Logistics, CRM, Inventory, AI) run inside one shared Core.
**Do not build isolated one-off projects.** Every product runs inside this
platform.

## Read order for AI agents

Read these in order before changing anything:

1. `AGENTS.md` — operating rules (this file).
2. `docs/ai/oaes-project-profile.md` — how OAES is applied in this repository.
3. `docs/ai/current-task.md` — the current verified stage and next gate.
4. `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` — for Claude Code
   sessions: mission sizing, autonomy boundaries, context management,
   subagent use, evidence discipline, and the mission/handoff/completion-report
   formats. Adds no new engineering rules.
5. `PROJECT_BRIEF.md` — high-level project strategy and context.
6. `README.md` — repository overview and getting started.
7. `.cursor/rules/*` — machine-enforced guardrails.
8. `docs/architecture/*` — architecture detail.
9. `docs/security/*` — security requirements.
10. `docs/phase-1-core-db.md` — current DB phase: what the Supabase scaffold
   already contains, the scaffold-only module schemas, local-first flow, and
   cloud safety guardrails.
11. `docs/supabase-cloud-dev-setup.md` — Phase 1B: how a human safely creates and
   prepares a separate Supabase Cloud dev project (placeholders only; Cloud
   writes are approval-gated).
12. `docs/phase-1c-app-foundation.md` — Phase 1C planning (docs-only): the
   app-layer foundation for authenticated multi-tenant access (Supabase Auth,
   tenant context, protected routes, RLS). Planning only — no product features.

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

1. Complete the OAES Product Review and Architecture Review gates in
   `docs/ai/oaes-project-profile.md`.
2. Check `docs/architecture`.
3. Check the `tenant_id` requirement.
4. Check RLS impact.
5. Check RBAC permissions (`packages/core/src/permissions.ts`).
6. Check audit log requirement.
7. Check cross-module impact.
8. Run the applicable local verification.
9. Produce an OAES Acceptance Report before declaring the task done.

## Database phase (Phase 1)

The Supabase scaffold already exists under `supabase/migrations` and applies
cleanly to a **local** database. Migrations `0009_workforce.sql`,
`0010_booking.sql`, and `0011_ai.sql` are **real schema migrations but
scaffold-only** — the tables/RLS exist; the product features do not. Do not
delete or renumber existing migrations. During Phase 1 the DB is **local-first**:
do not link Supabase Cloud and do not run `supabase db push` (`db:migrate`).
Full detail and command risk table: `docs/phase-1-core-db.md`.

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
in sync when either changes. Claude Code guardrails in `.claude/` (`CLAUDE.md`,
`settings.json`, `skills/*`) must also stay in sync with this file and
`.cursor/rules/*`.

## Layout

- `apps/web` Next.js · `apps/api` NestJS · `apps/worker` jobs/reminders
- `packages/core|db|line|ai|ui|config|workforce|booking`
- `supabase/migrations|seed` (canonical SQL + RLS) · `docs/`
