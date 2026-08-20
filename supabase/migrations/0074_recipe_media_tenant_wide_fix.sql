-- Fixes a pre-existing gap in 0052's recipe-media Storage policies: they
-- never handled tenant-wide recipes (workforce.recipes.location_id IS
-- NULL), which are a real, by-design case (see 0022's own RLS policies on
-- workforce.recipes, which explicitly branch on location_id being null vs
-- not -- these storage policies never got that same branch). For a
-- tenant-wide recipe, `r.location_id = (storage.foldername(name))[2]::uuid`
-- evaluates to NULL (never true) in Postgres, so the EXISTS always failed
-- and every upload/read/delete of that recipe's photo was denied by RLS
-- regardless of the caller's actual permissions.
--
-- Found live 2026-08-20 during the Cafe Manager UI/UX Parity mission's WP-6
-- (recipe photo upload): uploading a photo onto an existing tenant-wide
-- recipe failed with "new row violates row-level security policy".
--
-- Mirrors the exact tenant-wide branch 0022 already uses for
-- workforce.recipes itself: `location_id is null and
-- core.has_permission_in_tenant(...)` vs `location_id is not null and
-- core.has_permission(..., location_id)`.

drop policy if exists recipe_media_select on storage.objects;
drop policy if exists recipe_media_insert on storage.objects;
drop policy if exists recipe_media_delete on storage.objects;

create policy recipe_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'recipe-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and exists (
    select 1 from workforce.recipes r
    where r.tenant_id = (storage.foldername(name))[1]::uuid
      and r.id = (storage.foldername(name))[3]::uuid
      and (
        (r.location_id is null and (storage.foldername(name))[2]::uuid is not null
          and (
            core.has_permission_in_tenant(r.tenant_id, 'workforce.recipe.read')
            or core.has_permission_in_tenant(r.tenant_id, 'workforce.recipe.manage')
          ))
        or (r.location_id is not null and r.location_id = (storage.foldername(name))[2]::uuid
          and (
            core.has_permission(r.tenant_id, 'workforce.recipe.read', r.location_id)
            or core.has_permission(r.tenant_id, 'workforce.recipe.manage', r.location_id)
          ))
      )
  )
);

create policy recipe_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'recipe-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and exists (
    select 1 from workforce.recipes r
    where r.tenant_id = (storage.foldername(name))[1]::uuid
      and r.id = (storage.foldername(name))[3]::uuid
      and (
        (r.location_id is null and (storage.foldername(name))[2]::uuid is not null
          and core.has_permission_in_tenant(r.tenant_id, 'workforce.recipe.manage'))
        or (r.location_id is not null and r.location_id = (storage.foldername(name))[2]::uuid
          and core.has_permission(r.tenant_id, 'workforce.recipe.manage', r.location_id))
      )
  )
);

create policy recipe_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'recipe-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and exists (
    select 1 from workforce.recipes r
    where r.tenant_id = (storage.foldername(name))[1]::uuid
      and r.id = (storage.foldername(name))[3]::uuid
      and (
        (r.location_id is null and (storage.foldername(name))[2]::uuid is not null
          and core.has_permission_in_tenant(r.tenant_id, 'workforce.recipe.manage'))
        or (r.location_id is not null and r.location_id = (storage.foldername(name))[2]::uuid
          and core.has_permission(r.tenant_id, 'workforce.recipe.manage', r.location_id))
      )
  )
);
