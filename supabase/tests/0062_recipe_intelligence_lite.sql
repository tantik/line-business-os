-- ============================================================================
-- DB test: Recipe Intelligence Lite (migration 0121)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Covers: workforce.convert_quantity, the recipe_ingredients_mapping_shape
-- CHECK, the location-mismatch trigger (+ tenant-wide allow-any-location),
-- cross-tenant inventory_item_id rejection, api.upsert_workforce_recipe
-- accepting legacy plain strings AND mapped objects in the same call (with
-- invalid unit / non-positive quantity rejected), the two Manager-only
-- Inventory RPCs (Manager succeeds, Staff denied 42501, invalid allergen
-- code / negative price rejected), api.recipe_ingredient_cost_breakdown
-- (Staff denied, Manager gets ok/no_price/unit_incompatible/not_mapped
-- correctly, "missing != zero"), and allergen NULL vs '{}' distinguished.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, ai;

select plan(44);

-- ============================================================================
-- Section 0: fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('9f000000-0000-0000-0000-00000000000a', 'pgtap-recipe-intel-tenant-a', 'pgTAP Recipe Intelligence Tenant A'),
  ('9f000000-0000-0000-0000-00000000000b', 'pgtap-recipe-intel-tenant-b', 'pgTAP Recipe Intelligence Tenant B');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('9f000000-0000-0000-0000-00000000000a', 'workforce', true),
  ('9f000000-0000-0000-0000-00000000000a', 'inventory', true),
  ('9f000000-0000-0000-0000-00000000000b', 'inventory', true);

insert into core.locations (id, tenant_id, name) values
  ('9f200000-0000-0000-0000-000000000001', '9f000000-0000-0000-0000-00000000000a', 'Tenant A Location A'),
  ('9f200000-0000-0000-0000-000000000002', '9f000000-0000-0000-0000-00000000000a', 'Tenant A Location B'),
  ('9f200000-0000-0000-0000-000000000009', '9f000000-0000-0000-0000-00000000000b', 'Tenant B Location A');

insert into core.users (id, display_name) values
  ('9f900000-0000-0000-0000-000000000001', 'Staff A (Location A)'),
  ('9f900000-0000-0000-0000-000000000002', 'Manager A (Location A)');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9f000000-0000-0000-0000-00000000000a', '9f900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9f200000-0000-0000-0000-000000000001'), -- employee
  ('9f000000-0000-0000-0000-00000000000a', '9f900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '9f200000-0000-0000-0000-000000000001'); -- manager

-- Inventory items: Location A (priced, kg) and Location B (unpriced), plus a
-- cross-tenant item (Tenant B) never reachable from Tenant A.
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reference_unit_price)
  values
    ('9f100000-0000-0000-0000-000000000001', '9f000000-0000-0000-0000-00000000000a',
     '9f200000-0000-0000-0000-000000000001', 'Coffee Beans', 'kg', 5, 1000.00),
    ('9f100000-0000-0000-0000-000000000002', '9f000000-0000-0000-0000-00000000000a',
     '9f200000-0000-0000-0000-000000000002', 'Milk (Loc B)', 'L', 5, null),
    ('9f100000-0000-0000-0000-000000000003', '9f000000-0000-0000-0000-00000000000a',
     '9f200000-0000-0000-0000-000000000001', 'Cups (pcs)', 'pcs', 100, 20.00),
    ('9f100000-0000-0000-0000-000000000009', '9f000000-0000-0000-0000-00000000000b',
     '9f200000-0000-0000-0000-000000000009', 'Tenant B Item', 'kg', 5, 500.00);

create function pg_temp.as_role(p_sub text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
end;
$$;

create function pg_temp.as_throws_code(p_sub text, p_sql text, p_expected_code text)
returns boolean
language plpgsql
as $$
begin
  perform pg_temp.as_role(p_sub);
  execute p_sql;
  return false;
exception
  when others then
    return sqlstate = p_expected_code;
end;
$$;

-- ============================================================================
-- Section 1: workforce.convert_quantity
-- ============================================================================

select is(workforce.convert_quantity(1, 'kg', 'g'), 1000::numeric, 'kg -> g');
select is(workforce.convert_quantity(1000, 'g', 'kg'), 1::numeric, 'g -> kg');
select is(workforce.convert_quantity(1, 'L', 'mL'), 1000::numeric, 'L -> mL');
select is(workforce.convert_quantity(1000, 'mL', 'L'), 1::numeric, 'mL -> L');
select is(workforce.convert_quantity(5, 'kg', 'kg'), 5::numeric, 'same-unit passthrough');
select is(workforce.convert_quantity(5, 'pcs', 'kg'), null::numeric, 'pcs <-> kg is incompatible -- NULL, never guessed');

-- ============================================================================
-- Section 2: recipe fixtures (as Manager) + recipe_ingredients_mapping_shape
-- ============================================================================

select pg_temp.as_role('9f900000-0000-0000-0000-000000000002');

insert into workforce.recipes (id, tenant_id, location_id, title_ja, content_kind, status, original_language, created_by, updated_by)
  values ('9f300000-0000-0000-0000-000000000001', '9f000000-0000-0000-0000-00000000000a',
          '9f200000-0000-0000-0000-000000000001', 'Location A Recipe', 'recipe', 'draft', 'ja',
          '9f900000-0000-0000-0000-000000000002', '9f900000-0000-0000-0000-000000000002');

insert into workforce.recipes (id, tenant_id, location_id, title_ja, content_kind, status, original_language, created_by, updated_by)
  values ('9f300000-0000-0000-0000-000000000002', '9f000000-0000-0000-0000-00000000000a',
          null, 'Tenant-wide Recipe', 'recipe', 'draft', 'ja',
          '9f900000-0000-0000-0000-000000000002', '9f900000-0000-0000-0000-000000000002');

reset role;

select throws_ok(
  $$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, quantity)
     values ('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001', 'Half-mapped', 10) $$,
  null,
  null,
  'a partial mapping (quantity without inventory_item_id/unit) is rejected by recipe_ingredients_mapping_shape'
);

select throws_ok(
  $$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, inventory_item_id, unit)
     values ('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001', 'Half-mapped 2',
             '9f100000-0000-0000-0000-000000000001', 'kg') $$,
  null,
  null,
  'a partial mapping (item + unit without quantity) is rejected by recipe_ingredients_mapping_shape'
);

select lives_ok(
  $$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja)
     values ('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001', 'Bare label, no mapping') $$,
  'a bare label with no mapping at all remains fully valid'
);

-- ============================================================================
-- Section 3: location-compatibility trigger
-- ============================================================================

select throws_ok(
  format($$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, inventory_item_id, quantity, unit)
     values ('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001', 'Wrong-location item',
             %L, 1, 'L') $$, '9f100000-0000-0000-0000-000000000002'),
  'P0001',
  'recipe_ingredient_item_location_mismatch',
  'a Location-A recipe mapping to a Location-B item is rejected (P0001, specific message)'
);

select lives_ok(
  format($$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, inventory_item_id, quantity, unit)
     values ('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001', 'Correct-location item',
             %L, 18, 'g') $$, '9f100000-0000-0000-0000-000000000001'),
  'a Location-A recipe mapping to a Location-A item is allowed'
);

select lives_ok(
  format($$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, inventory_item_id, quantity, unit)
     values ('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000002', 'Tenant-wide mapping to Loc B item',
             %L, 1, 'L') $$, '9f100000-0000-0000-0000-000000000002'),
  'a tenant-wide recipe (location_id is null) may map to ANY item within the tenant, any location'
);

-- Cross-tenant inventory_item_id rejected by the composite FK.
select throws_ok(
  format($$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, inventory_item_id, quantity, unit)
     values ('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001', 'Cross-tenant item',
             %L, 1, 'kg') $$, '9f100000-0000-0000-0000-000000000009'),
  null,
  null,
  'a cross-tenant inventory_item_id is rejected by the (tenant_id, inventory_item_id) FK -- structurally impossible, not merely RLS-blocked'
);

-- ============================================================================
-- Section 4: api.upsert_workforce_recipe -- legacy string + mapped object
-- ============================================================================

select pg_temp.as_role('9f900000-0000-0000-0000-000000000002');

select isnt(
  (select api.upsert_workforce_recipe(
    '9f000000-0000-0000-0000-00000000000a', '9f200000-0000-0000-0000-000000000001',
    '9f300000-0000-0000-0000-000000000001', 'recipe', 'Latte', 'A latte', 'draft',
    jsonb_build_array(
      'Plain legacy label',
      jsonb_build_object('label', 'Mapped Coffee Beans', 'inventory_item_id', '9f100000-0000-0000-0000-000000000001', 'quantity', 18, 'unit', 'g')
    ),
    jsonb_build_array('Step one'), null, null, null, 'ja', false
  )),
  null,
  'upsert_workforce_recipe accepts a legacy plain string AND a mapped object element in the same call'
);

select is(
  (select count(*)::int from workforce.recipe_ingredients
    where tenant_id = '9f000000-0000-0000-0000-00000000000a' and recipe_id = '9f300000-0000-0000-0000-000000000001'),
  2,
  'exactly 2 ingredient rows survive the upsert (old rows replaced, not appended)'
);

select is(
  (select quantity from workforce.recipe_ingredients
    where tenant_id = '9f000000-0000-0000-0000-00000000000a' and recipe_id = '9f300000-0000-0000-0000-000000000001'
      and inventory_item_id = '9f100000-0000-0000-0000-000000000001'),
  18::numeric,
  'the mapped object element persisted its quantity (18)'
);

select throws_ok(
  format($$ select api.upsert_workforce_recipe(
    '9f000000-0000-0000-0000-00000000000a', '9f200000-0000-0000-0000-000000000001',
    '9f300000-0000-0000-0000-000000000001', 'recipe', 'Latte', 'A latte', 'draft',
    jsonb_build_array(jsonb_build_object('label', 'Bad unit', 'inventory_item_id', %L, 'quantity', 1, 'unit', 'oz')),
    jsonb_build_array('Step one'), null, null, null, 'ja', false
  ) $$, '9f100000-0000-0000-0000-000000000001'),
  '22023',
  'recipe_invalid_ingredient_mapping',
  'an invalid unit on a mapped ingredient is rejected'
);

select throws_ok(
  format($$ select api.upsert_workforce_recipe(
    '9f000000-0000-0000-0000-00000000000a', '9f200000-0000-0000-0000-000000000001',
    '9f300000-0000-0000-0000-000000000001', 'recipe', 'Latte', 'A latte', 'draft',
    jsonb_build_array(jsonb_build_object('label', 'Bad qty', 'inventory_item_id', %L, 'quantity', 0, 'unit', 'kg')),
    jsonb_build_array('Step one'), null, null, null, 'ja', false
  ) $$, '9f100000-0000-0000-0000-000000000001'),
  '22023',
  'recipe_invalid_ingredient_mapping',
  'a non-positive quantity on a mapped ingredient is rejected'
);

reset role;

-- ============================================================================
-- Section 5: set_inventory_item_reference_price / set_inventory_item_allergens
-- ============================================================================

select ok(
  pg_temp.as_throws_code('9f900000-0000-0000-0000-000000000001',
    format($$ select api.set_inventory_item_reference_price('9f000000-0000-0000-0000-00000000000a'::uuid, %L::uuid, 500) $$,
      '9f100000-0000-0000-0000-000000000001'),
    '42501'),
  'Staff cannot set an item''s reference price (42501)'
);

select pg_temp.as_role('9f900000-0000-0000-0000-000000000002');
select lives_ok(
  format($$ select api.set_inventory_item_reference_price('9f000000-0000-0000-0000-00000000000a'::uuid, %L::uuid, 1200) $$,
    '9f100000-0000-0000-0000-000000000001'),
  'Manager can set an item''s reference price'
);
reset role;

select is(
  (select reference_unit_price from inventory.items where id = '9f100000-0000-0000-0000-000000000001'),
  1200.00::numeric,
  'reference_unit_price actually persisted'
);

select ok(
  pg_temp.as_throws_code('9f900000-0000-0000-0000-000000000002',
    format($$ select api.set_inventory_item_reference_price('9f000000-0000-0000-0000-00000000000a'::uuid, %L::uuid, -1) $$,
      '9f100000-0000-0000-0000-000000000001'),
    '22023'),
  'a negative reference price is rejected'
);

select ok(
  pg_temp.as_throws_code('9f900000-0000-0000-0000-000000000001',
    format($$ select api.set_inventory_item_allergens('9f000000-0000-0000-0000-00000000000a'::uuid, %L::uuid, array['egg']) $$,
      '9f100000-0000-0000-0000-000000000001'),
    '42501'),
  'Staff cannot set an item''s allergens (42501)'
);

select pg_temp.as_role('9f900000-0000-0000-0000-000000000002');
select lives_ok(
  format($$ select api.set_inventory_item_allergens('9f000000-0000-0000-0000-00000000000a'::uuid, %L::uuid, array['egg', 'milk']) $$,
    '9f100000-0000-0000-0000-000000000001'),
  'Manager can set an item''s allergens to a valid subset'
);
reset role;

select is(
  (select allergen_codes from inventory.items where id = '9f100000-0000-0000-0000-000000000001'),
  array['egg', 'milk'],
  'allergen_codes actually persisted'
);

select ok(
  pg_temp.as_throws_code('9f900000-0000-0000-0000-000000000002',
    format($$ select api.set_inventory_item_allergens('9f000000-0000-0000-0000-00000000000a'::uuid, %L::uuid, array['not-a-real-code']) $$,
      '9f100000-0000-0000-0000-000000000001'),
    '22023'),
  'an invalid allergen code is rejected'
);

-- NULL vs '{}' distinguished, never conflated.
select pg_temp.as_role('9f900000-0000-0000-0000-000000000002');
select lives_ok(
  format($$ select api.set_inventory_item_allergens('9f000000-0000-0000-0000-00000000000a'::uuid, %L::uuid, array[]::text[]) $$,
    '9f100000-0000-0000-0000-000000000003'),
  'Manager can explicitly confirm no known allergens (empty array)'
);
reset role;

select is(
  (select allergen_codes from inventory.items where id = '9f100000-0000-0000-0000-000000000003'),
  array[]::text[],
  'explicitly-confirmed-empty allergen_codes reads back as ''{}'', not NULL'
);
select is(
  (select allergen_codes from inventory.items where id = '9f100000-0000-0000-0000-000000000002'),
  null::text[],
  'an item whose allergens were never configured reads back as NULL, not ''{}'' -- the two states are never conflated'
);

-- api.get_inventory_item_reference_data: the Manager-only read-back the edit
-- form uses to see its own previously-saved values.
select ok(
  pg_temp.as_throws_code('9f900000-0000-0000-0000-000000000001',
    format($$ select * from api.get_inventory_item_reference_data('9f000000-0000-0000-0000-00000000000a'::uuid, %L::uuid) $$,
      '9f100000-0000-0000-0000-000000000001'),
    '42501'),
  'Staff cannot read an item''s reference price/allergens back (42501)'
);

select pg_temp.as_role('9f900000-0000-0000-0000-000000000002');
select is(
  (select reference_unit_price from api.get_inventory_item_reference_data('9f000000-0000-0000-0000-00000000000a', '9f100000-0000-0000-0000-000000000001')),
  1200.00::numeric,
  'Manager reads back the reference price it just saved'
);
select is(
  (select allergen_codes from api.get_inventory_item_reference_data('9f000000-0000-0000-0000-00000000000a', '9f100000-0000-0000-0000-000000000001')),
  array['egg', 'milk'],
  'Manager reads back the allergen codes it just saved'
);
reset role;

-- ============================================================================
-- Section 6: api.recipe_ingredient_cost_breakdown / api.recipe_cost_summary
-- ============================================================================

select ok(
  pg_temp.as_throws_code('9f900000-0000-0000-0000-000000000001',
    format($$ select * from api.recipe_ingredient_cost_breakdown('9f000000-0000-0000-0000-00000000000a'::uuid, %L::uuid) $$,
      '9f300000-0000-0000-0000-000000000001'),
    '42501'),
  'Staff cannot read a recipe''s cost breakdown (42501)'
);

select pg_temp.as_role('9f900000-0000-0000-0000-000000000002');

select is(
  (select estimated_cost from api.recipe_ingredient_cost_breakdown('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001')
    where inventory_item_id = '9f100000-0000-0000-0000-000000000001'),
  21.60::numeric,
  '18g at Y1200/kg = Y21.60 (1200 * 0.018) exactly -- ok status'
);

select is(
  (select cost_status from api.recipe_ingredient_cost_breakdown('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001')
    where inventory_item_id = '9f100000-0000-0000-0000-000000000001'),
  'ok',
  'the priced, unit-compatible ingredient reads back as cost_status = ok'
);

select is(
  (select cost_status from api.recipe_ingredient_cost_breakdown('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001')
    where recipe_ingredient_id = (
      select id from workforce.recipe_ingredients
       where tenant_id = '9f000000-0000-0000-0000-00000000000a' and recipe_id = '9f300000-0000-0000-0000-000000000001'
         and inventory_item_id is null limit 1
    )),
  'not_mapped',
  'an unmapped ingredient reads back as cost_status = not_mapped'
);

select is(
  (select estimated_cost from api.recipe_ingredient_cost_breakdown('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001')
    where recipe_ingredient_id = (
      select id from workforce.recipe_ingredients
       where tenant_id = '9f000000-0000-0000-0000-00000000000a' and recipe_id = '9f300000-0000-0000-0000-000000000001'
         and inventory_item_id is null limit 1
    )),
  null::numeric,
  'not_mapped estimated_cost is NULL, never 0 -- missing != zero'
);

-- Tenant-wide recipe: mapped to Loc B item (Milk), which has no reference
-- price -> no_price, NULL cost.
select is(
  (select cost_status from api.recipe_ingredient_cost_breakdown('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000002')),
  'no_price',
  'a mapped ingredient whose item has no reference_unit_price reads back as cost_status = no_price'
);
select is(
  (select estimated_cost from api.recipe_ingredient_cost_breakdown('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000002')),
  null::numeric,
  'no_price estimated_cost is NULL, never 0'
);

-- Unit-incompatible: map an ingredient to the Cups (pcs) item using kg.
insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, inventory_item_id, quantity, unit)
  values ('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001', 'Cups mismapped as kg',
          '9f100000-0000-0000-0000-000000000003', 2, 'kg');

select is(
  (select cost_status from api.recipe_ingredient_cost_breakdown('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001')
    where inventory_item_id = '9f100000-0000-0000-0000-000000000003'),
  'unit_incompatible',
  'kg mapped against a pcs item is dimensionally incompatible -- cost_status = unit_incompatible'
);
select is(
  (select estimated_cost from api.recipe_ingredient_cost_breakdown('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001')
    where inventory_item_id = '9f100000-0000-0000-0000-000000000003'),
  null::numeric,
  'unit_incompatible estimated_cost is NULL, never 0'
);

-- recipe_cost_summary: not every ingredient is priced/mapped, so the UI must
-- never render a bare total -- assert the counts that drive that rule.
select is(
  (select ingredient_count from api.recipe_cost_summary('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001')),
  3,
  -- The earlier api.upsert_workforce_recipe call (Section 4) replaces this
  -- recipe's whole ingredient set with exactly its 2 given elements
  -- (plain-string legacy label + mapped Coffee Beans); the 1 directly-
  -- inserted "Cups mismapped as kg" row above brings it to 3.
  'recipe_cost_summary ingredient_count reflects the 3 rows actually on this recipe after the upsert replaced its ingredient set'
);
select is(
  (select priced_count from api.recipe_cost_summary('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001')),
  1,
  'recipe_cost_summary priced_count = 1 (only the Coffee Beans row is fully ok) -- priced_count < ingredient_count means no bare total may be shown'
);
select is(
  (select known_subtotal from api.recipe_cost_summary('9f000000-0000-0000-0000-00000000000a', '9f300000-0000-0000-0000-000000000001')),
  21.60::numeric,
  'recipe_cost_summary known_subtotal only sums the one ok-priced ingredient (Y21.60), not a false-precision full total'
);

reset role;

select * from finish();
rollback;
