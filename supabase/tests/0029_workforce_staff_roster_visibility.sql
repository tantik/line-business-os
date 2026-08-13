-- ============================================================================
-- DB test: Staff-safe coworker roster
--          (migration 0061_workforce_staff_roster_visibility.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the invariants required by the real-name roster fix, read through
-- api.workforce_staff_roster (the new Staff-safe view --
-- apps/web/src/lib/workforce/employees.ts's listWorkforceStaffRoster):
--   1. Staff sees their own roster row.
--   2. Staff sees an ACTIVE same-location coworker.
--   3. Staff does NOT see a DEACTIVATED same-location coworker.
--   4. Staff does NOT see a coworker at a DIFFERENT location.
--   5. Staff DOES see an ACTIVE tenant-wide (location_id IS NULL) coworker,
--      from either location (location_id IS NULL = tenant-wide convention).
--   6. Staff does NOT see any employee of a different TENANT.
--   7. Manager (staff.read/.manage) behavior is unchanged through this same
--      view: sees every row in their tenant/location scope regardless of
--      active status (pre-existing wf_employees_staff_read policy).
--   8. The view exposes ONLY employee_id/tenant_id/location_id/
--      name_encrypted/is_active -- selecting any other workforce.employees
--      PII column (name_hash, email_encrypted, user_id, hourly_wage_yen)
--      through this view fails, because the column does not exist on it.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai;

select no_plan();

-- ============================================================================
-- Section 1: role-hop helper (same pattern as 0027/0028)
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
-- Section 2: fixtures (inserted as superuser; bypasses RLS)
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('ce000000-0000-0000-0000-00000000000a', 'pgtap-roster-vis-tenant-a', 'pgTAP Roster Visibility Tenant A'),
  ('ce000000-0000-0000-0000-00000000000b', 'pgtap-roster-vis-tenant-b', 'pgTAP Roster Visibility Tenant B');

insert into core.locations (id, tenant_id, name) values
  ('ce200000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-00000000000a', 'Tenant A Location 1'),
  ('ce200000-0000-0000-0000-000000000002', 'ce000000-0000-0000-0000-00000000000a', 'Tenant A Location 2'),
  ('cf200000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-00000000000b', 'Tenant B Location 1');

insert into core.users (id, display_name) values
  ('ce900000-0000-0000-0000-000000000001', 'Staff A (Location 1, active)'),
  ('ce900000-0000-0000-0000-000000000002', 'Staff B (Location 1, active coworker)'),
  ('ce900000-0000-0000-0000-000000000003', 'Staff C (Location 1, deactivated)'),
  ('ce900000-0000-0000-0000-000000000004', 'Staff D (Location 2, active)'),
  ('ce900000-0000-0000-0000-000000000005', 'Staff E (tenant-wide, active)'),
  ('ce900000-0000-0000-0000-000000000006', 'Manager (Location 1)'),
  ('cf900000-0000-0000-0000-000000000001', 'Staff F (Tenant B, active)');

-- System roles: 005 manager, 006 employee.
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('ce000000-0000-0000-0000-00000000000a', 'ce900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'ce200000-0000-0000-0000-000000000001'),
  ('ce000000-0000-0000-0000-00000000000a', 'ce900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000006', 'ce200000-0000-0000-0000-000000000001'),
  ('ce000000-0000-0000-0000-00000000000a', 'ce900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000006', 'ce200000-0000-0000-0000-000000000001'),
  ('ce000000-0000-0000-0000-00000000000a', 'ce900000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000006', 'ce200000-0000-0000-0000-000000000002'),
  ('ce000000-0000-0000-0000-00000000000a', 'ce900000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000006', 'ce200000-0000-0000-0000-000000000001'),
  ('ce000000-0000-0000-0000-00000000000a', 'ce900000-0000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000005', 'ce200000-0000-0000-0000-000000000001'),
  ('ce000000-0000-0000-0000-00000000000b', 'cf900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'cf200000-0000-0000-0000-000000000001');

-- Staff A/B/C: Tenant A, Location 1 (A, B active; C deactivated).
-- Staff D: Tenant A, Location 2, active.
-- Staff E: Tenant A, location_id IS NULL (tenant-wide), active.
-- Staff F: Tenant B, active (cross-tenant control).
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted, is_active) values
  ('ce300000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-00000000000a',
   'ce200000-0000-0000-0000-000000000001', 'ce900000-0000-0000-0000-000000000001', '\x00', true),
  ('ce300000-0000-0000-0000-000000000002', 'ce000000-0000-0000-0000-00000000000a',
   'ce200000-0000-0000-0000-000000000001', 'ce900000-0000-0000-0000-000000000002', '\x00', true),
  ('ce300000-0000-0000-0000-000000000003', 'ce000000-0000-0000-0000-00000000000a',
   'ce200000-0000-0000-0000-000000000001', 'ce900000-0000-0000-0000-000000000003', '\x00', false),
  ('ce300000-0000-0000-0000-000000000004', 'ce000000-0000-0000-0000-00000000000a',
   'ce200000-0000-0000-0000-000000000002', 'ce900000-0000-0000-0000-000000000004', '\x00', true),
  ('ce300000-0000-0000-0000-000000000005', 'ce000000-0000-0000-0000-00000000000a',
   null, 'ce900000-0000-0000-0000-000000000005', '\x00', true),
  ('cf300000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-00000000000b',
   'cf200000-0000-0000-0000-000000000001', 'cf900000-0000-0000-0000-000000000001', '\x00', true);

-- ============================================================================
-- Section 3: invariants
-- ============================================================================

-- --- 1. Staff sees their own roster row --------------------------------------
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_staff_roster
          where employee_id = 'ce300000-0000-0000-0000-000000000001' $q$),
  1,
  'Staff A sees their own roster row'
);

-- --- 2. Staff sees an active same-location coworker --------------------------
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_staff_roster
          where employee_id = 'ce300000-0000-0000-0000-000000000002' $q$),
  1,
  'Staff A sees active Location-1 coworker Staff B'
);

-- --- 3. Staff does NOT see a deactivated same-location coworker --------------
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_staff_roster
          where employee_id = 'ce300000-0000-0000-0000-000000000003' $q$),
  0,
  'Staff A does NOT see deactivated Location-1 coworker Staff C'
);

-- --- 4. Staff does NOT see a coworker at a different location ----------------
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_staff_roster
          where employee_id = 'ce300000-0000-0000-0000-000000000004' $q$),
  0,
  'Staff A (Location 1) does NOT see Location-2 employee Staff D'
);
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000004',
    $q$ select count(*)::int from api.workforce_staff_roster
          where employee_id in ('ce300000-0000-0000-0000-000000000001', 'ce300000-0000-0000-0000-000000000002') $q$),
  0,
  'Staff D (Location 2) does NOT see Location-1 employees Staff A/B'
);

-- --- 5. Staff sees an active tenant-wide coworker from either location -------
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_staff_roster
          where employee_id = 'ce300000-0000-0000-0000-000000000005' $q$),
  1,
  'Staff A (Location 1) sees tenant-wide active employee Staff E'
);
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000004',
    $q$ select count(*)::int from api.workforce_staff_roster
          where employee_id = 'ce300000-0000-0000-0000-000000000005' $q$),
  1,
  'Staff D (Location 2) also sees tenant-wide active employee Staff E'
);

-- --- 6. Staff does NOT see any employee of a different tenant ----------------
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_staff_roster
          where employee_id = 'cf300000-0000-0000-0000-000000000001' $q$),
  0,
  'Staff A (Tenant A) does NOT see Tenant B employee Staff F'
);
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_staff_roster
          where tenant_id = 'ce000000-0000-0000-0000-00000000000b' $q$),
  0,
  'Staff A sees zero Tenant B rows through the roster view'
);

-- --- 7. Manager behavior unchanged: sees every row, active or not -----------
select is(
  pg_temp.as_auth_count('ce900000-0000-0000-0000-000000000006',
    $q$ select count(*)::int from api.workforce_staff_roster
          where employee_id in (
            'ce300000-0000-0000-0000-000000000001',
            'ce300000-0000-0000-0000-000000000002',
            'ce300000-0000-0000-0000-000000000003'
          ) $q$),
  3,
  'Location-1 manager sees all 3 Location-1 employees through the roster view, including deactivated Staff C'
);

-- --- 8. column-level minimization: only the 5 documented columns exist ------
select throws_ok(
  $q$ select name_hash from api.workforce_staff_roster limit 1 $q$,
  '42703',
  null,
  'api.workforce_staff_roster does not expose name_hash'
);
select throws_ok(
  $q$ select email_encrypted from api.workforce_staff_roster limit 1 $q$,
  '42703',
  null,
  'api.workforce_staff_roster does not expose email_encrypted'
);
select throws_ok(
  $q$ select user_id from api.workforce_staff_roster limit 1 $q$,
  '42703',
  null,
  'api.workforce_staff_roster does not expose user_id'
);
select throws_ok(
  $q$ select hourly_wage_yen from api.workforce_staff_roster limit 1 $q$,
  '42703',
  null,
  'api.workforce_staff_roster does not expose hourly_wage_yen'
);

select * from finish();
rollback;
