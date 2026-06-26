# Phase 1F Completion Report — App Integration of Authenticated Tenant Isolation

## Executive summary

Phase 1F connected the `apps/web` Next.js app to the Phase 1E Data API facade so
that a real authenticated user can sign in, land on a protected dashboard, and
see only their own active tenant memberships — with tenant isolation still
enforced entirely by the database (RLS) through the `api.my_tenant_memberships`
security-invoker view. No new database surface was added: Phase 1F is app-layer
foundation only (auth UI + protected flow + a contract guard), reusing the
Phase 1E facade unchanged.

The phase delivered an integration audit, an offline contract guard locking the
app's membership read to the `api` facade, a minimal email/password sign-in UI
with a sign-out action and a protected dashboard, a manual end-to-end smoke test
against Supabase Cloud dev with the existing synthetic smoke users (8/8 PASS),
and a small dashboard UI hardening that removed the internal auth user UUID from
the displayed UI.

## Status summary

- Phase 1F: **complete**.
- Branch: `dev`.
- Latest local `dev` commit: `003a6b4` — "Merge pull request #19 from
  tantik/feature/phase-1f-stage-5-dashboard-ui-hardening".
- No pending feature branches: the Stage 5 branch was merged and deleted on both
  local and remote.
- Working tree: clean at completion (`git status --short` empty).

Recent history (newest first):

- `003a6b4` Merge PR #19 (Stage 5 dashboard UI hardening)
- `8f8d961` chore(web): hide internal user id on dashboard
- `b67aace` Merge PR #17 (Stage 3 auth UI)
- `5b9c698` chore(web): sanitize auth UI text
- `900bc06` feat(web): add minimal email password auth flow
- `8c264cd` Merge PR #14 (Stage 2A contract test)
- `e2ef180` test(web): add api facade contract guard for tenant memberships

## What Phase 1F delivered

- **App integration audit (Stage 1):** confirmed the intended authenticated app
  path and that the app reads tenant context only through the `api` facade, not
  raw `core`.
- **Contract guard (Stage 2A):** an offline unit test asserting that
  `listTenantMemberships` reads through `api.my_tenant_memberships` with the exact
  projection, never touches raw `core`, never widens/filters server-side, and
  uses no service-role path.
- **Minimal email/password sign-in UI (Stage 3):** a server-component `/sign-in`
  page whose form posts directly to a Server Action (no client Supabase code on
  submit), with a generic error state and an already-authenticated redirect to
  the dashboard.
- **Sign-out action (Stage 3):** a Server Action that clears the session and
  redirects to `/sign-in`.
- **Protected dashboard flow (Stage 3):** `/dashboard` resolves tenant context
  server-side and renders the matching safe state for every outcome.
- **Manual smoke test (Stage 4):** real sign-in/sign-out against Supabase Cloud
  dev with the existing synthetic smoke users — 8/8 checks PASS.
- **Dashboard UI hardening (Stage 5):** removed the visible internal auth user
  UUID from the dashboard success UI while keeping tenant name, slug, kind, and
  membership count.

## Confirmed safe app path

```
/sign-in
  → Supabase auth (signInWithPassword, anon-key server client)
  → session cookie (set by the server client; refreshed by middleware)
  → /dashboard
  → requireUser()            (redirect to /sign-in if unauthenticated)
  → requireTenantContext()   (env check → anon client → user → memberships → active tenant)
  → listTenantMemberships()  (RLS-scoped authenticated client)
  → api.my_tenant_memberships (security-invoker view; core RLS is the boundary)
```

Each outcome (`not_authenticated`, `no_membership`, `unauthorized`,
`config_error`, `unexpected_error`, `success`) maps to a dedicated safe UI state;
only `not_authenticated` redirects to sign-in.

## Security confirmations

- No `service_role` on the app path. Sign-in/out and membership reads use only
  the request-scoped anon-key server client (`lib/supabase/server`); the
  service-role key is never imported in `apps/web`.
- Anon-key server/browser clients only; RLS remains the tenant-isolation
  boundary.
- No direct raw `core` access from app code: the membership read selects from
  `api.my_tenant_memberships` (`.schema('api').from('my_tenant_memberships')`).
- Tenant memberships are read through the `api` facade view, which is already
  self-scoped (`user_id = core.current_user_id()` AND `status = 'active'`) and
  still enforced by underlying `core` RLS.
- The RLS / self-scoped membership view remains the access boundary; the app
  neither widens nor bypasses it. A missing/over-restricted grant maps to
  `unauthorized` (fail-closed).
- No `core`, `audit`, `workforce`, `booking`, or `ai` Data API exposure changes
  were made in Phase 1F (exposed schemas stay `public, api`).
- Auth outcomes are generic: bad input and failed auth both redirect to
  `/sign-in?error=1` with a single generic message; credentials are never logged
  and raw auth errors are never surfaced (no account enumeration).
- The dashboard no longer displays the auth user UUID.

## Validation

- **Stage 2A:** offline contract tests for the membership read (api-facade
  projection guard, no raw `core`, no service-role path) pass.
- **Stage 3:** full validation passed — tests, typecheck, lint, build, and the
  filtered turbo sweep.
- **Stage 4:** manual end-to-end smoke test — 8/8 PASS (see below).
- **Stage 5:** filtered turbo sweep
  (`turbo run typecheck lint test build --filter=@line-os/web --force`) —
  **10/10 tasks successful** (24 web unit tests passed; build succeeded).

## Manual smoke result (Stage 4)

Performed manually in the browser against Supabase Cloud dev using the existing
synthetic smoke users (labels only; no passwords or UUIDs recorded):

1. Unauthenticated `/dashboard` redirects to `/sign-in` — PASS
2. `/sign-in` form is visible — PASS
3. Smoke user A signs in and sees Smoke Tenant A only — PASS
4. Sign out after user A returns to `/sign-in` — PASS
5. Smoke user B signs in and sees Smoke Tenant B only — PASS
6. No cross-tenant visibility — PASS
7. Wrong password shows a generic error only (`/sign-in?error=1`) — PASS
8. After sign out, `/dashboard` redirects to `/sign-in` — PASS

Passwords were entered only in the browser; no passwords were entered into the
terminal, chat, or any file. No user UUIDs are recorded here.

## Local dev note

- `apps/web/.env.local` was created during Phase 1F as a **local-only,
  gitignored** file so Next.js (running with `apps/web` as its project root)
  loads the required public Supabase env names. Next.js does not auto-load the
  repo-root `.env.local`, which caused the earlier missing-config state.
- It contains only the two `NEXT_PUBLIC_SUPABASE_*` public names; no
  service-role or other secrets were copied.
- Its values are intentionally **not documented**.
- The file remains untracked/ignored (the root `.gitignore` patterns `.env` /
  `.env.*` apply recursively), so it does not appear in `git status`.
- No secrets should ever be committed; this file must stay local only.

## Cloud note

- No migrations were created/edited/applied and no Supabase Cloud setting
  changes were made in Phase 1F Stage 3 or Stage 5.
- Stage 4 used the normal dev auth sign-in/sign-out flow with the **existing**
  synthetic smoke users only. This may have created/updated routine Cloud Auth
  session metadata (expected for dev smoke testing).
- No users, tenants, or memberships were created or modified during Stage 4; no
  admin/auth writes and no `service_role` were used.
- Cloud dev applied migrations remain `0000`–`0016`; Phase 1E Stage 2
  verification previously passed 23/23.

## Out of scope / not built

- Sign-up / account creation
- Password reset
- OAuth / social login
- LINE login
- Tenant switcher / multi-tenant selector UX
- Product modules (Workforce, Booking, AI, LINE, CRM, Logistics, Inventory)
- Billing
- Production deployment

## Recommended next phase

- **Option A — Phase 1G: minimal tenant selector / active-tenant UX.** Build a
  read-only tenant selector and active-tenant context on top of the existing
  facade read (no new DB surface), so multi-membership users can choose and
  persist an active tenant safely.
- **Option B — App deployment / env audit for Vercel dev/staging.** Audit and
  document a safe env-loading and deployment path (single Vercel project), still
  anon-key + RLS only, before any product work.
- **Option C — First product module foundation.** Begin a single product
  module's foundation after the tenant selector exists.

**Recommendation:** do the **tenant selector / active-tenant UX (Option A)**
before starting any product module. The dashboard already resolves an active
tenant and honors an explicit `tenantId` only when the user is a member, so a
minimal selector is the natural next increment and product modules will need a
reliable active-tenant context to build against.

## What was intentionally not done by this report

- Documentation only: no app code, tests, or migrations were modified.
- No migrations were created/edited/applied; no Cloud writes, Cloud setting
  changes, or Cloud auth/admin writes were performed.
- `.env.local` was not edited; `service_role` was not used.
- No product features were built; no legacy repo content was moved or copied.
- No secrets, DB URLs, keys, passwords, JWTs, refresh tokens, or user UUIDs are
  included here.
