-- ============================================================================
-- DB test: Content translations machine-write + reviewed-confirmation RPCs
-- (migration 0041)
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
  ('9e000000-0000-0000-0000-00000000000a', 'pgtap-content-mw-tenant-a', 'pgTAP Content MW Tenant A'),
  ('9f000000-0000-0000-0000-00000000000b', 'pgtap-content-mw-tenant-b', 'pgTAP Content MW Tenant B');

insert into workforce.recipes (id, tenant_id, title_ja, status)
  values ('9e100000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000a', '抹茶ラテ', 'published');
insert into workforce.recipes (id, tenant_id, title_ja, status)
  values ('9f100000-0000-0000-0000-000000000001', '9f000000-0000-0000-0000-00000000000b', 'Tenant B Recipe', 'published');

insert into core.users (id, display_name) values
  ('9e900000-0000-0000-0000-000000000001', 'Manager A (recipe.manage)'),
  ('9e900000-0000-0000-0000-000000000002', 'Employee A (recipe.read only)'),
  ('9f900000-0000-0000-0000-000000000001', 'Tenant B Owner');

insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('9e000000-0000-0000-0000-00000000000a', '9e900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005'), -- manager: recipe.read + recipe.manage + recipe.publish
  ('9e000000-0000-0000-0000-00000000000a', '9e900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000006'), -- employee: recipe.read only
  ('9f000000-0000-0000-0000-00000000000b', '9f900000-0000-0000-0000-000000000001',
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

-- --- employee (recipe.read only) cannot generate a machine translation ----
select ok(
  pg_temp.as_auth_throws('9e900000-0000-0000-0000-000000000002',
    $$ select * from api.set_machine_content_translation(
         '9e000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         '9e100000-0000-0000-0000-000000000001'::uuid, 'title',
         'Matcha latte', 'deadbeef') $$),
  'employee (recipe.read only, no recipe.manage) cannot create a machine translation'
);

reset role;

-- --- manager (recipe.manage) can generate a machine translation for their own tenant's recipe --
select ok(
  not pg_temp.as_auth_throws('9e900000-0000-0000-0000-000000000001',
    $$ select * from api.set_machine_content_translation(
         '9e000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         '9e100000-0000-0000-0000-000000000001'::uuid, 'title',
         'Matcha latte', 'deadbeef') $$),
  'manager (workforce.recipe.manage) can create a machine translation for their own tenant''s recipe'
);

reset role;

select is(
  (select translation_status from content.translations
    where tenant_id = '9e000000-0000-0000-0000-00000000000a'
      and source_entity_id = '9e100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'machine',
  'a translation created via api.set_machine_content_translation is stamped machine, not reviewed'
);

select is(
  (select translation_provider from content.translations
    where tenant_id = '9e000000-0000-0000-0000-00000000000a'
      and source_entity_id = '9e100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'deepl',
  'a translation created via api.set_machine_content_translation records provider=deepl'
);

-- --- cross-tenant: manager cannot generate a machine translation for another tenant's recipe --
select ok(
  pg_temp.as_auth_throws('9e900000-0000-0000-0000-000000000001',
    $$ select * from api.set_machine_content_translation(
         '9f000000-0000-0000-0000-00000000000b'::uuid, 'workforce_recipe',
         '9f100000-0000-0000-0000-000000000001'::uuid, 'title',
         'Hack', 'deadbeef') $$),
  'Tenant A manager cannot create a machine translation against Tenant B''s recipe (cross-tenant write blocked)'
);

reset role;

-- --- api.set_machine_content_translation refuses to clobber a reviewed translation --
-- Mark the existing machine translation reviewed first (as manager), then
-- attempt to regenerate it via the machine path -- must be refused, no
-- force override exists for this RPC.
select ok(
  not pg_temp.as_auth_throws('9e900000-0000-0000-0000-000000000001',
    $$ select * from api.mark_content_translation_reviewed(
         '9e000000-0000-0000-0000-00000000000a'::uuid,
         (select id from content.translations
           where tenant_id = '9e000000-0000-0000-0000-00000000000a'
             and source_entity_id = '9e100000-0000-0000-0000-000000000001' and source_field = 'title')) $$),
  'manager can mark an existing machine translation as reviewed'
);

reset role;

select is(
  (select translation_status from content.translations
    where tenant_id = '9e000000-0000-0000-0000-00000000000a'
      and source_entity_id = '9e100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'reviewed',
  'api.mark_content_translation_reviewed flips translation_status to reviewed'
);

select is(
  (select translation_provider from content.translations
    where tenant_id = '9e000000-0000-0000-0000-00000000000a'
      and source_entity_id = '9e100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'deepl',
  'api.mark_content_translation_reviewed does not change translation_provider'
);

select throws_ok(
  $$ select * from api.set_machine_content_translation(
       '9e000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
       '9e100000-0000-0000-0000-000000000001'::uuid, 'title',
       'Matcha Latte (regenerated)', 'deadbeef') $$,
  'P0001',
  null,
  'api.set_machine_content_translation refuses to replace an existing reviewed translation (no force override exists)'
);

-- --- employee (recipe.read only) cannot mark a translation reviewed --------
-- api.mark_content_translation_reviewed is a plain RLS-gated UPDATE (SECURITY
-- INVOKER, language sql) -- an unauthorized caller's UPDATE simply matches
-- zero rows (RLS filters which rows are visible/updatable), it does not
-- raise, exactly like this codebase's other RLS-filtered read/write
-- functions. So the assertion here is "zero rows returned", not "throws".
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

select is(
  pg_temp.as_auth_count('9e900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from api.mark_content_translation_reviewed(
         '9e000000-0000-0000-0000-00000000000a'::uuid,
         (select id from content.translations
           where tenant_id = '9e000000-0000-0000-0000-00000000000a'
             and source_entity_id = '9e100000-0000-0000-0000-000000000001' and source_field = 'title')) $$),
  0,
  'employee (recipe.read only, no recipe.manage) cannot mark a translation reviewed -- the RLS-filtered update matches zero rows'
);

reset role;

-- --- 0042 hardening: caller hashes are ignored and reviewed replacement
-- requires an explicit confirmation flag.
select ok(
  not pg_temp.as_auth_throws('9e900000-0000-0000-0000-000000000001',
    $$ select * from api.set_machine_content_translation_confirmed(
         '9e000000-0000-0000-0000-00000000000a'::uuid, 'workforce_recipe',
         '9e100000-0000-0000-0000-000000000001'::uuid, 'title',
         'Matcha Latte (confirmed regeneration)', 'spoofed-client-hash', true) $$),
  'manager can explicitly replace a reviewed translation through the confirmed regeneration RPC'
);

reset role;

select isnt(
  (select source_content_hash from content.translations
    where tenant_id = '9e000000-0000-0000-0000-00000000000a'
      and source_entity_id = '9e100000-0000-0000-0000-000000000001' and source_field = 'title'),
  'spoofed-client-hash',
  'the database ignores a caller-supplied source hash'
);

select is(
  (select source_content_hash from content.translations
    where tenant_id = '9e000000-0000-0000-0000-00000000000a'
      and source_entity_id = '9e100000-0000-0000-0000-000000000001' and source_field = 'title'),
  encode(digest(convert_to(btrim((select title_ja from workforce.recipes
    where id = '9e100000-0000-0000-0000-000000000001')), 'UTF8'), 'sha256'), 'hex'),
  'the database stores the SHA-256 hash derived from the current visible source text'
);

select * from finish();
rollback;
