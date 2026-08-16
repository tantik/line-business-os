-- ============================================================================
-- DB test: Workforce read-only API facade (Phase 1L-3, migration
--          0023_workforce_api_facade.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the facade added by 0023_workforce_api_facade.sql:
--   * all 7 views exist, are security_invoker, and expose exactly the
--     approved column allow-list (semantic id aliases, no PII, no user ids);
--   * api schema still contains no SECURITY DEFINER function;
--   * anon is fully denied (no SELECT on any of the 7 views, no grant of any
--     kind on workforce);
--   * authenticated has SELECT-only on the 7 views and SELECT-only on
--     exactly the 6 named workforce base tables (as of this facade, 0023;
--     Workforce Cafe v0.1 Slice 1A, 0024-0029, later added its own separate,
--     documented INSERT/UPDATE write-grant foundation on employees plus 5
--     new tables -- asserted here as an intentional widening, not leakage);
--   * behaviorally: self-profile scoping, staff-directory tenant/location
--     scoping, cross-tenant denial, published-vs-draft/archived recipe
--     visibility, location-scoped recipe visibility, and child-row
--     visibility mirroring the parent recipe -- all exercised through the
--     `api` views themselves, not the base tables.
--
-- pgTAP runs as the superuser test role. To exercise the security_invoker
-- views under RLS we hop into the `authenticated` role inside SECURITY
-- INVOKER helper functions, exactly as supabase/tests/0005_api_facade.sql and
-- supabase/tests/0008_workforce_staff_recipes_rls.sql already do: SET LOCAL
-- ROLE reverts on return, so every pgTAP assertion call still runs as the
-- superuser.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai, api;

select no_plan();

-- ============================================================================
-- Section 1: role-hop helpers (SET LOCAL ROLE reverts when the helper
-- returns -- see supabase/tests/0008_workforce_staff_recipes_rls.sql for the
-- same pattern and rationale).
-- ============================================================================

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

create function pg_temp.as_auth_text(p_sub text, p_sql text)
returns text
language plpgsql
as $$
declare s text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into s;
  return s;
end;
$$;

-- ============================================================================
-- Section 2: fixtures (inserted as superuser; bypasses RLS)
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('9a000000-0000-0000-0000-00000000000a', 'pgtap-1l3-tenant-a', 'pgTAP 1L-3 Tenant A'),
  ('9b000000-0000-0000-0000-00000000000b', 'pgtap-1l3-tenant-b', 'pgTAP 1L-3 Tenant B');

insert into core.locations (id, tenant_id, name) values
  ('9a200000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000000a', 'Tenant A Location 1'),
  ('9a200000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-00000000000a', 'Tenant A Location 2');

insert into core.users (id, display_name) values
  ('9a900000-0000-0000-0000-000000000001', 'Self (own profile only)'),
  ('9a900000-0000-0000-0000-000000000002', 'Manager (Location 1 only)'),
  ('9a900000-0000-0000-0000-000000000003', 'Owner (tenant-wide)'),
  ('9a900000-0000-0000-0000-000000000004', 'Reader (Location 1, recipe.read only)'),
  ('9a900000-0000-0000-0000-000000000005', 'Reader (Location 2, recipe.read only)'),
  ('9b900000-0000-0000-0000-000000000001', 'Tenant B owner (tenant-wide)');

-- Role assignments (system roles: 003 tenant_owner, 005 manager, 006 employee).
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9a000000-0000-0000-0000-00000000000a', '9a900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9a200000-0000-0000-0000-000000000001'),
  ('9a000000-0000-0000-0000-00000000000a', '9a900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '9a200000-0000-0000-0000-000000000001'),
  ('9a000000-0000-0000-0000-00000000000a', '9a900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000003', null),
  ('9a000000-0000-0000-0000-00000000000a', '9a900000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000006', '9a200000-0000-0000-0000-000000000001'),
  ('9a000000-0000-0000-0000-00000000000a', '9a900000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000006', '9a200000-0000-0000-0000-000000000002'),
  ('9b000000-0000-0000-0000-00000000000b', '9b900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003', null);

-- Employees ------------------------------------------------------------------
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('9a300000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000000a',
   '9a200000-0000-0000-0000-000000000001', '9a900000-0000-0000-0000-000000000001', '\x00'),
  ('9a300000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-00000000000a',
   '9a200000-0000-0000-0000-000000000001', null, '\x00'),
  ('9a300000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-00000000000a',
   '9a200000-0000-0000-0000-000000000002', null, '\x00'),
  ('9b300000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-00000000000b',
   null, null, '\x00');

-- Recipe category --------------------------------------------------------------
insert into workforce.recipe_categories (id, tenant_id, label_ja, is_active) values
  ('9a400000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000000a', 'Drinks', true);

-- Recipes -----------------------------------------------------------------------
insert into workforce.recipes (id, tenant_id, location_id, title_ja, status) values
  ('9a500000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000000a', null, 'Published Tenant-wide', 'published'),
  ('9a500000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-00000000000a', null, 'Draft Tenant-wide', 'draft'),
  ('9a500000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-00000000000a', null, 'Archived Tenant-wide', 'archived'),
  ('9a500000-0000-0000-0000-000000000004', '9a000000-0000-0000-0000-00000000000a',
   '9a200000-0000-0000-0000-000000000001', 'Published Location 1', 'published');

-- Recipe child rows ---------------------------------------------------------
insert into workforce.recipe_ingredients (id, tenant_id, recipe_id, label_ja) values
  ('9a600000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000000a',
   '9a500000-0000-0000-0000-000000000002', 'Ingredient of draft recipe'),
  ('9a600000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-00000000000a',
   '9a500000-0000-0000-0000-000000000001', 'Ingredient of published recipe');

-- ============================================================================
-- Section 3: structural -- schema objects exist
-- ============================================================================

select has_view('api', 'workforce_my_staff_profile', 'api.workforce_my_staff_profile view exists');
select has_view('api', 'workforce_staff_directory', 'api.workforce_staff_directory view exists');
select has_view('api', 'workforce_recipe_categories', 'api.workforce_recipe_categories view exists');
select has_view('api', 'workforce_recipes', 'api.workforce_recipes view exists');
select has_view('api', 'workforce_recipe_ingredients', 'api.workforce_recipe_ingredients view exists');
select has_view('api', 'workforce_recipe_steps', 'api.workforce_recipe_steps view exists');
select has_view('api', 'workforce_recipe_notes', 'api.workforce_recipe_notes view exists');

-- ============================================================================
-- Section 4: structural -- exact column allow-lists
-- ============================================================================

select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_my_staff_profile'),
  array['staff_id', 'tenant_id', 'location_id', 'position_label', 'employment_type', 'is_active', 'created_at', 'hourly_wage_yen']::text[],
  'api.workforce_my_staff_profile exposes only approved columns'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_staff_directory'),
  array['staff_id', 'tenant_id', 'location_id', 'position_label', 'employment_type', 'is_active', 'created_at']::text[],
  'api.workforce_staff_directory exposes only approved columns'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_recipe_categories'),
  array['category_id', 'tenant_id', 'label_ja', 'label_en', 'sort_order', 'is_active']::text[],
  'api.workforce_recipe_categories exposes only approved columns'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_recipes'),
  array[
    'recipe_id', 'tenant_id', 'location_id', 'recipe_category_id',
    'title_ja', 'title_en', 'description_ja', 'description_en',
    'is_popular', 'status', 'created_at', 'updated_at', 'content_kind', 'media_path',
    'original_language'
  ]::text[],
  'api.workforce_recipes exposes only approved columns'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_recipe_ingredients'),
  array['ingredient_id', 'tenant_id', 'recipe_id', 'label_ja', 'label_en', 'sort_order']::text[],
  'api.workforce_recipe_ingredients exposes only approved columns'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_recipe_steps'),
  array['step_id', 'tenant_id', 'recipe_id', 'step_number', 'instruction_ja', 'instruction_en']::text[],
  'api.workforce_recipe_steps exposes only approved columns'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_recipe_notes'),
  array['note_id', 'tenant_id', 'recipe_id', 'title_ja', 'title_en', 'body_ja', 'body_en']::text[],
  'api.workforce_recipe_notes exposes only approved columns'
);

-- No forbidden columns (PII, user ids, author ids, raw `id`) on any of the 7
-- new views.
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'api'
      and table_name in (
        'workforce_my_staff_profile', 'workforce_staff_directory',
        'workforce_recipe_categories', 'workforce_recipes',
        'workforce_recipe_ingredients', 'workforce_recipe_steps',
        'workforce_recipe_notes'
      )
      and column_name in (
        'id', 'user_id', 'name_encrypted', 'name_hash',
        'created_by', 'updated_by'
      )),
  0,
  'workforce api views expose no raw id, user_id, name ciphertext/hash, or author ids'
);

-- ============================================================================
-- Section 5: structural -- security_invoker + no SECURITY DEFINER
-- ============================================================================

select ok(
  (select bool_and(
     exists (
       select 1
       from pg_class c2
       join pg_namespace n2 on n2.oid = c2.relnamespace
       cross join lateral unnest(c2.reloptions) o(opt)
       where n2.nspname = 'api' and c2.relname = v.viewname
         and lower(o.opt) = 'security_invoker=true'
     )
   )
   from (values
     ('workforce_my_staff_profile'),
     ('workforce_staff_directory'),
     ('workforce_recipe_categories'),
     ('workforce_recipes'),
     ('workforce_recipe_ingredients'),
     ('workforce_recipe_steps'),
     ('workforce_recipe_notes')
   ) as v(viewname)),
  'all 7 workforce api views are security_invoker'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.prosecdef),
  0,
  'api schema still contains no SECURITY DEFINER function after 0023'
);

-- ============================================================================
-- Section 6: grants -- anon fully denied
-- ============================================================================

select ok(
  not has_table_privilege('anon', 'api.workforce_my_staff_profile', 'SELECT'),
  'anon cannot SELECT api.workforce_my_staff_profile'
);
select ok(
  not has_table_privilege('anon', 'api.workforce_staff_directory', 'SELECT'),
  'anon cannot SELECT api.workforce_staff_directory'
);
select ok(
  not has_table_privilege('anon', 'api.workforce_recipe_categories', 'SELECT'),
  'anon cannot SELECT api.workforce_recipe_categories'
);
select ok(
  not has_table_privilege('anon', 'api.workforce_recipes', 'SELECT'),
  'anon cannot SELECT api.workforce_recipes'
);
select ok(
  not has_table_privilege('anon', 'api.workforce_recipe_ingredients', 'SELECT'),
  'anon cannot SELECT api.workforce_recipe_ingredients'
);
select ok(
  not has_table_privilege('anon', 'api.workforce_recipe_steps', 'SELECT'),
  'anon cannot SELECT api.workforce_recipe_steps'
);
select ok(
  not has_table_privilege('anon', 'api.workforce_recipe_notes', 'SELECT'),
  'anon cannot SELECT api.workforce_recipe_notes'
);

select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'workforce'),
  0,
  'anon has no table grants on workforce'
);

-- ============================================================================
-- Section 7: grants -- authenticated has SELECT-only on the 7 views
-- ============================================================================

select ok(
  has_table_privilege('authenticated', 'api.workforce_my_staff_profile', 'SELECT'),
  'authenticated can SELECT api.workforce_my_staff_profile'
);
select ok(
  has_table_privilege('authenticated', 'api.workforce_staff_directory', 'SELECT'),
  'authenticated can SELECT api.workforce_staff_directory'
);
select ok(
  has_table_privilege('authenticated', 'api.workforce_recipe_categories', 'SELECT'),
  'authenticated can SELECT api.workforce_recipe_categories'
);
select ok(
  has_table_privilege('authenticated', 'api.workforce_recipes', 'SELECT'),
  'authenticated can SELECT api.workforce_recipes'
);
select ok(
  has_table_privilege('authenticated', 'api.workforce_recipe_ingredients', 'SELECT'),
  'authenticated can SELECT api.workforce_recipe_ingredients'
);
select ok(
  has_table_privilege('authenticated', 'api.workforce_recipe_steps', 'SELECT'),
  'authenticated can SELECT api.workforce_recipe_steps'
);
select ok(
  has_table_privilege('authenticated', 'api.workforce_recipe_notes', 'SELECT'),
  'authenticated can SELECT api.workforce_recipe_notes'
);

select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'api'
      and table_name in (
        'workforce_my_staff_profile', 'workforce_staff_directory',
        'workforce_recipe_categories', 'workforce_recipes',
        'workforce_recipe_ingredients', 'workforce_recipe_steps',
        'workforce_recipe_notes'
      )
      and privilege_type <> 'SELECT'),
  0,
  'authenticated has no INSERT/UPDATE/DELETE on any of the 7 workforce api views'
);

-- ============================================================================
-- Section 8: grants -- authenticated SELECT-only on exactly the 6 base tables
--            (as of this facade, 0023) -- Workforce Cafe v0.1 Slice 1A
--            (0024-0029, later still) added its own separate write-grant
--            foundation on employees plus 5 new tables; that is a deliberate,
--            documented widening (RLS remains the real boundary), asserted
--            here rather than treated as leakage.
-- ============================================================================

select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name in (
        'employees', 'recipe_categories', 'recipes',
        'recipe_ingredients', 'recipe_steps', 'recipe_notes'
      )
      and privilege_type = 'SELECT'),
  6,
  'authenticated has SELECT on exactly the 6 required workforce base tables'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name in (
        'recipe_categories', 'recipes',
        'recipe_ingredients', 'recipe_steps', 'recipe_notes'
      )
      and privilege_type <> 'SELECT'),
  11,
  'authenticated has exactly the 11 base-table privileges required by the 0051 SECURITY INVOKER recipe RPC'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name = 'employees'
      and privilege_type not in ('SELECT', 'INSERT', 'UPDATE')),
  0,
  'authenticated has no DELETE on workforce.employees (Slice 1A added INSERT/UPDATE only)'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name not in (
        'employees', 'recipe_categories', 'recipes',
        'recipe_ingredients', 'recipe_steps', 'recipe_notes',
        'shift_types', 'shifts', 'shift_requests', 'attendance', 'employee_line_links',
        -- 0034_workforce_schedule_settings.sql: a later, separate migration.
        'schedule_settings', 'shift_exchanges',
        -- 0064_workforce_employee_invitations.sql: a later, separate migration.
        'employee_invitations'
      )),
  0,
  'authenticated has no grants on any other workforce table (e.g. leave_requests)'
);

-- ============================================================================
-- Section 9: behavioral -- self staff profile
-- ============================================================================

select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000001',
    'select count(*)::int from api.workforce_my_staff_profile'),
  1,
  'Self sees exactly their own row via api.workforce_my_staff_profile'
);
select is(
  pg_temp.as_auth_text('9a900000-0000-0000-0000-000000000001',
    'select staff_id::text from api.workforce_my_staff_profile'),
  '9a300000-0000-0000-0000-000000000001',
  'Self''s own staff_id matches their employees row'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000002',
    'select count(*)::int from api.workforce_my_staff_profile'),
  0,
  'A user with no matching employees row sees zero rows (not an error) via the self-profile view'
);

-- ============================================================================
-- Section 10: behavioral -- staff directory tenant/location scoping
-- ============================================================================

select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000001',
    'select count(*)::int from api.workforce_staff_directory'),
  0,
  'Self (no staff.read/staff.manage) sees zero rows via the staff directory'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000002',
    'select count(*)::int from api.workforce_staff_directory'),
  2,
  'Manager scoped to Location 1 sees exactly the 2 Location 1 employees via the directory'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000002',
    $q$ select count(*)::int from api.workforce_staff_directory
          where staff_id = '9a300000-0000-0000-0000-000000000003' $q$),
  0,
  'Manager scoped to Location 1 cannot see the Location 2 employee via the directory'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000003',
    'select count(*)::int from api.workforce_staff_directory'),
  3,
  'Tenant-wide Owner sees all 3 Tenant A employees via the directory, across both locations'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000003',
    $q$ select count(*)::int from api.workforce_staff_directory
          where tenant_id = '9b000000-0000-0000-0000-00000000000b' $q$),
  0,
  'Tenant A Owner cannot see Tenant B employees via the directory (cross-tenant denial)'
);

-- ============================================================================
-- Section 11: behavioral -- recipe published/draft/archived visibility
-- ============================================================================

select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000004',
    $q$ select count(*)::int from api.workforce_recipes
          where recipe_id = '9a500000-0000-0000-0000-000000000001' $q$),
  1,
  'recipe.read (Location 1 reader) sees the published tenant-wide recipe'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000004',
    $q$ select count(*)::int from api.workforce_recipes
          where recipe_id = '9a500000-0000-0000-0000-000000000002' $q$),
  0,
  'recipe.read does NOT see the draft tenant-wide recipe'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000004',
    $q$ select count(*)::int from api.workforce_recipes
          where recipe_id = '9a500000-0000-0000-0000-000000000003' $q$),
  0,
  'recipe.read does NOT see the archived tenant-wide recipe'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000003',
    $q$ select count(*)::int from api.workforce_recipes
          where recipe_id in (
            '9a500000-0000-0000-0000-000000000001',
            '9a500000-0000-0000-0000-000000000002',
            '9a500000-0000-0000-0000-000000000003',
            '9a500000-0000-0000-0000-000000000004'
          ) $q$),
  4,
  'recipe.manage (tenant-wide Owner) sees all 4 recipes: published, draft, archived, and location-specific'
);

-- ============================================================================
-- Section 12: behavioral -- location-scoped recipe visibility
-- ============================================================================

select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000004',
    $q$ select count(*)::int from api.workforce_recipes
          where recipe_id = '9a500000-0000-0000-0000-000000000004' $q$),
  1,
  'Reader at Location 1 sees the published Location 1 recipe'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000005',
    $q$ select count(*)::int from api.workforce_recipes
          where recipe_id = '9a500000-0000-0000-0000-000000000004' $q$),
  0,
  'Reader at Location 2 does NOT see the published Location 1 recipe'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000005',
    $q$ select count(*)::int from api.workforce_recipes
          where recipe_id = '9a500000-0000-0000-0000-000000000001' $q$),
  1,
  'Reader at Location 2 still sees the published tenant-wide recipe'
);

-- Cross-tenant denial on recipes.
select is(
  pg_temp.as_auth_count('9b900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_recipes
          where tenant_id = '9a000000-0000-0000-0000-00000000000a' $q$),
  0,
  'Tenant B owner cannot see any Tenant A recipe via the facade'
);

-- ============================================================================
-- Section 13: behavioral -- recipe child views mirror parent visibility
-- ============================================================================

select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000004',
    $q$ select count(*)::int from api.workforce_recipe_ingredients
          where ingredient_id = '9a600000-0000-0000-0000-000000000002' $q$),
  1,
  'recipe.read holder sees the ingredient of a published (visible) recipe'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000004',
    $q$ select count(*)::int from api.workforce_recipe_ingredients
          where ingredient_id = '9a600000-0000-0000-0000-000000000001' $q$),
  0,
  'recipe.read holder does NOT see the ingredient of a draft (invisible) recipe'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000003',
    $q$ select count(*)::int from api.workforce_recipe_ingredients
          where ingredient_id in (
            '9a600000-0000-0000-0000-000000000001',
            '9a600000-0000-0000-0000-000000000002'
          ) $q$),
  2,
  'recipe.manage holder (tenant-wide Owner) sees ingredients of both draft and published recipes'
);

-- ============================================================================
-- Section 14: narrow recipe/instruction classification write (0033)
-- ============================================================================

select ok(
  has_column_privilege('authenticated', 'api.workforce_recipes', 'content_kind', 'UPDATE'),
  'authenticated receives UPDATE only for api.workforce_recipes.content_kind'
);
select ok(
  not has_column_privilege('authenticated', 'api.workforce_recipes', 'title_ja', 'UPDATE'),
  'authenticated cannot UPDATE api.workforce_recipes.title_ja'
);
select ok(
  not has_column_privilege('authenticated', 'api.workforce_recipes', 'tenant_id', 'UPDATE'),
  'authenticated cannot UPDATE api.workforce_recipes.tenant_id'
);

select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000003',
    $q$ with changed as (
          update api.workforce_recipes set content_kind = 'instruction'
           where recipe_id = '9a500000-0000-0000-0000-000000000002'
          returning 1
        ) select count(*)::int from changed $q$),
  1,
  'recipe.manage holder can classify a visible tenant recipe as instruction'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000004',
    $q$ with changed as (
          update api.workforce_recipes set content_kind = 'instruction'
           where recipe_id = '9a500000-0000-0000-0000-000000000001'
          returning 1
        ) select count(*)::int from changed $q$),
  0,
  'recipe.read-only holder cannot classify a recipe'
);
select is(
  pg_temp.as_auth_count('9b900000-0000-0000-0000-000000000001',
    $q$ with changed as (
          update api.workforce_recipes set content_kind = 'instruction'
           where recipe_id = '9a500000-0000-0000-0000-000000000002'
          returning 1
        ) select count(*)::int from changed $q$),
  0,
  'another tenant owner cannot classify tenant A recipe'
);

-- ============================================================================
-- Section 15: behavioral -- anon / no-JWT denial (fail-closed) on all 7 views
-- ============================================================================

select is(
  pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_my_staff_profile'),
  0, 'authenticated with no JWT sub sees zero rows via workforce_my_staff_profile'
);
select is(
  pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_staff_directory'),
  0, 'authenticated with no JWT sub sees zero rows via workforce_staff_directory'
);
select is(
  pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_recipe_categories'),
  0, 'authenticated with no JWT sub sees zero rows via workforce_recipe_categories'
);
select is(
  pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_recipes'),
  0, 'authenticated with no JWT sub sees zero rows via workforce_recipes'
);
select is(
  pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_recipe_ingredients'),
  0, 'authenticated with no JWT sub sees zero rows via workforce_recipe_ingredients'
);
select is(
  pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_recipe_steps'),
  0, 'authenticated with no JWT sub sees zero rows via workforce_recipe_steps'
);
select is(
  pg_temp.as_auth_count('', 'select count(*)::int from api.workforce_recipe_notes'),
  0, 'authenticated with no JWT sub sees zero rows via workforce_recipe_notes'
);

select * from finish();
rollback;
