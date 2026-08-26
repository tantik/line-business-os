-- ============================================================================
-- 0094  Purchases: enforce Inventory module-OFF gating (Module Access
--       Security Remediation, WP-S2)
-- ----------------------------------------------------------------------------
-- Prior state: 0089_purchases_module.sql's header note documents that
-- "Purchases rides the existing core.tenant_modules 'inventory' flag" -- but
-- that was a *design* statement, never actually enforced. purchases_actions_
-- select/insert only checked core.has_permission(...); they never checked
-- core.tenant_modules.is_enabled at all. A tenant with Inventory turned OFF
-- still had full tenant-facing SELECT/INSERT access to purchases.
-- purchase_actions and to api.purchases_needed, and api.record_purchase_action
-- still worked -- Inventory OFF did not actually turn Purchases off.
--
-- This migration adds an explicit core.has_module_access(tenant_id,
-- 'inventory') check to Purchases' own RLS policies (not assumed to be
-- inherited from Inventory's RLS -- purchases.purchase_actions is Purchases'
-- own schema/table, with its own policies, per the mission's explicit
-- instruction not to assume Inventory RLS automatically protects it) and to
-- api.record_purchase_action's own pre-checks (for a friendly, distinguishable
-- error instead of an opaque RLS failure -- same posture the function already
-- uses for its other pre-checks).
--
-- api.purchases_needed is a security_invoker view over inventory.items /
-- inventory.stock_counts / purchases.purchase_actions -- once inv_items_select
-- (WP-S3, not yet done as of this migration) and purchases_actions_select
-- both gate on module access, the view inherits both automatically; no view
-- change is needed here for it to go empty when Inventory is OFF, but until
-- WP-S3 lands, module-OFF blocks the purchase_actions half only. This
-- migration is scoped to Purchases per the mission's staged-domain plan
-- (Inventory itself is WP-S3, a separate PR).
--
-- Behavior:
--   Inventory ON  -> unchanged (permission checks as before).
--   Inventory OFF -> purchases_actions SELECT returns no rows tenant-facing;
--                     INSERT rejected by RLS; api.record_purchase_action
--                     raises a distinguishable error before attempting the
--                     insert; existing purchase_actions rows are preserved
--                     (no DELETE, nothing here removes data).
--   Inventory ON again -> prior rows visible/actionable again, unchanged.
--
-- Rollback: re-apply 0089's original purchases_actions_select/insert policy
-- bodies (drop the module-access conjunct) and revert
-- api.record_purchase_action to the version without the module-access
-- pre-check. Purely additive/no data change either direction.
-- ============================================================================

drop policy if exists purchases_actions_select on purchases.purchase_actions;
create policy purchases_actions_select on purchases.purchase_actions
  for select
  using (
    core.has_module_access(tenant_id, 'inventory')
    and (
      core.has_permission(tenant_id, 'purchases.item.read', location_id)
      or core.has_permission(tenant_id, 'purchases.action.write', location_id)
    )
  );

drop policy if exists purchases_actions_insert on purchases.purchase_actions;
create policy purchases_actions_insert on purchases.purchase_actions
  for insert
  with check (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'purchases.action.write', location_id)
    and actioned_by = core.current_user_id()
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

-- api.record_purchase_action: add an explicit module-access pre-check, same
-- friendly-error posture as its existing item/stock/shortage pre-checks
-- (purchases_actions_insert RLS remains the real authorization boundary --
-- this pre-check only makes the failure distinguishable, matching the
-- function's existing documented posture).
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
  if not core.has_module_access(p_tenant_id, 'inventory') then
    raise exception 'purchases_module_disabled' using errcode = 'P0004';
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
    tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by
  ) values (
    p_tenant_id, p_location_id, p_item_id, v_snapshot_count_id, core.current_user_id()
  )
  returning pa.id, pa.item_id, pa.actioned_at;
end;
$$;

comment on function api.record_purchase_action(uuid, uuid, uuid) is
  'Marks an item as bought. actioned_by is always core.current_user_id(); snapshot_stock_count_id is always resolved server-side from the item''s current latest stock count -- never client-supplied. Raises purchases_module_disabled (P0004) when the tenant''s Inventory module is OFF, before any other check. SECURITY INVOKER: purchases_actions_insert RLS (module access + purchases.action.write, location-matched, item must be active and currently short, snapshot must equal the item''s true latest count) is the real authorization boundary, not this function.';
