-- ============================================================================
-- 0009  Module: workforce  (employees, shifts, requests, leave, attendance)
-- ----------------------------------------------------------------------------
-- Source reference: tantik/cafe-shift. Every table carries tenant_id; physical
-- assignment carries location_id.
-- ============================================================================

create schema if not exists workforce;
comment on schema workforce is 'Workforce module: employees, shifts, attendance.';

do $$ begin
  create type workforce.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type workforce.attendance_status as enum ('present', 'late', 'absent', 'on_leave');
exception when duplicate_object then null; end $$;

-- Employees (tenant staff profiles for scheduling) --------------------------
create table if not exists workforce.employees (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  location_id   uuid references core.locations(id) on delete set null,
  user_id       uuid references core.users(id) on delete set null,
  -- PII: employee name stored encrypted + searchable hash.
  name_encrypted bytea not null,
  name_hash     text,
  position      text,
  employment_type text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists wf_employees_tenant_idx on workforce.employees(tenant_id);

create table if not exists workforce.shifts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  location_id uuid not null references core.locations(id) on delete cascade,
  employee_id uuid references workforce.employees(id) on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  role        text,
  notes       text,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists wf_shifts_tenant_idx on workforce.shifts(tenant_id, starts_at);

create table if not exists workforce.shift_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  location_id uuid references core.locations(id) on delete set null,
  employee_id uuid not null references workforce.employees(id) on delete cascade,
  shift_id    uuid references workforce.shifts(id) on delete set null,
  kind        text not null default 'swap',  -- swap | pickup | drop
  status      workforce.request_status not null default 'pending',
  details     jsonb not null default '{}'::jsonb,
  decided_by  uuid references core.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists wf_shift_requests_tenant_idx on workforce.shift_requests(tenant_id, status);

create table if not exists workforce.leave_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  location_id uuid references core.locations(id) on delete set null,
  employee_id uuid not null references workforce.employees(id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  reason      text,
  status      workforce.request_status not null default 'pending',
  decided_by  uuid references core.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists wf_leave_requests_tenant_idx on workforce.leave_requests(tenant_id, status);

create table if not exists workforce.attendance (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  location_id uuid not null references core.locations(id) on delete cascade,
  employee_id uuid not null references workforce.employees(id) on delete cascade,
  shift_id    uuid references workforce.shifts(id) on delete set null,
  work_date   date not null,
  clock_in    timestamptz,
  clock_out   timestamptz,
  status      workforce.attendance_status not null default 'present',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists wf_attendance_tenant_idx on workforce.attendance(tenant_id, work_date);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'workforce.employees','workforce.shifts','workforce.shift_requests',
    'workforce.leave_requests','workforce.attendance'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on %s; '
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t, t);
  end loop;
end $$;

-- RLS -----------------------------------------------------------------------
alter table workforce.employees       enable row level security;
alter table workforce.shifts          enable row level security;
alter table workforce.shift_requests  enable row level security;
alter table workforce.leave_requests  enable row level security;
alter table workforce.attendance      enable row level security;

-- employees
drop policy if exists wf_employees_read on workforce.employees;
create policy wf_employees_read on workforce.employees
  for select using (core.has_permission(tenant_id, 'workforce.shift.read', location_id));
drop policy if exists wf_employees_write on workforce.employees;
create policy wf_employees_write on workforce.employees
  for all using (core.has_permission(tenant_id, 'workforce.shift.write', location_id))
  with check (core.has_permission(tenant_id, 'workforce.shift.write', location_id));

-- shifts
drop policy if exists wf_shifts_read on workforce.shifts;
create policy wf_shifts_read on workforce.shifts
  for select using (core.has_permission(tenant_id, 'workforce.shift.read', location_id));
drop policy if exists wf_shifts_write on workforce.shifts;
create policy wf_shifts_write on workforce.shifts
  for all using (core.has_permission(tenant_id, 'workforce.shift.write', location_id))
  with check (core.has_permission(tenant_id, 'workforce.shift.write', location_id));

-- shift_requests (read for shift readers; decisions need request.manage)
drop policy if exists wf_shift_requests_read on workforce.shift_requests;
create policy wf_shift_requests_read on workforce.shift_requests
  for select using (core.has_permission(tenant_id, 'workforce.shift.read', location_id));
drop policy if exists wf_shift_requests_write on workforce.shift_requests;
create policy wf_shift_requests_write on workforce.shift_requests
  for all using (core.has_permission(tenant_id, 'workforce.request.manage', location_id))
  with check (core.has_permission(tenant_id, 'workforce.request.manage', location_id));

-- leave_requests
drop policy if exists wf_leave_requests_read on workforce.leave_requests;
create policy wf_leave_requests_read on workforce.leave_requests
  for select using (core.has_permission(tenant_id, 'workforce.shift.read', location_id));
drop policy if exists wf_leave_requests_write on workforce.leave_requests;
create policy wf_leave_requests_write on workforce.leave_requests
  for all using (core.has_permission(tenant_id, 'workforce.request.manage', location_id))
  with check (core.has_permission(tenant_id, 'workforce.request.manage', location_id));

-- attendance
drop policy if exists wf_attendance_rw on workforce.attendance;
create policy wf_attendance_rw on workforce.attendance
  for all using (core.has_permission(tenant_id, 'workforce.attendance.manage', location_id))
  with check (core.has_permission(tenant_id, 'workforce.attendance.manage', location_id));
