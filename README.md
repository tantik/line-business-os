# LINE Business OS

A single **multi-tenant SaaS platform** for Japanese small and medium
businesses. Multiple products run inside one shared Core:

**Workforce · Booking · Logistics · CRM · Inventory · AI Assistant**

Every product is a module inside this platform — not a separate project.

## Architecture at a glance

```
apps/
  web/      Next.js frontend (anon key + RLS only)
  api/      NestJS backend (derives tenant_id from membership; LINE webhooks)
  worker/   Scheduled jobs, LINE reminders, async processing
packages/
  core/     Tenant context, RBAC, permissions, audit
  db/       Supabase client, PII crypto (encrypt + blind index), types, seed
  line/     LINE Messaging API, webhook signature verification
  ai/       AI propose → approve → apply contracts, prompt logging
  ui/       Shared React components
  config/   Shared tsconfig/eslint, zod env validation
  workforce/, booking/   Module domain contracts
supabase/
  migrations/  Canonical SQL: core schema, RBAC, audit, RLS, modules
  seed/        Demo + client-template seed (config-driven)
docs/
  architecture/, security/, adr/, product/
```

## Core data rule

Every business table has `tenant_id uuid not null`. Branch/store/salon/warehouse
data also has `location_id uuid`. See `docs/architecture/multi-tenancy.md`.

## Security model

- PostgreSQL **Row Level Security** enforces tenant isolation (not the frontend).
- Backend derives `tenant_id` from the authenticated user's membership.
- `service_role` key is **server-only**, never bundled into the web app.
- LINE webhooks are signature-verified before processing.
- PII is encrypted; searchable PII uses `*_encrypted` + `*_hash` (blind index).
- All mutations are audited.

See `docs/security/security-requirements.md`.

## Getting started

Prerequisites: Node 20+, pnpm 9+, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
cp .env.example .env          # fill in secrets (never commit .env)
pnpm install

# Start local Postgres + apply migrations + seed structure (LOCAL only)
pnpm db:start                 # supabase start
pnpm db:reset                 # runs migrations then supabase/seed/seed.sql
pnpm db:test                  # run pgTAP DB/RLS tests in supabase/tests

# Seed PII-bearing demo data (encrypted)
pnpm db:seed

# Run everything
pnpm dev
```

> **Database is local-first.** Day-to-day development runs against the local
> Supabase stack. `db:reset` is destructive (rebuilds the local DB) and
> `db:migrate` (`supabase db push`) targets a **linked remote** — only run it
> against Cloud under the approval gate. The schema scaffold (including the
> `workforce`/`booking`/`ai` module schemas) already exists but is
> **scaffold-only**: the tables are real, the product features are not built yet.
> See [`docs/phase-1-core-db.md`](./docs/phase-1-core-db.md).
> A separate Supabase **Cloud dev** project has been prepared (Phase 1B,
> complete): the scaffold migrations `0000`–`0012` were applied to the
> human-created Cloud **dev** project under explicit human approval (verified
> Local = Remote). It is a **dev environment only — no production project exists
> yet**. Future Cloud schema changes are **new forward migrations only**, applied
> under the approval gate. Details (no secrets, no project ref) in
> [`docs/supabase-cloud-dev-setup.md`](./docs/supabase-cloud-dev-setup.md).
> The next phase, **Phase 1C — App-layer foundation for authenticated
> multi-tenant access**, is in **planning (docs-only)**: see
> [`docs/phase-1c-app-foundation.md`](./docs/phase-1c-app-foundation.md).

Generate a 32-byte encryption key for `PII_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Demo vs client template

Both are tenants, configured via `tenant.kind` + `settings` + seed data — not
separate codebases. The seed creates two demo tenants (cafe + salon) and one
clean `client_template` tenant to clone for real clients.

## Contributing

Read [`AGENTS.md`](./AGENTS.md). `main` is stable, `dev` is integration, work on
`feature/*`. Never push directly to `main`.

Cursor project rules live in [`.cursor/rules`](./.cursor/rules) — they encode
the platform architecture, security, RLS, git, AI-agent, and legacy-migration
guardrails for AI agents and contributors.
