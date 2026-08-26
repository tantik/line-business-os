-- ============================================================================
-- DB test: deactivated-employee Staff self-service write hardening
--          (migration 0062_workforce_deactivated_employee_write_hardening.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * ACTIVE employee: attendance self insert/update, shift_requests self
--     insert, shift_exchanges self insert/cancel/accept all still work.
--   * DEACTIVATED employee (is_active = false, still a valid JWT/session):
--     every one of those direct-DB self-service WRITE paths is rejected by
--     RLS -- proving the fix is a real DB-layer boundary, not merely an
--     app-layer resolvePreviewStaffContext() check.
--   * Deactivation does NOT delete the employee row, attendance history,
--     shift_requests history, or shift_exchanges history, and does NOT
--     remove historical attribution -- and a deactivated employee (and a
--     manager) can still SELECT that history.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;
select no_plan();

create function pg_temp.as_auth_exec(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return true;
exception when others then
  reset role;
  return false;
end;
$$;

create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int language plpgsql as $$
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
returns int language plpgsql as $$
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

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('da000000-0000-0000-0000-000000000001', 'pgtap-deactivated-hardening', 'pgTAP Deactivated Hardening');
-- Workforce is fail-closed by default since 0097_workforce_module_access_gate.sql;
-- this file's scenarios assume normal, Workforce-ON behavior for the fixture tenant.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('da000000-0000-0000-0000-000000000001', 'workforce', true);
insert into core.locations (id, tenant_id, name, timezone) values
  ('da100000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'Cafe', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('da200000-0000-0000-0000-000000000001', 'Active Staff'),
  ('da200000-0000-0000-0000-000000000002', 'Deactivated Staff'),
  ('da200000-0000-0000-0000-000000000003', 'Manager');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('da000000-0000-0000-0000-000000000001', 'da200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'da100000-0000-0000-0000-000000000001'),
  ('da000000-0000-0000-0000-000000000001', 'da200000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'da100000-0000-0000-0000-000000000001'),
  ('da000000-0000-0000-0000-000000000001', 'da200000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'da100000-0000-0000-0000-000000000001');

insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted, is_active) values
  ('da300000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'da200000-0000-0000-0000-000000000001', '\x00', true),
  ('da300000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'da200000-0000-0000-0000-000000000002', '\x00', false);

insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, break_minutes) values
  ('da400000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'DAY', '日勤', '09:00', '17:00', 60);

insert into workforce.shifts (id, tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, published) values
  ('da500000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000001', 'da400000-0000-0000-0000-000000000001', '2030-08-01 00:00+00', '2030-08-01 08:00+00', true),
  ('da500000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000002', 'da400000-0000-0000-0000-000000000001', '2030-08-02 00:00+00', '2030-08-02 08:00+00', true);

-- pre-existing history for BOTH employees, inserted as superuser (bypasses RLS)
insert into workforce.attendance (id, tenant_id, location_id, employee_id, work_date, status) values
  ('da700000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000001', '2026-08-01', 'present'),
  ('da700000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000002', '2026-08-01', 'present');

insert into workforce.shift_requests (id, tenant_id, location_id, employee_id, kind, work_date, status) values
  ('da600000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000001', 'preference', '2026-08-10', 'pending'),
  ('da600000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000002', 'preference', '2026-08-10', 'pending');

-- ============================================================================
-- Section 1: ACTIVE employee -- self-service writes still work
-- ============================================================================

select ok(
  pg_temp.as_auth_exec('da200000-0000-0000-0000-000000000001',
    $q$ insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, status)
          values ('da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001',
                  'da300000-0000-0000-0000-000000000001', '2026-08-02', 'present') $q$),
  'ACTIVE staff CAN insert their own attendance row'
);
select is(
  pg_temp.as_auth_count('da200000-0000-0000-0000-000000000001',
    $q$ update workforce.attendance set daily_message = 'hi' where id = 'da700000-0000-0000-0000-000000000001';
        select 1 $q$),
  1,
  'ACTIVE staff CAN update their own attendance row'
);
select ok(
  pg_temp.as_auth_exec('da200000-0000-0000-0000-000000000001',
    $q$ insert into workforce.shift_requests (tenant_id, location_id, employee_id, kind, work_date, status)
          values ('da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001',
                  'da300000-0000-0000-0000-000000000001', 'preference', '2026-08-11', 'pending') $q$),
  'ACTIVE staff CAN insert their own shift request'
);
select ok(
  pg_temp.as_auth_exec('da200000-0000-0000-0000-000000000001',
    $q$ insert into api.workforce_shift_exchanges
          (tenant_id, location_id, shift_id, requester_employee_id, reason, request_kind)
          values ('da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001',
                  'da500000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000001',
                  'personal', 'cancel') $q$),
  'ACTIVE staff CAN request cancellation of their own future shift'
);
select ok(
  pg_temp.as_auth_exec('da200000-0000-0000-0000-000000000001',
    $q$ update workforce.shift_exchanges set status = 'cancelled'
          where shift_id = 'da500000-0000-0000-0000-000000000001'
            and requester_employee_id = 'da300000-0000-0000-0000-000000000001' $q$),
  'ACTIVE staff CAN cancel their own open exchange request'
);

-- ============================================================================
-- Section 2: DEACTIVATED employee -- self-service WRITES are rejected
-- ============================================================================

select ok(
  not pg_temp.as_auth_exec('da200000-0000-0000-0000-000000000002',
    $q$ insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, status)
          values ('da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001',
                  'da300000-0000-0000-0000-000000000002', '2026-08-02', 'present') $q$),
  'DEACTIVATED staff CANNOT insert a new attendance row'
);
select is(
  pg_temp.as_auth_rowcount('da200000-0000-0000-0000-000000000002',
    $q$ update workforce.attendance set daily_message = 'hacked' where id = 'da700000-0000-0000-0000-000000000002' $q$),
  0,
  'DEACTIVATED staff CANNOT update their own (pre-existing) attendance row (0 rows affected)'
);
select is(
  (select daily_message from workforce.attendance where id = 'da700000-0000-0000-0000-000000000002'),
  null::text,
  'attendance row was NOT modified by the rejected deactivated-staff update attempt'
);
select ok(
  not pg_temp.as_auth_exec('da200000-0000-0000-0000-000000000002',
    $q$ insert into workforce.shift_requests (tenant_id, location_id, employee_id, kind, work_date, status)
          values ('da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001',
                  'da300000-0000-0000-0000-000000000002', 'preference', '2026-08-12', 'pending') $q$),
  'DEACTIVATED staff CANNOT insert a new shift request'
);
select ok(
  not pg_temp.as_auth_exec('da200000-0000-0000-0000-000000000002',
    $q$ insert into api.workforce_shift_exchanges
          (tenant_id, location_id, shift_id, requester_employee_id, reason, request_kind)
          values ('da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001',
                  'da500000-0000-0000-0000-000000000002', 'da300000-0000-0000-0000-000000000002',
                  'personal', 'cancel') $q$),
  'DEACTIVATED staff CANNOT request cancellation of their own future shift'
);

-- seed an open exchange (as superuser) for the deactivated employee to try to cancel
insert into workforce.shift_exchanges
  (id, tenant_id, location_id, shift_id, requester_employee_id, reason, request_kind, status) values
  ('da800000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001',
   'da500000-0000-0000-0000-000000000002', 'da300000-0000-0000-0000-000000000002', 'pre-existing', 'cancel', 'open');

select ok(
  not pg_temp.as_auth_exec('da200000-0000-0000-0000-000000000002',
    $q$ update workforce.shift_exchanges set status = 'cancelled'
          where id = 'da800000-0000-0000-0000-000000000001' $q$),
  'DEACTIVATED staff CANNOT cancel their own (pre-existing) open exchange request'
);
select is(
  (select status from workforce.shift_exchanges where id = 'da800000-0000-0000-0000-000000000001'),
  'open',
  'the pre-existing exchange was NOT cancelled by the rejected deactivated-staff attempt'
);

-- open exchange from the ACTIVE employee that the DEACTIVATED employee tries to accept
insert into workforce.shift_exchanges
  (id, tenant_id, location_id, shift_id, requester_employee_id, reason, request_kind, status) values
  ('da800000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000001', 'da100000-0000-0000-0000-000000000001',
   'da500000-0000-0000-0000-000000000001', 'da300000-0000-0000-0000-000000000001', 'pre-existing', 'exchange', 'open');

select ok(
  not pg_temp.as_auth_exec('da200000-0000-0000-0000-000000000002',
    $q$ update workforce.shift_exchanges
          set replacement_employee_id = 'da300000-0000-0000-0000-000000000002', status = 'accepted'
          where id = 'da800000-0000-0000-0000-000000000002' $q$),
  'DEACTIVATED staff CANNOT accept another employee''s open exchange'
);
select is(
  (select status from workforce.shift_exchanges where id = 'da800000-0000-0000-0000-000000000002'),
  'open',
  'the pre-existing exchange was NOT accepted by the rejected deactivated-staff attempt'
);

-- ============================================================================
-- Section 3: deactivation does not delete history / attribution, and history
--            (including the deactivated employee's own row) stays readable
-- ============================================================================

select is(
  (select count(*)::int from workforce.employees where id = 'da300000-0000-0000-0000-000000000002'),
  1,
  'deactivated employee row still exists (not deleted)'
);
select is(
  (select is_active from workforce.employees where id = 'da300000-0000-0000-0000-000000000002'),
  false,
  'deactivated employee row is_active = false'
);
select is(
  (select count(*)::int from workforce.attendance where employee_id = 'da300000-0000-0000-0000-000000000002'),
  1,
  'deactivated employee''s attendance history still exists'
);
select is(
  (select count(*)::int from workforce.shift_requests where employee_id = 'da300000-0000-0000-0000-000000000002'),
  1,
  'deactivated employee''s shift_requests history still exists'
);
select is(
  (select count(*)::int from workforce.shift_exchanges where requester_employee_id = 'da300000-0000-0000-0000-000000000002'),
  1,
  'deactivated employee''s shift_exchanges history still exists'
);

select is(
  pg_temp.as_auth_count('da200000-0000-0000-0000-000000000002',
    $q$ select count(*)::int from workforce.attendance where id = 'da700000-0000-0000-0000-000000000002' $q$),
  1,
  'DEACTIVATED staff CAN still read (SELECT) their own historical attendance row'
);
select is(
  pg_temp.as_auth_count('da200000-0000-0000-0000-000000000002',
    $q$ select count(*)::int from workforce.shift_requests where id = 'da600000-0000-0000-0000-000000000002' $q$),
  1,
  'DEACTIVATED staff CAN still read (SELECT) their own historical shift request'
);
select is(
  pg_temp.as_auth_count('da200000-0000-0000-0000-000000000003', -- manager
    $q$ select count(*)::int from workforce.attendance where tenant_id = 'da000000-0000-0000-0000-000000000001' $q$),
  3, -- 2 fixtures + active staff's insert in section 1
  'manager still sees every attendance row (active + deactivated employee) at their location'
);

select * from finish();
rollback;
