begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;
select no_plan();

select has_column('workforce', 'recipes', 'media_path', 'recipe stores only an opaque private-media path');
select function_privs_are('api', 'upsert_workforce_recipe',
  array['uuid','uuid','uuid','text','text','text','text','jsonb','jsonb','text','text','text','text','boolean'],
  'authenticated', array['EXECUTE'], 'authenticated can execute only the app-facing recipe RPC');
select has_column('workforce', 'recipes', 'original_language', 'recipe carries an explicit original_language (ja|en)');
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api' and p.proname='upsert_workforce_recipe'), false,
  'recipe RPC is SECURITY INVOKER so RLS stays authoritative');
select is((select public from storage.buckets where id='recipe-media'), false, 'recipe media bucket is private');
select is((select count(*)::int from pg_policies where schemaname='storage' and tablename='objects'
  and policyname in ('recipe_media_select','recipe_media_insert','recipe_media_delete')), 3,
  'recipe media has exact read, insert, and delete policies');

create function pg_temp.as_auth_exec(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return true;
exception when others then
  raise notice 'as_auth_exec failed: %', sqlerrm;
  reset role;
  return false;
end;
$$;

insert into core.tenants (id, slug, name) values
  ('cf000000-0000-0000-0000-000000000001', 'recipe-manage-a', 'Recipe A'),
  ('cf000000-0000-0000-0000-000000000002', 'recipe-manage-b', 'Recipe B');
insert into core.locations (id, tenant_id, name) values
  ('cf100000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000001', 'Cafe A'),
  ('cf100000-0000-0000-0000-000000000002', 'cf000000-0000-0000-0000-000000000002', 'Cafe B');
insert into core.users (id, display_name) values
  ('cf200000-0000-0000-0000-000000000001', 'Manager A'),
  ('cf200000-0000-0000-0000-000000000002', 'Staff A');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('cf000000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'cf100000-0000-0000-0000-000000000001'),
  ('cf000000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'cf100000-0000-0000-0000-000000000001');

select ok(pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000001',
  $q$select api.upsert_workforce_recipe(
    'cf000000-0000-0000-0000-000000000001','cf100000-0000-0000-0000-000000000001',null,
    'recipe','抹茶ラテ','定番','published','["抹茶","牛乳"]','["混ぜる","注ぐ"]','提供時','よく混ぜる',null)$q$),
  'manager creates a complete published recipe through the RPC');
select is((select count(*)::int from workforce.recipes where tenant_id='cf000000-0000-0000-0000-000000000001'), 1, 'one recipe created');
select is((select count(*)::int from workforce.recipe_ingredients where tenant_id='cf000000-0000-0000-0000-000000000001'), 2, 'ingredients created transactionally');
select is((select count(*)::int from workforce.recipe_steps where tenant_id='cf000000-0000-0000-0000-000000000001'), 2, 'steps created transactionally');
select is((select count(*)::int from workforce.recipe_notes where tenant_id='cf000000-0000-0000-0000-000000000001'), 1, 'optional note created');

create temporary table recipe_ids as
select r.id recipe_id, (array_agg(i.id order by i.sort_order, i.id))[1] ingredient_id
from workforce.recipes r join workforce.recipe_ingredients i on i.recipe_id=r.id
where r.tenant_id='cf000000-0000-0000-0000-000000000001' group by r.id;
select ok(pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000001', format(
  $q$select api.upsert_workforce_recipe(
    'cf000000-0000-0000-0000-000000000001','cf100000-0000-0000-0000-000000000001','%s',
    'recipe','抹茶ラテ改','定番','draft','["抹茶"]','["混ぜる"]','','',null)$q$,
  (select recipe_id from recipe_ids))), 'manager updates the same recipe');
select is((select count(*)::int from workforce.recipe_ingredients where tenant_id='cf000000-0000-0000-0000-000000000001'), 1, 'removed ingredient is deleted');
select ok((select ingredient_id in (select id from workforce.recipe_ingredients) from recipe_ids), 'first ingredient id is preserved for translation continuity');

select isnt(pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000002',
  $q$select api.upsert_workforce_recipe(
    'cf000000-0000-0000-0000-000000000001','cf100000-0000-0000-0000-000000000001',null,
    'recipe','Blocked','','draft','[]','[]','','',null)$q$), true,
  'staff without recipe.manage cannot create a recipe');
select isnt(pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000001',
  $q$select api.upsert_workforce_recipe(
    'cf000000-0000-0000-0000-000000000002','cf100000-0000-0000-0000-000000000002',null,
    'recipe','Cross tenant','','draft','[]','[]','','',null)$q$), true,
  'manager cannot create in another tenant/location');

-- ----------------------------------------------------------------------------
-- Bilingual original_language (0058)
-- ----------------------------------------------------------------------------
select ok(pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000001',
  $q$select api.upsert_workforce_recipe(
    'cf000000-0000-0000-0000-000000000001','cf100000-0000-0000-0000-000000000001',null,
    'recipe','Matcha Latte','Signature','published','["Matcha","Milk"]','["Whisk","Pour"]','Serving','Mix well',null,
    'en',false)$q$),
  'manager creates an en-original recipe through the RPC');
select is((select original_language from workforce.recipes
  where tenant_id='cf000000-0000-0000-0000-000000000001' and title_en='Matcha Latte'), 'en',
  'en-original recipe stores original_language=en');
select is((select title_ja from workforce.recipes
  where tenant_id='cf000000-0000-0000-0000-000000000001' and title_en='Matcha Latte'), null,
  'en-original recipe has no human title_ja (nullable column, never fabricated)');

create temporary table en_recipe_ids as
select r.id recipe_id from workforce.recipes r
where r.tenant_id='cf000000-0000-0000-0000-000000000001' and r.title_en='Matcha Latte';

-- Changing original_language on an existing recipe without confirmation is
-- refused (safety rule: never a silent dropdown swap).
select isnt(pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000001', format(
  $q$select api.upsert_workforce_recipe(
    'cf000000-0000-0000-0000-000000000001','cf100000-0000-0000-0000-000000000001','%s',
    'recipe','抹茶ラテ','定番','published','["抹茶"]','["混ぜる"]','','',null,'ja',false)$q$,
  (select recipe_id from en_recipe_ids))), true,
  'changing original_language without confirmation is refused');
select is((select original_language from workforce.recipes r join en_recipe_ids e on e.recipe_id=r.id), 'en',
  'unconfirmed language-change attempt left original_language unchanged');
select is((select title_en from workforce.recipes r join en_recipe_ids e on e.recipe_id=r.id), 'Matcha Latte',
  'unconfirmed language-change attempt left existing human content untouched');

-- Confirmed change: allowed, existing content preserved.
select ok(pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000001', format(
  $q$select api.upsert_workforce_recipe(
    'cf000000-0000-0000-0000-000000000001','cf100000-0000-0000-0000-000000000001','%s',
    'recipe','抹茶ラテ','定番','published','["抹茶"]','["混ぜる"]','','',null,'ja',true)$q$,
  (select recipe_id from en_recipe_ids))),
  'confirmed original_language change is accepted');
select is((select original_language from workforce.recipes r join en_recipe_ids e on e.recipe_id=r.id), 'ja',
  'confirmed change updates original_language');
select is((select title_en from workforce.recipes r join en_recipe_ids e on e.recipe_id=r.id), 'Matcha Latte',
  'confirmed language change never overwrites/deletes the prior human title_en');
select is((select title_ja from workforce.recipes r join en_recipe_ids e on e.recipe_id=r.id), '抹茶ラテ',
  'confirmed language change writes the new source column');

select * from finish();
rollback;
