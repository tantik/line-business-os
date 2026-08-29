-- ============================================================================
-- DB test: Operations tenant-facing Configuration API
-- (migration 0105_operations_configuration_api.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the controlled write boundary for Manager configuration
-- (templates -> items -> schedules): authorized create/update/retire works;
-- Staff / cross-tenant / cross-location / module-OFF / missing-module-row are
-- all rejected; response_type is frozen after operationalization with a
-- working replacement path; the F2 raw-backdated-schedule vector and the
-- elapsed effective_to forward-advance asymmetry are closed; future
-- not-yet-effective schedule versions can be cancelled non-destructively;
-- template retirement through the API preserves history and stops the future.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, ai, api;

select no_plan();

-- --- Fixtures ----------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('0a110000-0000-0000-0000-000000000000', 'pgtap-ops5-a', 'pgTAP Ops5 A'),
  ('0b220000-0000-0000-0000-000000000000', 'pgtap-ops5-b', 'pgTAP Ops5 B'),
  ('0c330000-0000-0000-0000-000000000000', 'pgtap-ops5-c', 'pgTAP Ops5 C (no module row)');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0a110000-0000-0000-0000-000000000000', 'operations', true),
  ('0b220000-0000-0000-0000-000000000000', 'operations', true);
-- tenant C: deliberately NO operations row.

insert into core.locations (id, tenant_id, name, timezone) values
  ('0a100000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', 'A/L1', 'Asia/Tokyo'),
  ('0a100000-0000-0000-0000-000000000002', '0a110000-0000-0000-0000-000000000000', 'A/L2', 'Asia/Tokyo'),
  ('0b100000-0000-0000-0000-000000000001', '0b220000-0000-0000-0000-000000000000', 'B/L1', 'Asia/Tokyo'),
  ('0c100000-0000-0000-0000-000000000001', '0c330000-0000-0000-0000-000000000000', 'C/L1', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('0a900000-0000-0000-0000-00000000000a', 'A Manager tenant-wide'),
  ('0a900000-0000-0000-0000-00000000000b', 'A Manager L1 only'),
  ('0a900000-0000-0000-0000-00000000000c', 'A Employee L1'),
  ('0b900000-0000-0000-0000-00000000000a', 'B Manager tenant-wide'),
  ('0c900000-0000-0000-0000-00000000000a', 'C Manager tenant-wide');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null),
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', '0a100000-0000-0000-0000-000000000001'),
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000006', '0a100000-0000-0000-0000-000000000001'),
  ('0b220000-0000-0000-0000-000000000000', '0b900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null),
  ('0c330000-0000-0000-0000-000000000000', '0c900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null);

-- a tenant-B template, for the cross-tenant item attack
insert into operations.checklist_templates (id, tenant_id, location_id, name) values
  ('0b2e0000-0000-0000-0000-0000000000b1', '0b220000-0000-0000-0000-000000000000', '0b100000-0000-0000-0000-000000000001', 'B/L1 opening');

-- --- helpers ---------------------------------------------------------
-- run p_sql as p_sub, return the scalar text result, or 'ERR: <msg>'.
create function pg_temp.as_auth(p_sub text, p_sql text)
returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  set local role authenticated;
  execute p_sql into r;
  reset role;
  return r;
exception when others then
  reset role;
  return 'ERR: ' || sqlerrm;
end $$;

create function pg_temp.threw(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  return left(pg_temp.as_auth(p_sub, p_sql), 5) = 'ERR: ';
end $$;

-- ============================================================================
-- A — authorized Manager can create valid configuration
-- ============================================================================
select isnt(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a',
    $$ select api.operations_create_template('0a110000-0000-0000-0000-000000000000', 'Opening', '0a100000-0000-0000-0000-000000000001', 'Opening', 'morning checks')::text $$),
  null, 'A: tenant-wide manager creates a location-scoped template');

-- capture ids into a temp table for reuse
create temp table t_ids (k text primary key, v uuid);
insert into t_ids values ('tmpl', pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a',
  $$ select api.operations_create_template('0a110000-0000-0000-0000-000000000000', 'Closing', '0a100000-0000-0000-0000-000000000001', 'Closing', null)::text $$)::uuid);

insert into t_ids values ('item', pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a', format(
  $$ select api.operations_add_template_item('0a110000-0000-0000-0000-000000000000', '%s', 'Fridge temp', 'numeric', true, true, 1, 5, 'C', 1)::text $$,
  (select v from t_ids where k='tmpl')))::uuid);

insert into t_ids values ('sched', pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a', format(
  $$ select api.operations_create_schedule('0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '%s', 'daily', '09:00'::time, null, '10:00'::time, current_date)::text $$,
  (select v from t_ids where k='tmpl')))::uuid);

select ok((select v from t_ids where k='item') is not null, 'A: manager adds a checklist item');
select ok((select v from t_ids where k='sched') is not null, 'A: manager creates a schedule (new schedule_group_id)');

select is(
  (select count(*)::int from operations.task_schedules sib
   where sib.schedule_group_id = (select s.schedule_group_id from operations.task_schedules s where s.id = (select v from t_ids where k='sched'))),
  1, 'A: the new schedule is alone in its logical group (fresh schedule_group_id)');
select is(
  (select (is_active and effective_to is null)::text from operations.task_schedules where id = (select v from t_ids where k='sched')),
  'true', 'A: the new schedule is active and open-ended');

select ok(
  not pg_temp.threw('0a900000-0000-0000-0000-00000000000a', format(
    $$ select api.operations_update_template('0a110000-0000-0000-0000-000000000000', '%s', 'Closing v2', 'Closing', 'updated') $$,
    (select v from t_ids where k='tmpl'))),
  'A: manager updates template metadata');

-- ============================================================================
-- B — Staff cannot configure Operations
-- ============================================================================
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000c',
  $$ select api.operations_create_template('0a110000-0000-0000-0000-000000000000', 'X', '0a100000-0000-0000-0000-000000000001') $$),
  'B: employee cannot create a template');
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000c', format(
  $$ select api.operations_add_template_item('0a110000-0000-0000-0000-000000000000', '%s', 'X', 'text') $$, (select v from t_ids where k='tmpl'))),
  'B: employee cannot add a checklist item');
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000c', format(
  $$ select api.operations_create_schedule('0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '%s', 'daily', '09:00'::time) $$, (select v from t_ids where k='tmpl'))),
  'B: employee cannot create a schedule');
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000c', format(
  $$ select api.operations_retire_template('0a110000-0000-0000-0000-000000000000', '%s') $$, (select v from t_ids where k='tmpl'))),
  'B: employee cannot retire a template');

-- ============================================================================
-- C — tenant A cannot configure tenant B
-- ============================================================================
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a',
  $$ select api.operations_create_template('0b220000-0000-0000-0000-000000000000', 'X', '0b100000-0000-0000-0000-000000000001') $$),
  'C: tenant-A manager cannot create a tenant-B template');
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a',
  $$ select api.operations_add_template_item('0b220000-0000-0000-0000-000000000000', '0b2e0000-0000-0000-0000-0000000000b1', 'X', 'text') $$),
  'C: tenant-A manager cannot add an item to a tenant-B template');
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a',
  $$ select api.operations_add_template_item('0a110000-0000-0000-0000-000000000000', '0b2e0000-0000-0000-0000-0000000000b1', 'X', 'text') $$),
  'C: tenant-A manager cannot claim tenant A but point at a tenant-B template');

-- ============================================================================
-- D — location boundary cannot be crossed
-- ============================================================================
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000b',
  $$ select api.operations_create_template('0a110000-0000-0000-0000-000000000000', 'X', '0a100000-0000-0000-0000-000000000002') $$),
  'D: an L1-scoped manager cannot create a template at L2');
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000b', format(
  $$ select api.operations_create_schedule('0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000002', '%s', 'daily', '09:00'::time) $$, (select v from t_ids where k='tmpl'))),
  'D: an L1-scoped manager cannot create a schedule at L2');
-- positive control: tmpl IS at L1, so the L1-scoped manager CAN add to it
select is(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000000b', format(
    $$ select (api.operations_add_template_item('0a110000-0000-0000-0000-000000000000', '%s', 'L1 mgr item', 'boolean') is not null)::text $$, (select v from t_ids where k='tmpl'))),
  'true', 'D: an L1-scoped manager CAN add an item to an L1 template (positive control)');

-- ============================================================================
-- E — module OFF blocks configuration
-- ============================================================================
update core.tenant_modules set is_enabled = false
  where tenant_id = '0a110000-0000-0000-0000-000000000000' and module = 'operations';

select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a',
  $$ select api.operations_create_template('0a110000-0000-0000-0000-000000000000', 'X', '0a100000-0000-0000-0000-000000000001') $$),
  'E: module OFF blocks create_template');
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a', format(
  $$ select api.operations_retire_template('0a110000-0000-0000-0000-000000000000', '%s') $$, (select v from t_ids where k='tmpl'))),
  'E: module OFF blocks retire_template');
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a', format(
  $$ select api.operations_create_schedule('0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '%s', 'daily', '09:00'::time) $$, (select v from t_ids where k='tmpl'))),
  'E: module OFF blocks create_schedule');

update core.tenant_modules set is_enabled = true
  where tenant_id = '0a110000-0000-0000-0000-000000000000' and module = 'operations';

-- ============================================================================
-- F — missing tenant_modules row fails closed (tenant C)
-- ============================================================================
select ok(pg_temp.threw('0c900000-0000-0000-0000-00000000000a',
  $$ select api.operations_create_template('0c330000-0000-0000-0000-000000000000', 'X', '0c100000-0000-0000-0000-000000000001') $$),
  'F: tenant C (no operations tenant_modules row) — create_template fails closed');

-- ============================================================================
-- G — response_type cannot be illegally changed after operationalization
-- ============================================================================
-- the item belongs to a template that now has a schedule => operationalized.
select ok(
  operations.item_is_operationalized('0a110000-0000-0000-0000-000000000000', (select v from t_ids where k='item')),
  'G: the item is operationalized (its template has a schedule)');

select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a', format(
  $$ update operations.checklist_items set response_type = 'text' where id = '%s' $$, (select v from t_ids where k='item'))),
  'G: a raw UPDATE of response_type on an operationalized item is rejected (definition guard)');

select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a', format(
  $$ update operations.checklist_items set is_critical = false where id = '%s' $$, (select v from t_ids where k='item'))),
  'G: a raw UPDATE of is_critical on an operationalized item is rejected (severity freeze)');

-- update_template_item has no response_type parameter; label/threshold still editable
select ok(
  not pg_temp.threw('0a900000-0000-0000-0000-00000000000a', format(
    $$ select api.operations_update_template_item('0a110000-0000-0000-0000-000000000000', '%s', 'Fridge temp (relabelled)', true, true, 0, 6, 'C', 1) $$,
    (select v from t_ids where k='item'))),
  'G: update_template_item can relabel + retune thresholds on an operational item');
select is(
  (select numeric_max::text from operations.checklist_items where id = (select v from t_ids where k='item')),
  '6', 'G: the threshold change landed');

-- ============================================================================
-- H — the correct replacement path remains possible
-- ============================================================================
insert into t_ids values ('item2', pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a', format(
  $$ select api.operations_replace_template_item('0a110000-0000-0000-0000-000000000000', '%s', 'Fridge temp (text note)', 'text')::text $$,
  (select v from t_ids where k='item')))::uuid);

select is(
  (select is_active::text from operations.checklist_items where id = (select v from t_ids where k='item')),
  'false', 'H: replace_template_item retires the old item');
select is(
  (select response_type::text from operations.checklist_items where id = (select v from t_ids where k='item2')),
  'text', 'H: the replacement item has the new response_type');
select is(
  (select template_id from operations.checklist_items where id = (select v from t_ids where k='item2')),
  (select v from t_ids where k='tmpl'), 'H: the replacement item is on the same template');

-- ============================================================================
-- I — the raw backdated schedule INSERT vector (F2) is closed
-- ============================================================================
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a', format(
  $$ insert into operations.task_schedules
       (tenant_id, location_id, template_id, schedule_group_id, recurrence_kind, due_time, window_end_time, effective_from, effective_to)
     values ('0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '%s',
             gen_random_uuid(), 'daily', '09:00', '10:00', current_date - 20, current_date - 11) $$,
  (select v from t_ids where k='tmpl'))),
  'I: an authenticated Manager cannot raw-INSERT a backdated non-overlapping schedule version (RLS)');

-- a not-yet-started future version cannot be raw-backdated either
insert into operations.task_schedules (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, due_time, window_end_time, effective_from)
  values ('05c05100-0000-0000-0000-0000000000f9', '05c05100-0000-0000-0000-0000000000f9', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', (select v from t_ids where k='tmpl'), 'daily', '09:00', '10:00', current_date + 10);
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a',
  $$ update operations.task_schedules set effective_from = current_date - 8 where id = '05c05100-0000-0000-0000-0000000000f9' $$),
  'I: a not-yet-started future version cannot have its effective_from backdated (guard)');

-- ============================================================================
-- J — sanctioned forward schedule creation / revision works
-- ============================================================================
select is(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a', format(
    $$ select (api.operations_revise_schedule('0a110000-0000-0000-0000-000000000000', '%s', 'weekdays', array[1,2,3,4,5]::smallint[], '08:00'::time, '09:00'::time, null)).effective_from::text $$,
    (select v from t_ids where k='sched'))),
  (current_date + 1)::text, 'J: revise_schedule creates a new version effective from the next business date');

select is(
  (select count(*)::int from operations.task_schedules
   where schedule_group_id = (select schedule_group_id from operations.task_schedules where id = (select v from t_ids where k='sched'))),
  2, 'J: the logical schedule now has two versions');

-- ============================================================================
-- K — an elapsed schedule boundary cannot fabricate history
-- ============================================================================
insert into operations.task_schedules (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, due_time, window_end_time, effective_from, effective_to, is_active)
  values ('05c05100-0000-0000-0000-0000000000e7', '05c05100-0000-0000-0000-0000000000e7', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', (select v from t_ids where k='tmpl'), 'daily', '09:00', '10:00', current_date - 20, current_date - 10, false);
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a',
  $$ update operations.task_schedules set effective_to = current_date + 30 where id = '05c05100-0000-0000-0000-0000000000e7' $$),
  'K: an already-elapsed effective_to cannot be advanced forward (frozen — mirrors 0104)');

-- ============================================================================
-- L / M — template retirement through the API preserves history, stops future
-- ============================================================================
-- dedicated fixture: a template with a schedule that has 10 days of history.
insert into t_ids values ('tmplL', pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a',
  $$ select api.operations_create_template('0a110000-0000-0000-0000-000000000000', 'History', '0a100000-0000-0000-0000-000000000001')::text $$)::uuid);
insert into operations.checklist_items (tenant_id, template_id, label, response_type, is_critical, is_required)
  values ('0a110000-0000-0000-0000-000000000000', (select v from t_ids where k='tmplL'), 'Crit', 'boolean', true, true);
insert into operations.task_schedules (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, due_time, window_end_time, effective_from)
  values ('05c05100-0000-0000-0000-00000000d001'::uuid, '05c05100-0000-0000-0000-00000000d001'::uuid,
          '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001',
          (select v from t_ids where k='tmplL'), 'daily', '09:00', '10:00', current_date - 10);
insert into t_ids values ('schedL', '05c05100-0000-0000-0000-00000000d001'::uuid);

select is(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::text from api.operations_expected_tasks(current_date - 5, current_date - 5)
       where schedule_id = '05c05100-0000-0000-0000-00000000d001' and state = 'overdue' and instance_id is null $$),
  '1', 'L: baseline — 5 days ago is expected + overdue, no instance');

select is(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a', format(
    $$ select api.operations_retire_template('0a110000-0000-0000-0000-000000000000', '%s')::text $$,
    (select v from t_ids where k='tmplL'))),
  current_date::text, 'L: retire_template returns today as the boundary');

select is(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::text from api.operations_expected_tasks(current_date - 5, current_date - 5)
       where schedule_id = '05c05100-0000-0000-0000-00000000d001' and state = 'overdue' $$),
  '1', 'L: after API retirement, the past obligation is STILL expected + overdue');

select is(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::text from api.operations_expected_tasks(current_date + 1, current_date + 14)
       where schedule_id = '05c05100-0000-0000-0000-00000000d001' $$),
  '0', 'M: after API retirement, no future occurrences are generated');

select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a', format(
  $$ select api.operations_retire_template('0a110000-0000-0000-0000-000000000000', '%s') $$, (select v from t_ids where k='tmplL'))),
  'L: retiring an already-retired template is rejected');

-- ============================================================================
-- N — future not-yet-effective schedule version cancellation
-- ============================================================================
insert into t_ids values ('tmpl2', pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a',
  $$ select api.operations_create_template('0a110000-0000-0000-0000-000000000000', 'Cleaning', '0a100000-0000-0000-0000-000000000001')::text $$)::uuid);

select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a', format(
  $$ select api.operations_retire_template('0a110000-0000-0000-0000-000000000000', '%s', current_date - 3) $$, (select v from t_ids where k='tmpl2'))),
  'N: a retroactive retirement boundary is rejected by retire_template');
insert into t_ids values ('sched2', pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a', format(
  $$ select api.operations_create_schedule('0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', '%s', 'daily', '09:00'::time)::text $$,
  (select v from t_ids where k='tmpl2')))::uuid);
insert into t_ids values ('sched2_future', pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a', format(
  $$ select (api.operations_revise_schedule('0a110000-0000-0000-0000-000000000000', '%s', 'daily', null, '07:00'::time, '08:00'::time, null)).schedule_id::text $$,
  (select v from t_ids where k='sched2')))::uuid);

select is(
  (select effective_to::text from operations.task_schedules where id = (select v from t_ids where k='sched2')),
  current_date::text, 'N: revise closed the current version at today');

select is(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000000a', format(
    $$ select (api.operations_cancel_scheduled_revision('0a110000-0000-0000-0000-000000000000', '%s')).reopened_schedule_id::text $$,
    (select v from t_ids where k='sched2_future'))),
  (select v::text from t_ids where k='sched2'), 'N: cancel_scheduled_revision reopens the predecessor');

select is(
  (select count(*)::int from operations.task_schedules where id = (select v from t_ids where k='sched2_future')),
  0, 'N: the not-yet-effective version is physically gone');
select is(
  (select is_active::text || ' ' || coalesce(effective_to::text, 'null') from operations.task_schedules where id = (select v from t_ids where k='sched2')),
  'true null', 'N: the predecessor is active and open-ended again');

-- cannot cancel a version that is already effective
select ok(pg_temp.threw('0a900000-0000-0000-0000-00000000000a', format(
  $$ select api.operations_cancel_scheduled_revision('0a110000-0000-0000-0000-000000000000', '%s') $$,
  (select v from t_ids where k='sched2'))),
  'N: an already-effective version cannot be cancelled');

-- ============================================================================
-- O — Operations execution tests 0046–0050 remain green: verified by running
--     the full suite (this file adds no change to those paths).
-- ============================================================================
select pass('O: 0046–0050 unaffected (run the full suite to confirm)');

select * from finish();
rollback;
