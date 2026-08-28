-- ============================================================================
-- DB test: Operations historical-expectation integrity / schedule versioning
-- (migration 0102_operations_schedule_versioning.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Reproduces the confirmed defect and proves the fix:
--   a Manager configuration change today must NOT erase or rewrite a past
--   operational obligation that existed then, even when no task_instance was
--   ever materialised.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, ai;

select no_plan();

-- --- Fixtures ----------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('0a110000-0000-0000-0000-000000000000', 'pgtap-ops3-a', 'pgTAP Ops3 A'),
  ('0b220000-0000-0000-0000-000000000000', 'pgtap-ops3-b', 'pgTAP Ops3 B');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0a110000-0000-0000-0000-000000000000', 'operations', true),
  ('0b220000-0000-0000-0000-000000000000', 'operations', true);

insert into core.locations (id, tenant_id, name, timezone) values
  ('0a100000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', 'A/L1', 'Asia/Tokyo'),
  ('0a100000-0000-0000-0000-000000000002', '0a110000-0000-0000-0000-000000000000', 'A/L2', 'Asia/Tokyo'),
  ('0b100000-0000-0000-0000-000000000001', '0b220000-0000-0000-0000-000000000000', 'B/L1', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('0a900000-0000-0000-0000-00000000000a', 'A Manager tenant-wide'),
  ('0a900000-0000-0000-0000-00000000000b', 'A Manager L1 only'),
  ('0a900000-0000-0000-0000-00000000000c', 'A Employee L1'),
  ('0b900000-0000-0000-0000-00000000000a', 'B Manager tenant-wide');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null),
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', '0a100000-0000-0000-0000-000000000001'),
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000006', '0a100000-0000-0000-0000-000000000001'),
  ('0b220000-0000-0000-0000-000000000000', '0b900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null);

insert into operations.checklist_templates (id, tenant_id, location_id, name) values
  ('0a1e0000-0000-0000-0000-0000000000a1', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', 'A/L1 opening'),
  ('0a1e0000-0000-0000-0000-0000000000a2', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000002', 'A/L2 opening');

insert into operations.checklist_items (id, tenant_id, template_id, label, response_type, is_critical, is_required, numeric_min, numeric_max, numeric_unit) values
  ('0a170000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', '0a1e0000-0000-0000-0000-0000000000a1', 'Fridge temp', 'numeric', true, true, 1, 5, 'C');

-- S1 (A/L1): DAILY, window 09:00-10:00, effective 10 days ago. schedule_group_id = id.
-- S2 (A/L1): DAILY, effective 10 days ago — used for the deactivation test.
-- S3 (A/L2): DAILY, effective 10 days ago — used for the cross-location test.
insert into operations.task_schedules
  (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, due_time, window_end_time, effective_from) values
  ('05c00000-0000-0000-0000-0000000000f1', '05c00000-0000-0000-0000-0000000000f1', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '0a1e0000-0000-0000-0000-0000000000a1', 'daily', '09:00', '10:00', current_date - 10),
  ('05c00000-0000-0000-0000-0000000000f2', '05c00000-0000-0000-0000-0000000000f2', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '0a1e0000-0000-0000-0000-0000000000a1', 'daily', '09:00', '10:00', current_date - 10),
  ('05c00000-0000-0000-0000-0000000000f3', '05c00000-0000-0000-0000-0000000000f3', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000002', '0a1e0000-0000-0000-0000-0000000000a2', 'daily', '09:00', '10:00', current_date - 10);

-- a materialised instance on S1 for 3 days ago (superuser fixture)
insert into operations.task_instances
  (id, tenant_id, location_id, schedule_id, template_id, business_date, status, started_by)
values
  ('a5100000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001',
   '05c00000-0000-0000-0000-0000000000f1', '0a1e0000-0000-0000-0000-0000000000a1', current_date - 3, 'in_progress',
   '0a900000-0000-0000-0000-00000000000c');

-- --- helpers ---------------------------------------------------------
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

create function pg_temp.as_auth_do(p_sub text, p_sql text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

create function pg_temp.as_auth_throws(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return false;
exception when others then
  reset role;
  return true;
end $$;

-- ============================================================================
-- BASELINE: S1 daily => a past date with no instance is expected + overdue
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 5, current_date - 5)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1'
         and state = 'overdue' and instance_id is null $$),
  1, 'baseline: S1 (daily) — 5 days ago is expected + overdue, no instance');

-- ============================================================================
-- TEST 1 + 4 — Manager revises recurrence today; a past obligation with no
-- instance MUST remain expected/overdue.
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000a',
       $q$ select api.operations_revise_schedule(
             '0a110000-0000-0000-0000-000000000000',
             '05c00000-0000-0000-0000-0000000000f1',
             'weekdays',
             array(select x::smallint from generate_series(1,7) x
                   where x not in (extract(isodow from current_date - 5)::int,
                                   extract(isodow from current_date + 1)::int)),
             '09:00', '10:00', null) $q$) $$,
  'revise: manager changes S1 from daily to a restricted weekday set');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 5, current_date - 5)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1'
         and state = 'overdue' and instance_id is null $$),
  1, 'TEST 1/4: 5 days ago is STILL expected + overdue after the recurrence change (no retroactive rewrite)');

-- ============================================================================
-- TEST 2 — future dates use the NEW recurrence
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date + 1, current_date + 1)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' $$),
  0, 'TEST 2: the day after the boundary follows the new (non-matching) weekday recurrence');

-- and a future date that DOES match the new weekday set is expected under the new version
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ with wd as (
         select unnest(weekdays)::int as d from operations.task_schedules
          where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' and effective_to is null
       ),
       day as (
         select min(g)::date as day from generate_series(current_date + 2, current_date + 9, interval '1 day') g
          where extract(isodow from g)::int in (select d from wd)
       )
       select count(*)::int from api.operations_expected_tasks((select day from day), (select day from day))
        where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' $$),
  1, 'TEST 2b: a future date matching the new weekday set IS expected under the new version');

-- ============================================================================
-- TEST 5 — no duplicate expected occurrence across schedule versions
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from (
         select business_date from api.operations_expected_tasks(current_date - 8, current_date + 8)
          where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1'
          group by business_date having count(*) > 1
       ) dups $$),
  0, 'TEST 5: no business_date is emitted twice across the two schedule versions');

-- ============================================================================
-- TEST 6 — a materialised historical instance stays correctly associated
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 3, current_date - 3)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1'
         and instance_id = 'a5100000-0000-0000-0000-000000000001'
         and schedule_id = '05c00000-0000-0000-0000-0000000000f1' $$),
  1, 'TEST 6: the materialised instance from 3 days ago is still attached to the version that ran it');

-- ============================================================================
-- TEST 11 — cannot create an overlapping version
-- ============================================================================
-- a) the RPC refuses to revise a version that is already superseded
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000a',
    $$ select api.operations_revise_schedule('0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000f1', 'daily', null, '09:00', null, null) $$),
  'TEST 11a: revising an already-superseded version is rejected (operations_schedule_not_current_version)');

-- b) the EXCLUDE constraint refuses a hand-crafted overlapping version
select throws_ok(
  $$ insert into operations.task_schedules
       (tenant_id, location_id, template_id, schedule_group_id, recurrence_kind, due_time, effective_from, effective_to)
     values ('0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001',
             '0a1e0000-0000-0000-0000-0000000000a1', '05c00000-0000-0000-0000-0000000000f1',
             'daily', '09:00', current_date - 4, current_date + 4) $$,
  '23P01');

-- ============================================================================
-- TEST 3 — deactivation preserves the past, stops the future
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000a',
       $q$ select api.operations_deactivate_schedule(
             '0a110000-0000-0000-0000-000000000000', '05c00000-0000-0000-0000-0000000000f2') $q$) $$,
  'deactivate: manager retires S2 today');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 4, current_date - 4)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f2'
         and state = 'overdue' $$),
  1, 'TEST 3: a past expected occurrence on the retired schedule REMAINS (expected + overdue)');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date + 1, current_date + 5)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f2' $$),
  0, 'TEST 3b: future occurrences on the retired schedule stop after the boundary');

-- retroactive deactivation boundary is rejected
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000a',
    $$ select api.operations_deactivate_schedule('0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000f3', current_date - 2) $$),
  'deactivate: a retroactive effective_to boundary is rejected');

-- ============================================================================
-- TEST 9 / 10 — cross-tenant and cross-location attacks on the write RPCs
-- ============================================================================
select ok(
  pg_temp.as_auth_throws('0b900000-0000-0000-0000-00000000000a',
    $$ select api.operations_revise_schedule('0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000f3', 'daily', null, '09:00', null, null) $$),
  'TEST 9: tenant-B manager cannot revise a tenant-A schedule');

select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000b',
    $$ select api.operations_revise_schedule('0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000f3', 'daily', null, '09:00', null, null) $$),
  'TEST 10: an L1-scoped manager cannot revise an L2 schedule (operations_permission_denied)');

select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000b',
    $$ select api.operations_deactivate_schedule('0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000f3') $$),
  'TEST 10b: an L1-scoped manager cannot deactivate an L2 schedule');

-- ============================================================================
-- TEST 7 / 8 — module OFF hides historical occurrences; ON restores them
-- ============================================================================
update core.tenant_modules set is_enabled = false
  where tenant_id = '0a110000-0000-0000-0000-000000000000' and module = 'operations';

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 10, current_date + 10) $$),
  0, 'TEST 7: module OFF — no historical expected occurrences visible');

select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000a',
    $$ select api.operations_revise_schedule('0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000f3', 'daily', null, '09:00', null, null) $$),
  'TEST 7b: module OFF — the revise RPC is blocked');

-- data still present in storage (superuser read)
select is(
  (select count(*)::int from operations.task_schedules where tenant_id = '0a110000-0000-0000-0000-000000000000'),
  4, 'TEST 7c: module OFF — all schedule versions still exist in storage (2x f1 + f2 + f3)');

update core.tenant_modules set is_enabled = true
  where tenant_id = '0a110000-0000-0000-0000-000000000000' and module = 'operations';

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 5, current_date - 5)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' and state = 'overdue' $$),
  1, 'TEST 8: module ON again — the historical overdue occurrence is back, unchanged');

-- ============================================================================
-- TEST §20 — numeric threshold history: a later range change does not rewrite
-- a recorded violation.
-- ============================================================================
-- Employee L1 records an out-of-range measurement against the current S1
-- version (record_response does not check recurrence — it materialises for
-- today's business_date regardless), opening a threshold exception at max=5.
select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_record_response(
             '0a110000-0000-0000-0000-000000000000',
             (select id from operations.task_schedules
               where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' and effective_to is null),
             '0a170000-0000-0000-0000-000000000001', null, 7, null) $q$) $$,
  'threshold-history: employee records fridge temp = 7 (max is 5 -> violation)');

select is(
  (select count(*)::int from operations.task_exceptions
    where source = 'threshold' and status = 'open' and severity = 'action_required'),
  1, 'threshold-history: a threshold exception was opened at the time of recording');

-- Manager relaxes the threshold to max 10 today
update operations.checklist_items set numeric_max = 10
  where id = '0a170000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from operations.task_exceptions
    where source = 'threshold' and status = 'open'),
  1, 'threshold-history §20: yesterday''s recorded violation is STILL an open exception after the range is relaxed');

select is(
  (select response_numeric from operations.item_responses
    where item_id = '0a170000-0000-0000-0000-000000000001'
    order by recorded_at desc limit 1),
  7::numeric, 'threshold-history §20: the recorded measured value is unchanged (7)');

select * from finish();
rollback;
