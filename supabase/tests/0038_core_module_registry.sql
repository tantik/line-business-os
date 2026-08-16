-- ============================================================================
-- DB test: Module Registry (migration 0070_core_module_registry.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * RLS is enabled on both new tables.
--   * Seed sanity: all 7 core.module_code values are registered with the
--     expected lifecycle_status.
--   * A non-platform-staff member cannot write module_registry/
--     module_dependencies (platform-staff-only, same convention as 0069).
--   * core.can_enable_module: ga module, no min plan, no deps -> true;
--     retired module -> false; min_plan_code set but tenant on a different
--     plan -> false (and true once the tenant's plan matches); an unmet
--     dependency -> false, met dependency -> true.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core;
select no_plan();

create function pg_temp.as_auth_exec(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(p_sub, ''))::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return true;
exception when others then
  raise notice 'as_auth_exec failed: %', sqlerrm;
  reset role;
  return false;
end;
$$;

-- --- RLS enabled --------------------------------------------------------------
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and c.relname = 'module_registry'),
  'RLS is enabled on core.module_registry'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and c.relname = 'module_dependencies'),
  'RLS is enabled on core.module_dependencies'
);

-- --- Seed sanity ---------------------------------------------------------------
select is(
  (select count(*)::int from core.module_registry), 7,
  'all 7 core.module_code values are registered'
);
select is(
  (select lifecycle_status::text from core.module_registry where module = 'workforce'),
  'ga', 'workforce is registered as ga'
);
select is(
  (select lifecycle_status::text from core.module_registry where module = 'logistics'),
  'planned', 'logistics is registered as planned (placeholder, no schema)'
);
select is(
  (select lifecycle_status::text from core.module_registry where module = 'crm'),
  'planned', 'crm is registered as planned (placeholder, no schema)'
);
select is(
  (select lifecycle_status::text from core.module_registry where module = 'inventory'),
  'beta', 'inventory is registered as beta'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('ea600000-0000-0000-0000-000000000001', 'pgtap-module-registry-tenant', 'pgTAP Module Registry');
insert into core.users (id, display_name, is_platform_staff) values
  ('ea620000-0000-0000-0000-000000000001', 'Tenant Owner', false);
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('ea600000-0000-0000-0000-000000000001', 'ea620000-0000-0000-0000-000000000001', 'active');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('ea600000-0000-0000-0000-000000000001', 'ea620000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003', null); -- tenant_owner, holds core.billing.manage

-- ============================================================================
-- RLS: write is platform-staff-only
-- ============================================================================

select ok(
  not pg_temp.as_auth_exec('ea620000-0000-0000-0000-000000000001',
    $q$ update core.module_registry set version = '9.9.9' where module = 'workforce' $q$),
  'a tenant Owner (holds core.billing.manage) cannot update module_registry'
);
select ok(
  not pg_temp.as_auth_exec('ea620000-0000-0000-0000-000000000001',
    $q$ insert into core.module_dependencies (module, depends_on) values ('booking', 'workforce') $q$),
  'a tenant Owner cannot insert a module_dependencies row'
);

-- ============================================================================
-- core.can_enable_module
-- ============================================================================

select ok(
  core.can_enable_module('ea600000-0000-0000-0000-000000000001', 'workforce'),
  'ga module, no min plan, no dependencies -> can_enable_module is true'
);

update core.module_registry set lifecycle_status = 'retired' where module = 'ai';
select ok(
  not core.can_enable_module('ea600000-0000-0000-0000-000000000001', 'ai'),
  'retired module -> can_enable_module is false'
);
update core.module_registry set lifecycle_status = 'beta' where module = 'ai';

update core.module_registry set min_plan_code = 'custom' where module = 'inventory';
select ok(
  not core.can_enable_module('ea600000-0000-0000-0000-000000000001', 'inventory'),
  'min_plan_code set to custom, tenant is on standard (default from 0069 backfill/trigger) -> false'
);
update core.tenant_plans set plan_code = 'custom'
  where tenant_id = 'ea600000-0000-0000-0000-000000000001';
select ok(
  core.can_enable_module('ea600000-0000-0000-0000-000000000001', 'inventory'),
  'tenant plan now matches min_plan_code -> true'
);
update core.tenant_plans set plan_code = 'standard'
  where tenant_id = 'ea600000-0000-0000-0000-000000000001';
update core.module_registry set min_plan_code = null where module = 'inventory';

insert into core.module_dependencies (module, depends_on) values ('booking', 'workforce');
select ok(
  not core.can_enable_module('ea600000-0000-0000-0000-000000000001', 'booking'),
  'booking depends on workforce, which is not enabled for this tenant -> false'
);
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('ea600000-0000-0000-0000-000000000001', 'workforce', true);
select ok(
  core.can_enable_module('ea600000-0000-0000-0000-000000000001', 'booking'),
  'workforce is now enabled for this tenant -> booking''s dependency is satisfied -> true'
);

select * from finish();
rollback;
