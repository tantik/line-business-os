-- ============================================================================
-- DB test: bilingual recipe translation direction (migration 0058)
-- ----------------------------------------------------------------------------
-- Covers the direction-aware parts of the product contract that are only
-- expressible at the DB layer: content.recipe_original_language,
-- content.translation_source_text picking the correct column pair, and
-- api.set_machine_content_translation_confirmed deriving source/target from
-- the owning recipe instead of hardcoding ja->en.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, content, ai;

select no_plan();

insert into core.tenants (id, slug, name) values
  ('a1000000-0000-0000-0000-00000000000a', 'pgtap-bilingual-tenant-a', 'pgTAP Bilingual Tenant A');

-- Workforce is fail-closed by default since 0097_workforce_module_access_gate.sql;
-- this file's scenarios exercise workforce.recipes and assume normal, Workforce-ON
-- behavior for the fixture tenant.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a1000000-0000-0000-0000-00000000000a', 'workforce', true);

insert into core.users (id, display_name) values
  ('a1900000-0000-0000-0000-000000000001', 'Manager A (recipe.manage)');

insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005');

-- A ja-original recipe (the historical default) and an en-original recipe.
insert into workforce.recipes (id, tenant_id, title_ja, title_en, status, original_language) values
  ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '抹茶ラテ', null, 'published', 'ja'),
  ('a1100000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', null, 'Matcha Latte', 'published', 'en');

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

-- --- content.recipe_original_language resolves correctly for both directions
select is(
  content.recipe_original_language('a1000000-0000-0000-0000-00000000000a', 'workforce_recipe', 'a1100000-0000-0000-0000-000000000001'),
  'ja', 'recipe_original_language resolves ja for a ja-original recipe'
);
select is(
  content.recipe_original_language('a1000000-0000-0000-0000-00000000000a', 'workforce_recipe', 'a1100000-0000-0000-0000-000000000002'),
  'en', 'recipe_original_language resolves en for an en-original recipe'
);

-- --- content.translation_source_text picks the column matching direction --
select is(
  content.translation_source_text('a1000000-0000-0000-0000-00000000000a', 'workforce_recipe', 'a1100000-0000-0000-0000-000000000001', 'title'),
  '抹茶ラテ', 'translation_source_text reads title_ja for a ja-original recipe'
);
select is(
  content.translation_source_text('a1000000-0000-0000-0000-00000000000a', 'workforce_recipe', 'a1100000-0000-0000-0000-000000000002', 'title'),
  'Matcha Latte', 'translation_source_text reads title_en for an en-original recipe'
);

-- --- JA source -> EN machine translation (scenario 1) ----------------------
select ok(
  not pg_temp.as_auth_throws('a1900000-0000-0000-0000-000000000001',
    $$ select * from api.set_machine_content_translation_confirmed(
         'a1000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         'a1100000-0000-0000-0000-000000000001'::uuid, 'title',
         'Matcha Latte', 'ignored-client-hash', false, 'google') $$),
  'ja-original recipe: manager can create a machine EN translation'
);
reset role;
select is(
  (select target_language from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a' and source_entity_id = 'a1100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'en', 'ja-original recipe: machine translation target_language is en (derived, not client-supplied)'
);
select is(
  (select source_language from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a' and source_entity_id = 'a1100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'ja', 'ja-original recipe: machine translation source_language is ja'
);

-- --- EN source -> JA machine translation (scenario 2) -----------------------
select ok(
  not pg_temp.as_auth_throws('a1900000-0000-0000-0000-000000000001',
    $$ select * from api.set_machine_content_translation_confirmed(
         'a1000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         'a1100000-0000-0000-0000-000000000002'::uuid, 'title',
         '抹茶ラテ', 'ignored-client-hash', false, 'google') $$),
  'en-original recipe: manager can create a machine JA translation'
);
reset role;
select is(
  (select target_language from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a' and source_entity_id = 'a1100000-0000-0000-0000-000000000002' and source_field = 'title'),
  'ja', 'en-original recipe: machine translation target_language is ja (derived, not client-supplied)'
);
select is(
  (select source_language from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a' and source_entity_id = 'a1100000-0000-0000-0000-000000000002' and source_field = 'title'),
  'en', 'en-original recipe: machine translation source_language is en'
);
select is(
  (select translation_provider from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a' and source_entity_id = 'a1100000-0000-0000-0000-000000000002' and source_field = 'title'),
  'google', 'caller-supplied translation_provider (google) is recorded, not hardcoded deepl'
);

-- --- widened target_language CHECK accepts both ja and en -------------------
select throws_ok(
  $$ insert into content.translations
       (tenant_id, source_entity_type, source_entity_id, source_field, source_language, target_language, translated_text, source_content_hash)
     values
       ('a1000000-0000-0000-0000-00000000000a', 'workforce_recipe', 'a1100000-0000-0000-0000-000000000001', 'title', 'ja', 'fr', 'x', 'h') $$,
  '23514',
  null,
  'target_language CHECK still rejects a language outside (ja, en)'
);

-- --- manual api.set_content_translation on an en-original recipe stamps
--     source_language=en (not hardcoded ja) -----------------------------
select ok(
  not pg_temp.as_auth_throws('a1900000-0000-0000-0000-000000000001',
    $$ select * from api.set_content_translation(
         'a1000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         'a1100000-0000-0000-0000-000000000002'::uuid, 'title', 'ja',
         '抹茶ラテ（レビュー済み）', 'ignored', true) $$),
  'manager can manually author a reviewed JA translation for an en-original recipe'
);
reset role;
select is(
  (select source_language from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a' and source_entity_id = 'a1100000-0000-0000-0000-000000000002'
      and source_field = 'title' and target_language = 'ja'),
  'en', 'api.set_content_translation stamps the owning recipe''s actual original_language (en), not a hardcoded ja'
);
select is(
  (select translation_status from content.translations
    where tenant_id = 'a1000000-0000-0000-0000-00000000000a' and source_entity_id = 'a1100000-0000-0000-0000-000000000002'
      and source_field = 'title' and target_language = 'ja'),
  'reviewed', 'manual translation is stamped reviewed'
);

-- --- reviewed translation is not overwritten by a machine regeneration -----
select throws_ok(
  $$ select * from api.set_machine_content_translation_confirmed(
       'a1000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
       'a1100000-0000-0000-0000-000000000002'::uuid, 'title',
       '抹茶ラテ（機械翻訳やり直し）', 'ignored', false, 'google') $$,
  'P0001',
  null,
  'a reviewed translation is refused by the machine path without p_replace_reviewed'
);

select * from finish();
rollback;
