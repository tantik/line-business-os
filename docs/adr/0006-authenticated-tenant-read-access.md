# ADR 0006: First narrow authenticated DB read access (Phase 1D, Option T1)

- Status: Accepted
- Date: 2026-06-23
- Extends: ADR 0005 (data access model), ADR 0002 (multi-tenant RLS)

## Context

ADR 0005 recorded a deliberate **no-grants posture**: the migrations enable and
force RLS but add **no** `GRANT`s to the `anon` / `authenticated` roles, so
direct browser-to-Postgres access was unreachable (RLS only filters rows a role
is *otherwise* allowed to touch). ADR 0005 also set the bar for changing that:
enabling direct browser access requires, per table, a narrow justified `GRANT`,
RLS reviewed for that access shape, and RLS tests proving tenant isolation.

Phase 1D is the first deliberate, review-gated step that clears that bar. The
app-layer foundation from Phase 1C (`apps/web/src/lib/tenant/`) already resolves
tenant context from membership through the RLS-scoped authenticated client, but
it currently fails closed (`unauthorized`) because no grant exists. To light up
that path we need exactly two read surfaces: a user's own membership rows and
the tenant they belong to.

Tightening membership visibility created one wrinkle. The previous
`users_co_member_select` policy used an inline subquery over
`core.tenant_memberships` to let co-members in a shared tenant see each other.
Once regular users can no longer read co-members' membership rows, that inline
subquery (evaluated under the caller's RLS) stops finding co-member rows and
co-member visibility breaks. We considered:

- **Option T1** — keep co-member visibility via a dedicated `SECURITY DEFINER`
  helper, and split membership SELECT into self-only + permission-gated managed.
- Option T2 — drop co-member visibility entirely (simpler, but a behavioral
  regression for any future "see my teammates" feature).
- Option T3 — grant authenticated SELECT on `core.users` too and rely on RLS
  (widens the surface and exposes PII columns; rejected for Phase 1D scope).

## Decision

Adopt **Option T1**, implemented in
`supabase/migrations/0013_authenticated_tenant_access.sql`:

1. **Narrow grants only.** `GRANT USAGE ON SCHEMA core TO authenticated` and
   `GRANT SELECT` on **only** `core.tenants` and `core.tenant_memberships`.
   Nothing is granted to `anon`; nothing is granted on `audit`, `workforce`,
   `booking`, or `ai`; no broad grant on all `core` tables; no write grants.

2. **Membership reads are own-only for regular users.** Replace the single
   `memberships_select` policy with:
   - `memberships_select_self` — **strictly own rows only**:
     `user_id = core.current_user_id()`. It intentionally has **no**
     `core.is_platform_staff()` branch.
   - `memberships_select_managed` — holders of `core.member.invite` in a tenant
     (managers / admins / owners) see that tenant's rows; **platform staff reach
     this same path** because `core.has_permission(...)` short-circuits to true
     for them. Putting platform staff here (not in `self`) keeps the `self`
     policy name honest and removes a redundant branch.
   Permissive policies are OR'd, so a manager sees self + managed rows.

3. **Co-member `core.users` visibility is preserved via a helper.** Add
   `core.shares_tenant_with(p_user_id uuid)` — `language sql stable security
   definer` with a fixed `search_path` — and rewrite `users_co_member_select`
   to use it. The helper evaluates the shared-tenant relationship independently
   of the tightened membership RLS. Both sides of the relationship must be
   **active** memberships (`status = 'active'`), aligning co-member visibility
   with `core.is_member_of` so invited / suspended / revoked memberships never
   count as co-membership. The helper does not rely on the implicit PUBLIC
   EXECUTE grant: EXECUTE is **revoked from `public` and granted only to
   `authenticated`** (never `anon`). `core.users` itself is **not** granted to
   `authenticated` in Phase 1D, so this preserves the policy logic for the day a
   `core.users` read surface is opened, without exposing PII now.

4. **RLS remains the security boundary.** The grants only let RLS engage. Tenant
   isolation, manager gating, and platform-staff handling all stay in the
   database via `core.is_member_of`, `core.has_permission`, and the policies
   above.

## Consequences

- The Phase 1C membership lookup (`listTenantMemberships`) can now succeed for a
  real authenticated session instead of always mapping to `unauthorized`.
- Writes stay blocked for client roles: no INSERT/UPDATE/DELETE grant exists, so
  mutations still go through the backend service-role path (ADR 0005 §2–3).
- The surface is auditable and minimal: pgTAP tests
  (`supabase/tests/0002_security_rls.sql`, `0003_authenticated_access.sql`)
  assert the exact grant set, own-only membership reads (self policy carries no
  platform-staff branch), platform-staff access flowing through the managed
  policy, manager-gated managed reads, cross-tenant denial, `shares_tenant_with`
  behavior including active-only co-membership (false for invited / suspended /
  revoked on either side), the helper's EXECUTE privileges (no PUBLIC, granted
  to `authenticated`, denied to `anon`), anon/no-JWT denial, and that writes
  remain blocked.
- **Cloud apply is out of scope here.** This migration is validated locally only
  (`supabase db reset` + `supabase test db`). Applying it to any Supabase Cloud
  project requires separate, explicit approval (ADR 0005, `docs/phase-1-core-db.md`).
- Opening any further surface (more tables, columns, `core.users`, writes)
  remains a new, separately reviewed change subject to the ADR 0005 bar.
