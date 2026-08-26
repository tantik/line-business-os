-- ============================================================================
-- DB test: Workforce guarded permanent-delete RPC (migration 0056)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Mirrors 0023_inventory_permanent_delete.sql's role-hop fixture pattern and
-- SECURITY DEFINER split exactly (authenticated has no DELETE grant on
-- workforce.employees, reaffirmed by 0002_security_rls.sql -- see 0056's
-- migration header for why this could not simply reuse RLS).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, ai;

select no_plan();

-- ============================================================================
-- Section 1: structure
-- ============================================================================

select has_function('api', 'permanently_delete_employee', array['uuid', 'uuid'], 'api.permanently_delete_employee exists');

select ok(
  has_function_privilege('authenticated', 'api.permanently_delete_employee(uuid, uuid)', 'EXECUTE'),
  'authenticated can execute api.permanently_delete_employee'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'workforce' and table_name = 'employees' and privilege_type = 'DELETE'
      and grantee not in (select tableowner from pg_tables where schemaname = 'workforce' and tablename = 'employees')),
  0,
  'no DELETE grant to any application role exists on workforce.employees -- the RPC is still the only hard-delete path'
);

-- ============================================================================
-- Section 2: role-hop behavioral tests
-- ============================================================================

grant usage on schema workforce to authenticated;
grant usage on schema api to authenticated;

create function pg_temp.as_auth_permadelete(p_sub text, p_tenant uuid, p_employee uuid, out deleted boolean, out blocked_by_history boolean)
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select r.deleted, r.blocked_by_history
    into deleted, blocked_by_history
    from api.permanently_delete_employee(p_tenant, p_employee) r;
  deleted := coalesce(deleted, false);
  blocked_by_history := coalesce(blocked_by_history, false);
end;
$$;

insert into core.tenants (id, slug, name) values
  ('9d000000-0000-0000-0000-00000000000d', 'pgtap-wf-permadelete-tenant', 'pgTAP Workforce Permadelete Tenant');

insert into core.locations (id, tenant_id, name, timezone) values
  ('9d200000-0000-0000-0000-000000000001', '9d000000-0000-0000-0000-00000000000d', 'Location A', 'Asia/Tokyo'),
  ('9d200000-0000-0000-0000-000000000002', '9d000000-0000-0000-0000-00000000000d', 'Location B', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('9d900000-0000-0000-0000-000000000001', 'Staff A (Location A)'),
  ('9d900000-0000-0000-0000-000000000002', 'Manager A (Location A)'),
  ('9d900000-0000-0000-0000-000000000003', 'Manager B (Location B)');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9d000000-0000-0000-0000-00000000000d', '9d900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9d200000-0000-0000-0000-000000000001'), -- employee @ Location A
  ('9d000000-0000-0000-0000-00000000000d', '9d900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '9d200000-0000-0000-0000-000000000001'), -- manager @ Location A
  ('9d000000-0000-0000-0000-00000000000d', '9d900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000005', '9d200000-0000-0000-0000-000000000002'); -- manager @ Location B

insert into workforce.employees (id, tenant_id, location_id, name_encrypted, is_active) values
  ('9d300000-0000-0000-0000-000000000001', '9d000000-0000-0000-0000-00000000000d',
   '9d200000-0000-0000-0000-000000000001', '\x00', false),
  ('9d300000-0000-0000-0000-000000000002', '9d000000-0000-0000-0000-00000000000d',
   '9d200000-0000-0000-0000-000000000001', '\x00', false),
  ('9d300000-0000-0000-0000-000000000003', '9d000000-0000-0000-0000-00000000000d',
   '9d200000-0000-0000-0000-000000000001', '\x00', false);

insert into workforce.shifts (id, tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('9d500000-0000-0000-0000-000000000001', '9d000000-0000-0000-0000-00000000000d',
   '9d200000-0000-0000-0000-000000000001', '9d300000-0000-0000-0000-000000000002', '2030-08-01 00:00+00', '2030-08-01 08:00+00', true);

-- Employee 003 has zero shift/attendance/request/exchange history -- ONLY a
-- Mail thread (0090/0091: staff_messages joined this guard's history check).
insert into workforce.staff_messages (id, tenant_id, location_id, employee_id, sender_role, sender_user_id, body) values
  ('9d600000-0000-0000-0000-000000000001', '9d000000-0000-0000-0000-00000000000d',
   '9d200000-0000-0000-0000-000000000001', '9d300000-0000-0000-0000-000000000003',
   'staff', '9d900000-0000-0000-0000-000000000001', 'pgTAP fixture message');

-- Staff (staff.manage absent) cannot permanently delete -- refused (zero rows), employee still exists.
select is(
  (select deleted from pg_temp.as_auth_permadelete('9d900000-0000-0000-0000-000000000001',
    '9d000000-0000-0000-0000-00000000000d', '9d300000-0000-0000-0000-000000000001')),
  false,
  'staff (no workforce.staff.manage) cannot permanently delete an employee'
);
-- `SET LOCAL ROLE` inside pg_temp.as_auth_permadelete persists for the rest of
-- this transaction -- reset back to the superuser role before any plain
-- (non-role-hop) statement, same reasoning as 0023.
reset role;
select ok(
  exists(select 1 from workforce.employees where id = '9d300000-0000-0000-0000-000000000001'),
  'employee still exists after a staff (unauthorized) permanent-delete attempt'
);

-- Manager at Location B cannot delete a Location A employee (location-scoped permission).
select is(
  (select deleted from pg_temp.as_auth_permadelete('9d900000-0000-0000-0000-000000000003',
    '9d000000-0000-0000-0000-00000000000d', '9d300000-0000-0000-0000-000000000001')),
  false,
  'manager at Location B cannot permanently delete a Location A employee'
);
reset role;
select ok(
  exists(select 1 from workforce.employees where id = '9d300000-0000-0000-0000-000000000001'),
  'employee still exists after a cross-location permanent-delete attempt'
);

-- Manager at Location A is refused for the employee WITH shift history.
select results_eq(
  $$ select deleted, blocked_by_history from pg_temp.as_auth_permadelete('9d900000-0000-0000-0000-000000000002',
       '9d000000-0000-0000-0000-00000000000d', '9d300000-0000-0000-0000-000000000002') $$,
  $$ values (false, true) $$,
  'manager is refused permanent delete of an employee with shift history, and told why'
);
reset role;
select ok(
  exists(select 1 from workforce.employees where id = '9d300000-0000-0000-0000-000000000002'),
  'employee with history still exists -- refusal never cascades or removes it'
);
select ok(
  exists(select 1 from workforce.shifts where employee_id = '9d300000-0000-0000-0000-000000000002'),
  'shift history for that employee is untouched'
);

-- Manager at Location A is refused for the employee whose ONLY history is a
-- Mail thread (staff_messages) -- proves 0091's added union arm, not just
-- shifts/attendance/requests/exchanges.
select results_eq(
  $$ select deleted, blocked_by_history from pg_temp.as_auth_permadelete('9d900000-0000-0000-0000-000000000002',
       '9d000000-0000-0000-0000-00000000000d', '9d300000-0000-0000-0000-000000000003') $$,
  $$ values (false, true) $$,
  'manager is refused permanent delete of an employee whose only history is a staff_messages thread'
);
reset role;
select ok(
  exists(select 1 from workforce.employees where id = '9d300000-0000-0000-0000-000000000003'),
  'employee with only message history still exists -- refusal never cascades or removes it'
);
select ok(
  exists(select 1 from workforce.staff_messages where employee_id = '9d300000-0000-0000-0000-000000000003'),
  'message history for that employee is untouched'
);

-- Manager at Location A can permanently delete the employee with zero history.
select results_eq(
  $$ select deleted, blocked_by_history from pg_temp.as_auth_permadelete('9d900000-0000-0000-0000-000000000002',
       '9d000000-0000-0000-0000-00000000000d', '9d300000-0000-0000-0000-000000000001') $$,
  $$ values (true, false) $$,
  'manager (workforce.staff.manage, same location) permanently deletes an employee with no history'
);
reset role;
select ok(
  not exists(select 1 from workforce.employees where id = '9d300000-0000-0000-0000-000000000001'),
  'the employee row is actually gone after a successful permanent delete'
);

-- A second attempt against the now-gone employee is reported as not_found (zero rows), not an error.
select is(
  (select deleted from pg_temp.as_auth_permadelete('9d900000-0000-0000-0000-000000000002',
    '9d000000-0000-0000-0000-00000000000d', '9d300000-0000-0000-0000-000000000001')),
  false,
  're-deleting an already-gone employee is reported as not-found, not an error'
);

reset role;
select * from finish();
rollback;
