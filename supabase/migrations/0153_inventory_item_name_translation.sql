-- ============================================================================
-- 0153  Inventory item names: machine translation JA <-> EN through the
--       shared content.translations capability (Recipes is the first
--       consumer, 0039/0040/0041/0042/0047/0058). Forward-only: extends those
--       migrations without editing any of them.
-- ----------------------------------------------------------------------------
-- WHAT CHANGES
--   1. inventory.items.name_language ('ja' | 'en', default 'ja'): the language
--      the item's human-entered name was written in. Translation always flows
--      FROM it TO the other language -- same per-entity rule as
--      workforce.recipes.original_language (0058). The app sets it on every
--      create/rename by script detection (any kana/kanji -> 'ja', else 'en');
--      existing rows are backfilled below with the SAME rule.
--   2. api.inventory_items / api.inventory_item_status expose name_language
--      (appended as the last column -- `create or replace view` may only add
--      columns at the end). api.inventory_items is the existing plain
--      INSERT/UPDATE write path (0038/0085), so the app writes the column
--      through it with no new RPC and no new grant (the existing grants on
--      the view and on inventory.items are table-level).
--   3. content.translations CHECKs: source_entity_type gains 'inventory_item',
--      source_field gains 'name'. Every existing value stays allowed.
--   4. The four source helpers gain an 'inventory_item' branch; every
--      existing recipe branch is kept byte-identical:
--        content.can_read_translation_source    -- item visible AND
--          inventory module on AND (inventory.item.read OR .manage) at the
--          item's location
--        content.can_manage_translation_source  -- inventory module on AND
--          inventory.item.manage at the item's location
--        content.recipe_original_language        -- items.name_language
--          (the function name is historical; it is the shared "original
--          language of this source row" resolver every write RPC calls)
--        content.translation_source_text         -- items.name (one column,
--          whatever its language -- no *_ja/*_en pair as on recipes)
--      With these, the EXISTING write RPCs (api.set_machine_content_
--      translation_confirmed, api.set_content_translation,
--      api.mark_content_translation_reviewed) work for inventory items
--      unchanged: source/target language and the trusted source hash are
--      derived server-side, never client-supplied.
--   5. inventory.permanently_delete_item also deletes the item's
--      content.translations rows (one added DELETE, all guards unchanged).
--
-- SECURITY POSTURE: unchanged. All four helpers stay SECURITY INVOKER with
-- their existing search_path, owner and grants (create or replace keeps
-- grants; they are re-stated below anyway). The inventory branches run under
-- the caller's own privileges, so inventory.items' own RLS (inv_items_select,
-- 0095: module access + read/manage at the location) already filters the row;
-- the explicit module/permission conjuncts are defence in depth and make the
-- intended gate readable at the call site. Translation rows carry no
-- location_id (tenant-wide by design, 0039); location isolation comes from
-- resolving the source item, whose location_id IS checked.
--
-- STALENESS: as for recipes, a translation stores the sha256 of the trimmed
-- source text it was made from (source_content_hash, computed server-side by
-- the write RPCs). Renaming an item makes the hash mismatch the new name, so
-- readers treat the row as stale (fall back to the original) until the app
-- re-translates it. No trigger flips translation_status here.
--
-- BACKFILL of name_language: only rows whose name has no kana/kanji are
-- updated (to 'en'); everything else keeps the column default 'ja'. The
-- items' set_updated_at / stamp_item_actor triggers are disabled around this
-- one statement so the backfill does not rewrite updated_at / updated_by
-- (it is a derived-metadata fix, not a user edit).
--
-- Rollback: drop the column (views first re-created without it), restore the
-- 0039/0058 bodies of the four helpers, the 0095 body of
-- inventory.permanently_delete_item and the previous CHECK lists (after
-- deleting any 'inventory_item' translation rows). No other data changes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. inventory.items.name_language + backfill
-- ----------------------------------------------------------------------------
alter table inventory.items
  add column if not exists name_language text not null default 'ja'
    check (name_language in ('ja', 'en'));

comment on column inventory.items.name_language is
  'Language the human-entered name was written in (ja or en). Set by the app on create/rename by script detection (any kana/kanji -> ja, else en). Machine translation of the name always flows from this language to the other one (content.translations, source_entity_type inventory_item, source_field name).';

alter table inventory.items disable trigger set_updated_at;
alter table inventory.items disable trigger stamp_item_actor;

-- Hiragana, katakana (incl. ー), CJK ext A + unified ideographs, 々, half-width katakana.
update inventory.items
   set name_language = 'en'
 where name_language = 'ja'
   and name !~ '[぀-ヿ㐀-䶿一-鿿々ｦ-ﾟ]';

alter table inventory.items enable trigger set_updated_at;
alter table inventory.items enable trigger stamp_item_actor;

-- ----------------------------------------------------------------------------
-- 2. API facade views: expose name_language (appended last)
-- ----------------------------------------------------------------------------
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
  i.media_path,
  i.name_language
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
  i.media_path,
  i.name_language
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

-- ----------------------------------------------------------------------------
-- 3. content.translations: allow the inventory_item / name source
-- ----------------------------------------------------------------------------
alter table content.translations
  drop constraint translations_source_entity_type_check,
  add constraint translations_source_entity_type_check
    check (source_entity_type in (
      'workforce_recipe',
      'workforce_recipe_ingredient',
      'workforce_recipe_step',
      'workforce_recipe_note',
      'inventory_item'
    ));

alter table content.translations
  drop constraint translations_source_field_check,
  add constraint translations_source_field_check
    check (source_field in (
      'title', 'description',      -- workforce_recipe
      'label',                      -- workforce_recipe_ingredient
      'instruction',                -- workforce_recipe_step
      'note_title', 'note_body',     -- workforce_recipe_note
      'name'                        -- inventory_item
    ));

-- ----------------------------------------------------------------------------
-- 4a. content.can_read_translation_source (0039 body + inventory_item)
-- ----------------------------------------------------------------------------
create or replace function content.can_read_translation_source(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid
)
returns boolean
language sql
stable
set search_path = core, workforce, public
as $$
  select case p_source_entity_type
    when 'workforce_recipe' then exists (
      select 1 from workforce.recipes r where r.tenant_id = p_tenant_id and r.id = p_source_entity_id
    )
    when 'workforce_recipe_ingredient' then exists (
      select 1 from workforce.recipe_ingredients c where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
    )
    when 'workforce_recipe_step' then exists (
      select 1 from workforce.recipe_steps c where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
    )
    when 'workforce_recipe_note' then exists (
      select 1 from workforce.recipe_notes c where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
    )
    when 'inventory_item' then exists (
      select 1 from inventory.items i
      where i.tenant_id = p_tenant_id and i.id = p_source_entity_id
        and core.has_module_access(i.tenant_id, 'inventory')
        and (
          core.has_permission(i.tenant_id, 'inventory.item.read', i.location_id)
          or core.has_permission(i.tenant_id, 'inventory.item.manage', i.location_id)
        )
    )
    else false
  end;
$$;

comment on function content.can_read_translation_source(uuid, text, uuid) is
  'True when the referenced source row is visible to the caller under its OWN table''s existing RLS (recipe read/manage audience; for inventory_item additionally: inventory module on and inventory.item.read or .manage at the item''s location, 0153). SECURITY INVOKER: correctness relies on the source table''s own RLS, not on bypassing it.';

revoke all on function content.can_read_translation_source(uuid, text, uuid) from public;
grant execute on function content.can_read_translation_source(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4b. content.can_manage_translation_source (0039 body + inventory_item)
-- ----------------------------------------------------------------------------
create or replace function content.can_manage_translation_source(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid
)
returns boolean
language sql
stable
set search_path = core, workforce, public
as $$
  select case p_source_entity_type
    when 'workforce_recipe' then workforce.can_manage_recipe(p_source_entity_id)
    when 'workforce_recipe_ingredient' then exists (
      select 1 from workforce.recipe_ingredients c
      where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
        and workforce.can_manage_recipe(c.recipe_id)
    )
    when 'workforce_recipe_step' then exists (
      select 1 from workforce.recipe_steps c
      where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
        and workforce.can_manage_recipe(c.recipe_id)
    )
    when 'workforce_recipe_note' then exists (
      select 1 from workforce.recipe_notes c
      where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
        and workforce.can_manage_recipe(c.recipe_id)
    )
    when 'inventory_item' then exists (
      select 1 from inventory.items i
      where i.tenant_id = p_tenant_id and i.id = p_source_entity_id
        and core.has_module_access(i.tenant_id, 'inventory')
        and core.has_permission(i.tenant_id, 'inventory.item.manage', i.location_id)
    )
    else false
  end;
$$;

comment on function content.can_manage_translation_source(uuid, text, uuid) is
  'True when the caller may write a translation of this source row: workforce.recipe.manage applicable to the owning recipe (recipe itself, or the parent recipe of an ingredient/step/note); for inventory_item, inventory module on and inventory.item.manage at the item''s location (0153). Manager-only write gate for content.translations.';

revoke all on function content.can_manage_translation_source(uuid, text, uuid) from public;
grant execute on function content.can_manage_translation_source(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4c. content.recipe_original_language (0058 body + inventory_item)
-- ----------------------------------------------------------------------------
create or replace function content.recipe_original_language(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid
)
returns text
language sql
stable
security invoker
set search_path = workforce, public
as $$
  select case p_source_entity_type
    when 'workforce_recipe' then (
      select r.original_language from workforce.recipes r
      where r.tenant_id = p_tenant_id and r.id = p_source_entity_id
    )
    when 'workforce_recipe_ingredient' then (
      select r.original_language from workforce.recipes r
      join workforce.recipe_ingredients i
        on i.tenant_id = r.tenant_id and i.recipe_id = r.id
      where r.tenant_id = p_tenant_id and i.id = p_source_entity_id
    )
    when 'workforce_recipe_step' then (
      select r.original_language from workforce.recipes r
      join workforce.recipe_steps s
        on s.tenant_id = r.tenant_id and s.recipe_id = r.id
      where r.tenant_id = p_tenant_id and s.id = p_source_entity_id
    )
    when 'workforce_recipe_note' then (
      select r.original_language from workforce.recipes r
      join workforce.recipe_notes n
        on n.tenant_id = r.tenant_id and n.recipe_id = r.id
      where r.tenant_id = p_tenant_id and n.id = p_source_entity_id
    )
    when 'inventory_item' then (
      select it.name_language from inventory.items it
      where it.tenant_id = p_tenant_id and it.id = p_source_entity_id
    )
    else null
  end;
$$;

comment on function content.recipe_original_language(uuid, text, uuid) is
  'Resolves the original language of a translation source row: the owning recipe''s original_language (the recipe itself, or the parent recipe of an ingredient/step/note), or inventory.items.name_language for inventory_item (0153 -- the name is historical). Returns null if the row is not visible under its own table''s RLS -- never guessed. Drives which column (content.translation_source_text) and which target_language (the write RPCs) apply.';

revoke all on function content.recipe_original_language(uuid, text, uuid) from public;
grant execute on function content.recipe_original_language(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4d. content.translation_source_text (0058 body wrapped + inventory_item)
--     An inventory item has ONE name column whatever its language, so its
--     branch is resolved first; the 0058 expression is the unchanged `else`.
-- ----------------------------------------------------------------------------
create or replace function content.translation_source_text(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_source_field text
)
returns text
language sql
stable
security invoker
set search_path = workforce, content, public
as $$
  select case
  when p_source_entity_type = 'inventory_item' then
    case
      when p_source_field = 'name'
        then (select it.name from inventory.items it
              where it.tenant_id = p_tenant_id and it.id = p_source_entity_id)
      else null
    end
  else
  case
    when content.recipe_original_language(p_tenant_id, p_source_entity_type, p_source_entity_id) = 'en' then
      case
        when p_source_entity_type = 'workforce_recipe' and p_source_field = 'title'
          then (select r.title_en from workforce.recipes r
                where r.tenant_id = p_tenant_id and r.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe' and p_source_field = 'description'
          then (select r.description_en from workforce.recipes r
                where r.tenant_id = p_tenant_id and r.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_ingredient' and p_source_field = 'label'
          then (select i.label_en from workforce.recipe_ingredients i
                where i.tenant_id = p_tenant_id and i.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_step' and p_source_field = 'instruction'
          then (select s.instruction_en from workforce.recipe_steps s
                where s.tenant_id = p_tenant_id and s.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_note' and p_source_field = 'note_title'
          then (select n.title_en from workforce.recipe_notes n
                where n.tenant_id = p_tenant_id and n.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_note' and p_source_field = 'note_body'
          then (select n.body_en from workforce.recipe_notes n
                where n.tenant_id = p_tenant_id and n.id = p_source_entity_id)
        else null
      end
    else
      -- Default/'ja' branch -- also the fallback when the owning recipe
      -- cannot be resolved (not visible / not found), matching this
      -- function's pre-existing (0042) behaviour exactly for that case.
      case
        when p_source_entity_type = 'workforce_recipe' and p_source_field = 'title'
          then (select r.title_ja from workforce.recipes r
                where r.tenant_id = p_tenant_id and r.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe' and p_source_field = 'description'
          then (select r.description_ja from workforce.recipes r
                where r.tenant_id = p_tenant_id and r.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_ingredient' and p_source_field = 'label'
          then (select i.label_ja from workforce.recipe_ingredients i
                where i.tenant_id = p_tenant_id and i.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_step' and p_source_field = 'instruction'
          then (select s.instruction_ja from workforce.recipe_steps s
                where s.tenant_id = p_tenant_id and s.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_note' and p_source_field = 'note_title'
          then (select n.title_ja from workforce.recipe_notes n
                where n.tenant_id = p_tenant_id and n.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_note' and p_source_field = 'note_body'
          then (select n.body_ja from workforce.recipe_notes n
                where n.tenant_id = p_tenant_id and n.id = p_source_entity_id)
        else null
      end
  end
  end;
$$;

-- ----------------------------------------------------------------------------
-- 5. inventory.permanently_delete_item (0095 body + translation cleanup)
--    content.translations.source_entity_id has no FK (0039), so a hard-
--    deleted item would leave its name translations behind (invisible -- the
--    read gate resolves the source row -- but dead data). Mirrors the recipe
--    hard delete (0057): the item's translation rows are deleted in the same
--    transaction, right before the item row. The ONLY change to the 0095
--    body is that one DELETE; every guard (module access, not-found,
--    inventory.item.manage at the location, stock-count history) still runs
--    first and unchanged. Same signature/return type, so create or replace
--    keeps the owner and grants (SECURITY DEFINER, search_path unchanged).
-- ----------------------------------------------------------------------------
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

  delete from content.translations
  where tenant_id = p_tenant_id
    and source_entity_type = 'inventory_item'
    and source_entity_id = p_item_id;

  delete from inventory.items
  where tenant_id = p_tenant_id and id = p_item_id;

  return query select true, false, v_media_path;
end;
$$;
