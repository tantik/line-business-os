-- ============================================================================
-- DB test: migration 0142 (api.my_access, DEBT-124/135).
-- Run with:  supabase db reset && supabase test db
--   A  grants / ADR 0008
--   B  equivalence: for Owner, Manager, Employee and another tenant's user,
--      every answer equals the single-check RPC it replaces
--      (api.has_permission loc / null, api.has_permission_in_tenant,
--      api.is_tenant_owner)
--   C  a user of another tenant gets only false; empty lists -> {}
--   D  more than 64 entries in a list -> 22023; anon refused
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
-- tenants: T1 = ...a1, T2 = ...a2. Users: O owner, M manager (tenant-wide) + employee at L1,
-- E employee at L1, X employee of T2.
insert into core.tenants (id, slug, name) values
  ('a8100000-0000-0000-0000-0000000000a1', 'pgtap-0142-t1', 'pgTAP 0142 T1'),
  ('a8100000-0000-0000-0000-0000000000a2', 'pgtap-0142-t2', 'pgTAP 0142 T2');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a8100000-0000-0000-0000-0000000000a1', 'workforce', true),
  ('a8100000-0000-0000-0000-0000000000a2', 'workforce', true);
insert into core.locations (id, tenant_id, name) values
  ('a8110000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-0000000000a1', 'T1 / L1'),
  ('a8110000-0000-0000-0000-000000000002', 'a8100000-0000-0000-0000-0000000000a2', 'T2 / L1');
insert into core.users (id, display_name) values
  ('a8190000-0000-0000-0000-000000000001', 'O'),
  ('a8190000-0000-0000-0000-000000000002', 'M'),
  ('a8190000-0000-0000-0000-000000000003', 'E'),
  ('a8190000-0000-0000-0000-000000000004', 'X');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a8100000-0000-0000-0000-0000000000a1', 'a8190000-0000-0000-0000-000000000001', 'active'),
  ('a8100000-0000-0000-0000-0000000000a1', 'a8190000-0000-0000-0000-000000000002', 'active'),
  ('a8100000-0000-0000-0000-0000000000a1', 'a8190000-0000-0000-0000-000000000003', 'active'),
  ('a8100000-0000-0000-0000-0000000000a2', 'a8190000-0000-0000-0000-000000000004', 'active');
-- role ids: tenant_owner=...003, manager=...005, employee=...006
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a8100000-0000-0000-0000-0000000000a1', 'a8190000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', null),
  ('a8100000-0000-0000-0000-0000000000a1', 'a8190000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', null),
  ('a8100000-0000-0000-0000-0000000000a1', 'a8190000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'a8110000-0000-0000-0000-000000000001'),
  ('a8100000-0000-0000-0000-0000000000a1', 'a8190000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'a8110000-0000-0000-0000-000000000001'),
  ('a8100000-0000-0000-0000-0000000000a2', 'a8190000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'a8110000-0000-0000-0000-000000000002');

-- my_access for the checks /manager makes, as one jsonb
create function pg_temp.batch(p_uid text) returns jsonb language sql as $$
  select pg_temp.as_user(p_uid, $q$
    select api.my_access(
      'a8100000-0000-0000-0000-0000000000a1', 'a8110000-0000-0000-0000-000000000001',
      array['workforce.staff.manage', 'core.weekly_review.view', 'inventory.item.manage'],
      array['core.role.manage'],
      array['workforce.recipe.manage'])::text
  $q$)::jsonb;
$$;

-- the same checks, one single-check RPC each
create function pg_temp.single(p_uid text) returns jsonb language sql as $$
  select pg_temp.as_user(p_uid, $q$
    select jsonb_build_object(
      'location', jsonb_build_object(
        'workforce.staff.manage', api.has_permission('a8100000-0000-0000-0000-0000000000a1', 'workforce.staff.manage', 'a8110000-0000-0000-0000-000000000001'),
        'core.weekly_review.view', api.has_permission('a8100000-0000-0000-0000-0000000000a1', 'core.weekly_review.view', 'a8110000-0000-0000-0000-000000000001'),
        'inventory.item.manage', api.has_permission('a8100000-0000-0000-0000-0000000000a1', 'inventory.item.manage', 'a8110000-0000-0000-0000-000000000001')),
      'tenant', jsonb_build_object(
        'core.role.manage', api.has_permission('a8100000-0000-0000-0000-0000000000a1', 'core.role.manage', null)),
      'anyLocation', jsonb_build_object(
        'workforce.recipe.manage', api.has_permission_in_tenant('a8100000-0000-0000-0000-0000000000a1', 'workforce.recipe.manage')),
      'isTenantOwner', api.is_tenant_owner('a8100000-0000-0000-0000-0000000000a1'))::text
  $q$)::jsonb;
$$;

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.my_access(uuid, uuid, text[], text[], text[])', 'execute'), false, 'A: anon cannot call api.my_access');
select is(has_function_privilege('authenticated', 'api.my_access(uuid, uuid, text[], text[], text[])', 'execute'), true, 'A: authenticated can call api.my_access');
select is((select prosecdef from pg_proc where oid = 'api.my_access(uuid, uuid, text[], text[], text[])'::regprocedure), false, 'A: api.my_access is SECURITY INVOKER (ADR 0008)');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'api.my_access(uuid, uuid, text[], text[], text[])'::regprocedure), 'A: api.my_access pins search_path');

-- B: equivalence with the single-check RPCs ----------------------------------------------------
select is(pg_temp.batch('a8190000-0000-0000-0000-000000000001'), pg_temp.single('a8190000-0000-0000-0000-000000000001'), 'B: Owner -- batch equals single checks');
select is(pg_temp.batch('a8190000-0000-0000-0000-000000000002'), pg_temp.single('a8190000-0000-0000-0000-000000000002'), 'B: Manager -- batch equals single checks');
select is(pg_temp.batch('a8190000-0000-0000-0000-000000000003'), pg_temp.single('a8190000-0000-0000-0000-000000000003'), 'B: Employee -- batch equals single checks');
select is(pg_temp.batch('a8190000-0000-0000-0000-000000000004'), pg_temp.single('a8190000-0000-0000-0000-000000000004'), 'B: other tenant user -- batch equals single checks');

-- spot values, so equivalence cannot pass with both sides wrong
select is(pg_temp.batch('a8190000-0000-0000-0000-000000000001') -> 'isTenantOwner', 'true'::jsonb, 'B: Owner is tenant owner');
select is(pg_temp.batch('a8190000-0000-0000-0000-000000000001') #> '{tenant,core.role.manage}', 'true'::jsonb, 'B: Owner holds core.role.manage tenant-wide');
select is(pg_temp.batch('a8190000-0000-0000-0000-000000000002') #> '{location,workforce.staff.manage}', 'true'::jsonb, 'B: Manager holds workforce.staff.manage at L1');
select is(pg_temp.batch('a8190000-0000-0000-0000-000000000002') -> 'isTenantOwner', 'false'::jsonb, 'B: Manager is not tenant owner');
select is(pg_temp.batch('a8190000-0000-0000-0000-000000000003') #> '{location,workforce.staff.manage}', 'false'::jsonb, 'B: Employee lacks workforce.staff.manage');

-- C: another tenant's user gets only false; empty lists ------------------------------------------
select is(
  pg_temp.batch('a8190000-0000-0000-0000-000000000004'),
  '{"location": {"workforce.staff.manage": false, "core.weekly_review.view": false, "inventory.item.manage": false},
    "tenant": {"core.role.manage": false}, "anyLocation": {"workforce.recipe.manage": false}, "isTenantOwner": false}'::jsonb,
  'C: user of T2 gets only false for T1');
select is(
  pg_temp.as_user('a8190000-0000-0000-0000-000000000001', $q$ select api.my_access('a8100000-0000-0000-0000-0000000000a1')::text $q$)::jsonb,
  '{"location": {}, "tenant": {}, "anyLocation": {}, "isTenantOwner": true}'::jsonb,
  'C: no lists -> empty objects, owner flag still answered');

-- D: cap and anon -----------------------------------------------------------------------------
select ok(
  pg_temp.as_user('a8190000-0000-0000-0000-000000000001', $q$
    select api.my_access('a8100000-0000-0000-0000-0000000000a1', null,
      (select array_agg('p' || g) from generate_series(1, 65) g))::text $q$) like 'ERR 22023%',
  'D: 65 entries in a list -> 22023');
select is(pg_temp.anon_err($$ select api.my_access('a8100000-0000-0000-0000-0000000000a1') $$), '42501', 'D: anon call refused');

select * from finish();
rollback;
