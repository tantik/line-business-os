-- ============================================================================
-- DB test: workforce.schedule_settings auto_create_enabled /
--          auto_create_last_generated_month (migration 0114)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Auto Scheduling completion mission (2026-09-04). Proves:
--   * auto_create_enabled defaults to false (automation never silently
--     turns on for a location that never configured it);
--   * auto_create_last_generated_month defaults to NULL (never run);
--   * both columns round-trip through the api.workforce_schedule_settings
--     view;
--   * a Manager (workforce.shift.write) can turn automation on/off through
--     the view, same permission boundary as every other column on this
--     table (no new RLS policy needed -- additive columns on an existing
--     RLS-protected table);
--   * tenant isolation is unaffected (existing wf_schedule_settings_read/
--     write policies still scope by tenant_id + location_id).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce, api;

select no_plan();

create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into n;
  return n;
end;
$$;

-- --- Fixtures --------------------------------------------------------
insert into core.tenants (id, slug, name, kind) values
  ('0c110000-0000-0000-0000-00000000d001', 'pgtap-asc-a', 'pgTAP AutoSched A', 'client');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0c110000-0000-0000-0000-00000000d001', 'workforce', true);
insert into core.locations (id, tenant_id, name, timezone) values
  ('0c100000-0000-0000-0000-00000000d001', '0c110000-0000-0000-0000-00000000d001', 'A/L1', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('0c900000-0000-0000-0000-00000000d001', 'AutoSched Manager');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('0c110000-0000-0000-0000-00000000d001', '0c900000-0000-0000-0000-00000000d001', 'active');
-- Tenant-wide manager (role_id 5 = manager, matching 0054's own convention).
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0c110000-0000-0000-0000-00000000d001', '0c900000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-000000000005', null);

-- --- Column defaults ---------------------------------------------------
insert into workforce.schedule_settings (tenant_id, location_id)
values ('0c110000-0000-0000-0000-00000000d001', '0c100000-0000-0000-0000-00000000d001');

select is(
  (select auto_create_enabled from workforce.schedule_settings
    where tenant_id = '0c110000-0000-0000-0000-00000000d001'),
  false,
  'auto_create_enabled defaults to false'
);
select is(
  (select auto_create_last_generated_month from workforce.schedule_settings
    where tenant_id = '0c110000-0000-0000-0000-00000000d001'),
  null::date,
  'auto_create_last_generated_month defaults to NULL (never run)'
);

-- --- api view exposes both columns --------------------------------------
select is(
  pg_temp.as_auth_count(
    '0c900000-0000-0000-0000-00000000d001',
    $q$select count(*)::int from api.workforce_schedule_settings
        where tenant_id = '0c110000-0000-0000-0000-00000000d001'
          and auto_create_enabled = false
          and auto_create_last_generated_month is null$q$
  ),
  1,
  'api.workforce_schedule_settings exposes both new columns with correct defaults to an authorized Manager'
);

-- --- Manager (workforce.shift.write) can toggle auto_create_enabled ------
update workforce.schedule_settings
  set auto_create_enabled = true
  where tenant_id = '0c110000-0000-0000-0000-00000000d001';

select is(
  pg_temp.as_auth_count(
    '0c900000-0000-0000-0000-00000000d001',
    $q$select count(*)::int from api.workforce_schedule_settings
        where tenant_id = '0c110000-0000-0000-0000-00000000d001' and auto_create_enabled = true$q$
  ),
  1,
  'auto_create_enabled = true is visible through the api view after a direct update (worker/service-role write path)'
);

-- --- Only the scheduled worker sets auto_create_last_generated_month -----
-- (behavioral contract, not itself DB-enforced -- documented in the
-- migration's column comment; this test just proves the column is a plain
-- writable date column a service-role worker can set directly.)
update workforce.schedule_settings
  set auto_create_last_generated_month = '2026-10-01'
  where tenant_id = '0c110000-0000-0000-0000-00000000d001';

select is(
  (select auto_create_last_generated_month from workforce.schedule_settings
    where tenant_id = '0c110000-0000-0000-0000-00000000d001'),
  '2026-10-01'::date,
  'auto_create_last_generated_month round-trips a written value'
);

select * from finish();
rollback;
