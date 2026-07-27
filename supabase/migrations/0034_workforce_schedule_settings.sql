-- Workforce schedule rules per tenant/location.
-- Manager-facing settings used by automatic distribution and the Cafe UI.
create table if not exists workforce.schedule_settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  location_id uuid not null,
  required_headcount_by_weekday jsonb not null default '[3,3,3,3,3,2,4]'::jsonb,
  max_monthly_hours integer not null default 160,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, location_id),
  foreign key (tenant_id, location_id) references core.locations(tenant_id, id),
  check (jsonb_typeof(required_headcount_by_weekday) = 'array'),
  check (jsonb_array_length(required_headcount_by_weekday) = 7),
  check (max_monthly_hours between 0 and 744)
);

drop trigger if exists set_updated_at on workforce.schedule_settings;
create trigger set_updated_at before update on workforce.schedule_settings
  for each row execute function core.set_updated_at();

alter table workforce.schedule_settings enable row level security;

create policy wf_schedule_settings_read on workforce.schedule_settings
  for select
  using (core.has_permission(tenant_id, 'workforce.shift.read', location_id));

create policy wf_schedule_settings_write on workforce.schedule_settings
  for all
  using (core.has_permission(tenant_id, 'workforce.shift.write', location_id))
  with check (core.has_permission(tenant_id, 'workforce.shift.write', location_id));

create view api.workforce_schedule_settings
  with (security_invoker = true) as
select tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, updated_at
from workforce.schedule_settings;

grant select, insert, update on workforce.schedule_settings to authenticated;
grant select, insert, update on api.workforce_schedule_settings to authenticated;
revoke all on api.workforce_schedule_settings from anon, public;
