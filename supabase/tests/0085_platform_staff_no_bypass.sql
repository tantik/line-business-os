-- ============================================================================
-- DB test: migration 0146 (no platform-staff bypass, DEBT-128 / console plan
-- Phase B-0).
-- Run with:  supabase db reset && supabase test db
--   A  helpers: a staff user with no membership is no member, holds no
--      permission (location / tenant-wide), and the bypass text is gone
--   B  a staff JWT sees ZERO rows in every api view, while the tenant's Owner
--      sees rows in the same views (positive control)
--   C  core tables: staff reads no membership / plan / package / override row
--      and only its own core.users row; no policy references is_platform_staff
--   D  the dashboards return no row to staff
--   E  explicit staff capabilities still work: api.is_platform_staff() and the
--      console provisioning list
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core;

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

-- fixtures: tenant T (all modules on, one location) with Owner O and data in
-- several modules; S = platform staff with no membership anywhere.
insert into core.tenants (id, slug, name) values ('a8500000-0000-0000-0000-0000000000a1', 'pgtap-0146-t1', 'pgTAP 0146 T1');
insert into core.tenant_modules (tenant_id, module, is_enabled)
select 'a8500000-0000-0000-0000-0000000000a1', m::core.module_code, true
  from unnest(array['workforce', 'inventory', 'purchases', 'recipes', 'operations', 'issues']) m;
insert into core.locations (id, tenant_id, name, timezone) values
  ('a8510000-0000-0000-0000-000000000001', 'a8500000-0000-0000-0000-0000000000a1', 'T1 / L1', 'Asia/Tokyo');
insert into core.users (id, display_name, is_platform_staff) values
  ('a8590000-0000-0000-0000-000000000001', 'O', false),
  ('a8590000-0000-0000-0000-000000000002', 'S', true);
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a8500000-0000-0000-0000-0000000000a1', 'a8590000-0000-0000-0000-000000000001', 'active');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a8500000-0000-0000-0000-0000000000a1', 'a8590000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', null);
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('a8530000-0000-0000-0000-000000000001', 'a8500000-0000-0000-0000-0000000000a1', 'a8510000-0000-0000-0000-000000000001', null, '\x01');
insert into workforce.shifts (tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('a8500000-0000-0000-0000-0000000000a1', 'a8510000-0000-0000-0000-000000000001', 'a8530000-0000-0000-0000-000000000001', '2026-01-06 00:00:00+00', '2026-01-06 08:00:00+00', true);
insert into inventory.items (tenant_id, location_id, name, unit, required_quantity, reorder_point) values
  ('a8500000-0000-0000-0000-0000000000a1', 'a8510000-0000-0000-0000-000000000001', 'Milk', 'L', 10, 3);
insert into issues.issues (tenant_id, location_id, kind, category, severity, status, note, business_date, reported_by, reported_by_role) values
  ('a8500000-0000-0000-0000-0000000000a1', 'a8510000-0000-0000-0000-000000000001', 'issue', 'equipment', 'normal', 'open', 'fridge', '2026-01-05', 'a8590000-0000-0000-0000-000000000001', 'manager');

-- rows visible to a user in every api view: a 42501 refusal counts 0 rows;
-- any other error is returned as -1 so it fails the checks below
create function pg_temp.view_rows(p_uid text) returns table (view_name text, n int) language plpgsql as $$
declare r record; v text;
begin
  for r in select c.relname from pg_class c where c.relnamespace = 'api'::regnamespace and c.relkind = 'v' order by 1 loop
    v := pg_temp.as_user(p_uid, format('select count(*)::text from api.%I', r.relname));
    view_name := r.relname;
    n := case when v like 'ERR 42501 %' then 0 when v like 'ERR %' then -1 else v::int end;
    return next;
  end loop;
end $$;

-- A: helpers -------------------------------------------------------------------------------------
select is(pg_temp.as_user('a8590000-0000-0000-0000-000000000002', $$select core.is_member_of('a8500000-0000-0000-0000-0000000000a1')::text$$),
  'false', 'A: platform staff with no membership is not a member');
select is(pg_temp.as_user('a8590000-0000-0000-0000-000000000002', $$select core.has_permission('a8500000-0000-0000-0000-0000000000a1', 'workforce.staff.manage', 'a8510000-0000-0000-0000-000000000001')::text$$),
  'false', 'A: platform staff holds no location permission');
select is(pg_temp.as_user('a8590000-0000-0000-0000-000000000002', $$select core.has_permission_in_tenant('a8500000-0000-0000-0000-0000000000a1', 'core.role.manage')::text$$),
  'false', 'A: platform staff holds no tenant-wide permission');
select is(pg_temp.as_user('a8590000-0000-0000-0000-000000000001', $$select core.is_member_of('a8500000-0000-0000-0000-0000000000a1')::text$$),
  'true', 'A: ... while the Owner is a member (control)');
select is(
  (select count(*)::int from pg_proc p
    where p.oid in ('core.is_member_of(uuid)'::regprocedure, 'core.has_permission(uuid, text, uuid)'::regprocedure,
                    'core.has_permission_in_tenant(uuid, text)'::regprocedure)
      and p.prosrc ilike '%is_platform_staff%'),
  0, 'A: no access helper calls is_platform_staff()');

-- B: every api view ---------------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(view_name || '=' || n, ', '), '') from pg_temp.view_rows('a8590000-0000-0000-0000-000000000002') where n <> 0),
  '', 'B: a platform-staff JWT sees zero rows in every api view (no view errors except a 42501 refusal)');
select is(
  (select coalesce(string_agg(view_name, ', '), '') from pg_temp.view_rows('a8590000-0000-0000-0000-000000000001') where n < 0),
  '', 'B: no api view errors for the Owner either');
select cmp_ok(
  (select sum(n)::int from pg_temp.view_rows('a8590000-0000-0000-0000-000000000001')), '>=', 4,
  'B: ... while the Owner sees the tenant''s rows in the same views (control)');

-- C: core tables -------------------------------------------------------------------------------------
select is(pg_temp.as_user('a8590000-0000-0000-0000-000000000002', 'select count(*)::text from core.tenant_memberships'), '0',
  'C: staff reads no membership');
select is(pg_temp.as_user('a8590000-0000-0000-0000-000000000002', 'select count(*)::text from core.tenant_plans'), '0',
  'C: staff reads no tenant plan');
select is(pg_temp.as_user('a8590000-0000-0000-0000-000000000002', 'select count(*)::text from core.tenant_packages'), '0',
  'C: staff reads no tenant package');
select is(pg_temp.as_user('a8590000-0000-0000-0000-000000000002', 'select count(*)::text from core.tenant_module_overrides'), '0',
  'C: staff reads no module override');
-- authenticated holds no SELECT on core.users; its policy is the second line and is self-only now
select is((select qual from pg_policies where schemaname = 'core' and tablename = 'users' and policyname = 'users_self_select'),
  '(id = current_user_id())', 'C: core.users select policy is own row only');
select is(
  (select count(*)::int from pg_policies where qual ilike '%is_platform_staff%' or with_check ilike '%is_platform_staff%'),
  0, 'C: no RLS policy references is_platform_staff()');

-- D: dashboards ------------------------------------------------------------------------------------
select is(
  pg_temp.as_user('a8590000-0000-0000-0000-000000000002',
    $$select count(*)::text from jsonb_each(api.staff_dashboard('a8500000-0000-0000-0000-0000000000a1', 'a8510000-0000-0000-0000-000000000001',
      '{"parts": ["staffRoster", "inventoryActiveItems", "issuesOpen", "myAttendance"]}')) kv, jsonb_array_elements(kv.value -> 'rows') r$$),
  '0', 'D: staff_dashboard returns no row to staff');
select is(
  pg_temp.as_user('a8590000-0000-0000-0000-000000000001',
    $$select (count(*) > 0)::text from jsonb_each(api.staff_dashboard('a8500000-0000-0000-0000-0000000000a1', 'a8510000-0000-0000-0000-000000000001',
      '{"parts": ["staffRoster", "inventoryActiveItems", "issuesOpen", "myAttendance"]}')) kv, jsonb_array_elements(kv.value -> 'rows') r$$),
  'true', 'D: ... while the Owner gets rows (control)');

-- E: explicit staff capabilities ------------------------------------------------------------------
select is(pg_temp.as_user('a8590000-0000-0000-0000-000000000002', 'select api.is_platform_staff()::text'), 'true',
  'E: api.is_platform_staff() is still true for staff (console gate)');
select is(pg_temp.as_user('a8590000-0000-0000-0000-000000000001', 'select api.is_platform_staff()::text'), 'false',
  'E: ... and false for an Owner');
select ok(pg_temp.as_user('a8590000-0000-0000-0000-000000000002', 'select count(*)::text from api.platform_tenant_provisioning_list()') not like 'ERR %',
  'E: the console provisioning list still works for staff');

select * from finish();
rollback;
