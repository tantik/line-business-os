-- ============================================================================
-- 0082  Inventory: permanent delete now allowed for an item WITH stock-count
--       history too (Founder decision, 2026-08-23, explicit and informed:
--       chose real deletion over the safer "Deactivate only" default this
--       function shipped with in 0055 -- accepting that the item's
--       inventory.stock_counts history is destroyed along with it).
-- ----------------------------------------------------------------------------
-- 0055's guard (refuse to delete an item with any stock_counts row) is
-- removed. To make the DELETE itself succeed, this also deletes the rows
-- that reference the item via a plain (non-cascading) foreign key before
-- deleting the item itself:
--   - inventory.stock_counts (0035) -- the count history itself
--   - inventory.check_session_items (0045) -- its own snapshot columns
--     (item_name/unit/quantities) survive as historical session data even
--     after this delete; only the item_id linkage is removed, same as any
--     other FK-bound cleanup
-- Everything else about the function (permission check, not-found handling,
-- return shape) is unchanged -- `blocked_by_history` is always false now,
-- kept in the return row only so the existing API/client contract does not
-- need to change shape.
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

  delete from inventory.check_session_items
  where tenant_id = p_tenant_id and item_id = p_item_id;

  delete from inventory.stock_counts
  where tenant_id = p_tenant_id and item_id = p_item_id;

  delete from inventory.items
  where tenant_id = p_tenant_id and id = p_item_id;

  return query select true, false;
end;
$$;

comment on function inventory.permanently_delete_item(uuid, uuid) is
  'Hard-deletes an inventory item when the caller holds inventory.item.manage for its location -- also deletes any inventory.stock_counts and inventory.check_session_items rows referencing it first (0082: Founder chose real deletion over refusing when history exists). SECURITY DEFINER because inventory.items has no DELETE RLS policy by design (0036) -- this function is the sole, guarded exception, and re-implements the manage-permission check inline since it cannot rely on RLS for it. Lives outside the api schema per ADR 0008 (no SECURITY DEFINER object in api); api.permanently_delete_inventory_item is its invoker-only passthrough. Returns zero rows for not-found/unauthorized (indistinguishable to the caller, matching every other Inventory write path); returns (true, false) on success. blocked_by_history is always false now, kept only so the existing API/client return shape does not need to change.';
