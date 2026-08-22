-- Weekly Schedule Round 3 (2026-08-22): the Manager Settings "Automatic
-- schedule" subsection's "Create automatically on [day]" input was a
-- disabled, always-20 visual preview (no real scheduled-automation backend
-- exists yet). Founder direction: the day-of-month value itself should be a
-- real, manager-editable, persisted setting now, even though the automation
-- job that will eventually read it is still a separate, not-yet-built
-- capability -- same "config exists, feature not wired yet" shape as this
-- table's other columns had before their own read/write paths were built.
alter table workforce.schedule_settings
  add column if not exists auto_create_day_of_month integer not null default 20
    check (auto_create_day_of_month between 1 and 28);

-- Recreate the read-only api view to include the new column (views don't
-- pick up table changes automatically).
drop view if exists api.workforce_schedule_settings;
create view api.workforce_schedule_settings
  with (security_invoker = true) as
select tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, auto_create_day_of_month, updated_at
from workforce.schedule_settings;

grant select, insert, update on api.workforce_schedule_settings to authenticated;
revoke all on api.workforce_schedule_settings from anon, public;
