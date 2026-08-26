-- ============================================================================
-- DB test: Workforce Cafe v0.1 Slice 1A -- read API facade (migration
--          0030_workforce_cafe_api_facade.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the 4 new `api` views: existence, security_invoker, exact column
-- allow-lists (no raw `id`, no decided_by), anon fully denied, authenticated
-- SELECT-only, and behavioral visibility mirroring the underlying RLS
-- (published-vs-draft shifts, self-scope shift_requests/attendance).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai, api;

select no_plan();

-- ============================================================================
-- Section 1: role-hop helper
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

-- ============================================================================
-- Section 2: fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('ce000000-0000-0000-0000-00000000000a', 'pgtap-cafe1a-tenant-e', 'pgTAP Cafe 1A Tenant E');

-- Workforce is fail-closed by default since 0097_workforce_module_access_gate.sql;
-- this file's scenarios assume normal, Workforce-ON behavior for the fixture tenant.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('ce000000-0000-0000-0000-00000000000a', 'workforce', true);

insert into core.locations (id, tenant_id, name) values
  ('ce200000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-00000000000a', 'Tenant E Location 1');

insert into core.users (id, display_name) values
  ('ce900000-0000-0000-0000-000000000001', 'Staff 1'),
  ('ce900000-0000-0000-0000-000000000002', 'Manager (Location 1)');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('ce000000-0000-0000-0000-00000000000a', 'ce900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'ce200000-0000-0000-0000-000000000001'),
  ('ce000000-0000-0000-0000-00000000000a', 'ce900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', 'ce200000-0000-0000-0000-000000000001');

insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('ce300000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-00000000000a',
   'ce200000-0000-0000-0000-000000000001', 'ce900000-0000-0000-0000-000000000001', '\x00');

insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local) values
  ('ce400000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-00000000000a',
   'ce200000-0000-0000-0000-000000000001', '1', '早番', '09:00', '13:00');

insert into workforce.shifts (id, tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, published) values
  ('ce500000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-00000000000a',
   'ce200000-0000-0000-0000-000000000001', 'ce300000-0000-0000-0000-000000000001',
   'ce400000-0000-0000-0000-000000000001', '2026-08-03 09:00+09', '2026-08-03 13:00+09', true),
  ('ce500000-0000-0000-0000-000000000002', 'ce000000-0000-0000-0000-00000000000a',
   'ce200000-0000-0000-0000-000000000001', 'ce300000-0000-0000-0000-000000000001',
   'ce400000-0000-0000-0000-000000000001', '2026-08-04 09:00+09', '2026-08-04 13:00+09', false);

insert into workforce.shift_requests (id, tenant_id, location_id, employee_id, kind, work_date, status) values
  ('ce600000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-00000000000a',
   'ce200000-0000-0000-0000-000000000001', 'ce300000-0000-0000-0000-000000000001',
   'preference', '2026-08-10', 'pending');

insert into workforce.attendance (id, tenant_id, location_id, employee_id, work_date, status, transportation_cost, daily_message) values
  ('ce700000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-00000000000a',
   'ce200000-0000-0000-0000-000000000001', 'ce300000-0000-0000-0000-000000000001',
   '2026-08-01', 'present', 300, 'hello');

-- ============================================================================
-- Section 3: structural -- views exist, security_invoker, no SECURITY DEFINER
-- ============================================================================

select has_view('api', 'workforce_shift_types', 'api.workforce_shift_types view exists');
select has_view('api', 'workforce_shift_assignments', 'api.workforce_shift_assignments view exists');
select has_view('api', 'workforce_shift_requests', 'api.workforce_shift_requests view exists');
select has_view('api', 'workforce_attendance', 'api.workforce_attendance view exists');

select ok(
  (select bool_and(
     exists (
       select 1
       from pg_class c2
       join pg_namespace n2 on n2.oid = c2.relnamespace
       cross join lateral unnest(c2.reloptions) o(opt)
       where n2.nspname = 'api' and c2.relname = v.viewname
         and lower(o.opt) = 'security_invoker=true'
     )
   )
   from (values
     ('workforce_shift_types'),
     ('workforce_shift_assignments'),
     ('workforce_shift_requests'),
     ('workforce_attendance')
   ) as v(viewname)),
  'all 4 workforce cafe api views are security_invoker'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.prosecdef),
  0,
  'api schema still contains no SECURITY DEFINER function after 0030'
);

-- ============================================================================
-- Section 4: structural -- exact column allow-lists (no raw id, no decided_by)
-- ============================================================================

select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_shift_types'),
  array[
    'shift_type_id', 'tenant_id', 'location_id', 'code', 'label_ja', 'label_en',
    'starts_at_local', 'ends_at_local', 'break_minutes', 'is_custom', 'sort_order', 'is_active'
  ]::text[],
  'api.workforce_shift_types exposes only approved columns'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_shift_assignments'),
  array[
    'assignment_id', 'tenant_id', 'location_id', 'employee_id', 'shift_type_id',
    'starts_at', 'ends_at', 'break_minutes', 'role', 'notes', 'published',
    'created_at', 'updated_at'
  ]::text[],
  'api.workforce_shift_assignments exposes only approved columns'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_shift_requests'),
  array[
    'request_id', 'tenant_id', 'location_id', 'employee_id', 'shift_id',
    'shift_type_id', 'work_date', 'kind', 'is_unavailable', 'status', 'details',
    'attendance_id', 'created_at', 'updated_at'
  ]::text[],
  'api.workforce_shift_requests exposes only approved columns (no decided_by)'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_attendance'),
  array[
    'attendance_id', 'tenant_id', 'location_id', 'employee_id', 'shift_id',
    'work_date', 'clock_in', 'clock_out', 'status', 'transportation_cost',
    'daily_message', 'created_at', 'updated_at', 'actual_break_minutes'
  ]::text[],
  'api.workforce_attendance exposes only approved columns'
);

select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'api'
      and table_name in (
        'workforce_shift_types', 'workforce_shift_assignments',
        'workforce_shift_requests', 'workforce_attendance'
      )
      and column_name in ('id', 'decided_by', 'created_by', 'updated_by')),
  0,
  'workforce cafe api views expose no raw id or decided_by/author ids'
);

-- ============================================================================
-- Section 5: grants -- anon fully denied, authenticated SELECT-only
-- ============================================================================

select ok(not has_table_privilege('anon', 'api.workforce_shift_types', 'SELECT'), 'anon cannot SELECT api.workforce_shift_types');
select ok(not has_table_privilege('anon', 'api.workforce_shift_assignments', 'SELECT'), 'anon cannot SELECT api.workforce_shift_assignments');
select ok(not has_table_privilege('anon', 'api.workforce_shift_requests', 'SELECT'), 'anon cannot SELECT api.workforce_shift_requests');
select ok(not has_table_privilege('anon', 'api.workforce_attendance', 'SELECT'), 'anon cannot SELECT api.workforce_attendance');

select ok(has_table_privilege('authenticated', 'api.workforce_shift_types', 'SELECT'), 'authenticated can SELECT api.workforce_shift_types');
select ok(has_table_privilege('authenticated', 'api.workforce_shift_assignments', 'SELECT'), 'authenticated can SELECT api.workforce_shift_assignments');
select ok(has_table_privilege('authenticated', 'api.workforce_shift_requests', 'SELECT'), 'authenticated can SELECT api.workforce_shift_requests');
select ok(has_table_privilege('authenticated', 'api.workforce_attendance', 'SELECT'), 'authenticated can SELECT api.workforce_attendance');

-- As of 0031 (Slice 1C), authenticated also holds INSERT/UPDATE on these 4
-- views (the write facade Server Actions use, since PostgREST never exposes
-- `workforce` directly) -- but still never DELETE, and still nothing beyond
-- SELECT/INSERT/UPDATE.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'api'
      and table_name in (
        'workforce_shift_types', 'workforce_shift_assignments',
        'workforce_shift_requests', 'workforce_attendance'
      )
      and privilege_type = 'DELETE'),
  0,
  'authenticated has no DELETE on any of the 4 workforce cafe api views'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'api'
      and table_name in (
        'workforce_shift_types', 'workforce_shift_assignments',
        'workforce_shift_requests', 'workforce_attendance'
      )
      and privilege_type not in ('SELECT', 'INSERT', 'UPDATE')),
  0,
  'authenticated has no grant beyond SELECT/INSERT/UPDATE on any of the 4 workforce cafe api views'
);

-- ============================================================================
-- Section 6: behavioral -- visibility mirrors underlying RLS
-- ============================================================================

-- shift_assignments: staff sees published only; manager sees both.
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_shift_assignments
          where assignment_id = 'ce500000-0000-0000-0000-000000000001' $q$), -- published
  1, 'staff sees the published shift via api.workforce_shift_assignments'
);
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_shift_assignments
          where assignment_id = 'ce500000-0000-0000-0000-000000000002' $q$), -- draft
  0, 'staff does NOT see the draft shift via api.workforce_shift_assignments'
);
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000002',
    $q$ select count(*)::int from api.workforce_shift_assignments
          where tenant_id = 'ce000000-0000-0000-0000-00000000000a' $q$),
  2, 'manager sees both shifts via api.workforce_shift_assignments'
);

-- shift_types: both staff and manager see the tenant's shift types.
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    'select count(*)::int from api.workforce_shift_types'),
  1, 'staff sees the tenant shift type via api.workforce_shift_types'
);

-- shift_requests: staff sees only their own row via the view.
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    'select count(*)::int from api.workforce_shift_requests'),
  1, 'staff sees exactly their own row via api.workforce_shift_requests'
);

-- attendance: staff sees only their own row via the view.
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    'select count(*)::int from api.workforce_attendance'),
  1, 'staff sees exactly their own row via api.workforce_attendance'
);
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select transportation_cost::int from api.workforce_attendance
          where attendance_id = 'ce700000-0000-0000-0000-000000000001' $q$),
  300, 'transportation_cost is exposed correctly via api.workforce_attendance'
);
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select actual_break_minutes::int from api.workforce_attendance
          where attendance_id = 'ce700000-0000-0000-0000-000000000001' $q$),
  0, 'actual_break_minutes is exposed with a safe zero default'
);

-- --- anon / no-JWT denial on all 4 views --------------------------------------
select is(pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_shift_types'), 0,
  'authenticated with no JWT sub sees zero rows via workforce_shift_types');
select is(pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_shift_assignments'), 0,
  'authenticated with no JWT sub sees zero rows via workforce_shift_assignments');
select is(pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_shift_requests'), 0,
  'authenticated with no JWT sub sees zero rows via workforce_shift_requests');
select is(pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_attendance'), 0,
  'authenticated with no JWT sub sees zero rows via workforce_attendance');

select * from finish();
rollback;
