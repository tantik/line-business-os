-- ============================================================================
-- DB test: migration 0150 (inventory-media policies use objects.name).
-- Run with:  supabase db reset && supabase test db
--   M manager T1/L1, E employee T1/L1, X manager of T2.
--   upload own location item: ok; read back: M and E yes, X no;
--   foreign location / unknown item / other tenant: refused; module off: refused.
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core;

select plan(9);

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
  return 'ERR ' || sqlstate;
end $$;

insert into core.tenants (id, slug, name) values
  ('a9000000-0000-0000-0000-0000000000a1', 'pgtap-0150m-t1', 'pgTAP 0150m T1'),
  ('a9000000-0000-0000-0000-0000000000a2', 'pgtap-0150m-t2', 'pgTAP 0150m T2');
insert into core.tenant_modules (tenant_id, module, is_enabled)
select t, 'inventory'::core.module_code, true
  from unnest(array['a9000000-0000-0000-0000-0000000000a1', 'a9000000-0000-0000-0000-0000000000a2']::uuid[]) t;
insert into core.locations (id, tenant_id, name, timezone) values
  ('a9010000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000a1', 'T1 / L1', 'Asia/Tokyo'),
  ('a9010000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-0000000000a1', 'T1 / L2', 'Asia/Tokyo'),
  ('a9010000-0000-0000-0000-000000000003', 'a9000000-0000-0000-0000-0000000000a2', 'T2 / L3', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('a9090000-0000-0000-0000-000000000002', 'M'),
  ('a9090000-0000-0000-0000-000000000003', 'E'),
  ('a9090000-0000-0000-0000-000000000005', 'X');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a9000000-0000-0000-0000-0000000000a1', 'a9090000-0000-0000-0000-000000000002', 'active'),
  ('a9000000-0000-0000-0000-0000000000a1', 'a9090000-0000-0000-0000-000000000003', 'active'),
  ('a9000000-0000-0000-0000-0000000000a2', 'a9090000-0000-0000-0000-000000000005', 'active');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a9000000-0000-0000-0000-0000000000a1', 'a9090000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'a9010000-0000-0000-0000-000000000001'),
  ('a9000000-0000-0000-0000-0000000000a1', 'a9090000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'a9010000-0000-0000-0000-000000000001'),
  ('a9000000-0000-0000-0000-0000000000a2', 'a9090000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', null);
-- an item NAME without '/' is exactly what the 0095 bug resolved the path to
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point) values
  ('a90a0000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000a1', 'a9010000-0000-0000-0000-000000000001', '氷', 'pcs', 10, 5),
  ('a90a0000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-0000000000a1', 'a9010000-0000-0000-0000-000000000002', 'Beans', 'kg', 10, 3);

-- path = tenant / location / item / file
create function pg_temp.p(t text, l text, i text) returns text language sql as $$
  select t || '/' || l || '/' || i || '/a90f0000-0000-0000-0000-000000000001.webp';
$$;

select is(pg_temp.as_user('a9090000-0000-0000-0000-000000000002', format(
  $$insert into storage.objects (bucket_id, name) values ('inventory-media', %L) returning 'ok'$$,
  pg_temp.p('a9000000-0000-0000-0000-0000000000a1', 'a9010000-0000-0000-0000-000000000001', 'a90a0000-0000-0000-0000-000000000001'))),
  'ok', 'manager uploads a photo of an item at their location');

select is(pg_temp.as_user('a9090000-0000-0000-0000-000000000002',
  $$select count(*)::text from storage.objects where bucket_id = 'inventory-media'$$),
  '1', 'manager reads the photo back');

select is(pg_temp.as_user('a9090000-0000-0000-0000-000000000003',
  $$select count(*)::text from storage.objects where bucket_id = 'inventory-media'$$),
  '1', 'employee of that location reads the photo');

select is(pg_temp.as_user('a9090000-0000-0000-0000-000000000005',
  $$select count(*)::text from storage.objects where bucket_id = 'inventory-media'$$),
  '0', 'manager of another tenant does not see it');

select is(pg_temp.as_user('a9090000-0000-0000-0000-000000000002', format(
  $$insert into storage.objects (bucket_id, name) values ('inventory-media', %L) returning 'ok'$$,
  pg_temp.p('a9000000-0000-0000-0000-0000000000a1', 'a9010000-0000-0000-0000-000000000002', 'a90a0000-0000-0000-0000-000000000002'))),
  'ERR 42501', 'L1 manager cannot upload for an L2 item');

select is(pg_temp.as_user('a9090000-0000-0000-0000-000000000002', format(
  $$insert into storage.objects (bucket_id, name) values ('inventory-media', %L) returning 'ok'$$,
  pg_temp.p('a9000000-0000-0000-0000-0000000000a1', 'a9010000-0000-0000-0000-000000000001', 'a90a0000-0000-0000-0000-000000000099'))),
  'ERR 42501', 'unknown item id refused');

select is(pg_temp.as_user('a9090000-0000-0000-0000-000000000003', format(
  $$insert into storage.objects (bucket_id, name) values ('inventory-media', %L) returning 'ok'$$,
  replace(pg_temp.p('a9000000-0000-0000-0000-0000000000a1', 'a9010000-0000-0000-0000-000000000001', 'a90a0000-0000-0000-0000-000000000001'), '0001.webp', '0002.webp'))),
  'ERR 42501', 'employee (no item.manage) cannot upload');

select is(pg_temp.as_user('a9090000-0000-0000-0000-000000000005', format(
  $$insert into storage.objects (bucket_id, name) values ('inventory-media', %L) returning 'ok'$$,
  replace(pg_temp.p('a9000000-0000-0000-0000-0000000000a1', 'a9010000-0000-0000-0000-000000000001', 'a90a0000-0000-0000-0000-000000000001'), '0001.webp', '0003.webp'))),
  'ERR 42501', 'other tenant manager cannot upload into T1');

update core.tenant_modules set is_enabled = false
 where tenant_id = 'a9000000-0000-0000-0000-0000000000a1' and module = 'inventory';
select is(pg_temp.as_user('a9090000-0000-0000-0000-000000000002', format(
  $$insert into storage.objects (bucket_id, name) values ('inventory-media', %L) returning 'ok'$$,
  replace(pg_temp.p('a9000000-0000-0000-0000-0000000000a1', 'a9010000-0000-0000-0000-000000000001', 'a90a0000-0000-0000-0000-000000000001'), '0001.webp', '0004.webp'))),
  'ERR 42501', 'module off: upload refused');

select * from finish();
rollback;
