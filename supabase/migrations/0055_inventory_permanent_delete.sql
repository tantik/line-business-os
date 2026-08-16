-- ============================================================================
-- 0055  Inventory: guarded permanent-delete RPC
-- ----------------------------------------------------------------------------
-- Cafe v2.1 Inventory UX iteration adds an explicit, separate "Permanent
-- Delete" action alongside the existing soft-delete (is_active = false via
-- api.inventory_items UPDATE, unchanged by this migration).
--
-- 0036 deliberately has no DELETE policy on inventory.items -- physical
-- deletion of a previously-used item is undesirable by default -- and this
-- migration does not add one. Instead it adds one narrow, additive,
-- SECURITY DEFINER helper that performs a real DELETE only when:
--   1. the caller holds inventory.item.manage for the item's tenant+location
--      (the same permission that gates every other Inventory catalog write --
--      checked explicitly here since RLS has no DELETE policy to lean on),
--      and
--   2. no inventory.stock_counts row references the item (i.e. it has never
--      been counted) -- if any exist, the function refuses and reports that
--      back; it never cascades and never silently removes history.
-- No existing RLS policy, grant, or table is modified.
--
-- SECURITY MODEL (mirrors 0050's api.decide_workforce_shift_exchange /
-- workforce.shift_request_location_timezone split, and 0019's rationale for
-- api.has_permission): ADR 0008's "no SECURITY DEFINER object in api schema"
-- invariant (asserted by supabase/tests/0005, 0006, 0009, 0012) means the
-- actual privileged DELETE cannot live in the `api` schema. So the guarded
-- DEFINER logic lives in `inventory.permanently_delete_item`, and
-- `api.permanently_delete_inventory_item` is a thin SECURITY INVOKER
-- passthrough with no table access of its own.
-- ============================================================================

create or replace function inventory.permanently_delete_item(
  p_tenant_id uuid,
  p_item_id uuid
)
returns table (
  deleted boolean,
  blocked_by_history boolean
)
language plpgsql
security definer
set search_path = core, inventory, public
as $$
declare
  v_location_id uuid;
  v_has_history boolean;
begin
  select i.location_id into v_location_id
  from inventory.items i
  where i.tenant_id = p_tenant_id
    and i.id = p_item_id;

  if v_location_id is null then
    -- Not found / not visible -- zero rows, mapped by the caller the same as
    -- every other Inventory write's not_found (RLS-shaped semantics, even
    -- though this function does not itself run under RLS).
    return;
  end if;

  if not core.has_permission(p_tenant_id, 'inventory.item.manage', v_location_id) then
    -- Zero rows here too -- unauthorized and not_found stay indistinguishable
    -- to the caller, matching every other Inventory write path.
    return;
  end if;

  select exists (
    select 1 from inventory.stock_counts sc
    where sc.tenant_id = p_tenant_id and sc.item_id = p_item_id
  ) into v_has_history;

  if v_has_history then
    return query select false, true;
    return;
  end if;

  delete from inventory.items
  where tenant_id = p_tenant_id and id = p_item_id;

  return query select true, false;
end;
$$;

comment on function inventory.permanently_delete_item(uuid, uuid) is
  'Hard-deletes an inventory item only when the caller holds inventory.item.manage for its location and it has zero inventory.stock_counts history. SECURITY DEFINER because inventory.items has no DELETE RLS policy by design (0036) -- this function is the sole, guarded exception, and re-implements the manage-permission check inline since it cannot rely on RLS for it. Lives outside the api schema per ADR 0008 (no SECURITY DEFINER object in api); api.permanently_delete_inventory_item is its invoker-only passthrough. Returns zero rows for not-found/unauthorized (indistinguishable to the caller, matching every other Inventory write path); returns (false, true) when blocked by existing stock-count history; returns (true, false) on success.';

revoke all on function inventory.permanently_delete_item(uuid, uuid) from public;
grant execute on function inventory.permanently_delete_item(uuid, uuid) to authenticated;

create or replace function api.permanently_delete_inventory_item(
  p_tenant_id uuid,
  p_item_id uuid
)
returns table (
  deleted boolean,
  blocked_by_history boolean
)
language sql
security invoker
set search_path = inventory, public
as $$
  select * from inventory.permanently_delete_item(p_tenant_id, p_item_id);
$$;

comment on function api.permanently_delete_inventory_item(uuid, uuid) is
  'Invoker-only passthrough to inventory.permanently_delete_item -- satisfies ADR 0008''s no-SECURITY-DEFINER-in-api invariant by construction (same shape as api.has_permission, 0019). All authorization/history-guard logic lives in the inventory-schema DEFINER function.';

revoke all on function api.permanently_delete_inventory_item(uuid, uuid) from public;
grant execute on function api.permanently_delete_inventory_item(uuid, uuid) to authenticated;
