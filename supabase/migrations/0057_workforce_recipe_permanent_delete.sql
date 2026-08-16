-- ============================================================================
-- 0057  Workforce: guarded permanent-delete RPC for workforce.recipes
-- ----------------------------------------------------------------------------
-- Cafe v2.1 Recipe lifecycle iteration adds a real hard-delete alongside the
-- existing Archive/Restore (`api.workforce_recipes`'s own `status` UPDATE,
-- 0053, unchanged by this migration):
--   1. Archive/Restore -- the normal action for retiring a recipe. Always
--      available, never blocked, never touches this migration's function.
--   2. Permanent Delete -- only ever offered to the Manager from the Archived
--      state (enforced client-side by only rendering the action there; also
--      re-checked here server-side since a client check is never trusted
--      alone) -- destructive and irreversible.
--
-- CONFIRMED INVARIANT: `workforce.recipes` has insert/update grants
-- (0051) but no DELETE grant to `authenticated`, and `api.workforce_recipes`
-- has only select + update(status) (0051/0053) -- both deliberate (recipe
-- content authoring the initial requirement, not deletion). This migration
-- does not add a DELETE grant on either. Instead, mirroring 0055
-- (Inventory)/0056 (Employees), the guarded logic (status + permission check,
-- the actual privileged DELETE, and orphan cleanup) lives in
-- `workforce.permanently_delete_recipe`, a SECURITY DEFINER function outside
-- the `api` schema per ADR 0008; `api.permanently_delete_recipe` is a thin
-- SECURITY INVOKER passthrough with no table access of its own, same shape as
-- `api.permanently_delete_employee`/`api.permanently_delete_inventory_item`.
--
-- Dependencies handled (per the Cafe v2.1 remediation brief's explicit
-- checklist -- recipe translations, recipe media, storage objects, historical
-- references, foreign keys, staff visibility):
--   - `workforce.recipe_ingredients`/`recipe_steps`/`recipe_notes`: each has
--     an existing `on delete cascade` FK to `workforce.recipes` (0021), so
--     deleting the recipe row already removes them -- no explicit statement
--     needed.
--   - `content.translations`: deliberately has NO foreign key to any of the
--     four `workforce_recipe*` source tables (0039's own header: "referential
--     integrity is enforced by content.can_read_translation_source/
--     can_manage_translation_source at the RLS layer", not a DB constraint).
--     A plain recipe DELETE would therefore leave orphaned translation rows
--     behind (RLS would hide them from every future read since their source
--     no longer resolves, but they would never be reclaimed). This function
--     captures the recipe's own id plus every current ingredient/step/note id
--     BEFORE the cascading delete, then explicitly deletes every
--     `content.translations` row keyed to any of those four
--     (source_entity_type, source_entity_id) pairs.
--   - Recipe media (`workforce.recipes.media_path`, Supabase Storage object
--     in the `recipe-media` bucket): storage objects are not reachable from
--     plain SQL/RPC in this project's existing pattern (every other
--     media-path removal, e.g. `previewUpsertRecipe`'s old-photo cleanup,
--     happens in the TypeScript action layer via
--     `supabase.storage.from('recipe-media').remove([...])`). This function
--     returns the recipe's `media_path` on a successful delete so the calling
--     Server Action can remove the storage object right after, the same
--     division of responsibility the existing Save flow already uses.
--   - Staff visibility: Staff only ever reads recipes via
--     `wf_recipes_staff_select`-shaped queries filtered to non-deleted rows,
--     so a deleted recipe simply stops resolving -- no separate change
--     needed.
-- ============================================================================

create or replace function workforce.permanently_delete_recipe(
  p_tenant_id uuid,
  p_recipe_id uuid
)
returns table (
  deleted boolean,
  blocked_not_archived boolean,
  media_path text
)
language plpgsql
security definer
set search_path = core, workforce, content, public
as $$
declare
  v_location_id uuid;
  v_status text;
  v_media_path text;
begin
  select r.location_id, r.status, r.media_path
    into v_location_id, v_status, v_media_path
  from workforce.recipes r
  where r.tenant_id = p_tenant_id
    and r.id = p_recipe_id;

  if v_status is null then
    -- Not found, or not visible to this tenant -- indistinguishable to the
    -- caller, matching every other recipe write path's not_found convention.
    return;
  end if;

  -- `location_id` may be null for a tenant-wide recipe (see 0021's own
  -- comment on the column) -- `core.has_permission` with a null location
  -- checks the tenant-level grant, same convention every other recipe write
  -- in this schema already relies on.
  if not core.has_permission(p_tenant_id, 'workforce.recipe.manage', v_location_id) then
    return;
  end if;

  if v_status <> 'archived' then
    return query select false, true, null::text;
    return;
  end if;

  delete from content.translations
  where tenant_id = p_tenant_id
    and (
      (source_entity_type = 'workforce_recipe' and source_entity_id = p_recipe_id)
      or (source_entity_type = 'workforce_recipe_ingredient' and source_entity_id in (
            select id from workforce.recipe_ingredients where tenant_id = p_tenant_id and recipe_id = p_recipe_id))
      or (source_entity_type = 'workforce_recipe_step' and source_entity_id in (
            select id from workforce.recipe_steps where tenant_id = p_tenant_id and recipe_id = p_recipe_id))
      or (source_entity_type = 'workforce_recipe_note' and source_entity_id in (
            select id from workforce.recipe_notes where tenant_id = p_tenant_id and recipe_id = p_recipe_id))
    );

  -- Cascades to recipe_ingredients/recipe_steps/recipe_notes (0021's
  -- `on delete cascade` FKs).
  delete from workforce.recipes
  where tenant_id = p_tenant_id and id = p_recipe_id;

  return query select true, false, v_media_path;
end;
$$;

comment on function workforce.permanently_delete_recipe(uuid, uuid) is
  'Hard-deletes a workforce.recipes row (cascading to its ingredients/steps/notes, 0021) only when the caller holds workforce.recipe.manage for its location and the recipe is currently Archived. Also explicitly deletes every content.translations row keyed to the recipe or any of its ingredients/steps/notes (0039 deliberately has no FK there) so no orphaned translation row survives. SECURITY DEFINER because authenticated has no DELETE grant on workforce.recipes -- this function is the sole, guarded exception, and re-implements the manage-permission check inline since it cannot rely on RLS for it. Lives outside the api schema per ADR 0008; api.permanently_delete_recipe is its invoker-only passthrough. Returns zero rows for not-found/unauthorized (indistinguishable to the caller); returns (false, true, null) when the recipe is not Archived; returns (true, false, media_path) on success so the caller can remove the Storage object.';

revoke all on function workforce.permanently_delete_recipe(uuid, uuid) from public;
grant execute on function workforce.permanently_delete_recipe(uuid, uuid) to authenticated;

create or replace function api.permanently_delete_recipe(
  p_tenant_id uuid,
  p_recipe_id uuid
)
returns table (
  deleted boolean,
  blocked_not_archived boolean,
  media_path text
)
language sql
security invoker
set search_path = workforce, public
as $$
  select * from workforce.permanently_delete_recipe(p_tenant_id, p_recipe_id);
$$;

comment on function api.permanently_delete_recipe(uuid, uuid) is
  'Invoker-only passthrough to workforce.permanently_delete_recipe -- satisfies ADR 0008''s no-SECURITY-DEFINER-in-api invariant by construction (same shape as api.permanently_delete_employee, 0056, and api.permanently_delete_inventory_item, 0055). All authorization/state-guard/orphan-cleanup logic lives in the workforce-schema DEFINER function.';

revoke all on function api.permanently_delete_recipe(uuid, uuid) from public;
grant execute on function api.permanently_delete_recipe(uuid, uuid) to authenticated;
