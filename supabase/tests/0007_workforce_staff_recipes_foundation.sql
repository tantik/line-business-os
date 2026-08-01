-- ============================================================================
-- DB test: Workforce staff profile + recipes DB foundation (Phase 1L-1,
--          migrations 0020_workforce_staff_profile_extension.sql and
--          0021_workforce_recipes.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Structural/catalog tests only -- no behavioral RLS tests yet, since 0020/
-- 0021 enable RLS but add zero policies (real policy design is Phase 1L-2).
-- pgTAP tests, enabled inside a rolled-back transaction (see 0001's header).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai;

select no_plan();

-- --- workforce.employees extension ------------------------------------------
select has_column('workforce', 'employees', 'position_label',
  'workforce.employees.position_label exists (renamed from position)');
select hasnt_column('workforce', 'employees', 'position',
  'workforce.employees.position no longer exists (renamed to position_label)');
select has_column('workforce', 'employees', 'created_by',
  'workforce.employees.created_by exists');
select has_column('workforce', 'employees', 'updated_by',
  'workforce.employees.updated_by exists');

-- --- New recipe tables exist -------------------------------------------------
select has_table('workforce', 'recipe_categories',  'workforce.recipe_categories exists');
select has_table('workforce', 'recipes',            'workforce.recipes exists');
select has_table('workforce', 'recipe_ingredients', 'workforce.recipe_ingredients exists');
select has_table('workforce', 'recipe_steps',       'workforce.recipe_steps exists');
select has_table('workforce', 'recipe_notes',       'workforce.recipe_notes exists');

-- --- RLS enabled on every new table ------------------------------------------
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'workforce'
      and c.relname in (
        'recipe_categories', 'recipes', 'recipe_ingredients',
        'recipe_steps', 'recipe_notes'
      )
      and c.relrowsecurity = false),
  0,
  'RLS is enabled on every new recipe table'
);

-- --- No anon/authenticated grants were introduced (at the time of 0020/0021) -
-- Phase 1L-3 (0023_workforce_api_facade.sql) later added persistent
-- `authenticated`-only SELECT grants on these 5 tables (plus
-- workforce.employees) for its api facade; `anon` remains at zero.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'workforce'
      and table_name in (
        'recipe_categories', 'recipes', 'recipe_ingredients',
        'recipe_steps', 'recipe_notes'
      )),
  0,
  'no anon grants on any new recipe table'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name in (
        'recipe_categories', 'recipes', 'recipe_ingredients',
        'recipe_steps', 'recipe_notes'
      )
      and not (
        privilege_type = 'SELECT'
        or (table_name = 'recipes' and privilege_type in ('INSERT', 'UPDATE'))
        or (table_name in ('recipe_ingredients', 'recipe_steps', 'recipe_notes') and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))
      )),
  0,
  'authenticated recipe grants are limited to facade reads and the 0051 SECURITY INVOKER RPC dependencies'
);

-- --- Permission catalog: 5 new keys exist, correct module --------------------
select is(
  (select count(*)::int from core.permissions
    where key in (
      'workforce.staff.read', 'workforce.staff.manage',
      'workforce.recipe.read', 'workforce.recipe.manage', 'workforce.recipe.publish'
    )
    and module = 'workforce'),
  5,
  'all 5 new workforce permission keys exist in core.permissions with module = workforce'
);

-- --- Role grants: owner/admin/manager get all 5; employee gets recipe.read only
select is(
  (select count(*)::int
     from core.role_permissions
    where role_id = '00000000-0000-0000-0000-000000000003' -- tenant_owner
      and permission_key in (
        'workforce.staff.read', 'workforce.staff.manage',
        'workforce.recipe.read', 'workforce.recipe.manage', 'workforce.recipe.publish'
      )),
  5,
  'tenant_owner holds all 5 new permission keys'
);
select is(
  (select count(*)::int
     from core.role_permissions
    where role_id = '00000000-0000-0000-0000-000000000004' -- tenant_admin
      and permission_key in (
        'workforce.staff.read', 'workforce.staff.manage',
        'workforce.recipe.read', 'workforce.recipe.manage', 'workforce.recipe.publish'
      )),
  5,
  'tenant_admin holds all 5 new permission keys'
);
select is(
  (select count(*)::int
     from core.role_permissions
    where role_id = '00000000-0000-0000-0000-000000000005' -- manager
      and permission_key in (
        'workforce.staff.read', 'workforce.staff.manage',
        'workforce.recipe.read', 'workforce.recipe.manage', 'workforce.recipe.publish'
      )),
  5,
  'manager holds all 5 new permission keys'
);
select is(
  (select count(*)::int
     from core.role_permissions
    where role_id = '00000000-0000-0000-0000-000000000006' -- employee
      and permission_key = 'workforce.recipe.read'),
  1,
  'employee holds workforce.recipe.read'
);
select is(
  (select count(*)::int
     from core.role_permissions
    where role_id = '00000000-0000-0000-0000-000000000006' -- employee
      and permission_key in (
        'workforce.staff.read', 'workforce.staff.manage',
        'workforce.recipe.manage', 'workforce.recipe.publish'
      )),
  0,
  'employee does NOT hold staff.read/staff.manage/recipe.manage/recipe.publish'
);

-- --- recipes.status check constraint -----------------------------------------
-- Fixtures (superuser bypasses RLS inside this rolled-back transaction).
insert into core.tenants (id, slug, name) values
  ('7a000000-0000-0000-0000-00000000000a', 'pgtap-1l1-tenant-a', 'pgTAP 1L-1 Tenant A'),
  ('7b000000-0000-0000-0000-00000000000b', 'pgtap-1l1-tenant-b', 'pgTAP 1L-1 Tenant B');

insert into workforce.recipes (id, tenant_id, title_ja)
  values ('7a100000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a', 'Tenant A Recipe');
insert into workforce.recipes (id, tenant_id, title_ja)
  values ('7b100000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-00000000000b', 'Tenant B Recipe');

select is(
  (select status from workforce.recipes where id = '7a100000-0000-0000-0000-000000000001'),
  'draft',
  'recipes.status defaults to draft'
);

select throws_ok(
  $$ insert into workforce.recipes (tenant_id, title_ja, status)
       values ('7a000000-0000-0000-0000-00000000000a', 'Bad Status Recipe', 'deleted') $$,
  '23514',
  'new row for relation "recipes" violates check constraint "recipes_status_check"',
  'workforce.recipes.status check violated'
);

-- --- Composite-FK cross-tenant guard ------------------------------------------
-- A recipe_ingredients row whose tenant_id is Tenant A but whose recipe_id
-- points at Tenant B's recipe must be rejected by the composite FK.
select throws_ok(
  $$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja)
       values ('7a000000-0000-0000-0000-00000000000a',
               '7b100000-0000-0000-0000-000000000001', 'Cross-tenant ingredient') $$,
  '23503',
  'insert or update on table "recipe_ingredients" violates foreign key constraint "recipe_ingredients_tenant_id_recipe_id_fkey"',
  'composite FK rejects a recipe_ingredients row whose tenant_id does not match its recipe''s tenant'
);

-- Same-tenant insert succeeds (sanity check that the composite FK isn't
-- simply broken/over-rejecting).
select lives_ok(
  $$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja)
       values ('7a000000-0000-0000-0000-00000000000a',
               '7a100000-0000-0000-0000-000000000001', 'Same-tenant ingredient') $$,
  'composite FK allows a recipe_ingredients row whose tenant_id matches its recipe''s tenant'
);

-- --- Composite-FK cross-tenant guard: recipes.location_id --------------------
-- A recipe's location_id, if set, must belong to the same tenant. Requires
-- core.locations to have a unique(tenant_id, id) constraint (added by this
-- migration) so recipes can carry a composite FK on (tenant_id, location_id).
insert into core.locations (id, tenant_id, name) values
  ('7a200000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a', 'Tenant A Loc 1'),
  ('7b200000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-00000000000b', 'Tenant B Loc 1');

select throws_ok(
  $$ insert into workforce.recipes (tenant_id, title_ja, location_id)
       values ('7a000000-0000-0000-0000-00000000000a', 'Cross-tenant location recipe',
               '7b200000-0000-0000-0000-000000000001') $$,
  '23503',
  'insert or update on table "recipes" violates foreign key constraint "recipes_location_tenant_fkey"',
  'composite FK rejects a recipes row whose tenant_id does not match its location''s tenant'
);

-- Same-tenant location assignment succeeds (sanity check, not over-rejecting).
select lives_ok(
  $$ insert into workforce.recipes (tenant_id, title_ja, location_id)
       values ('7a000000-0000-0000-0000-00000000000a', 'Same-tenant location recipe',
               '7a200000-0000-0000-0000-000000000001') $$,
  'composite FK allows a recipes row whose tenant_id matches its location''s tenant'
);

-- Deleting a location still referenced by a recipe's location_id is blocked
-- (NO ACTION), not silently nulled -- documents the deliberate departure from
-- a plain single-column `on delete set null` FK (see 0021's comment: a
-- composite ON DELETE SET NULL would null tenant_id too, which must never
-- happen).
select throws_ok(
  $$ delete from core.locations where id = '7a200000-0000-0000-0000-000000000001' $$,
  '23503',
  'update or delete on table "locations" violates foreign key constraint "recipes_location_tenant_fkey" on table "recipes"',
  'deleting a location still referenced by a recipe''s location_id is blocked (NO ACTION), not silently nulled'
);

select * from finish();
rollback;
