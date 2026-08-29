-- ============================================================================
-- DB test: workforce.my_pending_employee_invitations self-scoping
-- (migration 0112 — re-home of the historical dev 0069 fix)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the identity-leak fix that historically shipped as dev 0069 but
-- never reached Cloud dev (ledger slot 0069 was consumed by main's
-- entitlements engine). 0112 re-homes it. This test asserts the SECURITY
-- BEHAVIOR, not the migration number:
--   * a Manager (workforce.staff.manage) querying the invitations view by a
--     bare status filter sees a pending invite addressed to a DIFFERENT user
--     (the pre-fix leak — wf_employee_invitations_manager_read/_self_read are
--     OR'd);
--   * api.my_pending_employee_invitations() returns ONLY the caller's own
--     pending invitations, for every caller;
--   * the passthrough is SECURITY INVOKER (ADR 0008); the workforce fn is
--     SECURITY DEFINER.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce, api;

select no_plan();

-- --- Fixtures ----------------------------------------------------------
insert into core.tenants (id, slug, name, kind) values
  ('0a110000-0000-0000-0000-0000000e0001', 'pgtap-inv-a', 'pgTAP Inv A', 'client');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0a110000-0000-0000-0000-0000000e0001', 'workforce', true);
insert into core.locations (id, tenant_id, name, timezone) values
  ('0a100000-0000-0000-0000-0000000e0001', '0a110000-0000-0000-0000-0000000e0001', 'L1', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('0a900000-0000-0000-0000-0000000e0001', 'Inv Manager'),
  ('0a900000-0000-0000-0000-0000000e0002', 'Inv Target'),
  ('0a900000-0000-0000-0000-0000000e0003', 'Inv Bystander');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('0a110000-0000-0000-0000-0000000e0001', '0a900000-0000-0000-0000-0000000e0001', 'active'),
  ('0a110000-0000-0000-0000-0000000e0001', '0a900000-0000-0000-0000-0000000e0003', 'active');
-- Manager = manager role (holds workforce.staff.manage tenant-wide).
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0a110000-0000-0000-0000-0000000e0001', '0a900000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-000000000005', null),
  ('0a110000-0000-0000-0000-0000000e0001', '0a900000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-000000000006', '0a100000-0000-0000-0000-0000000e0001');

insert into workforce.employees (id, tenant_id, location_id, name_encrypted, name_hash, position_label, employment_type, is_active, created_by, updated_by)
  values ('0e110000-0000-0000-0000-0000000e0001', '0a110000-0000-0000-0000-0000000e0001', '0a100000-0000-0000-0000-0000000e0001', '\x00', 'inv-h1', 'Barista', 'part_time', true, '0a900000-0000-0000-0000-0000000e0001', '0a900000-0000-0000-0000-0000000e0001');
-- a PENDING invitation addressed to Inv Target (target_user_id = ...e0002),
-- created by the Manager.
insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, status, invited_by, expires_at)
  values ('11110000-0000-0000-0000-0000000e0001', '0a110000-0000-0000-0000-0000000e0001', '0e110000-0000-0000-0000-0000000e0001', '0a900000-0000-0000-0000-0000000e0002', 'pending', '0a900000-0000-0000-0000-0000000e0001', now() + interval '7 days');

-- --- helper ----------------------------------------------------------
create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end $$;

-- --- structure -------------------------------------------------------
select has_function('workforce', 'my_pending_employee_invitations', array[]::text[],
  'workforce.my_pending_employee_invitations() exists');
select has_function('api', 'my_pending_employee_invitations', array[]::text[],
  'api.my_pending_employee_invitations() exists (was ABSENT on Cloud dev before 0112)');
select is(
  (select prosecdef from pg_proc where proname = 'my_pending_employee_invitations' and pronamespace = 'workforce'::regnamespace),
  true, '0112: workforce.my_pending_employee_invitations is SECURITY DEFINER');
select is(
  (select prosecdef from pg_proc where proname = 'my_pending_employee_invitations' and pronamespace = 'api'::regnamespace),
  false, '0112: api.my_pending_employee_invitations is SECURITY INVOKER (ADR 0008 — no SECURITY DEFINER in api)');

-- --- the pre-fix leak still exists on the raw view path ---------------
-- Manager, bare status filter on the facade view -> sees a pending invitation
-- that is NOT addressed to them (this is exactly what the RPC exists to avoid).
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000e0001',
    $$ select count(*)::int from api.workforce_employee_invitations where status = 'pending' $$),
  1, 'leak: a Manager''s bare status-filtered view read returns another user''s pending invitation');

-- --- the fixed path: RPC is self-scoped for every caller -------------
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000e0001',
    $$ select count(*)::int from api.my_pending_employee_invitations() $$),
  0, '0112: the Manager (not the invite target) sees ZERO of their own pending invitations via the RPC');
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000e0002',
    $$ select count(*)::int from api.my_pending_employee_invitations() $$),
  1, '0112: Inv Target sees exactly their own 1 pending invitation via the RPC');
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000e0003',
    $$ select count(*)::int from api.my_pending_employee_invitations() $$),
  0, '0112: an unrelated tenant member sees zero pending invitations via the RPC');
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000e0002',
    $$ select count(*)::int from api.my_pending_employee_invitations() where invitation_id = '11110000-0000-0000-0000-0000000e0001' $$),
  1, '0112: the returned invitation_id is the one addressed to the caller');

select * from finish();
rollback;
