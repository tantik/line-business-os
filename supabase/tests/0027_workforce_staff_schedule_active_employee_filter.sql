-- ============================================================================
-- DB test: STALE-STAFF-ROSTER-LEAK fix
--          (migration 0059_workforce_staff_schedule_active_employee_filter.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the invariants required by the roster fix, all read through
-- api.workforce_shift_assignments (the view Staff and Manager both actually
-- query -- apps/web/src/lib/workforce/shift-assignments.ts):
--   1. An active coworker's published shift is visible to another Staff member.
--   2. A deactivated coworker's published/historical shift is EXCLUDED from
--      another Staff member's view.
--   3. The signed-in Staff member's own shift is always visible, even if that
--      employee is themself deactivated.
--   4. Manager (shift.write) behavior is unchanged: sees every assignment
--      (draft + published) regardless of employee active status.
--   5. Cross-tenant denial is preserved.
--   6. Location-scoped manager cannot see another location's assignments
--      (location isolation preserved).
--   7. Staff still cannot read any PII off workforce.employees for a coworker
--      (unchanged pre-existing RLS -- this migration adds no employees-table
--      grant and no PII exposure).
--   8. The deactivated employee's historical shift row is never deleted --
--      only Staff's *read* of it changes.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai;

select no_plan();

-- ============================================================================
-- Section 1: role-hop helpers (same pattern as 0010_workforce_cafe_shift_
-- types_shifts_rls.sql -- SET LOCAL ROLE reverts before the helper returns).
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
  ('cc000000-0000-0000-0000-00000000000a', 'pgtap-roster-tenant-a', 'pgTAP Roster Tenant A'),
  ('cc000000-0000-0000-0000-00000000000b', 'pgtap-roster-tenant-b', 'pgTAP Roster Tenant B');

insert into core.locations (id, tenant_id, name) values
  ('cc200000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-00000000000a', 'Tenant A Location 1'),
  ('cc200000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-00000000000a', 'Tenant A Location 2'),
  ('cd200000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-00000000000b', 'Tenant B Location 1');

insert into core.users (id, display_name) values
  ('cc900000-0000-0000-0000-000000000001', 'Staff A (active)'),
  ('cc900000-0000-0000-0000-000000000002', 'Staff B (active coworker)'),
  ('cc900000-0000-0000-0000-000000000003', 'Staff C (deactivated)'),
  ('cc900000-0000-0000-0000-000000000004', 'Manager (Location 1)'),
  ('cc900000-0000-0000-0000-000000000005', 'Manager (Location 2)'),
  ('cd900000-0000-0000-0000-000000000001', 'Tenant B owner');

-- System roles: 003 tenant_owner, 005 manager, 006 employee.
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('cc000000-0000-0000-0000-00000000000a', 'cc900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'cc200000-0000-0000-0000-000000000001'),
  ('cc000000-0000-0000-0000-00000000000a', 'cc900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000006', 'cc200000-0000-0000-0000-000000000001'),
  ('cc000000-0000-0000-0000-00000000000a', 'cc900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000006', 'cc200000-0000-0000-0000-000000000001'),
  ('cc000000-0000-0000-0000-00000000000a', 'cc900000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000005', 'cc200000-0000-0000-0000-000000000001'),
  ('cc000000-0000-0000-0000-00000000000a', 'cc900000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000005', 'cc200000-0000-0000-0000-000000000002'),
  ('cc000000-0000-0000-0000-00000000000b', 'cd900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003', null);

insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted, is_active) values
  ('cc300000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc900000-0000-0000-0000-000000000001', '\x00', true),
  ('cc300000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc900000-0000-0000-0000-000000000002', '\x00', true),
  ('cc300000-0000-0000-0000-000000000003', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc900000-0000-0000-0000-000000000003', '\x00', false);

-- s1: Staff B (active coworker), published -- visible to Staff A.
-- s2: Staff C (deactivated), published/historical -- must be hidden from Staff A, visible to manager and to Staff C themself.
-- s3: Staff C (deactivated), draft -- already hidden from staff by the pre-existing published-only RLS; manager still sees it.
-- s4: Staff A's own shift, published.
insert into workforce.shifts (id, tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('cc500000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc300000-0000-0000-0000-000000000002',
   '2026-08-10 09:00+09', '2026-08-10 13:00+09', true),
  ('cc500000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc300000-0000-0000-0000-000000000003',
   '2026-08-03 09:00+09', '2026-08-03 13:00+09', true),
  ('cc500000-0000-0000-0000-000000000003', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc300000-0000-0000-0000-000000000003',
   '2026-08-11 09:00+09', '2026-08-11 13:00+09', false),
  ('cc500000-0000-0000-0000-000000000004', 'cc000000-0000-0000-0000-00000000000a',
   'cc200000-0000-0000-0000-000000000001', 'cc300000-0000-0000-0000-000000000001',
   '2026-08-10 13:00+09', '2026-08-10 17:00+09', true);

-- ============================================================================
-- Section 3: invariants
-- ============================================================================

-- --- 1. active coworker's published shift visible to another Staff member ---
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_shift_assignments
          where assignment_id = 'cc500000-0000-0000-0000-000000000001' $q$),
  1,
  'Staff A sees active coworker Staff B''s published shift'
);

-- --- 2. deactivated coworker's published/historical shift excluded ----------
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_shift_assignments
          where assignment_id = 'cc500000-0000-0000-0000-000000000002' $q$),
  0,
  'Staff A does NOT see deactivated Staff C''s published/historical shift'
);

-- --- 3. signed-in Staff always sees their own legitimate shift, even the ---
--        deactivated employee viewing their own historical shift ------------
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_shift_assignments
          where assignment_id = 'cc500000-0000-0000-0000-000000000004' $q$),
  1,
  'Staff A sees their own published shift'
);
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000003',
    $q$ select count(*)::int from api.workforce_shift_assignments
          where assignment_id = 'cc500000-0000-0000-0000-000000000002' $q$),
  1,
  'deactivated Staff C still sees their OWN historical shift when signed in'
);

-- --- 4. Manager behavior unchanged: sees everything regardless of status ---
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000004',
    $q$ select count(*)::int from api.workforce_shift_assignments
          where assignment_id in (
            'cc500000-0000-0000-0000-000000000001',
            'cc500000-0000-0000-0000-000000000002',
            'cc500000-0000-0000-0000-000000000003',
            'cc500000-0000-0000-0000-000000000004'
          ) $q$),
  4,
  'Location-1 manager sees all 4 assignments (draft + published, active + deactivated employees)'
);

-- --- 5. cross-tenant denial preserved ----------------------------------------
select is(
  pg_temp.as_auth_count('cd900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_shift_assignments
          where tenant_id = 'cc000000-0000-0000-0000-00000000000a' $q$),
  0,
  'Tenant B owner cannot see any Tenant A assignments'
);

-- --- 6. location isolation preserved -----------------------------------------
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000005',
    $q$ select count(*)::int from api.workforce_shift_assignments
          where location_id = 'cc200000-0000-0000-0000-000000000001' $q$),
  0,
  'Location-2 manager cannot see Location-1 assignments'
);

-- --- 7. Staff still cannot read PII off workforce.employees for a coworker --
select is(
  pg_temp.as_auth_count('cc900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.employees
          where id = 'cc300000-0000-0000-0000-000000000003' $q$),
  0,
  'Staff A still cannot read deactivated Staff C''s employees row at all (unchanged RLS, no PII exposure)'
);

-- --- 8. historical shift row is never deleted --------------------------------
select is(
  (select count(*)::int from workforce.shifts where id = 'cc500000-0000-0000-0000-000000000002'),
  1,
  'the deactivated employee''s historical shift row still exists (superuser read, RLS bypassed) -- only Staff''s read of it changed, nothing was deleted'
);

select * from finish();
rollback;
