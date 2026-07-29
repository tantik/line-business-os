-- ============================================================================
-- 0035  Inventory: catalog items + stock count history (Daily Stock Check MVP)
-- ----------------------------------------------------------------------------
-- First capability of the new reusable top-level `inventory` module (ADR
-- 0010; `core.module_code` already includes 'inventory', added in
-- 0001_core_enums.sql -- no enum change needed here). Not Cafe- or
-- Mame-To-Cha-specific: any tenant/location can use this once the `inventory`
-- module is enabled for it (see core.tenant_modules).
--
-- Schema-only phase, mirroring the 0021/0022/0023 workforce-recipes split:
-- this migration creates the schema/tables/permissions with RLS enabled and
-- zero policies (fully closed); policies land in 0036, the read facade in
-- 0037, the write facade in 0038.
--
-- Data model (kept intentionally minimal but extensible -- see docs/roadmap
-- note added alongside this migration for the deferred supplier/purchase/
-- cost/expiry/batch/waste/QR/barcode/movement/analytics scope):
--   * inventory.items -- catalog of trackable items, one row per
--     tenant+location+item. Unlike workforce.recipes (nullable location_id
--     for tenant-wide-or-location), inventory items are always
--     location-scoped: required stock and what needs restocking is
--     inherently a per-store fact, so location_id is NOT NULL here.
--   * inventory.stock_counts -- append-only history of actual-quantity
--     entries. Never updated or deleted (no UPDATE/DELETE RLS policy in
--     0036, matching audit.audit_logs' immutability posture) -- "current
--     state" is derived (0037's api.inventory_item_status view: latest count
--     per item, joined with the item's required_quantity), never a
--     separately-stored column that could drift out of sync with the
--     history it summarizes.
--
-- Cross-tenant FK strategy: same composite-FK convention as
-- 0021_workforce_recipes.sql -- every child row's FK is
-- `(tenant_id, parent_id) references parent(tenant_id, id)`, never a bare
-- `parent_id references parent(id)`, so "a child row can only ever point at
-- a parent row in the same tenant" is a hard, database-enforced constraint.
-- core.locations already has `unique (tenant_id, id)` (added by 0021), so no
-- further core.locations change is needed here.
-- ============================================================================

create schema if not exists inventory;

-- Items ----------------------------------------------------------------------
create table if not exists inventory.items (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenants(id) on delete cascade,
  location_id         uuid not null,
  name                text not null check (char_length(btrim(name)) between 1 and 120),
  unit                text not null check (unit in ('kg', 'g', 'L', 'mL', 'pcs')),
  required_quantity   numeric(12, 3) not null default 0 check (required_quantity >= 0),
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  created_by          uuid references core.users(id),
  updated_by          uuid references core.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  -- Composite FK: an item's location must belong to the same tenant_id.
  -- Deliberately no `on delete set null`/`cascade` here, matching
  -- 0021_workforce_recipes.sql's reasoning: a composite FK's cascade would
  -- have to touch tenant_id too, which must never be mutated by an unrelated
  -- location delete. Default NO ACTION blocks deleting a location that still
  -- has items until they are reassigned or deactivated first.
  constraint inventory_items_location_tenant_fkey
    foreign key (tenant_id, location_id)
      references core.locations(tenant_id, id)
);
create index if not exists inv_items_tenant_location_idx
  on inventory.items(tenant_id, location_id, is_active, sort_order);
comment on table inventory.items is 'Inventory catalog items (Daily Stock Check). Always location-scoped: location_id is NOT NULL. Deactivate via is_active=false; never hard-deleted once counted.';
comment on column inventory.items.unit is 'Constrained unit label (text + check, matching workforce.recipes.status precedent -- single-table, still-evolving list, easy to extend with a plain ALTER ... CHECK later; not a Postgres enum).';
comment on column inventory.items.required_quantity is 'Manager-set minimum/target quantity. Source of truth for shortage calculation, always computed server-side as greatest(required_quantity - actual_quantity, 0).';

-- Stock counts (append-only history) ------------------------------------------
create table if not exists inventory.stock_counts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  location_id       uuid not null,
  item_id           uuid not null,
  actual_quantity   numeric(12, 3) not null check (actual_quantity >= 0),
  counted_by        uuid not null references core.users(id),
  -- clock_timestamp(), not now(): now() is frozen at transaction start, so
  -- two counts recorded in the same transaction (e.g. a batch/test) would
  -- otherwise tie exactly and make "most recent count" ordering undefined.
  -- clock_timestamp() advances per-statement, giving a real, strictly
  -- monotonic ordering regardless of transaction boundaries.
  counted_at        timestamptz not null default clock_timestamp(),
  created_at        timestamptz not null default now(),
  foreign key (tenant_id, item_id)
    references inventory.items(tenant_id, id),
  constraint inventory_stock_counts_location_tenant_fkey
    foreign key (tenant_id, location_id)
      references core.locations(tenant_id, id)
);
create index if not exists inv_stock_counts_item_latest_idx
  on inventory.stock_counts(tenant_id, item_id, counted_at desc);
create index if not exists inv_stock_counts_tenant_location_idx
  on inventory.stock_counts(tenant_id, location_id, counted_at desc);
comment on table inventory.stock_counts is 'Append-only actual-quantity entries ("final counted-or-purchased total", MVP semantics -- not a delta/movement ledger). No UPDATE/DELETE policy is ever added (0036): history is immutable, matching audit.audit_logs.';

-- updated_at trigger (inventory.items only -- stock_counts is append-only,
-- has no updated_at column to maintain).
drop trigger if exists set_updated_at on inventory.items;
create trigger set_updated_at before update on inventory.items
  for each row execute function core.set_updated_at();

-- Server-stamped created_by/updated_by -- matches
-- workforce.stamp_shift_request_decision's precedent (0031): a plain
-- (non-DEFINER) trigger function stamps the actor from
-- core.current_user_id(), so a Server Action never needs to (and never can)
-- pass created_by/updated_by as client input. This is this module's audit
-- trail for "who created/last edited this catalog item" -- apps/web has no
-- service-role client (never introduced, per this codebase's hard
-- constraint against bundling service_role into the frontend app), so a
-- direct audit.audit_logs write (which requires service-role, see
-- packages/core/src/audit.ts) is not wired for Inventory; this
-- trigger-stamped column pair is the same posture already used by
-- workforce.recipes.created_by/updated_by.
create or replace function inventory.stamp_item_actor()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := core.current_user_id();
  end if;
  new.updated_by := core.current_user_id();
  return new;
end;
$$;

comment on function inventory.stamp_item_actor() is
  'BEFORE INSERT/UPDATE trigger: stamps created_by (insert only) and updated_by (every write) with core.current_user_id(). Plain (invoker) trigger function, not SECURITY DEFINER -- neither column is ever accepted from the client directly.';

drop trigger if exists stamp_item_actor on inventory.items;
create trigger stamp_item_actor
  before insert or update on inventory.items
  for each row execute function inventory.stamp_item_actor();

-- RLS -------------------------------------------------------------------------
-- Enabled immediately; no policies added in this migration (see header note).
alter table inventory.items         enable row level security;
alter table inventory.stock_counts  enable row level security;

-- Permission catalog ------------------------------------------------------
insert into core.permissions (key, module, description) values
  ('inventory.item.read',    'inventory', 'View inventory items and current stock status'),
  ('inventory.item.manage',  'inventory', 'Create / edit / deactivate inventory catalog items'),
  ('inventory.count.write',  'inventory', 'Record a new actual stock count for an item')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Role -> permission mappings. Owner/admin/manager get all three; employee
-- gets item.read + count.write only (matches the brief's staff permission
-- model: staff can read status and record counts, but cannot manage the
-- catalog or change required quantities).
do $$
declare
  r_owner   uuid := '00000000-0000-0000-0000-000000000003';
  r_admin   uuid := '00000000-0000-0000-0000-000000000004';
  r_manager uuid := '00000000-0000-0000-0000-000000000005';
  r_emp     uuid := '00000000-0000-0000-0000-000000000006';
begin
  insert into core.role_permissions (role_id, permission_key) values
    (r_owner,   'inventory.item.read'),
    (r_owner,   'inventory.item.manage'),
    (r_owner,   'inventory.count.write'),
    (r_admin,   'inventory.item.read'),
    (r_admin,   'inventory.item.manage'),
    (r_admin,   'inventory.count.write'),
    (r_manager, 'inventory.item.read'),
    (r_manager, 'inventory.item.manage'),
    (r_manager, 'inventory.count.write'),
    (r_emp,     'inventory.item.read'),
    (r_emp,     'inventory.count.write')
  on conflict do nothing;
end $$;
