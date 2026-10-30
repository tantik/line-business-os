-- ============================================================================
-- DB test: migration 0143 (api.my_page_context, DEBT-135).
-- Run with:  supabase db reset && supabase test db
--   A  grants / ADR 0008
--   B  every key equals the direct read of its source, as the same caller
--      (incl. a suspended member); inactive location / disabled module /
--      removed package / revoked invitations; each caller sees only their
--      own pending invitations, tenant invitations oldest first
--   C  tenant isolation: a user of T2 sees no T1 row in the tenant keys
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

-- rows that must NOT widen what a caller sees:
-- S: suspended member of T1; L3: inactive T1 location; booking module off in T1;
-- T1 cafe package removed, T2 cafe package active
insert into core.users (id, display_name) values ('a8290000-0000-0000-0000-000000000004', 'S');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a8200000-0000-0000-0000-0000000000a1', 'a8290000-0000-0000-0000-000000000004', 'suspended');
insert into core.locations (id, tenant_id, name, is_active) values
  ('a8210000-0000-0000-0000-000000000004', 'a8200000-0000-0000-0000-0000000000a1', 'T1 / L3 (inactive)', false);
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a8200000-0000-0000-0000-0000000000a1', 'booking', false);
insert into core.tenant_packages (tenant_id, package_code, package_version, status, removed_at) values
  ('a8200000-0000-0000-0000-0000000000a1', 'cafe', 1, 'removed', now()),
  ('a8200000-0000-0000-0000-0000000000a2', 'cafe', 1, 'active', null);

-- invitations: X (T2 user) has a pending Manager invitation to T1 and a pending
-- employee invitation in T1, plus a revoked one of each; E has a pending employee
-- invitation. O has none.
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('a8230000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-0000000000a1', 'a8210000-0000-0000-0000-000000000001', null, '\x00'),
  ('a8230000-0000-0000-0000-000000000002', 'a8200000-0000-0000-0000-0000000000a1', 'a8210000-0000-0000-0000-000000000001', null, '\x00'),
  ('a8230000-0000-0000-0000-000000000003', 'a8200000-0000-0000-0000-0000000000a1', 'a8210000-0000-0000-0000-000000000003', null, '\x00');
insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, status, invited_by) values
  ('a8240000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-0000000000a1', 'a8230000-0000-0000-0000-000000000001', 'a8290000-0000-0000-0000-000000000003', 'pending', 'a8290000-0000-0000-0000-000000000001'),
  ('a8240000-0000-0000-0000-000000000003', 'a8200000-0000-0000-0000-0000000000a1', 'a8230000-0000-0000-0000-000000000003', 'a8290000-0000-0000-0000-000000000002', 'pending', 'a8290000-0000-0000-0000-000000000001');
insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, status, invited_by, revoked_at) values
  ('a8240000-0000-0000-0000-000000000002', 'a8200000-0000-0000-0000-0000000000a1', 'a8230000-0000-0000-0000-000000000002', 'a8290000-0000-0000-0000-000000000003', 'revoked', 'a8290000-0000-0000-0000-000000000001', now());
insert into core.tenant_invitations (id, tenant_id, target_user_id, role_key, location_id, status, invited_by, created_at) values
  ('a8250000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-0000000000a1', 'a8290000-0000-0000-0000-000000000003', 'manager', 'a8210000-0000-0000-0000-000000000001', 'pending', 'a8290000-0000-0000-0000-000000000001', now() - interval '2 hours'),
  ('a8250000-0000-0000-0000-000000000003', 'a8200000-0000-0000-0000-0000000000a1', 'a8290000-0000-0000-0000-000000000003', 'manager', 'a8210000-0000-0000-0000-000000000003', 'pending', 'a8290000-0000-0000-0000-000000000001', now() - interval '1 hour');
insert into core.tenant_invitations (id, tenant_id, target_user_id, role_key, location_id, status, invited_by, revoked_at) values
  ('a8250000-0000-0000-0000-000000000002', 'a8200000-0000-0000-0000-0000000000a1', 'a8290000-0000-0000-0000-000000000003', 'manager', 'a8210000-0000-0000-0000-000000000001', 'revoked', 'a8290000-0000-0000-0000-000000000001', now());

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
    when 'employeeInvitations' then $q$ select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at, e.invitation_id), '[]')::text from api.my_pending_employee_invitations() e $q$
    when 'tenantInvitations' then $q$ select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.invitation_id), '[]')::text from api.my_pending_tenant_invitations() t $q$
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
  from unnest(array['a8290000-0000-0000-0000-000000000001', 'a8290000-0000-0000-0000-000000000002', 'a8290000-0000-0000-0000-000000000003', 'a8290000-0000-0000-0000-000000000004']) as u,
       unnest(array['memberships', 'navigation', 'locations', 'packages', 'employeeInvitations', 'tenantInvitations']) as k;

-- spot values, so equivalence cannot pass with both sides empty
select is(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'memberships'), 1, 'B: owner has one membership');
select ok(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'locations') >= 1, 'B: owner sees T1 locations');
select ok(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'navigation') >= 1, 'B: owner sees T1 navigation');
select is(
  (select count(*)::int from jsonb_array_elements(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'navigation') r where r ->> 'module' = 'booking'),
  0, 'B: a disabled module is not in navigation');
select is(
  (select count(*)::int from jsonb_array_elements(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'locations') r
    where r ->> 'location_id' = 'a8210000-0000-0000-0000-000000000004' and (r ->> 'is_active')::boolean = false),
  1, 'B: an inactive location is returned flagged is_active = false (the app filters it, as before)');
select is(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'packages'), 0, 'B: a removed package is not returned');
select is(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000003') -> 'packages'), 1, 'B: T2 user sees the active T2 package');
select is(pg_temp.ctx('a8290000-0000-0000-0000-000000000004'),
  '{"memberships": [], "navigation": [], "locations": [], "packages": [], "employeeInvitations": [], "tenantInvitations": []}'::jsonb,
  'B: a suspended member gets an empty context');

-- invitations: only the caller's own pending rows, oldest first
select is(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'employeeInvitations'), 0, 'B: owner sees no employee invitation (none addressed to them)');
select is(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000001') -> 'tenantInvitations'), 0, 'B: owner sees no tenant invitation (none addressed to them)');
select is(
  (select jsonb_agg(r ->> 'invitation_id') from jsonb_array_elements(pg_temp.ctx('a8290000-0000-0000-0000-000000000003') -> 'employeeInvitations') r),
  '["a8240000-0000-0000-0000-000000000001"]'::jsonb, 'B: X sees exactly their own pending employee invitation (not the revoked one, not E''s)');
select is(
  (select jsonb_agg(r ->> 'invitation_id') from jsonb_array_elements(pg_temp.ctx('a8290000-0000-0000-0000-000000000002') -> 'employeeInvitations') r),
  '["a8240000-0000-0000-0000-000000000003"]'::jsonb, 'B: E sees exactly their own pending employee invitation');
select is(
  pg_temp.ctx('a8290000-0000-0000-0000-000000000003') -> 'tenantInvitations',
  pg_temp.direct('a8290000-0000-0000-0000-000000000003', 'tenantInvitations'),
  'B: X tenant invitations equal the direct read, same order');
select is(
  (select jsonb_agg(r ->> 'invitation_id') from jsonb_array_elements(pg_temp.ctx('a8290000-0000-0000-0000-000000000003') -> 'tenantInvitations') r),
  '["a8250000-0000-0000-0000-000000000001", "a8250000-0000-0000-0000-000000000003"]'::jsonb,
  'B: X sees their two pending tenant invitations oldest first, not the revoked one');
select is(jsonb_array_length(pg_temp.ctx('a8290000-0000-0000-0000-000000000002') -> 'tenantInvitations'), 0, 'B: E sees none of X''s tenant invitations');

-- C: isolation --------------------------------------------------------------------------------
-- (invitation keys are excluded: an invitee legitimately sees the inviting tenant's id;
-- they are covered by the per-user checks above)
select is(
  (select count(*)::int
     from jsonb_each(pg_temp.ctx('a8290000-0000-0000-0000-000000000003')) as kv(k, rows),
          jsonb_array_elements(kv.rows) as r
    where kv.k in ('memberships', 'navigation', 'locations', 'packages')
      and r ->> 'tenant_id' = 'a8200000-0000-0000-0000-0000000000a1'),
  0, 'C: a user of T2 sees no T1 row in memberships / navigation / locations / packages');

select * from finish();
rollback;
