-- ============================================================================
-- DB test: Workforce Cafe v0.1 Slice 1A -- shift_requests self-scope,
--          attendance self-scope regression, employee_line_links manager-only
--          (migrations 0027_workforce_cafe_attendance_extension.sql,
--          0028_workforce_cafe_shift_requests_extension.sql,
--          0029_workforce_cafe_employee_line_links.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * workforce.shift_requests: a staff member reads/inserts only their own
--     rows; a staff INSERT with status <> 'pending' or a non-null decided_by
--     is rejected; a manager (workforce.request.manage) still reads/decides
--     every row at their location.
--   * workforce.attendance: the historical tenant-wide employee-role
--     attendance.manage grant is gone (0008_rbac_seed.sql's `employee` role
--     row), and a staff member can SELECT/INSERT/UPDATE only their OWN
--     attendance row -- the core self-scope regression this slice fixes.
--   * workforce.employee_line_links: manager-only (workforce.staff.manage),
--     zero staff self-access, zero anon access.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai;

select no_plan();

-- ============================================================================
-- Section 1: role-hop helpers
-- ============================================================================

create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end;
$$;

create function pg_temp.as_auth_rowcount(p_sub text, p_sql text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  get diagnostics n = row_count;
  reset role;
  return n;
end;
$$;

-- NOTE: `SET LOCAL ROLE` persists for the rest of the enclosing transaction,
-- not just the current statement (verified empirically -- it is NOT
-- automatically undone when a plain, non-exception plpgsql function
-- returns). Every helper above explicitly `reset role`s before returning so
-- later bare superuser statements in this file are not silently executed as
-- `authenticated`.
create function pg_temp.as_auth_throws(p_sub text, p_sql text)
returns boolean
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return false;
exception
  when others then
    reset role;
    return true;
end;
$$;

-- ============================================================================
-- Section 2: fixtures (inserted as superuser; bypasses RLS)
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('cc000000-0000-0000-0000-00000000000a', 'pgtap-cafe1a-tenant-c', 'pgTAP Cafe 1A Tenant C');

insert into core.locations (id, tenant_id, name) values
  ('cc200000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-00000000000a', 'Tenant C Location 1');

insert into core.users (id, display_name) values
  ('cc900000-0000-0000-0000-000000000001', 'Staff 1'),
  ('cc900000-0000-0000-0000-000000000002', 'Staff 2'),
  ('cc900000-0000-0000-0000-000000000003', 'Manager (Location 1)'),
  ('cc900000-0000-0000-0000-000000000004', 'Owner (tenant-wide)');

-- System roles: 003 tenant_owner, 005 manager, 006 employee.
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('cc000000-0000-0000-0000-00000000000a', 'cc900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'cc200000-0000-0000-0000-000000000001'),
  ('cc000000-0000-0000-0000-00000000000a', 'cc900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000006', 'cc200000-0000-0000-0000-000000000001'),
  ('cc000000-0000-0000-0000-00000000000a', 'cc900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000005', 'cc200000-0000-0000-0000-000000000001'),
  ('cc000000-0000-0000-0000-00000000000a', 'cc900000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000003', null);

insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('cc300000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc900000-0000-0000-0000-000000000001', '\x00'),
  ('cc300000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc900000-0000-0000-0000-000000000002', '\x00');

insert into workforce.shift_requests (id, tenant_id, location_id, employee_id, kind, work_date, status) values
  ('cc600000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc300000-0000-0000-0000-000000000001',
   'preference', '2026-08-10', 'pending'),
  ('cc600000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc300000-0000-0000-0000-000000000002',
   'preference', '2026-08-10', 'pending');

insert into workforce.attendance (id, tenant_id, location_id, employee_id, work_date, status) values
  ('cc700000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc300000-0000-0000-0000-000000000001',
   '2026-08-01', 'present'),
  ('cc700000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc300000-0000-0000-0000-000000000002',
   '2026-08-01', 'present');

-- ============================================================================
-- Section 3: workforce.shift_requests -- self-scope + manager visibility
-- ============================================================================

select has_column('workforce', 'shift_requests', 'work_date', 'workforce.shift_requests.work_date exists');
select has_column('workforce', 'shift_requests', 'shift_type_id', 'workforce.shift_requests.shift_type_id exists');
select has_column('workforce', 'shift_requests', 'is_unavailable', 'workforce.shift_requests.is_unavailable exists');
select has_column('workforce', 'shift_requests', 'attendance_id', 'workforce.shift_requests.attendance_id exists');

-- --- legacy shift.read-keyed broad read policy is gone ----------------------
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'shift_requests'
      and policyname = 'wf_shift_requests_read'),
  0,
  'legacy wf_shift_requests_read (broad shift.read visibility) policy was dropped'
);

-- --- staff sees only their own request ---------------------------------------
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.shift_requests
          where tenant_id = 'cc000000-0000-0000-0000-00000000000a' $q$),
  1,
  'staff 1 sees exactly their own shift request, not staff 2''s'
);
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.shift_requests
          where id = 'cc600000-0000-0000-0000-000000000002' $q$), -- staff 2's row
  0,
  'staff 1 cannot see staff 2''s shift request'
);

-- --- manager (request.manage) sees both -------------------------------------
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000003',
    $q$ select count(*)::int from workforce.shift_requests
          where tenant_id = 'cc000000-0000-0000-0000-00000000000a' $q$),
  2,
  'manager (request.manage) sees both staff members'' shift requests'
);

-- --- staff can insert their own pending request -------------------------------
select ok(
  not pg_temp.as_auth_throws('cc900000-0000-0000-0000-000000000001',
    $q$ insert into workforce.shift_requests
          (tenant_id, location_id, employee_id, kind, work_date, status)
        values
          ('cc000000-0000-0000-0000-00000000000a', 'cc200000-0000-0000-0000-000000000001',
           'cc300000-0000-0000-0000-000000000001', 'preference', '2026-08-11', 'pending') $q$),
  'staff 1 CAN insert their own pending shift request'
);

-- --- staff cannot insert on behalf of another employee -----------------------
select ok(
  pg_temp.as_auth_throws('cc900000-0000-0000-0000-000000000001',
    $q$ insert into workforce.shift_requests
          (tenant_id, location_id, employee_id, kind, work_date, status)
        values
          ('cc000000-0000-0000-0000-00000000000a', 'cc200000-0000-0000-0000-000000000001',
           'cc300000-0000-0000-0000-000000000002', 'preference', '2026-08-12', 'pending') $q$),
  'staff 1 cannot insert a shift request for staff 2'
);

-- --- staff INSERT must be status = 'pending' with decided_by null ------------
select ok(
  pg_temp.as_auth_throws('cc900000-0000-0000-0000-000000000001',
    $q$ insert into workforce.shift_requests
          (tenant_id, location_id, employee_id, kind, work_date, status)
        values
          ('cc000000-0000-0000-0000-00000000000a', 'cc200000-0000-0000-0000-000000000001',
           'cc300000-0000-0000-0000-000000000001', 'preference', '2026-08-13', 'approved') $q$),
  'staff 1 cannot insert a shift request with status <> pending'
);
select ok(
  pg_temp.as_auth_throws('cc900000-0000-0000-0000-000000000001',
    $q$ insert into workforce.shift_requests
          (tenant_id, location_id, employee_id, kind, work_date, status, decided_by)
        values
          ('cc000000-0000-0000-0000-00000000000a', 'cc200000-0000-0000-0000-000000000001',
           'cc300000-0000-0000-0000-000000000001', 'preference', '2026-08-14', 'pending',
           'cc900000-0000-0000-0000-000000000003') $q$),
  'staff 1 cannot insert a shift request with a non-null decided_by'
);

-- --- partial unique index: one preference per employee/day -------------------
select ok(
  pg_temp.as_auth_throws('cc900000-0000-0000-0000-000000000001',
    $q$ insert into workforce.shift_requests
          (tenant_id, location_id, employee_id, kind, work_date, status)
        values
          ('cc000000-0000-0000-0000-00000000000a', 'cc200000-0000-0000-0000-000000000001',
           'cc300000-0000-0000-0000-000000000001', 'preference', '2026-08-10', 'pending') $q$),
  'a second ''preference'' request for the same employee/work_date is rejected (partial unique index)'
);

-- ============================================================================
-- Section 4: workforce.attendance -- self-scope regression
-- ============================================================================

select has_column('workforce', 'attendance', 'transportation_cost', 'workforce.attendance.transportation_cost exists');
select has_column('workforce', 'attendance', 'daily_message', 'workforce.attendance.daily_message exists');

-- --- the unsafe tenant-wide employee-role grant is gone -----------------------
select is(
  (select count(*)::int from core.role_permissions
    where role_id = '00000000-0000-0000-0000-000000000006' -- system `employee` role
      and permission_key = 'workforce.attendance.manage'),
  0,
  'system employee role no longer holds workforce.attendance.manage'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'attendance'
      and policyname = 'wf_attendance_rw'),
  0,
  'legacy wf_attendance_rw (tenant-wide attendance.manage for all) policy was dropped'
);

-- --- staff can read/write only their OWN attendance row -----------------------
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.attendance
          where id = 'cc700000-0000-0000-0000-000000000001' $q$), -- own row
  1,
  'staff 1 can SELECT their own attendance row'
);
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.attendance
          where id = 'cc700000-0000-0000-0000-000000000002' $q$), -- staff 2's row
  0,
  'staff 1 CANNOT read staff 2''s attendance row (self-scope regression fixed)'
);
select is(
  pg_temp.as_auth_rowcount('cc900000-0000-0000-0000-000000000001',
    $q$ update workforce.attendance set daily_message = 'hacked'
          where id = 'cc700000-0000-0000-0000-000000000002' $q$), -- staff 2's row
  0,
  'staff 1 CANNOT update staff 2''s attendance row (0 rows affected)'
);
select is(
  pg_temp.as_auth_rowcount('cc900000-0000-0000-0000-000000000001',
    $q$ update workforce.attendance set daily_message = 'my own note'
          where id = 'cc700000-0000-0000-0000-000000000001' $q$), -- own row
  1,
  'staff 1 CAN update their own attendance row'
);
select ok(
  not pg_temp.as_auth_throws('cc900000-0000-0000-0000-000000000001',
    $q$ insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, status)
          values ('cc000000-0000-0000-0000-00000000000a', 'cc200000-0000-0000-0000-000000000001',
                  'cc300000-0000-0000-0000-000000000001', '2026-08-02', 'present') $q$),
  'staff 1 CAN insert their own attendance row'
);
select ok(
  pg_temp.as_auth_throws('cc900000-0000-0000-0000-000000000001',
    $q$ insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, status)
          values ('cc000000-0000-0000-0000-00000000000a', 'cc200000-0000-0000-0000-000000000001',
                  'cc300000-0000-0000-0000-000000000002', '2026-08-02', 'present') $q$),
  'staff 1 CANNOT insert an attendance row for staff 2'
);

-- --- manager (attendance.manage) still has full access -----------------------
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000003',
    $q$ select count(*)::int from workforce.attendance
          where tenant_id = 'cc000000-0000-0000-0000-00000000000a' $q$),
  3, -- 2 fixtures + staff 1's own insert above
  'manager (attendance.manage) sees every attendance row at their location'
);
select is(
  pg_temp.as_auth_rowcount('cc900000-0000-0000-0000-000000000003',
    $q$ update workforce.attendance set transportation_cost = 500
          where id = 'cc700000-0000-0000-0000-000000000002' $q$),
  1,
  'manager CAN update staff 2''s attendance row'
);

-- ============================================================================
-- Section 5: workforce.employee_line_links -- manager-only
-- ============================================================================

select has_table('workforce', 'employee_line_links', 'workforce.employee_line_links exists');
select is(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'workforce' and c.relname = 'employee_line_links'),
  true, 'RLS is enabled on workforce.employee_line_links'
);

-- --- manager (staff.manage) can insert + read a binding -----------------------
select ok(
  not pg_temp.as_auth_throws('cc900000-0000-0000-0000-000000000004', -- owner (tenant-wide staff.manage)
    $q$ insert into workforce.employee_line_links
          (id, tenant_id, employee_id, line_user_id_encrypted, line_user_id_hash)
        values
          ('cc800000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-00000000000a',
           'cc300000-0000-0000-0000-000000000001', '\x00', 'hash-1') $q$),
  'owner (staff.manage) CAN insert an employee_line_links row'
);
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000004',
    $q$ select count(*)::int from workforce.employee_line_links
          where id = 'cc800000-0000-0000-0000-000000000001' $q$),
  1,
  'owner (staff.manage) can SELECT the binding'
);

-- --- staff has zero access, including to their own binding --------------------
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000001', -- staff 1, the bound employee
    $q$ select count(*)::int from workforce.employee_line_links
          where id = 'cc800000-0000-0000-0000-000000000001' $q$),
  0,
  'staff 1 (the bound employee) has NO self-access to their own binding row'
);
select ok(
  pg_temp.as_auth_throws('cc900000-0000-0000-0000-000000000001',
    $q$ insert into workforce.employee_line_links
          (tenant_id, employee_id, line_user_id_encrypted, line_user_id_hash)
        values
          ('cc000000-0000-0000-0000-00000000000a', 'cc300000-0000-0000-0000-000000000001',
           '\x00', 'hash-2') $q$),
  'staff cannot insert their own employee_line_links row'
);

-- --- anon denial ---------------------------------------------------------------
select is(
  pg_temp.as_auth_count('',
    $q$ select count(*)::int from workforce.employee_line_links $q$),
  0,
  'authenticated with no JWT sub sees no employee_line_links rows'
);
select ok(
  not has_table_privilege('anon', 'workforce.employee_line_links', 'SELECT'),
  'anon cannot SELECT workforce.employee_line_links (no grant)'
);

-- --- one active binding per employee -------------------------------------------
select ok(
  pg_temp.as_auth_throws('cc900000-0000-0000-0000-000000000004',
    $q$ insert into workforce.employee_line_links
          (tenant_id, employee_id, line_user_id_encrypted, line_user_id_hash)
        values
          ('cc000000-0000-0000-0000-00000000000a', 'cc300000-0000-0000-0000-000000000001',
           '\x00', 'hash-3') $q$),
  'a second ACTIVE binding for the same employee is rejected (partial unique index)'
);

select * from finish();
rollback;
