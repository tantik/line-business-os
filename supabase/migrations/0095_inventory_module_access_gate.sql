-- ============================================================================
-- 0095  Inventory: enforce module-OFF gating (Module Access Security
--       Remediation, WP-S3)
-- ----------------------------------------------------------------------------
-- Prior state: none of Inventory's RLS policies, storage policies, or its
-- one SECURITY DEFINER function ever checked core.tenant_modules.is_enabled.
-- A tenant with Inventory turned OFF still had full tenant-facing
-- SELECT/INSERT/UPDATE access to inventory.items/stock_counts/
-- check_sessions/check_session_items, full read/write/delete access to the
-- inventory-media Storage bucket, and inventory.permanently_delete_item()
-- (a SECURITY DEFINER function that structurally bypasses RLS) still worked.
--
-- This migration adds core.has_module_access(tenant_id, 'inventory') to:
--   * inv_items_select/insert/update            (0036)
--   * inv_stock_counts_select/insert            (0036)
--   * inv_check_sessions_read/write             (0045)
--   * inv_check_session_items_read/write        (0045)
--   * inventory_media_select/insert/delete      (0085, storage.objects)
--   * inventory.permanently_delete_item()       (0085's body -- SECURITY
--     DEFINER, does not run under RLS at all, so the check must be explicit
--     inside the function body, not left to a table policy. Note: 0085's
--     body blocks deletion when stock-count history exists, not 0082's
--     later cascade-delete-history behavior -- 0085 dropped and recreated
--     the function to add media_path support and, in doing so, reverted to
--     0055's original block-on-history logic; this is a pre-existing
--     discrepancy already live on dev, out of WP-S3's scope to reconcile.
--     This migration extends 0085's actual current body unchanged, adding
--     only the module-access check.
--
-- api.inventory_items / api.inventory_item_status (0037/0046/0085) are both
-- security_invoker views with no WHERE clause of their own beyond the base
-- table join -- once inv_items_select (and, for the status view,
-- inv_stock_counts_select) both gate on module access, both views inherit
-- it automatically; no view definition needs to change. Same reasoning for
-- api.inventory_check_sessions / api.inventory_check_session_items (0045).
-- The write-facade RPCs (api.record_inventory_stock_count,
-- api.start_inventory_check_session, api.record_inventory_session_item,
-- api.complete_inventory_check_session -- 0038/0045/0046) are all `security
-- invoker`: they perform their INSERT/UPDATE through the caller's own
-- privileges, so gating the underlying table policies above is sufficient --
-- confirmed in the test file below (RPC calls fail the same way a direct
-- insert/update would, no separate pre-check needed in the RPC bodies
-- themselves, unlike WP-S2's api.record_purchase_action which added one for
-- a friendlier error only).
--
-- api.purchases_needed (WP-S2, 0089/0094) reads inventory.items/
-- stock_counts directly -- once inv_items_select/inv_stock_counts_select
-- gate on module access here, that view's Inventory half is now also
-- correctly empty when Inventory is OFF (closing the gap WP-S2's own header
-- note flagged as "until WP-S3 lands").
--
-- Behavior:
--   Inventory ON  -> unchanged.
--   Inventory OFF -> SELECT/INSERT/UPDATE on every table above blocked
--                     tenant-facing; permanently_delete_item refuses (same
--                     not-found-shaped empty result as every other guard in
--                     that function); inventory-media Storage read/write/
--                     delete blocked; existing rows and Storage objects
--                     preserved (nothing here deletes anything).
--   Inventory ON again -> prior access restored, unchanged.
--
-- Rollback: re-apply the pre-0095 policy bodies (drop the module-access
-- conjunct) for each policy listed above, and revert
-- inventory.permanently_delete_item to its pre-0095 body (drop the
-- module-access pre-check). Purely additive/no data change either
-- direction.
-- ============================================================================

-- --- inventory.items ---------------------------------------------------------
drop policy if exists inv_items_select on inventory.items;
create policy inv_items_select on inventory.items
  for select
  using (
    core.has_module_access(tenant_id, 'inventory')
    and (
      core.has_permission(tenant_id, 'inventory.item.read', location_id)
      or core.has_permission(tenant_id, 'inventory.item.manage', location_id)
    )
  );

drop policy if exists inv_items_insert on inventory.items;
create policy inv_items_insert on inventory.items
  for insert
  with check (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'inventory.item.manage', location_id)
  );

drop policy if exists inv_items_update on inventory.items;
create policy inv_items_update on inventory.items
  for update
  using (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'inventory.item.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'inventory.item.manage', location_id)
  );

-- --- inventory.stock_counts ----------------------------------------------------
drop policy if exists inv_stock_counts_select on inventory.stock_counts;
create policy inv_stock_counts_select on inventory.stock_counts
  for select
  using (
    core.has_module_access(tenant_id, 'inventory')
    and (
      core.has_permission(tenant_id, 'inventory.item.read', location_id)
      or core.has_permission(tenant_id, 'inventory.item.manage', location_id)
    )
  );

drop policy if exists inv_stock_counts_insert on inventory.stock_counts;
create policy inv_stock_counts_insert on inventory.stock_counts
  for insert
  with check (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'inventory.count.write', location_id)
    and counted_by = core.current_user_id()
    and exists (
      select 1 from inventory.items i
      where i.tenant_id = stock_counts.tenant_id
        and i.id = stock_counts.item_id
        and i.location_id = stock_counts.location_id
        and i.is_active = true
    )
  );

-- --- inventory.check_sessions / check_session_items -------------------------
drop policy if exists inv_check_sessions_read on inventory.check_sessions;
create policy inv_check_sessions_read on inventory.check_sessions
  for select using (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'inventory.item.read', location_id)
  );

drop policy if exists inv_check_sessions_write on inventory.check_sessions;
create policy inv_check_sessions_write on inventory.check_sessions
  for all
  using (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'inventory.count.write', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'inventory.count.write', location_id)
  );

drop policy if exists inv_check_session_items_read on inventory.check_session_items;
create policy inv_check_session_items_read on inventory.check_session_items
  for select using (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'inventory.item.read', location_id)
  );

drop policy if exists inv_check_session_items_write on inventory.check_session_items;
create policy inv_check_session_items_write on inventory.check_session_items
  for all
  using (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'inventory.count.write', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'inventory')
    and core.has_permission(tenant_id, 'inventory.count.write', location_id)
  );

-- --- inventory.permanently_delete_item() -- SECURITY DEFINER, no RLS -------
-- Re-declares the exact current live body (0085 -- which, despite its own
-- header note claiming to build on 0082's cascade-delete/never-block
-- behavior, actually re-added 0055's original block-on-history logic when
-- it dropped and recreated this function to add media_path support; this is
-- a pre-existing discrepancy in the current dev codebase, NOT something
-- this migration changes -- WP-S3's scope is module-access gating only, not
-- reconciling that unrelated business-logic question, which stays exactly
-- as it already behaves on dev today) plus one new module-access
-- pre-check, placed first (before the not-found/permission/history checks)
-- so an OFF tenant gets the same not-found-shaped empty result every other
-- guard in this function already returns for unauthorized/not-found -- no
-- new error shape.
create or replace function inventory.permanently_delete_item(
  p_tenant_id uuid,
  p_item_id uuid
)
returns table (
  deleted boolean,
  blocked_by_history boolean,
  media_path text
)
language plpgsql
security definer
set search_path = core, inventory, public
as $$
declare
  v_location_id uuid;
  v_media_path text;
  v_has_history boolean;
begin
  if not core.has_module_access(p_tenant_id, 'inventory') then
    -- Zero rows -- same not-found-shaped result as every other guard below.
    -- This function is SECURITY DEFINER and bypasses RLS entirely, so the
    -- module check must live here explicitly, not on a table policy.
    return;
  end if;

  select i.location_id, i.media_path into v_location_id, v_media_path
  from inventory.items i
  where i.tenant_id = p_tenant_id
    and i.id = p_item_id;

  if v_location_id is null then
    return;
  end if;

  if not core.has_permission(p_tenant_id, 'inventory.item.manage', v_location_id) then
    return;
  end if;

  select exists (
    select 1 from inventory.stock_counts sc
    where sc.tenant_id = p_tenant_id and sc.item_id = p_item_id
  ) into v_has_history;

  if v_has_history then
    return query select false, true, v_media_path;
    return;
  end if;

  delete from inventory.items
  where tenant_id = p_tenant_id and id = p_item_id;

  return query select true, false, v_media_path;
end;
$$;

comment on function inventory.permanently_delete_item(uuid, uuid) is
  'Hard-deletes an inventory item only when the caller holds inventory.item.manage for its location, the tenant''s Inventory module is ON (WP-S3), and it has zero inventory.stock_counts history. SECURITY DEFINER because inventory.items has no DELETE RLS policy by design (0036) -- this function is the sole, guarded exception, and re-implements both the module-access and manage-permission checks inline since it cannot rely on RLS for either. Lives outside the api schema per ADR 0008 (no SECURITY DEFINER object in api); api.permanently_delete_inventory_item is its invoker-only passthrough. Returns zero rows for module-off/not-found/unauthorized (indistinguishable to the caller, matching every other Inventory write path); returns (false, true, media_path) when blocked by existing stock-count history (0085''s current live behavior, unchanged by WP-S3); returns (true, false, media_path) on success -- media_path lets the caller clean up the Storage object.';

-- --- inventory-media Storage bucket (0085) ----------------------------------
drop policy if exists inventory_media_select on storage.objects;
create policy inventory_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'inventory-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_module_access((storage.foldername(name))[1]::uuid, 'inventory')
  and (
    core.has_permission((storage.foldername(name))[1]::uuid, 'inventory.item.read', (storage.foldername(name))[2]::uuid)
    or core.has_permission((storage.foldername(name))[1]::uuid, 'inventory.item.manage', (storage.foldername(name))[2]::uuid)
  )
  and exists (
    select 1 from inventory.items i
    where i.tenant_id = (storage.foldername(name))[1]::uuid
      and i.location_id = (storage.foldername(name))[2]::uuid
      and i.id = (storage.foldername(name))[3]::uuid
  )
);

drop policy if exists inventory_media_insert on storage.objects;
create policy inventory_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'inventory-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_module_access((storage.foldername(name))[1]::uuid, 'inventory')
  and core.has_permission((storage.foldername(name))[1]::uuid, 'inventory.item.manage', (storage.foldername(name))[2]::uuid)
  and exists (
    select 1 from inventory.items i
    where i.tenant_id = (storage.foldername(name))[1]::uuid
      and i.location_id = (storage.foldername(name))[2]::uuid
      and i.id = (storage.foldername(name))[3]::uuid
  )
);

drop policy if exists inventory_media_delete on storage.objects;
create policy inventory_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'inventory-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_module_access((storage.foldername(name))[1]::uuid, 'inventory')
  and core.has_permission((storage.foldername(name))[1]::uuid, 'inventory.item.manage', (storage.foldername(name))[2]::uuid)
);
