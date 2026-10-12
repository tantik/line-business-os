-- ============================================================================
-- DB test: inventory allergen vocabulary 10 -> 29 codes (migration 0124)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Covers: items_allergen_codes_check's definition equals the full expected
-- 29-code array (exact text compare, not a substring check); the column and
-- api.set_inventory_item_allergens both accept every one of the 29 codes
-- (incl. the new 'pistachio', 'gelatin', 'salmon_roe') and the original
-- 0121 codes, both reject an unknown code, and NULL / '{}' stay accepted
-- and distinct. apps/web's two UI copies of the list are asserted against
-- the migration file by a unit test (recipe-allergens.test.ts).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, ai;

select plan(17);

create function pg_temp.expected_allergen_codes()
returns text[]
language sql
immutable
as $$
  select array[
    'egg', 'milk', 'wheat', 'buckwheat', 'peanut', 'shrimp', 'crab', 'walnut', 'cashew',
    'almond', 'abalone', 'squid', 'salmon_roe', 'orange', 'kiwi', 'beef', 'sesame', 'salmon', 'mackerel',
    'soy', 'chicken', 'banana', 'pistachio', 'pork', 'macadamia', 'peach', 'yam', 'apple', 'gelatin'
  ]::text[]
$$;

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('9e000000-0000-0000-0000-00000000000a', 'pgtap-allergen-28-tenant-a', 'pgTAP Allergen 28 Tenant A');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('9e000000-0000-0000-0000-00000000000a', 'inventory', true);

insert into core.locations (id, tenant_id, name) values
  ('9e200000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000a', 'Allergen Tenant Location A');

insert into core.users (id, display_name) values
  ('9e900000-0000-0000-0000-000000000002', 'Manager (Allergen 28)');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9e000000-0000-0000-0000-00000000000a', '9e900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '9e200000-0000-0000-0000-000000000001'); -- manager

insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity) values
  ('9e100000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000a',
   '9e200000-0000-0000-0000-000000000001', 'Gelatin sheets', 'pcs', 10),
  ('9e100000-0000-0000-0000-000000000002', '9e000000-0000-0000-0000-00000000000a',
   '9e200000-0000-0000-0000-000000000001', 'Ikura', 'g', 100);

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
-- Column CHECK constraint (direct writes, as owner)
-- ============================================================================

select is(
  (select pg_get_constraintdef(oid)
     from pg_constraint
    where conrelid = 'inventory.items'::regclass and conname = 'items_allergen_codes_check'),
  (select 'CHECK (((allergen_codes IS NULL) OR (allergen_codes <@ ARRAY['
          || string_agg(quote_literal(code) || '::text', ', ' order by ord)
          || '])))'
     from unnest(pg_temp.expected_allergen_codes()) with ordinality as v(code, ord)),
  'items_allergen_codes_check is exactly the expected 29-code array, in order'
);

select is(
  cardinality(pg_temp.expected_allergen_codes()),
  29,
  'the expected vocabulary has 29 codes (9 mandatory + 20 recommended)'
);

select lives_ok(
  $$ update inventory.items set allergen_codes = pg_temp.expected_allergen_codes()
      where id = '9e100000-0000-0000-0000-000000000001' $$,
  'the column accepts all 29 codes at once'
);

select lives_ok(
  $$ update inventory.items set allergen_codes = array['pistachio', 'cashew', 'gelatin', 'salmon_roe', 'macadamia']
      where id = '9e100000-0000-0000-0000-000000000001' $$,
  'the column accepts new 0124 codes (pistachio, cashew, gelatin, salmon_roe, macadamia)'
);

select lives_ok(
  $$ update inventory.items set allergen_codes = array['egg', 'milk', 'wheat', 'buckwheat', 'peanut', 'shrimp', 'crab', 'walnut', 'soy', 'sesame']
      where id = '9e100000-0000-0000-0000-000000000002' $$,
  'the column still accepts every original 0121 code with its exact spelling'
);

select throws_ok(
  $$ update inventory.items set allergen_codes = array['egg', 'matsutake']
      where id = '9e100000-0000-0000-0000-000000000002' $$,
  '23514',
  null,
  'the column rejects an unknown code (check_violation)'
);

select lives_ok(
  $$ update inventory.items set allergen_codes = null
      where id = '9e100000-0000-0000-0000-000000000002' $$,
  'the column still accepts NULL (not configured)'
);

select lives_ok(
  $$ update inventory.items set allergen_codes = array[]::text[]
      where id = '9e100000-0000-0000-0000-000000000002' $$,
  'the column still accepts ''{}'' (confirmed none)'
);

-- ============================================================================
-- api.set_inventory_item_allergens (as Manager)
-- ============================================================================

select pg_temp.as_role('9e900000-0000-0000-0000-000000000002');
select lives_ok(
  $$ select api.set_inventory_item_allergens('9e000000-0000-0000-0000-00000000000a'::uuid,
       '9e100000-0000-0000-0000-000000000001'::uuid, pg_temp.expected_allergen_codes()) $$,
  'the RPC accepts all 29 codes at once (its own array matches the vocabulary)'
);
select lives_ok(
  $$ select api.set_inventory_item_allergens('9e000000-0000-0000-0000-00000000000a'::uuid,
       '9e100000-0000-0000-0000-000000000002'::uuid, array['salmon_roe', 'pistachio', 'egg']) $$,
  'the RPC accepts new 0124 codes mixed with an original code'
);
reset role;

select is(
  (select allergen_codes from inventory.items where id = '9e100000-0000-0000-0000-000000000002'),
  array['salmon_roe', 'pistachio', 'egg'],
  'RPC-written new codes actually persisted'
);

select ok(
  pg_temp.as_throws_code('9e900000-0000-0000-0000-000000000002',
    $$ select api.set_inventory_item_allergens('9e000000-0000-0000-0000-00000000000a'::uuid,
         '9e100000-0000-0000-0000-000000000002'::uuid, array['gelatin', 'matsutake']) $$,
    '22023'),
  'the RPC rejects an unknown code (22023 recipe_invalid_allergen_code)'
);
reset role;

select is(
  (select allergen_codes from inventory.items where id = '9e100000-0000-0000-0000-000000000002'),
  array['salmon_roe', 'pistachio', 'egg'],
  'a rejected RPC call leaves the stored codes untouched'
);

select pg_temp.as_role('9e900000-0000-0000-0000-000000000002');
select lives_ok(
  $$ select api.set_inventory_item_allergens('9e000000-0000-0000-0000-00000000000a'::uuid,
       '9e100000-0000-0000-0000-000000000002'::uuid, array[]::text[]) $$,
  'the RPC still accepts ''{}'' (confirmed none)'
);
select lives_ok(
  $$ select api.set_inventory_item_allergens('9e000000-0000-0000-0000-00000000000a'::uuid,
       '9e100000-0000-0000-0000-000000000001'::uuid, null) $$,
  'the RPC still accepts NULL (not configured)'
);
reset role;

select is(
  (select allergen_codes from inventory.items where id = '9e100000-0000-0000-0000-000000000002'),
  array[]::text[],
  '''{}'' reads back as ''{}'', not NULL'
);
select is(
  (select allergen_codes from inventory.items where id = '9e100000-0000-0000-0000-000000000001'),
  null::text[],
  'NULL reads back as NULL, not ''{}'' -- the two states are never conflated'
);

select * from finish();
rollback;
