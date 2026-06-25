-- ============================================================================
-- DB test: Phase 1D authenticated tenant access (Option T1)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the narrow direct-DB read surface opened by migration
-- 0013_authenticated_tenant_access.sql behaves as intended under RLS:
--   * an authenticated user reads only their own membership row + own tenant;
--   * they cannot read another tenant's data or co-members' membership rows;
--   * a manager/admin holding core.member.invite reads managed memberships;
--   * co-member core.users visibility is preserved via core.shares_tenant_with
--     (we do NOT grant authenticated SELECT on core.users, so we exercise the
--     SECURITY DEFINER helper that backs the RLS policy, not a live users read);
--   * anon / no-JWT remain denied; writes remain blocked at the grant level.
--
-- pgTAP runs as the superuser test role. To exercise RLS we hop into the
-- `authenticated` role inside SECURITY INVOKER helper functions: SET ROLE there
-- reverts automatically when the helper returns, so every pgTAP assertion call
-- itself still runs as the superuser (pgTAP bookkeeping needs that). The helpers
-- emit no result rows, keeping TAP output clean.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai;

select no_plan();

-- --- Helpers: run a query AS the authenticated role for a given JWT sub -----
-- The role hop is contained inside the function and reverts on return.
--
-- Each helper resets ALL THREE identity GUCs before setting the one it exercises
-- so the resolution order in core.current_user_id() (JSON claims -> legacy
-- flattened claim -> app.current_user_id) is tested in isolation and a value
-- left over from a previous case can never cause a false positive.

-- Legacy flattened-GUC path: identity comes from request.jwt.claim.sub.
create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into n;
  return n;
end;
$$;

create function pg_temp.as_auth_bool(p_sub text, p_sql text)
returns boolean
language plpgsql
as $$
declare b boolean;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into b;
  return b;
end;
$$;

create function pg_temp.as_auth_text(p_sub text, p_sql text)
returns text
language plpgsql
as $$
declare s text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into s;
  return s;
end;
$$;

-- Cloud-style JSON-claims path: identity comes from the request.jwt.claims JSON
-- GUC's `sub` field (this is what Supabase Cloud PostgREST actually sets).
create function pg_temp.as_auth_count_claims(p_sub text, p_sql text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', coalesce(p_sub, ''))::text, true);
  set local role authenticated;
  execute p_sql into n;
  return n;
end;
$$;

create function pg_temp.as_auth_text_claims(p_sub text, p_sql text)
returns text
language plpgsql
as $$
declare s text;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', coalesce(p_sub, ''))::text, true);
  set local role authenticated;
  execute p_sql into s;
  return s;
end;
$$;

-- Backend/service fallback path: identity comes from app.current_user_id.
create function pg_temp.as_auth_count_app(p_uid text, p_sql text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', coalesce(p_uid, ''), true);
  set local role authenticated;
  execute p_sql into n;
  return n;
end;
$$;

create function pg_temp.as_auth_text_app(p_uid text, p_sql text)
returns text
language plpgsql
as $$
declare s text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', coalesce(p_uid, ''), true);
  set local role authenticated;
  execute p_sql into s;
  return s;
end;
$$;

-- --- Fixtures (inserted as superuser; bypasses RLS) ------------------------
-- Two tenants; four users. Alice + Bob are regular members of tenant A; Carol
-- is a member of tenant B; Admin is a member of tenant A holding the system
-- tenant_admin role (which includes core.member.invite via the 0008 seed).
insert into core.tenants (id, slug, name) values
  ('a1111111-1111-1111-1111-111111111111', 'pgtap-1d-tenant-a', 'pgTAP 1D Tenant A'),
  ('b2222222-2222-2222-2222-222222222222', 'pgtap-1d-tenant-b', 'pgTAP 1D Tenant B');

insert into core.users (id, display_name) values
  ('0a0a0a0a-0000-0000-0000-000000000001', 'Alice (member A)'),
  ('0a0a0a0a-0000-0000-0000-000000000002', 'Bob (co-member A)'),
  ('0b0b0b0b-0000-0000-0000-000000000003', 'Carol (member B)'),
  ('0a0a0a0a-0000-0000-0000-000000000009', 'Admin (member A, can invite)');

insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a1111111-1111-1111-1111-111111111111', '0a0a0a0a-0000-0000-0000-000000000001', 'active'),
  ('a1111111-1111-1111-1111-111111111111', '0a0a0a0a-0000-0000-0000-000000000002', 'active'),
  ('b2222222-2222-2222-2222-222222222222', '0b0b0b0b-0000-0000-0000-000000000003', 'active'),
  ('a1111111-1111-1111-1111-111111111111', '0a0a0a0a-0000-0000-0000-000000000009', 'active');

-- Admin holds the system tenant_admin role (id ...004) in tenant A. Tenant
-- Admin is seeded (0008) with every permission except core.billing.manage, so
-- it includes core.member.invite — exactly the manage gate Option T1 uses.
insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('a1111111-1111-1111-1111-111111111111',
   '0a0a0a0a-0000-0000-0000-000000000009',
   '00000000-0000-0000-0000-000000000004');

-- Dan is platform staff with NO membership anywhere. Used to prove that platform
-- staff reach membership rows through memberships_select_managed (has_permission
-- short-circuit), not through the self policy.
insert into core.users (id, display_name, is_platform_staff) values
  ('0d0d0d0d-0000-0000-0000-000000000004', 'Dan (platform staff)', true);

-- Tenant C: self users in each membership status + partner users in each status,
-- to prove core.shares_tenant_with requires BOTH sides to be active.
insert into core.tenants (id, slug, name) values
  ('c3333333-3333-3333-3333-333333333333', 'pgtap-1d-tenant-c', 'pgTAP 1D Tenant C');

insert into core.users (id, display_name) values
  ('c0000000-0000-0000-0000-0000000000a1', 'Self active (C)'),
  ('c0000000-0000-0000-0000-0000000000a2', 'Self invited (C)'),
  ('c0000000-0000-0000-0000-0000000000a3', 'Self suspended (C)'),
  ('c0000000-0000-0000-0000-0000000000a4', 'Self revoked (C)'),
  ('c0000000-0000-0000-0000-0000000000b5', 'Partner active (C)'),
  ('c0000000-0000-0000-0000-0000000000b6', 'Partner invited (C)'),
  ('c0000000-0000-0000-0000-0000000000b7', 'Partner suspended (C)'),
  ('c0000000-0000-0000-0000-0000000000b8', 'Partner revoked (C)');

insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('c3333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-0000000000a1', 'active'),
  ('c3333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-0000000000a2', 'invited'),
  ('c3333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-0000000000a3', 'suspended'),
  ('c3333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-0000000000a4', 'revoked'),
  ('c3333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-0000000000b5', 'active'),
  ('c3333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-0000000000b6', 'invited'),
  ('c3333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-0000000000b7', 'suspended'),
  ('c3333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-0000000000b8', 'revoked');

-- --- A regular authenticated user: own membership + own tenant only --------
select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000001',
    'select count(*)::int from core.tenant_memberships'),
  1,
  'authenticated user reads exactly their own membership row'
);

select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select count(*)::int from core.tenant_memberships
          where user_id = '0a0a0a0a-0000-0000-0000-000000000001' $q$),
  1,
  'authenticated user can read their own active membership row'
);

select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select count(*)::int from core.tenants
          where id = 'a1111111-1111-1111-1111-111111111111' $q$),
  1,
  'authenticated user can read the tenant row for their own tenant'
);

-- --- Identity resolution: core.current_user_id() resolution order ----------
-- Regression guard for Phase 1E Stage 2 (migration 0016). core.current_user_id()
-- must resolve identity from, in priority order: the Cloud-style JSON GUC
-- request.jwt.claims->>'sub', then the legacy flattened request.jwt.claim.sub,
-- then the backend app.current_user_id. Each helper clears the other two GUCs so
-- exactly one path is exercised at a time and no leftover value can mask a bug.

-- (1) JSON claims path — this is the path that was failing on Supabase Cloud.
select is(
  pg_temp.as_auth_text_claims('0a0a0a0a-0000-0000-0000-000000000001',
    'select core.current_user_id()::text'),
  '0a0a0a0a-0000-0000-0000-000000000001',
  'JSON claims: core.current_user_id() resolves sub from request.jwt.claims'
);
select is(
  pg_temp.as_auth_count_claims('0a0a0a0a-0000-0000-0000-000000000001',
    'select count(*)::int from core.tenant_memberships'),
  1,
  'JSON claims: authenticated user reads exactly their own membership row'
);
select is(
  pg_temp.as_auth_count_claims('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select count(*)::int from core.tenants
          where id = 'a1111111-1111-1111-1111-111111111111' $q$),
  1,
  'JSON claims: authenticated user reads the tenant row for their own tenant'
);
-- isolation must still hold when identity comes from the JSON claims GUC
select is(
  pg_temp.as_auth_count_claims('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select count(*)::int from core.tenant_memberships
          where tenant_id = 'b2222222-2222-2222-2222-222222222222' $q$),
  0,
  'JSON claims: cross-tenant isolation still denies another tenant''s rows'
);
-- fail-closed: an empty sub in JSON claims resolves to NULL identity, no rows
select is(
  pg_temp.as_auth_count_claims('',
    'select count(*)::int from core.tenant_memberships'),
  0,
  'JSON claims: empty sub resolves to NULL identity and sees no rows'
);

-- (2) Legacy flattened claim path — must keep working unchanged.
select is(
  pg_temp.as_auth_text('0a0a0a0a-0000-0000-0000-000000000001',
    'select core.current_user_id()::text'),
  '0a0a0a0a-0000-0000-0000-000000000001',
  'legacy claim.sub: core.current_user_id() resolves sub from request.jwt.claim.sub'
);

-- (3) Backend app.current_user_id fallback — must keep working unchanged.
select is(
  pg_temp.as_auth_text_app('0a0a0a0a-0000-0000-0000-000000000001',
    'select core.current_user_id()::text'),
  '0a0a0a0a-0000-0000-0000-000000000001',
  'app fallback: core.current_user_id() resolves the backend-set app.current_user_id'
);
select is(
  pg_temp.as_auth_count_app('0a0a0a0a-0000-0000-0000-000000000001',
    'select count(*)::int from core.tenant_memberships'),
  1,
  'app fallback: authenticated user reads exactly their own membership row'
);

-- --- Cross-tenant isolation -------------------------------------------------
select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select count(*)::int from core.tenant_memberships
          where tenant_id = 'b2222222-2222-2222-2222-222222222222' $q$),
  0,
  'authenticated user cannot read another tenant''s membership rows'
);

select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select count(*)::int from core.tenants
          where id = 'b2222222-2222-2222-2222-222222222222' $q$),
  0,
  'authenticated user cannot read another tenant''s tenant row'
);

-- --- Co-member membership rows are NOT visible to a regular user -----------
select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select count(*)::int from core.tenant_memberships
          where user_id = '0a0a0a0a-0000-0000-0000-000000000002' $q$),
  0,
  'regular authenticated user cannot read a co-member''s membership row'
);

-- --- memberships_select_self is strictly self-only -------------------------
-- A regular user sees exactly one row (their own); the self policy must not leak
-- any co-member row even within the same tenant.
select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000002',
    'select count(*)::int from core.tenant_memberships'),
  1,
  'memberships_select_self: Bob (no manage perm) sees only his own row'
);

-- --- Platform staff reach rows via the managed path, not the self policy ---
-- Dan is platform staff with NO membership row anywhere (seeded above). Under
-- the hardened self policy (user_id = current_user_id() only) he has zero self
-- rows, yet he still reads every tenant's memberships because has_permission(...)
-- short-circuits for platform staff (memberships_select_managed).
select is(
  pg_temp.as_auth_count('0d0d0d0d-0000-0000-0000-000000000004',
    $q$ select count(*)::int from core.tenant_memberships
          where user_id = '0d0d0d0d-0000-0000-0000-000000000004' $q$),
  0,
  'platform staff has no self membership row (self policy adds nothing)'
);

select is(
  pg_temp.as_auth_count('0d0d0d0d-0000-0000-0000-000000000004',
    'select count(*)::int from core.tenant_memberships'),
  12,
  'platform staff reads all memberships via managed policy, not the self policy'
);

-- --- Manager/admin with core.member.invite reads managed memberships -------
select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000009',
    $q$ select count(*)::int from core.tenant_memberships
          where tenant_id = 'a1111111-1111-1111-1111-111111111111' $q$),
  3,
  'admin with core.member.invite reads all membership rows in the managed tenant'
);

select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000009',
    $q$ select count(*)::int from core.tenant_memberships
          where tenant_id = 'b2222222-2222-2222-2222-222222222222' $q$),
  0,
  'admin cannot read membership rows of a tenant they do not manage'
);

-- --- core.users co-member visibility via core.shares_tenant_with -----------
-- Phase 1D does NOT grant authenticated SELECT on core.users, so we verify the
-- SECURITY DEFINER helper that backs the users_co_member_select policy.
select ok(
  pg_temp.as_auth_bool('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select core.shares_tenant_with('0a0a0a0a-0000-0000-0000-000000000002'::uuid) $q$),
  'shares_tenant_with: co-members in the same tenant resolve to true'
);

select ok(
  not pg_temp.as_auth_bool('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select core.shares_tenant_with('0b0b0b0b-0000-0000-0000-000000000003'::uuid) $q$),
  'shares_tenant_with: users in different tenants resolve to false'
);

-- --- shares_tenant_with active-membership hardening (Phase 1D-B) -----------
-- Co-membership must require BOTH sides to be active. Tenant C (seeded above)
-- has self users in each status and partner users in each status; only the
-- active<->active pair resolves to true.

-- Baseline: two ACTIVE co-members resolve to true.
select ok(
  pg_temp.as_auth_bool('c0000000-0000-0000-0000-0000000000a1',
    $q$ select core.shares_tenant_with('c0000000-0000-0000-0000-0000000000b5'::uuid) $q$),
  'shares_tenant_with: active self + active co-member resolves to true'
);

-- Self side not active -> false (invited / suspended / revoked).
select ok(
  not pg_temp.as_auth_bool('c0000000-0000-0000-0000-0000000000a2',
    $q$ select core.shares_tenant_with('c0000000-0000-0000-0000-0000000000b5'::uuid) $q$),
  'shares_tenant_with: invited self membership does not count as co-membership'
);
select ok(
  not pg_temp.as_auth_bool('c0000000-0000-0000-0000-0000000000a3',
    $q$ select core.shares_tenant_with('c0000000-0000-0000-0000-0000000000b5'::uuid) $q$),
  'shares_tenant_with: suspended self membership does not count as co-membership'
);
select ok(
  not pg_temp.as_auth_bool('c0000000-0000-0000-0000-0000000000a4',
    $q$ select core.shares_tenant_with('c0000000-0000-0000-0000-0000000000b5'::uuid) $q$),
  'shares_tenant_with: revoked self membership does not count as co-membership'
);

-- Other side not active -> false (invited / suspended / revoked).
select ok(
  not pg_temp.as_auth_bool('c0000000-0000-0000-0000-0000000000a1',
    $q$ select core.shares_tenant_with('c0000000-0000-0000-0000-0000000000b6'::uuid) $q$),
  'shares_tenant_with: invited other membership does not count as co-membership'
);
select ok(
  not pg_temp.as_auth_bool('c0000000-0000-0000-0000-0000000000a1',
    $q$ select core.shares_tenant_with('c0000000-0000-0000-0000-0000000000b7'::uuid) $q$),
  'shares_tenant_with: suspended other membership does not count as co-membership'
);
select ok(
  not pg_temp.as_auth_bool('c0000000-0000-0000-0000-0000000000a1',
    $q$ select core.shares_tenant_with('c0000000-0000-0000-0000-0000000000b8'::uuid) $q$),
  'shares_tenant_with: revoked other membership does not count as co-membership'
);

-- --- shares_tenant_with EXECUTE privileges (Phase 1D-B) --------------------
-- The SECURITY DEFINER helper must not rely on the implicit PUBLIC EXECUTE; it
-- is revoked from PUBLIC and granted only to authenticated (never anon).
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) acl
    where n.nspname = 'core'
      and p.proname = 'shares_tenant_with'
      and acl.grantee = 0  -- 0 == PUBLIC
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no EXECUTE on core.shares_tenant_with(uuid)'
);

select ok(
  not has_function_privilege('anon', 'core.shares_tenant_with(uuid)', 'EXECUTE'),
  'anon cannot EXECUTE core.shares_tenant_with(uuid)'
);

select ok(
  has_function_privilege('authenticated', 'core.shares_tenant_with(uuid)', 'EXECUTE'),
  'authenticated can EXECUTE core.shares_tenant_with(uuid)'
);

-- --- No JWT (authenticated, empty sub) sees nothing ------------------------
select is(
  pg_temp.as_auth_count('',
    'select count(*)::int from core.tenant_memberships'),
  0,
  'authenticated with no JWT sub sees no membership rows'
);

select is(
  pg_temp.as_auth_count('',
    'select count(*)::int from core.tenants'),
  0,
  'authenticated with no JWT sub sees no tenant rows'
);

-- --- anon remains fully denied ---------------------------------------------
select ok(
  not has_schema_privilege('anon', 'core', 'USAGE'),
  'anon has no USAGE on schema core'
);
select ok(
  not has_table_privilege('anon', 'core.tenant_memberships', 'SELECT'),
  'anon cannot SELECT core.tenant_memberships'
);
select ok(
  not has_table_privilege('anon', 'core.tenants', 'SELECT'),
  'anon cannot SELECT core.tenants'
);

-- --- Writes remain blocked at the grant level for authenticated ------------
select ok(
  not has_table_privilege('authenticated', 'core.tenant_memberships', 'INSERT'),
  'authenticated cannot INSERT core.tenant_memberships'
);
select ok(
  not has_table_privilege('authenticated', 'core.tenant_memberships', 'UPDATE'),
  'authenticated cannot UPDATE core.tenant_memberships'
);
select ok(
  not has_table_privilege('authenticated', 'core.tenant_memberships', 'DELETE'),
  'authenticated cannot DELETE core.tenant_memberships'
);
select ok(
  not has_table_privilege('authenticated', 'core.tenants', 'INSERT'),
  'authenticated cannot INSERT core.tenants'
);
select ok(
  not has_table_privilege('authenticated', 'core.tenants', 'UPDATE'),
  'authenticated cannot UPDATE core.tenants'
);
select ok(
  not has_table_privilege('authenticated', 'core.tenants', 'DELETE'),
  'authenticated cannot DELETE core.tenants'
);

-- --- Structural: helper + Option T1 policies are in place ------------------
select has_function(
  'core', 'shares_tenant_with', array['uuid'],
  'core.shares_tenant_with(uuid) exists'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'core' and tablename = 'tenant_memberships'
      and policyname = 'memberships_select'),
  0,
  'legacy memberships_select policy was replaced'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'core' and tablename = 'tenant_memberships'
      and policyname = 'memberships_select_self'),
  1,
  'memberships_select_self policy exists'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'core' and tablename = 'tenant_memberships'
      and policyname = 'memberships_select_self'
      and qual like '%is_platform_staff%'),
  0,
  'memberships_select_self is self-only (no is_platform_staff branch)'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'core' and tablename = 'tenant_memberships'
      and policyname = 'memberships_select_managed'),
  1,
  'memberships_select_managed policy exists'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'core' and tablename = 'users'
      and policyname = 'users_co_member_select'
      and qual like '%shares_tenant_with%'),
  1,
  'users_co_member_select routes through core.shares_tenant_with'
);

select * from finish();
rollback;
