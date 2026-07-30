-- ============================================================================
-- DB test: Content translation provider selection (migration 0047)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
-- pgTAP tests, enabled inside a rolled-back transaction (see 0001's header).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, content, ai;

select no_plan();

-- --- fixtures (superuser) --------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('a1000000-0000-0000-0000-00000000000a', 'pgtap-content-provider-tenant-a', 'pgTAP Content Provider Tenant A'),
  ('a2000000-0000-0000-0000-00000000000b', 'pgtap-content-provider-tenant-b', 'pgTAP Content Provider Tenant B');

insert into workforce.recipes (id, tenant_id, title_ja, description_ja, status)
  values ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '抹茶ラテ', '抹茶を使ったラテです。', 'published');
insert into workforce.recipes (id, tenant_id, title_ja, description_ja, status)
  values ('a2100000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000b', 'Tenant B Recipe', 'Tenant B description', 'published');

insert into core.users (id, display_name) values
  ('a1900000-0000-0000-0000-000000000001', 'Manager A (recipe.manage)'),
  ('a1900000-0000-0000-0000-000000000002', 'Employee A (recipe.read only)');

insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005'), -- manager: recipe.read + recipe.manage + recipe.publish
  ('a1000000-0000-0000-0000-00000000000a', 'a1900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000006'); -- employee: recipe.read only

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

-- --- the CHECK constraint accepts 'openai' (field: title) ------------------
select ok(
  not pg_temp.as_auth_throws('a1900000-0000-0000-0000-000000000001',
    $$ select * from api.set_machine_content_translation_confirmed(
         'a1000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         'a1100000-0000-0000-0000-000000000001'::uuid, 'title',
         'Matcha latte', 'ignored-client-hash', false, 'openai') $$),
  'manager can create a machine translation with translation_provider=openai'
);

reset role;

select is(
  (select translation_provider from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a'
      and source_entity_id = 'a1100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'openai',
  'a translation created with p_translation_provider=openai records translation_provider=openai'
);

select is(
  (select translation_status from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a'
      and source_entity_id = 'a1100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'machine',
  'a translation created via the confirmed RPC is stamped machine, not reviewed, regardless of provider'
);

-- --- omitting p_translation_provider still defaults to 'deepl' (field: title, regenerated) --
select ok(
  not pg_temp.as_auth_throws('a1900000-0000-0000-0000-000000000001',
    $$ select * from api.set_machine_content_translation_confirmed(
         'a1000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         'a1100000-0000-0000-0000-000000000001'::uuid, 'title',
         'Matcha latte (deepl regen)', 'ignored-client-hash', true) $$),
  'manager can regenerate the same field without specifying a provider'
);

reset role;

select is(
  (select translation_provider from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a'
      and source_entity_id = 'a1100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'deepl',
  'omitting p_translation_provider defaults to deepl, unchanged from before 0047'
);

-- --- the legacy 6-arg wrapper still records provider=deepl (field: description) --
select ok(
  not pg_temp.as_auth_throws('a1900000-0000-0000-0000-000000000001',
    $$ select * from api.set_machine_content_translation(
         'a1000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         'a1100000-0000-0000-0000-000000000001'::uuid, 'description',
         'A latte made with matcha.', 'ignored-client-hash') $$),
  'manager can still call the legacy 6-arg api.set_machine_content_translation wrapper'
);

reset role;

select is(
  (select translation_provider from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a'
      and source_entity_id = 'a1100000-0000-0000-0000-000000000001' and source_field = 'description'),
  'deepl',
  'the legacy 6-arg wrapper still records translation_provider=deepl, unchanged behaviour'
);

-- --- a manual edit (untouched by 0047) can still overwrite a machine translation --
select ok(
  not pg_temp.as_auth_throws('a1900000-0000-0000-0000-000000000001',
    $$ select * from api.set_content_translation(
         'a1000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         'a1100000-0000-0000-0000-000000000001'::uuid, 'description', 'en',
         'A hot latte made with ceremonial-grade matcha.', 'ignored-client-hash', false) $$),
  'api.set_content_translation (manual path, untouched by 0047) still works over an existing machine translation'
);

reset role;

select is(
  (select translation_provider from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a'
      and source_entity_id = 'a1100000-0000-0000-0000-000000000001' and source_field = 'description'),
  'manual',
  'the manual write path is unaffected by 0047 and still records translation_provider=manual'
);

-- --- the CHECK constraint still rejects an unsupported provider value (field: title) --
select throws_ok(
  $$ select * from api.set_machine_content_translation_confirmed(
       'a1000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
       'a1100000-0000-0000-0000-000000000001'::uuid, 'title',
       'Bad provider', 'ignored-client-hash', true, 'chatgpt') $$,
  '23514',
  null,
  'an unsupported translation_provider value is rejected by the CHECK constraint, not silently accepted'
);

-- --- RLS/tenant boundaries remain intact -----------------------------------
select ok(
  pg_temp.as_auth_throws('a1900000-0000-0000-0000-000000000002',
    $$ select * from api.set_machine_content_translation_confirmed(
         'a1000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         'a1100000-0000-0000-0000-000000000001'::uuid, 'title',
         'Should be blocked', 'ignored-client-hash', true, 'openai') $$),
  'employee (recipe.read only, no recipe.manage) still cannot create a machine translation, regardless of provider'
);

reset role;

select ok(
  pg_temp.as_auth_throws('a1900000-0000-0000-0000-000000000001',
    $$ select * from api.set_machine_content_translation_confirmed(
         'a2000000-0000-0000-0000-00000000000b'::uuid, 'workforce_recipe',
         'a2100000-0000-0000-0000-000000000001'::uuid, 'title',
         'Cross-tenant openai attempt', 'ignored-client-hash', false, 'openai') $$),
  'Tenant A manager still cannot create a machine translation against Tenant B''s recipe, regardless of provider'
);

reset role;

select * from finish();
rollback;
