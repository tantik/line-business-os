-- ============================================================================
-- 0029  Workforce Cafe v0.1: employee_line_links (LINE binding foundation)
--       (Slice 1A)
-- ----------------------------------------------------------------------------
-- New table. Foundation only -- no LIFF UI, no binding flow, no LINE webhook
-- wiring in this slice (all explicitly out of scope per the task brief). This
-- just gives a later slice a tenant-safe place to persist which LINE user id
-- is bound to which workforce.employees row, following the same
-- encrypted-value + blind-index-hash PII pattern core.line_accounts already
-- established (0004_line_registry.sql) for LINE user ids: the raw LINE user
-- id is never stored in plaintext; line_user_id_hash is a deterministic
-- blind-index hash used only for uniqueness/lookup, computed at the app
-- layer (no DB-side crypto function is added here).
--
-- Cross-tenant FK strategy: workforce.employees gets a `unique (tenant_id,
-- id)` constraint here (first table needing a composite FK into employees --
-- same pattern as 0021/0025/0027 adding it to core.locations/shift_types/
-- attendance the first time each was needed), so employee_line_links.employee_id
-- is a composite `(tenant_id, employee_id) references
-- employees(tenant_id, id)` -- a binding can never point at another tenant's
-- employee row.
--
-- Access model: manager-only, gated on workforce.staff.manage (0020) -- the
-- same permission that already gates full employees management. This table
-- carries no location_id column of its own (a binding's "location" is
-- whatever its linked employee's location_id is), so visibility uses
-- core.has_permission_in_tenant (0022) rather than core.has_permission --
-- same reasoning as 0022's workforce.recipe_categories: a manager scoped to a
-- single location must still be able to manage bindings tenant-wide, not be
-- excluded because this table has no location column to match against. No
-- staff self-read/self-write policy exists here at all: an employee never
-- reads or edits their own LINE binding row directly; binding is something a
-- manager (or a later, explicitly-designed LIFF linking flow running with its
-- own narrowly-scoped access) performs. anon receives no grant.
-- ============================================================================

alter table workforce.employees
  add constraint employees_tenant_id_id_key unique (tenant_id, id);

create table if not exists workforce.employee_line_links (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references core.tenants(id) on delete cascade,
  employee_id             uuid not null,
  -- PII: LINE user id is stored encrypted + blind-index hash, never plaintext.
  line_user_id_encrypted  bytea not null,
  line_user_id_hash       text not null,
  is_active               boolean not null default true,
  linked_at               timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references core.users(id),
  updated_by              uuid references core.users(id),
  unique (tenant_id, line_user_id_hash),
  constraint employee_line_links_employee_tenant_fkey
    foreign key (tenant_id, employee_id)
      references workforce.employees(tenant_id, id) on delete cascade
);
create index if not exists wf_employee_line_links_tenant_idx
  on workforce.employee_line_links(tenant_id, employee_id);

-- One active binding per employee: a second `is_active = true` row for the
-- same employee_id is rejected at the DB layer -- rebinding must first
-- deactivate the existing row (an UPDATE), never leave two active bindings.
create unique index if not exists wf_employee_line_links_one_active_per_employee
  on workforce.employee_line_links(employee_id)
  where is_active = true;

comment on table workforce.employee_line_links is
  'LINE user id <-> workforce.employees binding foundation (PII-protected, encrypted + blind-index hash). Manager-only access via workforce.staff.manage. No LIFF/webhook wiring yet -- schema foundation only.';

drop trigger if exists set_updated_at on workforce.employee_line_links;
create trigger set_updated_at before update on workforce.employee_line_links
  for each row execute function core.set_updated_at();

-- RLS -------------------------------------------------------------------------
alter table workforce.employee_line_links enable row level security;

create policy wf_employee_line_links_manage on workforce.employee_line_links
  for all
  using (core.has_permission_in_tenant(tenant_id, 'workforce.staff.manage'))
  with check (core.has_permission_in_tenant(tenant_id, 'workforce.staff.manage'));

-- Grants ------------------------------------------------------------------
grant select, insert, update on workforce.employee_line_links to authenticated;
