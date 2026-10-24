-- ============================================================================
-- DB test: migration 0140 (Admin appointment 4B-4b, DEBT-123 b + c).
-- Run with:  supabase db reset && supabase test db
--   A  grants / ADR 0008 / SECURITY DEFINER + pinned search_path
--   B  refusals: Admin / Manager / Employee callers (42501 -- an Admin holds
--      every permission an Owner uses, the check is the Owner ROLE), other
--      tenant, other tenant's employee, no account, inactive, own row, null,
--      module OFF -- nothing written; an Admin cannot INSERT into
--      core.role_assignments directly
--   C  Owner appoints: one tenant-wide tenant_admin row, employee role kept,
--      audit; idempotent; a second Owner sees the same state
--   D  read: api.workforce_staff_manage.is_admin; helper silent for others;
--      api.is_tenant_owner answers only about the caller
--   E  revoke: admin rows gone (incl. location-scoped), audit; idempotent;
--      tenant_owner never touched
--   F  deactivation / deletion removes the Admin role (+ audit) before the
--      0139 "no role left -> suspend" step; reactivation does not restore it;
--      tenant_owner kept
--   G  DEBT-123 b: no self-deactivate / self-delete (Manager); Owners exempt
--      (keep tenant_owner); system context and tenant cascade unaffected;
--      others still can
--   H0 review P2: invite needs staff.manage at the employee row's location
--   H  DEBT-123 c: invite refuses an account bound to another employee row;
--      accept refuses a legacy invitation for it (generic), nothing written
--   I  backfill of legacy inactive Admins; idempotent; suspends role-less users
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit;

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
-- T1 = ...a1 (L1 ...01, L2 ...02), T2 = ...a2, T3 = ...a3 (cascade test only).
-- Users: 01 O owner, 02 O2 second owner, 03 M manager, 04 E1 employee, 05 A admin,
-- 06 X (T2 employee), 07 AO admin-only employee, 08 Z legacy inactive admin,
-- 09 R ex-employee (inactive row, suspended), 0a N new hire, 0b ML1 / 0c ML2 location-scoped
-- Managers of L1 / L2 (no employee row); 0d is only an invite target (H0)
insert into core.tenants (id, slug, name) values
  ('a7900000-0000-0000-0000-0000000000a1', 'pgtap-0140-t1', 'pgTAP 0140 T1'),
  ('a7900000-0000-0000-0000-0000000000a2', 'pgtap-0140-t2', 'pgTAP 0140 T2'),
  ('a7900000-0000-0000-0000-0000000000a3', 'pgtap-0140-t3', 'pgTAP 0140 T3');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a7900000-0000-0000-0000-0000000000a1', 'workforce', true),
  ('a7900000-0000-0000-0000-0000000000a2', 'workforce', true),
  ('a7900000-0000-0000-0000-0000000000a3', 'workforce', true);
insert into core.locations (id, tenant_id, name) values
  ('a7910000-0000-0000-0000-000000000001', 'a7900000-0000-0000-0000-0000000000a1', 'T1 / L1'),
  ('a7910000-0000-0000-0000-000000000002', 'a7900000-0000-0000-0000-0000000000a1', 'T1 / L2'),
  ('a7910000-0000-0000-0000-000000000003', 'a7900000-0000-0000-0000-0000000000a2', 'T2 / L1'),
  ('a7910000-0000-0000-0000-000000000004', 'a7900000-0000-0000-0000-0000000000a3', 'T3 / L1');
insert into core.users (id, display_name) values
  ('a7990000-0000-0000-0000-000000000001', 'O'),
  ('a7990000-0000-0000-0000-000000000002', 'O2'),
  ('a7990000-0000-0000-0000-000000000003', 'M'),
  ('a7990000-0000-0000-0000-000000000004', 'E1'),
  ('a7990000-0000-0000-0000-000000000005', 'A'),
  ('a7990000-0000-0000-0000-000000000006', 'X'),
  ('a7990000-0000-0000-0000-000000000007', 'AO'),
  ('a7990000-0000-0000-0000-000000000008', 'Z'),
  ('a7990000-0000-0000-0000-000000000009', 'R'),
  ('a7990000-0000-0000-0000-00000000000a', 'N'),
  ('a7990000-0000-0000-0000-00000000000b', 'ML1 manager of L1 only'),
  ('a7990000-0000-0000-0000-00000000000c', 'ML2 manager of L2 only');
insert into core.tenant_memberships (tenant_id, user_id, status)
select 'a7900000-0000-0000-0000-0000000000a1', u::uuid, 'active'
  from unnest(array['a7990000-0000-0000-0000-000000000001', 'a7990000-0000-0000-0000-000000000002',
                    'a7990000-0000-0000-0000-000000000003', 'a7990000-0000-0000-0000-000000000004',
                    'a7990000-0000-0000-0000-000000000005', 'a7990000-0000-0000-0000-000000000007',
                    'a7990000-0000-0000-0000-000000000008', 'a7990000-0000-0000-0000-00000000000b',
                    'a7990000-0000-0000-0000-00000000000c']) u;
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000009', 'suspended'),
  ('a7900000-0000-0000-0000-0000000000a2', 'a7990000-0000-0000-0000-000000000006', 'active');
-- role ids: tenant_owner=...003, tenant_admin=...004, manager=...005, employee=...006
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', null),
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', null),
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', null),
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'a7910000-0000-0000-0000-000000000001'),
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'a7910000-0000-0000-0000-000000000001'),
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', null),
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006', 'a7910000-0000-0000-0000-000000000001'),
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000004', null),
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', 'a7910000-0000-0000-0000-000000000001'),
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000005', 'a7910000-0000-0000-0000-000000000002'),
  ('a7900000-0000-0000-0000-0000000000a2', 'a7990000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'a7910000-0000-0000-0000-000000000003');
-- employees (T1 / L1 unless noted): ...01 O, ...02 O2, ...03 M, ...04 E1, ...05 A, ...06 X (T2),
-- ...07 AO, ...08 Z (inactive, bound; admin added in I), ...09 R (inactive, bound),
-- ...0a no account, ...0b new row for R (unbound), ...0c new row for N (unbound),
-- ...0d O's own row in T3 (cascade test)
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, user_id, is_active) values
  ('a7920000-0000-0000-0000-000000000001', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000001', convert_to('O', 'UTF8'), 'a7990000-0000-0000-0000-000000000001', true),
  ('a7920000-0000-0000-0000-000000000002', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000001', convert_to('O2', 'UTF8'), 'a7990000-0000-0000-0000-000000000002', true),
  ('a7920000-0000-0000-0000-000000000003', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000001', convert_to('M', 'UTF8'), 'a7990000-0000-0000-0000-000000000003', true),
  ('a7920000-0000-0000-0000-000000000004', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000001', convert_to('E1', 'UTF8'), 'a7990000-0000-0000-0000-000000000004', true),
  ('a7920000-0000-0000-0000-000000000005', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000001', convert_to('A', 'UTF8'), 'a7990000-0000-0000-0000-000000000005', true),
  ('a7920000-0000-0000-0000-000000000006', 'a7900000-0000-0000-0000-0000000000a2', 'a7910000-0000-0000-0000-000000000003', convert_to('X', 'UTF8'), 'a7990000-0000-0000-0000-000000000006', true),
  ('a7920000-0000-0000-0000-000000000007', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000001', convert_to('AO', 'UTF8'), 'a7990000-0000-0000-0000-000000000007', true),
  ('a7920000-0000-0000-0000-000000000008', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000001', convert_to('Z', 'UTF8'), 'a7990000-0000-0000-0000-000000000008', false),
  ('a7920000-0000-0000-0000-000000000009', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000001', convert_to('R', 'UTF8'), 'a7990000-0000-0000-0000-000000000009', false),
  ('a7920000-0000-0000-0000-00000000000a', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000001', convert_to('NA', 'UTF8'), null, true),
  ('a7920000-0000-0000-0000-00000000000b', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000002', convert_to('R2', 'UTF8'), null, true),
  ('a7920000-0000-0000-0000-00000000000c', 'a7900000-0000-0000-0000-0000000000a1', 'a7910000-0000-0000-0000-000000000001', convert_to('N', 'UTF8'), null, true),
  ('a7920000-0000-0000-0000-00000000000d', 'a7900000-0000-0000-0000-0000000000a3', 'a7910000-0000-0000-0000-000000000004', convert_to('O3', 'UTF8'), 'a7990000-0000-0000-0000-000000000001', true);

create function pg_temp.role_rows(p_user text, p_role text) returns int language sql as $$
  select count(*)::int from core.role_assignments
   where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and user_id = p_user::uuid and role_id = p_role::uuid;
$$;
create function pg_temp.admin_rows(p_user text) returns int language sql as $$
  select pg_temp.role_rows(p_user, '00000000-0000-0000-0000-000000000004');
$$;
create function pg_temp.mem(p_user text) returns text language sql as $$
  select coalesce((select status::text from core.tenant_memberships
                    where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and user_id = p_user::uuid), 'none');
$$;
create function pg_temp.audits(p_action text) returns int language sql as $$
  select count(*)::int from audit.audit_logs where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and action = p_action;
$$;
create function pg_temp.set_admin(p_actor text, p_staff text, p_is_admin boolean) returns text language sql as $$
  select pg_temp.as_user(p_actor, format(
    $f$ select api.set_employee_admin_role('a7900000-0000-0000-0000-0000000000a1', %L, %L)::text $f$, p_staff, p_is_admin));
$$;
create function pg_temp.set_active(p_actor text, p_staff text, p_active boolean) returns text language sql as $$
  select pg_temp.as_user(p_actor, format(
    $f$ with u as (update api.workforce_staff_manage set is_active = %L where staff_id = %L returning 1) select count(*)::text from u $f$,
    p_active, p_staff));
$$;

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.set_employee_admin_role(uuid, uuid, boolean)', 'execute'), false, 'A: anon cannot call the api wrapper');
select is(has_function_privilege('anon', 'core.set_employee_admin_role(uuid, uuid, boolean)', 'execute'), false, 'A: anon cannot call the core function');
select is(has_function_privilege('authenticated', 'api.set_employee_admin_role(uuid, uuid, boolean)', 'execute'), true, 'A: authenticated can call the api wrapper');
select is(has_function_privilege('anon', 'api.is_tenant_owner(uuid)', 'execute'), false, 'A: anon cannot call api.is_tenant_owner');
select is(has_function_privilege('authenticated', 'api.is_tenant_owner(uuid)', 'execute'), true, 'A: authenticated can call api.is_tenant_owner');
select is(has_function_privilege('anon', 'core.caller_is_tenant_owner(uuid)', 'execute'), false, 'A: anon cannot call core.caller_is_tenant_owner');
select is(has_function_privilege('anon', 'core.employee_user_is_admin(uuid, uuid)', 'execute'), false, 'A: anon cannot call the read helper');
select is(has_function_privilege('authenticated', 'workforce.guard_employee_self_offboarding()', 'execute'), false, 'A: guard trigger body not callable by authenticated');
select is(has_function_privilege('authenticated', 'core.revoke_inactive_employee_admins()', 'execute'), false, 'A: backfill not callable by authenticated');
select is(has_function_privilege('service_role', 'core.revoke_inactive_employee_admins()', 'execute'), false, 'A: ... nor by service_role');
select is((select prosecdef from pg_proc where oid = 'api.set_employee_admin_role(uuid, uuid, boolean)'::regprocedure), false, 'A: api wrapper is SECURITY INVOKER (ADR 0008)');
select is((select prosecdef from pg_proc where oid = 'api.is_tenant_owner(uuid)'::regprocedure), false, 'A: api.is_tenant_owner is SECURITY INVOKER');
select is((select prosecdef from pg_proc where oid = 'core.set_employee_admin_role(uuid, uuid, boolean)'::regprocedure), true, 'A: core function is SECURITY DEFINER');
select is((select prosecdef from pg_proc where oid = 'core.caller_is_tenant_owner(uuid)'::regprocedure), true, 'A: caller_is_tenant_owner is SECURITY DEFINER');
select ok((select bool_and(proconfig::text like '%search_path=%') from pg_proc where oid in (
  'core.set_employee_admin_role(uuid, uuid, boolean)'::regprocedure, 'core.caller_is_tenant_owner(uuid)'::regprocedure,
  'core.employee_user_is_admin(uuid, uuid)'::regprocedure, 'core.revoke_inactive_employee_admins()'::regprocedure,
  'workforce.guard_employee_self_offboarding()'::regprocedure, 'workforce.on_employee_deactivated()'::regprocedure)),
  'A: every new / changed function pins search_path');
select ok(exists (select 1 from pg_trigger where tgrelid = 'workforce.employees'::regclass and tgname = 'employees_guard_self_deactivate' and not tgisinternal), 'A: employees_guard_self_deactivate exists');
select ok(exists (select 1 from pg_trigger where tgrelid = 'workforce.employees'::regclass and tgname = 'employees_guard_self_delete' and not tgisinternal), 'A: employees_guard_self_delete exists');
select ok(obj_description('workforce.on_employee_deactivated()'::regprocedure, 'pg_proc') like '%0140%', 'A: trigger function comment describes 0140');
select is(pg_temp.anon_err($$ select api.set_employee_admin_role('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-000000000004', true) $$), '42501', 'A: anon call refused');

-- B: refusals ----------------------------------------------------------------------------------
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000005',
  $$ select core.has_permission('a7900000-0000-0000-0000-0000000000a1', 'core.role.manage', null)::text $$),
  'true', 'B: fixture: the Admin holds core.role.manage (why a permission check would be wrong)');
select matches(pg_temp.set_admin('a7990000-0000-0000-0000-000000000005', 'a7920000-0000-0000-0000-000000000004', true),
  '^ERR 42501 permission_denied', 'B: an Admin cannot appoint an Admin');
select matches(pg_temp.set_admin('a7990000-0000-0000-0000-000000000005', 'a7920000-0000-0000-0000-000000000007', false),
  '^ERR 42501 permission_denied', 'B: an Admin cannot revoke an Admin');
select matches(pg_temp.as_user('a7990000-0000-0000-0000-000000000005',
  $$ with i as (insert into core.role_assignments (tenant_id, user_id, role_id, location_id)
                values ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', null)
                returning 1) select count(*)::text from i $$),
  '^ERR 42501 .*permission denied', 'B: an Admin cannot INSERT into core.role_assignments directly (0007 policy unreachable)');
select matches(pg_temp.set_admin('a7990000-0000-0000-0000-000000000003', 'a7920000-0000-0000-0000-000000000004', true),
  '^ERR 42501 permission_denied', 'B: a Manager cannot appoint');
select matches(pg_temp.set_admin('a7990000-0000-0000-0000-000000000004', 'a7920000-0000-0000-0000-00000000000a', true),
  '^ERR 42501 permission_denied', 'B: an Employee cannot appoint');
select matches(pg_temp.as_user('a7990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_admin_role('a7900000-0000-0000-0000-0000000000a2', 'a7920000-0000-0000-0000-000000000006', true)::text $$),
  '^ERR 42501 permission_denied', 'B: the T1 Owner has no rights in T2');
select matches(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000006', true),
  '^ERR P0002 employee_not_found', 'B: another tenant''s employee is not found');
select matches(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-00000000000a', true),
  '^ERR P0001 employee_has_no_account', 'B: an employee without an account is refused');
select matches(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000009', true),
  '^ERR P0001 employee_inactive', 'B: an inactive employee is refused (appoint)');
select matches(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000009', false),
  '^ERR P0001 employee_inactive', 'B: ... and revoke (0138 behaviour kept)');
select matches(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000001', true),
  '^ERR P0001 cannot_change_own_role', 'B: the Owner cannot change their own role');
select matches(pg_temp.as_user('a7990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_admin_role('a7900000-0000-0000-0000-0000000000a1', null, true)::text $$),
  '^ERR 22004', 'B: null employee refused');
update core.tenant_modules set is_enabled = false where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and module = 'workforce';
select matches(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000004', true),
  '^ERR P0001 workforce_module_disabled', 'B: Workforce OFF -> P0001 workforce_module_disabled');
update core.tenant_modules set is_enabled = true where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and module = 'workforce';
select is((select count(*)::int from core.role_assignments where role_id = '00000000-0000-0000-0000-000000000004'
            and tenant_id = 'a7900000-0000-0000-0000-0000000000a1'), 2, 'B: refusals wrote no role row (only A and AO seed)');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a7900000-0000-0000-0000-0000000000a1'), 0, 'B: refusals wrote no audit row');

-- C: appoint -----------------------------------------------------------------------------------
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000004', true)::jsonb,
  '{"employee_id": "a7920000-0000-0000-0000-000000000004", "is_admin": true, "changed": true}'::jsonb, 'C: Owner appoints E1');
select is((select string_agg(coalesce(location_id::text, 'tenant'), ',') from core.role_assignments
            where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and user_id = 'a7990000-0000-0000-0000-000000000004'
              and role_id = '00000000-0000-0000-0000-000000000004'), 'tenant', 'C: one tenant-wide tenant_admin row');
select is(pg_temp.role_rows('a7990000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006'), 1, 'C: employee role kept');
select is(pg_temp.role_rows('a7990000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005'), 0, 'C: no manager role added');
select is(pg_temp.audits('appoint_admin'), 1, 'C: one appoint audit row');
select is((select actor_id::text || '/' || module::text || '/' || entity || '/' || (before ->> 'is_admin') || '>' || (after ->> 'is_admin')
             || '/' || (metadata ->> 'role_key') || '/' || (metadata ->> 'employee_id')
             from audit.audit_logs where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and action = 'appoint_admin'),
  'a7990000-0000-0000-0000-000000000001/core/role_assignment/false>true/tenant_admin/a7920000-0000-0000-0000-000000000004',
  'C: audit row: actor, module, entity, before/after, ids');
select ok((select (before::text || after::text || metadata::text) !~ '(@|email|name|\\x)'
             from audit.audit_logs where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and action = 'appoint_admin'),
  'C: the audit row carries no PII');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000004',
  $$ select core.has_permission('a7900000-0000-0000-0000-0000000000a1', 'core.role.manage', null)::text $$),
  'true', 'C: the new Admin passes core.role.manage');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000004',
  $$ select api.is_tenant_owner('a7900000-0000-0000-0000-0000000000a1')::text $$),
  'false', 'C: ... but is not an Owner');
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000004', 'a7920000-0000-0000-0000-00000000000c', true)::text,
  'ERR 42501 permission_denied', 'C: ... so the new Admin cannot appoint further Admins');
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000004', true)::jsonb ->> 'changed',
  'false', 'C: appointing again is a no-op');
select is(pg_temp.admin_rows('a7990000-0000-0000-0000-000000000004'), 1, 'C: still one admin row');
select is(pg_temp.audits('appoint_admin'), 1, 'C: no second audit row');
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000002', 'a7920000-0000-0000-0000-000000000004', true)::jsonb ->> 'is_admin',
  'true', 'C: a second Owner sees the same state');

-- D: read ----------------------------------------------------------------------------------------
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000001',
  $$ select string_agg(convert_from(name_encrypted, 'UTF8') || '=' || is_admin, ',' order by staff_id) from api.workforce_staff_manage
      where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' $$),
  'O=false,O2=false,M=false,E1=true,A=true,AO=true,Z=false,R=false,NA=false,R2=false,N=false', 'D: is_admin per row for the Owner');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000003',
  $$ select is_admin::text || '/' || is_manager::text from api.workforce_staff_manage where staff_id = 'a7920000-0000-0000-0000-000000000004' $$),
  'true/false', 'D: a Manager sees the Admin badge too (is_manager unchanged)');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000006',
  $$ select core.employee_user_is_admin('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000005')::text $$),
  'false', 'D: the helper answers false to a non-member');
select is(pg_temp.as_user('a7990000-0000-0000-0000-00000000000a',
  $$ select core.employee_user_is_admin('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000005')::text $$),
  'false', 'D: ... and to an unrelated signed-in user');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000001', $$ select api.is_tenant_owner('a7900000-0000-0000-0000-0000000000a1')::text $$),
  'true', 'D: api.is_tenant_owner: the Owner -> true');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000005', $$ select api.is_tenant_owner('a7900000-0000-0000-0000-0000000000a1')::text $$),
  'false', 'D: ... an Admin -> false');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000003', $$ select api.is_tenant_owner('a7900000-0000-0000-0000-0000000000a1')::text $$),
  'false', 'D: ... a Manager -> false');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000001', $$ select api.is_tenant_owner('a7900000-0000-0000-0000-0000000000a2')::text $$),
  'false', 'D: ... the T1 Owner in T2 -> false');
select is(core.caller_is_tenant_owner('a7900000-0000-0000-0000-0000000000a1'), false, 'D: ... no identity -> false');

-- E: revoke --------------------------------------------------------------------------------------
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000004', false)::jsonb,
  '{"employee_id": "a7920000-0000-0000-0000-000000000004", "is_admin": false, "changed": true}'::jsonb, 'E: Owner revokes E1');
select is(pg_temp.admin_rows('a7990000-0000-0000-0000-000000000004'), 0, 'E: admin row gone');
select is(pg_temp.role_rows('a7990000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006'), 1, 'E: employee role kept');
select is((select actor_id::text || '/' || (before ->> 'is_admin') || '>' || (after ->> 'is_admin') || '/' || (metadata ->> 'reason')
             from audit.audit_logs where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and action = 'revoke_admin'),
  'a7990000-0000-0000-0000-000000000001/true>false/owner_revoked', 'E: one revoke audit row (actor, before/after, reason)');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000004',
  $$ select core.has_permission('a7900000-0000-0000-0000-0000000000a1', 'core.role.manage', null)::text $$),
  'false', 'E: E1 lost core.role.manage');
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000004', false)::jsonb ->> 'changed',
  'false', 'E: revoking again is a no-op');
select is(pg_temp.audits('revoke_admin'), 1, 'E: no second revoke audit row');
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000002', false)::jsonb ->> 'changed',
  'false', 'E: "revoking" a co-Owner (not an Admin) changes nothing');
select is(pg_temp.role_rows('a7990000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'), 1, 'E: tenant_owner assignment untouched');
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000003', false)::jsonb ->> 'changed',
  'false', 'E: "revoking" a Manager (not an Admin) changes nothing');
select is(pg_temp.role_rows('a7990000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005'), 1, 'E: manager assignment untouched');
-- A also holds a location-scoped admin row; revoke removes every admin row of A
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'a7910000-0000-0000-0000-000000000001');
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000005', false)::jsonb ->> 'changed',
  'true', 'E: revoke A (tenant-wide + location admin rows)');
select is(pg_temp.admin_rows('a7990000-0000-0000-0000-000000000005'), 0, 'E: every admin row of A removed');
select is(jsonb_array_length((select metadata -> 'role_assignment_ids' from audit.audit_logs
            where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and action = 'revoke_admin'
              and metadata ->> 'user_id' = 'a7990000-0000-0000-0000-000000000005')), 2, 'E: the audit row lists both removed ids');
select is(pg_temp.role_rows('a7990000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006'), 1, 'E: A keeps the employee role');

-- F: deactivation / deletion removes the Admin role ---------------------------------------------
-- F1: AO = admin + no employee role: deactivation removes admin, no role left -> suspended
select is(pg_temp.set_active('a7990000-0000-0000-0000-000000000003', 'a7920000-0000-0000-0000-000000000007', false), '1', 'F1: Manager M deactivates admin AO');
select is(pg_temp.admin_rows('a7990000-0000-0000-0000-000000000007'), 0, 'F1: admin role removed');
select is(pg_temp.mem('a7990000-0000-0000-0000-000000000007'), 'suspended', 'F1: no role left -> membership suspended (admin removal ran before the 0139 check)');
select is((select actor_id::text || '/' || actor_kind || '/' || entity || '/' || (before ->> 'is_admin') || '>' || (after ->> 'is_admin')
             || '/' || (metadata ->> 'role_key') || '/' || (metadata ->> 'reason')
             from audit.audit_logs where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and action = 'revoke_admin'
              and metadata ->> 'user_id' = 'a7990000-0000-0000-0000-000000000007'),
  'a7990000-0000-0000-0000-000000000003/user/role_assignment/true>false/tenant_admin/employee_deactivated', 'F1: revoke_admin audited, reason employee_deactivated');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000007',
  $$ select core.has_permission('a7900000-0000-0000-0000-0000000000a1', 'core.role.manage', null)::text
         || '/' || core.is_member_of('a7900000-0000-0000-0000-0000000000a1')::text $$),
  'false/false', 'F1: AO has no rights and is no member');
-- F2: reactivation does not restore the Admin role
select is(pg_temp.set_active('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000007', true), '1', 'F2: Owner reactivates AO');
select is(pg_temp.admin_rows('a7990000-0000-0000-0000-000000000007'), 0, 'F2: Admin role NOT restored');
select is(pg_temp.mem('a7990000-0000-0000-0000-000000000007') || '/' || pg_temp.role_rows('a7990000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000006')::text,
  'active/1', 'F2: membership active again, employee role restored (0139)');
-- F3: an Owner who also holds admin: deactivation keeps tenant_owner and the membership
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000002', true)::jsonb ->> 'changed',
  'true', 'F3: O makes co-owner O2 an Admin too');
select is(pg_temp.set_active('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000002', false), '1', 'F3: O deactivates O2''s employee row');
select is(pg_temp.admin_rows('a7990000-0000-0000-0000-000000000002')::text || '/'
          || pg_temp.role_rows('a7990000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003')::text || '/'
          || pg_temp.mem('a7990000-0000-0000-0000-000000000002'),
  '0/1/active', 'F3: admin removed, tenant_owner kept, membership active');
update workforce.employees set is_active = true where id = 'a7920000-0000-0000-0000-000000000002';
-- F4: permanent delete removes the Admin role
select is(pg_temp.set_admin('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000004', true)::jsonb ->> 'changed',
  'true', 'F4: E1 appointed Admin');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000003',
  $$ select deleted::text from api.permanently_delete_employee('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-000000000004') $$),
  'true', 'F4: M permanently deletes E1''s (history-free) employee row');
select is(pg_temp.admin_rows('a7990000-0000-0000-0000-000000000004'), 0, 'F4: the admin role did not outlive the employee row');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a7900000-0000-0000-0000-0000000000a1'
            and action = 'revoke_admin' and metadata ->> 'reason' = 'employee_deleted'
            and metadata ->> 'user_id' = 'a7990000-0000-0000-0000-000000000004'), 1, 'F4: audited with reason employee_deleted');
select is(pg_temp.mem('a7990000-0000-0000-0000-000000000004'), 'suspended', 'F4: membership suspended');

-- G: DEBT-123 b -- no self-deactivate / self-delete ----------------------------------------------
select is(pg_temp.set_active('a7990000-0000-0000-0000-000000000003', 'a7920000-0000-0000-0000-000000000003', false),
  'ERR P0001 cannot_deactivate_self', 'G: a Manager cannot deactivate their own row');
select is((select is_active from workforce.employees where id = 'a7920000-0000-0000-0000-000000000003'), true, 'G: ... the row stays active');
select is(pg_temp.role_rows('a7990000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005'), 1, 'G: ... and M keeps the manager role');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000003',
  $$ select deleted::text from api.permanently_delete_employee('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-000000000003') $$),
  'ERR P0001 cannot_delete_self', 'G: a Manager cannot permanently delete their own row');
select is((select count(*)::int from workforce.employees where id = 'a7920000-0000-0000-0000-000000000003'), 1, 'G: ... the row still exists');
-- Owners are exempt: tenant_owner keeps their access, the guard would only get in the way
select is(pg_temp.set_active('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000001', false),
  '1', 'G: the Owner may deactivate their own row');
select is(pg_temp.role_rows('a7990000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003')::text
          || '/' || pg_temp.mem('a7990000-0000-0000-0000-000000000001'),
  '1/active', 'G: ... and keeps tenant_owner and an active membership');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000001',
  $$ select core.has_permission('a7900000-0000-0000-0000-0000000000a1', 'core.role.manage', null)::text $$),
  'true', 'G: ... with owner rights intact');
update workforce.employees set is_active = true where id = 'a7920000-0000-0000-0000-000000000001';
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000002',
  $$ select deleted::text from api.permanently_delete_employee('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-000000000002') $$),
  'true', 'G: a (co-)Owner may permanently delete their own row');
select is(pg_temp.role_rows('a7990000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003')::text
          || '/' || pg_temp.mem('a7990000-0000-0000-0000-000000000002'),
  '1/active', 'G: ... and keeps tenant_owner and an active membership');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000003',
  $$ with u as (update api.workforce_staff_manage set position_label = 'Lead' where staff_id = 'a7920000-0000-0000-0000-000000000003' returning 1) select count(*)::text from u $$),
  '1', 'G: editing one''s own row otherwise still works');
-- others still can; the system context (no identity) is never blocked
select is(pg_temp.set_active('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000003', false), '1', 'G: the Owner can deactivate the Manager');
update workforce.employees set is_active = true where id = 'a7920000-0000-0000-0000-000000000003';
select lives_ok($$ update workforce.employees set is_active = false where id = 'a7920000-0000-0000-0000-000000000003' $$, 'G: no identity (system / service): deactivating a bound row not blocked');
select is((select is_active from workforce.employees where id = 'a7920000-0000-0000-0000-000000000003'), false, 'G: ... it is inactive');
select lives_ok($$ update workforce.employees set is_active = true where id = 'a7920000-0000-0000-0000-000000000003' $$, 'G: ... reactivation fine');
-- tenant cascade while signed in as the user whose row it contains
select set_config('request.jwt.claim.sub', 'a7990000-0000-0000-0000-000000000001', true);
select lives_ok($$ delete from core.tenants where id = 'a7900000-0000-0000-0000-0000000000a3' $$, 'G: tenant cascade with the user''s own row is not blocked');
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from workforce.employees where tenant_id = 'a7900000-0000-0000-0000-0000000000a3'), 0, 'G: ... and the row is gone');

-- H0: review P2 -- invite respects the employee row's location (wf_employees_staff_manage boundary) ------
select is(pg_temp.as_user('a7990000-0000-0000-0000-00000000000c',
  $$ select out_invitation_id::text from api.upsert_employee_invitation('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-00000000000a',
       'a7990000-0000-0000-0000-00000000000d', 'a7930000-0000-0000-0000-000000000004') $$),
  'ERR 42501 permission_denied', 'H0: a Manager of L2 cannot invite an L1 employee');
select is((select count(*)::int from workforce.employee_invitations where employee_id = 'a7920000-0000-0000-0000-00000000000a'), 0, 'H0: ... nothing written');
select is(pg_temp.as_user('a7990000-0000-0000-0000-00000000000b',
  $$ select out_invitation_id::text from api.upsert_employee_invitation('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-00000000000a',
       'a7990000-0000-0000-0000-00000000000d', 'a7930000-0000-0000-0000-000000000004') $$),
  'a7930000-0000-0000-0000-000000000004', 'H0: a Manager of L1 can invite the L1 employee');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000001',
  $$ select out_invitation_id::text || '/' || out_was_resend::text from api.upsert_employee_invitation('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-00000000000a',
       'a7990000-0000-0000-0000-00000000000d', 'a7930000-0000-0000-0000-000000000005') $$),
  'a7930000-0000-0000-0000-000000000004/true', 'H0: the Owner (tenant-wide) can too (resend of the same invitation)');
select is(pg_temp.as_user('a7990000-0000-0000-0000-00000000000c',
  $$ select out_invitation_id::text from api.upsert_employee_invitation('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-00000000000b',
       'a7990000-0000-0000-0000-000000000009', 'a7930000-0000-0000-0000-000000000006') $$),
  'ERR P0001 user_has_other_employee_record', 'H0: the L2 Manager passes the location check for an L2 employee (then hits the next rule)');

-- H: DEBT-123 c -- rehire while the old row is still bound -----------------------------------------
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000001',
  $$ select out_invitation_id::text from api.upsert_employee_invitation('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-00000000000b',
       'a7990000-0000-0000-0000-000000000009', 'a7930000-0000-0000-0000-000000000001') $$),
  'ERR P0001 user_has_other_employee_record', 'H: invite refuses an account bound to another (inactive) employee row');
select is((select count(*)::int from workforce.employee_invitations where employee_id = 'a7920000-0000-0000-0000-00000000000b'), 0, 'H: ... no invitation written');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000001',
  $$ select out_invitation_id::text from api.upsert_employee_invitation('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-00000000000b',
       'a7990000-0000-0000-0000-000000000003', 'a7930000-0000-0000-0000-000000000001') $$),
  'ERR P0001 user_has_other_employee_record', 'H: ... also when the other row is active');
-- a legacy invitation created before 0140
insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, invited_by) values
  ('a7930000-0000-0000-0000-000000000002', 'a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-00000000000b', 'a7990000-0000-0000-0000-000000000009', 'a7990000-0000-0000-0000-000000000001');
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000009',
  $$ select out_employee_id::text from api.accept_employee_invitation('a7930000-0000-0000-0000-000000000002') $$),
  'ERR P0001 invitation_not_acceptable', 'H: accept refuses it with the generic error (was a raw 23505)');
select is(pg_temp.mem('a7990000-0000-0000-0000-000000000009'), 'suspended', 'H: ... membership stays suspended');
select is((select count(*)::int from core.role_assignments where tenant_id = 'a7900000-0000-0000-0000-0000000000a1' and user_id = 'a7990000-0000-0000-0000-000000000009'), 0, 'H: ... no role written');
select is((select coalesce(user_id::text, 'unbound') from workforce.employees where id = 'a7920000-0000-0000-0000-00000000000b'), 'unbound', 'H: ... the new row stays unbound');
select is((select status::text from workforce.employee_invitations where id = 'a7930000-0000-0000-0000-000000000002'), 'pending', 'H: ... invitation not consumed');
-- the supported path: reactivate the earlier row
select is(pg_temp.set_active('a7990000-0000-0000-0000-000000000001', 'a7920000-0000-0000-0000-000000000009', true), '1', 'H: Owner reactivates R''s earlier row instead');
select is(pg_temp.mem('a7990000-0000-0000-0000-000000000009'), 'active', 'H: ... R is back');
-- positive control: an unrelated new hire is still invited and accepts
select is(pg_temp.as_user('a7990000-0000-0000-0000-000000000001',
  $$ select out_invitation_id::text from api.upsert_employee_invitation('a7900000-0000-0000-0000-0000000000a1', 'a7920000-0000-0000-0000-00000000000c',
       'a7990000-0000-0000-0000-00000000000a', 'a7930000-0000-0000-0000-000000000003') $$),
  'a7930000-0000-0000-0000-000000000003', 'H: a new hire is invited as before');
select is(pg_temp.as_user('a7990000-0000-0000-0000-00000000000a',
  $$ select out_employee_id::text from api.accept_employee_invitation('a7930000-0000-0000-0000-000000000003') $$),
  'a7920000-0000-0000-0000-00000000000c', 'H: ... and accepts');

-- I: backfill ------------------------------------------------------------------------------------
-- legacy: Z's row is inactive but Z still holds tenant_admin (pre-0140 data)
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a7900000-0000-0000-0000-0000000000a1', 'a7990000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000004', null);
select ok(core.revoke_inactive_employee_admins() >= 1, 'I: backfill removes the legacy inactive Admin');
select is(pg_temp.admin_rows('a7990000-0000-0000-0000-000000000008'), 0, 'I: Z has no admin row');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a7900000-0000-0000-0000-0000000000a1'
            and action = 'revoke_admin' and metadata ->> 'reason' = 'backfill_inactive'
            and metadata ->> 'user_id' = 'a7990000-0000-0000-0000-000000000008' and actor_id is null and actor_kind = 'system'), 1,
  'I: one system audit row, reason backfill_inactive');
select is(core.revoke_inactive_employee_admins(), 0, 'I: second run removes nothing (idempotent)');
select ok(core.revoke_inactive_employee_access() >= 1, 'I: the 0139 re-run suspends Z (no role left)');
select is(pg_temp.mem('a7990000-0000-0000-0000-000000000008'), 'suspended', 'I: Z suspended');
select is((select count(*)::int from core.role_assignments ra join workforce.employees e on e.tenant_id = ra.tenant_id and e.user_id = ra.user_id
            where ra.role_id = '00000000-0000-0000-0000-000000000004' and not e.is_active), 0,
  'I: no inactive Admin exists anywhere');
select is(pg_temp.role_rows('a7990000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'), 1, 'I: the Owner was never touched');

select * from finish();
rollback;
