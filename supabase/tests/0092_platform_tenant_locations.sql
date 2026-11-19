-- ============================================================================
-- DB test: migration 0157 (platform-staff read of tenant locations, DEBT-139 L3c).
-- Run with:  supabase db reset && supabase test db
--   A  grants: authenticated only (anon refused); api wrapper SECURITY INVOKER;
--      core function SECURITY DEFINER with a pinned search_path
--   B  non-staff signed-in user refused (42501), anon refused
--   C  staff sees every tenant's locations (archived ones included), in order
--   D  p_tenant_id filter; unknown tenant -> no rows
--   E  active_staff_count: only active employees with that home location
--   F  no PII columns
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit;

select no_plan();

create function pg_temp.as_user(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return 'ERR ' || sqlstate || ' ' || sqlerrm;
end $$;

create function pg_temp.anon_err(p_sql text) returns text language plpgsql as $$
begin
  set local role anon;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;

-- fixtures ------------------------------------------------------------------------------------
insert into core.users (id, display_name, is_platform_staff) values
  ('b1570000-0000-0000-0000-000000000001', 'ORUWA staff', true),
  ('b1570000-0000-0000-0000-000000000002', 'Not staff', false);

-- TA (two open stores + one archived), TB (one store)
insert into core.tenants (id, slug, name, status) values
  ('b1570000-0000-0000-0000-0000000000a1', 'pgtap-0157-ta', 'pgTAP 0157 TA', 'active'),
  ('b1570000-0000-0000-0000-0000000000a2', 'pgtap-0157-tb', 'pgTAP 0157 TB', 'active');
insert into core.locations (id, tenant_id, name, timezone, is_active, created_at) values
  ('b1571000-0000-0000-0000-000000000001', 'b1570000-0000-0000-0000-0000000000a1', '本店',   'Asia/Tokyo', true,  '2026-01-01 00:00+00'),
  ('b1571000-0000-0000-0000-000000000002', 'b1570000-0000-0000-0000-0000000000a1', '駅前店', 'Asia/Tokyo', true,  '2026-01-02 00:00+00'),
  ('b1571000-0000-0000-0000-000000000003', 'b1570000-0000-0000-0000-0000000000a1', '旧店',   'Asia/Tokyo', false, '2025-12-01 00:00+00'),
  ('b1571000-0000-0000-0000-000000000004', 'b1570000-0000-0000-0000-0000000000a2', 'TB Store', 'UTC',      true,  '2026-01-01 00:00+00');
-- 本店: 2 active + 1 inactive; 駅前店: 1 active; 旧店: 1 inactive; TB: 1 active; one without a home store
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, is_active) values
  ('b1572000-0000-0000-0000-000000000001', 'b1570000-0000-0000-0000-0000000000a1', 'b1571000-0000-0000-0000-000000000001', convert_to('E1', 'UTF8'), true),
  ('b1572000-0000-0000-0000-000000000002', 'b1570000-0000-0000-0000-0000000000a1', 'b1571000-0000-0000-0000-000000000001', convert_to('E2', 'UTF8'), true),
  ('b1572000-0000-0000-0000-000000000003', 'b1570000-0000-0000-0000-0000000000a1', 'b1571000-0000-0000-0000-000000000001', convert_to('E3', 'UTF8'), false),
  ('b1572000-0000-0000-0000-000000000004', 'b1570000-0000-0000-0000-0000000000a1', 'b1571000-0000-0000-0000-000000000002', convert_to('E4', 'UTF8'), true),
  ('b1572000-0000-0000-0000-000000000005', 'b1570000-0000-0000-0000-0000000000a1', 'b1571000-0000-0000-0000-000000000003', convert_to('E5', 'UTF8'), false),
  ('b1572000-0000-0000-0000-000000000006', 'b1570000-0000-0000-0000-0000000000a2', 'b1571000-0000-0000-0000-000000000004', convert_to('E6', 'UTF8'), true),
  ('b1572000-0000-0000-0000-000000000007', 'b1570000-0000-0000-0000-0000000000a1', null,                                   convert_to('E7', 'UTF8'), true);

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.platform_tenant_locations(uuid)', 'execute'), false, 'A: anon cannot call the read (api)');
select is(has_function_privilege('anon', 'core.platform_tenant_locations(uuid)', 'execute'), false, 'A: anon cannot call the read (core)');
select is(has_function_privilege('authenticated', 'api.platform_tenant_locations(uuid)', 'execute'), true, 'A: authenticated can call (staff check inside)');
select is((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname = 'platform_tenant_locations'), false, 'A: api wrapper is SECURITY INVOKER (ADR 0008)');
select is((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'core' and p.proname = 'platform_tenant_locations'), true, 'A: core function is SECURITY DEFINER');
select ok((select p.proconfig::text like '%search_path=%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'core' and p.proname = 'platform_tenant_locations'), 'A: core function has a fixed search_path');

-- B: refusals ------------------------------------------------------------------------------------
select matches(pg_temp.as_user('b1570000-0000-0000-0000-000000000002', $$ select count(*)::text from api.platform_tenant_locations() $$),
  '^ERR 42501 not_platform_staff', 'B: a signed-in non-staff user is refused');
select matches(pg_temp.as_user('b1570000-0000-0000-0000-000000000002', $$ select count(*)::text from api.platform_tenant_locations('b1570000-0000-0000-0000-0000000000a1') $$),
  '^ERR 42501 not_platform_staff', 'B: also refused with a tenant filter');
select matches(pg_temp.as_user('b1570000-0000-0000-0000-0000000000ff', $$ select count(*)::text from api.platform_tenant_locations() $$),
  '^ERR 42501', 'B: a JWT without a core.users row is refused');
select is(pg_temp.anon_err($$ select * from api.platform_tenant_locations() $$), '42501', 'B: anon refused');

-- C: staff, all tenants --------------------------------------------------------------------------
select is(pg_temp.as_user('b1570000-0000-0000-0000-000000000001',
  $$ select count(*)::text from api.platform_tenant_locations() where tenant_id in ('b1570000-0000-0000-0000-0000000000a1', 'b1570000-0000-0000-0000-0000000000a2') $$),
  '4', 'C: staff sees the locations of both tenants (archived included)');
select is(pg_temp.as_user('b1570000-0000-0000-0000-000000000001',
  $$ select string_agg(location_name || ':' || is_active::text, ',' order by ord)
       from (select location_name, is_active, row_number() over () as ord
               from api.platform_tenant_locations() where tenant_id = 'b1570000-0000-0000-0000-0000000000a1') x $$),
  '本店:true,駅前店:true,旧店:false', 'C: order = open stores oldest first, then archived');
select is(pg_temp.as_user('b1570000-0000-0000-0000-000000000001',
  $$ select timezone || '/' || is_active::text || '/' || to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')
       from api.platform_tenant_locations() where location_id = 'b1571000-0000-0000-0000-000000000004' $$),
  'UTC/true/2026-01-01', 'C: timezone, is_active and created_at are returned');
select is(pg_temp.as_user('b1570000-0000-0000-0000-000000000001',
  $$ select (count(*) > 0)::text from api.platform_tenant_locations() where tenant_id not in ('b1570000-0000-0000-0000-0000000000a1', 'b1570000-0000-0000-0000-0000000000a2') $$),
  'true', 'C: seed tenants are listed too (all tenants when p_tenant_id is null)');

-- D: filter ------------------------------------------------------------------------------------
select is(pg_temp.as_user('b1570000-0000-0000-0000-000000000001',
  $$ select count(*)::text || '/' || count(distinct tenant_id)::text from api.platform_tenant_locations('b1570000-0000-0000-0000-0000000000a1') $$),
  '3/1', 'D: p_tenant_id returns exactly that tenant''s locations, archived included');
select is(pg_temp.as_user('b1570000-0000-0000-0000-000000000001',
  $$ select min(location_name) from api.platform_tenant_locations('b1570000-0000-0000-0000-0000000000a2') $$),
  'TB Store', 'D: the other tenant alone');
select is(pg_temp.as_user('b1570000-0000-0000-0000-000000000001',
  $$ select count(*)::text from api.platform_tenant_locations('b1570000-0000-0000-0000-0000000000ff') $$),
  '0', 'D: unknown tenant -> no rows');

-- E: active staff count ----------------------------------------------------------------------------
select is(pg_temp.as_user('b1570000-0000-0000-0000-000000000001',
  $$ select string_agg(location_name || '=' || active_staff_count::text, ',' order by created_at)
       from api.platform_tenant_locations() where tenant_id in ('b1570000-0000-0000-0000-0000000000a1', 'b1570000-0000-0000-0000-0000000000a2') $$),
  '旧店=0,本店=2,TB Store=1,駅前店=1', 'E: active_staff_count counts only active employees with that home store');
select is(pg_temp.as_user('b1570000-0000-0000-0000-000000000001',
  $$ select active_staff_count::text from api.platform_tenant_locations('b1570000-0000-0000-0000-0000000000a1') where location_id = 'b1571000-0000-0000-0000-000000000001' $$),
  '2', 'E: same count with the tenant filter');
update workforce.employees set is_active = false where id = 'b1572000-0000-0000-0000-000000000004';
select is(pg_temp.as_user('b1570000-0000-0000-0000-000000000001',
  $$ select active_staff_count::text from api.platform_tenant_locations('b1570000-0000-0000-0000-0000000000a1') where location_id = 'b1571000-0000-0000-0000-000000000002' $$),
  '0', 'E: a deactivated employee no longer counts');

-- F: no PII columns ---------------------------------------------------------------------------------------
select is((select count(*)::int from unnest((select proargnames from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname = 'platform_tenant_locations')) a(name)
           where name ~ '(email|user|address|phone|display_name|metadata|employee_name)'), 0,
  'F: no email / user id / address / person column in the result');

select * from finish();
rollback;
