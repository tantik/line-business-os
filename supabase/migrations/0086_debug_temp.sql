-- TEMP DEBUG migration, to be dropped/reverted once 0085's storage RLS issue is diagnosed.
create or replace function api.debug_inventory_media_check(p_name text)
returns table (
  bucket_ok boolean,
  regex_ok boolean,
  perm_ok boolean,
  exists_ok boolean,
  seg1 text,
  seg2 text,
  seg3 text
)
language sql
security invoker
set search_path = core, inventory, storage, public
as $$
  select
    true as bucket_ok,
    p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' as regex_ok,
    core.has_permission((storage.foldername(p_name))[1]::uuid, 'inventory.item.manage', (storage.foldername(p_name))[2]::uuid) as perm_ok,
    exists (
      select 1 from inventory.items i
      where i.tenant_id = (storage.foldername(p_name))[1]::uuid
        and i.location_id = (storage.foldername(p_name))[2]::uuid
        and i.id = (storage.foldername(p_name))[3]::uuid
    ) as exists_ok,
    (storage.foldername(p_name))[1] as seg1,
    (storage.foldername(p_name))[2] as seg2,
    (storage.foldername(p_name))[3] as seg3;
$$;

grant execute on function api.debug_inventory_media_check(text) to authenticated;
