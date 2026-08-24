-- ============================================================================
-- 0085  Inventory: item photo (media_path), mirroring workforce.recipes'
--       private, tenant/location-scoped media (0052).
-- ----------------------------------------------------------------------------
-- Adds a single optional photo per catalog item -- same one-photo-per-row
-- shape as recipes, not a gallery (`inventory.items.media_path`, nullable,
-- same as `workforce.recipes.media_path`). Threaded through both API facade
-- views (`api.inventory_items`, `api.inventory_item_status`) so the existing
-- plain-table INSERT/UPDATE path (`api.inventory_items`, security_invoker,
-- no RPC involved -- unlike recipes' `upsert_workforce_recipe`) can write it
-- directly, no new write RPC needed.
--
-- Storage: a new private `inventory-media` bucket, policies mirroring
-- `recipe-media`'s pre-0074 (location-scoped, not tenant-wide) shape exactly
-- -- inventory items are always location-scoped (0035's header note), so
-- there is no tenant-wide-recipe-style ambiguity to correct for here. Path
-- convention: `<tenant_id>/<location_id>/<item_id>/<uuid>.<ext>`.
-- ============================================================================

alter table inventory.items
  add column if not exists media_path text;

comment on column inventory.items.media_path is
  'Storage object path in the private inventory-media bucket for this item''s one photo, or null. Same shape as workforce.recipes.media_path (0052) -- one photo per row, not a gallery.';

create or replace view api.inventory_items
  with (security_invoker = true) as
select
  i.id as item_id,
  i.tenant_id,
  i.location_id,
  i.name,
  i.unit,
  i.required_quantity,
  i.sort_order,
  i.is_active,
  i.created_at,
  i.updated_at,
  i.reorder_point,
  i.media_path
from inventory.items i;

create or replace view api.inventory_item_status
  with (security_invoker = true) as
select
  i.id as item_id,
  i.tenant_id,
  i.location_id,
  i.name,
  i.unit,
  i.required_quantity,
  i.sort_order,
  i.is_active,
  lc.actual_quantity,
  lc.counted_at,
  e.id as counted_by_staff_id,
  case
    when lc.actual_quantity is not null
      and lc.actual_quantity <= i.reorder_point
      then greatest(i.required_quantity - lc.actual_quantity, 0)
    else 0
  end as shortage_quantity,
  case
    when lc.actual_quantity is null then 'unknown'
    when lc.actual_quantity <= i.reorder_point then 'shortage'
    else 'sufficient'
  end as status,
  i.reorder_point,
  i.media_path
from inventory.items i
left join lateral (
  select sc.actual_quantity, sc.counted_at, sc.counted_by
  from inventory.stock_counts sc
  where sc.tenant_id = i.tenant_id and sc.item_id = i.id
  order by sc.counted_at desc, sc.id desc
  limit 1
) lc on true
left join workforce.employees e
  on e.tenant_id = i.tenant_id and e.user_id = lc.counted_by;

-- Permanent-delete (0055) now also returns the item's media_path (if any) so
-- the calling Server Action can remove the orphaned Storage object -- same
-- responsibility split as workforce.permanently_delete_recipe (0057).
-- `create or replace function` cannot change a RETURNS TABLE column list
-- (Postgres error 42P13: "cannot change return type of existing function"),
-- so both functions are dropped first.
drop function if exists inventory.permanently_delete_item(uuid, uuid);
drop function if exists api.permanently_delete_inventory_item(uuid, uuid);

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
  'Hard-deletes an inventory item only when the caller holds inventory.item.manage for its location and it has zero inventory.stock_counts history. SECURITY DEFINER because inventory.items has no DELETE RLS policy by design (0036) -- this function is the sole, guarded exception, and re-implements the manage-permission check inline since it cannot rely on RLS for it. Lives outside the api schema per ADR 0008 (no SECURITY DEFINER object in api); api.permanently_delete_inventory_item is its invoker-only passthrough. Returns zero rows for not-found/unauthorized (indistinguishable to the caller, matching every other Inventory write path); returns (false, true, media_path) when blocked by existing stock-count history; returns (true, false, media_path) on success -- media_path lets the caller clean up the Storage object.';

-- `drop function` above also drops its grants -- re-apply them (0055's originals).
revoke all on function inventory.permanently_delete_item(uuid, uuid) from public;
grant execute on function inventory.permanently_delete_item(uuid, uuid) to authenticated;

create or replace function api.permanently_delete_inventory_item(
  p_tenant_id uuid,
  p_item_id uuid
)
returns table (
  deleted boolean,
  blocked_by_history boolean,
  media_path text
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

-- Storage bucket + RLS -------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-media', 'inventory-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy inventory_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'inventory-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
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

create policy inventory_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'inventory-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_permission((storage.foldername(name))[1]::uuid, 'inventory.item.manage', (storage.foldername(name))[2]::uuid)
  and exists (
    select 1 from inventory.items i
    where i.tenant_id = (storage.foldername(name))[1]::uuid
      and i.location_id = (storage.foldername(name))[2]::uuid
      and i.id = (storage.foldername(name))[3]::uuid
  )
);

create policy inventory_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'inventory-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_permission((storage.foldername(name))[1]::uuid, 'inventory.item.manage', (storage.foldername(name))[2]::uuid)
);
