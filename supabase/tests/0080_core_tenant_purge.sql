-- ============================================================================
-- DB test: migration 0141 (deliberate physical tenant deletion, DEBT-103).
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--   A  grants / SECURITY DEFINER / pinned search_path; tombstone table closed
--   B  refusals: null args, unknown tenant, wrong slug, not archived,
--      client_template, authenticated / anon cannot execute
--   C  dry run: figures returned, nothing written anywhere
--   D  real run (tenant A, provisioned + extra rows): every A row gone incl.
--      audit.audit_logs and core.events; tenant B untouched (incl. its audit
--      rows); exactly one tombstone matching the dry run; storage object
--      listed but kept; orphan user kept without the flag
--   E  after the purge, same transaction: audit / event UPDATE still refused,
--      DELETE of another tenant's audit / event row still refused (also with
--      the purge GUC forged to that live tenant)
--   F  real run with p_delete_orphan_auth_users (tenant C): the orphan user
--      is deleted from core.users + auth.users, a user with another
--      membership and a platform-staff member are kept
--   G  a purged tenant cannot be purged again
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit;

select no_plan();

create function pg_temp.svc(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  execute p_sql into v;
  reset role;
  return v;
end $$;

create function pg_temp.svc_err(p_sql text) returns text language plpgsql as $$
begin
  set local role service_role;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;

create function pg_temp.role_err(p_role text, p_sql text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', 'b1490000-0000-0000-0000-000000000001', true);
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return 'ok';
exception when others then
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return sqlstate;
end $$;

-- fixtures ------------------------------------------------------------------------------------
-- Users: 01 platform staff (actor; also member of A and C), 11 A-only (orphan of A),
-- 12 member of A and B, 21 C-only (orphan of C), 22 member of C and B.
insert into core.users (id, display_name, is_platform_staff) values
  ('b1490000-0000-0000-0000-000000000001', 'ORUWA staff', true),
  ('b1490000-0000-0000-0000-000000000011', 'A only', false),
  ('b1490000-0000-0000-0000-000000000012', 'A and B', false),
  ('b1490000-0000-0000-0000-000000000021', 'C only', false),
  ('b1490000-0000-0000-0000-000000000022', 'C and B', false);
insert into auth.users (id, aud, role, email)
select u::uuid, 'authenticated', 'authenticated', 'pgtap-0141-' || right(u, 2) || '@example.invalid'
  from unnest(array['b1490000-0000-0000-0000-000000000001', 'b1490000-0000-0000-0000-000000000011',
                    'b1490000-0000-0000-0000-000000000012', 'b1490000-0000-0000-0000-000000000021',
                    'b1490000-0000-0000-0000-000000000022']) u;

-- Tenant A: a full provisioning run (tenant, plan, package modules, settings, shift
-- types, HACCP checklists, status row, audit rows) plus members, an employee, an
-- extra audit row, an event and a storage object.
create temp table res (label text primary key, r jsonb);
insert into res select 'prov', core.provision_tenant(
  'b1410000-0000-0000-0000-0000000000a0',
  jsonb_build_object(
    'slug', 'pgtap-0141-a',
    'business_name', 'pgTAP 0141 A',
    'location', jsonb_build_object('name', 'A / L1', 'timezone', 'Asia/Tokyo'),
    'plan', jsonb_build_object('code', 'trial', 'trial_days', 30),
    'package_code', 'cafe',
    'template_version', 3,
    'schedule_settings', jsonb_build_object('max_monthly_hours', 160, 'auto_create_enabled', false),
    'shift_types', jsonb_build_array(
      jsonb_build_object('code', 'EARLY', 'label_ja', '早番', 'starts_at_local', '07:00', 'ends_at_local', '12:00')),
    'operations', jsonb_build_object('manifest_version', 1, 'templates', jsonb_build_array(
      jsonb_build_object('name', '開店チェック', 'due_time', '07:30', 'recurrence_kind', 'daily', 'items', jsonb_build_array(
        jsonb_build_object('label', '冷蔵庫温度', 'response_type', 'numeric', 'is_critical', true, 'is_required', true,
                           'numeric_min', 0, 'numeric_max', 5, 'numeric_unit', '°C')))))),
  'b1490000-0000-0000-0000-000000000001');
create temp table ids as
  select (r ->> 'tenant_id')::uuid as a, (r ->> 'location_id')::uuid as a_loc from res where label = 'prov';
create function pg_temp.a() returns uuid language sql as $$ select a from ids $$;
create function pg_temp.a_loc() returns uuid language sql as $$ select a_loc from ids $$;

insert into core.tenants (id, slug, name, kind, status) values
  ('b1400000-0000-0000-0000-0000000000b0', 'pgtap-0141-b', 'pgTAP 0141 B', 'client', 'active'),
  ('b1400000-0000-0000-0000-0000000000c0', 'pgtap-0141-c', 'pgTAP 0141 C', 'client', 'archived'),
  ('b1400000-0000-0000-0000-0000000000f0', 'pgtap-0141-t', 'pgTAP 0141 template', 'client_template', 'archived');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('b1400000-0000-0000-0000-0000000000b0', 'workforce', true),
  ('b1400000-0000-0000-0000-0000000000c0', 'workforce', true);
insert into core.locations (id, tenant_id, name) values
  ('b1410000-0000-0000-0000-0000000000b1', 'b1400000-0000-0000-0000-0000000000b0', 'B / L1'),
  ('b1410000-0000-0000-0000-0000000000c1', 'b1400000-0000-0000-0000-0000000000c0', 'C / L1');

insert into core.tenant_memberships (tenant_id, user_id, status)
select pg_temp.a(), u::uuid, 'active'
  from unnest(array['b1490000-0000-0000-0000-000000000001', 'b1490000-0000-0000-0000-000000000011',
                    'b1490000-0000-0000-0000-000000000012']) u;
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('b1400000-0000-0000-0000-0000000000b0', 'b1490000-0000-0000-0000-000000000012', 'active'),
  ('b1400000-0000-0000-0000-0000000000b0', 'b1490000-0000-0000-0000-000000000022', 'active'),
  ('b1400000-0000-0000-0000-0000000000c0', 'b1490000-0000-0000-0000-000000000001', 'active'),
  ('b1400000-0000-0000-0000-0000000000c0', 'b1490000-0000-0000-0000-000000000021', 'active'),
  ('b1400000-0000-0000-0000-0000000000c0', 'b1490000-0000-0000-0000-000000000022', 'active');
-- role ids: tenant_owner=...003, employee=...006
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  (pg_temp.a(), 'b1490000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000003', null),
  (pg_temp.a(), 'b1490000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000006', pg_temp.a_loc()),
  ('b1400000-0000-0000-0000-0000000000b0', 'b1490000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000006', 'b1410000-0000-0000-0000-0000000000b1'),
  ('b1400000-0000-0000-0000-0000000000c0', 'b1490000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000003', null);
insert into workforce.employees (tenant_id, location_id, name_encrypted, user_id, is_active) values
  (pg_temp.a(), pg_temp.a_loc(), convert_to('A12', 'UTF8'), 'b1490000-0000-0000-0000-000000000012', true),
  ('b1400000-0000-0000-0000-0000000000b0', 'b1410000-0000-0000-0000-0000000000b1', convert_to('B12', 'UTF8'), 'b1490000-0000-0000-0000-000000000012', true);
insert into audit.audit_logs (tenant_id, actor_kind, module, entity, entity_id, action) values
  (pg_temp.a(), 'system', 'core', 'pgtap', 'a', 'touch'),
  ('b1400000-0000-0000-0000-0000000000b0', 'system', 'core', 'pgtap', 'b1', 'touch'),
  ('b1400000-0000-0000-0000-0000000000b0', 'system', 'core', 'pgtap', 'b2', 'touch'),
  ('b1400000-0000-0000-0000-0000000000c0', 'system', 'core', 'pgtap', 'c', 'touch');
insert into core.events (tenant_id, module, event_type) values
  (pg_temp.a(), 'core', 'pgtap.a'),
  ('b1400000-0000-0000-0000-0000000000b0', 'core', 'pgtap.b');
insert into storage.objects (bucket_id, name)
values ('recipe-media', pg_temp.a()::text || '/' || pg_temp.a_loc()::text
        || '/b1420000-0000-0000-0000-000000000001/b1420000-0000-0000-0000-000000000002.jpg');

-- Global row counts (unchanged = nothing written / deleted).
create function pg_temp.snapshot() returns text language sql as $$
  select concat_ws(',',
    (select count(*) from core.tenants), (select count(*) from core.locations),
    (select count(*) from core.tenant_memberships), (select count(*) from core.role_assignments),
    (select count(*) from core.tenant_modules), (select count(*) from workforce.employees),
    (select count(*) from workforce.shift_types), (select count(*) from operations.checklist_items),
    (select count(*) from audit.audit_logs), (select count(*) from core.events),
    (select count(*) from core.users), (select count(*) from auth.users),
    (select count(*) from audit.tenant_purge_log), (select count(*) from storage.objects));
$$;
-- Tenant B, including the exact content of its audit / event rows.
create function pg_temp.b_snapshot() returns text language sql as $$
  select concat_ws(',',
    (select count(*) from core.tenants where id = 'b1400000-0000-0000-0000-0000000000b0'),
    (select count(*) from core.locations where tenant_id = 'b1400000-0000-0000-0000-0000000000b0'),
    (select count(*) from core.tenant_memberships where tenant_id = 'b1400000-0000-0000-0000-0000000000b0'),
    (select count(*) from core.role_assignments where tenant_id = 'b1400000-0000-0000-0000-0000000000b0'),
    (select count(*) from workforce.employees where tenant_id = 'b1400000-0000-0000-0000-0000000000b0'),
    (select md5(jsonb_agg(to_jsonb(al) order by al.id)::text) from audit.audit_logs al where tenant_id = 'b1400000-0000-0000-0000-0000000000b0'),
    (select md5(jsonb_agg(to_jsonb(e) order by e.id)::text) from core.events e where tenant_id = 'b1400000-0000-0000-0000-0000000000b0'));
$$;
create temp table snap (label text primary key, v text);

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('authenticated', 'core.purge_tenant(uuid, text, boolean, boolean)', 'execute'), false, 'A: authenticated cannot execute core.purge_tenant');
select is(has_function_privilege('anon', 'core.purge_tenant(uuid, text, boolean, boolean)', 'execute'), false, 'A: anon cannot execute core.purge_tenant');
select is(has_function_privilege('service_role', 'core.purge_tenant(uuid, text, boolean, boolean)', 'execute'), true, 'A: service_role can execute core.purge_tenant');
select is((select prosecdef from pg_proc where oid = 'core.purge_tenant(uuid, text, boolean, boolean)'::regprocedure), true, 'A: purge_tenant is SECURITY DEFINER');
select is((select proconfig from pg_proc where oid = 'core.purge_tenant(uuid, text, boolean, boolean)'::regprocedure), array['search_path=""'], 'A: purge_tenant has an empty pinned search_path');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'core.purge_tenant(uuid, text, boolean, boolean)'::regprocedure), 'postgres', 'A: owned by postgres');
select is(has_table_privilege('authenticated', 'audit.tenant_purge_log', 'select'), false, 'A: authenticated cannot read tombstones');
select is(has_table_privilege('anon', 'audit.tenant_purge_log', 'select'), false, 'A: anon cannot read tombstones');
select is(has_table_privilege('service_role', 'audit.tenant_purge_log', 'insert'), false, 'A: service_role cannot write tombstones directly');
select is((select relrowsecurity from pg_class where oid = 'audit.tenant_purge_log'::regclass), true, 'A: RLS enabled on the tombstone table');
select is(pg_temp.role_err('authenticated', $$ select core.purge_tenant('b1400000-0000-0000-0000-0000000000c0', 'pgtap-0141-c', true, false) $$),
  '42501', 'A: a signed-in (even platform-staff) session cannot call it');
select is(pg_temp.role_err('anon', $$ select core.purge_tenant('b1400000-0000-0000-0000-0000000000c0', 'pgtap-0141-c', true, false) $$),
  '42501', 'A: anon cannot call it');

-- B: refusals ---------------------------------------------------------------------------------
insert into snap values ('before_b', pg_temp.snapshot());
select matches(pg_temp.svc_err($$ select core.purge_tenant(null, 'x', true, false) $$), '^22004 invalid_argument', 'B: null tenant id refused (22004)');
select matches(pg_temp.svc_err($$ select core.purge_tenant('b1400000-0000-0000-0000-0000000000c0', null, true, false) $$), '^22004 invalid_argument', 'B: null slug refused (22004)');
select is(pg_temp.svc_err($$ select core.purge_tenant('b1400000-0000-0000-0000-0000000000ee', 'nope', true, false) $$), 'P0002 tenant_not_found', 'B: unknown tenant refused');
select is(pg_temp.svc_err($$ select core.purge_tenant('b1400000-0000-0000-0000-0000000000c0', 'pgtap-0141-C', true, false) $$), 'P0001 confirm_slug_mismatch', 'B: slug must match exactly');
select is(pg_temp.svc_err($$ select core.purge_tenant('b1400000-0000-0000-0000-0000000000c0', 'pgtap-0141-b', false, false) $$), 'P0001 confirm_slug_mismatch', 'B: another tenant''s slug refused (real run)');
select is(pg_temp.svc_err($$ select core.purge_tenant('b1400000-0000-0000-0000-0000000000b0', 'pgtap-0141-b', false, false) $$), 'P0001 tenant_not_archived', 'B: active tenant refused (real run)');
select is(pg_temp.svc_err(format($$ select core.purge_tenant(%L, 'pgtap-0141-a', true, false) $$, pg_temp.a())), 'P0001 tenant_not_archived', 'B: active tenant refused (dry run too)');
select is(pg_temp.svc_err($$ select core.purge_tenant('b1400000-0000-0000-0000-0000000000f0', 'pgtap-0141-t', false, false) $$), 'P0001 tenant_protected', 'B: client_template tenant refused');
select is(pg_temp.snapshot(), (select v from snap where label = 'before_b'), 'B: nothing written or deleted by the refusals');

-- archive A (the policy step before a purge)
update core.tenants set status = 'archived' where id = pg_temp.a();

-- C: dry run ----------------------------------------------------------------------------------
insert into snap values ('before_c', pg_temp.snapshot());
insert into snap values ('b_before', pg_temp.b_snapshot());
insert into res select 'dry', pg_temp.svc(format($$ select core.purge_tenant(%L, 'pgtap-0141-a') $$, pg_temp.a()));
insert into res select 'dry_flag', pg_temp.svc(format($$ select core.purge_tenant(%L, 'pgtap-0141-a', true, true) $$, pg_temp.a()));
select is(pg_temp.snapshot(), (select v from snap where label = 'before_c'), 'C: dry runs (default and with the user flag) write / delete nothing');
select is((select r ->> 'dry_run' from res where label = 'dry'), 'true', 'C: default is a dry run');
select is((select r -> 'row_counts' ->> 'core.tenants' from res where label = 'dry'), '1', 'C: counts the tenant row');
select is((select r -> 'row_counts' ->> 'core.locations' from res where label = 'dry'), '1', 'C: counts the location');
select is((select (r -> 'row_counts' ->> 'core.tenant_memberships')::int from res where label = 'dry'), 3, 'C: counts the memberships');
select is((select (r -> 'row_counts' ->> 'workforce.employees')::int from res where label = 'dry'), 1, 'C: counts the employee');
select is((select (r -> 'row_counts' ->> 'operations.checklist_items')::int from res where label = 'dry'), 1, 'C: counts the HACCP item');
select is((select (r -> 'row_counts' ->> 'core.tenant_provisioning')::int from res where label = 'dry'), 1, 'C: counts the provisioning status row');
select is((select (r -> 'row_counts' ->> 'audit.audit_logs')::bigint from res where label = 'dry'),
          (select count(*) from audit.audit_logs where tenant_id = pg_temp.a()), 'C: row_counts.audit.audit_logs = actual');
select cmp_ok((select (r ->> 'audit_row_count')::int from res where label = 'dry'), '>=', 2, 'C: provisioning + fixture audit rows counted');
select is((select (r ->> 'audit_row_count')::bigint from res where label = 'dry'),
          (select count(*) from audit.audit_logs where tenant_id = pg_temp.a()), 'C: audit_row_count = actual');
select is((select r ->> 'audit_digest' from res where label = 'dry'),
          (select encode(sha256(convert_to(jsonb_agg(to_jsonb(al) order by al.id)::text, 'UTF8')), 'hex')
             from audit.audit_logs al where tenant_id = pg_temp.a()), 'C: audit_digest = sha256 of the ordered audit rows');
select is((select (r ->> 'event_row_count')::int from res where label = 'dry'), 1, 'C: event count');
select is((select (r ->> 'storage_object_count')::int from res where label = 'dry'), 1, 'C: one storage object');
select is((select r -> 'storage_objects' -> 0 ->> 'bucket' from res where label = 'dry'), 'recipe-media', 'C: storage object bucket listed');
select ok((select r -> 'storage_objects' -> 0 ->> 'name' from res where label = 'dry') like pg_temp.a()::text || '/%', 'C: storage object name listed');
select is((select r -> 'orphan_user_ids' from res where label = 'dry'), '["b1490000-0000-0000-0000-000000000011"]'::jsonb,
  'C: only the A-only user is an orphan (platform staff and the B member are not)');
select is((select r ->> 'deleted_auth_user_count' from res where label = 'dry_flag'), '0', 'C: dry run with the flag deletes no user');
select ok((select r ->> 'row_counts' from res where label = 'dry') is not null and (select r -> 'row_counts' ? 'core.locations' from res where label = 'dry_flag'), 'C: both dry runs return counts');

-- D: real run on A (no user flag) --------------------------------------------------------------
insert into res select 'real', pg_temp.svc(format($$ select core.purge_tenant(%L, 'pgtap-0141-a', false, false) $$, pg_temp.a()));
select is((select r ->> 'dry_run' from res where label = 'real'), 'false', 'D: real run reported');
select is((select count(*)::int from core.tenants where id = pg_temp.a()), 0, 'D: tenant row gone');
select is((select count(*)::int from core.locations where tenant_id = pg_temp.a()), 0, 'D: locations gone');
select is((select count(*)::int from core.tenant_memberships where tenant_id = pg_temp.a()), 0, 'D: memberships gone');
select is((select count(*)::int from core.role_assignments where tenant_id = pg_temp.a()), 0, 'D: role assignments gone');
select is((select count(*)::int from core.tenant_modules where tenant_id = pg_temp.a()), 0, 'D: module rows gone');
select is((select count(*)::int from core.tenant_plans where tenant_id = pg_temp.a()), 0, 'D: plan gone');
select is((select count(*)::int from workforce.employees where tenant_id = pg_temp.a()), 0, 'D: employees gone');
select is((select count(*)::int from workforce.shift_types where tenant_id = pg_temp.a()), 0, 'D: shift types gone');
select is((select count(*)::int from operations.checklist_items where tenant_id = pg_temp.a()), 0, 'D: HACCP items gone');
select is((select count(*)::int from audit.audit_logs where tenant_id = pg_temp.a()), 0, 'D: audit rows gone');
select is((select count(*)::int from core.events where tenant_id = pg_temp.a()), 0, 'D: events gone');
select is((select count(*)::int || '/' || count(tenant_id)::int from core.tenant_provisioning where slug = 'pgtap-0141-a'), '1/0',
  'D: provisioning status row kept with tenant_id null (slug stays reserved)');
select is(pg_temp.b_snapshot(), (select v from snap where label = 'b_before'), 'D: tenant B untouched, incl. its audit and event rows');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'b1400000-0000-0000-0000-0000000000c0'), 1, 'D: tenant C audit row untouched');
select is((select count(*)::int from audit.tenant_purge_log where tenant_id = pg_temp.a()), 1, 'D: exactly one tombstone');
select is((select row_counts from audit.tenant_purge_log where tenant_id = pg_temp.a()),
          (select r -> 'row_counts' from res where label = 'dry'), 'D: tombstone row_counts = dry run');
select is((select audit_row_count || '/' || audit_digest || '/' || event_row_count || '/' || deleted_auth_user_count || '/' || tenant_slug
             from audit.tenant_purge_log where tenant_id = pg_temp.a()),
          (select (r ->> 'audit_row_count') || '/' || (r ->> 'audit_digest') || '/' || (r ->> 'event_row_count') || '/0/pgtap-0141-a'
             from res where label = 'dry'), 'D: tombstone audit count / digest / event count / user count / slug = dry run');
select is((select r -> 'row_counts' from res where label = 'real'), (select r -> 'row_counts' from res where label = 'dry'), 'D: real-run counts = dry run');
select ok((select purged_by <> '' and purged_at is not null from audit.tenant_purge_log where tenant_id = pg_temp.a()), 'D: tombstone has purged_by / purged_at');
select is(coalesce(current_setting('oruwa.purge_tenant_id', true), ''), '', 'D: purge GUC reset');
select is((select count(*)::int from core.users where id in ('b1490000-0000-0000-0000-000000000011', 'b1490000-0000-0000-0000-000000000012', 'b1490000-0000-0000-0000-000000000001')), 3,
  'D: without the flag no core.users row is deleted');
select is((select count(*)::int from auth.users where id = 'b1490000-0000-0000-0000-000000000011'), 1, 'D: without the flag the orphan auth user stays');
select is((select count(*)::int from storage.objects where split_part(name, '/', 1) = pg_temp.a()::text), 1, 'D: storage object kept (Storage API step)');
select is((select (r ->> 'storage_object_count')::int from res where label = 'real'), 1, 'D: real run lists the storage object');

-- E: append-only still holds after the purge ---------------------------------------------------
select throws_ok($$ update audit.audit_logs set action = 'x' where tenant_id = 'b1400000-0000-0000-0000-0000000000b0' $$,
  'P0001', 'audit.audit_logs is append-only', 'E: audit UPDATE refused');
select throws_ok($$ delete from audit.audit_logs where tenant_id = 'b1400000-0000-0000-0000-0000000000b0' $$,
  'P0001', 'audit.audit_logs is append-only', 'E: DELETE of another tenant''s audit row refused');
select set_config('oruwa.purge_tenant_id', 'b1400000-0000-0000-0000-0000000000b0', true);
select throws_ok($$ delete from audit.audit_logs where tenant_id = 'b1400000-0000-0000-0000-0000000000b0' $$,
  'P0001', 'audit.audit_logs is append-only', 'E: forged purge GUC cannot delete a live tenant''s audit rows');
select throws_ok($$ update audit.audit_logs set action = 'x' where tenant_id = 'b1400000-0000-0000-0000-0000000000b0' $$,
  'P0001', 'audit.audit_logs is append-only', 'E: forged purge GUC cannot update audit rows');
select throws_ok($$ delete from core.events where tenant_id = 'b1400000-0000-0000-0000-0000000000b0' $$,
  'P0001', 'core.events is append-only', 'E: forged purge GUC cannot delete a live tenant''s events');
select set_config('oruwa.purge_tenant_id', '', true);
select throws_ok($$ update core.events set event_type = 'x' where tenant_id = 'b1400000-0000-0000-0000-0000000000b0' $$,
  'P0001', 'core.events is append-only', 'E: event UPDATE refused');
select throws_ok($$ delete from core.events where tenant_id = 'b1400000-0000-0000-0000-0000000000b0' $$,
  'P0001', 'core.events is append-only', 'E: event DELETE refused');
select is(pg_temp.b_snapshot(), (select v from snap where label = 'b_before'), 'E: tenant B still untouched');

-- F: real run on C with the orphan-user flag -------------------------------------------------
insert into res select 'c_real', pg_temp.svc($$ select core.purge_tenant('b1400000-0000-0000-0000-0000000000c0', 'pgtap-0141-c', false, true) $$);
select is((select r -> 'orphan_user_ids' from res where label = 'c_real'), '["b1490000-0000-0000-0000-000000000021"]'::jsonb, 'F: one orphan user');
select is((select (r ->> 'deleted_auth_user_count')::int from res where label = 'c_real'), 1, 'F: one user deleted');
select is((select count(*)::int from core.users where id = 'b1490000-0000-0000-0000-000000000021'), 0, 'F: orphan gone from core.users');
select is((select count(*)::int from auth.users where id = 'b1490000-0000-0000-0000-000000000021'), 0, 'F: orphan gone from auth.users');
select is((select count(*)::int from core.users where id in ('b1490000-0000-0000-0000-000000000022', 'b1490000-0000-0000-0000-000000000001')), 2,
  'F: the user with a B membership and the platform-staff member keep core.users');
select is((select count(*)::int from auth.users where id in ('b1490000-0000-0000-0000-000000000022', 'b1490000-0000-0000-0000-000000000001')), 2,
  'F: ... and auth.users');
select is((select count(*)::int from core.tenant_memberships where user_id = 'b1490000-0000-0000-0000-000000000022'), 1, 'F: the B membership of that user stays');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'b1400000-0000-0000-0000-0000000000c0'), 0, 'F: C audit row gone');
select is((select deleted_auth_user_count from audit.tenant_purge_log where tenant_id = 'b1400000-0000-0000-0000-0000000000c0'), 1, 'F: tombstone records the user deletion');
select is((select count(*)::int from audit.tenant_purge_log), 2, 'F: one tombstone per purge');
select is(pg_temp.b_snapshot(), (select v from snap where label = 'b_before'), 'F: tenant B still untouched');

-- G: no second purge ---------------------------------------------------------------------------
select is(pg_temp.svc_err(format($$ select core.purge_tenant(%L, 'pgtap-0141-a', false, false) $$, pg_temp.a())), 'P0002 tenant_not_found', 'G: purged tenant cannot be purged again');

select * from finish();
rollback;
