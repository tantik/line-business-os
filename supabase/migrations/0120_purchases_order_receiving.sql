-- ============================================================================
-- 0120  Purchases v2: Ordered / Received lifecycle on the existing log
-- ----------------------------------------------------------------------------
-- WP4 Purchasing v2 (Founder brief, this session). Business need: a Manager
-- must be able to see what needs buying, what is already in progress of
-- being purchased (Ordered, with an informational quantity), and what has
-- actually been received -- with the actual receipt reflected in Inventory's
-- own canonical quantity truth, never a second one.
--
-- This is deliberately an EXTENSION of 0089's existing append-only action log
-- (purchases.purchase_actions), not a new domain model. 0089's header
-- (Founder brief, 2026-08-24) established "Purchases is a projection/
-- workflow layer over Inventory, never a second source of truth for
-- quantity" -- that constraint is preserved here:
--   - `ordered_quantity` is informational metadata on the action row only
--     (what the caller says they ordered). It is never read by, or written
--     to, any Inventory table, and is never treated as authoritative supply.
--   - `received_quantity` is NOT a second quantity ledger. A "received"
--     action can only be inserted alongside a stock_counts row created in
--     the SAME call, through the existing, unmodified
--     api.record_inventory_stock_count -- actual Inventory quantity is
--     always written by that one canonical function, exactly as before.
--     purchase_actions.received_quantity is a display/history convenience
--     (the delta amount of that specific delivery), not a quantity Inventory
--     itself relies on.
--
-- Lifecycle (per item, re-derived at read time from the latest action whose
-- snapshot still matches the item's true latest stock count -- same
-- staleness-reversion pattern as 0089, now three live states instead of
-- one): pending -> ordered -> received. "bought" (0089's original single
-- action) is preserved verbatim and unchanged for items where a single quick
-- acknowledgement is enough (e.g. staff walks out and buys it immediately) --
-- Ordered/Received is an alternative two-step path for a real delivery,
-- never a required replacement.
--
-- Explicitly NOT built (Mission non-goals): no purchase_orders/supplier
-- entity, no price/cost tracking, no invoices, no over-receive hard cap
-- (ordered_quantity is informational only -- a real store can receive more
-- or less than it ordered; Inventory truth is what was actually counted in,
-- not what was requested), no automatic ordering, no approval chain.
-- ============================================================================

-- Extend the existing append-only log -----------------------------------------
alter table purchases.purchase_actions
  add column if not exists action_type text not null default 'bought',
  add column if not exists ordered_quantity numeric(12, 3) null,
  add column if not exists received_quantity numeric(12, 3) null;

alter table purchases.purchase_actions
  add constraint purchase_actions_action_type_check
    check (action_type in ('bought', 'ordered', 'received'));

-- Keeps the quantity columns meaningful per action_type -- 'bought' carries
-- neither (unchanged 0089 semantics), 'ordered' always carries the
-- informational quantity it claims, 'received' always carries the delta
-- actually counted in.
alter table purchases.purchase_actions
  add constraint purchase_actions_quantity_shape_check
    check (
      (action_type = 'bought' and ordered_quantity is null and received_quantity is null)
      or (action_type = 'ordered' and ordered_quantity is not null and received_quantity is null)
      or (action_type = 'received' and received_quantity is not null)
    );

alter table purchases.purchase_actions
  add constraint purchase_actions_ordered_quantity_positive_check
    check (ordered_quantity is null or ordered_quantity > 0),
  add constraint purchase_actions_received_quantity_positive_check
    check (received_quantity is null or received_quantity > 0);

comment on column purchases.purchase_actions.action_type is
  '''bought'' (0089 original single-step acknowledgement), ''ordered'' (informational quantity, item still short, no Inventory write), or ''received'' (a real delivery just counted into Inventory via api.record_inventory_stock_count in the same call as this row -- see 0120 header).';
comment on column purchases.purchase_actions.ordered_quantity is
  'Informational only -- what the caller says they ordered. Never read by or written to any Inventory table; never a cap on how much can later be received.';
comment on column purchases.purchase_actions.received_quantity is
  'The delta amount actually counted into Inventory by the api.record_purchase_receipt call that produced this row. A history/display convenience, not a second quantity ledger -- inventory.stock_counts.actual_quantity (written in the same transaction) remains the sole quantity truth.';

-- RLS ---------------------------------------------------------------------
-- Replaces 0089's insert policy: 'bought'/'ordered' keep the exact original
-- precondition (item currently short at the referenced snapshot); 'received'
-- has a different, tighter precondition (see below).
drop policy if exists purchases_actions_insert on purchases.purchase_actions;

create policy purchases_actions_insert on purchases.purchase_actions
  for insert
  with check (
    actioned_by = core.current_user_id()
    and (
      (
        action_type in ('bought', 'ordered')
        and core.has_permission(tenant_id, 'purchases.action.write', location_id)
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
      )
      or (
        action_type = 'received'
        and core.has_permission(tenant_id, 'purchases.action.write', location_id)
        -- The referenced snapshot must be the item's true current latest
        -- stock count (never stale/forged) AND must have been counted by
        -- this SAME caller -- in practice this is only ever true for the
        -- stock_counts row api.record_purchase_receipt itself just created
        -- in the same transaction, which prevents fabricating a "received"
        -- log entry against a stock count somebody else produced through
        -- the ordinary, unrelated Inventory counting flow.
        and exists (
          select 1
          from inventory.items i
          join lateral (
            select sc.id, sc.counted_by
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
            and lc.counted_by = purchase_actions.actioned_by
        )
      )
    )
  );

-- Read projection -----------------------------------------------------------
-- api.purchases_needed: purchase_status now reflects the latest action's
-- action_type verbatim ('pending' when no matching action exists), instead
-- of 0089's binary bought/pending. Column list is append-only (existing
-- consumers reading the original columns are unaffected).
create or replace view api.purchases_needed
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
  case when pa.id is not null then pa.action_type else 'pending' end as purchase_status,
  pa.actioned_at,
  e.id as actioned_by_staff_id,
  pa.ordered_quantity,
  pa.received_quantity
from inventory.items i
join lateral (
  select sc.id as count_id, sc.actual_quantity
  from inventory.stock_counts sc
  where sc.tenant_id = i.tenant_id and sc.item_id = i.id
  order by sc.counted_at desc, sc.id desc
  limit 1
) lc on true
left join lateral (
  select pa2.id, pa2.actioned_at, pa2.actioned_by, pa2.action_type, pa2.ordered_quantity, pa2.received_quantity
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
  'Items currently needing purchase. purchase_status is the latest purchase_actions row still matching the item''s current latest stock count (''pending'' if none): ''bought'' (0089 single-step), ''ordered'' (informational ordered_quantity, no Inventory write), or ''received'' (a delivery was just counted into Inventory via api.record_purchase_receipt). A stale acknowledgement (a newer, unrelated stock count was recorded since) always reads as ''pending'' again -- see 0089/0120 header notes. security_invoker view.';

-- api.purchase_history -- full append-only log, human-readable (0089 wrote
-- the log but exposed no history screen; this is purely additive read
-- access, no new persistent concept).
create view api.purchase_history
  with (security_invoker = true) as
select
  pa.id as action_id,
  pa.tenant_id,
  pa.location_id,
  pa.item_id,
  i.name as item_name,
  i.unit,
  pa.action_type,
  pa.ordered_quantity,
  pa.received_quantity,
  pa.actioned_at,
  e.id as actioned_by_staff_id
from purchases.purchase_actions pa
join inventory.items i on i.tenant_id = pa.tenant_id and i.id = pa.item_id
left join workforce.employees e on e.tenant_id = pa.tenant_id and e.user_id = pa.actioned_by;

comment on view api.purchase_history is
  'Full, append-only Purchases action history (bought/ordered/received), newest-first by convention of the caller''s ORDER BY. Relies entirely on purchases_actions_select / inv_items_select RLS. security_invoker view.';

grant select on api.purchase_history to authenticated;
revoke all on api.purchase_history from anon, public;

-- Write facade ----------------------------------------------------------------
-- api.record_purchase_order -- logs an Ordered acknowledgement with an
-- informational quantity. No Inventory write. Same friendly-error-wrapper
-- posture as 0089's api.record_purchase_action: purchases_actions_insert RLS
-- is the real authorization boundary.
create or replace function api.record_purchase_order(
  p_tenant_id uuid,
  p_location_id uuid,
  p_item_id uuid,
  p_ordered_quantity numeric
)
returns table (
  action_id uuid,
  item_id uuid,
  ordered_quantity numeric,
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
  if p_ordered_quantity is null or p_ordered_quantity <= 0 then
    raise exception 'purchases_invalid_quantity' using errcode = 'P0006';
  end if;

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
    tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by,
    action_type, ordered_quantity
  ) values (
    p_tenant_id, p_location_id, p_item_id, v_snapshot_count_id, core.current_user_id(),
    'ordered', p_ordered_quantity
  )
  returning pa.id, pa.item_id, pa.ordered_quantity, pa.actioned_at;
end;
$$;

comment on function api.record_purchase_order(uuid, uuid, uuid, numeric) is
  'Logs an Ordered acknowledgement with an informational quantity. Never writes to Inventory. actioned_by is always core.current_user_id(). SECURITY INVOKER: purchases_actions_insert RLS is the real authorization boundary.';

revoke all on function api.record_purchase_order(uuid, uuid, uuid, numeric) from public;
grant execute on function api.record_purchase_order(uuid, uuid, uuid, numeric) to authenticated;

-- api.record_purchase_receipt -- the only path that closes the loop: writes
-- the actual received quantity into Inventory's own canonical mechanism
-- (api.record_inventory_stock_count, unmodified) and logs a 'received' row
-- against the resulting new stock count, in one transaction. Supports
-- partial receiving (received_quantity can be less than any prior
-- ordered_quantity -- that quantity is informational only, never enforced
-- here) and repeat partial deliveries (call again for the next delivery).
-- Over-receiving is allowed by design -- see 0120 header.
create or replace function api.record_purchase_receipt(
  p_tenant_id uuid,
  p_location_id uuid,
  p_item_id uuid,
  p_received_quantity numeric,
  -- The stock_count id the caller last observed as "latest" for this item
  -- (e.g. PurchaseNeededItem.latestStockCountId). Optional concurrency
  -- guard against a duplicate/concurrent submit racing a real Inventory
  -- count for the same item -- if the item's true latest count has already
  -- moved on since the caller last read it, this raises a distinguishable
  -- error instead of silently receiving against a quantity the caller never
  -- actually saw.
  p_expected_stock_count_id uuid default null
)
returns table (
  action_id uuid,
  item_id uuid,
  received_quantity numeric,
  new_actual_quantity numeric,
  actioned_at timestamptz
)
language plpgsql
security invoker
set search_path = api, core, inventory, purchases, public
as $$
declare
  v_current_count_id  uuid;
  v_current_quantity  numeric(12, 3);
  v_is_active         boolean;
  v_new_quantity      numeric(12, 3);
  v_new_count_id      uuid;
  v_action_id         uuid;
  v_actioned_at       timestamptz;
begin
  if p_received_quantity is null or p_received_quantity <= 0 then
    raise exception 'purchases_invalid_quantity' using errcode = 'P0006';
  end if;

  select i.is_active into v_is_active
  from inventory.items i
  where i.tenant_id = p_tenant_id and i.id = p_item_id;

  if v_is_active is null or not v_is_active then
    raise exception 'purchases_item_not_found' using errcode = 'P0002';
  end if;

  select sc.id, sc.actual_quantity into v_current_count_id, v_current_quantity
  from inventory.stock_counts sc
  where sc.tenant_id = p_tenant_id and sc.item_id = p_item_id
  order by sc.counted_at desc, sc.id desc
  limit 1;

  if v_current_count_id is null then
    raise exception 'purchases_item_never_counted' using errcode = 'P0001';
  end if;

  if p_expected_stock_count_id is not null and p_expected_stock_count_id <> v_current_count_id then
    raise exception 'purchases_stale_snapshot' using errcode = 'P0005';
  end if;

  v_new_quantity := v_current_quantity + p_received_quantity;

  -- Canonical Inventory write -- the only place actual_quantity is ever
  -- mutated, unchanged since 0035/0038.
  select count_id into v_new_count_id
  from api.record_inventory_stock_count(p_tenant_id, p_location_id, p_item_id, v_new_quantity);

  insert into purchases.purchase_actions as pa (
    tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by,
    action_type, received_quantity
  ) values (
    p_tenant_id, p_location_id, p_item_id, v_new_count_id, core.current_user_id(),
    'received', p_received_quantity
  )
  returning pa.id, pa.actioned_at into v_action_id, v_actioned_at;

  return query select v_action_id, p_item_id, p_received_quantity, v_new_quantity, v_actioned_at;
end;
$$;

comment on function api.record_purchase_receipt(uuid, uuid, uuid, numeric, uuid) is
  'Records a real delivery: writes the new total into Inventory via the unmodified api.record_inventory_stock_count (canonical quantity mechanism, unchanged), then logs a ''received'' purchase_actions row against the resulting new stock count, in one transaction. actioned_by/counted_by are always core.current_user_id(). p_expected_stock_count_id is an optional optimistic-concurrency guard against a stale/duplicate submit. SECURITY INVOKER: purchases_actions_insert and inv_stock_counts_insert RLS remain the real authorization boundaries.';

revoke all on function api.record_purchase_receipt(uuid, uuid, uuid, numeric, uuid) from public;
grant execute on function api.record_purchase_receipt(uuid, uuid, uuid, numeric, uuid) to authenticated;
