-- ============================================================================
-- DB test: Booking module-OFF gating (WP-S4, migration
-- 0096_booking_module_access_gate.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Booking is scaffold-only (no product features, no api.* view/RPC) -- this
-- file proves the RLS lifecycle directly against the base tables, the only
-- tenant-facing surface Booking has: Booking ON (normal SELECT/INSERT
-- behavior) -> OFF (SELECT/INSERT blocked tenant-facing, existing rows
-- preserved) -> ON again (prior access restored).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, booking, ai;

select no_plan();

-- Booking is scaffold-only: no migration has ever granted `authenticated`
-- schema/table access (confirmed -- grep found none), so its RLS policies,
-- while present, are currently unreachable tenant-facing regardless of
-- module state. Grant test-only access here (matching the established
-- pattern already used by 0014/0023/0024/0008/etc. for their own schemas)
-- purely to exercise and prove the RLS/module-access logic itself -- this
-- does NOT activate Booking as a real product feature (that would require a
-- migration change, which this mission's WP-S4 scope explicitly excludes);
-- it only makes the policies' behavior testable.
grant usage on schema booking to authenticated;
grant select, insert on booking.services to authenticated;

-- --- Fixtures ---------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('9d100000-0000-0000-0000-00000000000a', 'pgtap-booking-gate-tenant', 'pgTAP Booking Gate Tenant');

-- Booking starts ON.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('9d100000-0000-0000-0000-00000000000a', 'booking', true);

insert into core.locations (id, tenant_id, name) values
  ('9d200000-0000-0000-0000-000000000001', '9d100000-0000-0000-0000-00000000000a', 'Gate Tenant Location A');

insert into core.users (id, display_name) values
  ('9d900000-0000-0000-0000-000000000001', 'Gate Owner A');

-- tenant_owner: system role, holds every permission via role_permissions
-- seed data (0008_rbac_seed.sql) -- simplest fixture for a scaffold-only
-- module with no dedicated staff-role assignment convention yet.
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9d100000-0000-0000-0000-00000000000a', '9d900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003', '9d200000-0000-0000-0000-000000000001'); -- tenant_owner

insert into booking.services (id, tenant_id, location_id, name, duration_minutes)
  values ('9d300000-0000-0000-0000-000000000001', '9d100000-0000-0000-0000-00000000000a',
          '9d200000-0000-0000-0000-000000000001', 'Haircut', 30);

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
  return n;
end;
$$;

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
  return false;
exception
  when others then
    return true;
end;
$$;

-- ============================================================================
-- Section 1: Booking ON -- normal baseline behavior.
-- ============================================================================

select is(
  pg_temp.as_auth_count('9d900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from booking.services where tenant_id = '9d100000-0000-0000-0000-00000000000a' $$),
  1,
  'Booking ON: owner sees the service via tenant-facing SELECT'
);
reset role;

select ok(
  not pg_temp.as_auth_throws('9d900000-0000-0000-0000-000000000001',
    $$ insert into booking.services (tenant_id, location_id, name, duration_minutes)
         values ('9d100000-0000-0000-0000-00000000000a', '9d200000-0000-0000-0000-000000000001', 'Manicure', 45) $$),
  'Booking ON: owner can INSERT a new service'
);
reset role;

-- ============================================================================
-- Section 2: Booking OFF -- tenant-facing access blocked, data preserved.
-- ============================================================================

update core.tenant_modules set is_enabled = false
  where tenant_id = '9d100000-0000-0000-0000-00000000000a' and module = 'booking';

select is(
  pg_temp.as_auth_count('9d900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from booking.services where tenant_id = '9d100000-0000-0000-0000-00000000000a' $$),
  0,
  'Booking OFF: tenant-facing SELECT on booking.services returns zero rows, even though rows still exist'
);
reset role;

select ok(
  pg_temp.as_auth_throws('9d900000-0000-0000-0000-000000000001',
    $$ insert into booking.services (tenant_id, location_id, name, duration_minutes)
         values ('9d100000-0000-0000-0000-00000000000a', '9d200000-0000-0000-0000-000000000001', 'Blocked service', 20) $$),
  'Booking OFF: owner cannot INSERT a new service'
);
reset role;

-- Existing rows preserved: verified via a superuser/RLS-bypassing read.
select is(
  (select count(*)::int from booking.services where tenant_id = '9d100000-0000-0000-0000-00000000000a'),
  2,
  'Booking OFF: both pre-existing service rows (Haircut, Manicure from Section 1) still exist in storage'
);

-- ============================================================================
-- Section 3: Booking ON again -- prior data/actions accessible again.
-- ============================================================================

update core.tenant_modules set is_enabled = true
  where tenant_id = '9d100000-0000-0000-0000-00000000000a' and module = 'booking';

select is(
  pg_temp.as_auth_count('9d900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from booking.services where tenant_id = '9d100000-0000-0000-0000-00000000000a' $$),
  2,
  'Booking ON again: both pre-existing services are visible again through the tenant-facing path'
);
reset role;

-- ============================================================================
-- Section 4: cross-tenant isolation still holds regardless of module state.
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('9d100000-0000-0000-0000-00000000000b', 'pgtap-booking-gate-tenant-b', 'pgTAP Booking Gate Tenant B');
insert into core.users (id, display_name) values
  ('9d900000-0000-0000-0000-000000000002', 'Gate Owner B');
insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('9d100000-0000-0000-0000-00000000000b', '9d900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000003'); -- tenant_owner, tenant-wide

select is(
  pg_temp.as_auth_count('9d900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from booking.services where tenant_id = '9d100000-0000-0000-0000-00000000000a' $$),
  0,
  'Tenant B owner sees zero Tenant A booking.services rows regardless of Tenant A''s own module state (tenant isolation)'
);
reset role;

select * from finish();
rollback;
