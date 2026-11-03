-- ============================================================================
-- 0150 — inventory-media Storage policies: re-apply the 0088 fix
-- ----------------------------------------------------------------------------
-- BUG (Founder report 2026-11-03: "item photo does not upload"): 0095 re-created
-- inventory_media_select / inventory_media_insert with the bare `name` inside
-- the EXISTS over inventory.items — the exact ambiguity 0088 fixed. inventory.
-- items has its own `name` column, so `storage.foldername(name)` there binds to
-- i.name (the item's display name), the EXISTS never matches, and every photo
-- upload and every photo read on this bucket fails RLS. Cloud DEV: the last
-- object in the bucket dates from 2026-08-24 (before 0095).
--
-- FIX: the 0095 policies unchanged except every path reference is qualified as
-- objects.name. The delete policy has no subquery and stays as it is.
-- pgTAP 0090 covers upload / read / foreign-location / other-tenant.
--
-- Rollback: re-run the 0095 inventory_media_select / _insert blocks (restores
-- the bug; not recommended).
-- ============================================================================

drop policy if exists inventory_media_select on storage.objects;
create policy inventory_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'inventory-media'
  and objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_module_access((storage.foldername(objects.name))[1]::uuid, 'inventory')
  and (
    core.has_permission((storage.foldername(objects.name))[1]::uuid, 'inventory.item.read', (storage.foldername(objects.name))[2]::uuid)
    or core.has_permission((storage.foldername(objects.name))[1]::uuid, 'inventory.item.manage', (storage.foldername(objects.name))[2]::uuid)
  )
  and exists (
    select 1 from inventory.items i
    where i.tenant_id = (storage.foldername(objects.name))[1]::uuid
      and i.location_id = (storage.foldername(objects.name))[2]::uuid
      and i.id = (storage.foldername(objects.name))[3]::uuid
  )
);

drop policy if exists inventory_media_insert on storage.objects;
create policy inventory_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'inventory-media'
  and objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_module_access((storage.foldername(objects.name))[1]::uuid, 'inventory')
  and core.has_permission((storage.foldername(objects.name))[1]::uuid, 'inventory.item.manage', (storage.foldername(objects.name))[2]::uuid)
  and exists (
    select 1 from inventory.items i
    where i.tenant_id = (storage.foldername(objects.name))[1]::uuid
      and i.location_id = (storage.foldername(objects.name))[2]::uuid
      and i.id = (storage.foldername(objects.name))[3]::uuid
  )
);
