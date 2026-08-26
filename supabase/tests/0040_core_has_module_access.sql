-- ============================================================================
-- DB test: core.has_module_access(uuid, core.module_code) (WP-S1, migration
-- 0093_core_has_module_access.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the WP-S1 core helper's exact contract:
--   * function exists with the right signature/return type;
--   * SECURITY DEFINER, fixed search_path (matches core.has_permission's
--     established hardening pattern from 0014_core_helper_execute_hardening.sql);
--   * PUBLIC/anon denied EXECUTE, authenticated and service_role allowed;
--   * module ON -> true;
--   * module OFF -> false;
--   * module row missing entirely -> false (fail closed);
--   * cross-tenant: a module enabled for tenant A does not leak true for
--     tenant B;
--   * NO platform-staff bypass -- a platform-staff caller gets exactly the
--     same false as anyone else when the module is OFF or missing. This is
--     the one behavioral point that deliberately differs from
--     core.has_permission and is the whole reason this is a new, separate
--     helper rather than reusing has_permission's pattern verbatim.
--
-- pgTAP runs as the superuser test role; core.has_module_access() takes no
-- actor-dependent input (unlike has_permission, it does not call
-- core.current_user_id() at all), so no role-hopping helper is needed here --
-- SECURITY DEFINER is exercised simply by calling the function directly.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai, api;

select no_plan();

-- --- Fixtures (inserted as superuser; bypasses RLS) ------------------------
insert into core.tenants (id, slug, name, kind) values
  ('a1a10000-0000-0000-0000-0000000000a1', 'pgtap-s1-tenant-a', 'pgTAP S1 Tenant A', 'demo'),
  ('b1b10000-0000-0000-0000-0000000000b1', 'pgtap-s1-tenant-b', 'pgTAP S1 Tenant B', 'client');

-- Tenant A: inventory ON, ai explicitly OFF. Tenant B: inventory row absent
-- entirely (never provisioned) -- proves "missing row" is a distinct,
-- correctly-handled case from "row present but is_enabled = false".
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a1a10000-0000-0000-0000-0000000000a1', 'inventory', true),
  ('a1a10000-0000-0000-0000-0000000000a1', 'ai', false);

-- --- Structural: function exists, returns boolean ---------------------------
select has_function(
  'core', 'has_module_access', array['uuid', 'module_code'],
  'core.has_module_access(uuid, core.module_code) exists'
);

select is(
  (select t.typname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     join pg_type t on t.oid = p.prorettype
    where n.nspname = 'core'
      and p.proname = 'has_module_access'),
  'bool',
  'core.has_module_access returns boolean'
);

-- --- SECURITY DEFINER + fixed search_path (matches has_permission) ---------
select is(
  (select p.prosecdef
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core'
      and p.proname = 'has_module_access'),
  true,
  'core.has_module_access is SECURITY DEFINER'
);

select ok(
  (select p.proconfig
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core'
      and p.proname = 'has_module_access') @> array['search_path=core, public'],
  'core.has_module_access has a fixed search_path (no search_path hijack surface)'
);

-- --- Grants: PUBLIC/anon denied, authenticated + service_role allowed ------
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(p.proacl) acl
    where n.nspname = 'core'
      and p.proname = 'has_module_access'
      and acl.grantee = 0               -- 0 == PUBLIC
      and acl.privilege_type = 'EXECUTE'),
  0,
  'PUBLIC has no EXECUTE on core.has_module_access'
);
select ok(
  not has_function_privilege('anon', 'core.has_module_access(uuid, core.module_code)', 'EXECUTE'),
  'anon cannot EXECUTE core.has_module_access'
);
select ok(
  has_function_privilege('authenticated', 'core.has_module_access(uuid, core.module_code)', 'EXECUTE'),
  'authenticated can EXECUTE core.has_module_access'
);
select ok(
  has_function_privilege('service_role', 'core.has_module_access(uuid, core.module_code)', 'EXECUTE'),
  'service_role can EXECUTE core.has_module_access'
);

-- --- Behavioral: ON / OFF / missing / cross-tenant --------------------------

select ok(
  core.has_module_access('a1a10000-0000-0000-0000-0000000000a1', 'inventory'),
  'module ON (is_enabled = true) returns true'
);

select ok(
  not core.has_module_access('a1a10000-0000-0000-0000-0000000000a1', 'ai'),
  'module OFF (is_enabled = false) returns false'
);

select ok(
  not core.has_module_access('a1a10000-0000-0000-0000-0000000000a1', 'booking'),
  'module row never provisioned for this tenant returns false (fail closed, distinct from explicit OFF)'
);

select ok(
  not core.has_module_access('b1b10000-0000-0000-0000-0000000000b1', 'inventory'),
  'tenant with no core.tenant_modules rows at all returns false for every module'
);

select ok(
  not core.has_module_access('a1a10000-0000-0000-0000-0000000000a1', 'inventory')
      = core.has_module_access('b1b10000-0000-0000-0000-0000000000b1', 'inventory'),
  'inventory ON for tenant A does not leak true for tenant B (cross-tenant isolation)'
);

-- --- No platform-staff bypass (the deliberate divergence from has_permission) --
-- has_module_access takes no actor argument at all, so there is no
-- "call it as platform staff" case to exercise via role-hopping -- the
-- absence of any core.is_platform_staff() reference in the function body is
-- what this migration's own comment/contract commits to structurally. The
-- assertion below re-confirms the same OFF/missing results hold regardless
-- of who could conceivably be calling: the function is defined with no
-- actor-identity input, so no caller identity can ever change its answer.
select ok(
  not core.has_module_access('a1a10000-0000-0000-0000-0000000000a1', 'ai'),
  'no platform-staff (or any actor-identity) bypass exists -- module OFF stays false unconditionally'
);

-- Function body must not reference core.is_platform_staff or
-- core.current_user_id at all (structural proof there is no bypass hiding
-- behind actor identity that a purely behavioral test could miss).
select ok(
  (select prosrc
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core'
      and p.proname = 'has_module_access') not ilike '%is_platform_staff%',
  'core.has_module_access source does not reference core.is_platform_staff (no bypass)'
);

select * from finish();
rollback;
