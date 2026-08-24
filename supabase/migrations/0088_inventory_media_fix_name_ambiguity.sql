-- ============================================================================
-- 0088  Fix column-name ambiguity bug in 0085's inventory_media_* storage
--       policies, and drop the temporary debug functions from 0086/0087.
-- ----------------------------------------------------------------------------
-- Bug: each policy's EXISTS subquery wrote the bare, unqualified `name` inside
-- `storage.foldername(name)`, intending it to mean the outer `storage.objects
-- .name` column being checked. But `inventory.items` (aliased `i` in that same
-- subquery) also has its own `name` column (the item's display name, e.g.
-- "Coffee beans") -- Postgres resolves an unqualified column reference to the
-- INNERMOST matching scope, so `name` silently bound to `i.name` instead,
-- shadowing the outer table entirely. `storage.foldername('Coffee beans')`
-- (a string with no '/' separators) does not produce the expected 3-element
-- path array, so the EXISTS clause never matched and every insert/select/
-- delete on this bucket failed RLS -- confirmed live via `pg_get_expr` on the
-- stored policy, which printed `storage.foldername(i.name)`.
--
-- workforce.recipes has no plain `name` column (only title_ja/title_en), so
-- the identical bare-`name` pattern in 0052/0074's recipe_media_* policies
-- never hit this ambiguity -- not a bug there, just no matching column to
-- shadow it. Fix here: qualify every such reference as `objects.name`
-- (storage.objects' own alias), removing the ambiguity outright.
-- ============================================================================

drop policy if exists inventory_media_select on storage.objects;
drop policy if exists inventory_media_insert on storage.objects;
drop policy if exists inventory_media_delete on storage.objects;

create policy inventory_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'inventory-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
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

create policy inventory_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'inventory-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_permission((storage.foldername(objects.name))[1]::uuid, 'inventory.item.manage', (storage.foldername(objects.name))[2]::uuid)
  and exists (
    select 1 from inventory.items i
    where i.tenant_id = (storage.foldername(objects.name))[1]::uuid
      and i.location_id = (storage.foldername(objects.name))[2]::uuid
      and i.id = (storage.foldername(objects.name))[3]::uuid
  )
);

create policy inventory_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'inventory-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_permission((storage.foldername(objects.name))[1]::uuid, 'inventory.item.manage', (storage.foldername(objects.name))[2]::uuid)
);

-- Drop the temporary diagnostic functions added by 0086/0087 while chasing
-- this bug -- never referenced by the app, debug-only.
drop function if exists api.debug_inventory_media_check(text);
drop function if exists api.debug_storage_meta();
drop function if exists api.debug_tables_check();
