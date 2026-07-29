-- ============================================================================
-- 0036  Inventory: RLS policies (Daily Stock Check MVP)
-- ----------------------------------------------------------------------------
-- Adds the first real RLS policies for the tables 0035 created with RLS
-- enabled but zero policies (fully closed). No table grants are added here
-- (that is 0037/0038's job, matching the workforce-recipes precedent of
-- splitting schema -> RLS -> facade across separate migrations).
--
-- inventory.items and inventory.stock_counts are both always location-scoped
-- (location_id NOT NULL), so every policy here uses core.has_permission(
-- tenant_id, permission, location_id) -- there is no tenant-wide-vs-location
-- branch to handle, unlike workforce.recipes/recipe_categories.
-- ============================================================================

-- --- inventory.items ---------------------------------------------------------
-- Read: item.read or item.manage holders, location-matched.
create policy inv_items_select on inventory.items
  for select
  using (
    core.has_permission(tenant_id, 'inventory.item.read', location_id)
    or core.has_permission(tenant_id, 'inventory.item.manage', location_id)
  );

-- Create/edit/deactivate: item.manage only. No DELETE policy -- retirement is
-- via is_active = false (an UPDATE), never a hard delete, preserving count
-- history (brief section 7.5: "физическое удаление ранее использованных
-- товаров нежелательно").
create policy inv_items_insert on inventory.items
  for insert
  with check (core.has_permission(tenant_id, 'inventory.item.manage', location_id));

create policy inv_items_update on inventory.items
  for update
  using (core.has_permission(tenant_id, 'inventory.item.manage', location_id))
  with check (core.has_permission(tenant_id, 'inventory.item.manage', location_id));

-- --- inventory.stock_counts ----------------------------------------------------
-- Read: same read audience as the parent item (item.read or item.manage),
-- location-matched directly off the row's own tenant_id/location_id (no join
-- needed -- both columns are denormalized onto this table already).
create policy inv_stock_counts_select on inventory.stock_counts
  for select
  using (
    core.has_permission(tenant_id, 'inventory.item.read', location_id)
    or core.has_permission(tenant_id, 'inventory.item.manage', location_id)
  );

-- Write: count.write holders (both staff and manager per the brief's
-- permission model), location-matched. INSERT only -- no UPDATE/DELETE
-- policy anywhere, so a count entry can never be edited or removed after the
-- fact once RLS is the only write path (history stays immutable).
create policy inv_stock_counts_insert on inventory.stock_counts
  for insert
  with check (
    core.has_permission(tenant_id, 'inventory.count.write', location_id)
    -- counted_by must be the caller's own user id -- never a value the
    -- client can attribute to someone else.
    and counted_by = core.current_user_id()
    -- The item being counted must exist, be active, and belong to the same
    -- tenant+location the count claims -- prevents a stale/foreign item_id
    -- (or an item that was deactivated after the client loaded its list)
    -- from ever being written against.
    and exists (
      select 1 from inventory.items i
      where i.tenant_id = stock_counts.tenant_id
        and i.id = stock_counts.item_id
        and i.location_id = stock_counts.location_id
        and i.is_active = true
    )
  );
