# ADR 0005: Data access model (browser anon vs backend service-role)

- Status: Accepted (extended by ADR 0006)
- Date: 2026-06-22

> **Update (Phase 1D):** the "No broad grants" posture (§5) below has been
> *narrowly* opened by **ADR 0006**: `authenticated` now has `USAGE` on schema
> `core` and `SELECT` on **only** `core.tenants` and `core.tenant_memberships`,
> with RLS still enforcing isolation. `anon` still gets nothing and no other
> table/schema is opened. The per-table bar in *Consequences* still governs any
> further surface. See `docs/adr/0006-authenticated-tenant-read-access.md`.

## Context

The scaffold ships two ways to reach Supabase/Postgres:

- `apps/web` creates a **browser client with the anon key** (`createBrowserClient`)
  and relies on RLS.
- `apps/api` / `apps/worker` use a **service-role client** (`createServiceClient`)
  that bypasses RLS, after deriving `tenant_id` from membership.

A review found an ambiguity: the migrations enable and force RLS and define
policies, but they do **not** add `GRANT`s to the `anon` / `authenticated` roles
on the `core` (or other) schemas and tables. In PostgreSQL, RLS policies only
filter rows a role is *otherwise allowed* to touch — without table/column
`GRANT`s the client roles have no privileges at all. So today direct
browser-to-Postgres data access is effectively **unreachable and untested**.

Rather than overbuild a full client data-access layer now, we record the
intended model so future work is deliberate and review-gated.

## Decision

1. **Zero-client-cost posture.** One Supabase project / one Postgres database
   backs every tenant (see ADR 0002). We do not provision per-tenant infra.

2. **Two clients, one database.**
   - The browser may use the **anon key only** for safe public/auth flows
     (sign-in, reading explicitly public data once such tables + grants exist).
     The browser receives only `NEXT_PUBLIC_*` values.
   - **Sensitive business mutations go through the backend** (`apps/api` /
     `apps/worker`), which derives `tenant_id` from the authenticated user's
     membership (`resolveTenantContext`) and never from the request body.

3. **`service_role` is server-only.** It bypasses RLS and must never be bundled
   into `apps/web`. This is enforced by the `serverEnv()` accessor boundary, the
   ESLint guardrail (`no-restricted-syntax` on `process.env.SUPABASE_SERVICE_ROLE_KEY`,
   plus an `apps/web` ban on importing `createServiceClient`), and review.

4. **RLS is mandatory defense-in-depth — even on backend paths.** Although the
   service-role client bypasses RLS, every table still ships RLS policies so that
   any future direct (anon/authenticated) access is safe by construction, and so
   a mistakenly under-privileged backend path fails closed rather than leaking.

5. **No broad grants.** We deliberately do **not** add wide
   `GRANT ... TO anon, authenticated` statements in this scaffold. Direct
   browser DB access stays disabled until a specific feature needs it.

## Consequences

- For now, treat the browser anon client as wired but **not** a general data
  path; route real reads/writes through the backend API.
- **Enabling direct browser access in the future requires, per table/column:**
  1. a narrow, justified `GRANT` (prefer column-level) to `anon`/`authenticated`;
  2. RLS policies reviewed specifically for that access shape; and
  3. RLS tests proving tenant isolation (a member of tenant A cannot read/write
     tenant B) before the grant merges.
- Privilege escalation guard: `is_platform_staff` is not self-mutable (a tenant
  user cannot promote themselves to platform staff). Enforced by the trigger in
  `supabase/migrations/0012_protect_platform_staff.sql`. See ADR 0002 and
  `docs/security/security-requirements.md`.
