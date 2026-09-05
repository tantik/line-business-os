-- ============================================================================
-- DB test: api.operations_schedules read view (migration
-- 0115_operations_schedules_read_view.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves, for the new read view only (the underlying RLS policy itself is
-- 0101's `operations_schedules_select`, already covered there):
--   1. a manager at the schedule's location can see it via the view
--   2. a user at a different location within the same tenant cannot
--   3. a different tenant cannot see it at all
--   4. module OFF -> the view returns nothing for that tenant
--   5. the view exposes exactly the documented column list, nothing more
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, ai;

select no_plan();

-- --- Fixtures -------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('0d110000-0000-0000-0000-000000000000', 'pgtap-ops-sched-tenant-a', 'pgTAP Ops Schedules Tenant A'),
  ('0d220000-0000-0000-0000-000000000000', 'pgtap-ops-sched-tenant-b', 'pgTAP Ops Schedules Tenant B');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0d110000-0000-0000-0000-000000000000', 'operations', true),
  ('0d220000-0000-0000-0000-000000000000', 'operations', true);

insert into core.locations (id, tenant_id, name) values
  ('0d100000-0000-0000-0000-000000000001', '0d110000-0000-0000-0000-000000000000', 'A / Location 1'),
  ('0d100000-0000-0000-0000-000000000002', '0d110000-0000-0000-0000-000000000000', 'A / Location 2'),
  ('0d200000-0000-0000-0000-000000000001', '0d220000-0000-0000-0000-000000000000', 'B / Location 1');

insert into core.users (id, display_name) values
  ('0d900000-0000-0000-0000-00000000000a', 'A Manager location 1'),
  ('0d900000-0000-0000-0000-00000000000b', 'A Manager location 2'),
  ('0d900000-0000-0000-0000-00000000000c', 'A tenant-wide manager'),
  ('0d900000-0000-0000-0000-00000000000d', 'B Manager location 1');

-- role ids: manager = ...005
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0d110000-0000-0000-0000-000000000000', '0d900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', '0d100000-0000-0000-0000-000000000001'),
  ('0d110000-0000-0000-0000-000000000000', '0d900000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', '0d100000-0000-0000-0000-000000000002'),
  ('0d110000-0000-0000-0000-000000000000', '0d900000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000005', null),
  ('0d220000-0000-0000-0000-000000000000', '0d900000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000005', '0d200000-0000-0000-0000-000000000001');

-- Templates (fixture setup, bypassing RLS as superuser).
insert into operations.checklist_templates (id, tenant_id, location_id, name, category) values
  ('0d1e0000-0000-0000-0000-00000000000a', '0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000001', 'A L1 opening', 'Opening'),
  ('0d2e0000-0000-0000-0000-00000000000b', '0d220000-0000-0000-0000-000000000000', '0d200000-0000-0000-0000-000000000001', 'B L1 opening', 'Opening');

-- Schedules (fixture setup, bypassing RLS as superuser).
insert into operations.task_schedules
  (id, tenant_id, location_id, template_id, schedule_group_id, recurrence_kind, weekdays, due_time, effective_from, is_active) values
  ('0d5c0000-0000-0000-0000-00000000000a', '0d110000-0000-0000-0000-000000000000', '0d100000-0000-0000-0000-000000000001',
   '0d1e0000-0000-0000-0000-00000000000a', '0d5c0000-0000-0000-0000-00000000000a', 'daily', null, '08:00', current_date, true),
  ('0d5c0000-0000-0000-0000-00000000000b', '0d220000-0000-0000-0000-000000000000', '0d200000-0000-0000-0000-000000000001',
   '0d2e0000-0000-0000-0000-00000000000b', '0d5c0000-0000-0000-0000-00000000000b', 'daily', null, '08:00', current_date, true);

-- --- Role-hop helper (matches 0046's style) --------------------------------
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

-- ============================================================================
-- Section 1: location-scoped visibility within tenant A
-- ============================================================================
select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_schedules where tenant_id = '0d110000-0000-0000-0000-000000000000' $$),
  1, 'L1 manager sees the L1 schedule via api.operations_schedules');

select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000b',
    $$ select count(*)::int from api.operations_schedules where schedule_id = '0d5c0000-0000-0000-0000-00000000000a' $$),
  0, 'L2 manager (different location, same tenant) cannot see the L1 schedule');

select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000c',
    $$ select count(*)::int from api.operations_schedules where schedule_id = '0d5c0000-0000-0000-0000-00000000000a' $$),
  1, 'tenant-wide manager (no location_id restriction) sees the L1 schedule');

-- ============================================================================
-- Section 2: tenant isolation
-- ============================================================================
select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_schedules where tenant_id = '0d220000-0000-0000-0000-000000000000' $$),
  0, 'tenant isolation: A manager sees zero tenant-B schedules');

select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000d',
    $$ select count(*)::int from api.operations_schedules where tenant_id = '0d110000-0000-0000-0000-000000000000' $$),
  0, 'tenant isolation: B manager sees zero tenant-A schedules');

select ok(
  (select pg_temp.as_auth_count('0aff0000-0000-0000-0000-0000000000ff',
    $$ select count(*)::int from api.operations_schedules $$)) = 0,
  'permission: a non-member sub sees zero schedules');

-- ============================================================================
-- Section 3: module OFF -> the view returns nothing for that tenant
-- ============================================================================
update core.tenant_modules set is_enabled = false
  where tenant_id = '0d110000-0000-0000-0000-000000000000' and module = 'operations';

select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_schedules where tenant_id = '0d110000-0000-0000-0000-000000000000' $$),
  0, 'module OFF: A manager sees zero schedules through the api facade');

select is(
  (select count(*)::int from operations.task_schedules where tenant_id = '0d110000-0000-0000-0000-000000000000'),
  1, 'module OFF: the pre-existing schedule still exists in storage (superuser read) — hidden, never deleted');

update core.tenant_modules set is_enabled = true
  where tenant_id = '0d110000-0000-0000-0000-000000000000' and module = 'operations';

select is(
  pg_temp.as_auth_count('0d900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_schedules where tenant_id = '0d110000-0000-0000-0000-000000000000' $$),
  1, 'module ON again: A manager sees the schedule again, unchanged');

-- ============================================================================
-- Section 4: exact column list — no column beyond the documented set
-- ============================================================================
select columns_are('api', 'operations_schedules', array[
  'schedule_id', 'tenant_id', 'location_id', 'template_id', 'schedule_group_id',
  'recurrence_kind', 'weekdays', 'due_time', 'window_end_time',
  'effective_from', 'effective_to', 'is_active', 'created_at', 'updated_at'
], 'api.operations_schedules exposes exactly the documented column list, nothing more');

select * from finish();
rollback;
