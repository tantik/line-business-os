-- ============================================================================
-- DB test: migration 0139 (deactivating staff closes their tenant access, DEBT-121).
-- Run with:  supabase db reset && supabase test db
--   A  grants / SECURITY DEFINER / pinned search_path
--   B  deactivate a plain employee: employee role gone, membership suspended,
--      audit rows; no permission, not a member, gone from my_tenant_memberships
--   C  deactivate a Manager-employee: manager + employee roles gone, suspended
--   D  user who also holds tenant_owner / tenant_admin: employee role gone,
--      membership stays active, owner/admin rights intact
--   E  reactivate: membership active, employee role back at the CURRENT
--      location, audit rows; Manager role not restored; owner (membership
--      never suspended) gets the role back without a reactivate audit row
--   F  reactivate with a revoked membership: membership stays revoked, no role
--   G  permanent delete: roles gone + membership suspended (reason employee_deleted)
--   G2 re-hire on a new row + fresh invitation -> accept re-activates membership
--   G3 revoked membership + invitation -> accept refused, nothing written
--   H  tenant cascade delete still works
--   I  backfill of legacy inactive employees; idempotent
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

-- fixtures ------------------------------------------------------------------------------------
-- T1 = ...a1 (L1 ...01, L2 ...02), T3 = ...a3 (L3 ...03, cascade test only).
-- Users: 01 O owner, 02 E employee, 03 OE owner + employee, 04 AE admin + employee,
-- 05 R employee (membership revoked later), 06 D employee (deleted), 07 LG legacy inactive,
-- 08 LO legacy inactive owner, 09 M manager + employee, 0a X (T3)
insert into core.tenants (id, slug, name) values
  ('a7800000-0000-0000-0000-0000000000a1', 'pgtap-0139-t1', 'pgTAP 0139 T1'),
  ('a7800000-0000-0000-0000-0000000000a3', 'pgtap-0139-t3', 'pgTAP 0139 T3');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a7800000-0000-0000-0000-0000000000a1', 'workforce', true),
  ('a7800000-0000-0000-0000-0000000000a3', 'workforce', true);
insert into core.locations (id, tenant_id, name) values
  ('a7810000-0000-0000-0000-000000000001', 'a7800000-0000-0000-0000-0000000000a1', 'T1 / L1'),
  ('a7810000-0000-0000-0000-000000000002', 'a7800000-0000-0000-0000-0000000000a1', 'T1 / L2'),
  ('a7810000-0000-0000-0000-000000000003', 'a7800000-0000-0000-0000-0000000000a3', 'T3 / L3');
insert into core.users (id, display_name) values
  ('a7890000-0000-0000-0000-000000000001', 'O'),
  ('a7890000-0000-0000-0000-000000000002', 'E'),
  ('a7890000-0000-0000-0000-000000000003', 'OE'),
  ('a7890000-0000-0000-0000-000000000004', 'AE'),
  ('a7890000-0000-0000-0000-000000000005', 'R'),
  ('a7890000-0000-0000-0000-000000000006', 'D'),
  ('a7890000-0000-0000-0000-000000000007', 'LG'),
  ('a7890000-0000-0000-0000-000000000008', 'LO'),
  ('a7890000-0000-0000-0000-000000000009', 'M'),
  ('a7890000-0000-0000-0000-00000000000a', 'X');
insert into core.tenant_memberships (tenant_id, user_id, status)
select 'a7800000-0000-0000-0000-0000000000a1', u::uuid, 'active'
  from unnest(array['a7890000-0000-0000-0000-000000000001', 'a7890000-0000-0000-0000-000000000002',
                    'a7890000-0000-0000-0000-000000000003', 'a7890000-0000-0000-0000-000000000004',
                    'a7890000-0000-0000-0000-000000000005', 'a7890000-0000-0000-0000-000000000006',
                    'a7890000-0000-0000-0000-000000000007', 'a7890000-0000-0000-0000-000000000008',
                    'a7890000-0000-0000-0000-000000000009']) u;
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a7800000-0000-0000-0000-0000000000a3', 'a7890000-0000-0000-0000-00000000000a', 'active');
-- role ids: tenant_owner=...003, tenant_admin=...004, manager=...005, employee=...006
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', null),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'a7810000-0000-0000-0000-000000000001'),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', null),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'a7810000-0000-0000-0000-000000000001'),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', null),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'a7810000-0000-0000-0000-000000000001'),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006', 'a7810000-0000-0000-0000-000000000001'),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'a7810000-0000-0000-0000-000000000001'),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000006', 'a7810000-0000-0000-0000-000000000001'),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000003', null),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000006', 'a7810000-0000-0000-0000-000000000001'),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000005', null),
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000006', 'a7810000-0000-0000-0000-000000000001'),
  ('a7800000-0000-0000-0000-0000000000a3', 'a7890000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000006', 'a7810000-0000-0000-0000-000000000003');
-- employees: ...02 E, ...03 OE, ...04 AE, ...05 R, ...06 D, ...07 LG (inactive, legacy),
-- ...08 LO (inactive, legacy), ...09 M, ...0a X (T3); all at L1 except X
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, user_id, is_active) values
  ('a7820000-0000-0000-0000-000000000002', 'a7800000-0000-0000-0000-0000000000a1', 'a7810000-0000-0000-0000-000000000001', convert_to('E', 'UTF8'), 'a7890000-0000-0000-0000-000000000002', true),
  ('a7820000-0000-0000-0000-000000000003', 'a7800000-0000-0000-0000-0000000000a1', 'a7810000-0000-0000-0000-000000000001', convert_to('OE', 'UTF8'), 'a7890000-0000-0000-0000-000000000003', true),
  ('a7820000-0000-0000-0000-000000000004', 'a7800000-0000-0000-0000-0000000000a1', 'a7810000-0000-0000-0000-000000000001', convert_to('AE', 'UTF8'), 'a7890000-0000-0000-0000-000000000004', true),
  ('a7820000-0000-0000-0000-000000000005', 'a7800000-0000-0000-0000-0000000000a1', 'a7810000-0000-0000-0000-000000000001', convert_to('R', 'UTF8'), 'a7890000-0000-0000-0000-000000000005', true),
  ('a7820000-0000-0000-0000-000000000006', 'a7800000-0000-0000-0000-0000000000a1', 'a7810000-0000-0000-0000-000000000001', convert_to('D', 'UTF8'), 'a7890000-0000-0000-0000-000000000006', true),
  ('a7820000-0000-0000-0000-000000000007', 'a7800000-0000-0000-0000-0000000000a1', 'a7810000-0000-0000-0000-000000000001', convert_to('LG', 'UTF8'), 'a7890000-0000-0000-0000-000000000007', false),
  ('a7820000-0000-0000-0000-000000000008', 'a7800000-0000-0000-0000-0000000000a1', 'a7810000-0000-0000-0000-000000000001', convert_to('LO', 'UTF8'), 'a7890000-0000-0000-0000-000000000008', false),
  ('a7820000-0000-0000-0000-000000000009', 'a7800000-0000-0000-0000-0000000000a1', 'a7810000-0000-0000-0000-000000000001', convert_to('M', 'UTF8'), 'a7890000-0000-0000-0000-000000000009', true),
  ('a7820000-0000-0000-0000-00000000000a', 'a7800000-0000-0000-0000-0000000000a3', 'a7810000-0000-0000-0000-000000000003', convert_to('X', 'UTF8'), 'a7890000-0000-0000-0000-00000000000a', true);

create function pg_temp.role_rows(p_user text, p_role text) returns int language sql as $$
  select count(*)::int from core.role_assignments
   where tenant_id = 'a7800000-0000-0000-0000-0000000000a1' and user_id = p_user::uuid and role_id = p_role::uuid;
$$;
create function pg_temp.mem(p_user text) returns text language sql as $$
  select coalesce((select status::text from core.tenant_memberships
                    where tenant_id = 'a7800000-0000-0000-0000-0000000000a1' and user_id = p_user::uuid), 'none');
$$;
create function pg_temp.audits(p_action text, p_user text, p_reason text) returns int language sql as $$
  select count(*)::int from audit.audit_logs
   where tenant_id = 'a7800000-0000-0000-0000-0000000000a1' and action = p_action
     and metadata ->> 'user_id' = p_user and metadata ->> 'reason' = p_reason;
$$;
-- one permission the employee role holds (read from the seed, not hard-coded)
create function pg_temp.emp_perm() returns text language sql as $$
  select min(permission_key) from core.role_permissions where role_id = '00000000-0000-0000-0000-000000000006';
$$;
-- the user's own view of their access to T1: has_permission(emp_perm, L1) / is_member_of / my_tenant_memberships rows
create function pg_temp.access(p_user text) returns text language sql as $$
  select pg_temp.as_user(p_user, format(
    $f$ select core.has_permission('a7800000-0000-0000-0000-0000000000a1', %L, 'a7810000-0000-0000-0000-000000000001')::text
          || '/' || core.is_member_of('a7800000-0000-0000-0000-0000000000a1')::text
          || '/' || (select count(*) from api.my_tenant_memberships where tenant_id = 'a7800000-0000-0000-0000-0000000000a1')::text $f$,
    pg_temp.emp_perm()));
$$;
create function pg_temp.set_active(p_actor text, p_staff text, p_active boolean) returns text language sql as $$
  select pg_temp.as_user(p_actor, format(
    $f$ with u as (update api.workforce_staff_manage set is_active = %L where staff_id = %L returning 1) select count(*)::text from u $f$,
    p_active, p_staff));
$$;

-- A: grants ------------------------------------------------------------------------------------
select ok(pg_temp.emp_perm() is not null, 'A: the employee role holds at least one permission (fixture sanity)');
select is(has_function_privilege('authenticated', 'workforce.on_employee_reactivated()', 'execute'), false, 'A: reactivation trigger body not callable by authenticated');
select is(has_function_privilege('anon', 'workforce.on_employee_reactivated()', 'execute'), false, 'A: ... nor by anon');
select is(has_function_privilege('authenticated', 'workforce.on_employee_deactivated()', 'execute'), false, 'A: deactivation trigger body not callable by authenticated');
select is(has_function_privilege('authenticated', 'core.revoke_inactive_employee_access()', 'execute'), false, 'A: backfill not callable by authenticated');
select is(has_function_privilege('service_role', 'core.revoke_inactive_employee_access()', 'execute'), false, 'A: ... nor by service_role');
select is(has_function_privilege('anon', 'core.revoke_inactive_employee_access()', 'execute'), false, 'A: ... nor by anon');
select is((select prosecdef from pg_proc where oid = 'workforce.on_employee_reactivated()'::regprocedure), true, 'A: reactivation trigger is SECURITY DEFINER');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'workforce.on_employee_reactivated()'::regprocedure), 'A: reactivation trigger pins search_path');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'core.revoke_inactive_employee_access()'::regprocedure), 'A: backfill pins search_path');
select ok(exists (select 1 from pg_trigger where tgrelid = 'workforce.employees'::regclass and tgname = 'employees_on_reactivated' and not tgisinternal), 'A: employees_on_reactivated trigger exists');
select ok(obj_description('workforce.on_employee_deactivated()'::regprocedure, 'pg_proc') like '%0139 (DEBT-121)%', 'A: trigger function comment describes 0139');

-- B: deactivate a plain employee --------------------------------------------------------------
select is(pg_temp.access('a7890000-0000-0000-0000-000000000002'), 'true/true/1', 'B: before: E has the permission, is a member, sees T1');
select is(pg_temp.set_active('a7890000-0000-0000-0000-000000000001', 'a7820000-0000-0000-0000-000000000002', false), '1', 'B: Owner deactivates E');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006'), 0, 'B: employee role gone');
select is(pg_temp.mem('a7890000-0000-0000-0000-000000000002'), 'suspended', 'B: membership suspended');
select is(pg_temp.access('a7890000-0000-0000-0000-000000000002'), 'false/false/0', 'B: E has no permission, is no member, T1 gone from my_tenant_memberships');
select is((select actor_id::text || '/' || actor_kind || '/' || module::text || '/' || entity || '/' || (before ->> 'is_employee') || '>' || (after ->> 'is_employee')
             || '/' || (metadata ->> 'role_key') || '/' || jsonb_array_length(metadata -> 'role_assignment_ids') || '/' || (metadata ->> 'employee_id')
             from audit.audit_logs where tenant_id = 'a7800000-0000-0000-0000-0000000000a1' and action = 'revoke_employee'
              and metadata ->> 'user_id' = 'a7890000-0000-0000-0000-000000000002' and metadata ->> 'reason' = 'employee_deactivated'),
  'a7890000-0000-0000-0000-000000000001/user/core/role_assignment/true>false/employee/1/a7820000-0000-0000-0000-000000000002', 'B: revoke_employee audit row');
select is((select actor_id::text || '/' || module::text || '/' || entity || '/' || (before ->> 'status') || '>' || (after ->> 'status')
             from audit.audit_logs where tenant_id = 'a7800000-0000-0000-0000-0000000000a1' and action = 'suspend'
              and metadata ->> 'user_id' = 'a7890000-0000-0000-0000-000000000002' and metadata ->> 'reason' = 'employee_deactivated'),
  'a7890000-0000-0000-0000-000000000001/core/tenant_membership/active>suspended', 'B: suspend audit row');
select ok((select bool_and((coalesce(before::text, '') || coalesce(after::text, '') || metadata::text) !~ '(@|email|name|\\x)')
             from audit.audit_logs where tenant_id = 'a7800000-0000-0000-0000-0000000000a1' and action in ('revoke_employee', 'suspend')),
  'B: audit rows carry no PII');
-- deactivating again (already inactive) is a no-op: no trigger, no new audit
update workforce.employees set is_active = false where id = 'a7820000-0000-0000-0000-000000000002';
select is(pg_temp.audits('suspend', 'a7890000-0000-0000-0000-000000000002', 'employee_deactivated'), 1, 'B: re-saving an inactive row adds no audit row');

-- C: deactivate a Manager-employee --------------------------------------------------------------
select is(pg_temp.set_active('a7890000-0000-0000-0000-000000000001', 'a7820000-0000-0000-0000-000000000009', false), '1', 'C: Owner deactivates M');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000005'), 0, 'C: manager role gone');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000006'), 0, 'C: employee role gone');
select is(pg_temp.mem('a7890000-0000-0000-0000-000000000009'), 'suspended', 'C: membership suspended');
select is(pg_temp.audits('revoke_manager', 'a7890000-0000-0000-0000-000000000009', 'employee_deactivated'), 1, 'C: revoke_manager audited (0138 behaviour kept)');
select is(pg_temp.as_user('a7890000-0000-0000-0000-000000000009',
  $$ select core.has_permission('a7800000-0000-0000-0000-0000000000a1', 'workforce.staff.manage', 'a7810000-0000-0000-0000-000000000001')::text $$),
  'false', 'C: former Manager has no workforce.staff.manage');

-- D: other roles keep the membership --------------------------------------------------------------
select is(pg_temp.set_active('a7890000-0000-0000-0000-000000000001', 'a7820000-0000-0000-0000-000000000003', false), '1', 'D: Owner deactivates co-owner OE''s employee row');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006'), 0, 'D: OE employee role gone');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'), 1, 'D: OE tenant_owner kept');
select is(pg_temp.mem('a7890000-0000-0000-0000-000000000003'), 'active', 'D: OE membership stays active');
select is(pg_temp.audits('suspend', 'a7890000-0000-0000-0000-000000000003', 'employee_deactivated'), 0, 'D: no suspend audit for OE');
select is(pg_temp.as_user('a7890000-0000-0000-0000-000000000003',
  $$ select core.has_permission('a7800000-0000-0000-0000-0000000000a1', 'core.role.manage', null)::text
         || '/' || core.is_member_of('a7800000-0000-0000-0000-0000000000a1')::text $$),
  'true/true', 'D: OE keeps owner rights and membership');
select is(pg_temp.set_active('a7890000-0000-0000-0000-000000000001', 'a7820000-0000-0000-0000-000000000004', false), '1', 'D: Owner deactivates admin AE''s employee row');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006')::text
          || '/' || pg_temp.role_rows('a7890000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004')::text
          || '/' || pg_temp.mem('a7890000-0000-0000-0000-000000000004'),
  '0/1/active', 'D: AE: employee role gone, tenant_admin kept, membership active');

-- E: reactivate ----------------------------------------------------------------------------------------
-- E is moved to L2 while inactive; reactivation restores the role at the CURRENT location
update workforce.employees set location_id = 'a7810000-0000-0000-0000-000000000002' where id = 'a7820000-0000-0000-0000-000000000002';
select is(pg_temp.set_active('a7890000-0000-0000-0000-000000000001', 'a7820000-0000-0000-0000-000000000002', true), '1', 'E: Owner reactivates E');
select is(pg_temp.mem('a7890000-0000-0000-0000-000000000002'), 'active', 'E: membership active again');
select is((select string_agg(coalesce(location_id::text, 'tenant'), ',') from core.role_assignments
            where tenant_id = 'a7800000-0000-0000-0000-0000000000a1' and user_id = 'a7890000-0000-0000-0000-000000000002'
              and role_id = '00000000-0000-0000-0000-000000000006'),
  'a7810000-0000-0000-0000-000000000002', 'E: exactly one employee role, at the current location L2');
select is(pg_temp.audits('reactivate', 'a7890000-0000-0000-0000-000000000002', 'employee_reactivated'), 1, 'E: reactivate audit row');
select is(pg_temp.audits('restore_employee', 'a7890000-0000-0000-0000-000000000002', 'employee_reactivated'), 1, 'E: restore_employee audit row');
select is((select actor_id::text || '/' || entity || '/' || (before ->> 'status') || '>' || (after ->> 'status')
             from audit.audit_logs where tenant_id = 'a7800000-0000-0000-0000-0000000000a1' and action = 'reactivate'
              and metadata ->> 'user_id' = 'a7890000-0000-0000-0000-000000000002'),
  'a7890000-0000-0000-0000-000000000001/tenant_membership/suspended>active', 'E: reactivate audit: actor + before/after');
select is(pg_temp.as_user('a7890000-0000-0000-0000-000000000002', format(
    $f$ select core.has_permission('a7800000-0000-0000-0000-0000000000a1', %L, 'a7810000-0000-0000-0000-000000000002')::text
          || '/' || core.is_member_of('a7800000-0000-0000-0000-0000000000a1')::text $f$, pg_temp.emp_perm())),
  'true/true', 'E: E has access again (at L2)');
-- Manager is not restored
select is(pg_temp.set_active('a7890000-0000-0000-0000-000000000001', 'a7820000-0000-0000-0000-000000000009', true), '1', 'E: Owner reactivates M');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000005'), 0, 'E: Manager role NOT restored');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000006'), 1, 'E: M employee role restored');
select is(pg_temp.mem('a7890000-0000-0000-0000-000000000009'), 'active', 'E: M membership active');
-- owner whose membership was never suspended
select is(pg_temp.set_active('a7890000-0000-0000-0000-000000000001', 'a7820000-0000-0000-0000-000000000003', true), '1', 'E: Owner reactivates OE');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006'), 1, 'E: OE employee role restored');
select is(pg_temp.audits('reactivate', 'a7890000-0000-0000-0000-000000000003', 'employee_reactivated'), 0, 'E: no reactivate audit for an active membership');
-- reactivating an already active row is a no-op
update workforce.employees set is_active = true where id = 'a7820000-0000-0000-0000-000000000002';
select is(pg_temp.audits('restore_employee', 'a7890000-0000-0000-0000-000000000002', 'employee_reactivated'), 1, 'E: re-saving an active row adds no audit row');

-- F: revoked membership stays revoked ---------------------------------------------------------------------
select is(pg_temp.set_active('a7890000-0000-0000-0000-000000000001', 'a7820000-0000-0000-0000-000000000005', false), '1', 'F: Owner deactivates R');
select is(pg_temp.mem('a7890000-0000-0000-0000-000000000005'), 'suspended', 'F: R suspended');
update core.tenant_memberships set status = 'revoked'
 where tenant_id = 'a7800000-0000-0000-0000-0000000000a1' and user_id = 'a7890000-0000-0000-0000-000000000005';
select is(pg_temp.set_active('a7890000-0000-0000-0000-000000000001', 'a7820000-0000-0000-0000-000000000005', true), '1', 'F: Owner reactivates R');
select is(pg_temp.mem('a7890000-0000-0000-0000-000000000005'), 'revoked', 'F: revoked membership untouched');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006'), 0, 'F: employee role NOT restored next to a revoked membership');
select is(pg_temp.access('a7890000-0000-0000-0000-000000000005'), 'false/false/0', 'F: R has no access');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a7800000-0000-0000-0000-0000000000a1'
            and action in ('reactivate', 'restore_employee') and metadata ->> 'user_id' = 'a7890000-0000-0000-0000-000000000005'), 0,
  'F: no reactivate / restore audit for R');

-- G: permanent delete ---------------------------------------------------------------------------------
select is(pg_temp.as_user('a7890000-0000-0000-0000-000000000001',
  $$ select deleted::text from api.permanently_delete_employee('a7800000-0000-0000-0000-0000000000a1', 'a7820000-0000-0000-0000-000000000006') $$),
  'true', 'G: Owner permanently deletes D''s (active, history-free) employee row');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006'), 0, 'G: employee role gone');
select is(pg_temp.mem('a7890000-0000-0000-0000-000000000006'), 'suspended', 'G: membership suspended');
select is(pg_temp.audits('revoke_employee', 'a7890000-0000-0000-0000-000000000006', 'employee_deleted'), 1, 'G: revoke_employee audited, reason employee_deleted');
select is(pg_temp.audits('suspend', 'a7890000-0000-0000-0000-000000000006', 'employee_deleted'), 1, 'G: suspend audited, reason employee_deleted');
select is(pg_temp.access('a7890000-0000-0000-0000-000000000006'), 'false/false/0', 'G: D has no access');

-- G2: re-hire on a NEW employee row via a fresh invitation re-activates the suspended membership
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, user_id, is_active) values
  ('a7820000-0000-0000-0000-00000000000b', 'a7800000-0000-0000-0000-0000000000a1', 'a7810000-0000-0000-0000-000000000002', convert_to('D2', 'UTF8'), null, true);
insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, invited_by) values
  ('a7830000-0000-0000-0000-000000000001', 'a7800000-0000-0000-0000-0000000000a1', 'a7820000-0000-0000-0000-00000000000b', 'a7890000-0000-0000-0000-000000000006', 'a7890000-0000-0000-0000-000000000001');
select is(pg_temp.as_user('a7890000-0000-0000-0000-000000000006',
  $$ select out_employee_id::text from api.accept_employee_invitation('a7830000-0000-0000-0000-000000000001') $$),
  'a7820000-0000-0000-0000-00000000000b', 'G2: suspended ex-employee D accepts a fresh invitation for a new row');
select is(pg_temp.mem('a7890000-0000-0000-0000-000000000006'), 'active', 'G2: membership active again');
select is((select string_agg(location_id::text, ',') from core.role_assignments
            where tenant_id = 'a7800000-0000-0000-0000-0000000000a1' and user_id = 'a7890000-0000-0000-0000-000000000006'
              and role_id = '00000000-0000-0000-0000-000000000006'),
  'a7810000-0000-0000-0000-000000000002', 'G2: employee role at the new row''s location');
select is(pg_temp.as_user('a7890000-0000-0000-0000-000000000006',
  $$ select (select count(*) from api.my_tenant_memberships where tenant_id = 'a7800000-0000-0000-0000-0000000000a1')::text
         || '/' || core.is_member_of('a7800000-0000-0000-0000-0000000000a1')::text $$),
  '1/true', 'G2: T1 is back in my_tenant_memberships');
select is((select user_id::text from workforce.employees where id = 'a7820000-0000-0000-0000-00000000000b'),
  'a7890000-0000-0000-0000-000000000006', 'G2: new row bound to D');

-- G3: a revoked membership is final: accept refuses, nothing written
insert into core.users (id, display_name) values ('a7890000-0000-0000-0000-00000000000b', 'V');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a7800000-0000-0000-0000-0000000000a1', 'a7890000-0000-0000-0000-00000000000b', 'revoked');
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, user_id, is_active) values
  ('a7820000-0000-0000-0000-00000000000c', 'a7800000-0000-0000-0000-0000000000a1', 'a7810000-0000-0000-0000-000000000001', convert_to('V', 'UTF8'), null, true);
insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, invited_by) values
  ('a7830000-0000-0000-0000-000000000002', 'a7800000-0000-0000-0000-0000000000a1', 'a7820000-0000-0000-0000-00000000000c', 'a7890000-0000-0000-0000-00000000000b', 'a7890000-0000-0000-0000-000000000001');
select is(pg_temp.as_user('a7890000-0000-0000-0000-00000000000b',
  $$ select out_employee_id::text from api.accept_employee_invitation('a7830000-0000-0000-0000-000000000002') $$),
  'ERR P0001 invitation_not_acceptable', 'G3: accept refused for a revoked membership (generic error)');
select is(pg_temp.mem('a7890000-0000-0000-0000-00000000000b'), 'revoked', 'G3: membership stays revoked');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000006'), 0, 'G3: no employee role');
select is((select coalesce(user_id::text, 'unbound') from workforce.employees where id = 'a7820000-0000-0000-0000-00000000000c'), 'unbound', 'G3: employee row stays unbound');
select is((select status::text from workforce.employee_invitations where id = 'a7830000-0000-0000-0000-000000000002'), 'pending', 'G3: invitation not consumed');
select is(pg_temp.access('a7890000-0000-0000-0000-00000000000b'), 'false/false/0', 'G3: V has no access');

-- H: tenant cascade ------------------------------------------------------------------------------------
select lives_ok($$ delete from core.tenants where id = 'a7800000-0000-0000-0000-0000000000a3' $$, 'H: deleting a tenant with a bound employee still works');
select is((select count(*)::int from workforce.employees where tenant_id = 'a7800000-0000-0000-0000-0000000000a3')
          + (select count(*)::int from core.role_assignments where tenant_id = 'a7800000-0000-0000-0000-0000000000a3')
          + (select count(*)::int from core.tenant_memberships where tenant_id = 'a7800000-0000-0000-0000-0000000000a3'), 0,
  'H: nothing of the tenant survives');

-- I: backfill ------------------------------------------------------------------------------------------
select is(pg_temp.access('a7890000-0000-0000-0000-000000000007'), 'true/true/1', 'I: before: legacy inactive LG still has access (the bug)');
select ok(core.revoke_inactive_employee_access() >= 2, 'I: backfill changes at least LG and LO');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000006')::text
          || '/' || pg_temp.mem('a7890000-0000-0000-0000-000000000007'), '0/suspended', 'I: LG: employee role gone, suspended');
select is(pg_temp.access('a7890000-0000-0000-0000-000000000007'), 'false/false/0', 'I: LG has no access');
select is(pg_temp.role_rows('a7890000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000006')::text
          || '/' || pg_temp.role_rows('a7890000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000003')::text
          || '/' || pg_temp.mem('a7890000-0000-0000-0000-000000000008'), '0/1/active', 'I: LO: employee role gone, owner kept, membership active');
select is((select count(*)::int from audit.audit_logs where tenant_id = 'a7800000-0000-0000-0000-0000000000a1'
            and action in ('revoke_employee', 'suspend') and metadata ->> 'reason' = 'backfill_inactive'
            and metadata ->> 'user_id' = 'a7890000-0000-0000-0000-000000000007' and actor_id is null and actor_kind = 'system'), 2,
  'I: LG: two system audit rows (revoke_employee + suspend), reason backfill_inactive');
select is(pg_temp.audits('revoke_employee', 'a7890000-0000-0000-0000-000000000008', 'backfill_inactive')
          + pg_temp.audits('suspend', 'a7890000-0000-0000-0000-000000000008', 'backfill_inactive'), 1,
  'I: LO: one audit row (revoke_employee only)');
select is(pg_temp.mem('a7890000-0000-0000-0000-000000000002') || '/' || pg_temp.role_rows('a7890000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006')::text,
  'active/1', 'I: active employee E untouched');
select is(core.revoke_inactive_employee_access(), 0, 'I: second run changes nothing (idempotent)');
select is((select count(*)::int from core.role_assignments ra
             join workforce.employees e on e.tenant_id = ra.tenant_id and e.user_id = ra.user_id
             join core.roles r on r.id = ra.role_id and r.tenant_id is null and r.key = 'employee'
            where not e.is_active), 0,
  'I: no inactive employee holds the employee role anywhere');

select * from finish();
rollback;
