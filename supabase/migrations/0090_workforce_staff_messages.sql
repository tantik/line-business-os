-- ============================================================================
-- 0090  Workforce: Staff<->Manager Mail module (workforce.staff_messages)
-- ----------------------------------------------------------------------------
-- Replaces the dead-end `workforce.attendance.daily_message` single-value
-- column (only ever surfaced to a Manager by accident, inside the Correction
-- Requests popup, only when a correction happens to reference that same
-- attendance row -- confirmed live on preview.oruwa.jp, 2026-08-25) with a
-- real two-way messaging module: one thread per employee (keyed by
-- `employee_id`), bidirectional from the start (`sender_role` staff/manager
-- both write into the same thread). `workforce.attendance.daily_message` is
-- left entirely alone -- historical record only, no column drop, no data
-- migration.
--
-- Modeled on 0044_workforce_shift_exchanges.sql's new-table+RLS shape (guard
-- trigger restricting UPDATE to status columns only, `unique(tenant_id, id)`,
-- composite tenant-safe FKs) and 0027/0028's self-scope policy pattern
-- (`workforce.is_own_employee(employee_id)`). Rides the existing
-- `workforce.attendance.manage` permission key for the Manager side (already
-- gates Manager's attendance/correction surface) -- no new permission key.
--
-- No `work_date` column: a general conversation isn't tied to one calendar
-- day, unlike attendance/shift_requests -- ordering/threading is by
-- `created_at`. Soft-delete (`deleted_at`) is distinct from archive
-- (`archived_at`), matching this schema's explicit no-hard-delete convention
-- (see 0027's own comment) -- a deleted row is never removed, only flagged;
-- `api.workforce_staff_messages` below is a plain passthrough with no
-- deleted/archived filter, matching the plan's "no RPC needed" shape -- the
-- app layer (staff-messages.ts) is responsible for hiding deleted/archived
-- rows from the rendered thread, the same way `manager-dashboard-client.tsx`
-- already splits `pendingCorrections`/`decidedCorrections` client-side rather
-- than filtering them out of the DB read.
-- ============================================================================

create table workforce.staff_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  location_id uuid not null,
  -- Whose thread this belongs to -- both directions (staff and manager) read
  -- and write into the same thread, keyed by employee, not by sender.
  employee_id uuid not null,
  sender_role text not null check (sender_role in ('staff', 'manager')),
  -- Server-set from core.current_user_id() at insert time -- never
  -- client-supplied (enforced by the self_insert/manage_insert RLS policies
  -- below, not by this column alone).
  sender_user_id uuid not null references core.users(id),
  body text not null check (length(body) between 1 and 500),
  is_read boolean not null default false,
  -- Server-stamped by workforce.stamp_staff_message_read (below) the moment
  -- is_read flips to true -- never client-writable in practice (an RLS
  -- caller may still supply a value directly, but the trigger always
  -- overwrites it on the exact transition, and the guard trigger keeps every
  -- other column immutable regardless).
  read_at timestamptz,
  read_by uuid references core.users(id),
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, location_id)
    references core.locations(tenant_id, id),
  foreign key (tenant_id, employee_id)
    references workforce.employees(tenant_id, id),
  constraint staff_messages_is_read_matches_read_at
    check (is_read = (read_at is not null)),
  constraint staff_messages_read_by_requires_read_at
    check (read_by is null or read_at is not null)
);

comment on table workforce.staff_messages is
  'Staff<->Manager Mail: one thread per employee_id, bidirectional (sender_role staff/manager). Replaces workforce.attendance.daily_message as the real two-way messaging surface -- that column is untouched, historical only. No work_date: a general conversation is not tied to one calendar day.';
comment on column workforce.staff_messages.employee_id is
  'Whose thread this message belongs to -- both a staff-authored and a manager-authored message in the same conversation share this same employee_id.';
comment on column workforce.staff_messages.sender_user_id is
  'core.current_user_id() at insert time -- always the actual caller, enforced by RLS (self_insert/manage_insert), never a client-chosen value.';
comment on column workforce.staff_messages.read_at is
  'Server-stamped by the stamp_staff_message_read trigger the moment is_read transitions to true. Never client-writable in effect.';
comment on column workforce.staff_messages.deleted_at is
  'Soft-delete, distinct from archived_at -- no hard delete (matches this schema''s existing convention, see 0027). Rows are never physically removed.';

create index wf_staff_messages_thread_idx
  on workforce.staff_messages (tenant_id, employee_id, created_at desc);
create index wf_staff_messages_location_idx
  on workforce.staff_messages (tenant_id, location_id, created_at desc)
  where deleted_at is null;

create trigger set_updated_at
  before update on workforce.staff_messages
  for each row execute function core.set_updated_at();

-- --- Guard trigger: only status columns are ever mutable after insert ------
-- Neither side can edit body, reassign the thread (tenant_id/location_id/
-- employee_id), or spoof sender_role/sender_user_id after the fact. Modeled
-- on 0044's guard_shift_exchange_update -- a plain (invoker) trigger
-- function, no elevated privilege needed, it only ever compares OLD vs NEW.
create or replace function workforce.guard_staff_message_update()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id <> old.tenant_id
     or new.location_id <> old.location_id
     or new.employee_id <> old.employee_id
     or new.sender_role <> old.sender_role
     or new.sender_user_id <> old.sender_user_id
     or new.body <> old.body
     or new.created_at <> old.created_at then
    raise exception 'staff_message_immutable_fields' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function workforce.guard_staff_message_update() is
  'BEFORE UPDATE trigger: only is_read/read_at/read_by/archived_at/deleted_at/updated_at may ever change after insert -- every other column (tenant_id/location_id/employee_id/sender_role/sender_user_id/body/created_at) is immutable. Mirrors 0044''s guard_shift_exchange_update.';

create trigger guard_staff_message_update
  before update on workforce.staff_messages
  for each row execute function workforce.guard_staff_message_update();

-- --- Stamping trigger: server-stamps read_at/read_by ------------------------
-- Plain (invoker) trigger function, matching core.set_updated_at's and
-- workforce.stamp_shift_request_decision's own convention (0031) -- runs as
-- whichever role performs the UPDATE, so core.current_user_id() resolves to
-- that same session's caller.
create or replace function workforce.stamp_staff_message_read()
returns trigger
language plpgsql
as $$
begin
  if new.is_read = true and old.is_read = false then
    new.read_at := clock_timestamp();
    new.read_by := core.current_user_id();
  elsif new.is_read = false then
    new.read_at := null;
    new.read_by := null;
  end if;
  return new;
end;
$$;

comment on function workforce.stamp_staff_message_read() is
  'BEFORE UPDATE trigger: stamps read_at/read_by with now()/the calling user the moment is_read first flips to true; clears both if is_read is ever set back to false. No client-supplied timestamp/identity is ever trusted for this. Mirrors 0031''s stamp_shift_request_decision.';

create trigger stamp_staff_message_read
  before update on workforce.staff_messages
  for each row execute function workforce.stamp_staff_message_read();

-- RLS -------------------------------------------------------------------------
alter table workforce.staff_messages enable row level security;

create policy wf_staff_messages_self_select on workforce.staff_messages
  for select
  using (workforce.is_own_employee(employee_id));

create policy wf_staff_messages_self_insert on workforce.staff_messages
  for insert
  with check (
    workforce.is_own_employee(employee_id)
    and sender_role = 'staff'
    and sender_user_id = core.current_user_id()
    and is_read = false
    and read_at is null
    and read_by is null
    and archived_at is null
    and deleted_at is null
  );

-- New vs. the earlier Staff->Manager-only draft: a staff member can mark a
-- manager's message read/archived/deleted from the Staff side too. Column
-- immutability (body/sender_role/etc. can never change) is enforced by the
-- guard trigger above, not by this policy's predicate.
create policy wf_staff_messages_self_update on workforce.staff_messages
  for update
  using (workforce.is_own_employee(employee_id))
  with check (workforce.is_own_employee(employee_id));

create policy wf_staff_messages_manage_select on workforce.staff_messages
  for select
  using (core.has_permission(tenant_id, 'workforce.attendance.manage', location_id));

create policy wf_staff_messages_manage_insert on workforce.staff_messages
  for insert
  with check (
    core.has_permission(tenant_id, 'workforce.attendance.manage', location_id)
    and sender_role = 'manager'
    and sender_user_id = core.current_user_id()
    and is_read = false
    and read_at is null
    and read_by is null
    and archived_at is null
    and deleted_at is null
    -- The target employee_id must be a real employee at this same
    -- tenant/location -- a Manager replies/composes into an existing
    -- employee's thread, never an arbitrary/forged id.
    and exists (
      select 1
      from workforce.employees e
      where e.tenant_id = staff_messages.tenant_id
        and e.id = staff_messages.employee_id
        and e.location_id = staff_messages.location_id
    )
  );

create policy wf_staff_messages_manage_update on workforce.staff_messages
  for update
  using (core.has_permission(tenant_id, 'workforce.attendance.manage', location_id))
  with check (core.has_permission(tenant_id, 'workforce.attendance.manage', location_id));

-- Grants ------------------------------------------------------------------
grant select, insert, update on workforce.staff_messages to authenticated;

create view api.workforce_staff_messages
  with (security_invoker = true) as
select
  m.id as message_id,
  m.tenant_id,
  m.location_id,
  m.employee_id,
  m.sender_role,
  m.sender_user_id,
  m.body,
  m.is_read,
  m.read_at,
  m.read_by,
  m.archived_at,
  m.deleted_at,
  m.created_at,
  m.updated_at
from workforce.staff_messages m;

comment on view api.workforce_staff_messages is
  'Plain passthrough over workforce.staff_messages -- relies entirely on that table''s RLS (self_select/self_insert/self_update, manage_select/manage_insert/manage_update). No deleted_at/archived_at filter here (the app layer hides those from the rendered thread) -- security_invoker view.';

grant select, insert, update on api.workforce_staff_messages to authenticated;
revoke all on api.workforce_staff_messages from anon, public;
