-- ============================================================================
-- DB test: migration 0138 (Manager appointment, DEBT-091 a + DEBT-094).
-- Run with:  supabase db reset && supabase test db
--   A  grants / ADR 0008
--   B  refusals: Manager / Employee callers (42501), other tenant's employee,
--      other tenant, no account, inactive, own row -- nothing written
--   C  Owner appoints: manager row (tenant-wide) + employee role kept + audit;
--      the new Manager passes workforce.staff.manage; idempotent
--   D  read: api.workforce_staff_manage.is_manager; helper silent for others
--   E  revoke: manager row gone, employee role kept, audit; idempotent;
--      tenant_owner never touched
--   F  DEBT-094: deactivate revokes pending invitations (+ audit); accept
--      refuses an inactive employee; an active one still accepts
--   G  deactivating a Manager drops the Manager role (+ audit) and, since 0139
--      (DEBT-121), the employee role too; reactivation does not restore the
--      Manager role (full DEBT-121 coverage: 0078)
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
-- tenants: T1 = ...a1, T2 = ...a2. Users: O owner, O2 second owner, M manager, E1 employee,
-- E3 inactive employee, X employee of T2, U/U2/U3 invitees.
insert into core.tenants (id, slug, name) values
  ('a7700000-0000-0000-0000-0000000000a1', 'pgtap-0138-t1', 'pgTAP 0138 T1'),
  ('a7700000-0000-0000-0000-0000000000a2', 'pgtap-0138-t2', 'pgTAP 0138 T2');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a7700000-0000-0000-0000-0000000000a1', 'workforce', true),
  ('a7700000-0000-0000-0000-0000000000a2', 'workforce', true);
insert into core.locations (id, tenant_id, name) values
  ('a7710000-0000-0000-0000-000000000001', 'a7700000-0000-0000-0000-0000000000a1', 'T1 / L1'),
  ('a7710000-0000-0000-0000-000000000002', 'a7700000-0000-0000-0000-0000000000a2', 'T2 / L1');
insert into core.users (id, display_name) values
  ('a7790000-0000-0000-0000-000000000001', 'O'),
  ('a7790000-0000-0000-0000-000000000002', 'O2'),
  ('a7790000-0000-0000-0000-000000000003', 'M'),
  ('a7790000-0000-0000-0000-000000000004', 'E1'),
  ('a7790000-0000-0000-0000-000000000005', 'E3'),
  ('a7790000-0000-0000-0000-000000000006', 'X'),
  ('a7790000-0000-0000-0000-000000000007', 'U'),
  ('a7790000-0000-0000-0000-000000000008', 'U2'),
  ('a7790000-0000-0000-0000-000000000009', 'U3');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000001', 'active'),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000002', 'active'),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000003', 'active'),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000004', 'active'),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000005', 'active'),
  ('a7700000-0000-0000-0000-0000000000a2', 'a7790000-0000-0000-0000-000000000006', 'active');
-- role ids: tenant_owner=...003, manager=...005, employee=...006
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', null),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', null),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', null),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'a7710000-0000-0000-0000-000000000001'),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'a7710000-0000-0000-0000-000000000001'),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006', 'a7710000-0000-0000-0000-000000000001'),
  ('a7700000-0000-0000-0000-0000000000a2', 'a7790000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'a7710000-0000-0000-0000-000000000002');
-- employees: ...01 O (owner's own row), ...02 O2, ...03 M, ...04 E1, ...05 no account,
-- ...06 E3 inactive, ...07 X (T2), ...08 inactive no account, ...09 active no account
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, user_id, is_active) values
  ('a7720000-0000-0000-0000-000000000001', 'a7700000-0000-0000-0000-0000000000a1', 'a7710000-0000-0000-0000-000000000001', convert_to('O', 'UTF8'), 'a7790000-0000-0000-0000-000000000001', true),
  ('a7720000-0000-0000-0000-000000000002', 'a7700000-0000-0000-0000-0000000000a1', 'a7710000-0000-0000-0000-000000000001', convert_to('O2', 'UTF8'), 'a7790000-0000-0000-0000-000000000002', true),
  ('a7720000-0000-0000-0000-000000000003', 'a7700000-0000-0000-0000-0000000000a1', 'a7710000-0000-0000-0000-000000000001', convert_to('M', 'UTF8'), 'a7790000-0000-0000-0000-000000000003', true),
  ('a7720000-0000-0000-0000-000000000004', 'a7700000-0000-0000-0000-0000000000a1', 'a7710000-0000-0000-0000-000000000001', convert_to('E1', 'UTF8'), 'a7790000-0000-0000-0000-000000000004', true),
  ('a7720000-0000-0000-0000-000000000005', 'a7700000-0000-0000-0000-0000000000a1', 'a7710000-0000-0000-0000-000000000001', convert_to('NA', 'UTF8'), null, true),
  ('a7720000-0000-0000-0000-000000000006', 'a7700000-0000-0000-0000-0000000000a1', 'a7710000-0000-0000-0000-000000000001', convert_to('E3', 'UTF8'), 'a7790000-0000-0000-0000-000000000005', false),
  ('a7720000-0000-0000-0000-000000000007', 'a7700000-0000-0000-0000-0000000000a2', 'a7710000-0000-0000-0000-000000000002', convert_to('X', 'UTF8'), 'a7790000-0000-0000-0000-000000000006', true),
  ('a7720000-0000-0000-0000-000000000008', 'a7700000-0000-0000-0000-0000000000a1', 'a7710000-0000-0000-0000-000000000001', convert_to('IN', 'UTF8'), null, false),
  ('a7720000-0000-0000-0000-000000000009', 'a7700000-0000-0000-0000-0000000000a1', 'a7710000-0000-0000-0000-000000000001', convert_to('AC', 'UTF8'), null, true);

create function pg_temp.mgr_rows(p_user text) returns int language sql as $$
  select count(*)::int from core.role_assignments
   where tenant_id = 'a7700000-0000-0000-0000-0000000000a1' and user_id = p_user::uuid
     and role_id = '00000000-0000-0000-0000-000000000005';
$$;
create function pg_temp.role_rows(p_user text, p_role text) returns int language sql as $$
  select count(*)::int from core.role_assignments
   where tenant_id = 'a7700000-0000-0000-0000-0000000000a1' and user_id = p_user::uuid and role_id = p_role::uuid;
$$;
create function pg_temp.audits(p_action text) returns int language sql as $$
  select count(*)::int from audit.audit_logs where tenant_id = 'a7700000-0000-0000-0000-0000000000a1' and action = p_action;
$$;

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.set_employee_manager_role(uuid, uuid, boolean)', 'execute'), false, 'A: anon cannot call the api wrapper');
select is(has_function_privilege('anon', 'core.set_employee_manager_role(uuid, uuid, boolean)', 'execute'), false, 'A: anon cannot call the core function');
select is(has_function_privilege('authenticated', 'api.set_employee_manager_role(uuid, uuid, boolean)', 'execute'), true, 'A: authenticated can call the api wrapper');
select is(has_function_privilege('anon', 'core.employee_user_is_manager(uuid, uuid)', 'execute'), false, 'A: anon cannot call the read helper');
select is(has_function_privilege('authenticated', 'workforce.on_employee_deactivated()', 'execute'), false, 'A: trigger body not callable by authenticated');
select is((select prosecdef from pg_proc where oid = 'api.set_employee_manager_role(uuid, uuid, boolean)'::regprocedure), false, 'A: api wrapper is SECURITY INVOKER (ADR 0008)');
select is((select prosecdef from pg_proc where oid = 'core.set_employee_manager_role(uuid, uuid, boolean)'::regprocedure), true, 'A: core function is SECURITY DEFINER');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'core.set_employee_manager_role(uuid, uuid, boolean)'::regprocedure), 'A: core function pins search_path');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'workforce.on_employee_deactivated()'::regprocedure), 'A: trigger function pins search_path');
select is(pg_temp.anon_err($$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', true) $$), '42501', 'A: anon call refused');

-- B: refusals ----------------------------------------------------------------------------------
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000003',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', true)::text $$),
  '^ERR 42501 permission_denied', 'B: a Manager cannot appoint');
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000004',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000005', true)::text $$),
  '^ERR 42501 permission_denied', 'B: an Employee cannot appoint');
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000007', true)::text $$),
  '^ERR P0002 employee_not_found', 'B: another tenant''s employee is not found');
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a2', 'a7720000-0000-0000-0000-000000000007', true)::text $$),
  '^ERR 42501 permission_denied', 'B: the T1 Owner has no rights in T2');
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000005', true)::text $$),
  '^ERR P0001 employee_has_no_account', 'B: an employee without an account is refused');
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000006', true)::text $$),
  '^ERR P0001 employee_inactive', 'B: an inactive employee is refused');
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000001', true)::text $$),
  '^ERR P0001 cannot_change_own_role', 'B: the caller cannot change their own role');
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', null, true)::text $$),
  '^ERR 22004', 'B: null employee refused');
select is((select count(*)::int from core.role_assignments where role_id = '00000000-0000-0000-0000-000000000005'
            and tenant_id = 'a7700000-0000-0000-0000-0000000000a1'), 1, 'B: refusals wrote no role row (only M''s seed)');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a7700000-0000-0000-0000-0000000000a1'), 0, 'B: refusals wrote no audit row');

-- C: appoint -----------------------------------------------------------------------------------
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000004',
  $$ select core.has_permission('a7700000-0000-0000-0000-0000000000a1', 'workforce.staff.manage', 'a7710000-0000-0000-0000-000000000001')::text $$),
  'false', 'C: before: E1 has no workforce.staff.manage');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', true)::text $$)::jsonb,
  '{"employee_id": "a7720000-0000-0000-0000-000000000004", "is_manager": true, "changed": true}'::jsonb, 'C: Owner appoints E1');
select is((select string_agg(coalesce(location_id::text, 'tenant'), ',') from core.role_assignments
            where tenant_id = 'a7700000-0000-0000-0000-0000000000a1' and user_id = 'a7790000-0000-0000-0000-000000000004'
              and role_id = '00000000-0000-0000-0000-000000000005'), 'tenant', 'C: one tenant-wide manager role row');
select is(pg_temp.role_rows('a7790000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006'), 1, 'C: employee role kept');
select is(pg_temp.audits('appoint_manager'), 1, 'C: one appoint audit row');
select is((select actor_id::text || '/' || module::text || '/' || entity || '/' || (before ->> 'is_manager') || '>' || (after ->> 'is_manager')
             from audit.audit_logs where tenant_id = 'a7700000-0000-0000-0000-0000000000a1' and action = 'appoint_manager'),
  'a7790000-0000-0000-0000-000000000001/core/role_assignment/false>true', 'C: audit row: actor, module, entity, before/after');
select ok((select (before::text || after::text || metadata::text) !~ '(@|email|name|\\x)'
             from audit.audit_logs where tenant_id = 'a7700000-0000-0000-0000-0000000000a1' and action = 'appoint_manager'),
  'C: the audit row carries no PII');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000004',
  $$ select core.has_permission('a7700000-0000-0000-0000-0000000000a1', 'workforce.staff.manage', 'a7710000-0000-0000-0000-000000000001')::text $$),
  'true', 'C: the new Manager passes workforce.staff.manage');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000004',
  $$ select core.has_permission('a7700000-0000-0000-0000-0000000000a1', 'core.role.manage', null)::text $$),
  'false', 'C: ... but not core.role.manage');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', true)::text $$)::jsonb ->> 'changed',
  'false', 'C: appointing again is a no-op');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000004'), 1, 'C: still one manager row');
select is(pg_temp.audits('appoint_manager'), 1, 'C: no second audit row');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000002',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', true)::text $$)::jsonb ->> 'is_manager',
  'true', 'C: a second Owner sees the same state');

-- D: read ----------------------------------------------------------------------------------------
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select string_agg(convert_from(name_encrypted, 'UTF8') || '=' || is_manager, ',' order by staff_id) from api.workforce_staff_manage
      where tenant_id = 'a7700000-0000-0000-0000-0000000000a1' $$),
  'O=false,O2=false,M=true,E1=true,NA=false,E3=false,IN=false,AC=false', 'D: is_manager per row for the Owner');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000003',
  $$ select is_manager::text from api.workforce_staff_manage where staff_id = 'a7720000-0000-0000-0000-000000000004' $$),
  'true', 'D: a Manager sees the badge too');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000006',
  $$ select core.employee_user_is_manager('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000003')::text $$),
  'false', 'D: the helper answers false to a non-member');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000005',
  $$ select core.employee_user_is_manager('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000003')::text $$),
  'false', 'D: ... and to a plain Employee of the tenant');

-- E: revoke --------------------------------------------------------------------------------------
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', false)::text $$)::jsonb,
  '{"employee_id": "a7720000-0000-0000-0000-000000000004", "is_manager": false, "changed": true}'::jsonb, 'E: Owner revokes E1');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000004'), 0, 'E: manager row gone');
select is(pg_temp.role_rows('a7790000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006'), 1, 'E: employee role kept');
select is(pg_temp.audits('revoke_manager'), 1, 'E: one revoke audit row');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000004',
  $$ select core.has_permission('a7700000-0000-0000-0000-0000000000a1', 'workforce.staff.manage', 'a7710000-0000-0000-0000-000000000001')::text $$),
  'false', 'E: E1 lost workforce.staff.manage');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', false)::text $$)::jsonb ->> 'changed',
  'false', 'E: revoking again is a no-op');
select is(pg_temp.audits('revoke_manager'), 1, 'E: no second revoke audit row');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000002', false)::text $$)::jsonb ->> 'changed',
  'false', 'E: "revoking" a co-Owner (not a Manager) changes nothing');
select is(pg_temp.role_rows('a7790000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'), 1, 'E: tenant_owner assignment untouched');
-- M also holds a location-scoped manager row? add one, then revoke removes every manager row
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'a7710000-0000-0000-0000-000000000001');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000003', false)::text $$)::jsonb ->> 'changed',
  'true', 'E: revoke M (tenant-wide + location manager rows)');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000003'), 0, 'E: every manager row of M removed');
select is(pg_temp.role_rows('a7790000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006'), 1, 'E: M keeps the employee role');
-- restore M as Manager for F/G
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000003', true)::text $$)::jsonb ->> 'changed',
  'true', 'E: M re-appointed');

-- F: DEBT-094 --------------------------------------------------------------------------------------
insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, invited_by) values
  ('a7730000-0000-0000-0000-000000000001', 'a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000005', 'a7790000-0000-0000-0000-000000000007', 'a7790000-0000-0000-0000-000000000003');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000003',
  $$ with u as (update api.workforce_staff_manage set is_active = false where staff_id = 'a7720000-0000-0000-0000-000000000005' returning 1) select count(*)::text from u $$),
  '1', 'F: the Manager deactivates the invited employee');
select is((select status || '/' || (revoked_at is not null) from workforce.employee_invitations where id = 'a7730000-0000-0000-0000-000000000001'),
  'revoked/true', 'F: the pending invitation is revoked');
select is((select actor_id::text || '/' || entity || '/' || (metadata ->> 'reason') from audit.audit_logs
            where tenant_id = 'a7700000-0000-0000-0000-0000000000a1' and action = 'revoke' and entity = 'employee_invitation'),
  'a7790000-0000-0000-0000-000000000003/employee_invitation/employee_deactivated', 'F: invitation revoke audited');
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000007',
  $$ select out_tenant_id::text from api.accept_employee_invitation('a7730000-0000-0000-0000-000000000001') $$),
  '^ERR P0001 invitation_not_acceptable', 'F: the revoked invitation cannot be accepted');
-- a legacy pending invitation of an already-inactive employee (no trigger fired for it)
insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, invited_by) values
  ('a7730000-0000-0000-0000-000000000002', 'a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000008', 'a7790000-0000-0000-0000-000000000008', 'a7790000-0000-0000-0000-000000000003');
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000008',
  $$ select out_tenant_id::text from api.accept_employee_invitation('a7730000-0000-0000-0000-000000000002') $$),
  '^ERR P0001 invitation_not_acceptable', 'F: accept refuses an inactive employee');
select is((select count(*)::int from core.tenant_memberships where user_id = 'a7790000-0000-0000-0000-000000000008'), 0, 'F: no membership for the inactive hire');
select is((select count(*)::int from core.role_assignments where user_id = 'a7790000-0000-0000-0000-000000000008'), 0, 'F: no role for the inactive hire');
select is((select user_id from workforce.employees where id = 'a7720000-0000-0000-0000-000000000008'), null, 'F: the inactive employee stays unbound');
-- positive control: an active employee still accepts
insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, invited_by) values
  ('a7730000-0000-0000-0000-000000000003', 'a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000009', 'a7790000-0000-0000-0000-000000000009', 'a7790000-0000-0000-0000-000000000003');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000009',
  $$ select out_employee_id::text from api.accept_employee_invitation('a7730000-0000-0000-0000-000000000003') $$),
  'a7720000-0000-0000-0000-000000000009', 'F: an active employee still accepts');
select is((select user_id::text from workforce.employees where id = 'a7720000-0000-0000-0000-000000000009'),
  'a7790000-0000-0000-0000-000000000009', 'F: ... and is bound');

-- G: deactivating a Manager -------------------------------------------------------------------------
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', true)::text $$)::jsonb ->> 'changed',
  'true', 'G: E1 appointed again');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000003',
  $$ with u as (update api.workforce_staff_manage set is_active = false where staff_id = 'a7720000-0000-0000-0000-000000000004' returning 1) select count(*)::text from u $$),
  '1', 'G: M deactivates E1');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000004'), 0, 'G: deactivation dropped the Manager role');
-- 0139 (DEBT-121): deactivation now also removes the employee role (was: 'G: employee role stays', 1)
select is(pg_temp.role_rows('a7790000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006'), 0, 'G: employee role removed too (0139, DEBT-121)');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a7700000-0000-0000-0000-0000000000a1'
            and action = 'revoke_manager' and metadata ->> 'reason' = 'employee_deactivated'
            and actor_id = 'a7790000-0000-0000-0000-000000000003'), 1, 'G: revoke audited with reason employee_deactivated');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000003',
  $$ with u as (update api.workforce_staff_manage set is_active = true where staff_id = 'a7720000-0000-0000-0000-000000000004' returning 1) select count(*)::text from u $$),
  '1', 'G: M reactivates E1');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000004'), 0, 'G: reactivation does not restore the Manager role');
select is(pg_temp.role_rows('a7790000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'), 1, 'G: the Owner''s role was never touched');

-- H: review additions ------------------------------------------------------------------------------
-- fixtures: A = tenant_admin, ML = Manager scoped to L1 only, Z = legacy inactive Manager;
-- T1 / L2 with employee ...10 (no account); employee ...11 = Z, inactive from the start
insert into core.locations (id, tenant_id, name) values
  ('a7710000-0000-0000-0000-000000000003', 'a7700000-0000-0000-0000-0000000000a1', 'T1 / L2');
insert into core.users (id, display_name) values
  ('a7790000-0000-0000-0000-00000000000a', 'A admin'),
  ('a7790000-0000-0000-0000-00000000000b', 'ML location manager'),
  ('a7790000-0000-0000-0000-00000000000c', 'Z legacy');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-00000000000a', 'active'),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-00000000000b', 'active'),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-00000000000c', 'active');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000004', null),
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', 'a7710000-0000-0000-0000-000000000001');
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, user_id, is_active) values
  ('a7720000-0000-0000-0000-000000000010', 'a7700000-0000-0000-0000-0000000000a1', 'a7710000-0000-0000-0000-000000000003', convert_to('L2', 'UTF8'), null, true),
  ('a7720000-0000-0000-0000-000000000011', 'a7700000-0000-0000-0000-0000000000a1', 'a7710000-0000-0000-0000-000000000001', convert_to('Z', 'UTF8'), 'a7790000-0000-0000-0000-00000000000c', false);

-- H1: module OFF
update core.tenant_modules set is_enabled = false where tenant_id = 'a7700000-0000-0000-0000-0000000000a1' and module = 'workforce';
select matches(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', true)::text $$),
  '^ERR P0001 workforce_module_disabled', 'H1: Workforce OFF -> P0001 workforce_module_disabled');
update core.tenant_modules set is_enabled = true where tenant_id = 'a7700000-0000-0000-0000-0000000000a1' and module = 'workforce';
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000004'), 0, 'H1: nothing written while OFF');

-- H2: tenant_admin appoints and revokes; owners untouched
select is(pg_temp.as_user('a7790000-0000-0000-0000-00000000000a',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', true)::text $$)::jsonb ->> 'changed',
  'true', 'H2: tenant_admin appoints');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000004'), 1, 'H2: manager row created by the admin');
select is(pg_temp.as_user('a7790000-0000-0000-0000-00000000000a',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', false)::text $$)::jsonb ->> 'changed',
  'true', 'H2: tenant_admin revokes');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000004'), 0, 'H2: manager row removed by the admin');
select is(pg_temp.role_rows('a7790000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003')
          + pg_temp.role_rows('a7790000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'), 2,
  'H2: both tenant_owner assignments untouched');
select is(pg_temp.role_rows('a7790000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000004'), 1, 'H2: tenant_admin assignment untouched');

-- H3: a Manager deactivates the Owner's employee row (Owner also holds a manager row)
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', null);
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000003',
  $$ with u as (update api.workforce_staff_manage set is_active = false where staff_id = 'a7720000-0000-0000-0000-000000000001' returning 1) select count(*)::text from u $$),
  '1', 'H3: Manager M deactivates the Owner''s employee row');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000001'), 0, 'H3: only the Owner''s manager row is removed');
select is(pg_temp.role_rows('a7790000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'), 1, 'H3: tenant_owner stays');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select core.has_permission('a7700000-0000-0000-0000-0000000000a1', 'core.role.manage', null)::text $$),
  'true', 'H3: the Owner keeps owner permissions');
update workforce.employees set is_active = true where id = 'a7720000-0000-0000-0000-000000000001';

-- H4: deleting an employee drops the manager role
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004', true)::text $$)::jsonb ->> 'changed',
  'true', 'H4: E1 appointed');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000003',
  $$ select deleted::text from api.permanently_delete_employee('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000004') $$),
  'true', 'H4: M permanently deletes E1''s (active, history-free) employee row');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000004'), 0, 'H4: the manager role did not outlive the employee row');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a7700000-0000-0000-0000-0000000000a1'
            and action = 'revoke_manager' and metadata ->> 'reason' = 'employee_deleted'
            and metadata ->> 'user_id' = 'a7790000-0000-0000-0000-000000000004'
            and actor_id = 'a7790000-0000-0000-0000-000000000003'), 1, 'H4: audited with reason employee_deleted');
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000004',
  $$ select core.has_permission('a7700000-0000-0000-0000-0000000000a1', 'workforce.staff.manage', 'a7710000-0000-0000-0000-000000000001')::text $$),
  'false', 'H4: the former E1 has no Manager rights');
-- an unbound employee row deletes without audit noise
select is(pg_temp.as_user('a7790000-0000-0000-0000-000000000001',
  $$ select deleted::text from api.permanently_delete_employee('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000008') $$),
  'true', 'H4: deleting an unbound employee still works');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a7700000-0000-0000-0000-0000000000a1'
            and metadata ->> 'employee_id' = 'a7720000-0000-0000-0000-000000000008' and metadata ->> 'reason' = 'employee_deleted'), 0,
  'H4: ... with no revoke audit row (trigger only for bound rows)');

-- H5: cross-location (RLS model: workforce.staff.manage is matched at the row's location)
select is(pg_temp.as_user('a7790000-0000-0000-0000-00000000000b',
  $$ select count(*)::text from api.workforce_staff_manage where staff_id = 'a7720000-0000-0000-0000-000000000010' $$),
  '0', 'H5: an L1-scoped Manager cannot see L2 staff');
select is(pg_temp.as_user('a7790000-0000-0000-0000-00000000000b',
  $$ select count(*)::text from api.workforce_staff_manage where staff_id = 'a7720000-0000-0000-0000-000000000009' $$),
  '1', 'H5: ... but sees L1 staff');
select is(pg_temp.as_user('a7790000-0000-0000-0000-00000000000b',
  $$ with u as (update api.workforce_staff_manage set is_active = false where staff_id = 'a7720000-0000-0000-0000-000000000010' returning 1) select count(*)::text from u $$),
  '0', 'H5: ... and cannot deactivate L2 staff');
select is((select is_active from workforce.employees where id = 'a7720000-0000-0000-0000-000000000010'), true, 'H5: the L2 employee stays active');
select matches(pg_temp.as_user('a7790000-0000-0000-0000-00000000000b',
  $$ select api.set_employee_manager_role('a7700000-0000-0000-0000-0000000000a1', 'a7720000-0000-0000-0000-000000000009', true)::text $$),
  '^ERR 42501 permission_denied', 'H5: a location Manager cannot appoint either');

-- H6: backfill of legacy inactive Managers
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a7700000-0000-0000-0000-0000000000a1', 'a7790000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000005', null);
select is(has_function_privilege('authenticated', 'core.revoke_inactive_employee_managers()', 'execute'), false, 'H6: backfill not callable by authenticated');
select is(has_function_privilege('service_role', 'core.revoke_inactive_employee_managers()', 'execute'), false, 'H6: ... nor by service_role');
select ok(core.revoke_inactive_employee_managers() >= 1, 'H6: backfill removes the legacy inactive Manager');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-00000000000c'), 0, 'H6: Z has no manager row');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a7700000-0000-0000-0000-0000000000a1'
            and action = 'revoke_manager' and metadata ->> 'reason' = 'backfill_inactive'
            and metadata ->> 'user_id' = 'a7790000-0000-0000-0000-00000000000c' and actor_id is null and actor_kind = 'system'), 1,
  'H6: one system audit row, reason backfill_inactive');
select is(core.revoke_inactive_employee_managers(), 0, 'H6: second run removes nothing (idempotent)');
select is((select count(*)::int from core.role_assignments ra join workforce.employees e on e.tenant_id = ra.tenant_id and e.user_id = ra.user_id
            where ra.role_id = '00000000-0000-0000-0000-000000000005' and not e.is_active), 0,
  'H6: no inactive Manager exists anywhere');
select is(pg_temp.mgr_rows('a7790000-0000-0000-0000-000000000003'), 1, 'H6: active Manager M untouched');

select * from finish();
rollback;
