-- Auto Scheduling completion mission (2026-09-04): the scheduled-monthly
-- generation trigger needs two things `workforce.schedule_settings` cannot
-- currently express:
--   1. An explicit ON/OFF toggle. `auto_create_day_of_month` (0080) is
--      "not null default 20" -- every location already has *some* value,
--      so it cannot itself mean "automatic scheduling is enabled" without
--      silently turning automation on for every existing tenant/location.
--      A real boolean, defaulting OFF, is required so a Manager must
--      explicitly opt in (product contract: "Manager can enable automatic
--      scheduling").
--   2. An idempotency marker. The scheduled worker (`apps/worker`) may run
--      more than once on the same trigger day (retry, restart, overlapping
--      cron tick); without a persisted "already generated for month X"
--      marker it would have no reliable way to avoid creating a second,
--      duplicate draft proposal for the same target month. Draft shift rows
--      themselves are not a reliable marker -- a Manager may have already
--      reviewed/published/cleared them by the time the job runs again.
--
-- Both are small, additive, backward-compatible columns on the existing
-- per-tenant/location settings row -- no new table, no behavior change for
-- any existing reader of `workforce_schedule_settings` (the view is
-- recreated with the two new columns appended, same as 0080 did for
-- `auto_create_day_of_month`).
--
-- Rollback: `alter table workforce.schedule_settings drop column
-- auto_create_enabled, drop column auto_create_last_generated_month;` then
-- recreate `api.workforce_schedule_settings` from 0080's definition. Purely
-- additive -- safe to roll back at any time, no data loss for any other
-- column.

alter table workforce.schedule_settings
  add column if not exists auto_create_enabled boolean not null default false,
  add column if not exists auto_create_last_generated_month date;

comment on column workforce.schedule_settings.auto_create_enabled is
  'Manager opt-in for scheduled monthly auto-create. Default OFF -- automation never runs for a location until a Manager explicitly turns it on.';
comment on column workforce.schedule_settings.auto_create_last_generated_month is
  'First-of-month date of the last calendar month the scheduled worker successfully generated a proposal for (idempotency marker; NULL = never run). Never written by the interactive manual "auto-create" Server Action -- only the scheduled worker sets this, so a manual regeneration never blocks (or is blocked by) the next scheduled run.';

-- Recreate the read-only api view to include the two new columns (views
-- don't pick up table changes automatically).
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
  updated_at
from workforce.schedule_settings;

grant select, insert, update on api.workforce_schedule_settings to authenticated;
revoke all on api.workforce_schedule_settings from anon, public;
