# Phase 1C — App-layer foundation for authenticated multi-tenant access

This is the **planning** document for Phase 1C. It defines the next phase
**before** any implementation. Read `docs/phase-1-core-db.md` (Phase 1A) and
`docs/supabase-cloud-dev-setup.md` (Phase 1B) first for the database story.

> ✅ **Status: Phase 1C — planning only (docs-only).** This document scopes the
> app-layer foundation. It introduces **no code, no migrations, no Supabase
> commands, and no secrets**. Implementation happens later, in a separate
> reviewed PR.

## Phase goal

Phase 1C prepares the **application layer** so that future Workforce, Booking,
and AI modules can safely use **Supabase Auth, tenant context, protected routes,
and RLS**. It establishes a single, centralized, tenant-aware access foundation
on top of the existing database scaffold (migrations `0000`–`0012`).

Phase 1C **does not** implement any product feature. Its only output, once
implemented, is the shared plumbing every module will reuse: client utilities,
an env contract, an auth/session baseline, a protected-route pattern, and a
tenant-context lookup pattern — all consistent with the database security
boundary already enforced by RLS.

## What Phase 1C should build later

The following items are **planned implementation work**, documented here but
**not implemented in this docs-only phase**. They land later under a separate
reviewed PR:

- **Supabase browser/server client utilities** — a thin, shared way to create
  Supabase clients for the browser (anon/publishable key + RLS) and for the
  server (request-scoped session), so pages and route handlers do not each
  hand-roll a client.
- **Environment variable contract and validation** — a documented, validated set
  of env variable **names** (e.g. `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only keys) using zod validation in
  `packages/config`. Placeholders only; no real values, refs, or secrets.
- **Auth/session baseline** — sign-in/sign-out and session retrieval helpers
  built on Supabase Auth, with a clear server vs browser boundary.
- **Protected route pattern** — a single, reusable way to require an
  authenticated session for protected routes/segments and redirect
  unauthenticated users.
- **Tenant context lookup pattern** — a centralized helper that resolves the
  current tenant from the authenticated user's membership (never from request
  body/query/headers), consistent with `packages/core/src/tenant-context.ts`.
- **Tenant membership access pattern** — a shared way to read the user's
  membership(s) and select the active tenant/location, so access checks are not
  duplicated per page.
- **Basic dashboard shell or route skeleton** — *only if later approved* — a
  minimal authenticated layout/route skeleton with no product logic, purely to
  host future modules.
- **Safe error/loading/unauthorized patterns** — consistent loading, error, and
  unauthorized/forbidden UI states for authenticated routes.
- **Test strategy for the app-layer foundation** — how to test the client
  utilities, env validation, auth/session helpers, protected routes, and tenant
  context resolution (unit + integration), without touching product features.

## What Phase 1C must not do

Phase 1C is explicitly scoped to the app-layer foundation. It must **not**:

- ❌ Implement any **Workforce** feature.
- ❌ Implement any **Booking** feature.
- ❌ Implement the **AI proposal workflow** (propose → approve → apply).
- ❌ Implement any **LINE bot** / webhook product behavior.
- ❌ Implement any **customer-facing product logic**.
- ❌ Perform any **cafe-shift migration** (no moving/copying `tantik/cafe-shift`).
- ❌ Perform any **line-app migration** (no moving/copying `tantik/line-app`).
- ❌ Add **new DB migrations** unless separately reviewed and approved.
- ❌ Run a Cloud **`db push`** without a separate dry-run, review, and explicit
  human approval.

## Architecture principles

Phase 1C work — both this plan and the later implementation — follows these
principles:

- **Local-first development.** Build and test against the local Supabase stack
  first (see `docs/phase-1-core-db.md`).
- **Cloud dev only after approval gate.** Any Cloud interaction stays behind the
  Phase 1B approval gate (`docs/supabase-cloud-dev-setup.md`).
- **Forward migrations only.** Migrations are append-only; never edit, renumber,
  squash, or replace `0000`–`0012` (`PROJECT_BRIEF.md` §15).
- **RLS remains the database security boundary.** Tenant isolation lives in the
  database, not the app layer. The app layer relies on RLS; it does not
  re-implement or weaken it.
- **The app layer must not bypass tenant/RLS assumptions.** No app-layer
  shortcut may read or write across tenants outside the RLS-enforced path.
- **Service-role / secret key must never be used in browser/client code.** It
  bypasses RLS and is server-only (`apps/api`, `apps/worker`, server contexts in
  `packages/db`). Never import it or read `SUPABASE_SERVICE_ROLE_KEY` in
  `apps/web`.
- **Anon / publishable key is allowed in the frontend only with RLS.** The web
  app uses the anon key plus RLS for tenant isolation — never the service-role
  key.
- **Tenant-aware access should be centralized, not scattered across pages.**
  Tenant resolution and membership checks live in shared helpers, so individual
  pages and route handlers do not each re-derive tenant context.

## Definition of Done for Phase 1C planning

For this **docs-only** PR, Phase 1C planning is done when:

- ✅ Phase 1C **scope** is documented.
- ✅ Phase 1C **non-goals** are documented.
- ✅ Phase 1C **safety rules** are documented.
- ✅ **No code** implementation was added.
- ✅ **No migrations** were added or changed.
- ✅ **No Supabase commands** were run.
- ✅ **No secrets** (project refs, DB passwords, connection strings, keys,
  tokens) were added.

## Future implementation checklist

Unchecked items for the **later implementation PR** (not this docs-only PR):

- [ ] Create Supabase client utilities (browser + server).
- [ ] Validate the env contract (names + zod validation; placeholders only).
- [ ] Add an auth/session helper.
- [ ] Add a protected route pattern.
- [ ] Add a tenant context helper (resolve tenant from membership).
- [ ] Add tests for the app-layer foundation.
- [ ] Run the normal app quality gate (`pnpm install --frozen-lockfile`;
      `turbo run typecheck test build lint`).
- [ ] No product features.
