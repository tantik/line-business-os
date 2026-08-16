-- ============================================================================
-- DB test: Workforce Cafe v0.1 Slice 1A -- shift_types + tightened shifts RLS
--          (migrations 0025_workforce_cafe_shift_types.sql,
--          0026_workforce_cafe_shifts_extension.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * workforce.shift_types: manager (shift.write) full read/write, staff
--     (shift.read) read-only, cross-location write denial within a tenant,
--     cross-tenant denial, anon/no-JWT denial.
--   * workforce.shifts: staff (shift.read only) sees published = true rows
--     only; manager (shift.write) sees draft + published; cross-tenant/anon
--     denial; the new shift_type_id/break_minutes columns and the composite
--     tenant-safe FK from shifts.shift_type_id to shift_types.
--
-- 0025/0026 already grant SELECT/INSERT/UPDATE on both tables to
-- `authenticated` persistently, so (unlike 0008/0009's historical
-- zero-grants-until-facade posture) no test-only grant section is needed
-- here -- fixtures and role-hop assertions can run directly.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai;

select no_plan();

-- ============================================================================
-- Section 1: role-hop helpers (SET LOCAL ROLE reverts when the helper
-- returns -- see supabase/tests/0008_workforce_staff_recipes_rls.sql for the
-- same pattern and rationale).
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
-- `authenticated`. as_auth_throws below additionally resets on its
-- exception path for the same reason, even though PL/pgSQL's implicit
-- exception-block subtransaction would otherwise undo the SET LOCAL anyway.
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
  ('ca000000-0000-0000-0000-00000000000a', 'pgtap-cafe1a-tenant-a', 'pgTAP Cafe 1A Tenant A'),
  ('ca000000-0000-0000-0000-00000000000b', 'pgtap-cafe1a-tenant-b', 'pgTAP Cafe 1A Tenant B');

insert into core.locations (id, tenant_id, name) values
  ('ca200000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a', 'Tenant A Location 1'),
  ('ca200000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-00000000000a', 'Tenant A Location 2'),
  ('cb200000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000b', 'Tenant B Location 1');

insert into core.users (id, display_name) values
  ('ca900000-0000-0000-0000-000000000001', 'Staff (Location 1, shift.read only)'),
  ('ca900000-0000-0000-0000-000000000002', 'Manager (Location 1 only)'),
  ('ca900000-0000-0000-0000-000000000003', 'Owner (tenant-wide)'),
  ('cb900000-0000-0000-0000-000000000001', 'Tenant B owner (tenant-wide)');

-- System roles: 003 tenant_owner, 005 manager, 006 employee.
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('ca000000-0000-0000-0000-00000000000a', 'ca900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'ca200000-0000-0000-0000-000000000001'),
  ('ca000000-0000-0000-0000-00000000000a', 'ca900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', 'ca200000-0000-0000-0000-000000000001'),
  ('ca000000-0000-0000-0000-00000000000a', 'ca900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000003', null),
  ('ca000000-0000-0000-0000-00000000000b', 'cb900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003', null);

insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('ca300000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a',
   'ca200000-0000-0000-0000-000000000001', 'ca900000-0000-0000-0000-000000000001', '\x00');

insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, break_minutes) values
  ('ca400000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a',
   'ca200000-0000-0000-0000-000000000001', '1', '早番', '09:00', '13:00', 0),
  ('ca400000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-00000000000a',
   'ca200000-0000-0000-0000-000000000001', '2', '遅番', '13:00', '18:00', 30);

insert into workforce.shifts (id, tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, published) values
  ('ca500000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a',
   'ca200000-0000-0000-0000-000000000001', 'ca300000-0000-0000-0000-000000000001',
   'ca400000-0000-0000-0000-000000000001', '2026-08-03 09:00+09', '2026-08-03 13:00+09', 0, true),
  ('ca500000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-00000000000a',
   'ca200000-0000-0000-0000-000000000001', 'ca300000-0000-0000-0000-000000000001',
   'ca400000-0000-0000-0000-000000000002', '2026-08-04 13:00+09', '2026-08-04 18:00+09', 30, false);

-- ============================================================================
-- Section 3: workforce.shift_types structural + RLS
-- ============================================================================

select has_table('workforce', 'shift_types', 'workforce.shift_types exists');
select is(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'workforce' and c.relname = 'shift_types'),
  true, 'RLS is enabled on workforce.shift_types'
);
select has_column('workforce', 'shift_types', 'break_minutes', 'workforce.shift_types.break_minutes exists');
select has_column('workforce', 'shift_types', 'is_custom', 'workforce.shift_types.is_custom exists');

-- --- staff (shift.read only) can read, cannot write --------------------------
select is(
  pg_temp.as_auth_count('ca900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.shift_types
          where tenant_id = 'ca000000-0000-0000-0000-00000000000a' $q$),
  2,
  'staff (shift.read) sees both tenant shift types'
);
select ok(
  pg_temp.as_auth_throws('ca900000-0000-0000-0000-000000000001',
    $q$ insert into workforce.shift_types (tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local)
          values ('ca000000-0000-0000-0000-00000000000a', 'ca200000-0000-0000-0000-000000000001',
                  '3', 'Should fail', '18:00', '21:00') $q$),
  'staff (shift.read only) cannot insert a shift_type'
);

-- --- manager (shift.write @ Location 1) can read + write at Location 1 -----
select is(
  pg_temp.as_auth_count('ca900000-0000-0000-0000-000000000002',
    $q$ select count(*)::int from workforce.shift_types
          where tenant_id = 'ca000000-0000-0000-0000-00000000000a' $q$),
  2,
  'Location-1 manager sees both tenant shift types'
);
select ok(
  not pg_temp.as_auth_throws('ca900000-0000-0000-0000-000000000002',
    $q$ insert into workforce.shift_types (tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local)
          values ('ca000000-0000-0000-0000-00000000000a', 'ca200000-0000-0000-0000-000000000001',
                  '3', '通し', '09:00', '18:00') $q$),
  'Location-1 manager CAN insert a shift_type at Location 1'
);
select is(
  pg_temp.as_auth_rowcount('ca900000-0000-0000-0000-000000000002',
    $q$ update workforce.shift_types set label_en = 'Full day'
          where id = 'ca400000-0000-0000-0000-000000000001' $q$),
  1,
  'Location-1 manager CAN update a Location-1 shift_type'
);

-- --- cross-location write denial within the same tenant ---------------------
select ok(
  pg_temp.as_auth_throws('ca900000-0000-0000-0000-000000000002',
    $q$ insert into workforce.shift_types (tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local)
          values ('ca000000-0000-0000-0000-00000000000a', 'ca200000-0000-0000-0000-000000000002',
                  '1', 'Should fail (wrong location)', '09:00', '13:00') $q$),
  'Location-1 manager cannot insert a shift_type at Location 2'
);

-- --- cross-tenant denial -----------------------------------------------------
select is(
  pg_temp.as_auth_count('cb900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.shift_types
          where tenant_id = 'ca000000-0000-0000-0000-00000000000a' $q$),
  0,
  'Tenant B owner cannot see Tenant A shift types'
);

-- --- anon / no-JWT denial ----------------------------------------------------
select is(
  pg_temp.as_auth_count('',
    $q$ select count(*)::int from workforce.shift_types $q$),
  0,
  'authenticated with no JWT sub sees no shift_types rows'
);
select ok(
  not has_table_privilege('anon', 'workforce.shift_types', 'SELECT'),
  'anon cannot SELECT workforce.shift_types (no grant)'
);

-- ============================================================================
-- Section 4: workforce.shifts -- tightened RLS (published vs draft)
-- ============================================================================

select has_column('workforce', 'shifts', 'shift_type_id', 'workforce.shifts.shift_type_id exists');
select has_column('workforce', 'shifts', 'break_minutes', 'workforce.shifts.break_minutes exists');

-- --- staff (shift.read only) sees published = true only ---------------------
select is(
  pg_temp.as_auth_count('ca900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.shifts
          where id = 'ca500000-0000-0000-0000-000000000001' $q$), -- published
  1,
  'staff sees the published shift'
);
select is(
  pg_temp.as_auth_count('ca900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.shifts
          where id = 'ca500000-0000-0000-0000-000000000002' $q$), -- draft
  0,
  'staff does NOT see the draft shift'
);

-- --- manager (shift.write) sees draft + published ----------------------------
select is(
  pg_temp.as_auth_count('ca900000-0000-0000-0000-000000000002',
    $q$ select count(*)::int from workforce.shifts
          where id in (
            'ca500000-0000-0000-0000-000000000001',
            'ca500000-0000-0000-0000-000000000002'
          ) $q$),
  2,
  'manager sees both the published and the draft shift'
);

-- --- staff cannot write shifts at all -----------------------------------------
select is(
  pg_temp.as_auth_rowcount('ca900000-0000-0000-0000-000000000001',
    $q$ update workforce.shifts set notes = 'should not change'
          where id = 'ca500000-0000-0000-0000-000000000001' $q$),
  0,
  'staff cannot update a shift (0 rows affected)'
);

-- --- manager can write shifts --------------------------------------------------
select is(
  pg_temp.as_auth_rowcount('ca900000-0000-0000-0000-000000000002',
    $q$ update workforce.shifts set published = true
          where id = 'ca500000-0000-0000-0000-000000000002' $q$),
  1,
  'manager CAN publish the draft shift'
);
select is(
  pg_temp.as_auth_count('ca900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.shifts
          where id = 'ca500000-0000-0000-0000-000000000002' $q$),
  1,
  'staff now sees the shift after the manager published it'
);

-- --- cross-tenant / anon denial -----------------------------------------------
select is(
  pg_temp.as_auth_count('cb900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.shifts
          where tenant_id = 'ca000000-0000-0000-0000-00000000000a' $q$),
  0,
  'Tenant B owner cannot see Tenant A shifts'
);
select is(
  pg_temp.as_auth_count('',
    $q$ select count(*)::int from workforce.shifts $q$),
  0,
  'authenticated with no JWT sub sees no shifts rows'
);
select ok(
  not has_table_privilege('anon', 'workforce.shifts', 'SELECT'),
  'anon cannot SELECT workforce.shifts (no grant)'
);

-- --- composite tenant-safe FK on shift_type_id --------------------------------
-- A shift_type from Tenant B can never be linked from a Tenant A shift, even
-- when the caller (manager, shift.write) can otherwise write the row.
insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local)
  values ('cb400000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000b',
          'cb200000-0000-0000-0000-000000000001', '1', 'Tenant B type', '09:00', '13:00');

select ok(
  pg_temp.as_auth_throws('ca900000-0000-0000-0000-000000000002',
    $q$ insert into workforce.shifts (tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at)
          values ('ca000000-0000-0000-0000-00000000000a', 'ca200000-0000-0000-0000-000000000001',
                  'ca300000-0000-0000-0000-000000000001', 'cb400000-0000-0000-0000-000000000001',
                  '2026-08-05 09:00+09', '2026-08-05 13:00+09') $q$),
  'a shift cannot link a shift_type belonging to a different tenant (composite FK)'
);

select * from finish();
rollback;
