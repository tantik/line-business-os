-- ============================================================================
-- DB test: workforce.schedule_settings weekly labour limits (migration 0126)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * max_weekly_hours defaults to 40 and max_days_per_week to 5;
--   * CHECK bounds: hours 1..168, days 1..7 (0 / 169 / 8 rejected, 23514);
--   * both columns are exposed (and writable) through the
--     api.workforce_schedule_settings view for an authorized Manager, and
--     RLS still hides another tenant's row;
--   * workforce.auto_schedule_candidates() (and the api passthrough, via
--     service_role) return both columns;
--   * the recreated candidates functions keep the 0125 security posture:
--     workforce = SECURITY DEFINER + fixed search_path, api = invoker,
--     EXECUTE for service_role only (anon/authenticated get 42501).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;

select no_plan();

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

create function pg_temp.as_role_sqlstate(p_role text, p_sub text, p_sql text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  return 'ok';
exception
  when others then
    reset role;
    return sqlstate;
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

-- --- Fixtures ----------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('c1260000-0000-0000-0000-00000000000a', 'pgtap-wl-a', 'pgTAP Weekly Limits A'),
  ('c1260000-0000-0000-0000-00000000000b', 'pgtap-wl-b', 'pgTAP Weekly Limits B');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('c1260000-0000-0000-0000-00000000000a', 'workforce', true),
  ('c1260000-0000-0000-0000-00000000000b', 'workforce', true);
insert into core.locations (id, tenant_id, name, timezone) values
  ('c1261000-0000-0000-0000-000000000001', 'c1260000-0000-0000-0000-00000000000a', 'A/L1', 'Asia/Tokyo'),
  ('c1261000-0000-0000-0000-000000000002', 'c1260000-0000-0000-0000-00000000000b', 'B/L1', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('c1269000-0000-0000-0000-000000000001', 'Weekly Limits Manager A');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('c1260000-0000-0000-0000-00000000000a', 'c1269000-0000-0000-0000-000000000001', 'active');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('c1260000-0000-0000-0000-00000000000a', 'c1269000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', null);

insert into workforce.schedule_settings (tenant_id, location_id, auto_create_enabled) values
  ('c1260000-0000-0000-0000-00000000000a', 'c1261000-0000-0000-0000-000000000001', true),
  ('c1260000-0000-0000-0000-00000000000b', 'c1261000-0000-0000-0000-000000000002', true);

-- ============================================================================
-- 1. Defaults
-- ============================================================================
select is(
  (select max_weekly_hours from workforce.schedule_settings where location_id = 'c1261000-0000-0000-0000-000000000001'),
  40, 'max_weekly_hours defaults to 40 (労働基準法 statutory weekly limit)');
select is(
  (select max_days_per_week from workforce.schedule_settings where location_id = 'c1261000-0000-0000-0000-000000000001'),
  5, 'max_days_per_week defaults to 5');
select col_not_null('workforce', 'schedule_settings', 'max_weekly_hours', 'max_weekly_hours is NOT NULL');
select col_not_null('workforce', 'schedule_settings', 'max_days_per_week', 'max_days_per_week is NOT NULL');

-- ============================================================================
-- 2. CHECK bounds
-- ============================================================================
select throws_ok(
  $q$update workforce.schedule_settings set max_weekly_hours = 0 where location_id = 'c1261000-0000-0000-0000-000000000001'$q$,
  '23514', null, 'max_weekly_hours = 0 is rejected');
select throws_ok(
  $q$update workforce.schedule_settings set max_weekly_hours = 169 where location_id = 'c1261000-0000-0000-0000-000000000001'$q$,
  '23514', null, 'max_weekly_hours = 169 is rejected');
select throws_ok(
  $q$update workforce.schedule_settings set max_days_per_week = 0 where location_id = 'c1261000-0000-0000-0000-000000000001'$q$,
  '23514', null, 'max_days_per_week = 0 is rejected');
select throws_ok(
  $q$update workforce.schedule_settings set max_days_per_week = 8 where location_id = 'c1261000-0000-0000-0000-000000000001'$q$,
  '23514', null, 'max_days_per_week = 8 is rejected');
select lives_ok(
  $q$update workforce.schedule_settings set max_weekly_hours = 168, max_days_per_week = 7 where location_id = 'c1261000-0000-0000-0000-000000000001'$q$,
  'upper bounds 168 h / 7 days are accepted');
select lives_ok(
  $q$update workforce.schedule_settings set max_weekly_hours = 1, max_days_per_week = 1 where location_id = 'c1261000-0000-0000-0000-000000000001'$q$,
  'lower bounds 1 h / 1 day are accepted');

-- ============================================================================
-- 3. api view
-- ============================================================================
select has_column('api', 'workforce_schedule_settings', 'max_weekly_hours', 'api view exposes max_weekly_hours');
select has_column('api', 'workforce_schedule_settings', 'max_days_per_week', 'api view exposes max_days_per_week');
select ok(
  not has_table_privilege('anon', 'api.workforce_schedule_settings', 'select'),
  'anon still has no SELECT on api.workforce_schedule_settings');

-- Manager A writes through the view (same path as the Settings autosave).
select is(
  pg_temp.as_auth_count('c1269000-0000-0000-0000-000000000001',
    $q$with u as (
         update api.workforce_schedule_settings set max_weekly_hours = 32, max_days_per_week = 4
          where tenant_id = 'c1260000-0000-0000-0000-00000000000a' returning 1)
       select count(*)::int from u$q$),
  1, 'an authorized Manager updates both limits through the api view');
select is(
  pg_temp.as_auth_count('c1269000-0000-0000-0000-000000000001',
    $q$select count(*)::int from api.workforce_schedule_settings
        where tenant_id = 'c1260000-0000-0000-0000-00000000000a' and max_weekly_hours = 32 and max_days_per_week = 4$q$),
  1, 'the Manager reads the written limits back through the api view');
select is(
  pg_temp.as_auth_count('c1269000-0000-0000-0000-000000000001',
    $q$select count(*)::int from api.workforce_schedule_settings where tenant_id = 'c1260000-0000-0000-0000-00000000000b'$q$),
  0, 'tenant isolation: Manager A does not see tenant B settings');
select is(
  pg_temp.as_role_sqlstate('authenticated', 'c1269000-0000-0000-0000-000000000001',
    $q$update api.workforce_schedule_settings set max_days_per_week = 9 where tenant_id = 'c1260000-0000-0000-0000-00000000000a'$q$),
  '23514', 'the CHECK bound also applies to writes through the api view');

-- ============================================================================
-- 4. Candidates return the limits
-- ============================================================================
select is(
  (select max_weekly_hours::text || '/' || max_days_per_week::text from workforce.auto_schedule_candidates()
    where location_id = 'c1261000-0000-0000-0000-000000000001'),
  '32/4', 'workforce.auto_schedule_candidates() returns max_weekly_hours / max_days_per_week');
select is(
  (select max_weekly_hours::text || '/' || max_days_per_week::text from workforce.auto_schedule_candidates()
    where location_id = 'c1261000-0000-0000-0000-000000000002'),
  '40/5', 'candidates carry the defaults for an untouched location');
select is(
  pg_temp.as_service_text($q$select max_weekly_hours::text || '/' || max_days_per_week::text
    from api.auto_schedule_candidates() where location_id = 'c1261000-0000-0000-0000-000000000001'$q$),
  '32/4', 'service_role reads the limits through the api passthrough');

-- ============================================================================
-- 5. Security posture of the recreated candidates functions
-- ============================================================================
select ok(
  not has_function_privilege('anon', 'workforce.auto_schedule_candidates()', 'execute')
  and not has_function_privilege('authenticated', 'workforce.auto_schedule_candidates()', 'execute')
  and not has_function_privilege('anon', 'api.auto_schedule_candidates()', 'execute')
  and not has_function_privilege('authenticated', 'api.auto_schedule_candidates()', 'execute'),
  'anon / authenticated cannot execute either candidates function');
select ok(
  has_function_privilege('service_role', 'workforce.auto_schedule_candidates()', 'execute')
  and has_function_privilege('service_role', 'api.auto_schedule_candidates()', 'execute'),
  'service_role can execute both candidates functions');
select is(
  pg_temp.as_role_sqlstate('authenticated', 'c1269000-0000-0000-0000-000000000001',
    $q$select * from api.auto_schedule_candidates()$q$),
  '42501', 'a Manager (authenticated) gets 42501 calling api.auto_schedule_candidates');
select is(
  pg_temp.as_role_sqlstate('anon', null, $q$select * from workforce.auto_schedule_candidates()$q$),
  '42501', 'anon gets 42501 calling workforce.auto_schedule_candidates');
select ok(
  (select p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'workforce' and p.proname = 'auto_schedule_candidates'),
  'workforce.auto_schedule_candidates is SECURITY DEFINER with a fixed search_path');
select ok(
  (select not p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'auto_schedule_candidates'),
  'ADR 0008: api.auto_schedule_candidates is not SECURITY DEFINER');

select * from finish();
rollback;
