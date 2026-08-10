-- ============================================================================
-- DB test: Workforce guarded recipe permanent-delete RPC (migration 0057)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Mirrors 0024_workforce_employee_permanent_delete.sql's role-hop fixture
-- pattern and SECURITY DEFINER split exactly (authenticated has no DELETE
-- grant on workforce.recipes -- see 0057's migration header for why this
-- could not simply reuse RLS), plus asserts the Archived-only state gate and
-- the content.translations orphan cleanup that migration adds on top of the
-- employee/inventory pattern.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, content, inventory, ai;

select no_plan();

-- ============================================================================
-- Section 1: structure
-- ============================================================================

select has_function('api', 'permanently_delete_recipe', array['uuid', 'uuid'], 'api.permanently_delete_recipe exists');

select ok(
  has_function_privilege('authenticated', 'api.permanently_delete_recipe(uuid, uuid)', 'EXECUTE'),
  'authenticated can execute api.permanently_delete_recipe'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'workforce' and table_name = 'recipes' and privilege_type = 'DELETE'
      and grantee not in (select tableowner from pg_tables where schemaname = 'workforce' and tablename = 'recipes')),
  0,
  'no DELETE grant to any application role exists on workforce.recipes -- the RPC is still the only hard-delete path'
);

-- ============================================================================
-- Section 2: role-hop behavioral tests
-- ============================================================================

grant usage on schema workforce to authenticated;
grant usage on schema api to authenticated;

create function pg_temp.as_auth_recipe_permadelete(p_sub text, p_tenant uuid, p_recipe uuid, out deleted boolean, out blocked_not_archived boolean, out media_path text)
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select r.deleted, r.blocked_not_archived, r.media_path
    into deleted, blocked_not_archived, media_path
    from api.permanently_delete_recipe(p_tenant, p_recipe) r;
  deleted := coalesce(deleted, false);
  blocked_not_archived := coalesce(blocked_not_archived, false);
end;
$$;

insert into core.tenants (id, slug, name) values
  ('9e000000-0000-0000-0000-00000000000e', 'pgtap-wf-recipe-permadelete-tenant', 'pgTAP Recipe Permadelete Tenant');

insert into core.locations (id, tenant_id, name, timezone) values
  ('9e200000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000e', 'Location A', 'Asia/Tokyo'),
  ('9e200000-0000-0000-0000-000000000002', '9e000000-0000-0000-0000-00000000000e', 'Location B', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('9e900000-0000-0000-0000-000000000001', 'Staff A (Location A)'),
  ('9e900000-0000-0000-0000-000000000002', 'Manager A (Location A)'),
  ('9e900000-0000-0000-0000-000000000003', 'Manager B (Location B)');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9e000000-0000-0000-0000-00000000000e', '9e900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9e200000-0000-0000-0000-000000000001'), -- employee @ Location A
  ('9e000000-0000-0000-0000-00000000000e', '9e900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '9e200000-0000-0000-0000-000000000001'), -- manager @ Location A
  ('9e000000-0000-0000-0000-00000000000e', '9e900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000005', '9e200000-0000-0000-0000-000000000002'); -- manager @ Location B

-- A draft (not-yet-archived) recipe.
insert into workforce.recipes (id, tenant_id, location_id, title_ja, status) values
  ('9e300000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000e',
   '9e200000-0000-0000-0000-000000000001', 'Draft recipe', 'draft');

-- An archived recipe with an ingredient, a step, a note, and machine
-- translations on the recipe itself and on the ingredient -- exercising the
-- orphan-cleanup path across every source_entity_type this migration covers.
insert into workforce.recipes (id, tenant_id, location_id, title_ja, status, media_path) values
  ('9e300000-0000-0000-0000-000000000002', '9e000000-0000-0000-0000-00000000000e',
   '9e200000-0000-0000-0000-000000000001', 'Archived recipe', 'archived', 'tenant/loc/recipe-2/photo.jpg');

insert into workforce.recipe_ingredients (id, tenant_id, recipe_id, label_ja, sort_order) values
  ('9e400000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000e',
   '9e300000-0000-0000-0000-000000000002', 'Coffee beans', 1);

insert into workforce.recipe_steps (id, tenant_id, recipe_id, step_number, instruction_ja) values
  ('9e500000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000e',
   '9e300000-0000-0000-0000-000000000002', 1, 'Grind the beans.');

insert into workforce.recipe_notes (id, tenant_id, recipe_id, title_ja, body_ja) values
  ('9e600000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000e',
   '9e300000-0000-0000-0000-000000000002', 'Note', 'Body text.');

insert into content.translations
  (tenant_id, source_entity_type, source_entity_id, source_field, target_language, translated_text, source_content_hash) values
  ('9e000000-0000-0000-0000-00000000000e', 'workforce_recipe', '9e300000-0000-0000-0000-000000000002', 'title', 'en', 'Archived recipe (EN)', 'hash-1'),
  ('9e000000-0000-0000-0000-00000000000e', 'workforce_recipe_ingredient', '9e400000-0000-0000-0000-000000000001', 'label', 'en', 'Coffee beans (EN)', 'hash-2');

-- Staff (recipe.manage absent) cannot permanently delete -- refused (zero rows), recipe still exists.
select is(
  (select deleted from pg_temp.as_auth_recipe_permadelete('9e900000-0000-0000-0000-000000000001',
    '9e000000-0000-0000-0000-00000000000e', '9e300000-0000-0000-0000-000000000002')),
  false,
  'staff (no workforce.recipe.manage) cannot permanently delete a recipe'
);
reset role;
select ok(
  exists(select 1 from workforce.recipes where id = '9e300000-0000-0000-0000-000000000002'),
  'recipe still exists after a staff (unauthorized) permanent-delete attempt'
);

-- Manager at Location B cannot delete a Location A recipe (location-scoped permission).
select is(
  (select deleted from pg_temp.as_auth_recipe_permadelete('9e900000-0000-0000-0000-000000000003',
    '9e000000-0000-0000-0000-00000000000e', '9e300000-0000-0000-0000-000000000002')),
  false,
  'manager at Location B cannot permanently delete a Location A recipe'
);
reset role;
select ok(
  exists(select 1 from workforce.recipes where id = '9e300000-0000-0000-0000-000000000002'),
  'recipe still exists after a cross-location permanent-delete attempt'
);

-- Manager at Location A is refused for the DRAFT (not-Archived) recipe.
select results_eq(
  $$ select deleted, blocked_not_archived from pg_temp.as_auth_recipe_permadelete('9e900000-0000-0000-0000-000000000002',
       '9e000000-0000-0000-0000-00000000000e', '9e300000-0000-0000-0000-000000000001') $$,
  $$ values (false, true) $$,
  'manager is refused permanent delete of a recipe that is not Archived, and told why'
);
reset role;
select ok(
  exists(select 1 from workforce.recipes where id = '9e300000-0000-0000-0000-000000000001'),
  'the draft recipe still exists -- refusal never cascades or removes it'
);

-- Manager at Location A can permanently delete the Archived recipe.
select results_eq(
  $$ select deleted, blocked_not_archived, media_path from pg_temp.as_auth_recipe_permadelete('9e900000-0000-0000-0000-000000000002',
       '9e000000-0000-0000-0000-00000000000e', '9e300000-0000-0000-0000-000000000002') $$,
  $$ values (true, false, 'tenant/loc/recipe-2/photo.jpg'::text) $$,
  'manager (workforce.recipe.manage, same location) permanently deletes an Archived recipe and gets back its media_path'
);
reset role;
select ok(
  not exists(select 1 from workforce.recipes where id = '9e300000-0000-0000-0000-000000000002'),
  'the recipe row is actually gone after a successful permanent delete'
);
select ok(
  not exists(select 1 from workforce.recipe_ingredients where recipe_id = '9e300000-0000-0000-0000-000000000002'),
  'its ingredients are gone (on delete cascade, 0021)'
);
select ok(
  not exists(select 1 from workforce.recipe_steps where recipe_id = '9e300000-0000-0000-0000-000000000002'),
  'its steps are gone (on delete cascade, 0021)'
);
select ok(
  not exists(select 1 from workforce.recipe_notes where recipe_id = '9e300000-0000-0000-0000-000000000002'),
  'its notes are gone (on delete cascade, 0021)'
);
select ok(
  not exists(select 1 from content.translations where source_entity_id in
    ('9e300000-0000-0000-0000-000000000002', '9e400000-0000-0000-0000-000000000001')),
  'content.translations rows for the recipe and its ingredient are explicitly deleted, not left orphaned (0039 has no FK there)'
);

-- A second attempt against the now-gone recipe is reported as not_found (zero rows), not an error.
select is(
  (select deleted from pg_temp.as_auth_recipe_permadelete('9e900000-0000-0000-0000-000000000002',
    '9e000000-0000-0000-0000-00000000000e', '9e300000-0000-0000-0000-000000000002')),
  false,
  're-deleting an already-gone recipe is reported as not-found, not an error'
);

reset role;
select * from finish();
rollback;
