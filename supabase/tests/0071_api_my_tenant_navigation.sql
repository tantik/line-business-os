-- ============================================================================
-- DB test: migration 0132 (api.my_tenant_navigation, task P4).
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--   A  cafe package order (= today's Cafe home order)
--   B  a member sees only enabled modules of their own active-membership tenant
--   C  an add-on module comes after the package modules
--   D  an opted-out package module is not listed
--   E  anon has no access
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, api;

select no_plan();

insert into core.tenants (id, slug, name) values
  ('a7100000-0000-0000-0000-00000000000a', 'pgtap-0132-a', 'pgTAP 0132 A'),
  ('a7100000-0000-0000-0000-00000000000b', 'pgtap-0132-b', 'pgTAP 0132 B');
insert into core.users (id, display_name) values
  ('a7190000-0000-0000-0000-000000000001', 'A member'),
  ('a7190000-0000-0000-0000-000000000002', 'B member');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a7100000-0000-0000-0000-00000000000a', 'a7190000-0000-0000-0000-000000000001', 'active'),
  ('a7100000-0000-0000-0000-00000000000b', 'a7190000-0000-0000-0000-000000000002', 'active');

-- A: cafe for tenant A with an AI add-on and HACCP (operations) opted out;
--    cafe for tenant B as is.
select core.set_tenant_package('a7100000-0000-0000-0000-00000000000a', 'cafe', true);
select core.set_tenant_module_override('a7100000-0000-0000-0000-00000000000a', 'ai', true, 'pgTAP add-on');
select core.set_tenant_module_override('a7100000-0000-0000-0000-00000000000a', 'operations', false, 'pgTAP opt-out');
select core.set_tenant_package('a7100000-0000-0000-0000-00000000000b', 'cafe', true);

select is(
  (select string_agg(module::text, ',' order by sort_order) from core.package_modules where package_code = 'cafe'),
  'core,recipes,inventory,workforce,purchases,operations,issues',
  'A: cafe package order = Cafe home order (recipes, inventory, staff, purchasing, HACCP, issues)');

create function pg_temp.nav_as(p_sub text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  select string_agg(tenant_id::text || ':' || module::text, ',' order by tenant_id, nav_order, module::text)
    into v from api.my_tenant_navigation;
  reset role;
  return coalesce(v, '');
end $$;

-- B, C, D
select is(
  pg_temp.nav_as('a7190000-0000-0000-0000-000000000001'),
  'a7100000-0000-0000-0000-00000000000a:core,a7100000-0000-0000-0000-00000000000a:recipes,'
  'a7100000-0000-0000-0000-00000000000a:inventory,a7100000-0000-0000-0000-00000000000a:workforce,'
  'a7100000-0000-0000-0000-00000000000a:purchases,a7100000-0000-0000-0000-00000000000a:issues,'
  'a7100000-0000-0000-0000-00000000000a:ai',
  'B/C/D: member of A sees only A, in package order, add-on (ai) last, opted-out operations absent');

select ok(
  pg_temp.nav_as('a7190000-0000-0000-0000-000000000002') not like '%a7100000-0000-0000-0000-00000000000a%',
  'B: member of B never sees tenant A');

update core.tenant_memberships set status = 'suspended'
 where tenant_id = 'a7100000-0000-0000-0000-00000000000a' and user_id = 'a7190000-0000-0000-0000-000000000001';
select is(pg_temp.nav_as('a7190000-0000-0000-0000-000000000001'), '', 'B: a suspended membership sees no navigation');

-- E
select is(
  has_table_privilege('anon', 'api.my_tenant_navigation', 'select'), false, 'E: anon cannot select the view');
select is(
  has_table_privilege('authenticated', 'api.my_tenant_navigation', 'select'), true, 'E: authenticated can select the view');

select * from finish();
rollback;
