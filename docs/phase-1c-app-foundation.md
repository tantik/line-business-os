# Phase 1C — App-layer foundation for authenticated multi-tenant access

This document covers Phase 1C: first the **plan**, then the **implementation**
that delivers it. Read `docs/phase-1-core-db.md` (Phase 1A) and
`docs/supabase-cloud-dev-setup.md` (Phase 1B) first for the database story.

> ✅ **Status: Phase 1C — implemented (app-layer foundation).** The shared
> client utilities, env contract + validation, auth/session baseline,
> protected-route pattern, tenant-context + membership access pattern, safe UI
> states, and tests are now in the codebase (`apps/web` + `packages/config`).
> No migrations, no Supabase Cloud writes, no secrets, and no product features
> were added. See [Implementation (delivered)](#implementation-delivered) for
> the as-built detail. The sections below describe the original plan.

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

Delivered by the Phase 1C implementation (see
[Implementation (delivered)](#implementation-delivered)):

- [x] Create Supabase client utilities (browser + server + middleware).
- [x] Validate the env contract (names + zod validation; placeholders only).
- [x] Add an auth/session helper.
- [x] Add a protected route pattern.
- [x] Add a tenant context helper (resolve tenant from membership).
- [x] Add tests for the app-layer foundation.
- [x] Run the normal app quality gate (`pnpm install --frozen-lockfile`;
      `turbo run typecheck test build lint`).
- [x] No product features.

## Implementation (delivered)

This section records what the Phase 1C implementation actually added. It is the
shared, tenant-aware access plumbing every future module reuses. It adds **no
product feature**, **no migration**, **no Supabase Cloud write**, and **no
secret**.

### Environment variable contract

The browser-safe contract every deployment must provide for the web app:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- Only `NEXT_PUBLIC_*` values ever reach the browser bundle (anon/publishable
  key + URL + RLS). The service-role key is **never** read in `apps/web`.
- Names and placeholders are documented in `.env.example` (no real values).
- Validation lives in `packages/config/src/env.ts` (zod):
  - `publicSchema` / `parsePublicEnv()` — browser-safe `NEXT_PUBLIC_*` only.
  - `serverSchema` / `parseServerEnv()` — server-only env (may include secrets);
    never imported from browser code.
  - Non-throwing parse results report **missing variable names only** — they
    never echo a secret VALUE, so results are safe to log or surface in a
    dev/test error or a "missing configuration" UI state.
  - `serverEnv()` / `publicEnv()` are fail-fast throwing accessors for boot.

### Supabase client utilities (`apps/web/src/lib/supabase/`)

Built on `@supabase/ssr`, anon key + RLS only — never the service-role key:

- `env.ts` — `readPublicSupabaseEnv()` (non-throwing) and
  `requirePublicSupabaseEnv()` (throwing, name-only error). Reads the
  `NEXT_PUBLIC_*` values directly so Next.js can inline them client-side.
- `client.ts` — `createClient()` browser client (`createBrowserClient`).
- `server.ts` — `createClient()` request-scoped server client
  (`createServerClient` + Next.js `cookies()`), marked `server-only`. Tolerates
  the read-only cookie store in Server Components (session refresh is the
  middleware's job).
- `middleware.ts` — `updateSession()` refreshes the session cookie each request.
  If public env is missing it passes the request through unchanged (protected
  routes still fail closed because no user is resolved).

The previous ad-hoc `apps/web/src/lib/supabase-browser.ts` was removed in favor
of this centralized set.

### Auth/session baseline (`apps/web/src/lib/auth/`)

- `user.ts` — `getUserFromClient(supabase)`: framework-agnostic, validates the
  user via `auth.getUser()` (verifies the token with the Auth server, not just
  the cookie). Returns `null` for the no-user case; unit-testable with a stub.
- `session.ts` — `getCurrentUser()` / `getCurrentSession()` server helpers; the
  single place pages/route handlers read the current user/session.
- `require-user.ts` — `requireUser(redirectTo?)` redirects unauthenticated
  requests to `SIGN_IN_PATH` (`/sign-in`) instead of leaking an error.

### Protected route pattern (`apps/web/src/app/(protected)/`)

A Next.js route group using the repo's App Router conventions:

- `layout.tsx` — enforces auth once for the whole group via `requireUser()`, and
  sets `export const dynamic = 'force-dynamic'` so authenticated,
  session-dependent routes are server-rendered per request and never statically
  prerendered at build time (build has no session and no public env).
- `dashboard/page.tsx` — minimal authenticated scaffold that runs the full
  foundation flow and renders the matching safe state per outcome. Hosts **no**
  product logic. Also `force-dynamic`.
- `loading.tsx` / `error.tsx` — safe loading and error boundaries; the error
  boundary logs the real error for developers but shows users a generic message.
- `apps/web/src/app/sign-in/page.tsx` — placeholder landing for redirects (the
  actual Supabase Auth sign-in flow is a later phase).
- `apps/web/src/middleware.ts` — wires `updateSession()` into Next.js middleware.

### Tenant context lookup + membership access (`apps/web/src/lib/tenant/`)

Flow: `authenticated user → membership lookup → active tenant context → access
result`. Tenant context is always derived from the user's membership, never from
request body/query/headers; reads go through the RLS-scoped authenticated
client (no service-role key).

- `types.ts` — `TenantMembership`, `ActiveTenantContext`, and the
  `TenantAccessResult<T>` discriminated union with statuses `success`,
  `not_authenticated`, `no_membership`, `unauthorized`, `config_error`,
  `unexpected_error`. `TenantKind` / `MembershipStatus` mirror the
  `core.tenant_kind` / `core.membership_status` enums (migration `0001`/`0002`)
  without importing the server-oriented `@line-os/db`.
- `membership.ts` — `listTenantMemberships(supabase, userId)` reads active
  memberships from `core.tenant_memberships` joined to `core.tenants`
  (`tenant_id, user_id, location_id, status` + `id, slug, name, kind`), scoped to
  the user. Maps Postgres `42501` / "permission denied" to `unauthorized` and
  other errors to `unexpected_error`. (ADR 0005 → ADR 0006 note: Phase 1D
  migration `0013` opened the narrow `authenticated` SELECT on `core.tenants` +
  `core.tenant_memberships` under RLS, so this read now succeeds for a real
  session; regular users see only their own membership rows (Option T1).)
- `select.ts` — `selectActiveTenant(memberships, requestedTenantId?)`: pure,
  side-effect-free selection. A requested tenant the user is **not** a member of
  returns `unauthorized` (never a silent cross-tenant fallback).
- `context.ts` — `getActiveTenantContext()` composes env check → server client →
  user → memberships → active tenant into a single typed result;
  `requireTenantContext()` redirects only the unauthenticated case and returns
  every other outcome for safe rendering.

### Safe UI/state patterns (`apps/web/src/components/states.tsx`)

Minimal reusable, presentational states (no product logic, no internal error
leakage): `LoadingState`, `ErrorState`, `UnauthorizedState`, `NoTenantState`,
`MissingConfigState`.

### Tests added

Run with `node --import tsx --test` via each package's `test` script:

- `packages/config/src/env.test.ts` — public/server env validation, missing-name
  reporting, and the no-secret-leak guarantee.
- `apps/web/src/lib/supabase/env.test.ts` — `readPublicSupabaseEnv` /
  `requirePublicSupabaseEnv` behavior incl. name-only error.
- `apps/web/src/lib/auth/user.test.ts` — `getUserFromClient` success/no-user/
  error via a stubbed client.
- `apps/web/src/lib/tenant/membership.test.ts` — row mapping, embedded-array
  normalization, `no_membership`, `unauthorized`, `unexpected_error` via a
  thenable stub client.
- `apps/web/src/lib/tenant/select.test.ts` — default/requested/unauthorized/
  empty selection.

All tests use stubs/mocks only — **no real Supabase Cloud, no secrets, no Cloud
writes**.

### Commands run

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run typecheck test build lint --force --ui=stream
```

Result: **29/29 tasks successful** (typecheck, test, build, lint across all
packages); web tests 15/15 pass; config tests 6/6 pass.

### Non-goals (explicit, unchanged)

This implementation deliberately does **not** include any of the following:

- ❌ No product features.
- ❌ No Workforce implementation.
- ❌ No Booking implementation.
- ❌ No AI implementation (no propose → approve → apply workflow).
- ❌ No LINE integration / webhook behavior.
- ❌ No Cloud DB writes (`supabase db push`/`pull`/`reset`/`migration repair`
  were **not** run).
- ❌ No migration changes (`0000`–`0012` untouched; none added).
- ❌ No service-role usage in the app layer (`apps/web` uses anon key + RLS only).
- ❌ No `.env.local` edits and no secrets committed.
- ❌ No `cafe-shift` / `line-app` move or copy.
