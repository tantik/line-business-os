-- ============================================================================
-- 0043  Inventory: complete the SECURITY INVOKER stock-count write path
-- ----------------------------------------------------------------------------
-- api.record_inventory_stock_count is SECURITY INVOKER and inserts into the
-- RLS-protected base table. PostgreSQL therefore requires both EXECUTE on the
-- RPC and INSERT on inventory.stock_counts.
--
-- The RPC still derives counted_by from core.current_user_id(), while
-- inv_stock_counts_insert remains the authorization boundary for permission,
-- tenant, location, active-item, and self-attribution checks.
-- ============================================================================

grant insert on inventory.stock_counts to authenticated;

