# Phase 1D — DB access hardening: first narrow authenticated read surface

This document covers **Phase 1D (Option T1)**: the first deliberate,
review-gated step that opens a **narrow** direct-database read surface for the
`authenticated` role, while keeping RLS as the security boundary. Read
`docs/phase-1-core-db.md` (Phase 1A) and ADR 0005 / ADR 0006 first.

> ✅ **Status: Phase 1D — implemented locally.** Migration `0013` adds two
> SELECT grants + a SECURITY DEFINER helper and tightens membership visibility.
> Validated against the **local** Supabase stack only. **No Supabase Cloud apply
> is done in this phase without explicit approval.** No product features, no
> secrets, no edits to migrations `0000`–`0012`.

## Why

ADR 0005 left direct browser/DB access intentionally closed: RLS was enabled and
policies existed, but **no table GRANTs** were issued to `anon` / `authenticated`,
so RLS never engaged for a client connection. The Phase 1C app foundation
(`apps/web/src/lib/tenant/`) already resolves tenant context from membership
through the RLS-scoped authenticated client — but with no grant it always fails
closed (`unauthorized`).

Phase 1D lights up exactly that path with the **smallest possible** surface.

## What Phase 1D enables

Phase 1D enables the **first narrow authenticated DB access surface** and nothing
more:

- Only `core.tenants` and `core.tenant_memberships` get **authenticated SELECT**.
- `authenticated` also gets `USAGE` on schema `core` (required to reach them).
- **No anon access** at all (no schema usage, no table grants).
- **RLS remains the security boundary** — the grants only let RLS engage.
- **Membership rows are own-only for regular users** (`memberships_select_self`).
- **Manager membership read is permission-gated** via `core.member.invite`
  (`memberships_select_managed`).
- **Co-member `core.users` visibility is preserved** through the Option T1
  helper `core.shares_tenant_with(...)` — without granting `core.users` to
  `authenticated`.
- **Cloud apply is NOT done in this phase** without explicit approval.

## Option T1 in detail

Migration `supabase/migrations/0013_authenticated_tenant_access.sql`:

### 1. Narrow grants

```sql
grant usage on schema core to authenticated;
grant select on core.tenants to authenticated;
grant select on core.tenant_memberships to authenticated;
```

No grants to `anon`. No grants on `audit` / `workforce` / `booking` / `ai`. No
broad grant on all `core` tables. No INSERT/UPDATE/DELETE grants — **writes stay
on the backend service-role path** (ADR 0005).

### 2. Tightened membership SELECT (own-only + permission-gated)

The single `memberships_select` (which exposed every row of any tenant you
belonged to) is replaced by two permissive policies (OR'd together):

- `memberships_select_self` — `user_id = core.current_user_id()`: strictly own
  rows only. No platform-staff branch.
- `memberships_select_managed` — `core.has_permission(tenant_id,
  'core.member.invite')`: managers / admins / owners read the membership rows of
  tenants they manage. **Platform staff reach this path too** because
  `core.has_permission(...)` short-circuits to true for them — so platform-staff
  access is the managed permission path, not the self policy.

### 3. Co-member visibility helper (SECURITY DEFINER)

```sql
create or replace function core.shares_tenant_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = core, public
as $$ ... $$;

revoke all on function core.shares_tenant_with(uuid) from public;
grant execute on function core.shares_tenant_with(uuid) to authenticated;
```

`users_co_member_select` is rewritten to call `core.shares_tenant_with(core.users.id)`.
Because regular users can no longer read co-members' membership rows directly,
the old inline subquery would break co-member visibility; the SECURITY DEFINER
helper evaluates the shared-tenant relationship independently of that RLS. The
fixed `search_path` keeps the definer body from resolving objects via a
caller-controlled path.

**Active-only co-membership (Phase 1D-B):** both sides of the relationship must
be `status = 'active'`, matching `core.is_member_of`. Invited / suspended /
revoked memberships never count as co-membership.

**Explicit EXECUTE privileges (Phase 1D-B):** the helper does not rely on the
implicit PUBLIC EXECUTE grant. EXECUTE is revoked from `public` and granted only
to `authenticated` — never to `anon`.

**Note:** Phase 1D does not grant `authenticated` SELECT on `core.users`, so this
keeps the policy correct for a future `core.users` read surface without exposing
PII now.

## Tests

Run locally (Docker required):

```bash
pnpm exec supabase db reset
pnpm exec supabase test db
```

- `supabase/tests/0002_security_rls.sql` — updated grant invariants: `anon` has
  no business grants and no `core` USAGE; `authenticated` has exactly `USAGE` on
  `core` + `SELECT` on `core.tenants` and `core.tenant_memberships` and **nothing
  else** on the business schemas; RLS still enabled on every business table.
- `supabase/tests/0003_authenticated_access.sql` — behavioral tests:
  own-membership read, own-tenant read, cross-tenant denial, co-member row
  denial for regular users, self policy strictly self-only (no platform-staff
  branch) with platform-staff access proven through the managed policy,
  manager/admin managed-tenant reads (via the seeded `tenant_admin` role holding
  `core.member.invite`), `core.shares_tenant_with` true/false including
  active-only co-membership (false when either side is invited / suspended /
  revoked), helper EXECUTE privileges (no PUBLIC, granted to `authenticated`,
  denied to `anon`), anon + no-JWT denial, and writes blocked at the grant level.

The behavioral tests hop into the `authenticated` role inside SECURITY INVOKER
helper functions (the role hop reverts on return) so RLS is exercised while every
pgTAP assertion still runs as the superuser.

## Safety / scope guardrails

- ❌ No grants to `anon`.
- ❌ No broad grants to all `core` tables; nothing on `audit`/`workforce`/`booking`/`ai`.
- ❌ No service-role usage; RLS is not disabled; no product features.
- ❌ No edits to migrations `0000`–`0012`; forward-only migration `0013`.
- ❌ No `supabase db push` / `db pull` / `db reset --linked` / `migration repair`.
- ✅ Local-only validation; Cloud apply requires explicit approval (ADR 0005/0006,
  `docs/phase-1-core-db.md` §3).
