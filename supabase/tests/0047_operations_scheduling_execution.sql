-- ============================================================================
-- DB test: Operations scheduling & execution slice (migration
-- 0101_operations_scheduling_execution.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   RECURRENCE  — daily / weekday match / non-match / effective range /
--                 before vs after window / missed-without-instance /
--                 schedule disabled / template disabled / historical
--                 expectation after a schedule edit / cross-midnight
--                 business_date (timezone)
--   EXECUTION   — lazy instance materialisation, idempotent (no duplicate);
--                 response-type validation; required-item completion gate;
--                 numeric threshold -> exception + D4 severity;
--                 exception lifecycle independent of task completion;
--                 completed responses immutable
--   SECURITY    — module OFF blocks the expected-task view AND the write RPCs;
--                 missing tenant_modules row fail-closed; cross-tenant and
--                 cross-location rejected; read-without-execute cannot write;
--                 employee cannot resolve exceptions; anon denied
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, ai;

select no_plan();

-- --- Fixtures -----------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('0a110000-0000-0000-0000-000000000000', 'pgtap-ops2-tenant-a', 'pgTAP Ops2 Tenant A'),
  ('0b220000-0000-0000-0000-000000000000', 'pgtap-ops2-tenant-b', 'pgTAP Ops2 Tenant B'),
  ('0c330000-0000-0000-0000-000000000000', 'pgtap-ops2-tenant-c', 'pgTAP Ops2 Tenant C (no module row)');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0a110000-0000-0000-0000-000000000000', 'operations', true),
  ('0b220000-0000-0000-0000-000000000000', 'operations', true);

insert into core.locations (id, tenant_id, name, timezone) values
  ('0a100000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', 'A / L1', 'Asia/Tokyo'),
  ('0a100000-0000-0000-0000-000000000002', '0a110000-0000-0000-0000-000000000000', 'A / L2', 'Asia/Tokyo'),
  ('0b100000-0000-0000-0000-000000000001', '0b220000-0000-0000-0000-000000000000', 'B / L1', 'Asia/Tokyo'),
  ('0c100000-0000-0000-0000-000000000001', '0c330000-0000-0000-0000-000000000000', 'C / L1', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('0a900000-0000-0000-0000-00000000000a', 'A Manager tenant-wide'),
  ('0a900000-0000-0000-0000-00000000000b', 'A Manager L1 only'),
  ('0a900000-0000-0000-0000-00000000000c', 'A Employee L1'),
  ('0a900000-0000-0000-0000-00000000000d', 'A Client L1 (no ops perm)'),
  ('0aff0000-0000-0000-0000-0000000000ff', 'Non-member'),
  ('0b900000-0000-0000-0000-00000000000a', 'B Manager tenant-wide');

-- manager=...005  employee=...006  client=...007
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null),
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', '0a100000-0000-0000-0000-000000000001'),
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000006', '0a100000-0000-0000-0000-000000000001'),
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000007', '0a100000-0000-0000-0000-000000000001'),
  ('0b220000-0000-0000-0000-000000000000', '0b900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null);

-- Templates (superuser fixture insert — bypasses RLS)
insert into operations.checklist_templates (id, tenant_id, location_id, name, category, is_active) values
  ('0a1e0000-0000-0000-0000-0000000000a1', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', 'A L1 opening',  'Opening', true),
  ('0a1e0000-0000-0000-0000-0000000000a2', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000002', 'A L2 opening',  'Opening', true),
  ('0a1e0000-0000-0000-0000-0000000000a3', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', 'A L1 disabled', 'Cleaning', false);

insert into operations.checklist_items (id, tenant_id, template_id, label, response_type, is_critical, is_required, numeric_min, numeric_max, numeric_unit, sort_order) values
  ('0a170000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', '0a1e0000-0000-0000-0000-0000000000a1', 'Fridge temp',   'numeric', true,  true, 1, 5, 'C', 1),
  ('0a170000-0000-0000-0000-000000000002', '0a110000-0000-0000-0000-000000000000', '0a1e0000-0000-0000-0000-0000000000a1', 'Floor mopped',  'boolean', false, true, null, null, null, 2),
  ('0a170000-0000-0000-0000-000000000003', '0a110000-0000-0000-0000-000000000000', '0a1e0000-0000-0000-0000-0000000000a1', 'Optional note', 'text',    false, false, null, null, null, 3);

-- Schedules
--  S_daily_past : daily, due 00:00, effective 20d ago  -> past dates are OVERDUE, today overdue-ish
--  S_daily_future : daily, due 23:59, effective today   -> today NOT_STARTED (before close)
--  S_weekday    : only the isodow of (current_date + 3), effective today
--  S_retired    : daily, retired (effective_to in the past) -> no future tasks
--  S_tmpl_off   : daily on the disabled template
--  S_l2         : daily on L2
--  S_closing    : cross-midnight, due 23:00 window_end 02:00
-- (effective_to + schedule_group_id added to the column list: the 0102
--  retired-has-end CHECK, and schedule_group_id = id so tests can address a
--  logical schedule by a stable literal.)
insert into operations.task_schedules
  (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, weekdays, due_time, window_end_time, effective_from, effective_to, is_active) values
  ('05c00000-0000-0000-0000-0000000000d1', '05c00000-0000-0000-0000-0000000000d1', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '0a1e0000-0000-0000-0000-0000000000a1', 'daily', null, '00:00', null, current_date - 20, null, true),
  ('05c00000-0000-0000-0000-0000000000d2', '05c00000-0000-0000-0000-0000000000d2', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '0a1e0000-0000-0000-0000-0000000000a1', 'daily', null, '23:59', null, current_date, null, true),
  ('05c00000-0000-0000-0000-0000000000d3', '05c00000-0000-0000-0000-0000000000d3', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '0a1e0000-0000-0000-0000-0000000000a1', 'weekdays', array[extract(isodow from current_date + 3)::smallint], '08:00', '10:00', current_date, null, true),
  ('05c00000-0000-0000-0000-0000000000d4', '05c00000-0000-0000-0000-0000000000d4', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '0a1e0000-0000-0000-0000-0000000000a1', 'daily', null, '08:00', null, current_date - 5, current_date - 5, false),
  ('05c00000-0000-0000-0000-0000000000d5', '05c00000-0000-0000-0000-0000000000d5', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '0a1e0000-0000-0000-0000-0000000000a3', 'daily', null, '08:00', null, current_date - 5, null, true),
  ('05c00000-0000-0000-0000-0000000000d6', '05c00000-0000-0000-0000-0000000000d6', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000002', '0a1e0000-0000-0000-0000-0000000000a2', 'daily', null, '08:00', null, current_date - 5, null, true),
  ('05c00000-0000-0000-0000-0000000000d7', '05c00000-0000-0000-0000-0000000000d7', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '0a1e0000-0000-0000-0000-0000000000a1', 'daily', null, '23:00', '02:00', current_date - 5, null, true);

-- --- Role-hop helpers ---------------------------------------------------
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

create function pg_temp.as_auth_do(p_sub text, p_sql text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
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
exception when others then
  reset role;
  return true;
end;
$$;

create function pg_temp.as_role_throws(p_role text, p_sql text)
returns boolean language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  return false;
exception when others then
  reset role;
  return true;
end;
$$;

-- ============================================================================
-- RECURRENCE
-- ============================================================================

-- daily schedule is expected today
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date, current_date)
       where schedule_id = '05c00000-0000-0000-0000-0000000000d2' and business_date = current_date $$),
  1, 'recurrence: daily schedule produces exactly one expected task for today');

-- daily schedule is expected on a past date, with NO instance, state = overdue
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 10, current_date - 10)
       where schedule_id = '05c00000-0000-0000-0000-0000000000d1'
         and business_date = current_date - 10 and instance_id is null and state = 'overdue' $$),
  1, 'recurrence: missed daily task 10 days ago is expected + overdue with no instance row');

-- weekday schedule: present on the matching weekday, absent the next day
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date + 3, current_date + 3)
       where schedule_id = '05c00000-0000-0000-0000-0000000000d3' $$),
  1, 'recurrence: weekday schedule is expected on its matching ISO weekday');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date + 4, current_date + 4)
       where schedule_id = '05c00000-0000-0000-0000-0000000000d3'
         and extract(isodow from current_date + 4) <> extract(isodow from current_date + 3) $$),
  0, 'recurrence: weekday schedule is absent on a non-matching weekday');

-- before window (today, due 23:59) -> not_started; after window (past, due 00:00) -> overdue
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date, current_date)
       where schedule_id = '05c00000-0000-0000-0000-0000000000d2' and state = 'not_started' $$),
  1, 'recurrence: task whose window has not closed yet is not_started');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 1, current_date - 1)
       where schedule_id = '05c00000-0000-0000-0000-0000000000d1' and state = 'overdue' $$),
  1, 'recurrence: task whose window has closed with no completion is overdue');

-- retired schedule (effective_to in the past) -> no expected tasks after the boundary
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 3, current_date)
       where schedule_id = '05c00000-0000-0000-0000-0000000000d4' $$),
  0, 'recurrence: a retired schedule (past effective_to) produces no expected tasks after its boundary');

-- disabled template -> its schedule produces no expected tasks
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 3, current_date)
       where schedule_id = '05c00000-0000-0000-0000-0000000000d5' $$),
  0, 'recurrence: a schedule on an is_active=false template produces no expected tasks');

-- horizon clamp: a caller asking for a huge past range gets nothing older than current_date - 31
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 3650, current_date)
       where schedule_id = '05c00000-0000-0000-0000-0000000000d1'
         and business_date < current_date - 31 $$),
  0, 'recurrence: horizon is clamped inside the function — no rows older than current_date - 31');

-- ============================================================================
-- TIMEZONE / cross-midnight business_date
-- ============================================================================
-- Closing schedule due 23:00, window_end 02:00 (Asia/Tokyo). A moment at
-- 01:30 JST belongs to the day the window OPENED (previous calendar day).
select is(
  operations.schedule_business_date(
    '0a110000-0000-0000-0000-000000000000', '05c00000-0000-0000-0000-0000000000d7',
    (current_date::text || ' 01:30 Asia/Tokyo')::timestamptz),
  current_date - 1,
  'timezone: 01:30 JST inside a 23:00->02:00 window is dated to the day the window opened');

select is(
  operations.schedule_business_date(
    '0a110000-0000-0000-0000-000000000000', '05c00000-0000-0000-0000-0000000000d7',
    (current_date::text || ' 23:30 Asia/Tokyo')::timestamptz),
  current_date,
  'timezone: 23:30 JST is dated to the current operational day');

-- ============================================================================
-- EXECUTION — lazy materialisation + idempotency
-- ============================================================================
select is(
  (select count(*)::int from operations.task_instances
    where schedule_id = '05c00000-0000-0000-0000-0000000000d2'),
  0, 'execution: no task_instance exists before any interaction');

select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_record_response(
             '0a110000-0000-0000-0000-000000000000',
             '05c00000-0000-0000-0000-0000000000d2',
             '0a170000-0000-0000-0000-000000000002', true, null, null) $q$) $$,
  'execution: employee records the first boolean response');

select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_record_response(
             '0a110000-0000-0000-0000-000000000000',
             '05c00000-0000-0000-0000-0000000000d2',
             '0a170000-0000-0000-0000-000000000001', null, 3, null) $q$) $$,
  'execution: employee records a second (numeric, in-range) response');

select is(
  (select count(*)::int from operations.task_instances
    where schedule_id = '05c00000-0000-0000-0000-0000000000d2'),
  1, 'execution: two responses produced exactly ONE task_instance (idempotent materialisation)');

select is(
  (select count(*)::int from operations.item_responses ir
     join operations.task_instances ti on ti.id = ir.instance_id
    where ti.schedule_id = '05c00000-0000-0000-0000-0000000000d2'),
  2, 'execution: both responses are stored');

-- in-range numeric response created no exception
select is(
  (select count(*)::int from operations.task_exceptions te
     join operations.task_instances ti on ti.id = te.instance_id
    where ti.schedule_id = '05c00000-0000-0000-0000-0000000000d2'),
  0, 'execution: an in-range numeric measurement creates no exception');

-- the materialised instance now shows in the expected-task view with state in_progress
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date, current_date)
       where schedule_id = '05c00000-0000-0000-0000-0000000000d2'
         and instance_id is not null and state = 'in_progress' $$),
  1, 'execution: the expected-task view reflects the in-progress instance');

-- ============================================================================
-- EXECUTION — response-type validation
-- ============================================================================
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000c',
    $$ select api.operations_record_response(
         '0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000d2',
         '0a170000-0000-0000-0000-000000000001', null, null, 'not a number') $$),
  'execution: a numeric item rejects a text response (type mismatch)');

select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000c',
    $$ select api.operations_record_response(
         '0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000d2',
         '0a170000-0000-0000-0000-000000000002', true, 5, null) $$),
  'execution: providing two values at once is rejected');

-- ============================================================================
-- EXECUTION — numeric threshold -> exception + D4 severity
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_record_response(
             '0a110000-0000-0000-0000-000000000000',
             '05c00000-0000-0000-0000-0000000000d2',
             '0a170000-0000-0000-0000-000000000001', null, 42, null) $q$) $$,
  'execution: an out-of-range numeric measurement is still recorded (no raise)');

select is(
  (select response_numeric from operations.item_responses ir
     join operations.task_instances ti on ti.id = ir.instance_id
    where ti.schedule_id = '05c00000-0000-0000-0000-0000000000d2'
      and ir.item_id = '0a170000-0000-0000-0000-000000000001'),
  42::numeric, 'execution: the out-of-range value is the recorded fact (42)');

select is(
  (select severity from operations.task_exceptions te
     join operations.task_instances ti on ti.id = te.instance_id
    where ti.schedule_id = '05c00000-0000-0000-0000-0000000000d2' and te.source = 'threshold'),
  'action_required',
  'execution: threshold breach on a CRITICAL item opens an action_required exception (D4)');

-- re-recording another out-of-range value does not stack a second open threshold exception
select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_record_response(
             '0a110000-0000-0000-0000-000000000000',
             '05c00000-0000-0000-0000-0000000000d2',
             '0a170000-0000-0000-0000-000000000001', null, 99, null) $q$) $$,
  'execution: re-recording another breach value succeeds');

select is(
  (select count(*)::int from operations.task_exceptions te
     join operations.task_instances ti on ti.id = te.instance_id
    where ti.schedule_id = '05c00000-0000-0000-0000-0000000000d2' and te.source = 'threshold' and te.status = 'open'),
  1, 'execution: still exactly one OPEN threshold exception after a second breach');

-- ============================================================================
-- EXECUTION — completion gate
-- ============================================================================
-- required item 0a17...0002 answered, 0a17...0001 answered (out of range but answered),
-- 0a17...0003 is NOT required -> completion should now succeed
select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_complete_task(
             '0a110000-0000-0000-0000-000000000000',
             '05c00000-0000-0000-0000-0000000000d2') $q$) $$,
  'execution: task completes once all active+required items have a response');

select is(
  (select status::text from operations.task_instances
    where schedule_id = '05c00000-0000-0000-0000-0000000000d2'),
  'completed', 'execution: instance status is completed');

-- open exception did NOT block completion (scope §12)
select is(
  (select count(*)::int from operations.task_exceptions te
     join operations.task_instances ti on ti.id = te.instance_id
    where ti.schedule_id = '05c00000-0000-0000-0000-0000000000d2' and te.status = 'open'),
  1, 'execution: a still-open exception did not block task completion');

-- completed responses are immutable
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000c',
    $$ select api.operations_record_response(
         '0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000d2',
         '0a170000-0000-0000-0000-000000000002', false, null, null) $$),
  'execution: cannot record/modify a response after the task is completed');

-- data-level backstop: a direct INSERT of a new response into a completed
-- instance is rejected by the guard trigger (F1)
select throws_ok(
  $$ insert into operations.item_responses (tenant_id, location_id, instance_id, item_id, response_text, recorded_by)
     select ti.tenant_id, ti.location_id, ti.id, '0a170000-0000-0000-0000-000000000003', 'late', '0a900000-0000-0000-0000-00000000000c'
     from operations.task_instances ti where ti.schedule_id = '05c00000-0000-0000-0000-0000000000d2' $$,
  'P0001', 'operations_response_immutable_after_completion',
  'immutability: a direct INSERT into a completed instance is blocked by the guard trigger');

-- data-level backstop: a task_exception whose location_id != its instance's is
-- rejected by the guard trigger (F2)
select throws_ok(
  $$ insert into operations.task_exceptions (tenant_id, location_id, instance_id, severity, source, note)
     select ti.tenant_id, '0a100000-0000-0000-0000-000000000002', ti.id, 'warning', 'reported', 'x'
     from operations.task_instances ti where ti.schedule_id = '05c00000-0000-0000-0000-0000000000d2' $$,
  'P0001', 'operations_exception_location_mismatch',
  'integrity: a task_exception whose location_id differs from its instance is rejected');

-- second completion attempt rejected
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000c',
    $$ select api.operations_complete_task(
         '0a110000-0000-0000-0000-000000000000', '05c00000-0000-0000-0000-0000000000d2') $$),
  'execution: a completed task cannot be completed again');

-- completion blocked when a required item is unanswered (fresh schedule d1)
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000c',
    $$ with x as (
         select api.operations_record_response(
           '0a110000-0000-0000-0000-000000000000',
           '05c00000-0000-0000-0000-0000000000d1',
           '0a170000-0000-0000-0000-000000000002', true, null, null)
       )
       select api.operations_complete_task(
         '0a110000-0000-0000-0000-000000000000', '05c00000-0000-0000-0000-0000000000d1') from x $$),
  'execution: completion is blocked while a required item has no response');

-- ============================================================================
-- EXECUTION — report a problem + resolve
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_report_problem(
             '0a110000-0000-0000-0000-000000000000',
             '05c00000-0000-0000-0000-0000000000d3', null, 'door broken', 'warning') $q$) $$,
  'execution: staff reports an instance-level problem (L1 schedule)');

select is(
  (select count(*)::int from operations.task_exceptions where source = 'reported' and status = 'open'),
  1, 'execution: the reported problem is an open exception');

-- employee cannot resolve
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000c',
    $$ select api.operations_resolve_exception('0a110000-0000-0000-0000-000000000000',
         (select id from operations.task_exceptions where source = 'reported' limit 1), 'fixed') $$),
  'permission: an employee cannot resolve an exception (lacks operations.exception.resolve)');

-- manager resolves
select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000a',
       $q$ select api.operations_resolve_exception('0a110000-0000-0000-0000-000000000000',
             (select id from operations.task_exceptions where source = 'reported' limit 1), 'fixed') $q$) $$,
  'permission: a manager resolves the reported exception');

select is(
  (select status::text from operations.task_exceptions where source = 'reported'),
  'resolved', 'execution: the exception transitions to resolved');

-- ============================================================================
-- HISTORICAL EXPECTATION AFTER A SCHEDULE EDIT
-- ============================================================================
-- schedule d3 has a materialised instance (via the reported problem above) for
-- today. Revising it (weekday that matches NEITHER today NOR tomorrow) must
-- create a NEW version from tomorrow and NOT touch today's already-materialised
-- occurrence.

-- a raw retroactive UPDATE of a started version's recurrence is blocked outright
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000a',
    $$ update operations.task_schedules set recurrence_kind = 'daily', weekdays = null
       where id = '05c00000-0000-0000-0000-0000000000d3' $$),
  'history: a raw retroactive recurrence UPDATE of a started version is blocked by the guard trigger');

-- the safe path: revise -> new version from next business date
select lives_ok(
  $$ select pg_temp.as_auth_do('0a900000-0000-0000-0000-00000000000a',
       $q$ select api.operations_revise_schedule(
             '0a110000-0000-0000-0000-000000000000',
             '05c00000-0000-0000-0000-0000000000d3',
             'weekdays',
             array(select x::smallint from generate_series(1,7) x
                   where x not in (extract(isodow from current_date)::int,
                                   extract(isodow from current_date + 1)::int)),
             '08:00', '10:00', null) $q$) $$,
  'history: manager revises the schedule via api.operations_revise_schedule');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date, current_date)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000d3' and instance_id is not null $$),
  1, 'history: today''s already-materialised occurrence still appears after the revision');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date, current_date)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000d3' $$),
  1, 'history: no duplicate expected occurrence across schedule versions on the boundary day');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date + 1, current_date + 1)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000d3' $$),
  0, 'history: the day after the revision uses the new (non-matching) recurrence — not expected');

-- ============================================================================
-- SECURITY — module OFF
-- ============================================================================
update core.tenant_modules set is_enabled = false
  where tenant_id = '0a110000-0000-0000-0000-000000000000' and module = 'operations';

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 10, current_date + 10) $$),
  0, 'module OFF: the expected-task view returns zero rows');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_task_instances $$),
  0, 'module OFF: api.operations_task_instances returns zero rows');

select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000c',
    $$ select api.operations_record_response('0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000d1', '0a170000-0000-0000-0000-000000000002', true, null, null) $$),
  'module OFF: api.operations_record_response raises');

select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000a',
    $$ select api.operations_resolve_exception('0a110000-0000-0000-0000-000000000000',
         (select id from operations.task_exceptions where source = 'threshold' limit 1), 'x') $$),
  'module OFF: api.operations_resolve_exception raises');

-- data preserved (superuser read)
select is(
  (select count(*)::int from operations.task_instances where tenant_id = '0a110000-0000-0000-0000-000000000000'),
  2, 'module OFF: the pre-existing task_instances still exist in storage — hidden, not deleted');

update core.tenant_modules set is_enabled = true
  where tenant_id = '0a110000-0000-0000-0000-000000000000' and module = 'operations';

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_task_instances where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  2, 'module ON again: all instances visible again, unchanged');

-- ============================================================================
-- SECURITY — cross-tenant / cross-location / fail-closed / anon
-- ============================================================================
-- B manager cannot see tenant-A schedules or drive tenant-A RPCs
select is(
  pg_temp.as_auth_count('0b900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 10, current_date + 10)
       where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  0, 'tenant isolation: B manager sees zero tenant-A expected tasks');

select ok(
  pg_temp.as_auth_throws('0b900000-0000-0000-0000-00000000000a',
    $$ select api.operations_record_response('0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000d1', '0a170000-0000-0000-0000-000000000002', true, null, null) $$),
  'tenant isolation: B manager cannot record a response against a tenant-A schedule');

-- A manager scoped to L1 only cannot operate an L2 schedule
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000b',
    $$ select api.operations_record_response('0a110000-0000-0000-0000-000000000000',
         '05c00000-0000-0000-0000-0000000000d6', '0a170000-0000-0000-0000-000000000001', null, 3, null) $$),
  'location isolation: an L1-scoped manager cannot record a response on an L2 schedule');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000b',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 10, current_date + 10)
       where location_id = '0a100000-0000-0000-0000-000000000002' $$),
  0, 'location isolation: an L1-scoped manager sees no L2 expected tasks');

-- client with no operations permission sees nothing / cannot write
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000d',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 10, current_date + 10) $$),
  0, 'permission: a tenant member with no operations permission sees zero expected tasks');

-- tenant C: no tenant_modules row at all -> fail closed
insert into core.users (id, display_name) values ('0c900000-0000-0000-0000-00000000000a', 'C Manager');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0c330000-0000-0000-0000-000000000000', '0c900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null);
insert into operations.checklist_templates (id, tenant_id, location_id, name)
  values ('0c3e0000-0000-0000-0000-0000000000c1', '0c330000-0000-0000-0000-000000000000', '0c100000-0000-0000-0000-000000000001', 'C tmpl');
insert into operations.task_schedules (id, tenant_id, location_id, template_id, recurrence_kind, due_time, effective_from)
  values ('05c00000-0000-0000-0000-0000000000c1', '0c330000-0000-0000-0000-000000000000', '0c100000-0000-0000-0000-000000000001', '0c3e0000-0000-0000-0000-0000000000c1', 'daily', '08:00', current_date - 2);

select is(
  pg_temp.as_auth_count('0c900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 5, current_date) $$),
  0, 'fail-closed: tenant C (no operations tenant_modules row) sees zero expected tasks');

-- anon denied everywhere
select ok(pg_temp.as_role_throws('anon', $$ select count(*) from api.operations_expected_tasks(current_date, current_date) $$),
  'anon: denied on api.operations_expected_tasks');
select ok(pg_temp.as_role_throws('anon', $$ select count(*) from api.operations_task_instances $$),
  'anon: denied on api.operations_task_instances');
select ok(pg_temp.as_role_throws('anon', $$ select count(*) from operations.task_schedules $$),
  'anon: denied on the operations.task_schedules base table');

select * from finish();
rollback;
