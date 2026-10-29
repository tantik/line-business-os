-- ============================================================================
-- DB test: migration 0143 (api.my_page_context, DEBT-135).
-- Run with:  supabase db reset && supabase test db
--   A  grants / ADR 0008
--   B  every key equals the direct read of its source, as the same caller
--   C  tenant isolation: a user of T2 sees no T1 row in any key
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core;

select no_plan();

-- run p_sql as an authenticated user; returns the text result or 'ERR <state> <msg>'
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
-- T1 (workforce + inventory on, two locations), T2. Users: O owner of T1, E employee at T1/L1, X employee of T2.
insert into core.tenants (id, slug, name) values
  ('a8200000-0000-0000-0000-0000000000a1', 'pgtap-0143-t1', 'pgTAP 0143 T1'),
  ('a8200000-0000-0000-0000-0000000000a2', 'pgtap-0143-t2', 'pgTAP 0143 T2');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a8200000-0000-0000-0000-0000000000a1', 'workforce', true),
  ('a8200000-0000-0000-0000-0000000000a1', 'inventory', true),
  ('a8200000-0000-0000-0000-0000000000a2', 'workforce', true);
insert into core.locations (id, tenant_id, name) values
  ('a8210000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-0000000000a1', 'T1 / L1'),
  ('a8210000-0000-0000-0000-000000000003', 'a8200000-0000-0000-0000-0000000000a1', 'T1 / L2'),
  ('a8210000-0000-0000-0000-000000000002', 'a8200000-0000-0000-0000-0000000000a2', 'T2 / L1');
insert into core.users (id, display_name) values
  ('a8290000-0000-0000-0000-000000000001', 'O'),
  ('a8290000-0000-0000-0000-000000000002', 'E'),
  ('a8290000-0000-0000-0000-000000000003', 'X');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a8200000-0000-0000-0000-0000000000a1', 'a8290000-0000-0000-0000-000000000001', 'active'),
  ('a8200000-0000-0000-0000-0000000000a1', 'a8290000-0000-0000-0000-000000000002', 'active'),
  ('a8200000-0000-0000-0000-0000000000a2', 'a8290000-0000-0000-0000-000000000003', 'active');
-- role ids: tenant_owner=...003, employee=...006
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a8200000-0000-0000-0000-0000000000a1', 'a8290000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', null),
  ('a8200000-0000-0000-0000-0000000000a1', 'a8290000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'a8210000-0000-0000-0000-000000000001'),
  ('a8200000-0000-0000-0000-0000000000a2', 'a8290000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'a8210000-0000-0000-0000-000000000002');

create function pg_temp.ctx(p_uid text) returns jsonb language sql as $$
  select pg_temp.as_user(p_uid, 'select api.my_page_context()::text')::jsonb;
$$;

-- direct read of one source as the caller, as a jsonb array (same column set as the bundle)
create function pg_temp.direct(p_uid text, p_key text) returns jsonb language plpgsql as $$
declare q text;
begin
  q := case p_key
    when 'memberships' then $q$ select coalesce(jsonb_agg(jsonb_build_object('tenant_id', tenant_id, 'tenant_slug', tenant_slug, 'tenant_name', tenant_name, 'tenant_kind', tenant_kind, 'location_id', location_id, 'status', status)), '[]')::text from api.my_tenant_memberships $q$
    when 'navigation' then $q$ select coalesce(jsonb_agg(jsonb_build_object('tenant_id', tenant_id, 'module', module, 'nav_order', nav_order)), '[]')::text from api.my_tenant_navigation $q$
    when 'locations' then $q$ select coalesce(jsonb_agg(jsonb_build_object('tenant_id', tenant_id, 'location_id', location_id, 'location_name', location_name, 'timezone', timezone, 'is_active', is_active)), '[]')::text from api.my_tenant_locations $q$
    when 'packages' then $q$ select coalesce(jsonb_agg(jsonb_build_object('tenant_id', tenant_id, 'package_code', package_code, 'status', status, 'sort_order', sort_order)), '[]')::text from api.my_tenant_packages where status = 'active' $q$
    when 'employeeInvitations' then $q$ select coalesce(jsonb_agg(to_jsonb(e)), '[]')::text from api.my_pending_employee_invitations() e $q$
    when 'tenantInvitations' then $q$ select coalesce(jsonb_agg(to_jsonb(t)), '[]')::text from api.my_pending_tenant_invitations() t $q$
  end;
  return pg_temp.as_user(p_uid, q)::jsonb;
end $$;

-- order-insensitive equality of two jsonb arrays
create function pg_temp.same_set(a jsonb, b jsonb) returns boolean language sql as $$
  select jsonb_typeof(a) = 'array' and jsonb_typeof(b) = 'array'
     and jsonb_array_length(a) = jsonb_array_length(b) and a @> b and b @> a;
$$;

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.my_page_context()', 'execute'), false, 'A: anon cannot call api.my_page_context');
select is(has_function_privilege('authenticated', 'api.my_page_context()', 'execute'), true, 'A: authenticated can call api.my_page_context');
select is((select prosecdef from pg_proc where oid = 'api.my_page_context()'::regprocedure), false, 'A: SECURITY INVOKER (ADR 0008)');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'api.my_page_context()'::regprocedure), 'A: pins search_path');
select is(pg_temp.anon_err('select api.my_page_context()'), '42501', 'A: anon call refused');

-- B: equivalence, every key, three callers ----------------------------------------------------
select ok(pg_temp.same_set(pg_temp.ctx(u) -> k, pg_temp.direct(u, k)), format('B: %s equals the direct read for user %s', k, right(u, 1)))
  from unnest(array['a8290000-0000-0000-0000-000000000001', 'a8290000-0000-0000-0000-000000000002', 'a8290000-0000-0000-0000-000000000003']) as u,
       unnest(array['memberships', 'navigation', 'locations', 'packages', 'employeeInvitations', 'tenantInvitations']) as k;

-- spot values, so equivalence cannot pass with both sides empty
select is(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'memberships'), 1, 'B: owner has one membership');
select ok(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'locations') >= 1, 'B: owner sees T1 locations');
select ok(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'navigation') >= 1, 'B: owner sees T1 navigation');

-- C: isolation --------------------------------------------------------------------------------
select is(
  (select count(*)::int
     from jsonb_each(pg_temp.ctx('a8290000-0000-0000-0000-000000000003')) as kv(k, rows),
          jsonb_array_elements(kv.rows) as r
    where r ->> 'tenant_id' = 'a8200000-0000-0000-0000-0000000000a1'),
  0, 'C: a user of T2 sees no T1 row in any key');

select * from finish();
rollback;
