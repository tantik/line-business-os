-- ============================================================================
-- DB test: Operations — persistent "critical scheduled check missed" exception
--          (migration 0116_operations_missed_critical.sql — WP1 G1 bounded fix)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Founder-required acceptance scenarios A–H + late-execution semantics:
--   A  non-critical overdue                 -> NO critical_missed row
--   B  critical task, window still open      -> NO critical_missed row
--   C  critical task completed               -> NO critical_missed row
--   D  critical task missed (window closed)  -> critical_missed / action_required,
--                                               in api.operations_open_exceptions,
--                                               counted by operations_expected_tasks,
--                                               is_overdue_critical = true, persists
--   E  repeated flag call                    -> no duplicate (historical uniqueness)
--   F  tenant + location isolation           -> tenant M sweep creates nothing in N;
--                                               an L1-only manager creates nothing for
--                                               an L2 miss; a direct writer call by a
--                                               non-holder creates nothing; the wrapper
--                                               rejects non-holders / non-members
--   G  existing threshold workflow           -> unbroken (instance-attached exception)
--   H  existing staff-reported workflow      -> unbroken (instance-attached exception)
--   LATE-RESPONSE   a first response after the miss  -> critical_missed stays OPEN
--   LATE-COMPLETION a completion after the miss      -> critical_missed AUTO-RESOLVED,
--                                                       never recreated by a re-sweep
--   RLS / guards    employee cannot resolve; anon cannot read the feed; a
--                   location_id mismatched against the schedule is rejected;
--                   an unattached exception is rejected; module OFF raises
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, ai;

select no_plan();

-- --- Fixtures ---------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('0d110000-0000-0000-0000-000000000000', 'pgtap-ops-missed-m', 'pgTAP Ops Missed M'),
  ('0e110000-0000-0000-0000-000000000000', 'pgtap-ops-missed-n', 'pgTAP Ops Missed N');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0d110000-0000-0000-0000-000000000000', 'operations', true),
  ('0e110000-0000-0000-0000-000000000000', 'operations', true);

insert into core.locations (id, tenant_id, name, timezone) values
  ('0d100000-0000-0000-0000-000000000001', '0d110000-0000-0000-0000-000000000000', 'M / L1', 'Asia/Tokyo'),
  ('0d100000-0000-0000-0000-000000000002', '0d110000-0000-0000-0000-000000000000', 'M / L2', 'Asia/Tokyo'),
  ('0e100000-0000-0000-0000-000000000001', '0e110000-0000-0000-0000-000000000000', 'N / L1', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('0d900000-0000-0000-0000-00000000000a', 'M Manager tenant-wide'),
  ('0d900000-0000-0000-0000-00000000000b', 'M Manager L1 only'),
  ('0d900000-0000-0000-0000-00000000000c', 'M Employee L1'),
  ('0dff0000-0000-0000-0000-0000000000ff', 'Non-member outsider'),
  ('0e900000-0000-0000-0000-00000000000a', 'N Manager tenant-wide');

-- manager = ...005 ; employee = ...006
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0d110000-0000-0000-0000-000000000000', '0d900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null),
  ('0d110000-0000-0000-0000-000000000000', '0d900000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', '0d100000-0000-0000-0000-000000000001'),
  ('0d110000-0000-0000-0000-000000000000', '0d900000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000006', '0d100000-0000-0000-0000-000000000001'),
  ('0e110000-0000-0000-0000-000000000000', '0e900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null);

-- Templates: a1 = critical, a2 = non-critical, a3 = critical on L2, N a1 = critical
insert into operations.checklist_templates (id, tenant_id, location_id, name, category, is_active) values
  ('0d1e0000-0000-0000-0000-0000000000a1', '0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000001', 'M L1 critical',     'Temperature', true),
  ('0d1e0000-0000-0000-0000-0000000000a2', '0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000001', 'M L1 non-critical', 'Cleaning',    true),
  ('0d1e0000-0000-0000-0000-0000000000a3', '0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000002', 'M L2 critical',     'Temperature', true),
  ('0e1e0000-0000-0000-0000-0000000000a1', '0e110000-0000-0000-0000-000000000000', '0e100000-0000-0000-0000-000000000001', 'N L1 critical',     'Temperature', true);

insert into operations.checklist_items (id, tenant_id, template_id, label, response_type, is_critical, is_required, numeric_min, numeric_max, numeric_unit, sort_order) values
  ('0d170000-0000-0000-0000-0000000000a1', '0d110000-0000-0000-0000-000000000000', '0d1e0000-0000-0000-0000-0000000000a1', 'Fridge temp',   'numeric', true,  true, 1, 5, 'C', 1),
  ('0d170000-0000-0000-0000-0000000000a2', '0d110000-0000-0000-0000-000000000000', '0d1e0000-0000-0000-0000-0000000000a1', 'Surfaces clean','boolean', false, true, null, null, null, 2),
  ('0d170000-0000-0000-0000-0000000000a3', '0d110000-0000-0000-0000-000000000000', '0d1e0000-0000-0000-0000-0000000000a2', 'Floor mopped',  'boolean', false, true, null, null, null, 1),
  ('0d170000-0000-0000-0000-0000000000a4', '0d110000-0000-0000-0000-000000000000', '0d1e0000-0000-0000-0000-0000000000a3', 'L2 fridge',     'numeric', true,  true, null, null, 'C', 1),
  ('0e170000-0000-0000-0000-0000000000a1', '0e110000-0000-0000-0000-000000000000', '0e1e0000-0000-0000-0000-0000000000a1', 'N fridge',      'numeric', true,  true, null, null, 'C', 1);

-- Schedules (all daily).
--   a1 S_crit_missed    : critical (template a1), due 00:00, eff -3  -> today + past windows closed
--   a2 S_noncrit_missed : non-critical (template a2), due 00:00, eff -3
--   a3 S_crit_open      : critical (template a1), due 23:59, eff today -> window still open; used for G/H
--   a4 S_crit_done      : critical (template a1), due 23:59, eff today -> we complete today's instance BEFORE any sweep
--   a5 S_l2_missed      : critical on L2 (template a3), due 00:00, eff -3
--   N a1 S_n_missed     : critical on tenant N/L1, due 00:00, eff -3
insert into operations.task_schedules
  (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, weekdays, due_time, window_end_time, effective_from, effective_to, is_active) values
  ('0d5c0000-0000-0000-0000-0000000000a1', '0d5c0000-0000-0000-0000-0000000000a1', '0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000001', '0d1e0000-0000-0000-0000-0000000000a1', 'daily', null, '00:00', null, current_date - 3, null, true),
  ('0d5c0000-0000-0000-0000-0000000000a2', '0d5c0000-0000-0000-0000-0000000000a2', '0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000001', '0d1e0000-0000-0000-0000-0000000000a2', 'daily', null, '00:00', null, current_date - 3, null, true),
  ('0d5c0000-0000-0000-0000-0000000000a3', '0d5c0000-0000-0000-0000-0000000000a3', '0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000001', '0d1e0000-0000-0000-0000-0000000000a1', 'daily', null, '23:59', null, current_date, null, true),
  ('0d5c0000-0000-0000-0000-0000000000a4', '0d5c0000-0000-0000-0000-0000000000a4', '0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000001', '0d1e0000-0000-0000-0000-0000000000a1', 'daily', null, '23:59', null, current_date, null, true),
  ('0d5c0000-0000-0000-0000-0000000000a5', '0d5c0000-0000-0000-0000-0000000000a5', '0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000002', '0d1e0000-0000-0000-0000-0000000000a3', 'daily', null, '00:00', null, current_date - 3, null, true),
  ('0e5c0000-0000-0000-0000-0000000000a1', '0e5c0000-0000-0000-0000-0000000000a1', '0e110000-0000-0000-0000-000000000000', '0e100000-0000-0000-0000-000000000001', '0e1e0000-0000-0000-0000-0000000000a1', 'daily', null, '00:00', null, current_date - 3, null, true);

-- --- Role-hop helpers (same shape as 0047) --------------------------------
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

create function pg_temp.sweep_m()
returns void language plpgsql as $$
begin
  perform pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000a',
    $q$ select api.operations_flag_missed_critical('0d110000-0000-0000-0000-000000000000', current_date - 7, current_date) $q$);
end;
$$;

-- ============================================================================
-- Baseline
-- ============================================================================
select is(
  (select count(*)::int from operations.task_exceptions where source = 'critical_missed'),
  0, 'baseline: no critical_missed exception exists before any sweep');

-- ============================================================================
-- C setup — complete a4 today BEFORE any sweep (so it can never be flagged)
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_record_response('0d110000-0000-0000-0000-000000000000',
             '0d5c0000-0000-0000-0000-0000000000a4', '0d170000-0000-0000-0000-0000000000a1', null, 3, null) $q$) $$,
  'C: employee records the numeric item on a4');
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_record_response('0d110000-0000-0000-0000-000000000000',
             '0d5c0000-0000-0000-0000-0000000000a4', '0d170000-0000-0000-0000-0000000000a2', true, null, null) $q$) $$,
  'C: employee records the boolean item on a4');
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_complete_task('0d110000-0000-0000-0000-000000000000',
             '0d5c0000-0000-0000-0000-0000000000a4') $q$) $$,
  'C: a4 completes');

-- ============================================================================
-- F (isolation, run FIRST) + D — the L1-only Manager sweep
--   The tenant-wide sweep would flag L2 too, so the L2 isolation check must
--   run before any tenant-wide sweep.
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000b',
       $q$ select api.operations_flag_missed_critical('0d110000-0000-0000-0000-000000000000', current_date - 7, current_date) $q$) $$,
  'F: the L1-only Manager Operations sweep runs without error');

select is(
  (select count(*)::int from operations.task_exceptions
    where schedule_id = '0d5c0000-0000-0000-0000-0000000000a5'),
  0, 'F: an L1-only Manager sweep does NOT flag the L2 missed critical task');

select is(
  (select count(*)::int from operations.task_exceptions
    where schedule_id = '0d5c0000-0000-0000-0000-0000000000a4'),
  0, 'C: a completed critical task never gets a critical_missed exception');

select is(
  (select count(*)::int from operations.task_exceptions
    where schedule_id = '0d5c0000-0000-0000-0000-0000000000a2'),
  0, 'A: a missed NON-critical task creates no exception');

select is(
  (select count(*)::int from operations.task_exceptions
    where schedule_id = '0d5c0000-0000-0000-0000-0000000000a3'),
  0, 'B: a critical task whose window has not closed yet creates no critical_missed');

-- D — the L1 critical miss IS flagged, action_required, instance-less, in the feed
select is(
  (select count(*)::int from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
      and business_date = current_date),
  1, 'D: a missed critical task produces exactly one critical_missed exception for today');

select is(
  (select severity from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
      and business_date = current_date),
  'action_required', 'D: the critical_missed exception is action_required (D4)');

select is(
  (select (instance_id is null and schedule_id is not null and business_date is not null)
     from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
      and business_date = current_date),
  true, 'D: the critical_missed exception is instance-less (schedule + business_date attached)');

select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_open_exceptions
       where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
         and business_date = current_date and instance_id is null $$),
  1, 'D: the missed critical task appears in the Manager Attention feed');

select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000a',
    $$ select open_exception_count from api.operations_expected_tasks(current_date, current_date)
       where schedule_id = '0d5c0000-0000-0000-0000-0000000000a1' and business_date = current_date $$),
  1, 'D: operations_expected_tasks counts the instance-less critical_missed exception');

select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000a',
    $$ select is_overdue_critical::int from api.operations_expected_tasks(current_date, current_date)
       where schedule_id = '0d5c0000-0000-0000-0000-0000000000a1' and business_date = current_date $$),
  1, 'D: operations_expected_tasks flags the missed critical task as is_overdue_critical');

select cmp_ok(
  (select count(*)::int from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'),
  '>=', 2, 'D: earlier closed days of the same schedule are each flagged once');

-- ============================================================================
-- E — repeated sweep does not duplicate (historical uniqueness)
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000b',
       $q$ select api.operations_flag_missed_critical('0d110000-0000-0000-0000-000000000000', current_date - 7, current_date) $q$) $$,
  'E: a further L1-only sweep runs');
select is(
  (select count(*)::int from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
      and business_date = current_date),
  1, 'E: repeated sweeps never create a second critical_missed for the same occurrence');

select ok(
  pg_temp.as_role_throws('postgres',
    $$ insert into operations.task_exceptions
         (tenant_id, location_id, instance_id, schedule_id, business_date, severity, source)
       values ('0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000001',
               null, '0d5c0000-0000-0000-0000-0000000000a1', current_date, 'action_required', 'critical_missed') $$),
  'E: a raw duplicate critical_missed INSERT for the same occurrence is rejected by the unique index');

-- ============================================================================
-- F (continued) — the tenant-wide Manager DOES flag L2; nothing leaks to tenant N
-- ============================================================================
select lives_ok($$ select pg_temp.sweep_m() $$, 'F: the tenant-wide Manager sweep runs');
select is(
  (select count(*)::int from operations.task_exceptions
    where schedule_id = '0d5c0000-0000-0000-0000-0000000000a5' and source = 'critical_missed'
      and business_date = current_date),
  1, 'F: the tenant-wide Manager DOES flag the L2 missed critical task');

select is(
  (select count(*)::int from operations.task_exceptions where tenant_id = '0e110000-0000-0000-0000-000000000000'),
  0, 'F: every tenant-M sweep so far created nothing in tenant N');

select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000c',
    $$ select operations.flag_missed_critical('0d110000-0000-0000-0000-000000000000', current_date - 7, current_date) $$),
  0, 'F: a direct writer call by an employee (no exception.resolve) materialises nothing');

select ok(
  pg_temp.as_auth_throws('0d900000-0000-0000-0000-00000000000c',
    $$ select api.operations_flag_missed_critical('0d110000-0000-0000-0000-000000000000', current_date - 7, current_date) $$),
  'F: the api wrapper rejects a caller without operations.exception.resolve');

select ok(
  pg_temp.as_auth_throws('0dff0000-0000-0000-0000-0000000000ff',
    $$ select api.operations_flag_missed_critical('0d110000-0000-0000-0000-000000000000', current_date - 7, current_date) $$),
  'F: the api wrapper rejects a non-member');

-- close_missed_critical_on_completion is SECURITY DEFINER + granted to
-- authenticated (api.operations_complete_task needs it) — it must self-authorise.
-- The N-tenant Manager has no task.execute in tenant M -> a direct call is a no-op.
select lives_ok(
  $$ select pg_temp.as_auth_do('0e900000-0000-0000-0000-00000000000a',
       $q$ select operations.close_missed_critical_on_completion(
             '0d110000-0000-0000-0000-000000000000', '0d5c0000-0000-0000-0000-0000000000a5', current_date) $q$) $$,
  'F: a cross-tenant direct call to close_missed_critical_on_completion does not error');
select is(
  (select status::text from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a5'
      and business_date = current_date),
  'open', 'F: ...and it resolves nothing (the L2 critical_missed stays OPEN)');
-- the M employee (task.execute at L1 only) also cannot close an L2 flag directly
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000c',
       $q$ select operations.close_missed_critical_on_completion(
             '0d110000-0000-0000-0000-000000000000', '0d5c0000-0000-0000-0000-0000000000a5', current_date) $q$) $$,
  'F: an L1-only employee direct call to close_missed_critical_on_completion does not error');
select is(
  (select status::text from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a5'
      and business_date = current_date),
  'open', 'F: ...and the L2 critical_missed still stays OPEN (no task.execute at L2)');

-- ============================================================================
-- LATE-RESPONSE — a first response after the miss does NOT resolve it
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_record_response('0d110000-0000-0000-0000-000000000000',
             '0d5c0000-0000-0000-0000-0000000000a1', '0d170000-0000-0000-0000-0000000000a2', true, null, null) $q$) $$,
  'LATE-RESPONSE: employee records one response on the missed critical task');
select lives_ok($$ select pg_temp.sweep_m() $$, 'LATE-RESPONSE: sweep runs after the late response');
select is(
  (select status::text from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
      and business_date = current_date),
  'open', 'LATE-RESPONSE: the critical_missed exception stays OPEN after a mere response');

-- ============================================================================
-- LATE-COMPLETION — completing the task later auto-resolves the flag
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_record_response('0d110000-0000-0000-0000-000000000000',
             '0d5c0000-0000-0000-0000-0000000000a1', '0d170000-0000-0000-0000-0000000000a1', null, 3, null) $q$) $$,
  'LATE-COMPLETION: employee records the remaining required item');
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_complete_task('0d110000-0000-0000-0000-000000000000',
             '0d5c0000-0000-0000-0000-0000000000a1') $q$) $$,
  'LATE-COMPLETION: the task completes late');
select is(
  (select status::text from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
      and business_date = current_date),
  'resolved', 'LATE-COMPLETION: a late completion auto-resolves the critical_missed exception');
select ok(
  (select resolution_note like '%late completion%' from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
      and business_date = current_date),
  'LATE-COMPLETION: the resolution note records the late-completion semantics');
select isnt(
  (select resolved_at from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
      and business_date = current_date),
  null, 'LATE-COMPLETION: resolved_at is set');

select lives_ok($$ select pg_temp.sweep_m() $$, 'LATE-COMPLETION: a sweep runs after resolution');
select is(
  (select count(*)::int from operations.task_exceptions
    where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
      and business_date = current_date),
  1, 'LATE-COMPLETION: the resolved critical_missed is never recreated by a later sweep');

select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_open_exceptions
       where source = 'critical_missed' and schedule_id = '0d5c0000-0000-0000-0000-0000000000a1'
         and business_date = current_date $$),
  0, 'LATE-COMPLETION: the resolved exception is gone from the Attention feed');

-- ============================================================================
-- G — existing threshold workflow unbroken (instance-attached)
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_record_response('0d110000-0000-0000-0000-000000000000',
             '0d5c0000-0000-0000-0000-0000000000a3', '0d170000-0000-0000-0000-0000000000a1', null, 99, null) $q$) $$,
  'G: an out-of-range measurement is still recorded');
select is(
  (select count(*)::int from operations.task_exceptions te
     join operations.task_instances ti on ti.id = te.instance_id
    where ti.schedule_id = '0d5c0000-0000-0000-0000-0000000000a3' and te.source = 'threshold'
      and te.instance_id is not null and te.schedule_id is null),
  1, 'G: a threshold breach still opens an instance-attached exception (schedule_id NULL)');
select is(
  (select severity from operations.task_exceptions te
     join operations.task_instances ti on ti.id = te.instance_id
    where ti.schedule_id = '0d5c0000-0000-0000-0000-0000000000a3' and te.source = 'threshold'),
  'action_required', 'G: threshold breach on a critical item is still action_required');

-- ============================================================================
-- H — existing staff-reported workflow unbroken (instance-attached)
-- ============================================================================
select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000c',
       $q$ select api.operations_report_problem('0d110000-0000-0000-0000-000000000000',
             '0d5c0000-0000-0000-0000-0000000000a3', null, 'door seal broken', 'action_required') $q$) $$,
  'H: staff reports a problem');
select is(
  (select count(*)::int from operations.task_exceptions te
     join operations.task_instances ti on ti.id = te.instance_id
    where ti.schedule_id = '0d5c0000-0000-0000-0000-0000000000a3' and te.source = 'reported'
      and te.instance_id is not null and te.schedule_id is null),
  1, 'H: a staff-reported problem still opens an instance-attached exception');

-- ============================================================================
-- RLS / structural guards
-- ============================================================================
select ok(
  pg_temp.as_auth_throws('0d900000-0000-0000-0000-00000000000c',
    $$ select api.operations_resolve_exception('0d110000-0000-0000-0000-000000000000',
         (select id from operations.task_exceptions where source = 'critical_missed'
            and schedule_id = '0d5c0000-0000-0000-0000-0000000000a5' limit 1), 'nope') $$),
  'RLS: an employee cannot resolve a critical_missed exception');

select lives_ok(
  $$ select pg_temp.as_auth_do('0d900000-0000-0000-0000-00000000000a',
       $q$ select api.operations_resolve_exception('0d110000-0000-0000-0000-000000000000',
             (select id from operations.task_exceptions where source = 'critical_missed'
                and schedule_id = '0d5c0000-0000-0000-0000-0000000000a5' limit 1), 'checked, ok now') $q$) $$,
  'RLS: a Manager can resolve a critical_missed exception');

select ok(
  pg_temp.as_role_throws('anon', $$ select 1 from api.operations_open_exceptions limit 1 $$),
  'RLS: anon cannot read api.operations_open_exceptions');

select ok(
  pg_temp.as_role_throws('postgres',
    $$ insert into operations.task_exceptions
         (tenant_id, location_id, instance_id, schedule_id, business_date, severity, source)
       values ('0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000002',
               null, '0d5c0000-0000-0000-0000-0000000000a1', current_date - 1, 'action_required', 'critical_missed') $$),
  'guard: an instance-less exception whose location_id does not match its schedule is rejected');

select ok(
  pg_temp.as_role_throws('postgres',
    $$ insert into operations.task_exceptions (tenant_id, location_id, severity, source)
       values ('0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000001', 'warning', 'reported') $$),
  'guard: an exception attached to neither an instance nor a schedule is rejected');

update core.tenant_modules set is_enabled = false where tenant_id = '0e110000-0000-0000-0000-000000000000';
select ok(
  pg_temp.as_auth_throws('0e900000-0000-0000-0000-00000000000a',
    $$ select api.operations_flag_missed_critical('0e110000-0000-0000-0000-000000000000', current_date - 7, current_date) $$),
  'module OFF: the api wrapper raises when Operations is disabled for the tenant');

select * from finish();
rollback;
