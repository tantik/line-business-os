-- ============================================================================
-- 0121  Cafe v2.2 WP5 -- Recipe Intelligence Lite
-- ----------------------------------------------------------------------------
-- Additive only. Adds:
--   1. Recipe ingredient -> Inventory item mapping (quantity + unit), an
--      all-or-nothing triple (a bare label with no mapping stays fully valid
--      -- the common case, never made mandatory).
--   2. A trigger enforcing the multi-location safety rule: a location-scoped
--      recipe may only map to an Inventory item AT THAT SAME LOCATION; a
--      tenant-wide recipe (location_id is null) may map to any item within
--      the tenant -- deliberately the smallest safe model, not an oversight.
--      Whichever item/location a tenant-wide recipe's ingredient picks, the
--      resulting cost is specific to that one item/location.
--   3. Two Manager-maintained Inventory item fields -- reference_unit_price
--      (an ESTIMATE, never receiving/accounting price) and allergen_codes
--      (NULL = not configured/unknown, must never be displayed or treated as
--      "no allergens"; '{}' = Manager explicitly confirmed none known). These
--      are added ONLY to `inventory.items`, never to `api.inventory_items` or
--      `api.inventory_item_status` -- those two views' column lists are left
--      byte-for-byte as they were, which is what keeps price out of every
--      Staff-reachable Inventory surface (Staff already holds
--      inventory.item.read and can SELECT `inventory.items` directly, gated
--      by RLS row-visibility, not column-visibility -- PostgREST only exposes
--      the `api`/`public` schemas per supabase/config.toml, so a raw column
--      on the `inventory` schema table is not network-reachable on its own,
--      but no view built on top of it may ever project this column to a
--      Staff-reachable audience).
--   4. A deterministic unit-conversion helper (kg<->g, L<->mL, same-unit;
--      NULL for anything else, including any pair touching `pcs` -- never a
--      guessed number).
--   5. `api.upsert_workforce_recipe` (CREATE OR REPLACE, same signature)
--      extended to accept EITHER a plain string ingredient (legacy, exact
--      existing behavior preserved) OR a `{label, inventory_item_id,
--      quantity, unit}` object per array element.
--   6/7. Two Manager-only RPCs to set the two new Inventory fields
--      (SECURITY INVOKER + explicit `core.has_permission` check -- no RLS
--      predicate on `inventory.items` needs to change since this is a plain
--      column update already covered by `inv_items_update`, but a friendly
--      permission_denied/allergen-vocabulary error is worth raising before
--      falling through to a bare CHECK-constraint violation).
--   8. `api.workforce_recipe_ingredients` read view, extended with the
--      mapping + a plain join to `inventory.items` for display fields.
--      Deliberately carries NO reference_unit_price.
--   9/10. Cost breakdown / summary functions -- SECURITY INVOKER, reusing
--      the existing `workforce.can_manage_recipe(recipe_id)` helper (0022)
--      for the exact same tenant-wide-vs-location `workforce.recipe.manage`
--      rule the recipe RLS itself already uses, rather than re-deriving it.
--      This is an explicit, additional business-rule permission check ON TOP
--      of table RLS: Staff already has row-level read access to
--      recipe_ingredients/inventory.items (RLS is row-level, not
--      column-level), but must never see cost.
--
-- Out of scope (unchanged, untouched): purchases.* (WP4), api.inventory_items,
-- api.inventory_item_status, any new permission key, any SECURITY DEFINER
-- function, any automatic stock/inventory mutation from Recipe configuration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. workforce.recipe_ingredients -- optional Inventory mapping
-- ----------------------------------------------------------------------------

alter table workforce.recipe_ingredients
  add column inventory_item_id uuid null,
  add column quantity numeric(12, 3) null,
  add column unit text null;

alter table workforce.recipe_ingredients
  add constraint recipe_ingredients_quantity_positive
    check (quantity is null or quantity > 0);

alter table workforce.recipe_ingredients
  add constraint recipe_ingredients_unit_valid
    check (unit is null or unit in ('kg', 'g', 'L', 'mL', 'pcs'));

alter table workforce.recipe_ingredients
  add constraint recipe_ingredients_mapping_shape
    check (
      (inventory_item_id is null and quantity is null and unit is null)
      or (inventory_item_id is not null and quantity is not null and unit is not null)
    );

-- Tenant-safety by construction, not merely by RLS: a mapped ingredient can
-- only ever reference an inventory item in the SAME tenant.
alter table workforce.recipe_ingredients
  add constraint recipe_ingredients_item_tenant_fkey
    foreign key (tenant_id, inventory_item_id)
      references inventory.items(tenant_id, id);

create index if not exists wf_recipe_ingredients_item_idx
  on workforce.recipe_ingredients(tenant_id, inventory_item_id)
  where inventory_item_id is not null;

comment on column workforce.recipe_ingredients.inventory_item_id is
  'Optional mapping to inventory.items -- NULL means this ingredient is a bare label with no Inventory link (the common, fully valid case). All-or-nothing with quantity/unit (recipe_ingredients_mapping_shape).';
comment on column workforce.recipe_ingredients.quantity is
  'Quantity of `unit` used by this recipe, only meaningful together with inventory_item_id. No unit conversion is guessed anywhere -- see workforce.convert_quantity.';
comment on column workforce.recipe_ingredients.unit is
  'The unit `quantity` is expressed in -- same fixed vocabulary as inventory.items.unit. Does not have to match the mapped item''s own unit; workforce.convert_quantity resolves (or refuses) the conversion at cost-calculation time.';

-- ----------------------------------------------------------------------------
-- 2. Location-compatibility trigger
-- ----------------------------------------------------------------------------
-- A recipe with a non-null location_id may only map to an item at that SAME
-- location. A tenant-wide recipe (location_id is null) may map to any item
-- within the tenant -- deliberate "smallest safe model": the resulting cost
-- is then specific to whichever item/location was actually chosen, which is
-- an accepted, documented property of tenant-wide recipes, not a hidden bug.
create or replace function workforce.recipe_ingredient_check_item_location()
returns trigger
language plpgsql
set search_path = core, workforce, inventory, public
as $$
declare
  v_recipe_location_id uuid;
  v_item_location_id uuid;
begin
  if new.inventory_item_id is null then
    return new;
  end if;

  select r.location_id into v_recipe_location_id
  from workforce.recipes r
  where r.tenant_id = new.tenant_id and r.id = new.recipe_id;

  if v_recipe_location_id is null then
    -- Tenant-wide recipe: any item within the tenant is allowed (the
    -- tenant_id FK above already guarantees same-tenant). Nothing further to
    -- check here.
    return new;
  end if;

  select i.location_id into v_item_location_id
  from inventory.items i
  where i.tenant_id = new.tenant_id and i.id = new.inventory_item_id;

  if v_item_location_id is distinct from v_recipe_location_id then
    raise exception 'recipe_ingredient_item_location_mismatch'
      using errcode = 'P0001',
            detail = format(
              'recipe location %s does not match inventory item location %s',
              v_recipe_location_id, v_item_location_id
            );
  end if;

  return new;
end;
$$;

comment on function workforce.recipe_ingredient_check_item_location() is
  'BEFORE INSERT/UPDATE OF inventory_item_id, recipe_id trigger on workforce.recipe_ingredients: a location-scoped recipe may only map to an Inventory item at that same location; a tenant-wide recipe may map to any item within the tenant. Raises P0001 recipe_ingredient_item_location_mismatch otherwise.';

drop trigger if exists recipe_ingredients_check_item_location on workforce.recipe_ingredients;
create trigger recipe_ingredients_check_item_location
  before insert or update of inventory_item_id, recipe_id on workforce.recipe_ingredients
  for each row execute function workforce.recipe_ingredient_check_item_location();

-- ----------------------------------------------------------------------------
-- 3. inventory.items -- reference price (Manager-maintained estimate) +
--    allergen codes
-- ----------------------------------------------------------------------------

alter table inventory.items
  add column reference_unit_price numeric(12, 2) null
    check (reference_unit_price is null or reference_unit_price >= 0);

comment on column inventory.items.reference_unit_price is
  'MANAGER-MAINTAINED ESTIMATE ONLY: yen per 1 unit of items.unit. Never a receiving/purchase-order/accounting price (see purchases.* for that), never used anywhere outside recipe cost estimation. NULL = not configured -- must never be displayed or treated as zero.';

alter table inventory.items
  add column allergen_codes text[] null
    check (
      allergen_codes is null
      or allergen_codes <@ array['egg', 'milk', 'wheat', 'buckwheat', 'peanut', 'shrimp', 'crab', 'walnut', 'soy', 'sesame']::text[]
    );

comment on column inventory.items.allergen_codes is
  'Fixed 10-code vocabulary. NULL = not configured/unknown -- must never be displayed or treated as "no known allergens". Empty array (''{}'') = Manager explicitly confirmed no known allergens. These two states are never conflated by any reader of this column.';

-- Deliberately NOT added to api.inventory_items or api.inventory_item_status
-- -- those views' column lists are left exactly as they were (0037). This is
-- the mechanism, not an incidental omission, that keeps reference_unit_price
-- away from every Staff-reachable Inventory surface: Staff already holds
-- inventory.item.read and can see these rows via RLS, but RLS is row-level,
-- not column-level, so the column must simply never be selected by any view
-- or RPC a Staff-permission caller can reach.

-- ----------------------------------------------------------------------------
-- 4. Deterministic unit conversion -- never a guessed number
-- ----------------------------------------------------------------------------

create or replace function workforce.convert_quantity(p_quantity numeric, p_from_unit text, p_to_unit text)
returns numeric
language sql
immutable
as $$
  select case
    when p_from_unit = p_to_unit then p_quantity
    when p_from_unit = 'kg' and p_to_unit = 'g' then p_quantity * 1000
    when p_from_unit = 'g' and p_to_unit = 'kg' then p_quantity / 1000
    when p_from_unit = 'L' and p_to_unit = 'mL' then p_quantity * 1000
    when p_from_unit = 'mL' and p_to_unit = 'L' then p_quantity / 1000
    else null
  end
$$;

comment on function workforce.convert_quantity(numeric, text, text) is
  'Converts p_quantity from p_from_unit to p_to_unit using only exact, deterministic dimension-preserving factors (kg<->g, L<->mL, same-unit passthrough). Returns NULL for any unsupported/incompatible pair, including anything touching `pcs` -- never a guessed number.';

revoke all on function workforce.convert_quantity(numeric, text, text) from public;
grant execute on function workforce.convert_quantity(numeric, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. api.upsert_workforce_recipe -- accept a mapped-ingredient object element
-- ----------------------------------------------------------------------------
-- Same signature as 0113 (current effective body; nothing after 0113 touches
-- this function). CREATE OR REPLACE in place. Legacy plain-string elements
-- keep their exact existing behavior; a jsonb object element additionally
-- carries the mapping triple. When an object element's inventory_item_id is
-- null, the mapping columns on that row are explicitly cleared (unmap).

create or replace function api.upsert_workforce_recipe(
  p_tenant_id uuid,
  p_location_id uuid,
  p_recipe_id uuid,
  p_content_kind text,
  p_title text,
  p_description text,
  p_status text,
  p_ingredients jsonb,
  p_steps jsonb,
  p_note_title text,
  p_note_body text,
  p_media_path text,
  p_original_language text default 'ja',
  p_confirm_language_change boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = core, content, workforce, inventory, public
as $$
declare
  v_recipe_id uuid;
  v_index integer;
  v_element jsonb;
  v_is_object boolean;
  v_text text;
  v_item_id uuid;
  v_quantity numeric;
  v_unit text;
  v_existing_id uuid;
  v_keep uuid[] := array[]::uuid[];
  v_existing_language text;
  v_stale_entity_ids uuid[];
begin
  if p_content_kind not in ('recipe', 'instruction')
     or p_status not in ('draft', 'published', 'archived')
     or p_original_language not in ('ja', 'en')
     or length(btrim(p_title)) not between 1 and 160
     or p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array'
     or p_steps is null or jsonb_typeof(p_steps) <> 'array'
     or jsonb_array_length(p_ingredients) > 100
     or jsonb_array_length(p_steps) > 100
     or (p_media_path is not null and (length(p_media_path) > 500 or p_media_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
    raise exception 'recipe_invalid_input' using errcode = '22023';
  end if;

  if p_recipe_id is not null then
    select r.original_language into v_existing_language
    from workforce.recipes r
    where r.tenant_id = p_tenant_id and r.id = p_recipe_id;
    if v_existing_language is not null and v_existing_language <> p_original_language
       and not p_confirm_language_change then
      raise exception 'recipe_language_change_requires_confirmation' using errcode = 'P0001';
    end if;
  end if;

  if p_recipe_id is null then
    if p_original_language = 'ja' then
      insert into workforce.recipes
        (tenant_id, location_id, title_ja, description_ja, content_kind, status, media_path, original_language, created_by, updated_by)
      values
        (p_tenant_id, p_location_id, btrim(p_title), nullif(btrim(p_description), ''),
         p_content_kind, p_status, p_media_path, 'ja', core.current_user_id(), core.current_user_id())
      returning id into v_recipe_id;
    else
      insert into workforce.recipes
        (tenant_id, location_id, title_en, description_en, content_kind, status, media_path, original_language, created_by, updated_by)
      values
        (p_tenant_id, p_location_id, btrim(p_title), nullif(btrim(p_description), ''),
         p_content_kind, p_status, p_media_path, 'en', core.current_user_id(), core.current_user_id())
      returning id into v_recipe_id;
    end if;
  else
    if p_original_language = 'ja' then
      update workforce.recipes r
         set title_ja = btrim(p_title),
             description_ja = nullif(btrim(p_description), ''),
             content_kind = p_content_kind,
             status = p_status,
             media_path = p_media_path,
             original_language = 'ja',
             updated_by = core.current_user_id()
       where r.tenant_id = p_tenant_id
         and (r.location_id = p_location_id or r.location_id is null)
         and r.id = p_recipe_id
      returning r.id into v_recipe_id;
    else
      update workforce.recipes r
         set title_en = btrim(p_title),
             description_en = nullif(btrim(p_description), ''),
             content_kind = p_content_kind,
             status = p_status,
             media_path = p_media_path,
             original_language = 'en',
             updated_by = core.current_user_id()
       where r.tenant_id = p_tenant_id
         and (r.location_id = p_location_id or r.location_id is null)
         and r.id = p_recipe_id
      returning r.id into v_recipe_id;
    end if;
    if v_recipe_id is null then raise exception 'recipe_not_found' using errcode = 'P0001'; end if;
  end if;

  v_keep := array[]::uuid[];
  if jsonb_array_length(p_ingredients) > 0 then
  for v_index in 0..jsonb_array_length(p_ingredients) - 1 loop
    v_element := p_ingredients -> v_index;
    v_is_object := jsonb_typeof(v_element) = 'object';

    if v_is_object then
      v_text := btrim(v_element ->> 'label');
      v_item_id := nullif(v_element ->> 'inventory_item_id', '')::uuid;
      v_quantity := nullif(v_element ->> 'quantity', '')::numeric;
      v_unit := nullif(v_element ->> 'unit', '');
    else
      v_text := btrim(p_ingredients ->> v_index);
      v_item_id := null;
      v_quantity := null;
      v_unit := null;
    end if;

    if length(v_text) not between 1 and 500 then raise exception 'recipe_invalid_ingredient' using errcode = '22023'; end if;

    if v_item_id is not null and (v_quantity is null or v_quantity <= 0 or v_unit is null or v_unit not in ('kg', 'g', 'L', 'mL', 'pcs')) then
      raise exception 'recipe_invalid_ingredient_mapping' using errcode = '22023';
    end if;

    select i.id into v_existing_id from workforce.recipe_ingredients i
     where i.tenant_id = p_tenant_id and i.recipe_id = v_recipe_id
     order by i.sort_order, i.id offset v_index limit 1;
    if v_existing_id is null then
      if p_original_language = 'ja' then
        insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, sort_order, inventory_item_id, quantity, unit)
        values (p_tenant_id, v_recipe_id, v_text, v_index, v_item_id, v_quantity, v_unit) returning id into v_existing_id;
      else
        insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_en, sort_order, inventory_item_id, quantity, unit)
        values (p_tenant_id, v_recipe_id, v_text, v_index, v_item_id, v_quantity, v_unit) returning id into v_existing_id;
      end if;
    else
      if p_original_language = 'ja' then
        update workforce.recipe_ingredients
           set label_ja = v_text, sort_order = v_index, inventory_item_id = v_item_id, quantity = v_quantity, unit = v_unit
         where id = v_existing_id;
      else
        update workforce.recipe_ingredients
           set label_en = v_text, sort_order = v_index, inventory_item_id = v_item_id, quantity = v_quantity, unit = v_unit
         where id = v_existing_id;
      end if;
    end if;
    v_keep := array_append(v_keep, v_existing_id);
    v_existing_id := null;
  end loop;
  end if;
  delete from workforce.recipe_ingredients
   where tenant_id = p_tenant_id and recipe_id = v_recipe_id and not (id = any(v_keep));

  v_keep := array[]::uuid[];
  if jsonb_array_length(p_steps) > 0 then
  for v_index in 0..jsonb_array_length(p_steps) - 1 loop
    v_text := btrim(p_steps ->> v_index);
    if length(v_text) not between 1 and 2000 then raise exception 'recipe_invalid_step' using errcode = '22023'; end if;
    select s.id into v_existing_id from workforce.recipe_steps s
     where s.tenant_id = p_tenant_id and s.recipe_id = v_recipe_id
     order by s.step_number, s.id offset v_index limit 1;
    if v_existing_id is null then
      if p_original_language = 'ja' then
        insert into workforce.recipe_steps (tenant_id, recipe_id, instruction_ja, step_number)
        values (p_tenant_id, v_recipe_id, v_text, v_index + 1) returning id into v_existing_id;
      else
        insert into workforce.recipe_steps (tenant_id, recipe_id, instruction_en, step_number)
        values (p_tenant_id, v_recipe_id, v_text, v_index + 1) returning id into v_existing_id;
      end if;
    else
      if p_original_language = 'ja' then
        update workforce.recipe_steps set instruction_ja = v_text, step_number = v_index + 1 where id = v_existing_id;
      else
        update workforce.recipe_steps set instruction_en = v_text, step_number = v_index + 1 where id = v_existing_id;
      end if;
    end if;
    v_keep := array_append(v_keep, v_existing_id);
    v_existing_id := null;
  end loop;
  end if;
  delete from workforce.recipe_steps
   where tenant_id = p_tenant_id and recipe_id = v_recipe_id and not (id = any(v_keep));

  if nullif(btrim(p_note_body), '') is null then
    delete from workforce.recipe_notes where tenant_id = p_tenant_id and recipe_id = v_recipe_id;
  else
    select n.id into v_existing_id from workforce.recipe_notes n
     where n.tenant_id = p_tenant_id and n.recipe_id = v_recipe_id order by n.id limit 1;
    if v_existing_id is null then
      if p_original_language = 'ja' then
        insert into workforce.recipe_notes (tenant_id, recipe_id, title_ja, body_ja)
        values (p_tenant_id, v_recipe_id, nullif(btrim(p_note_title), ''), btrim(p_note_body));
      else
        insert into workforce.recipe_notes (tenant_id, recipe_id, title_en, body_en)
        values (p_tenant_id, v_recipe_id, nullif(btrim(p_note_title), ''), btrim(p_note_body));
      end if;
    else
      if p_original_language = 'ja' then
        update workforce.recipe_notes set title_ja = nullif(btrim(p_note_title), ''), body_ja = btrim(p_note_body)
         where id = v_existing_id;
      else
        update workforce.recipe_notes set title_en = nullif(btrim(p_note_title), ''), body_en = btrim(p_note_body)
         where id = v_existing_id;
      end if;
      delete from workforce.recipe_notes where tenant_id = p_tenant_id and recipe_id = v_recipe_id and id <> v_existing_id;
    end if;
  end if;

  if v_existing_language is not null and v_existing_language <> p_original_language and p_confirm_language_change then
    select array_agg(id) into v_stale_entity_ids from (
      select v_recipe_id as id
      union all select id from workforce.recipe_ingredients where tenant_id = p_tenant_id and recipe_id = v_recipe_id
      union all select id from workforce.recipe_steps where tenant_id = p_tenant_id and recipe_id = v_recipe_id
      union all select id from workforce.recipe_notes where tenant_id = p_tenant_id and recipe_id = v_recipe_id
    ) ids;
    update content.translations
       set translation_status = 'stale'
     where tenant_id = p_tenant_id
       and source_entity_id = any(v_stale_entity_ids)
       and translation_status <> 'stale';
  end if;

  return v_recipe_id;
end;
$$;

revoke all on function api.upsert_workforce_recipe(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text, text, boolean) from public;
grant execute on function api.upsert_workforce_recipe(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. api.set_inventory_item_reference_price -- Manager-only
-- ----------------------------------------------------------------------------

create or replace function api.set_inventory_item_reference_price(
  p_tenant_id uuid,
  p_item_id uuid,
  p_reference_unit_price numeric
)
returns void
language plpgsql
security invoker
set search_path = core, inventory, public
as $$
declare
  v_location_id uuid;
begin
  select i.location_id into v_location_id
  from inventory.items i
  where i.tenant_id = p_tenant_id and i.id = p_item_id;

  if v_location_id is null then
    raise exception 'inventory_item_not_found' using errcode = 'P0002';
  end if;

  if not core.has_permission(p_tenant_id, 'inventory.item.manage', v_location_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_reference_unit_price is not null and p_reference_unit_price < 0 then
    raise exception 'recipe_invalid_reference_price' using errcode = '22023';
  end if;

  update inventory.items
     set reference_unit_price = p_reference_unit_price
   where tenant_id = p_tenant_id and id = p_item_id;
end;
$$;

comment on function api.set_inventory_item_reference_price(uuid, uuid, numeric) is
  'Manager-only (inventory.item.manage, explicit in-function check). Sets the MANAGER-MAINTAINED ESTIMATE reference_unit_price on an Inventory item -- never a receiving/accounting price. SECURITY INVOKER; inv_items_update RLS is also satisfied by the same permission.';

revoke all on function api.set_inventory_item_reference_price(uuid, uuid, numeric) from public;
grant execute on function api.set_inventory_item_reference_price(uuid, uuid, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. api.set_inventory_item_allergens -- Manager-only
-- ----------------------------------------------------------------------------

create or replace function api.set_inventory_item_allergens(
  p_tenant_id uuid,
  p_item_id uuid,
  p_allergen_codes text[]
)
returns void
language plpgsql
security invoker
set search_path = core, inventory, public
as $$
declare
  v_location_id uuid;
begin
  select i.location_id into v_location_id
  from inventory.items i
  where i.tenant_id = p_tenant_id and i.id = p_item_id;

  if v_location_id is null then
    raise exception 'inventory_item_not_found' using errcode = 'P0002';
  end if;

  if not core.has_permission(p_tenant_id, 'inventory.item.manage', v_location_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_allergen_codes is not null
     and not (p_allergen_codes <@ array['egg', 'milk', 'wheat', 'buckwheat', 'peanut', 'shrimp', 'crab', 'walnut', 'soy', 'sesame']::text[]) then
    raise exception 'recipe_invalid_allergen_code' using errcode = '22023';
  end if;

  update inventory.items
     set allergen_codes = p_allergen_codes
   where tenant_id = p_tenant_id and id = p_item_id;
end;
$$;

comment on function api.set_inventory_item_allergens(uuid, uuid, text[]) is
  'Manager-only (inventory.item.manage, explicit in-function check). Sets allergen_codes on an Inventory item. NULL = not configured/unknown; ''{}'' = explicitly confirmed none known -- caller controls which of the two it sends, this function never conflates them. SECURITY INVOKER.';

revoke all on function api.set_inventory_item_allergens(uuid, uuid, text[]) from public;
grant execute on function api.set_inventory_item_allergens(uuid, uuid, text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 7b. api.get_inventory_item_reference_data -- Manager-only READ-back
-- ----------------------------------------------------------------------------
-- Not part of the original numbered contract, but required for the Manager
-- edit form to show its OWN previously-saved reference_unit_price/
-- allergen_codes: neither field is exposed by any api.* view a Manager form
-- would otherwise read from (deliberately, see 0121's header) -- without
-- this, the setters above would be write-only. Same explicit
-- inventory.item.manage permission check as the setters; still never reaches
-- a Staff-permission caller.

create or replace function api.get_inventory_item_reference_data(p_tenant_id uuid, p_item_id uuid)
returns table (reference_unit_price numeric, allergen_codes text[])
language plpgsql
security invoker
set search_path = core, inventory, public
as $$
declare
  v_location_id uuid;
begin
  select i.location_id into v_location_id
  from inventory.items i
  where i.tenant_id = p_tenant_id and i.id = p_item_id;

  if v_location_id is null then
    raise exception 'inventory_item_not_found' using errcode = 'P0002';
  end if;

  if not core.has_permission(p_tenant_id, 'inventory.item.manage', v_location_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select i.reference_unit_price, i.allergen_codes
  from inventory.items i
  where i.tenant_id = p_tenant_id and i.id = p_item_id;
end;
$$;

comment on function api.get_inventory_item_reference_data(uuid, uuid) is
  'Manager-only (inventory.item.manage, explicit in-function check) read-back of an item''s reference_unit_price/allergen_codes -- the only way a Manager form can see its own previously-saved values, since neither column is exposed by api.inventory_items/api.inventory_item_status. SECURITY INVOKER.';

revoke all on function api.get_inventory_item_reference_data(uuid, uuid) from public;
grant execute on function api.get_inventory_item_reference_data(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. api.workforce_recipe_ingredients -- extend the read view
-- ----------------------------------------------------------------------------
-- No permission check needed beyond RLS: Staff already holds
-- inventory.item.read and workforce.recipe.read, and this view carries no
-- price. security_invoker = true relies entirely on the underlying tables'
-- own RLS (workforce.recipe_ingredients' select policy already mirrors its
-- parent recipe's visibility; inventory.items' select policy is
-- inventory.item.read/.manage, location-matched).

create or replace view api.workforce_recipe_ingredients
  with (security_invoker = true) as
select
  i.id as ingredient_id,
  i.tenant_id,
  i.recipe_id,
  i.label_ja,
  i.label_en,
  i.sort_order,
  i.inventory_item_id,
  i.quantity,
  i.unit,
  it.name as item_name,
  it.unit as item_unit,
  it.allergen_codes
from workforce.recipe_ingredients i
left join inventory.items it
  on it.tenant_id = i.tenant_id and it.id = i.inventory_item_id;

comment on view api.workforce_recipe_ingredients is
  'Recipe ingredients plus their optional Inventory mapping (item_name/item_unit/allergen_codes via a plain join -- NULL when unmapped). Deliberately carries NO reference_unit_price. security_invoker view, relying entirely on workforce.recipe_ingredients'' and inventory.items'' own RLS for visibility.';

grant select on api.workforce_recipe_ingredients to authenticated;
revoke all on api.workforce_recipe_ingredients from anon, public;

-- ----------------------------------------------------------------------------
-- 9. api.recipe_ingredient_cost_breakdown -- Manager-only (explicit check)
-- ----------------------------------------------------------------------------
-- "missing != zero": no false precision. estimated_cost is NULL whenever the
-- ingredient is not mapped, has no reference price, or its unit cannot be
-- deterministically converted to the mapped item's unit.

create or replace function api.recipe_ingredient_cost_breakdown(p_tenant_id uuid, p_recipe_id uuid)
returns table (
  recipe_ingredient_id uuid,
  inventory_item_id uuid,
  quantity numeric,
  unit text,
  item_unit text,
  reference_unit_price numeric,
  estimated_cost numeric,
  cost_status text
)
language plpgsql
security invoker
set search_path = core, workforce, inventory, public
as $$
begin
  if not workforce.can_manage_recipe(p_recipe_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    ri.id as recipe_ingredient_id,
    ri.inventory_item_id,
    ri.quantity,
    ri.unit,
    it.unit as item_unit,
    it.reference_unit_price,
    case
      when ri.inventory_item_id is null then null
      when it.reference_unit_price is null then null
      when workforce.convert_quantity(ri.quantity, ri.unit, it.unit) is null then null
      else workforce.convert_quantity(ri.quantity, ri.unit, it.unit) * it.reference_unit_price
    end as estimated_cost,
    case
      when ri.inventory_item_id is null then 'not_mapped'
      when it.reference_unit_price is null then 'no_price'
      when workforce.convert_quantity(ri.quantity, ri.unit, it.unit) is null then 'unit_incompatible'
      else 'ok'
    end as cost_status
  from workforce.recipe_ingredients ri
  left join inventory.items it
    on it.tenant_id = ri.tenant_id and it.id = ri.inventory_item_id
  where ri.tenant_id = p_tenant_id and ri.recipe_id = p_recipe_id;
end;
$$;

comment on function api.recipe_ingredient_cost_breakdown(uuid, uuid) is
  'Manager-only (workforce.recipe.manage on the recipe, via workforce.can_manage_recipe -- the same tenant-wide-vs-location rule as recipe RLS). Explicit business-rule check ON TOP of table RLS: Staff already has row-level read access to these tables, but must never see cost. estimated_cost is NULL (never 0) for not_mapped/no_price/unit_incompatible.';

revoke all on function api.recipe_ingredient_cost_breakdown(uuid, uuid) from public;
grant execute on function api.recipe_ingredient_cost_breakdown(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. api.recipe_cost_summary -- built on top of #9
-- ----------------------------------------------------------------------------
-- "no false-precision total": the UI must never render a bare "Total: ¥X"
-- when priced_count < mapped_count or mapped_count < ingredient_count.

create or replace function api.recipe_cost_summary(p_tenant_id uuid, p_recipe_id uuid)
returns table (
  known_subtotal numeric,
  ingredient_count integer,
  mapped_count integer,
  priced_count integer
)
language sql
security invoker
set search_path = core, workforce, inventory, public
as $$
  select
    coalesce(sum(b.estimated_cost), 0) as known_subtotal,
    count(*)::integer as ingredient_count,
    count(*) filter (where b.inventory_item_id is not null)::integer as mapped_count,
    count(*) filter (where b.cost_status = 'ok')::integer as priced_count
  from api.recipe_ingredient_cost_breakdown(p_tenant_id, p_recipe_id) b;
$$;

comment on function api.recipe_cost_summary(uuid, uuid) is
  'known_subtotal sums only priced (cost_status = ok) ingredients -- it is NOT a full recipe total unless priced_count = mapped_count = ingredient_count. Callers must render the missing/incomplete state (mapped_count < ingredient_count and/or priced_count < mapped_count), never a bare "Total: Y". Same permission gate as api.recipe_ingredient_cost_breakdown (raises through that function).';

revoke all on function api.recipe_cost_summary(uuid, uuid) from public;
grant execute on function api.recipe_cost_summary(uuid, uuid) to authenticated;

-- ============================================================================
-- Rollback: drop the two new RPCs (6,7,9,10), restore
-- api.workforce_recipe_ingredients / api.upsert_workforce_recipe to their
-- pre-0121 bodies (0037 / 0113), drop the trigger + workforce.convert_quantity,
-- drop workforce.recipe_ingredients' three new columns/constraints/index and
-- inventory.items' two new columns. All additive -- no historical migration
-- edited.
-- ============================================================================
