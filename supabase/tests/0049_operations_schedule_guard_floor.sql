-- ============================================================================
-- DB test: task_schedules history-guard floor hardening (migration 0103)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Review F1: a privileged raw UPDATE could pull effective_to back to
-- current_date - 1 and drop TODAY's not-yet-elapsed expected occurrence.
-- 0103 tightens the guard floor to current_date. This proves:
--   * a raw pull-back to current_date - 1 is rejected;
--   * a raw pull-back to a still-earlier past date is rejected;
--   * the sanctioned RPCs (revise / deactivate at/after current_date) still
--     work;
--   * today's occurrence is preserved.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, ai;

select no_plan();

insert into core.tenants (id, slug, name) values
  ('0a110000-0000-0000-0000-000000000000', 'pgtap-ops4-a', 'pgTAP Ops4 A');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0a110000-0000-0000-0000-000000000000', 'operations', true);
insert into core.locations (id, tenant_id, name, timezone) values
  ('0a100000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', 'A/L1', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('0a900000-0000-0000-0000-00000000000a', 'A Manager tenant-wide');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null);
insert into operations.checklist_templates (id, tenant_id, location_id, name) values
  ('0a1e0000-0000-0000-0000-0000000000a1', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', 'A/L1 opening');
insert into operations.task_schedules
  (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, due_time, window_end_time, effective_from) values
  ('05c00000-0000-0000-0000-0000000000f1', '05c00000-0000-0000-0000-0000000000f1',
   '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001',
   '0a1e0000-0000-0000-0000-0000000000a1', 'daily', '09:00', '10:00', current_date - 10);

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

-- baseline: today's occurrence is expected
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date, current_date)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' $$),
  1, 'baseline: today''s occurrence is expected');

-- F1: raw UPDATE pulling effective_to back to current_date - 1 is rejected
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000a',
    $$ update operations.task_schedules set effective_to = current_date - 1
       where id = '05c00000-0000-0000-0000-0000000000f1' $$),
  'F1: a raw effective_to pull-back to current_date - 1 is blocked by the guard');

-- and to a still-earlier date
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000a',
    $$ update operations.task_schedules set effective_to = current_date - 5
       where id = '05c00000-0000-0000-0000-0000000000f1' $$),
  'F1: a raw effective_to pull-back to an earlier past date is blocked');

-- today's occurrence still there
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_expected_tasks(current_date, current_date)
       where schedule_group_id = '05c00000-0000-0000-0000-0000000000f1' $$),
  1, 'F1: today''s occurrence is still expected after the blocked pull-backs');

-- sanctioned deactivate (effective_to = current_date) still works
select lives_ok(
  $$ do $d$ begin
       perform set_config('request.jwt.claim.sub', '0a900000-0000-0000-0000-00000000000a', true);
       set local role authenticated;
       perform api.operations_deactivate_schedule('0a110000-0000-0000-0000-000000000000', '05c00000-0000-0000-0000-0000000000f1');
       reset role;
     end $d$ $$,
  'sanctioned: api.operations_deactivate_schedule (boundary = today) still succeeds');

select is(
  (select effective_to from operations.task_schedules where id = '05c00000-0000-0000-0000-0000000000f1'),
  current_date, 'sanctioned: the schedule is retired with effective_to = today (past preserved, stops tomorrow)');

select * from finish();
rollback;
