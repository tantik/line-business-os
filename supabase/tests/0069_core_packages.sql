-- ============================================================================
-- DB test: migration 0129 (packages -> tenant_modules sync).
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--   A  catalog: the cafe package and its modules
--   B  adding a package enables its modules + one audit row
--   C  add-on module outside the packages
--   D  opting out of a package module disables it (row kept)
--   E  two packages; removing one keeps the modules the other still includes
--   F  nothing is ever deleted from tenant_modules (data and config stay)
--   G  a missing dependency is refused and changes nothing
--   H  only service_role may change packages; members read their own rows only
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit;

select no_plan();

insert into core.tenants (id, slug, name) values
  ('a9000000-0000-0000-0000-00000000000a', 'pgtap-0129-a', 'pgTAP 0129 A'),
  ('a9000000-0000-0000-0000-00000000000b', 'pgtap-0129-b', 'pgTAP 0129 B');
insert into core.users (id, display_name) values
  ('a9900000-0000-0000-0000-000000000001', 'A manager'),
  ('a9900000-0000-0000-0000-000000000002', 'B manager');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a9000000-0000-0000-0000-00000000000a', 'a9900000-0000-0000-0000-000000000001', 'active'),
  ('a9000000-0000-0000-0000-00000000000b', 'a9900000-0000-0000-0000-000000000002', 'active');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a9000000-0000-0000-0000-00000000000a', 'a9900000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', null),
  ('a9000000-0000-0000-0000-00000000000b', 'a9900000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', null);

create function pg_temp.enabled(p_tenant uuid) returns text language sql as $$
  select coalesce(string_agg(module::text, ',' order by module::text), '')
    from core.tenant_modules where tenant_id = p_tenant and is_enabled;
$$;

create function pg_temp.as_service(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  execute p_sql into v;
  reset role;
  return v;
end $$;

create function pg_temp.as_service_throws(p_sql text) returns text language plpgsql as $$
begin
  set local role service_role;
  execute p_sql;
  reset role;
  return 'no error';
exception when others then
  reset role;
  return sqlerrm;
end $$;

create function pg_temp.as_auth_throws(p_sub text, p_sql text) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return false;
exception when others then
  reset role;
  return true;
end $$;

create function pg_temp.as_auth_count(p_sub text, p_sql text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end $$;

-- A
select is((select version from core.packages where code = 'cafe'), 3, 'A: cafe package v3 exists');
select is((select string_agg(module::text, ',' order by sort_order) from core.package_modules where package_code = 'cafe'),
  'core,workforce,inventory,purchases,operations,recipes,issues', 'A: cafe modules in navigation order');

-- B
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000a'), '', 'B: a new tenant starts with no modules');
select is(pg_temp.as_service($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'cafe', true) $$) -> 'disabled',
  '[]'::jsonb, 'B: adding cafe disables nothing');
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000a'), 'core,inventory,issues,operations,purchases,recipes,workforce', 'B: cafe modules enabled');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a9000000-0000-0000-0000-00000000000a' and entity = 'tenant_package' and action = 'add'),
  1, 'B: one audit row');

-- C
select pg_temp.as_service($$ select core.set_tenant_module_override('a9000000-0000-0000-0000-00000000000a', 'booking', true, 'add-on') $$);
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000a'), 'booking,core,inventory,issues,operations,purchases,recipes,workforce', 'C: add-on booking enabled');

-- D
select pg_temp.as_service($$ select core.set_tenant_module_override('a9000000-0000-0000-0000-00000000000a', 'issues', false) $$);
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000a'), 'booking,core,inventory,operations,purchases,recipes,workforce', 'D: issues opted out');
select is((select is_enabled from core.tenant_modules where tenant_id = 'a9000000-0000-0000-0000-00000000000a' and module = 'issues'),
  false, 'D: the issues row is kept, only disabled');
select pg_temp.as_service($$ select core.set_tenant_module_override('a9000000-0000-0000-0000-00000000000a', 'issues', null) $$);
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000a'), 'booking,core,inventory,issues,operations,purchases,recipes,workforce', 'D: clearing the override follows the package again');

-- E
insert into core.packages (code, name_ja, name_en, version, lifecycle_status) values ('pgtap_mini', '店舗チェック', 'Store check', 1, 'beta');
insert into core.package_modules (package_code, module) values ('pgtap_mini', 'inventory'), ('pgtap_mini', 'operations');
select pg_temp.as_service($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'pgtap_mini', true) $$);
select is(pg_temp.as_service($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'cafe', false) $$) -> 'disabled',
  '["core", "issues", "purchases", "recipes", "workforce"]'::jsonb, 'E: removing cafe disables only what no package or add-on still needs');
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000a'), 'booking,inventory,operations', 'E: mini package modules + add-on remain');
select is((select status from core.tenant_packages where tenant_id = 'a9000000-0000-0000-0000-00000000000a' and package_code = 'cafe'),
  'removed', 'E: the removed package row is kept for history');

-- F
select is((select count(*)::int from core.tenant_modules where tenant_id = 'a9000000-0000-0000-0000-00000000000a'),
  8, 'F: all eight module rows still exist (nothing deleted)');
select pg_temp.as_service($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'cafe', true) $$);
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000a'), 'booking,core,inventory,issues,operations,purchases,recipes,workforce', 'F: re-adding cafe restores the modules');

-- G
insert into core.module_dependencies (module, depends_on) values ('issues', 'operations');
select matches(pg_temp.as_service_throws($$ select core.set_tenant_module_override('a9000000-0000-0000-0000-00000000000a', 'operations', false) $$),
  'module_dependency_missing', 'G: opting out of a dependency is refused');
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000a'), 'booking,core,inventory,issues,operations,purchases,recipes,workforce', 'G: nothing changed');
select is((select count(*)::int from core.tenant_module_overrides where tenant_id = 'a9000000-0000-0000-0000-00000000000a' and module = 'operations'),
  0, 'G: the refused override was not stored');
select matches(pg_temp.as_service_throws($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'no_such', true) $$),
  'package_not_available', 'G: unknown package refused');

-- H
select ok(pg_temp.as_auth_throws('a9900000-0000-0000-0000-000000000001',
  $$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'cafe', false) $$), 'H: a manager cannot call core.set_tenant_package');
select ok(pg_temp.as_auth_throws('a9900000-0000-0000-0000-000000000001',
  $$ select api.set_tenant_module_override('a9000000-0000-0000-0000-00000000000a', 'crm', true) $$), 'H: nor the api wrapper');
select ok(pg_temp.as_auth_throws('a9900000-0000-0000-0000-000000000001',
  $$ insert into core.tenant_module_overrides (tenant_id, module, is_enabled) values ('a9000000-0000-0000-0000-00000000000a', 'crm', true) $$),
  'H: a manager cannot write overrides directly');
select is(pg_temp.as_auth_count('a9900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from api.my_tenant_packages where tenant_id = 'a9000000-0000-0000-0000-00000000000a' $$), 2, 'H: member reads own packages');
select is(pg_temp.as_auth_count('a9900000-0000-0000-0000-000000000002',
  $$ select count(*)::int from api.my_tenant_packages where tenant_id = 'a9000000-0000-0000-0000-00000000000a' $$), 0, 'H: other tenant sees none');
select is(pg_temp.as_auth_count('a9900000-0000-0000-0000-000000000002',
  $$ select count(*)::int from core.tenant_module_overrides where tenant_id = 'a9000000-0000-0000-0000-00000000000a' $$), 0, 'H: other tenant cannot read overrides');

create function pg_temp.auth_sqlstate(p_sub text, p_sql text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;

create function pg_temp.service_sqlstate(p_sql text) returns text language plpgsql as $$
begin
  set local role service_role;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;

-- H (exact codes)
select is(pg_temp.auth_sqlstate('a9900000-0000-0000-0000-000000000001',
  $$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'cafe', false) $$), '42501', 'H: manager -> 42501 on set_tenant_package');
select is(pg_temp.auth_sqlstate('a9900000-0000-0000-0000-000000000002',
  $$ select count(*) from core.desired_tenant_modules('a9000000-0000-0000-0000-00000000000a') $$), '42501',
  'H: a member cannot read any tenant''s desired module set (internal helper)');
select is((select has_table_privilege('anon', 'core.packages', 'select')), false, 'H: anon has no access to the package catalog');

-- I: a tenant written the old way (direct tenant_modules rows) is refused until adopted
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a9000000-0000-0000-0000-00000000000b', 'workforce', true),
  ('a9000000-0000-0000-0000-00000000000b', 'booking', true);
select is(pg_temp.service_sqlstate($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000b', 'cafe', true) $$),
  'P0001', 'I: adding a package to a non-managed tenant is refused');
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000b'), 'booking,workforce', 'I: ... and nothing changed');
select is(pg_temp.as_service($$ select core.adopt_tenant_into_package('a9000000-0000-0000-0000-00000000000b', 'cafe') $$),
  '{"enabled": [], "disabled": []}'::jsonb, 'I: adopt converts it with zero access change');
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000b'), 'booking,workforce', 'I: same modules after adopt');
select is((select string_agg(module::text || '=' || is_enabled, ',' order by module::text) from core.tenant_module_overrides
            where tenant_id = 'a9000000-0000-0000-0000-00000000000b'),
  'booking=true,core=false,inventory=false,issues=false,operations=false,purchases=false,recipes=false', 'I: compensating overrides');
select is(pg_temp.service_sqlstate($$ select core.adopt_tenant_into_package('a9000000-0000-0000-0000-00000000000b', 'cafe') $$),
  'P0001', 'I: adopting twice is refused');

-- J: NULL arguments are refused, never read as "remove"
select is(pg_temp.service_sqlstate($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'cafe', null) $$),
  '22004', 'J: p_active null refused');
select is(pg_temp.enabled('a9000000-0000-0000-0000-00000000000a'), 'booking,core,inventory,issues,operations,purchases,recipes,workforce', 'J: nothing changed');

-- K: a deprecated package can be removed but not added
update core.packages set lifecycle_status = 'deprecated' where code = 'pgtap_mini';
select is(pg_temp.service_sqlstate($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'pgtap_mini', false) $$),
  'ok', 'K: removing a deprecated package works');
select is(pg_temp.service_sqlstate($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000b', 'pgtap_mini', true) $$),
  'P0002', 'K: adding a deprecated package is refused');

-- L: a package containing a planned module cannot be activated
insert into core.packages (code, name_ja, name_en, version, lifecycle_status) values ('pgtap_crm', 'CRM', 'CRM', 1, 'beta');
insert into core.package_modules (package_code, module) values ('pgtap_crm', 'crm');
select is(pg_temp.service_sqlstate($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'pgtap_crm', true) $$),
  'P0002', 'L: planned module in a package refused');
select is((select count(*)::int from core.tenant_modules where tenant_id = 'a9000000-0000-0000-0000-00000000000a' and module = 'crm'),
  0, 'L: crm never written');

-- M: the runtime gate follows an opt-out
delete from core.module_dependencies where module = 'issues';
select pg_temp.as_service($$ select core.set_tenant_module_override('a9000000-0000-0000-0000-00000000000a', 'operations', false) $$);
select is(core.has_module_access('a9000000-0000-0000-0000-00000000000a', 'operations'), false, 'M: has_module_access false after opt-out');
select is(core.has_module_access('a9000000-0000-0000-0000-00000000000a', 'inventory'), true, 'M: other modules unaffected');

-- N: audit content and the actor rule
update core.users set is_platform_staff = true where id = 'a9900000-0000-0000-0000-000000000002';
select pg_temp.as_service($$ select core.set_tenant_module_override('a9000000-0000-0000-0000-00000000000a', 'operations', null, null,
                                    'a9900000-0000-0000-0000-000000000002') $$);
select is((select actor_id::text || '/' || actor_kind || '/' || action || '/' || entity_id from audit.audit_logs
            where tenant_id = 'a9000000-0000-0000-0000-00000000000a' and entity = 'tenant_module_override' order by id desc limit 1),
  'a9900000-0000-0000-0000-000000000002/user/clear/operations', 'N: platform-staff actor recorded');
select is((select actor_kind from audit.audit_logs
            where tenant_id = 'a9000000-0000-0000-0000-00000000000a' and entity = 'tenant_package' order by id limit 1),
  'system', 'N: no actor -> system');
select is(pg_temp.service_sqlstate($$ select core.set_tenant_package('a9000000-0000-0000-0000-00000000000a', 'cafe', true,
                                         'a9900000-0000-0000-0000-000000000001') $$),
  '42501', 'N: a non-staff actor id is refused');

select * from finish();
rollback;
