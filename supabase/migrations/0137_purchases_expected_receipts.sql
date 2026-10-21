-- ============================================================================
-- 0137  Purchases: expected receipts ("awaiting delivery") + close the rest
-- ----------------------------------------------------------------------------
-- QA4 F9 (Founder-approved). Purchasing has no orders table: everything is the
-- append-only purchases.purchase_actions log (0089/0120). After "order 8 L,
-- receive 4 L" the stock can rise above the reorder point, the item drops out
-- of api.purchases_needed, and the 4 L still expected are shown nowhere.
--
-- Rules (derived at read time, no new table, no stored state):
--   * The OPEN order of an item is its latest 'ordered' action.
--   * open quantity = ordered_quantity - sum(received_quantity of 'received'
--     actions recorded at/after that order), floored at 0.
--   * The order is closed when the open quantity is <= 0, or when an
--     'order_closed' action was recorded at/after it (new, explicit "cancel
--     the rest" -- api.close_purchase_order_remainder).
--   * A receipt without any order still works (Founder decision F8): it simply
--     never creates or affects an open order.
--
-- Read design: a SEPARATE view api.purchases_awaiting_delivery instead of
-- widening api.purchases_needed. api.purchases_needed means "currently short"
-- for every consumer (Purchases list, Inventory "bought" icons on the Manager/
-- Staff/Inventory pages, Weekly Review 'pendingPurchasesCount' in
-- api.weekly_review_summary). Adding not-short rows to it would silently change
-- those counts. The only change to api.purchases_needed is body-only: an
-- 'order_closed' row (which is pinned to the current stock count) reads as
-- 'pending' -- the item is still short and nothing is in progress any more --
-- so its purchase_status domain stays exactly pending/bought/ordered/received.
--
-- Audit (AGENTS.md rule 7): an AFTER INSERT trigger writes audit.audit_logs
-- for every 'order_closed' row (actor = actioned_by, which RLS forces to be the
-- caller). SECURITY DEFINER trigger function in schema purchases (never in api,
-- ADR 0008), same posture as core.realtime_signal (0127). A trigger cannot be
-- called as an RPC, so the audit row cannot be forged or skipped.
--
-- Tenant boundary: unchanged -- the view is security_invoker over
-- inventory.items / inventory.stock_counts / purchases.purchase_actions RLS,
-- exactly like api.purchases_needed; the new RPC is SECURITY INVOKER and
-- purchases_actions_insert RLS stays the real write boundary.
--
-- Rollback (at the end of this file, commented).
-- ============================================================================

-- --- 1. action_type 'order_closed' ------------------------------------------------
-- Superset of the old values: every existing row still satisfies both checks,
-- so drop + re-add loses no data.
alter table purchases.purchase_actions
  drop constraint if exists purchase_actions_action_type_check;
alter table purchases.purchase_actions
  add constraint purchase_actions_action_type_check
    check (action_type in ('bought', 'ordered', 'received', 'order_closed'));

alter table purchases.purchase_actions
  drop constraint if exists purchase_actions_quantity_shape_check;
alter table purchases.purchase_actions
  add constraint purchase_actions_quantity_shape_check
    check (
      (action_type = 'bought' and ordered_quantity is null and received_quantity is null)
      or (action_type = 'ordered' and ordered_quantity is not null and received_quantity is null)
      or (action_type = 'received' and received_quantity is not null and ordered_quantity is null)
      or (action_type = 'order_closed' and ordered_quantity is null and received_quantity is null)
    );

comment on column purchases.purchase_actions.action_type is
  '''bought'' (0089 single-step acknowledgement), ''ordered'' (informational quantity, no Inventory write), ''received'' (a delivery counted into Inventory via api.record_purchase_receipt in the same call), or ''order_closed'' (0137: the rest of the latest order will not arrive -- closes it; no Inventory write).';

-- Serves "latest ordered", "received since" and "closed since" per item.
create index if not exists purchase_actions_item_type_latest_idx
  on purchases.purchase_actions (tenant_id, item_id, action_type, actioned_at desc);

-- --- 2. RLS: allow 'order_closed' ---------------------------------------------------
-- Identical to the live policy (0122 body, module gate moved to 'purchases' by
-- 0131) plus one branch for 'order_closed': same write permission, the
-- snapshot must be the item's true current latest stock count (never stale or
-- forged), and the item must have an 'ordered' action to close. No shortage
-- requirement: an awaiting-delivery item is usually no longer short.
drop policy if exists purchases_actions_insert on purchases.purchase_actions;

create policy purchases_actions_insert on purchases.purchase_actions
  for insert
  with check (
    core.has_module_access(tenant_id, 'purchases')
    and actioned_by = core.current_user_id()
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
        -- this SAME caller (see 0120).
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
      or (
        action_type = 'order_closed'
        and core.has_permission(tenant_id, 'purchases.action.write', location_id)
        and exists (
          select 1
          from inventory.items i
          join lateral (
            select sc.id
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
        )
        and exists (
          select 1
          from purchases.purchase_actions o
          where o.tenant_id = purchase_actions.tenant_id
            and o.item_id = purchase_actions.item_id
            and o.location_id = purchase_actions.location_id
            and o.action_type = 'ordered'
        )
      )
    )
  );

-- --- 3. api.purchases_needed: 'order_closed' reads as 'pending' --------------------
-- Same columns, same order as 0120 (CREATE OR REPLACE VIEW may only append);
-- only the status/actor expressions change for the new action_type.
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
  case
    when pa.id is null or pa.action_type = 'order_closed' then 'pending'
    else pa.action_type
  end as purchase_status,
  case when pa.action_type = 'order_closed' then null else pa.actioned_at end as actioned_at,
  case when pa.action_type = 'order_closed' then null else e.id end as actioned_by_staff_id,
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
  'Items currently needing purchase (actual_quantity <= reorder_point). purchase_status is the latest purchase_actions row still matching the item''s current latest stock count (''pending'' if none): ''bought'', ''ordered'' or ''received''. A stale acknowledgement (a newer, unrelated stock count was recorded since) reads as ''pending'' again; so does an ''order_closed'' row (0137 -- the rest of the order was cancelled, nothing is in progress). Open/expected order quantities live in api.purchases_awaiting_delivery (0137). security_invoker view.';

-- --- 4. api.purchases_awaiting_delivery ---------------------------------------------
create or replace view api.purchases_awaiting_delivery
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
  (lc.actual_quantity <= i.reorder_point) as is_short,
  lc.count_id as latest_stock_count_id,
  o.id as order_action_id,
  o.ordered_quantity,
  coalesce(r.received_quantity, 0) as received_since_order_quantity,
  greatest(o.ordered_quantity - coalesce(r.received_quantity, 0), 0) as open_order_quantity,
  o.actioned_at as ordered_at,
  e.id as ordered_by_staff_id
from inventory.items i
join lateral (
  select pa.id, pa.actioned_at, pa.actioned_by, pa.ordered_quantity
  from purchases.purchase_actions pa
  where pa.tenant_id = i.tenant_id
    and pa.item_id = i.id
    and pa.location_id = i.location_id
    and pa.action_type = 'ordered'
  order by pa.actioned_at desc, pa.id desc
  limit 1
) o on true
join lateral (
  select sc.id as count_id, sc.actual_quantity
  from inventory.stock_counts sc
  where sc.tenant_id = i.tenant_id and sc.item_id = i.id
  order by sc.counted_at desc, sc.id desc
  limit 1
) lc on true
left join lateral (
  select sum(pr.received_quantity) as received_quantity
  from purchases.purchase_actions pr
  where pr.tenant_id = i.tenant_id
    and pr.item_id = i.id
    and pr.location_id = i.location_id
    and pr.action_type = 'received'
    and pr.actioned_at >= o.actioned_at
) r on true
left join workforce.employees e on e.tenant_id = i.tenant_id and e.user_id = o.actioned_by
where i.is_active = true
  and o.ordered_quantity - coalesce(r.received_quantity, 0) > 0
  and not exists (
    select 1
    from purchases.purchase_actions pc
    where pc.tenant_id = i.tenant_id
      and pc.item_id = i.id
      and pc.location_id = i.location_id
      and pc.action_type = 'order_closed'
      and pc.actioned_at >= o.actioned_at
  );

comment on view api.purchases_awaiting_delivery is
  'Items whose latest ''ordered'' action is still open (0137): open_order_quantity = ordered_quantity - received since that order (> 0), and no ''order_closed'' since. Listed whether or not the item is still short (is_short) -- so a partly delivered order stays visible after stock rises above the reorder point. Same RLS boundary as api.purchases_needed (inventory.items / stock_counts / purchases.purchase_actions). security_invoker view.';

grant select on api.purchases_awaiting_delivery to authenticated;
revoke all on api.purchases_awaiting_delivery from anon, public;

-- --- 5. api.close_purchase_order_remainder ------------------------------------------
-- "Cancel the rest": closes the item's open order without any Inventory write.
-- Same friendly-error posture as api.record_purchase_receipt (module gate P0004,
-- item P0002, stale P0005); purchases_actions_insert RLS is the real
-- authorization boundary. Serialised with receipts for the same item through
-- the same advisory lock key, so a receipt and a close cannot interleave.
create or replace function api.close_purchase_order_remainder(
  p_tenant_id uuid,
  p_location_id uuid,
  p_item_id uuid,
  -- The open order the caller is looking at (PurchaseNeededItem.openOrder.
  -- orderActionId). Optional guard: if a newer order replaced it, raise
  -- purchases_stale_snapshot instead of closing an order the caller never saw.
  p_expected_order_action_id uuid default null
)
returns table (
  action_id uuid,
  item_id uuid,
  order_action_id uuid,
  closed_quantity numeric,
  actioned_at timestamptz
)
language plpgsql
security invoker
set search_path = api, core, inventory, purchases, public
as $$
declare
  v_is_active      boolean;
  v_order_id       uuid;
  v_open_quantity  numeric;
  v_count_id       uuid;
  v_action_id      uuid;
  v_actioned_at    timestamptz;
begin
  if not core.has_module_access(p_tenant_id, 'purchases') then
    raise exception 'purchases_module_disabled' using errcode = 'P0004';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_item_id::text, 0));

  select i.is_active into v_is_active
  from inventory.items i
  where i.tenant_id = p_tenant_id and i.id = p_item_id and i.location_id = p_location_id;

  if v_is_active is null or not v_is_active then
    raise exception 'purchases_item_not_found' using errcode = 'P0002';
  end if;

  select a.order_action_id, a.open_order_quantity, a.latest_stock_count_id
    into v_order_id, v_open_quantity, v_count_id
  from api.purchases_awaiting_delivery a
  where a.tenant_id = p_tenant_id and a.item_id = p_item_id and a.location_id = p_location_id;

  if v_order_id is null then
    raise exception 'purchases_no_open_order' using errcode = 'P0007';
  end if;

  if p_expected_order_action_id is not null and p_expected_order_action_id <> v_order_id then
    raise exception 'purchases_stale_snapshot' using errcode = 'P0005';
  end if;

  insert into purchases.purchase_actions as pa (
    tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type
  ) values (
    p_tenant_id, p_location_id, p_item_id, v_count_id, core.current_user_id(), 'order_closed'
  )
  returning pa.id, pa.actioned_at into v_action_id, v_actioned_at;

  return query select v_action_id, p_item_id, v_order_id, v_open_quantity, v_actioned_at;
end;
$$;

comment on function api.close_purchase_order_remainder(uuid, uuid, uuid, uuid) is
  'Closes the open remainder of an item''s latest order (0137, "cancel the rest"): logs an ''order_closed'' purchase_actions row against the item''s current latest stock count. Never writes to Inventory. Raises purchases_module_disabled (P0004), purchases_item_not_found (P0002), purchases_no_open_order (P0007) or purchases_stale_snapshot (P0005, p_expected_order_action_id is no longer the open order). Audited by the purchases.audit_order_closed trigger. SECURITY INVOKER: purchases_actions_insert RLS is the real authorization boundary.';

revoke all on function api.close_purchase_order_remainder(uuid, uuid, uuid, uuid) from public;
grant execute on function api.close_purchase_order_remainder(uuid, uuid, uuid, uuid) to authenticated;

-- --- 6. audit every close --------------------------------------------------------------
create or replace function purchases.audit_order_closed()
returns trigger
language plpgsql
security definer
set search_path = purchases, audit, public, pg_temp
as $$
declare
  v_order_id        uuid;
  v_ordered         numeric;
  v_ordered_at      timestamptz;
  v_received        numeric;
begin
  select pa.id, pa.ordered_quantity, pa.actioned_at
    into v_order_id, v_ordered, v_ordered_at
  from purchases.purchase_actions pa
  where pa.tenant_id = new.tenant_id
    and pa.item_id = new.item_id
    and pa.location_id = new.location_id
    and pa.action_type = 'ordered'
    and pa.actioned_at <= new.actioned_at
  order by pa.actioned_at desc, pa.id desc
  limit 1;

  select coalesce(sum(pr.received_quantity), 0) into v_received
  from purchases.purchase_actions pr
  where pr.tenant_id = new.tenant_id
    and pr.item_id = new.item_id
    and pr.location_id = new.location_id
    and pr.action_type = 'received'
    and pr.actioned_at >= v_ordered_at
    and pr.actioned_at <= new.actioned_at;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (
    new.tenant_id,
    new.actioned_by,
    'user',
    'purchases',
    'purchase_order',
    v_order_id::text,
    'close_remainder',
    jsonb_build_object(
      'ordered_quantity', v_ordered,
      'received_quantity', v_received,
      'open_quantity', greatest(coalesce(v_ordered, 0) - v_received, 0)
    ),
    jsonb_build_object('open_quantity', 0, 'closed', true),
    jsonb_build_object('close_action_id', new.id, 'item_id', new.item_id, 'location_id', new.location_id)
  );
  return null;
end;
$$;

comment on function purchases.audit_order_closed() is
  'AFTER INSERT trigger (0137): writes one audit.audit_logs row (module purchases, entity purchase_order, action close_remainder, before/after open quantity) for every ''order_closed'' purchase action. SECURITY DEFINER only to reach audit.audit_logs; reads/writes are scoped to NEW''s tenant/item/location.';

revoke all on function purchases.audit_order_closed() from public;

drop trigger if exists purchase_actions_audit_order_closed on purchases.purchase_actions;
create trigger purchase_actions_audit_order_closed
  after insert on purchases.purchase_actions
  for each row
  when (new.action_type = 'order_closed')
  execute function purchases.audit_order_closed();

-- ============================================================================
-- Rollback (manual; run in one transaction):
--   drop trigger if exists purchase_actions_audit_order_closed on purchases.purchase_actions;
--   drop function if exists purchases.audit_order_closed();
--   drop function if exists api.close_purchase_order_remainder(uuid, uuid, uuid, uuid);
--   drop view if exists api.purchases_awaiting_delivery;
--   re-apply api.purchases_needed from 0120 (status = pa.action_type, no order_closed case);
--   re-apply purchases_actions_insert from 0122 with 'purchases' as the module (0131);
--   -- 'order_closed' rows must go before the old checks can come back (loses the
--   -- record of which orders were closed; audit.audit_logs keeps it):
--   delete from purchases.purchase_actions where action_type = 'order_closed';
--   re-add purchase_actions_action_type_check / purchase_actions_quantity_shape_check from 0120;
--   drop index if exists purchases.purchase_actions_item_type_latest_idx;
-- ============================================================================
