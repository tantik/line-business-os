-- ============================================================================
-- DB test: Operations template historical-expectation integrity
-- (migration 0104_operations_template_retirement.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Reproduces the confirmed sibling defect of 0102 and proves the fix:
--   deactivating / retiring a checklist_template today must NOT erase or
--   rewrite a past operational obligation that existed then, even when no
--   task_instance was ever materialised — while a legitimate retirement still
--   stops FUTURE task generation.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, ai;

select no_plan();

-- --- Fixtures ----------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('0a110000-0000-0000-0000-000000000000', 'pgtap-ops4-a', 'pgTAP Ops4 A'),
  ('0b220000-0000-0000-0000-000000000000', 'pgtap-ops4-b', 'pgTAP Ops4 B');

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

-- T1 (A/L1) will be retired mid-test. T2 (A/L2) is the cross-location control.
-- T3 (B/L1) is the cross-tenant control.
insert into operations.checklist_templates (id, tenant_id, location_id, name, is_active, retired_on) values
  ('0a1e0000-0000-0000-0000-0000000000a1', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', 'A/L1 opening', true, null),
  ('0a1e0000-0000-0000-0000-0000000000a2', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000002', 'A/L2 opening', true, null),
  ('0b2e0000-0000-0000-0000-0000000000b1', '0b220000-0000-0000-0000-000000000000', '0b100000-0000-0000-0000-000000000001', 'B/L1 opening', true, null),
  -- T4: already retired at fixture time (retired_on elapsed) — for the un-retire guard test.
  ('0a4e0000-0000-0000-0000-0000000000a4', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', 'A/L1 already retired', false, current_date - 2);

insert into operations.checklist_items (id, tenant_id, template_id, label, response_type, is_critical, is_required) values
  ('0a170000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', '0a1e0000-0000-0000-0000-0000000000a1', 'Fridge temp', 'boolean', true, true),
  ('0a270000-0000-0000-0000-000000000002', '0a110000-0000-0000-0000-000000000000', '0a1e0000-0000-0000-0000-0000000000a2', 'Fridge temp', 'boolean', true, true),
  ('0b170000-0000-0000-0000-000000000001', '0b220000-0000-0000-0000-000000000000', '0b2e0000-0000-0000-0000-0000000000b1', 'Fridge temp', 'boolean', true, true);

-- S1 (A/L1 on T1): DAILY, window 09:00-10:00, effective 10 days ago.
-- S2 (A/L2 on T2): DAILY, effective 10 days ago (cross-location control).
-- S3 (B/L1 on T3): DAILY, effective 10 days ago (cross-tenant control).
insert into operations.task_schedules
  (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, due_time, window_end_time, effective_from) values
  ('05c00000-0000-0000-0000-0000000000f1', '05c00000-0000-0000-0000-0000000000f1', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '0a1e0000-0000-0000-0000-0000000000a1', 'daily', '09:00', '10:00', current_date - 10),
  ('05c00000-0000-0000-0000-0000000000f2', '05c00000-0000-0000-0000-0000000000f2', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000002', '0a1e0000-0000-0000-0000-0000000000a2', 'daily', '09:00', '10:00', current_date - 10),
  ('05c00000-0000-0000-0000-0000000000f3', '05c00000-0000-0000-0000-0000000000f3', '0b220000-0000-0000-0000-000000000000', '0b100000-0000-0000-0000-000000000001', '0b2e0000-0000-0000-0000-0000000000b1', 'daily', '09:00', '10:00', current_date - 10);

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

create function pg_temp.throws(p_sql text)
returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;

-- ============================================================================
-- BASELINE: S1 daily => a past date with no instance is expected + overdue
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 5, current_date - 5)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1'
         and state = 'overdue' and instance_id is null and is_overdue_critical $$),
  1, 'baseline: 5 days ago is expected + overdue (critical), no instance');

-- ============================================================================
-- TEST A — Manager retires T1 today; a past obligation with no instance MUST
-- remain expected/overdue.
-- ============================================================================
update operations.checklist_templates
  set is_active = false, retired_on = current_date
  where id = '0a1e0000-0000-0000-0000-0000000000a1';

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 5, current_date - 5)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1'
         and state = 'overdue' and instance_id is null $$),
  1, 'TEST A: 5 days ago is STILL expected + overdue after the template is retired (no retroactive erase)');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 8, current_date)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' $$),
  9, 'TEST A2: every historical date through today (8 days ago .. today, retired_on = today) is still projected');

-- ============================================================================
-- TEST B — future occurrences stop after the retirement boundary
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date + 1, current_date + 14)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' $$),
  0, 'TEST B: no expected occurrence after retired_on (future task generation stopped)');

-- ============================================================================
-- TEST C — a materialised historical instance stays visible + interpretable
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 3, current_date - 3)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1'
         and instance_id = 'a5100000-0000-0000-0000-000000000001'
         and template_name = 'A/L1 opening' $$),
  1, 'TEST C: the materialised instance from 3 days ago is still visible with its template identity');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_task_instances
       where instance_id = 'a5100000-0000-0000-0000-000000000001' $$),
  1, 'TEST C2: the instance is still readable through api.operations_task_instances after retirement');

-- ============================================================================
-- TEST D / E — module OFF hides history; ON restores the SAME history
-- ============================================================================
update core.tenant_modules set is_enabled = false
  where tenant_id = '0a110000-0000-0000-0000-000000000000' and module = 'operations';

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 10, current_date + 10) $$),
  0, 'TEST D: module OFF — no historical expected occurrences visible');

update core.tenant_modules set is_enabled = true
  where tenant_id = '0a110000-0000-0000-0000-000000000000' and module = 'operations';

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 5, current_date - 5)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' and state = 'overdue' $$),
  1, 'TEST E: module ON again — the historical overdue occurrence is back, unchanged');

-- ============================================================================
-- TEST F — cross-tenant isolation: retiring tenant-A T1 did not touch tenant B
-- ============================================================================
select is(
  pg_temp.as_auth_count('0b900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 5, current_date - 5)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f3'
         and state = 'overdue' and instance_id is null $$),
  1, 'TEST F: tenant B''s schedule/template is unaffected; still expected + overdue 5 days ago');

select is(
  pg_temp.as_auth_count('0b900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 5, current_date + 5)
       where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  0, 'TEST F2: tenant B sees zero tenant-A rows');

-- ============================================================================
-- TEST G — cross-location isolation: A/L2 (T2) unaffected; an L1-scoped
-- manager cannot see the retired L1 template''s future gap vs L2
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date + 1, current_date + 1)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f2' $$),
  1, 'TEST G: A/L2 template T2 is NOT retired — tomorrow is still expected there');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000b',
    $$ select count(*)::int from api.operations_expected_tasks(current_date - 5, current_date + 5)
       where location_id = '0a100000-0000-0000-0000-000000000002' $$),
  0, 'TEST G2: an L1-scoped manager sees zero A/L2 rows (location isolation intact)');

-- ============================================================================
-- TEST — the chosen retirement boundary itself
-- ============================================================================
-- CHECK: cannot deactivate a template without a retirement boundary
select ok(
  pg_temp.throws(
    $$ update operations.checklist_templates set is_active = false
       where id = '0a1e0000-0000-0000-0000-0000000000a2' $$),
  'boundary: is_active=false without retired_on is rejected (CHECK operations_checklist_templates_retired_has_end)');

-- guard: cannot set a retroactive retirement boundary
select ok(
  pg_temp.throws(
    $$ update operations.checklist_templates set is_active = false, retired_on = current_date - 3
       where id = '0a1e0000-0000-0000-0000-0000000000a2' $$),
  'boundary: a retroactive retired_on is rejected (operations_template_retire_retroactive)');

-- guard: cannot move a not-yet-elapsed boundary backward into the past
select ok(
  pg_temp.throws(
    $$ update operations.checklist_templates set retired_on = current_date - 1
       where id = '0a1e0000-0000-0000-0000-0000000000a1' $$),
  'boundary: moving retired_on backward into the past is rejected');

-- guard: once retired_on has elapsed it is FROZEN (T4, retired_on = current_date - 2)
select ok(
  pg_temp.throws(
    $$ update operations.checklist_templates set is_active = true, retired_on = null
       where id = '0a4e0000-0000-0000-0000-0000000000a4' $$),
  'boundary: clearing an elapsed retired_on (un-retire) is rejected');

select ok(
  pg_temp.throws(
    $$ update operations.checklist_templates set is_active = true, retired_on = current_date + 20
       where id = '0a4e0000-0000-0000-0000-0000000000a4' $$),
  'boundary: advancing an ALREADY-ELAPSED retired_on forward is rejected (would fabricate missed history — review P2)');

select ok(
  pg_temp.throws(
    $$ update operations.checklist_templates set retired_on = current_date + 20
       where id = '0a4e0000-0000-0000-0000-0000000000a4' $$),
  'boundary: advancing an elapsed retired_on forward is rejected even without touching is_active');

-- advancing the boundary forward is allowed
select lives_ok(
  $$ update operations.checklist_templates set retired_on = current_date + 30
     where id = '0a1e0000-0000-0000-0000-0000000000a1' $$,
  'boundary: advancing retired_on forward is allowed');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date + 20, current_date + 20)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' $$),
  1, 'boundary: after advancing retired_on to +30, a date at +20 is expected again');

select * from finish();
rollback;
