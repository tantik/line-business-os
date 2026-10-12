-- ============================================================================
-- DB test: scheduled monthly auto-create cloud runner (migration 0125,
--          DEBT-074 Stage 2)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * grants: no app role (anon/authenticated) can execute any of the
--     service-role functions; service_role can; the runner is executable by
--     no app role at all; api.* passthroughs are not SECURITY DEFINER;
--   * candidates: only auto_create_enabled + Workforce module ON + active
--     location;
--   * load_inputs: every list scoped to BOTH tenant and location (and month);
--   * apply: foreign / inactive / out-of-month drafts rejected with nothing
--     written; lock wins once; stale marker returns false and writes nothing;
--     drafts are published = false; run log + audit row written;
--   * record_issue: upsert increments attempt_count; raw text rejected;
--   * RLS on the run log: location-scoped Manager sees only own location,
--     other tenant sees nothing of it, a member without workforce.shift.read
--     sees nothing; anon has no grant;
--   * token verify true/false; cron job exists with the expected schedule;
--     the runner is a no-op without vault secret project_url.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce;

select no_plan();

-- --- Helpers ------------------------------------------------------------------
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

create function pg_temp.as_auth_throws(p_sub text, p_sql text)
returns boolean language plpgsql as $$
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

create function pg_temp.as_service_text(p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  execute p_sql into v;
  reset role;
  return v;
end;
$$;

-- ============================================================================
-- Fixtures
--   Tenant A (Workforce ON): LA1 enabled, LA2 disabled, LA3 enabled but
--     inactive location.
--   Tenant B (Workforce ON): LB enabled.
--   Tenant C (Workforce OFF): LC enabled.
--   Tenant D (no tenant_modules row): LD enabled.
-- ============================================================================
insert into core.tenants (id, slug, name) values
  ('c1250000-0000-0000-0000-00000000000a', 'pgtap-asr-a', 'pgTAP AutoSched Runner A'),
  ('c1250000-0000-0000-0000-00000000000b', 'pgtap-asr-b', 'pgTAP AutoSched Runner B'),
  ('c1250000-0000-0000-0000-00000000000c', 'pgtap-asr-c', 'pgTAP AutoSched Runner C'),
  ('c1250000-0000-0000-0000-00000000000d', 'pgtap-asr-d', 'pgTAP AutoSched Runner D');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('c1250000-0000-0000-0000-00000000000a', 'workforce', true),
  ('c1250000-0000-0000-0000-00000000000b', 'workforce', true),
  ('c1250000-0000-0000-0000-00000000000c', 'workforce', false);

insert into core.locations (id, tenant_id, name, timezone, is_active) values
  ('c1251000-0000-0000-0000-000000000001', 'c1250000-0000-0000-0000-00000000000a', 'A/L1', 'Asia/Tokyo', true),
  ('c1251000-0000-0000-0000-000000000002', 'c1250000-0000-0000-0000-00000000000a', 'A/L2', 'Asia/Tokyo', true),
  ('c1251000-0000-0000-0000-000000000003', 'c1250000-0000-0000-0000-00000000000a', 'A/L3 inactive', 'Asia/Tokyo', false),
  ('c1251000-0000-0000-0000-000000000004', 'c1250000-0000-0000-0000-00000000000b', 'B/L1', 'Asia/Tokyo', true),
  ('c1251000-0000-0000-0000-000000000005', 'c1250000-0000-0000-0000-00000000000c', 'C/L1', 'Asia/Tokyo', true),
  ('c1251000-0000-0000-0000-000000000006', 'c1250000-0000-0000-0000-00000000000d', 'D/L1', 'Asia/Tokyo', true);

insert into workforce.schedule_settings (tenant_id, location_id, auto_create_enabled, auto_create_day_of_month) values
  ('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', true, 20),
  ('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000002', false, 20),
  ('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000003', true, 20),
  ('c1250000-0000-0000-0000-00000000000b', 'c1251000-0000-0000-0000-000000000004', true, 20),
  ('c1250000-0000-0000-0000-00000000000c', 'c1251000-0000-0000-0000-000000000005', true, 20),
  ('c1250000-0000-0000-0000-00000000000d', 'c1251000-0000-0000-0000-000000000006', true, 20);

insert into core.users (id, display_name) values
  ('c1259000-0000-0000-0000-000000000001', 'Manager A (L1 only)'),
  ('c1259000-0000-0000-0000-000000000002', 'Manager B'),
  ('c1259000-0000-0000-0000-000000000003', 'Client-role member A');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('c1250000-0000-0000-0000-00000000000a', 'c1259000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005', 'c1251000-0000-0000-0000-000000000001'), -- manager @ A/L1
  ('c1250000-0000-0000-0000-00000000000b', 'c1259000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', null),                                   -- manager, tenant B
  ('c1250000-0000-0000-0000-00000000000a', 'c1259000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000007', null);                                   -- client role (no workforce.shift.read)

insert into workforce.employees (id, tenant_id, location_id, name_encrypted, is_active) values
  ('c1253000-0000-0000-0000-000000000001', 'c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '\x00', true),  -- EA1 active @ A/L1
  ('c1253000-0000-0000-0000-000000000002', 'c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '\x00', false), -- EA1b inactive @ A/L1
  ('c1253000-0000-0000-0000-000000000003', 'c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000002', '\x00', true),  -- EA2 @ A/L2
  ('c1253000-0000-0000-0000-000000000004', 'c1250000-0000-0000-0000-00000000000b', 'c1251000-0000-0000-0000-000000000004', '\x00', true);  -- EB @ B/L1

insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, break_minutes, is_active) values
  ('c1254000-0000-0000-0000-000000000001', 'c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', 'AM', 'AM', '09:00', '17:00', 60, true),
  ('c1254000-0000-0000-0000-000000000002', 'c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', 'OLD', 'Old', '10:00', '12:00', 0, false),
  ('c1254000-0000-0000-0000-000000000003', 'c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000002', 'AM', 'AM', '09:00', '17:00', 60, true),
  ('c1254000-0000-0000-0000-000000000004', 'c1250000-0000-0000-0000-00000000000b', 'c1251000-0000-0000-0000-000000000004', 'AM', 'AM', '09:00', '17:00', 60, true);

-- Preferences: one in-month @ A/L1 (counted), one @ A/L2 (other location),
-- one in December @ A/L1 (other month), one correction-kind @ A/L1.
insert into workforce.shift_requests (tenant_id, location_id, employee_id, kind, work_date, shift_type_id, is_unavailable) values
  ('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', 'c1253000-0000-0000-0000-000000000001', 'preference', '2026-11-03', 'c1254000-0000-0000-0000-000000000001', false),
  ('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000002', 'c1253000-0000-0000-0000-000000000003', 'preference', '2026-11-03', 'c1254000-0000-0000-0000-000000000003', false),
  ('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', 'c1253000-0000-0000-0000-000000000001', 'preference', '2026-12-01', 'c1254000-0000-0000-0000-000000000001', false),
  ('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', 'c1253000-0000-0000-0000-000000000001', 'correction', '2026-11-04', null, false);

-- Existing shifts: one manual in-month @ A/L1 (counted), one @ A/L2, one in
-- December @ A/L1.
insert into workforce.shifts (tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, published) values
  ('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', 'c1253000-0000-0000-0000-000000000001', 'c1254000-0000-0000-0000-000000000001',
   '2026-11-05 00:00:00+00', '2026-11-05 08:00:00+00', 60, true),
  ('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000002', 'c1253000-0000-0000-0000-000000000003', 'c1254000-0000-0000-0000-000000000003',
   '2026-11-05 00:00:00+00', '2026-11-05 08:00:00+00', 60, true),
  ('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', 'c1253000-0000-0000-0000-000000000001', 'c1254000-0000-0000-0000-000000000001',
   '2026-12-02 00:00:00+00', '2026-12-02 08:00:00+00', 60, true);

-- ============================================================================
-- 1. Grants
-- ============================================================================
create temp table pg_temp.sr_fns (sig text) on commit drop;
insert into pg_temp.sr_fns values
  ('workforce.auto_schedule_candidates()'),
  ('workforce.auto_schedule_load_inputs(uuid, uuid, date, date, timestamptz, timestamptz)'),
  ('workforce.auto_schedule_apply(uuid, uuid, date, date, jsonb, integer, integer, integer)'),
  ('workforce.auto_schedule_record_issue(uuid, uuid, date, text, text)'),
  ('workforce.verify_auto_schedule_cron_token(text)'),
  ('api.auto_schedule_candidates()'),
  ('api.auto_schedule_load_inputs(uuid, uuid, date, date, timestamptz, timestamptz)'),
  ('api.auto_schedule_apply(uuid, uuid, date, date, jsonb, integer, integer, integer)'),
  ('api.auto_schedule_record_issue(uuid, uuid, date, text, text)'),
  ('api.verify_auto_schedule_cron_token(text)');

select is(
  (select count(*)::int from pg_temp.sr_fns where has_function_privilege('anon', sig, 'execute')),
  0, 'anon cannot execute any auto-schedule runner function');
select is(
  (select count(*)::int from pg_temp.sr_fns where has_function_privilege('authenticated', sig, 'execute')),
  0, 'authenticated cannot execute any auto-schedule runner function');
select is(
  (select count(*)::int from pg_temp.sr_fns where has_function_privilege('service_role', sig, 'execute')),
  10, 'service_role can execute every auto-schedule runner function');

select ok(
  not has_function_privilege('anon', 'workforce.invoke_auto_schedule_runner()', 'execute')
  and not has_function_privilege('authenticated', 'workforce.invoke_auto_schedule_runner()', 'execute')
  and not has_function_privilege('service_role', 'workforce.invoke_auto_schedule_runner()', 'execute'),
  'invoke_auto_schedule_runner is executable by no app role (pg_cron runs it as its owner)');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname in ('auto_schedule_candidates', 'auto_schedule_load_inputs',
      'auto_schedule_apply', 'auto_schedule_record_issue', 'verify_auto_schedule_cron_token')
      and p.prosecdef),
  0, 'ADR 0008: no api.* auto-schedule passthrough is SECURITY DEFINER');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'workforce' and p.proname in ('auto_schedule_candidates', 'auto_schedule_load_inputs',
      'auto_schedule_apply', 'auto_schedule_record_issue', 'verify_auto_schedule_cron_token', 'invoke_auto_schedule_runner')
      and p.prosecdef
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  6, 'every workforce.* runner function is SECURITY DEFINER with a fixed search_path');

select ok(
  pg_temp.as_auth_throws('c1259000-0000-0000-0000-000000000001', $q$select * from api.auto_schedule_candidates()$q$),
  'a Manager (authenticated) cannot call api.auto_schedule_candidates');
select ok(
  pg_temp.as_auth_throws('c1259000-0000-0000-0000-000000000001',
    $q$select api.auto_schedule_record_issue('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '2026-11-01', 'failed', 'x')$q$),
  'a Manager (authenticated) cannot call api.auto_schedule_record_issue');

select ok(not has_table_privilege('anon', 'api.workforce_auto_schedule_runs', 'select'), 'anon has no SELECT on api.workforce_auto_schedule_runs');
select ok(has_table_privilege('authenticated', 'api.workforce_auto_schedule_runs', 'select'), 'authenticated has SELECT on api.workforce_auto_schedule_runs (RLS-scoped)');
select ok(
  not has_table_privilege('authenticated', 'workforce.auto_schedule_runs', 'insert')
  and not has_table_privilege('authenticated', 'workforce.auto_schedule_runs', 'update')
  and not has_table_privilege('authenticated', 'workforce.auto_schedule_runs', 'delete'),
  'authenticated cannot write the run log');
select ok(
  (select relrowsecurity from pg_class where oid = 'workforce.auto_schedule_runs'::regclass),
  'RLS is enabled on workforce.auto_schedule_runs');

-- ============================================================================
-- 2. Candidates
-- ============================================================================
select is(
  (select array_agg(location_id order by location_id)::text from workforce.auto_schedule_candidates()
    where tenant_id in ('c1250000-0000-0000-0000-00000000000a', 'c1250000-0000-0000-0000-00000000000b',
                        'c1250000-0000-0000-0000-00000000000c', 'c1250000-0000-0000-0000-00000000000d')),
  '{c1251000-0000-0000-0000-000000000001,c1251000-0000-0000-0000-000000000004}',
  'candidates: only enabled settings with Workforce ON and an active location (not disabled, not inactive location, not module OFF, not module row missing)');

select is(
  pg_temp.as_service_text($q$select count(*)::text from api.auto_schedule_candidates()
    where tenant_id in ('c1250000-0000-0000-0000-00000000000a', 'c1250000-0000-0000-0000-00000000000b')$q$),
  '2', 'service_role reaches the candidates through the api passthrough');

select is(
  (select timezone from workforce.auto_schedule_candidates() where location_id = 'c1251000-0000-0000-0000-000000000001'),
  'Asia/Tokyo', 'candidates carry the location timezone');

-- ============================================================================
-- 3. load_inputs scoping
-- ============================================================================
create temp table pg_temp.inputs on commit drop as
select workforce.auto_schedule_load_inputs(
  'c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001',
  '2026-11-01', '2026-11-30', '2026-10-31 15:00:00+00', '2026-11-30 15:00:00+00') as j;

select is((select jsonb_array_length(j -> 'employees') from pg_temp.inputs), 2,
  'load_inputs: employees of this location only (active + inactive; other location / tenant excluded)');
select is((select jsonb_array_length(j -> 'shift_types') from pg_temp.inputs), 2,
  'load_inputs: shift types of this location only (active + inactive)');
select is((select jsonb_array_length(j -> 'preferences') from pg_temp.inputs), 1,
  'load_inputs: preference-kind rows of this location inside the month only');
select is((select jsonb_array_length(j -> 'existing_assignments') from pg_temp.inputs), 1,
  'load_inputs: existing shifts of this location inside [from, to) only');
select is((select j -> 'shift_types' -> 0 ->> 'starts_at_local' from pg_temp.inputs), '09:00',
  'load_inputs: local times are HH:MM');

-- ============================================================================
-- 4. apply -- rejections first (nothing may be written)
-- ============================================================================
select throws_ok(
  $q$select workforce.auto_schedule_apply('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '2026-11-01', null,
    '[{"employee_id":"c1253000-0000-0000-0000-000000000004","shift_type_id":"c1254000-0000-0000-0000-000000000001","starts_at":"2026-11-02T00:00:00Z","ends_at":"2026-11-02T08:00:00Z","break_minutes":60}]'::jsonb, 0, 0, 0)$q$,
  '22023', null, 'apply rejects a draft whose employee belongs to another tenant');
select throws_ok(
  $q$select workforce.auto_schedule_apply('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '2026-11-01', null,
    '[{"employee_id":"c1253000-0000-0000-0000-000000000001","shift_type_id":"c1254000-0000-0000-0000-000000000003","starts_at":"2026-11-02T00:00:00Z","ends_at":"2026-11-02T08:00:00Z","break_minutes":60}]'::jsonb, 0, 0, 0)$q$,
  '22023', null, 'apply rejects a draft whose shift type belongs to another location of the same tenant');
select throws_ok(
  $q$select workforce.auto_schedule_apply('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '2026-11-01', null,
    '[{"employee_id":"c1253000-0000-0000-0000-000000000003","shift_type_id":"c1254000-0000-0000-0000-000000000001","starts_at":"2026-11-02T00:00:00Z","ends_at":"2026-11-02T08:00:00Z","break_minutes":60}]'::jsonb, 0, 0, 0)$q$,
  '22023', null, 'apply rejects a draft whose employee belongs to another location of the same tenant');
select throws_ok(
  $q$select workforce.auto_schedule_apply('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '2026-11-01', null,
    '[{"employee_id":"c1253000-0000-0000-0000-000000000002","shift_type_id":"c1254000-0000-0000-0000-000000000001","starts_at":"2026-11-02T00:00:00Z","ends_at":"2026-11-02T08:00:00Z","break_minutes":60}]'::jsonb, 0, 0, 0)$q$,
  '22023', null, 'apply rejects a draft for an inactive employee');
select throws_ok(
  $q$select workforce.auto_schedule_apply('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '2026-11-01', null,
    '[{"employee_id":"c1253000-0000-0000-0000-000000000001","shift_type_id":"c1254000-0000-0000-0000-000000000001","starts_at":"2026-12-02T00:00:00Z","ends_at":"2026-12-02T08:00:00Z","break_minutes":60}]'::jsonb, 0, 0, 0)$q$,
  '22023', null, 'apply rejects a draft outside the target month');

select is(
  (select auto_create_last_generated_month from workforce.schedule_settings
    where tenant_id = 'c1250000-0000-0000-0000-00000000000a' and location_id = 'c1251000-0000-0000-0000-000000000001'),
  null::date, 'rejected applies left the marker untouched');
select is(
  (select count(*)::int from workforce.shifts where tenant_id = 'c1250000-0000-0000-0000-00000000000a' and published = false),
  0, 'rejected applies inserted no drafts');

-- --- apply: lock wins once ---------------------------------------------------
select is(
  workforce.auto_schedule_apply('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '2026-11-01', null,
    '[{"employee_id":"c1253000-0000-0000-0000-000000000001","shift_type_id":"c1254000-0000-0000-0000-000000000001","starts_at":"2026-11-02T00:00:00Z","ends_at":"2026-11-02T08:00:00Z","break_minutes":60},
      {"employee_id":"c1253000-0000-0000-0000-000000000001","shift_type_id":"c1254000-0000-0000-0000-000000000001","starts_at":"2026-11-03T00:00:00Z","ends_at":"2026-11-03T08:00:00Z","break_minutes":60}]'::jsonb,
    3, 1, 0),
  true, 'apply claims the month on the first call');

select is(
  (select auto_create_last_generated_month from workforce.schedule_settings
    where tenant_id = 'c1250000-0000-0000-0000-00000000000a' and location_id = 'c1251000-0000-0000-0000-000000000001'),
  '2026-11-01'::date, 'apply set the idempotency marker');
select is(
  (select count(*)::int from workforce.shifts where tenant_id = 'c1250000-0000-0000-0000-00000000000a'
    and location_id = 'c1251000-0000-0000-0000-000000000001' and published = false),
  2, 'apply inserted the drafts, all published = false');
select is(
  (select count(*)::int from workforce.auto_schedule_runs where tenant_id = 'c1250000-0000-0000-0000-00000000000a'
    and location_id = 'c1251000-0000-0000-0000-000000000001' and target_month = '2026-11-01' and outcome = 'generated'
    and created_count = 2 and shortage_count = 3 and unplaced_count = 1 and error_code is null and attempt_count = 1),
  1, 'apply wrote one generated run-log row with the counts');
select is(
  (select count(*)::int from audit.audit_logs where tenant_id = 'c1250000-0000-0000-0000-00000000000a'
    and action = 'auto_schedule.generated' and actor_id is null and actor_kind = 'system'
    and module = 'workforce' and entity_id = 'c1251000-0000-0000-0000-000000000001'
    and (after ->> 'created_count')::int = 2),
  1, 'apply wrote a system audit row');

-- Second call with the stale (pre-run) marker -> false, nothing written.
select is(
  pg_temp.as_service_text($q$select api.auto_schedule_apply('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '2026-11-01', '2026-10-01',
    '[{"employee_id":"c1253000-0000-0000-0000-000000000001","shift_type_id":"c1254000-0000-0000-0000-000000000001","starts_at":"2026-11-04T00:00:00Z","ends_at":"2026-11-04T08:00:00Z","break_minutes":60}]'::jsonb,
    0, 0, 0)::text$q$),
  'false', 'apply with a stale marker returns false (lost race) via the service_role passthrough');
select is(
  workforce.auto_schedule_apply('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '2026-11-01', null,
    '[{"employee_id":"c1253000-0000-0000-0000-000000000001","shift_type_id":"c1254000-0000-0000-0000-000000000001","starts_at":"2026-11-04T00:00:00Z","ends_at":"2026-11-04T08:00:00Z","break_minutes":60}]'::jsonb,
    0, 0, 0),
  false, 'apply with the original (now stale) null marker returns false');
select is(
  workforce.auto_schedule_apply('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000001', '2026-11-01', '2026-11-01',
    '[]'::jsonb, 0, 0, 0),
  false, 'apply for an already-generated month returns false');
select is(
  (select count(*)::int from workforce.shifts where tenant_id = 'c1250000-0000-0000-0000-00000000000a'
    and location_id = 'c1251000-0000-0000-0000-000000000001' and published = false),
  2, 'lost-race applies inserted nothing');
select is(
  (select attempt_count from workforce.auto_schedule_runs where tenant_id = 'c1250000-0000-0000-0000-00000000000a'
    and location_id = 'c1251000-0000-0000-0000-000000000001' and outcome = 'generated'),
  1, 'lost-race applies did not touch the run log');
select is(
  (select count(*)::int from audit.audit_logs where tenant_id = 'c1250000-0000-0000-0000-00000000000a' and action = 'auto_schedule.generated'),
  1, 'lost-race applies wrote no audit row');

-- Disabled location: lock never matches even with a correct marker.
select is(
  workforce.auto_schedule_apply('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000002', '2026-11-01', null,
    '[]'::jsonb, 0, 0, 0),
  false, 'apply refuses a location whose automation is OFF');

-- ============================================================================
-- 5. record_issue
-- ============================================================================
select lives_ok(
  $q$select workforce.auto_schedule_record_issue('c1250000-0000-0000-0000-00000000000b', 'c1251000-0000-0000-0000-000000000004', '2026-11-01', 'config_error', 'no_active_shift_types')$q$,
  'record_issue records a config error');
select lives_ok(
  $q$select workforce.auto_schedule_record_issue('c1250000-0000-0000-0000-00000000000b', 'c1251000-0000-0000-0000-000000000004', '2026-11-01', 'config_error', 'no_active_shift_types')$q$,
  'record_issue records the same config error again');
select is(
  (select attempt_count from workforce.auto_schedule_runs where tenant_id = 'c1250000-0000-0000-0000-00000000000b'
    and location_id = 'c1251000-0000-0000-0000-000000000004' and outcome = 'config_error'),
  2, 'record_issue upserts one row and increments attempt_count');
select throws_ok(
  $q$select workforce.auto_schedule_record_issue('c1250000-0000-0000-0000-00000000000b', 'c1251000-0000-0000-0000-000000000004', '2026-11-01', 'failed', 'Permission denied for table X')$q$,
  '22023', null, 'record_issue rejects raw error text as error_code');
select throws_ok(
  $q$select workforce.auto_schedule_record_issue('c1250000-0000-0000-0000-00000000000b', 'c1251000-0000-0000-0000-000000000004', '2026-11-01', 'generated', 'x')$q$,
  '22023', null, 'record_issue rejects the generated outcome');
select lives_ok(
  $q$select workforce.auto_schedule_record_issue('c1250000-0000-0000-0000-00000000000a', 'c1251000-0000-0000-0000-000000000002', '2026-11-01', 'failed', 'unexpected_error')$q$,
  'record_issue records a failure for A/L2');

-- ============================================================================
-- 6. Run-log RLS
-- ============================================================================
select is(
  pg_temp.as_auth_count('c1259000-0000-0000-0000-000000000001',
    $q$select count(*)::int from api.workforce_auto_schedule_runs where location_id = 'c1251000-0000-0000-0000-000000000001'$q$),
  1, 'Manager A sees the run log of their own location');
select is(
  pg_temp.as_auth_count('c1259000-0000-0000-0000-000000000001',
    $q$select count(*)::int from api.workforce_auto_schedule_runs where location_id = 'c1251000-0000-0000-0000-000000000002'$q$),
  0, 'Manager A (scoped to L1) does not see another location of the same tenant');
select is(
  pg_temp.as_auth_count('c1259000-0000-0000-0000-000000000001',
    $q$select count(*)::int from api.workforce_auto_schedule_runs where tenant_id = 'c1250000-0000-0000-0000-00000000000b'$q$),
  0, 'Manager A does not see tenant B rows');
select is(
  pg_temp.as_auth_count('c1259000-0000-0000-0000-000000000002',
    $q$select count(*)::int from api.workforce_auto_schedule_runs where tenant_id = 'c1250000-0000-0000-0000-00000000000a'$q$),
  0, 'Manager B does not see tenant A rows');
select is(
  pg_temp.as_auth_count('c1259000-0000-0000-0000-000000000002',
    $q$select count(*)::int from api.workforce_auto_schedule_runs where tenant_id = 'c1250000-0000-0000-0000-00000000000b'$q$),
  1, 'Manager B sees tenant B rows');
select is(
  pg_temp.as_auth_count('c1259000-0000-0000-0000-000000000003',
    $q$select count(*)::int from api.workforce_auto_schedule_runs where tenant_id = 'c1250000-0000-0000-0000-00000000000a'$q$),
  0, 'a member without workforce.shift.read sees nothing');

-- ============================================================================
-- 7. Token verification
-- ============================================================================
select is(
  (select length(decrypted_secret) from vault.decrypted_secrets where name = 'auto_schedule_cron_token'),
  64, 'the migration created a 32-byte hex cron token in the vault');
select is(
  workforce.verify_auto_schedule_cron_token((select decrypted_secret from vault.decrypted_secrets where name = 'auto_schedule_cron_token')),
  true, 'verify_auto_schedule_cron_token accepts the vault token');
select is(workforce.verify_auto_schedule_cron_token(repeat('0', 64)), false, 'verify_auto_schedule_cron_token rejects a wrong token');
select is(workforce.verify_auto_schedule_cron_token(''), false, 'verify_auto_schedule_cron_token rejects an empty token');
select is(workforce.verify_auto_schedule_cron_token(null), false, 'verify_auto_schedule_cron_token rejects null');

-- ============================================================================
-- 8. Cron job + no-op runner
-- ============================================================================
select is(
  (select schedule from cron.job where jobname = 'workforce-auto-schedule-monthly'),
  '7 * * * *', 'pg_cron job workforce-auto-schedule-monthly runs hourly at minute 7');
select is(
  (select command from cron.job where jobname = 'workforce-auto-schedule-monthly'),
  'select workforce.invoke_auto_schedule_runner()', 'the cron job calls the runner');

delete from vault.secrets where name = 'project_url';
create temp table pg_temp.queue_before on commit drop as select count(*)::int as n from net.http_request_queue;
select is(workforce.invoke_auto_schedule_runner(), null::bigint, 'runner returns null without vault secret project_url');
select is(
  (select count(*)::int from net.http_request_queue),
  (select n from pg_temp.queue_before),
  'runner queued no HTTP request without project_url (no-op)');

select * from finish();
rollback;
