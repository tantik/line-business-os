-- ============================================================================
-- 0025  Workforce Cafe v0.1: shift_types (Slice 1A)
-- ----------------------------------------------------------------------------
-- New table: named, reusable local-time shift templates per location (e.g.
-- the demo's "1"/"2"/"3"/"通し" shifts, see phase-1j-2-cafe-workforce-demo-
-- to-production-plan.md §4). Forward-only addition; workforce.shifts is not
-- renamed (0009_workforce.sql stays immutable) -- 0026 extends it in place
-- with a nullable shift_type_id.
--
-- Cross-tenant FK strategy: `unique (tenant_id, id)` here (mirrors
-- 0021_workforce_recipes.sql) so 0026/0028's child FKs from
-- workforce.shifts/shift_requests are composite `(tenant_id, shift_type_id)
-- references shift_types(tenant_id, id)` -- a hard, database-enforced
-- guarantee that a shift/request can never point at another tenant's shift
-- type. Likewise `location_id` is a composite FK into
-- `core.locations(tenant_id, id)` (unique constraint added by
-- 0021_workforce_recipes.sql), so a shift type can never be assigned to a
-- location outside its own tenant.
--
-- starts_at_local/ends_at_local are plain `time` (not `timestamptz`): this is
-- a reusable daily template ("09:00-13:00"), not a specific occurrence -- the
-- concrete date/timezone resolution happens on workforce.shifts.
--
-- No created_by/updated_by on this table: unlike workforce.employee_line_links
-- (0029, in this same slice), Slice 1A's task brief does not list authorship
-- columns for shift_types, and templates are expected to be edited directly by
-- whichever manager is on shift, not audited per-edit at the DB layer yet
-- (full audit-log wiring is explicitly deferred, per the slice's confirmed
-- decisions).
-- ============================================================================

create table if not exists workforce.shift_types (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenants(id) on delete cascade,
  location_id      uuid not null,
  code             text not null,
  label_ja         text not null,
  label_en         text,
  starts_at_local  time not null,
  ends_at_local    time not null,
  break_minutes    integer not null default 0,
  is_custom        boolean not null default false,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, location_id, code),
  constraint shift_types_location_tenant_fkey
    foreign key (tenant_id, location_id)
      references core.locations(tenant_id, id),
  check (ends_at_local > starts_at_local),
  check (break_minutes >= 0)
);
create index if not exists wf_shift_types_tenant_idx
  on workforce.shift_types(tenant_id, location_id, is_active, sort_order);
comment on table workforce.shift_types is
  'Reusable named local-time shift templates per tenant/location (e.g. "1"/"2"/"3"/"通し"). Concrete occurrences live on workforce.shifts via the nullable shift_type_id added by 0026.';

drop trigger if exists set_updated_at on workforce.shift_types;
create trigger set_updated_at before update on workforce.shift_types
  for each row execute function core.set_updated_at();

-- RLS -------------------------------------------------------------------------
alter table workforce.shift_types enable row level security;

-- Read: same audience as workforce.shifts' historical read policy
-- (workforce.shift.read) -- both staff and managers hold this permission, so
-- both can see the tenant's shift-type catalog (needed to render the shift
-- legend / picker for either role).
create policy wf_shift_types_read on workforce.shift_types
  for select
  using (core.has_permission(tenant_id, 'workforce.shift.read', location_id));

-- Write: workforce.shift.write only (managers), matching workforce.shifts.
create policy wf_shift_types_write on workforce.shift_types
  for all
  using (core.has_permission(tenant_id, 'workforce.shift.write', location_id))
  with check (core.has_permission(tenant_id, 'workforce.shift.write', location_id));

-- Grants ------------------------------------------------------------------
-- authenticated needs ordinary table privileges for the RLS policies above to
-- engage at all (same dependency-grant pattern as 0023's facade tables).
-- anon receives nothing (fail-closed default; no grant statement needed).
grant select, insert, update on workforce.shift_types to authenticated;
