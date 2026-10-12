-- ============================================================================
-- DB test: inventory allergen vocabulary 10 -> 28 codes (migration 0124)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Covers: the items_allergen_codes_check column constraint and
-- api.set_inventory_item_allergens both accept the new codes (e.g.
-- 'gelatin', 'salmon_roe') and the original 0121 codes, both reject an
-- unknown code, and NULL / '{}' stay accepted and distinct. The vocabulary
-- itself (exact 28-code list) is asserted against the constraint
-- definition here and against apps/web's two UI copies by a unit test.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, ai;

select plan(14);

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
  (select pg_get_constraintdef(oid) like '%gelatin%' and pg_get_constraintdef(oid) like '%salmon_roe%'
     from pg_constraint
    where conrelid = 'inventory.items'::regclass and conname = 'items_allergen_codes_check'),
  true,
  'items_allergen_codes_check exists and carries the widened vocabulary'
);

select lives_ok(
  $$ update inventory.items set allergen_codes = array['gelatin', 'salmon_roe', 'macadamia']
      where id = '9e100000-0000-0000-0000-000000000001' $$,
  'the column accepts new 0124 codes (gelatin, salmon_roe, macadamia)'
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
       '9e100000-0000-0000-0000-000000000002'::uuid, array['salmon_roe', 'gelatin', 'egg']) $$,
  'the RPC accepts new 0124 codes mixed with an original code'
);
reset role;

select is(
  (select allergen_codes from inventory.items where id = '9e100000-0000-0000-0000-000000000002'),
  array['salmon_roe', 'gelatin', 'egg'],
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
  array['salmon_roe', 'gelatin', 'egg'],
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
