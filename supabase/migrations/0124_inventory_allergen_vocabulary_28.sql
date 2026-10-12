-- ============================================================================
-- 0124 — inventory.items.allergen_codes: 10-code -> 28-code vocabulary
-- ============================================================================
-- Copy Audit A-09 / DEBT-053, Founder decision 2026-10-12. 0121 limited
-- allergen_codes to 10 codes (the 8 特定原材料 + soy + sesame), so a store
-- could not record the other 18 items Japanese food-labelling guidance
-- names. This widens the vocabulary to all 28 items:
--
--   特定原材料 (8, mandatory labelling):
--     egg 卵, milk 乳, wheat 小麦, buckwheat そば, peanut 落花生,
--     shrimp えび, crab かに, walnut くるみ
--   特定原材料に準ずるもの (20, recommended labelling):
--     almond アーモンド, abalone あわび, squid いか, salmon_roe いくら,
--     orange オレンジ, cashew カシューナッツ, kiwi キウイフルーツ,
--     beef 牛肉, sesame ごま, salmon さけ, mackerel さば, soy 大豆,
--     chicken 鶏肉, banana バナナ, pork 豚肉, macadamia マカダミアナッツ,
--     peach もも, yam やまいも, apple りんご, gelatin ゼラチン
--
-- Source: 消費者庁 食品表示基準 (Consumer Affairs Agency food labelling
-- standard) -- 8 特定原材料 (incl. くるみ, mandatory from 2025-04) + 20
-- 特定原材料に準ずるもの (incl. マカダミアナッツ, added 2024-03).
--
-- The 10 codes 0121 already allowed keep their exact spelling, so every
-- existing row stays valid and no data is rewritten. The array order below
-- is the canonical display order; apps/web keeps two copies of it
-- (inventory-i18n.ts, lib/workforce/recipe-allergens.ts) and a unit test
-- asserts both equal the array in this file.
--
-- Semantics are unchanged: NULL = not configured/unknown, '{}' = Manager
-- explicitly confirmed none. api.set_inventory_item_allergens is recreated
-- with the same signature, SECURITY INVOKER, permission check, error codes
-- and grants -- only the vocabulary array differs.
--
-- Rollback: re-create items_allergen_codes_check and the function with the
-- 0121 10-code array. Only safe if no row uses one of the 18 new codes
-- (check first: select count(*) from inventory.items where not
-- (allergen_codes <@ array[<10 codes>]::text[]); the ADD CONSTRAINT fails
-- otherwise, which is the desired guard -- never strip codes silently).
-- ============================================================================

alter table inventory.items
  drop constraint items_allergen_codes_check,
  add constraint items_allergen_codes_check check (
    allergen_codes is null
    or allergen_codes <@ array[
      'egg', 'milk', 'wheat', 'buckwheat', 'peanut', 'shrimp', 'crab', 'walnut',
      'almond', 'abalone', 'squid', 'salmon_roe', 'orange', 'cashew', 'kiwi', 'beef', 'sesame', 'salmon',
      'mackerel', 'soy', 'chicken', 'banana', 'pork', 'macadamia', 'peach', 'yam', 'apple', 'gelatin'
    ]::text[]
  );

comment on column inventory.items.allergen_codes is
  'Fixed 28-code vocabulary (8 特定原材料 + 20 特定原材料に準ずるもの, migration 0124). NULL = not configured/unknown -- must never be displayed or treated as "no known allergens". Empty array (''{}'') = Manager explicitly confirmed no known allergens. These two states are never conflated by any reader of this column.';

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
     and not (p_allergen_codes <@ array[
       'egg', 'milk', 'wheat', 'buckwheat', 'peanut', 'shrimp', 'crab', 'walnut',
       'almond', 'abalone', 'squid', 'salmon_roe', 'orange', 'cashew', 'kiwi', 'beef', 'sesame', 'salmon',
       'mackerel', 'soy', 'chicken', 'banana', 'pork', 'macadamia', 'peach', 'yam', 'apple', 'gelatin'
     ]::text[]) then
    raise exception 'recipe_invalid_allergen_code' using errcode = '22023';
  end if;

  update inventory.items
     set allergen_codes = p_allergen_codes
   where tenant_id = p_tenant_id and id = p_item_id;
end;
$$;

comment on function api.set_inventory_item_allergens(uuid, uuid, text[]) is
  'Manager-only (inventory.item.manage, explicit in-function check). Sets allergen_codes on an Inventory item (28-code vocabulary, 0124). NULL = not configured/unknown; ''{}'' = explicitly confirmed none known -- caller controls which of the two it sends, this function never conflates them. SECURITY INVOKER.';

revoke all on function api.set_inventory_item_allergens(uuid, uuid, text[]) from public;
grant execute on function api.set_inventory_item_allergens(uuid, uuid, text[]) to authenticated;
