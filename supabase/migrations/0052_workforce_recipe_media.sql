-- Cafe v2.1: private, tenant/location-scoped recipe media.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-media', 'recipe-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy recipe_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'recipe-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and (
    core.has_permission((storage.foldername(name))[1]::uuid, 'workforce.recipe.read', (storage.foldername(name))[2]::uuid)
    or core.has_permission((storage.foldername(name))[1]::uuid, 'workforce.recipe.manage', (storage.foldername(name))[2]::uuid)
  )
  and exists (
    select 1 from workforce.recipes r
    where r.tenant_id = (storage.foldername(name))[1]::uuid
      and r.location_id = (storage.foldername(name))[2]::uuid
      and r.id = (storage.foldername(name))[3]::uuid
  )
);

create policy recipe_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'recipe-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_permission((storage.foldername(name))[1]::uuid, 'workforce.recipe.manage', (storage.foldername(name))[2]::uuid)
  and exists (
    select 1 from workforce.recipes r
    where r.tenant_id = (storage.foldername(name))[1]::uuid
      and r.location_id = (storage.foldername(name))[2]::uuid
      and r.id = (storage.foldername(name))[3]::uuid
  )
);

create policy recipe_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'recipe-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_permission((storage.foldername(name))[1]::uuid, 'workforce.recipe.manage', (storage.foldername(name))[2]::uuid)
);
