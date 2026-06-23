-- ============================================================================
-- 0013  Authenticated tenant access (Phase 1D-B, Option T1)
-- ----------------------------------------------------------------------------
-- This migration opens the FIRST narrow direct-DB access surface for the
-- `authenticated` client role. Until now (ADR 0005) the client roles had no
-- table GRANTs at all, so RLS policies never engaged for browser/anon reads.
--
-- Phase 1D enables exactly two SELECT surfaces — `core.tenants` and
-- `core.tenant_memberships` — so an authenticated user can resolve their own
-- tenant context (membership -> tenant) through RLS, without the backend
-- service-role path. Nothing else is opened:
--   * No grants to `anon`.
--   * No grants to `audit`, `workforce`, `booking`, or `ai`.
--   * No broad grants to all `core` tables.
--   * No INSERT/UPDATE/DELETE grants (writes still require the existing
--     backend/service-role path; the write RLS policies stay as-is).
--
-- Option T1: regular authenticated users may read ONLY their own membership
-- rows. Co-member visibility on `core.users` is preserved through a dedicated
-- SECURITY DEFINER helper (`core.shares_tenant_with`) rather than an inline
-- subquery that would now be filtered by the tightened membership RLS.
-- Managers/admins read managed membership rows only when they hold
-- `core.member.invite` in that tenant; platform staff reach the same managed
-- path because `core.has_permission(...)` short-circuits to true for them.
--
-- RLS remains the security boundary. These GRANTs only let RLS engage; they do
-- not by themselves expose any cross-tenant data.
-- ============================================================================

-- --- Narrow grants ---------------------------------------------------------
-- Schema usage is required before any table privilege is reachable. We grant
-- it to `authenticated` only — never to `anon`.
grant usage on schema core to authenticated;

-- Exactly the two read surfaces Phase 1D needs. Column-level narrowing is not
-- required here: both tables are tenant-scoped and fully protected by RLS, and
-- the app reads non-PII columns (ids, slug, name, kind, status, location_id).
grant select on core.tenants to authenticated;
grant select on core.tenant_memberships to authenticated;

-- --- Co-member helper (SECURITY DEFINER) -----------------------------------
-- Returns true when the current user shares at least one tenant with the given
-- target user. SECURITY DEFINER so it can evaluate the membership relationship
-- regardless of the tightened RLS on core.tenant_memberships (a regular user
-- can no longer see co-members' membership rows directly). The fixed
-- search_path keeps the definer body from resolving objects via a caller-
-- controlled path.
--
-- Both sides require an ACTIVE membership: this aligns co-member visibility with
-- core.is_member_of (which also gates on status = 'active') so invited /
-- suspended / revoked memberships never count as co-membership (Phase 1D-B
-- hardening).
create or replace function core.shares_tenant_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists (
    select 1
    from core.tenant_memberships m_self
    join core.tenant_memberships m_other
      on m_other.tenant_id = m_self.tenant_id
    where m_self.user_id = core.current_user_id()
      and m_self.status = 'active'
      and m_other.user_id = p_user_id
      and m_other.status = 'active'
  );
$$;

comment on function core.shares_tenant_with(uuid) is
  'True when the current user shares any ACTIVE tenant membership with the '
  'target user. SECURITY DEFINER: evaluates membership independently of the '
  'tightened core.tenant_memberships RLS so co-member visibility (Option T1) is '
  'preserved. Only active memberships count (aligns with core.is_member_of).';

-- Explicit EXECUTE control: a SECURITY DEFINER helper should never rely on the
-- implicit PUBLIC EXECUTE grant. Revoke it from PUBLIC and grant only to the
-- authenticated client role. anon is never granted execute / RPC exposure.
revoke all on function core.shares_tenant_with(uuid) from public;
grant execute on function core.shares_tenant_with(uuid) to authenticated;

-- --- Tighten tenant_memberships SELECT (Option T1) -------------------------
-- Previously a single `memberships_select` exposed every membership row of any
-- tenant the user belonged to. Split it into:
--   * self   : a user sees ONLY their own membership rows (strictly own rows).
--   * managed: only holders of core.member.invite in that tenant (managers /
--              admins / owners; platform staff via has_permission short-circuit).
-- Multiple permissive policies are OR'd, so a manager sees self + managed rows.
--
-- self is deliberately self-only: it does NOT include core.is_platform_staff().
-- Platform staff already read every tenant's rows through memberships_select_managed
-- because core.has_permission(...) short-circuits to true for platform staff, so
-- a platform-staff branch in self would be redundant and make the policy name
-- misleading (Phase 1D-B hardening).
drop policy if exists memberships_select on core.tenant_memberships;

create policy memberships_select_self on core.tenant_memberships
  for select using (user_id = core.current_user_id());

create policy memberships_select_managed on core.tenant_memberships
  for select using (core.has_permission(tenant_id, 'core.member.invite'));

-- --- Co-member user visibility now routes through the helper ---------------
-- The old inline subquery would be filtered by the tightened membership RLS
-- above (the caller can no longer see co-members' membership rows), breaking
-- co-member visibility. Route it through the SECURITY DEFINER helper instead.
drop policy if exists users_co_member_select on core.users;
create policy users_co_member_select on core.users
  for select using (core.shares_tenant_with(core.users.id));
