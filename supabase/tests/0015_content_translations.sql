-- ============================================================================
-- DB test: Content translations foundation (migrations 0039/0040)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
-- pgTAP tests, enabled inside a rolled-back transaction (see 0001's header).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, content, ai;

select no_plan();

select ok(
  has_table_privilege('authenticated', 'content.translations', 'INSERT')
  and has_table_privilege('authenticated', 'content.translations', 'UPDATE'),
  'authenticated has the base INSERT/UPDATE privileges required for SECURITY INVOKER translation RPCs (RLS remains the authorization boundary)'
);

-- --- structure -----------------------------------------------------------
select has_schema('content', 'content schema exists');
select has_table('content', 'translations', 'content.translations exists');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'content' and c.relname = 'translations' and c.relrowsecurity = false),
  0,
  'RLS is enabled on content.translations'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'content'),
  0,
  'zero anon table grants on content'
);

-- --- fixtures (superuser) --------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('9c000000-0000-0000-0000-00000000000a', 'pgtap-content-tenant-a', 'pgTAP Content Tenant A'),
  ('9d000000-0000-0000-0000-00000000000b', 'pgtap-content-tenant-b', 'pgTAP Content Tenant B');

insert into workforce.recipes (id, tenant_id, title_ja, status)
  values ('9c100000-0000-0000-0000-000000000001', '9c000000-0000-0000-0000-00000000000a', '抹茶ラテ', 'published');
insert into workforce.recipes (id, tenant_id, title_ja, status)
  values ('9d100000-0000-0000-0000-000000000001', '9d000000-0000-0000-0000-00000000000b', 'Tenant B Recipe', 'published');

insert into core.users (id, display_name) values
  ('9c900000-0000-0000-0000-000000000001', 'Manager A (recipe.manage)'),
  ('9c900000-0000-0000-0000-000000000002', 'Employee A (recipe.read only)'),
  ('9d900000-0000-0000-0000-000000000001', 'Tenant B Owner');

insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('9c000000-0000-0000-0000-00000000000a', '9c900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005'), -- manager: recipe.read + recipe.manage + recipe.publish
  ('9c000000-0000-0000-0000-00000000000a', '9c900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000006'), -- employee: recipe.read only
  ('9d000000-0000-0000-0000-00000000000b', '9d900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003'); -- tenant_owner

-- --- test-only grants (rolled back with the rest of this transaction) -----
grant usage on schema content to authenticated;
grant usage on schema workforce to authenticated;
grant select, insert, update on content.translations to authenticated;
grant select on workforce.recipes, workforce.recipe_ingredients, workforce.recipe_steps, workforce.recipe_notes to authenticated;

create function pg_temp.as_auth_throws(p_sub text, p_sql text)
returns boolean
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  return false;
exception
  when others then
    return true;
end;
$$;

create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into n;
  return n;
end;
$$;

-- --- employee (recipe.read only) cannot write a translation ----------------
select ok(
  pg_temp.as_auth_throws('9c900000-0000-0000-0000-000000000002',
    $$ insert into content.translations
         (tenant_id, source_entity_type, source_entity_id, source_field, target_language, translated_text, source_content_hash)
       values
         ('9c000000-0000-0000-0000-00000000000a', 'workforce_recipe', '9c100000-0000-0000-0000-000000000001',
          'title', 'en', 'Matcha latte', 'deadbeef') $$),
  'employee (recipe.read only, no recipe.manage) cannot insert a content translation'
);

reset role;

-- --- manager (recipe.manage) can write a translation for their own tenant's recipe --
-- Uses api.set_content_translation itself (not a raw INSERT) so the row this
-- creates is a real 'reviewed' translation (the RPC always stamps that
-- status) -- Section below (force-required) depends on that being true.
select ok(
  not pg_temp.as_auth_throws('9c900000-0000-0000-0000-000000000001',
    $$ select * from api.set_content_translation(
         '9c000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         '9c100000-0000-0000-0000-000000000001'::uuid, 'title', 'en',
         'Matcha latte', 'deadbeef', false) $$),
  'manager (workforce.recipe.manage) can create a content translation for their own tenant''s recipe via api.set_content_translation'
);

reset role;

select is(
  (select translation_status from content.translations
    where tenant_id = '9c000000-0000-0000-0000-00000000000a'
      and source_entity_id = '9c100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'reviewed',
  'a translation created via api.set_content_translation is always stamped reviewed (manual path)'
);

-- --- cross-tenant: manager cannot write a translation for another tenant's recipe --
select ok(
  pg_temp.as_auth_throws('9c900000-0000-0000-0000-000000000001',
    $$ insert into content.translations
         (tenant_id, source_entity_type, source_entity_id, source_field, target_language, translated_text, source_content_hash)
       values
         ('9d000000-0000-0000-0000-00000000000b', 'workforce_recipe', '9d100000-0000-0000-0000-000000000001',
          'title', 'en', 'Hack', 'deadbeef') $$),
  'Tenant A manager cannot insert a translation against Tenant B''s recipe (cross-tenant write blocked)'
);

reset role;

-- --- cross-tenant read isolation -------------------------------------------
select is(
  pg_temp.as_auth_count('9d900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from content.translations where tenant_id = '9c000000-0000-0000-0000-00000000000a' $$),
  0,
  'Tenant B owner sees zero Tenant A content translations (tenant isolation)'
);

reset role;

-- --- employee (recipe.read) CAN read a translation of a published recipe ---
select is(
  pg_temp.as_auth_count('9c900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from content.translations
        where source_entity_id = '9c100000-0000-0000-0000-000000000001' $$),
  1,
  'employee (recipe.read) can read the translation of a recipe they can already read'
);

reset role;

-- --- api.set_content_translation: force required to overwrite a reviewed translation --
select throws_ok(
  $$ select * from api.set_content_translation(
       '9c000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
       '9c100000-0000-0000-0000-000000000001'::uuid, 'title', 'en',
       'Matcha Latte (edited)', 'deadbeef', false) $$,
  'P0001',
  null,
  'api.set_content_translation refuses to silently overwrite an existing reviewed translation without force=true'
);

select * from finish();
rollback;
