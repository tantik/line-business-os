-- ============================================================================
-- DB test: core helper EXECUTE posture (Phase 1E-1, migration 0014)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves migration 0014 removed the implicit PUBLIC EXECUTE from every core
-- helper and granted EXECUTE explicitly and minimally:
--   * PUBLIC has EXECUTE on NONE of the core helpers.
--   * anon cannot EXECUTE any core helper (it also has no core schema USAGE).
--   * authenticated CAN EXECUTE the five RLS / app-facing helpers.
--   * authenticated CANNOT EXECUTE the two trigger helpers.
--
-- This is a pure privilege/posture test; behavior is covered by 0003. pgTAP
-- runs as the superuser test role; the assertions below inspect catalog ACLs
-- and use has_function_privilege(role, ...), so no role hop is required.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai;

select no_plan();

-- --- 1. PUBLIC has no EXECUTE on ANY core helper ---------------------------
-- proacl is inspected directly: grantee 0 == PUBLIC. After 0014 the only
-- grantees on these functions are the owner and (for five of them)
-- authenticated. A non-empty result here means an implicit/explicit PUBLIC
-- EXECUTE leaked back in.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(p.proacl) acl
    where n.nspname = 'core'
      and p.proname in (
        'current_user_id', 'is_platform_staff', 'is_member_of',
        'has_permission', 'shares_tenant_with', 'set_updated_at',
        'enforce_platform_staff_immutable'
      )
      and acl.grantee = 0               -- 0 == PUBLIC
      and acl.privilege_type = 'EXECUTE'),
  0,
  'PUBLIC has no EXECUTE on any core helper function'
);

-- Guard against the NULL-acl trap: a NULL proacl means *default* privileges,
-- which INCLUDE the implicit PUBLIC EXECUTE. After 0014 every core helper must
-- have an explicit (non-null) ACL, proving the implicit grant was overridden.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core'
      and p.proname in (
        'current_user_id', 'is_platform_staff', 'is_member_of',
        'has_permission', 'shares_tenant_with', 'set_updated_at',
        'enforce_platform_staff_immutable'
      )
      and p.proacl is null),
  0,
  'every core helper has an explicit ACL (no implicit PUBLIC default remains)'
);

-- --- 2. anon cannot EXECUTE any core helper --------------------------------
select ok(not has_function_privilege('anon', 'core.current_user_id()', 'EXECUTE'),
  'anon cannot EXECUTE core.current_user_id()');
select ok(not has_function_privilege('anon', 'core.is_platform_staff()', 'EXECUTE'),
  'anon cannot EXECUTE core.is_platform_staff()');
select ok(not has_function_privilege('anon', 'core.is_member_of(uuid)', 'EXECUTE'),
  'anon cannot EXECUTE core.is_member_of(uuid)');
select ok(not has_function_privilege('anon', 'core.has_permission(uuid, text, uuid)', 'EXECUTE'),
  'anon cannot EXECUTE core.has_permission(uuid, text, uuid)');
select ok(not has_function_privilege('anon', 'core.shares_tenant_with(uuid)', 'EXECUTE'),
  'anon cannot EXECUTE core.shares_tenant_with(uuid)');
select ok(not has_function_privilege('anon', 'core.set_updated_at()', 'EXECUTE'),
  'anon cannot EXECUTE core.set_updated_at()');
select ok(not has_function_privilege('anon', 'core.enforce_platform_staff_immutable()', 'EXECUTE'),
  'anon cannot EXECUTE core.enforce_platform_staff_immutable()');

-- --- 3. authenticated CAN EXECUTE the RLS / app-facing helpers -------------
-- RLS policies on core.tenants / core.tenant_memberships invoke these, so
-- authenticated must retain EXECUTE — now via an explicit grant, not PUBLIC.
select ok(has_function_privilege('authenticated', 'core.current_user_id()', 'EXECUTE'),
  'authenticated can EXECUTE core.current_user_id()');
select ok(has_function_privilege('authenticated', 'core.is_platform_staff()', 'EXECUTE'),
  'authenticated can EXECUTE core.is_platform_staff()');
select ok(has_function_privilege('authenticated', 'core.is_member_of(uuid)', 'EXECUTE'),
  'authenticated can EXECUTE core.is_member_of(uuid)');
select ok(has_function_privilege('authenticated', 'core.has_permission(uuid, text, uuid)', 'EXECUTE'),
  'authenticated can EXECUTE core.has_permission(uuid, text, uuid)');
select ok(has_function_privilege('authenticated', 'core.shares_tenant_with(uuid)', 'EXECUTE'),
  'authenticated can EXECUTE core.shares_tenant_with(uuid)');

-- --- 4. authenticated CANNOT EXECUTE the trigger helpers -------------------
-- Trigger functions fire under the table-owner context; the invoking role
-- needs no EXECUTE. They must not be callable as RPC by authenticated.
select ok(not has_function_privilege('authenticated', 'core.set_updated_at()', 'EXECUTE'),
  'authenticated cannot EXECUTE core.set_updated_at()');
select ok(not has_function_privilege('authenticated', 'core.enforce_platform_staff_immutable()', 'EXECUTE'),
  'authenticated cannot EXECUTE core.enforce_platform_staff_immutable()');

select * from finish();
rollback;
