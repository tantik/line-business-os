-- ============================================================================
-- DB test: migration 0153 (inventory item name translation via
-- content.translations).
-- Run with:  supabase db reset && supabase test db
--   M manager T1/L1, E employee T1/L1, N manager T1/L2, X manager of T2.
--   Items: I1 '牛乳' (ja) at L1, I2 'Milk' (en) at L1, I3 '氷' at L2.
--   M writes a machine translation of an L1 item (direction derived from
--   name_language), E reads it, E cannot write, N (other location) and X
--   (other tenant) can neither read nor write, module off blocks both,
--   rename makes the stored source hash stale, recipe behaviour unchanged.
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core;

select plan(32);

create function pg_temp.as_user(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return 'ERR ' || sqlstate;
end $$;

create function pg_temp.machine(p_tenant text, p_item text, p_text text) returns text language sql as $$
  select format(
    $f$select translation_status from api.set_machine_content_translation_confirmed(%L::uuid, 'inventory_item', %L::uuid, 'name', %L, 'client-hash-ignored', false, 'google')$f$,
    p_tenant, p_item, p_text);
$$;

create function pg_temp.count_visible(p_item text) returns text language sql as $$
  select format(
    $f$select count(*)::text from api.content_translations where source_entity_type = 'inventory_item' and source_entity_id = %L::uuid$f$,
    p_item);
$$;

insert into core.tenants (id, slug, name) values
  ('a9100000-0000-0000-0000-0000000000a1', 'pgtap-0153-t1', 'pgTAP 0153 T1'),
  ('a9100000-0000-0000-0000-0000000000a2', 'pgtap-0153-t2', 'pgTAP 0153 T2');
insert into core.tenant_modules (tenant_id, module, is_enabled)
select t, m::core.module_code, true
  from unnest(array['a9100000-0000-0000-0000-0000000000a1', 'a9100000-0000-0000-0000-0000000000a2']::uuid[]) t,
       unnest(array['inventory', 'workforce', 'recipes']) m;
insert into core.locations (id, tenant_id, name, timezone) values
  ('a9110000-0000-0000-0000-000000000001', 'a9100000-0000-0000-0000-0000000000a1', 'T1 / L1', 'Asia/Tokyo'),
  ('a9110000-0000-0000-0000-000000000002', 'a9100000-0000-0000-0000-0000000000a1', 'T1 / L2', 'Asia/Tokyo'),
  ('a9110000-0000-0000-0000-000000000003', 'a9100000-0000-0000-0000-0000000000a2', 'T2 / L3', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('a9190000-0000-0000-0000-000000000001', 'M'),
  ('a9190000-0000-0000-0000-000000000002', 'E'),
  ('a9190000-0000-0000-0000-000000000003', 'N'),
  ('a9190000-0000-0000-0000-000000000004', 'X');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a9100000-0000-0000-0000-0000000000a1', 'a9190000-0000-0000-0000-000000000001', 'active'),
  ('a9100000-0000-0000-0000-0000000000a1', 'a9190000-0000-0000-0000-000000000002', 'active'),
  ('a9100000-0000-0000-0000-0000000000a1', 'a9190000-0000-0000-0000-000000000003', 'active'),
  ('a9100000-0000-0000-0000-0000000000a2', 'a9190000-0000-0000-0000-000000000004', 'active');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a9100000-0000-0000-0000-0000000000a1', 'a9190000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'a9110000-0000-0000-0000-000000000001'),
  ('a9100000-0000-0000-0000-0000000000a1', 'a9190000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'a9110000-0000-0000-0000-000000000001'),
  ('a9100000-0000-0000-0000-0000000000a1', 'a9190000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'a9110000-0000-0000-0000-000000000002'),
  ('a9100000-0000-0000-0000-0000000000a2', 'a9190000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', null);
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point, name_language) values
  ('a91a0000-0000-0000-0000-000000000001', 'a9100000-0000-0000-0000-0000000000a1', 'a9110000-0000-0000-0000-000000000001', '牛乳', 'L', 10, 3, 'ja'),
  ('a91a0000-0000-0000-0000-000000000002', 'a9100000-0000-0000-0000-0000000000a1', 'a9110000-0000-0000-0000-000000000001', 'Milk', 'L', 10, 3, 'en'),
  ('a91a0000-0000-0000-0000-000000000003', 'a9100000-0000-0000-0000-0000000000a1', 'a9110000-0000-0000-0000-000000000002', '氷', 'pcs', 10, 3, 'ja');

-- --- schema ------------------------------------------------------------------
select is(
  (select column_default from information_schema.columns
    where table_schema = 'inventory' and table_name = 'items' and column_name = 'name_language'),
  '''ja''::text', 'inventory.items.name_language defaults to ja');
select throws_ok(
  $$ update inventory.items set name_language = 'fr' where id = 'a91a0000-0000-0000-0000-000000000001' $$,
  '23514', null, 'name_language CHECK rejects a language outside (ja, en)');
select is(
  pg_temp.as_user('a9190000-0000-0000-0000-000000000001',
    $$select name_language from api.inventory_items where item_id = 'a91a0000-0000-0000-0000-000000000002'$$),
  'en', 'api.inventory_items exposes name_language');
select is(
  pg_temp.as_user('a9190000-0000-0000-0000-000000000001',
    $$select name_language from api.inventory_item_status where item_id = 'a91a0000-0000-0000-0000-000000000001'$$),
  'ja', 'api.inventory_item_status exposes name_language');
select is(
  pg_temp.as_user('a9190000-0000-0000-0000-000000000001',
    $$update api.inventory_items set name = 'Oat milk', name_language = 'en' where item_id = 'a91a0000-0000-0000-0000-000000000002' returning name_language$$),
  'en', 'manager writes name_language through the api.inventory_items write path');
select throws_ok(
  $$ insert into content.translations (tenant_id, source_entity_type, source_entity_id, source_field, source_language, target_language, translated_text, source_content_hash)
     values ('a9100000-0000-0000-0000-0000000000a1', 'inventory_item', 'a91a0000-0000-0000-0000-000000000001', 'bogus_field', 'ja', 'en', 'x', 'h') $$,
  '23514', null, 'source_field CHECK still rejects unknown fields');

-- The backfill predicate of 0153 (same literal): \u escapes resolve, kana/kanji -> ja.
select is(
  (select string_agg(n || '=' || case when n ~ '[぀-ヿ㐀-䶿一-鿿々ｦ-ﾟ]' then 'ja' else 'en' end, ',' order by ord)
     from unnest(array['牛乳', 'コーヒー豆', 'みりん', 'ｺｰﾋｰ', 'Milk', 'Oat milk 1L', 'Ｍｉｌｋ']) with ordinality as u(n, ord)),
  '牛乳=ja,コーヒー豆=ja,みりん=ja,ｺｰﾋｰ=ja,Milk=en,Oat milk 1L=en,Ｍｉｌｋ=en',
  'backfill script rule classifies kanji/kana/half-width kana as ja, latin as en');

-- --- helpers -------------------------------------------------------------------
select is(content.recipe_original_language('a9100000-0000-0000-0000-0000000000a1', 'inventory_item', 'a91a0000-0000-0000-0000-000000000001'),
  'ja', 'original language of a ja item is its name_language (ja)');
select is(content.recipe_original_language('a9100000-0000-0000-0000-0000000000a1', 'inventory_item', 'a91a0000-0000-0000-0000-000000000002'),
  'en', 'original language of an en item is its name_language (en)');
select is(content.translation_source_text('a9100000-0000-0000-0000-0000000000a1', 'inventory_item', 'a91a0000-0000-0000-0000-000000000001', 'name'),
  '牛乳', 'translation_source_text returns items.name');
select is(content.translation_source_text('a9100000-0000-0000-0000-0000000000a1', 'inventory_item', 'a91a0000-0000-0000-0000-000000000001', 'title'),
  null, 'translation_source_text returns null for a non-name field of an item');

-- --- manager of the location writes; direction derived from name_language -----
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000001', pg_temp.machine('a9100000-0000-0000-0000-0000000000a1', 'a91a0000-0000-0000-0000-000000000001', 'Milk')),
  'machine', 'L1 manager writes a machine translation of a ja L1 item');
select is(
  (select source_language || '->' || target_language from content.translations
    where source_entity_type = 'inventory_item' and source_entity_id = 'a91a0000-0000-0000-0000-000000000001'),
  'ja->en', 'ja item: translation is ja -> en (server-derived)');
select is(
  (select source_content_hash from content.translations
    where source_entity_type = 'inventory_item' and source_entity_id = 'a91a0000-0000-0000-0000-000000000001'),
  encode(extensions.digest(convert_to('牛乳', 'UTF8'), 'sha256'), 'hex'),
  'stored hash is the server-computed hash of the name, not the client-supplied one');
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000001', pg_temp.machine('a9100000-0000-0000-0000-0000000000a1', 'a91a0000-0000-0000-0000-000000000002', 'オーツミルク')),
  'machine', 'L1 manager writes a machine translation of an en L1 item');
select is(
  (select source_language || '->' || target_language from content.translations
    where source_entity_type = 'inventory_item' and source_entity_id = 'a91a0000-0000-0000-0000-000000000002'),
  'en->ja', 'en item: translation is en -> ja (server-derived)');

-- --- staff of the location reads, cannot write -----------------------------------
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000002', pg_temp.count_visible('a91a0000-0000-0000-0000-000000000001')),
  '1', 'L1 employee reads the L1 item translation');
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000002', pg_temp.machine('a9100000-0000-0000-0000-0000000000a1', 'a91a0000-0000-0000-0000-000000000001', 'Cow milk')),
  'ERR 42501', 'L1 employee (no item.manage) cannot write a translation');

-- --- other location ----------------------------------------------------------------
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000001', pg_temp.machine('a9100000-0000-0000-0000-0000000000a1', 'a91a0000-0000-0000-0000-000000000003', 'Ice')),
  'ERR P0001', 'L1 manager cannot translate an L2 item (source not visible)');
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000003', pg_temp.machine('a9100000-0000-0000-0000-0000000000a1', 'a91a0000-0000-0000-0000-000000000003', 'Ice')),
  'machine', 'L2 manager translates the L2 item');
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000003', pg_temp.count_visible('a91a0000-0000-0000-0000-000000000001')),
  '0', 'L2 manager does not see the L1 item translation');
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000002', pg_temp.count_visible('a91a0000-0000-0000-0000-000000000003')),
  '0', 'L1 employee does not see the L2 item translation');
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000003',
    $$insert into content.translations (tenant_id, source_entity_type, source_entity_id, source_field, source_language, target_language, translated_text, source_content_hash)
      values ('a9100000-0000-0000-0000-0000000000a1', 'inventory_item', 'a91a0000-0000-0000-0000-000000000001', 'name', 'ja', 'ja', 'x', 'h') returning 'ok'$$),
  'ERR 42501', 'L2 manager cannot insert a translation row for an L1 item directly (RLS)');

-- --- other tenant ------------------------------------------------------------------
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000004', pg_temp.count_visible('a91a0000-0000-0000-0000-000000000001')),
  '0', 'other-tenant manager does not see T1 item translations');
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000004', pg_temp.machine('a9100000-0000-0000-0000-0000000000a1', 'a91a0000-0000-0000-0000-000000000001', 'Milk!')),
  'ERR P0001', 'other-tenant manager cannot translate a T1 item');

-- --- stale on rename -----------------------------------------------------------------
update inventory.items set name = '豆乳' where id = 'a91a0000-0000-0000-0000-000000000001';
select isnt(
  (select source_content_hash from content.translations
    where source_entity_type = 'inventory_item' and source_entity_id = 'a91a0000-0000-0000-0000-000000000001'),
  encode(extensions.digest(convert_to(btrim(content.translation_source_text('a9100000-0000-0000-0000-0000000000a1', 'inventory_item', 'a91a0000-0000-0000-0000-000000000001', 'name')), 'UTF8'), 'sha256'), 'hex'),
  'after a rename the stored hash no longer matches the name (translation reads as stale)');

-- --- module off ------------------------------------------------------------------------
update core.tenant_modules set is_enabled = false
 where tenant_id = 'a9100000-0000-0000-0000-0000000000a1' and module = 'inventory';
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000001', pg_temp.machine('a9100000-0000-0000-0000-0000000000a1', 'a91a0000-0000-0000-0000-000000000001', 'Soy milk')),
  'ERR P0001', 'module off: manager cannot translate');
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000002', pg_temp.count_visible('a91a0000-0000-0000-0000-000000000002')),
  '0', 'module off: employee no longer reads item translations');
update core.tenant_modules set is_enabled = true
 where tenant_id = 'a9100000-0000-0000-0000-0000000000a1' and module = 'inventory';

-- --- recipe behaviour unchanged -------------------------------------------------------
insert into workforce.recipes (id, tenant_id, location_id, title_ja, title_en, status, original_language) values
  ('a91b0000-0000-0000-0000-000000000001', 'a9100000-0000-0000-0000-0000000000a1', 'a9110000-0000-0000-0000-000000000001', '抹茶ラテ', null, 'published', 'ja'),
  ('a91b0000-0000-0000-0000-000000000002', 'a9100000-0000-0000-0000-0000000000a1', 'a9110000-0000-0000-0000-000000000001', null, 'Matcha Latte', 'published', 'en');
select is(content.translation_source_text('a9100000-0000-0000-0000-0000000000a1', 'workforce_recipe', 'a91b0000-0000-0000-0000-000000000001', 'title')
          || ' / ' ||
          content.translation_source_text('a9100000-0000-0000-0000-0000000000a1', 'workforce_recipe', 'a91b0000-0000-0000-0000-000000000002', 'title'),
  '抹茶ラテ / Matcha Latte', 'recipe translation_source_text still picks the column matching original_language');
select is(content.recipe_original_language('a9100000-0000-0000-0000-0000000000a1', 'workforce_recipe', 'a91b0000-0000-0000-0000-000000000002'),
  'en', 'recipe original language still resolves from workforce.recipes');
select is(pg_temp.as_user('a9190000-0000-0000-0000-000000000001',
    $$select translation_status from api.set_machine_content_translation_confirmed('a9100000-0000-0000-0000-0000000000a1'::uuid, 'workforce_recipe', 'a91b0000-0000-0000-0000-000000000001'::uuid, 'title', 'Matcha Latte', 'x', false, 'google')$$),
  'machine', 'recipe manager still writes a recipe machine translation');
select is(
  (select source_language || '->' || target_language from content.translations
    where source_entity_type = 'workforce_recipe' and source_entity_id = 'a91b0000-0000-0000-0000-000000000001'),
  'ja->en', 'recipe translation direction still derived from original_language (ja -> en)');

select * from finish();
rollback;
