-- ============================================================================
-- 0126  Workforce: weekly labour limits for the auto-schedule engine
-- ----------------------------------------------------------------------------
-- WHY
--   QA (Cloud DEV, 2026-10-14): the auto-schedule engine's only per-staff cap
--   was `max_monthly_hours` (160). In a high-demand week it assigned every
--   staff member 7 days out of 7 and 57-70 hours. Japan's Labour Standards
--   Act (労働基準法) sets a 40-hour statutory weekly limit and requires at
--   least one day off per week -- a Manager publishing that draft would
--   breach it. Two per-location settings the ONE shared engine
--   (`packages/workforce`, used by both the manual "auto-create" Server
--   Action and the scheduled cloud runner) now enforces per ISO week
--   (Monday-Sunday):
--     * max_weekly_hours   integer not null default 40 (1..168)
--     * max_days_per_week  integer not null default 5  (1..7)
--   Existing rows get the defaults (statutory-safe) immediately.
--
-- WHAT
--   1. The two columns on workforce.schedule_settings (CHECK-bounded).
--      Existing RLS (wf_schedule_settings_read / _write, 0097) already covers
--      every column of this table -- no policy change.
--   2. api.workforce_schedule_settings recreated with both columns appended
--      (views don't pick up new table columns); same security_invoker view
--      and same grants as 0114.
--   3. workforce.auto_schedule_candidates() (0125) also returns both columns,
--      so the cloud runner passes them to the engine. Its RETURNS TABLE
--      changes, which CREATE OR REPLACE cannot do, so it and its api
--      passthrough are dropped and recreated with the IDENTICAL security
--      posture: workforce function SECURITY DEFINER + fixed search_path,
--      api passthrough SECURITY INVOKER (ADR 0008), EXECUTE revoked from
--      public/anon/authenticated and granted to service_role only on both.
--
-- ROLLBACK
--   drop function api.auto_schedule_candidates(); drop function
--   workforce.auto_schedule_candidates(); recreate both from 0125 (incl.
--   revoke/grant + comments); recreate api.workforce_schedule_settings from
--   0114; then
--     alter table workforce.schedule_settings
--       drop column max_weekly_hours, drop column max_days_per_week;
--   Purely additive -- no data in any other column is affected. The engine
--   treats absent limits as "no weekly cap", so an Edge Function deployed
--   before/after this migration keeps working either way.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columns
-- ----------------------------------------------------------------------------
alter table workforce.schedule_settings
  add column if not exists max_weekly_hours integer not null default 40,
  add column if not exists max_days_per_week integer not null default 5;

alter table workforce.schedule_settings
  drop constraint if exists schedule_settings_max_weekly_hours_check;
alter table workforce.schedule_settings
  add constraint schedule_settings_max_weekly_hours_check
  check (max_weekly_hours between 1 and 168);

alter table workforce.schedule_settings
  drop constraint if exists schedule_settings_max_days_per_week_check;
alter table workforce.schedule_settings
  add constraint schedule_settings_max_days_per_week_check
  check (max_days_per_week between 1 and 7);

comment on column workforce.schedule_settings.max_weekly_hours is
  'Per-staff cap on net worked hours per ISO week (Mon-Sun) the auto-schedule engine respects (0126). Default 40 = 労働基準法 statutory weekly limit. Existing assignments are never altered to satisfy it; candidates that would exceed it become shortages.';
comment on column workforce.schedule_settings.max_days_per_week is
  'Per-staff cap on distinct working days per ISO week (Mon-Sun) the auto-schedule engine respects (0126). Default 5; 労働基準法 requires at least one day off per week.';

-- ----------------------------------------------------------------------------
-- 2. api view (columns appended; same grants as 0114)
-- ----------------------------------------------------------------------------
drop view if exists api.workforce_schedule_settings;
create view api.workforce_schedule_settings
  with (security_invoker = true) as
select
  tenant_id,
  location_id,
  required_headcount_by_weekday,
  max_monthly_hours,
  auto_create_day_of_month,
  auto_create_enabled,
  auto_create_last_generated_month,
  updated_at,
  max_weekly_hours,
  max_days_per_week
from workforce.schedule_settings;

grant select, insert, update on api.workforce_schedule_settings to authenticated;
revoke all on api.workforce_schedule_settings from anon, public;

-- ----------------------------------------------------------------------------
-- 3. Cloud-runner candidates: + max_weekly_hours, max_days_per_week
--    (return type changes -> drop + recreate both, identical posture to 0125)
-- ----------------------------------------------------------------------------
drop function if exists api.auto_schedule_candidates();
drop function if exists workforce.auto_schedule_candidates();

create function workforce.auto_schedule_candidates()
returns table (
  tenant_id uuid,
  location_id uuid,
  timezone text,
  auto_create_day_of_month integer,
  auto_create_last_generated_month date,
  required_headcount_by_weekday jsonb,
  max_monthly_hours integer,
  max_weekly_hours integer,
  max_days_per_week integer
)
language sql
stable
security definer
set search_path = workforce, core, public
as $$
  select
    s.tenant_id,
    s.location_id,
    l.timezone,
    s.auto_create_day_of_month,
    s.auto_create_last_generated_month,
    s.required_headcount_by_weekday,
    s.max_monthly_hours,
    s.max_weekly_hours,
    s.max_days_per_week
  from workforce.schedule_settings s
  join core.locations l
    on l.id = s.location_id
   and l.tenant_id = s.tenant_id
  join core.tenant_modules tm
    on tm.tenant_id = s.tenant_id
   and tm.module = 'workforce'
  join core.tenants tn
    on tn.id = s.tenant_id
  where s.auto_create_enabled = true
    and tm.is_enabled = true
    and l.is_active = true
    and tn.status = 'active' -- core.tenant_status: suspended / archived tenants never run
  order by s.tenant_id, s.location_id;
$$;

comment on function workforce.auto_schedule_candidates() is
  'Service-role-only (0125, + weekly limits 0126): locations eligible for the scheduled monthly auto-create -- auto_create_enabled, tenant status active, tenant Workforce module enabled (missing row = excluded), location active. Returns the per-location engine settings incl. max_weekly_hours / max_days_per_week. The day-of-month / marker check is done by the caller in the location timezone.';

create function api.auto_schedule_candidates()
returns table (
  tenant_id uuid,
  location_id uuid,
  timezone text,
  auto_create_day_of_month integer,
  auto_create_last_generated_month date,
  required_headcount_by_weekday jsonb,
  max_monthly_hours integer,
  max_weekly_hours integer,
  max_days_per_week integer
)
language sql
security invoker
set search_path = workforce, public
as $$
  select * from workforce.auto_schedule_candidates();
$$;

comment on function api.auto_schedule_candidates() is
  'Invoker-only passthrough to workforce.auto_schedule_candidates (ADR 0008). service_role only.';

revoke all on function workforce.auto_schedule_candidates() from public, anon, authenticated;
grant execute on function workforce.auto_schedule_candidates() to service_role;

revoke all on function api.auto_schedule_candidates() from public, anon, authenticated;
grant execute on function api.auto_schedule_candidates() to service_role;
