-- ============================================================================
-- 0010  Module: booking  (services, staff, hours, slots, bookings, events)
-- ----------------------------------------------------------------------------
-- Source reference: tantik/line-app. Every table carries tenant_id; physical
-- scheduling carries location_id. Customer PII is encrypted + hashed.
-- ============================================================================

create schema if not exists booking;
comment on schema booking is 'Booking module: services, staff, bookings, reminders.';

do $$ begin
  create type booking.booking_status as enum (
    'pending', 'confirmed', 'cancelled', 'completed', 'no_show'
  );
exception when duplicate_object then null; end $$;

create table if not exists booking.services (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  location_id   uuid references core.locations(id) on delete cascade,
  name          text not null,
  duration_minutes integer not null default 60,
  price_cents   integer not null default 0,
  currency      text not null default 'JPY',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (duration_minutes > 0)
);
create index if not exists bk_services_tenant_idx on booking.services(tenant_id);

create table if not exists booking.staff (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  location_id   uuid references core.locations(id) on delete cascade,
  user_id       uuid references core.users(id) on delete set null,
  name          text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists bk_staff_tenant_idx on booking.staff(tenant_id);

create table if not exists booking.business_hours (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  location_id   uuid not null references core.locations(id) on delete cascade,
  weekday       smallint not null,          -- 0=Sunday .. 6=Saturday
  opens_at      time not null,
  closes_at     time not null,
  check (weekday between 0 and 6),
  check (closes_at > opens_at)
);
create index if not exists bk_hours_tenant_idx on booking.business_hours(tenant_id, location_id);

create table if not exists booking.blocked_slots (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  location_id   uuid not null references core.locations(id) on delete cascade,
  staff_id      uuid references booking.staff(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  reason        text,
  check (ends_at > starts_at)
);
create index if not exists bk_blocked_tenant_idx on booking.blocked_slots(tenant_id, starts_at);

create table if not exists booking.bookings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  location_id   uuid not null references core.locations(id) on delete cascade,
  service_id    uuid references booking.services(id) on delete set null,
  staff_id      uuid references booking.staff(id) on delete set null,
  -- Customer PII: encrypted blobs + searchable blind-index hashes.
  customer_name_encrypted  bytea,
  customer_phone_encrypted bytea,
  customer_phone_hash      text,
  customer_email_encrypted bytea,
  customer_email_hash      text,
  line_account_id uuid references core.line_accounts(id) on delete set null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        booking.booking_status not null default 'pending',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists bk_bookings_tenant_idx on booking.bookings(tenant_id, starts_at);
create index if not exists bk_bookings_phone_hash_idx on booking.bookings(tenant_id, customer_phone_hash);

-- Append-only domain event log for bookings (reminders, status changes) -----
create table if not exists booking.booking_events (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  booking_id    uuid not null references booking.bookings(id) on delete cascade,
  event_type    text not null,             -- created | confirmed | reminded | cancelled
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists bk_events_tenant_idx on booking.booking_events(tenant_id, booking_id);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'booking.services','booking.staff','booking.bookings'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on %s; '
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t, t);
  end loop;
end $$;

-- RLS -----------------------------------------------------------------------
alter table booking.services       enable row level security;
alter table booking.staff          enable row level security;
alter table booking.business_hours enable row level security;
alter table booking.blocked_slots  enable row level security;
alter table booking.bookings       enable row level security;
alter table booking.booking_events enable row level security;

-- services / staff / hours / slots: read for booking readers, manage gated.
drop policy if exists bk_services_read on booking.services;
create policy bk_services_read on booking.services
  for select using (core.has_permission(tenant_id, 'booking.booking.read', location_id));
drop policy if exists bk_services_write on booking.services;
create policy bk_services_write on booking.services
  for all using (core.has_permission(tenant_id, 'booking.service.manage', location_id))
  with check (core.has_permission(tenant_id, 'booking.service.manage', location_id));

drop policy if exists bk_staff_read on booking.staff;
create policy bk_staff_read on booking.staff
  for select using (core.has_permission(tenant_id, 'booking.booking.read', location_id));
drop policy if exists bk_staff_write on booking.staff;
create policy bk_staff_write on booking.staff
  for all using (core.has_permission(tenant_id, 'booking.service.manage', location_id))
  with check (core.has_permission(tenant_id, 'booking.service.manage', location_id));

drop policy if exists bk_hours_rw on booking.business_hours;
create policy bk_hours_rw on booking.business_hours
  for all using (core.has_permission(tenant_id, 'booking.service.manage', location_id))
  with check (core.has_permission(tenant_id, 'booking.service.manage', location_id));
drop policy if exists bk_hours_read on booking.business_hours;
create policy bk_hours_read on booking.business_hours
  for select using (core.has_permission(tenant_id, 'booking.booking.read', location_id));

drop policy if exists bk_blocked_rw on booking.blocked_slots;
create policy bk_blocked_rw on booking.blocked_slots
  for all using (core.has_permission(tenant_id, 'booking.service.manage', location_id))
  with check (core.has_permission(tenant_id, 'booking.service.manage', location_id));

-- bookings: read for readers, write for writers.
drop policy if exists bk_bookings_read on booking.bookings;
create policy bk_bookings_read on booking.bookings
  for select using (core.has_permission(tenant_id, 'booking.booking.read', location_id));
drop policy if exists bk_bookings_write on booking.bookings;
create policy bk_bookings_write on booking.bookings
  for all using (core.has_permission(tenant_id, 'booking.booking.write', location_id))
  with check (core.has_permission(tenant_id, 'booking.booking.write', location_id));

drop policy if exists bk_events_read on booking.booking_events;
create policy bk_events_read on booking.booking_events
  for select using (core.has_permission(tenant_id, 'booking.booking.read'));
