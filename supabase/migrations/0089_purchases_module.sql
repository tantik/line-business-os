-- ============================================================================
-- 0089  Purchases module: acknowledgement event log + read projection
-- ----------------------------------------------------------------------------
-- Purchases is a projection/workflow layer on top of the existing Inventory
-- module (Founder brief, 2026-08-24: "Purchases должен быть projection/
-- workflow поверх Inventory", "не создавай второй source of truth"). It adds
-- exactly one new persistent concept -- an immutable, append-only record of
-- "a staff member acknowledged buying this item" -- and otherwise reads
-- inventory.items / inventory.stock_counts directly. No new stock/quantity
-- storage is introduced; inventory.items.required_quantity/reorder_point and
-- inventory.stock_counts.actual_quantity (0035, 0046) remain the only source
-- of truth for what needs restocking.
--
-- Module gating: rides the existing `core.tenant_modules` 'inventory' flag
-- (Founder decision, this session) -- Purchases has no data without
-- Inventory enabled, so no new `core.module_code` enum value is added here.
--
-- Bought-state staleness (the central design question -- see plan section D):
-- purchase_actions.snapshot_stock_count_id pins an acknowledgement to the
-- exact inventory.stock_counts row that was "latest" at the moment Bought was
-- pressed. A row only reads as currently "bought" when that snapshot still
-- equals the item's current latest stock_counts row (api.purchases_needed
-- below, and the RLS insert check further down, both re-derive this at read/
-- write time). The moment a *new* stock count is recorded for that item
-- (through the existing, unmodified api.record_inventory_stock_count), the
-- old acknowledgement's snapshot no longer matches "latest" and the item
-- reverts to Pending (if still short) or drops out of the list entirely (if
-- now sufficient) -- Bought can never block or misrepresent Inventory's
-- current truth. This mirrors inventory.stock_counts' own append-only/
-- immutable posture (0035): no UPDATE/DELETE policy is ever added below.
-- ============================================================================

-- inventory.stock_counts currently has no unique(tenant_id, id) constraint
-- (only a bare `id` primary key) -- purchase_actions needs to reference it
-- via the codebase's standard composite (tenant_id, parent_id) FK convention
-- (see 0035's header note), which requires a matching unique constraint on
-- the referenced column pair. Purely additive: id is already globally
-- unique via the primary key, so this adds no new uniqueness requirement in
-- practice, just makes it usable as an FK target.
alter table inventory.stock_counts
  add constraint inventory_stock_counts_tenant_id_id_key unique (tenant_id, id);

create schema if not exists purchases;

-- Purchase actions (append-only acknowledgement log) --------------------------
create table if not exists purchases.purchase_actions (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null,
  location_id              uuid not null,
  item_id                  uuid not null,
  -- The inventory.stock_counts row that was "latest" for this item at the
  -- moment this acknowledgement was recorded -- see header note.
  snapshot_stock_count_id  uuid not null,
  actioned_by              uuid not null references core.users(id),
  actioned_at              timestamptz not null default clock_timestamp(),
  created_at               timestamptz not null default now(),
  foreign key (tenant_id, item_id)
    references inventory.items(tenant_id, id),
  foreign key (tenant_id, snapshot_stock_count_id)
    references inventory.stock_counts(tenant_id, id),
  constraint purchase_actions_location_tenant_fkey
    foreign key (tenant_id, location_id)
      references core.locations(tenant_id, id)
);
create index if not exists purchase_actions_item_latest_idx
  on purchases.purchase_actions(tenant_id, item_id, actioned_at desc);
create index if not exists purchase_actions_snapshot_idx
  on purchases.purchase_actions(tenant_id, item_id, snapshot_stock_count_id);
comment on table purchases.purchase_actions is
  'Append-only "marked as bought" acknowledgements. Never updated or deleted (no UPDATE/DELETE RLS policy below), matching inventory.stock_counts'' immutability posture. A row only represents the *current* Bought state for its item while snapshot_stock_count_id still equals that item''s latest inventory.stock_counts row -- see 0089''s header note and api.purchases_needed.';
comment on column purchases.purchase_actions.snapshot_stock_count_id is
  'The inventory.stock_counts row that was latest for this item when Bought was pressed. Recording a newer stock count for the item automatically makes this acknowledgement stale (it will no longer equal the new latest row), without editing or deleting this record.';

alter table purchases.purchase_actions enable row level security;

-- Permission catalog ------------------------------------------------------
-- `core.permissions.module` is typed `core.module_code`, which has no
-- 'purchases' value (Founder decision, this session: Purchases rides the
-- existing 'inventory' tenant-module flag rather than adding a new enum
-- value -- see header note). Tagged 'inventory' here for the same reason:
-- these permissions are only meaningful, and only ever granted, on a tenant
-- that already has 'inventory' enabled.
insert into core.permissions (key, module, description) values
  ('purchases.item.read',   'inventory', 'View items that currently need to be purchased'),
  ('purchases.action.write','inventory', 'Mark an inventory item as bought')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Role -> permission mappings. Owner/admin/manager/employee all get both --
-- unlike Inventory's item.manage split, Purchases has no catalog-editing
-- concept to restrict; every role that can see the shopping list can also
-- act on it (Founder brief section 16: Staff is the primary user, Manager
-- access is natural via the existing permission model, no new role needed).
do $$
declare
  r_owner   uuid := '00000000-0000-0000-0000-000000000003';
  r_admin   uuid := '00000000-0000-0000-0000-000000000004';
  r_manager uuid := '00000000-0000-0000-0000-000000000005';
  r_emp     uuid := '00000000-0000-0000-0000-000000000006';
begin
  insert into core.role_permissions (role_id, permission_key) values
    (r_owner,   'purchases.item.read'),
    (r_owner,   'purchases.action.write'),
    (r_admin,   'purchases.item.read'),
    (r_admin,   'purchases.action.write'),
    (r_manager, 'purchases.item.read'),
    (r_manager, 'purchases.action.write'),
    (r_emp,     'purchases.item.read'),
    (r_emp,     'purchases.action.write')
  on conflict do nothing;
end $$;

-- RLS -------------------------------------------------------------------------
create policy purchases_actions_select on purchases.purchase_actions
  for select
  using (
    core.has_permission(tenant_id, 'purchases.item.read', location_id)
    or core.has_permission(tenant_id, 'purchases.action.write', location_id)
  );

-- Insert-only (no UPDATE/DELETE policy -- immutable, see header note).
create policy purchases_actions_insert on purchases.purchase_actions
  for insert
  with check (
    core.has_permission(tenant_id, 'purchases.action.write', location_id)
    -- actioned_by must be the caller's own user id -- never a value the
    -- client can attribute to someone else (matches inv_stock_counts_insert).
    and actioned_by = core.current_user_id()
    -- The referenced item must exist, be active, belong to the same
    -- tenant+location the action claims, the snapshot must be the item's
    -- actual current latest stock count (not a stale/forged/future id), and
    -- that count must currently be in shortage -- an item that is not
    -- (or no longer) short can never be marked Bought.
    and exists (
      select 1
      from inventory.items i
      join lateral (
        select sc.id, sc.actual_quantity
        from inventory.stock_counts sc
        where sc.tenant_id = i.tenant_id and sc.item_id = i.id
        order by sc.counted_at desc, sc.id desc
        limit 1
      ) lc on true
      where i.tenant_id = purchase_actions.tenant_id
        and i.id = purchase_actions.item_id
        and i.location_id = purchase_actions.location_id
        and i.is_active = true
        and lc.id = purchase_actions.snapshot_stock_count_id
        and lc.actual_quantity <= i.reorder_point
    )
  );

-- Read projection ---------------------------------------------------------
-- api.purchases_needed -- the Purchases module's entire read surface. Not
-- built on top of api.inventory_item_status (which does not expose the raw
-- stock_counts row id the staleness check needs) but re-derives the exact
-- same shortage condition directly against inventory.items/stock_counts
-- (mirrors 0085's api.inventory_item_status: `actual_quantity <=
-- reorder_point` => shortage, `greatest(required_quantity - actual_quantity,
-- 0)` => shortage_quantity). Deliberately an inner join to the latest count:
-- an item that has never been counted has status 'unknown' in Inventory, not
-- a claimable shortage, so it is correctly absent here, not shown as
-- Pending.
create view api.purchases_needed
  with (security_invoker = true) as
select
  i.id as item_id,
  i.tenant_id,
  i.location_id,
  i.name,
  i.unit,
  i.required_quantity,
  i.reorder_point,
  lc.actual_quantity,
  greatest(i.required_quantity - lc.actual_quantity, 0) as shortage_quantity,
  lc.count_id as latest_stock_count_id,
  case when pa.id is not null then 'bought' else 'pending' end as purchase_status,
  pa.actioned_at,
  e.id as actioned_by_staff_id
from inventory.items i
join lateral (
  select sc.id as count_id, sc.actual_quantity
  from inventory.stock_counts sc
  where sc.tenant_id = i.tenant_id and sc.item_id = i.id
  order by sc.counted_at desc, sc.id desc
  limit 1
) lc on true
left join lateral (
  select pa2.id, pa2.actioned_at, pa2.actioned_by
  from purchases.purchase_actions pa2
  where pa2.tenant_id = i.tenant_id
    and pa2.item_id = i.id
    and pa2.snapshot_stock_count_id = lc.count_id
  order by pa2.actioned_at desc
  limit 1
) pa on true
left join workforce.employees e on e.tenant_id = i.tenant_id and e.user_id = pa.actioned_by
where i.is_active = true
  and lc.actual_quantity <= i.reorder_point;

comment on view api.purchases_needed is
  'Items currently needing purchase (shortage_quantity > 0, same rule as api.inventory_item_status), joined with the most recent purchase_actions acknowledgement whose snapshot_stock_count_id still matches the item''s current latest stock count -- a stale acknowledgement (a newer count was recorded since) reads as purchase_status=''pending'' again, never ''bought''. Relies entirely on inv_items_select/inv_stock_counts_select/purchases_actions_select RLS. security_invoker view.';

-- Write facade --------------------------------------------------------------
-- api.record_purchase_action -- SECURITY INVOKER RPC (same posture as
-- api.record_inventory_stock_count, 0038): purchases_actions_insert RLS
-- remains the real authorization boundary, not this function -- the
-- pre-checks below exist only to raise a distinguishable, friendly error
-- instead of an opaque "row violates row-level security policy" message
-- (a generic RLS failure can't tell the caller *which* with-check condition
-- failed: missing permission, wrong tenant/location, or item no longer
-- short all look identical at that point). actioned_by is always
-- core.current_user_id() -- never a client-supplied argument. The function
-- resolves the current latest stock_counts id itself so the client can never
-- choose/forge which "moment" it is acknowledging.
create or replace function api.record_purchase_action(
  p_tenant_id uuid,
  p_location_id uuid,
  p_item_id uuid
)
returns table (
  action_id uuid,
  item_id uuid,
  actioned_at timestamptz
)
language plpgsql
security invoker
set search_path = core, inventory, purchases, public
as $$
declare
  v_snapshot_count_id uuid;
  v_actual_quantity   numeric(12, 3);
  v_reorder_point     numeric(12, 3);
  v_is_active         boolean;
begin
  select i.reorder_point, i.is_active into v_reorder_point, v_is_active
  from inventory.items i
  where i.tenant_id = p_tenant_id and i.id = p_item_id;

  if v_reorder_point is null then
    raise exception 'purchases_item_not_found' using errcode = 'P0002';
  end if;

  select sc.id, sc.actual_quantity into v_snapshot_count_id, v_actual_quantity
  from inventory.stock_counts sc
  where sc.tenant_id = p_tenant_id and sc.item_id = p_item_id
  order by sc.counted_at desc, sc.id desc
  limit 1;

  if v_snapshot_count_id is null then
    raise exception 'purchases_item_never_counted' using errcode = 'P0001';
  end if;

  if not v_is_active or v_actual_quantity > v_reorder_point then
    raise exception 'purchases_item_not_short' using errcode = 'P0003';
  end if;

  return query
  insert into purchases.purchase_actions as pa (
    tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by
  ) values (
    p_tenant_id, p_location_id, p_item_id, v_snapshot_count_id, core.current_user_id()
  )
  returning pa.id, pa.item_id, pa.actioned_at;
end;
$$;

comment on function api.record_purchase_action(uuid, uuid, uuid) is
  'Marks an item as bought. actioned_by is always core.current_user_id(); snapshot_stock_count_id is always resolved server-side from the item''s current latest stock count -- never client-supplied. SECURITY INVOKER: purchases_actions_insert RLS (purchases.action.write, location-matched, item must be active and currently short, snapshot must equal the item''s true latest count) is the real authorization boundary, not this function.';

revoke all on function api.record_purchase_action(uuid, uuid, uuid) from public;
grant execute on function api.record_purchase_action(uuid, uuid, uuid) to authenticated;

-- ============================================================================
-- Grants
-- ============================================================================

grant usage on schema purchases to authenticated;

-- INSERT: the base-table privilege the SECURITY INVOKER
-- api.record_purchase_action RPC needs to perform its insert as the calling
-- role (purchases_actions_insert RLS remains the real authorization
-- boundary -- same reasoning as 0038's api.record_inventory_stock_count).
-- SELECT: needed for api.purchases_needed's security_invoker read.
grant select, insert on purchases.purchase_actions to authenticated;

grant select on api.purchases_needed to authenticated;
revoke all on api.purchases_needed from anon, public;
