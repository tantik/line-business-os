-- ============================================================================
-- DB test: migration 0148 (orphan users on tenant purge, unreferenced-user
-- cleanup; DEBT-103 b).
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--   A  grants / SECURITY DEFINER / pinned search_path; user_purge_log closed;
--      core.user_is_referenced callable by nobody
--   B  core.purge_tenant dry run on archived tenant P: orphan candidates are
--      the invitee who never accepted (employee link + pending invitation),
--      the Owner invitee and a member referenced only by P's provisioning
--      row; kept: platform staff, a user with a pending invitation in Q, a
--      user with an employee row in Q, a user who is an audit actor in Q
--   C  real run with the flag: the two invitees are deleted (core + auth),
--      the provisioning requester is kept (its row survives the cascade with
--      tenant_id null); tombstone records 2; Q untouched
--   D  core.purge_unreferenced_users: refusals (null, real run with an empty
--      list, unknown id, platform staff, referenced user), all or nothing,
--      dry run writes nothing, listing contains the dangling users only,
--      real run deletes core + auth users and logs one row per user;
--      authenticated / anon cannot execute
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
  return sqlstate || ' ' || split_part(sqlerrm, ':', 1);
end $$;

create function pg_temp.role_err(p_role text, p_sql text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', 'b1590000-0000-0000-0000-000000000031', true);
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
-- P = tenant to purge (archived), Q = live tenant.
-- Users: 01 platform staff (member of P), 31 P invitee (employee link + pending invitation),
-- 32 P Owner invitee (tenant invitation), 33 P invitee + pending invitation in Q,
-- 34 P employee + employee in Q, 35 P member + audit actor in Q, 36 P member + P provisioning
-- requester, 41 dangling (core + auth, no reference), 42 dangling auth-only.
insert into core.users (id, display_name, is_platform_staff) values
  ('b1590000-0000-0000-0000-000000000001', 'ORUWA staff', true),
  ('b1590000-0000-0000-0000-000000000031', 'P invitee', false),
  ('b1590000-0000-0000-0000-000000000032', 'P owner invitee', false),
  ('b1590000-0000-0000-0000-000000000033', 'P + Q invitee', false),
  ('b1590000-0000-0000-0000-000000000034', 'P + Q employee', false),
  ('b1590000-0000-0000-0000-000000000035', 'P member, Q actor', false),
  ('b1590000-0000-0000-0000-000000000036', 'P requester', false),
  ('b1590000-0000-0000-0000-000000000037', 'P member, P actor', false),
  ('b1590000-0000-0000-0000-000000000041', 'dangling', false);
insert into auth.users (id, aud, role, email)
select u::uuid, 'authenticated', 'authenticated', 'pgtap-0148-' || right(u, 2) || '@example.invalid'
  from unnest(array['b1590000-0000-0000-0000-000000000001', 'b1590000-0000-0000-0000-000000000031',
                    'b1590000-0000-0000-0000-000000000032', 'b1590000-0000-0000-0000-000000000033',
                    'b1590000-0000-0000-0000-000000000034', 'b1590000-0000-0000-0000-000000000035',
                    'b1590000-0000-0000-0000-000000000036', 'b1590000-0000-0000-0000-000000000037',
                    'b1590000-0000-0000-0000-000000000041',
                    'b1590000-0000-0000-0000-000000000042']) u;

insert into core.tenants (id, slug, name, kind, status) values
  ('b1500000-0000-0000-0000-0000000000a0', 'pgtap-0148-p', 'pgTAP 0148 P', 'client', 'archived'),
  ('b1500000-0000-0000-0000-0000000000b0', 'pgtap-0148-q', 'pgTAP 0148 Q', 'client', 'active');
insert into core.locations (id, tenant_id, name) values
  ('b1510000-0000-0000-0000-0000000000a1', 'b1500000-0000-0000-0000-0000000000a0', 'P / L1'),
  ('b1510000-0000-0000-0000-0000000000b1', 'b1500000-0000-0000-0000-0000000000b0', 'Q / L1');

insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('b1500000-0000-0000-0000-0000000000a0', 'b1590000-0000-0000-0000-000000000001', 'active'),
  ('b1500000-0000-0000-0000-0000000000a0', 'b1590000-0000-0000-0000-000000000035', 'active'),
  ('b1500000-0000-0000-0000-0000000000a0', 'b1590000-0000-0000-0000-000000000036', 'active'),
  ('b1500000-0000-0000-0000-0000000000a0', 'b1590000-0000-0000-0000-000000000037', 'active');

insert into workforce.employees (id, tenant_id, location_id, name_encrypted, user_id, is_active) values
  ('b1520000-0000-0000-0000-000000000031', 'b1500000-0000-0000-0000-0000000000a0', 'b1510000-0000-0000-0000-0000000000a1', convert_to('P31', 'UTF8'), 'b1590000-0000-0000-0000-000000000031', true),
  ('b1520000-0000-0000-0000-000000000033', 'b1500000-0000-0000-0000-0000000000a0', 'b1510000-0000-0000-0000-0000000000a1', convert_to('P33', 'UTF8'), null, true),
  ('b1520000-0000-0000-0000-0000000000b3', 'b1500000-0000-0000-0000-0000000000b0', 'b1510000-0000-0000-0000-0000000000b1', convert_to('Q33', 'UTF8'), null, true),
  ('b1520000-0000-0000-0000-000000000034', 'b1500000-0000-0000-0000-0000000000a0', 'b1510000-0000-0000-0000-0000000000a1', convert_to('P34', 'UTF8'), 'b1590000-0000-0000-0000-000000000034', true),
  ('b1520000-0000-0000-0000-0000000000b4', 'b1500000-0000-0000-0000-0000000000b0', 'b1510000-0000-0000-0000-0000000000b1', convert_to('Q34', 'UTF8'), 'b1590000-0000-0000-0000-000000000034', false);

insert into workforce.employee_invitations (tenant_id, employee_id, target_user_id, status) values
  ('b1500000-0000-0000-0000-0000000000a0', 'b1520000-0000-0000-0000-000000000031', 'b1590000-0000-0000-0000-000000000031', 'pending'),
  ('b1500000-0000-0000-0000-0000000000a0', 'b1520000-0000-0000-0000-000000000033', 'b1590000-0000-0000-0000-000000000033', 'pending'),
  ('b1500000-0000-0000-0000-0000000000b0', 'b1520000-0000-0000-0000-0000000000b3', 'b1590000-0000-0000-0000-000000000033', 'pending');

insert into core.tenant_invitations (tenant_id, target_user_id, role_key, status) values
  ('b1500000-0000-0000-0000-0000000000a0', 'b1590000-0000-0000-0000-000000000032', 'tenant_owner', 'pending');

insert into core.tenant_provisioning (request_id, tenant_id, slug, status, created_by) values
  ('b1530000-0000-0000-0000-000000000001', 'b1500000-0000-0000-0000-0000000000a0', 'pgtap-0148-p', 'ready', 'b1590000-0000-0000-0000-000000000036');

insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action) values
  ('b1500000-0000-0000-0000-0000000000b0', 'b1590000-0000-0000-0000-000000000035', 'user', 'core', 'pgtap', 'q', 'touch'),
  ('b1500000-0000-0000-0000-0000000000a0', 'b1590000-0000-0000-0000-000000000037', 'user', 'core', 'pgtap', 'p', 'touch');

-- A table created after 0148 with an FK to core.users must be seen by the catalog discovery.
-- (a real table: temp tables cannot reference core.users; the test rolls back)
create table public.pgtap_0148_later_table (id int primary key, owner_id uuid references core.users(id));

create function pg_temp.q_snapshot() returns text language sql as $$
  select concat_ws(',',
    (select count(*) from core.tenants where id = 'b1500000-0000-0000-0000-0000000000b0'),
    (select count(*) from workforce.employees where tenant_id = 'b1500000-0000-0000-0000-0000000000b0'),
    (select count(*) from workforce.employee_invitations where tenant_id = 'b1500000-0000-0000-0000-0000000000b0'),
    (select md5(jsonb_agg(to_jsonb(al) order by al.id)::text) from audit.audit_logs al where tenant_id = 'b1500000-0000-0000-0000-0000000000b0'));
$$;
create function pg_temp.users_snapshot() returns text language sql as $$
  select concat_ws(',', (select count(*) from core.users), (select count(*) from auth.users),
                        (select count(*) from audit.user_purge_log), (select count(*) from audit.tenant_purge_log));
$$;
create temp table res (label text primary key, r jsonb);
create temp table snap (label text primary key, v text);

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('service_role', 'core.user_is_referenced(uuid, uuid)', 'execute'), false, 'A: service_role cannot call the reference helper directly');
select is(has_function_privilege('authenticated', 'core.user_is_referenced(uuid, uuid)', 'execute'), false, 'A: authenticated cannot call the reference helper');
select is(has_function_privilege('anon', 'core.user_is_referenced(uuid, uuid)', 'execute'), false, 'A: anon cannot call the reference helper');
select is(has_function_privilege('authenticated', 'core.purge_unreferenced_users(uuid[], boolean)', 'execute'), false, 'A: authenticated cannot execute purge_unreferenced_users');
select is(has_function_privilege('anon', 'core.purge_unreferenced_users(uuid[], boolean)', 'execute'), false, 'A: anon cannot execute purge_unreferenced_users');
select is(has_function_privilege('service_role', 'core.purge_unreferenced_users(uuid[], boolean)', 'execute'), true, 'A: service_role can execute purge_unreferenced_users');
select is(has_function_privilege('service_role', 'core.purge_tenant(uuid, text, boolean, boolean)', 'execute'), true, 'A: service_role can still execute purge_tenant');
select is(has_function_privilege('authenticated', 'core.purge_tenant(uuid, text, boolean, boolean)', 'execute'), false, 'A: authenticated still cannot execute purge_tenant');
select is((select bool_and(p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'core' and p.proname in ('purge_unreferenced_users', 'purge_tenant')),
  true, 'A: both purge functions are SECURITY DEFINER');
select is((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'core' and p.proname = 'user_is_referenced'),
  false, 'A: the reference helper is SECURITY INVOKER');
select is((select bool_and(p.proconfig @> array['search_path=""']) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'core' and p.proname in ('user_is_referenced', 'purge_unreferenced_users', 'purge_tenant')),
  true, 'A: all three pin search_path to empty');
select is(has_table_privilege('authenticated', 'audit.user_purge_log', 'select'), false, 'A: authenticated cannot read user_purge_log');
select is(has_table_privilege('service_role', 'audit.user_purge_log', 'insert'), false, 'A: service_role cannot write user_purge_log');
select is(has_table_privilege('service_role', 'audit.user_purge_log', 'select'), true, 'A: service_role can read user_purge_log');
select is((select relrowsecurity from pg_class where oid = 'audit.user_purge_log'::regclass), true, 'A: RLS on user_purge_log');

-- B: purge_tenant dry run -----------------------------------------------------------------------
insert into snap values ('before_b', pg_temp.users_snapshot());
insert into snap values ('q_before', pg_temp.q_snapshot());
insert into res select 'dry', pg_temp.svc($$ select core.purge_tenant('b1500000-0000-0000-0000-0000000000a0', 'pgtap-0148-p', true, true) $$);
select is((select r -> 'orphan_user_ids' from res where label = 'dry'),
  '["b1590000-0000-0000-0000-000000000031", "b1590000-0000-0000-0000-000000000032", "b1590000-0000-0000-0000-000000000036", "b1590000-0000-0000-0000-000000000037"]'::jsonb,
  'B: candidates = invitee, Owner invitee, P-only requester, P-only audit actor (staff, Q invitee, Q employee, Q actor kept)');
select is((select (r ->> 'deleted_auth_user_count')::int from res where label = 'dry'), 0, 'B: dry run deletes nobody');
select is((select r -> 'deleted_user_ids' from res where label = 'dry'), '[]'::jsonb, 'B: dry run deleted_user_ids empty');
select is(pg_temp.users_snapshot(), (select v from snap where label = 'before_b'), 'B: dry run wrote nothing');

-- C: real run with the orphan flag --------------------------------------------------------------
insert into res select 'real', pg_temp.svc($$ select core.purge_tenant('b1500000-0000-0000-0000-0000000000a0', 'pgtap-0148-p', false, true) $$);
select is((select r -> 'orphan_user_ids' from res where label = 'real'), (select r -> 'orphan_user_ids' from res where label = 'dry'), 'C: same candidates as the dry run');
select is((select r -> 'deleted_user_ids' from res where label = 'real'),
  '["b1590000-0000-0000-0000-000000000031", "b1590000-0000-0000-0000-000000000032", "b1590000-0000-0000-0000-000000000037"]'::jsonb,
  'C: the two invitees and the P-only audit actor are deleted');
select is((select (r ->> 'deleted_auth_user_count')::int from res where label = 'real'), 3, 'C: deleted_auth_user_count = 3');
select is((select count(*)::int from core.users where id in ('b1590000-0000-0000-0000-000000000031', 'b1590000-0000-0000-0000-000000000032', 'b1590000-0000-0000-0000-000000000037')), 0, 'C: gone from core.users');
select is((select count(*)::int from auth.users where id in ('b1590000-0000-0000-0000-000000000031', 'b1590000-0000-0000-0000-000000000032', 'b1590000-0000-0000-0000-000000000037')), 0, 'C: gone from auth.users');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'b1500000-0000-0000-0000-0000000000a0'), 0, 'C: the P audit row went with the cascade');
select is((select count(*)::int from audit.user_purge_log l join audit.tenant_purge_log t on t.id = l.tenant_purge_log_id
            where l.source = 'purge_tenant' and t.tenant_id = 'b1500000-0000-0000-0000-0000000000a0'), 3,
  'C: one user_purge_log row per deleted user, linked to the tombstone');
select is((select count(*)::int from auth.users where id in (
    'b1590000-0000-0000-0000-000000000001', 'b1590000-0000-0000-0000-000000000033', 'b1590000-0000-0000-0000-000000000034',
    'b1590000-0000-0000-0000-000000000035', 'b1590000-0000-0000-0000-000000000036')), 5,
  'C: staff, Q invitee, Q employee, Q actor and the requester keep auth.users');
select is((select tenant_id from core.tenant_provisioning where request_id = 'b1530000-0000-0000-0000-000000000001'), null::uuid,
  'C: the provisioning row survives with tenant_id null');
select is((select deleted_auth_user_count from audit.tenant_purge_log where tenant_id = 'b1500000-0000-0000-0000-0000000000a0'), 3, 'C: tombstone records 3 deleted users');
select is((select count(*)::int from workforce.employee_invitations where target_user_id = 'b1590000-0000-0000-0000-000000000033'), 1, 'C: the Q invitation stays');
select is(pg_temp.q_snapshot(), (select v from snap where label = 'q_before'), 'C: tenant Q untouched');

-- D: purge_unreferenced_users ------------------------------------------------------------------
insert into snap values ('before_d', pg_temp.users_snapshot());
select is(pg_temp.svc_err($$ select core.purge_unreferenced_users(null) $$), '22004 invalid_argument', 'D: null list refused');
select is(pg_temp.svc_err($$ select core.purge_unreferenced_users('{}'::uuid[], null) $$), '22004 invalid_argument', 'D: null flag refused');
select is(pg_temp.svc_err($$ select core.purge_unreferenced_users(array[null]::uuid[], true) $$), '22004 invalid_argument', 'D: null id refused');
select is(pg_temp.svc_err($$ select core.purge_unreferenced_users('{}'::uuid[], false) $$), '22004 invalid_argument', 'D: real run with an empty list refused');
select is(pg_temp.svc_err($$ select core.purge_unreferenced_users(array['b1590000-0000-0000-0000-0000000000ff']::uuid[], true) $$), 'P0002 user_not_found', 'D: unknown id refused');
select is(pg_temp.svc_err($$ select core.purge_unreferenced_users(array['b1590000-0000-0000-0000-000000000001']::uuid[], false) $$), 'P0001 user_protected', 'D: platform staff refused');
select is(pg_temp.svc_err($$ select core.purge_unreferenced_users(array['b1590000-0000-0000-0000-000000000033']::uuid[], false) $$), 'P0001 user_referenced', 'D: user with a Q invitation refused');
select is(pg_temp.svc_err($$ select core.purge_unreferenced_users(array['b1590000-0000-0000-0000-000000000036']::uuid[], false) $$), 'P0001 user_referenced', 'D: provisioning requester refused');
select is(pg_temp.svc_err($$ select core.purge_unreferenced_users(array['b1590000-0000-0000-0000-000000000041', 'b1590000-0000-0000-0000-000000000035']::uuid[], false) $$),
  'P0001 user_referenced', 'D: one referenced id in the list refuses the whole call');
insert into public.pgtap_0148_later_table values (1, 'b1590000-0000-0000-0000-000000000041');
select is(pg_temp.svc_err($$ select core.purge_unreferenced_users(array['b1590000-0000-0000-0000-000000000041']::uuid[], false) $$),
  'P0001 user_referenced', 'D: a reference from a table created later is found through the catalog');
delete from public.pgtap_0148_later_table;
select is(pg_temp.users_snapshot(), (select v from snap where label = 'before_d'), 'D: refusals deleted nothing');
select is(pg_temp.role_err('authenticated', $$ select core.purge_unreferenced_users('{}'::uuid[]) $$), '42501', 'D: authenticated cannot execute');
select is(pg_temp.role_err('anon', $$ select core.purge_unreferenced_users('{}'::uuid[]) $$), '42501', 'D: anon cannot execute');

insert into res select 'list', pg_temp.svc($$ select core.purge_unreferenced_users('{}'::uuid[]) $$);
select ok((select r -> 'unreferenced_users' from res where label = 'list') @> '[{"user_id": "b1590000-0000-0000-0000-000000000041", "has_core_user": true, "has_auth_user": true}]'::jsonb,
  'D: listing contains the dangling core + auth user');
select ok((select r -> 'unreferenced_users' from res where label = 'list') @> '[{"user_id": "b1590000-0000-0000-0000-000000000042", "has_core_user": false, "has_auth_user": true}]'::jsonb,
  'D: listing contains the auth-only user');
select is((select count(*)::int from jsonb_array_elements((select r -> 'unreferenced_users' from res where label = 'list')) e
            where e ->> 'user_id' in ('b1590000-0000-0000-0000-000000000001', 'b1590000-0000-0000-0000-000000000033',
                                      'b1590000-0000-0000-0000-000000000034', 'b1590000-0000-0000-0000-000000000035',
                                      'b1590000-0000-0000-0000-000000000036')), 0,
  'D: listing has no staff and no referenced user');
select ok(position('email' in (select r::text from res where label = 'list')) = 0, 'D: listing carries no email');

insert into res select 'ids_dry', pg_temp.svc($$ select core.purge_unreferenced_users(array['b1590000-0000-0000-0000-000000000041', 'b1590000-0000-0000-0000-000000000042']::uuid[]) $$);
select is((select (r ->> 'user_count')::int from res where label = 'ids_dry'), 2, 'D: dry run with ids accepts both');
select is(pg_temp.users_snapshot(), (select v from snap where label = 'before_d'), 'D: dry run with ids wrote nothing');

insert into res select 'ids_real', pg_temp.svc($$ select core.purge_unreferenced_users(array['b1590000-0000-0000-0000-000000000042', 'b1590000-0000-0000-0000-000000000041', 'b1590000-0000-0000-0000-000000000041']::uuid[], false) $$);
select is((select r -> 'user_ids' from res where label = 'ids_real'),
  '["b1590000-0000-0000-0000-000000000041", "b1590000-0000-0000-0000-000000000042"]'::jsonb, 'D: duplicate ids collapsed');
select is((select (r ->> 'deleted_auth_user_count')::int from res where label = 'ids_real'), 2, 'D: two auth users deleted');
select is((select (r ->> 'deleted_core_user_count')::int from res where label = 'ids_real'), 1, 'D: one core user deleted (the other was auth-only)');
select is((select count(*)::int from core.users where id = 'b1590000-0000-0000-0000-000000000041'), 0, 'D: gone from core.users');
select is((select count(*)::int from auth.users where id in ('b1590000-0000-0000-0000-000000000041', 'b1590000-0000-0000-0000-000000000042')), 0, 'D: gone from auth.users');
select is((select count(*)::int from audit.user_purge_log where source = 'purge_unreferenced_users' and tenant_purge_log_id is null
            and user_id in ('b1590000-0000-0000-0000-000000000041', 'b1590000-0000-0000-0000-000000000042')), 2, 'D: one log row per user');
select is((select count(*)::int from auth.users where id in (
    'b1590000-0000-0000-0000-000000000001', 'b1590000-0000-0000-0000-000000000033', 'b1590000-0000-0000-0000-000000000034',
    'b1590000-0000-0000-0000-000000000035', 'b1590000-0000-0000-0000-000000000036')), 5, 'D: everybody else kept');
select is(pg_temp.q_snapshot(), (select v from snap where label = 'q_before'), 'D: tenant Q untouched');

select * from finish();
rollback;
