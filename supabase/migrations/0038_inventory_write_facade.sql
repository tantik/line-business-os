-- ============================================================================
-- 0038  Inventory: Server Action write facade (Daily Stock Check MVP)
-- ----------------------------------------------------------------------------
-- Following 0031_workforce_cafe_write_facade.sql's pattern: purely additive,
-- no RLS predicate changed, no earlier migration edited.
--
-- Two write paths:
--   1. api.inventory_items -- a simple, single-table, key-preserving view
--      (0037, no join), so it is structurally auto-updatable already; this
--      migration just grants INSERT/UPDATE on it. inv_items_insert/_update
--      RLS (inventory.item.manage, location-matched) remains the actual
--      authorization boundary -- manager-only, per the brief's permission
--      model. No UPDATE that clears required_quantity/unit bypasses
--      validation: those are enforced by 0035's CHECK constraints
--      (required_quantity >= 0, unit in the fixed list) regardless of which
--      grant/path performs the write.
--   2. api.record_inventory_stock_count -- a SECURITY INVOKER RPC (not a
--      grant on api.inventory_stock_counts, which is NOT auto-updatable: its
--      0037 definition joins workforce.employees for counted_by_staff_id).
--      Runs as the calling authenticated user, so inv_stock_counts_insert RLS
--      (inventory.count.write, location-matched, item must be active in the
--      same tenant+location) is the real authorization boundary -- same
--      reasoning as api.bind_workforce_employee_line_user (0031). The
--      function itself stamps `counted_by := core.current_user_id()`
--      unconditionally -- the caller cannot pass a counted_by argument at
--      all, so a count can never be attributed to anyone but the person who
--      submitted it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. api.inventory_items -- write grants (manager-only via RLS)
-- ----------------------------------------------------------------------------
grant insert, update on api.inventory_items to authenticated;

-- ----------------------------------------------------------------------------
-- 2. api.record_inventory_stock_count -- staff + manager stock count entry
-- ----------------------------------------------------------------------------
create or replace function api.record_inventory_stock_count(
  p_tenant_id uuid,
  p_location_id uuid,
  p_item_id uuid,
  p_actual_quantity numeric
)
returns table (
  count_id uuid,
  item_id uuid,
  actual_quantity numeric,
  counted_at timestamptz
)
language plpgsql
security invoker
set search_path = core, inventory, public
as $$
begin
  return query
  insert into inventory.stock_counts as sc (
    tenant_id, location_id, item_id, actual_quantity, counted_by
  ) values (
    p_tenant_id, p_location_id, p_item_id, p_actual_quantity, core.current_user_id()
  )
  returning sc.id, sc.item_id, sc.actual_quantity, sc.counted_at;
end;
$$;

comment on function api.record_inventory_stock_count(uuid, uuid, uuid, numeric) is
  'Records a new actual-quantity stock count. counted_by is always core.current_user_id() -- never a client-supplied argument. SECURITY INVOKER: inv_stock_counts_insert RLS (inventory.count.write, location-matched, item must be active in the same tenant+location) is the real authorization boundary, not this function. actual_quantity < 0 or non-finite values are rejected by inventory.stock_counts'' own CHECK constraint / numeric type.';

revoke all on function api.record_inventory_stock_count(uuid, uuid, uuid, numeric) from public;
grant execute on function api.record_inventory_stock_count(uuid, uuid, uuid, numeric) to authenticated;
