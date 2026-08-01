-- ============================================================================
-- DB test: Workforce staff + recipes RLS policies (Phase 1L-2, migration
--          0022_workforce_staff_recipes_rls_policies.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- pgTAP tests, enabled inside a rolled-back transaction (see 0001's header).
--
-- IMPORTANT -- test-only grants: through 0022, `workforce` had ZERO table
-- grants to anon/authenticated (0013's posture). 0023_workforce_api_facade.sql
-- (Phase 1L-3) later added persistent `authenticated`-only SELECT grants on
-- 6 workforce tables for its api facade; `anon` remains at zero. Workforce
-- Cafe v0.1 Slice 1A (0024-0029, later still) added further persistent
-- `authenticated` grants on top of that: INSERT/UPDATE on employees, and
-- SELECT+INSERT+UPDATE on shift_types/shifts/shift_requests/attendance/
-- employee_line_links. Section 1 below asserts that combined baseline FIRST
-- (anon still zero, authenticated exactly the 0023 SELECTs plus the Slice 1A
-- grants and nothing wider), before anything else in this file grants more.
-- A table with zero GRANTs raises a permission-denied error for ANY role
-- attempting to touch it, before RLS is even evaluated -- so exercising the
-- RLS *policies* themselves on the recipe tables beyond what 0023 already
-- covers still requires `authenticated` to hold ordinary table privileges for
-- the remaining commands. Section 2 then grants select/insert/update/delete
-- on the six recipe/employees tables to `authenticated` for the rest of this
-- file only -- this is DDL inside the same transaction that `rollback;`
-- undoes at the very end, so it never persists. Every visibility/mutation
-- assertion after Section 2 is scoped by explicit id (not a blanket table
-- count), so earlier mutations in this file can never leak into a later
-- assertion's result.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai;

select no_plan();

-- ============================================================================
-- Section 1: baseline invariants (must run before any grant in this file)
-- ============================================================================

-- anon: still zero grants on workforce (0023_workforce_api_facade.sql's
-- authenticated-only read facade does not touch anon's posture).
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'workforce'),
  0,
  'baseline: zero anon table grants on workforce (still holds after 0022/0023)'
);

-- authenticated: exactly the 6 persistent SELECT grants added by
-- 0023_workforce_api_facade.sql, before this file's own Section 2 adds its
-- temporary (rolled-back) grants -- nothing wider persists beyond Slice 1A's
-- own separate write-grant foundation (asserted below).
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
  'baseline: authenticated has SELECT on exactly the 6 workforce facade tables (0023)'
);

-- authenticated: Slice 1A's (0024-0029) write-grant foundation -- employees
-- gains INSERT/UPDATE (its SELECT is already counted above), and 5 new
-- tables each gain SELECT+INSERT+UPDATE.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name = 'employees'
      and privilege_type in ('INSERT', 'UPDATE')),
  2,
  'baseline: authenticated has INSERT+UPDATE on workforce.employees (Slice 1A, 0024)'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name in ('shift_types', 'shifts', 'shift_requests', 'attendance', 'employee_line_links')
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE')),
  15,
  'baseline: authenticated has exactly SELECT+INSERT+UPDATE on each of the 5 Slice 1A workforce tables'
);

select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and not (
        (
          table_name in (
            'employees', 'recipe_categories', 'recipes',
            'recipe_ingredients', 'recipe_steps', 'recipe_notes'
          )
          and privilege_type = 'SELECT'
        )
        or (
          table_name = 'employees'
          and privilege_type in ('INSERT', 'UPDATE')
        )
        or (
          table_name in ('shift_types', 'shifts', 'shift_requests', 'attendance', 'employee_line_links', 'shift_exchanges')
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
        )
        or (
          -- 0034_workforce_schedule_settings.sql: a later, separate
          -- migration than this file's own 0022, added SELECT+INSERT+UPDATE
          -- on this table.
          table_name = 'schedule_settings'
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
        )
        or (table_name = 'recipes' and privilege_type in ('INSERT', 'UPDATE'))
        or (table_name in ('recipe_ingredients', 'recipe_steps', 'recipe_notes') and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))
      )),
  0,
  'baseline: authenticated has no workforce grants beyond the 0023 SELECTs + Slice 1A write-grant foundation + 0034''s schedule_settings grant, before this file''s own test-only grants'
);

-- --- old employees policies are gone ----------------------------------------
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'employees'
      and policyname in ('wf_employees_read', 'wf_employees_write')),
  0,
  'legacy wf_employees_read/wf_employees_write policies were dropped'
);

-- --- new employees policies exist, and only these three ---------------------
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'employees'
      and policyname = 'wf_employees_staff_read'),
  1, 'wf_employees_staff_read policy exists'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'employees'
      and policyname = 'wf_employees_self_read'),
  1, 'wf_employees_self_read policy exists'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'employees'
      and policyname = 'wf_employees_staff_manage'),
  1, 'wf_employees_staff_manage policy exists'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'employees'),
  3, 'workforce.employees carries exactly the 3 new policies (no leftovers)'
);

-- --- core.has_permission_in_tenant exists with the hardened EXECUTE posture -
select has_function(
  'core', 'has_permission_in_tenant', array['uuid', 'text'],
  'core.has_permission_in_tenant(uuid, text) exists'
);
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) acl
    where n.nspname = 'core'
      and p.proname = 'has_permission_in_tenant'
      and acl.grantee = 0 -- PUBLIC
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no EXECUTE on core.has_permission_in_tenant(uuid, text)'
);
select ok(
  not has_function_privilege('anon', 'core.has_permission_in_tenant(uuid, text)', 'EXECUTE'),
  'anon cannot EXECUTE core.has_permission_in_tenant(uuid, text)'
);
select ok(
  has_function_privilege('authenticated', 'core.has_permission_in_tenant(uuid, text)', 'EXECUTE'),
  'authenticated can EXECUTE core.has_permission_in_tenant(uuid, text)'
);

-- --- workforce.can_manage_recipe exists, not security definer --------------
select has_function(
  'workforce', 'can_manage_recipe', array['uuid'],
  'workforce.can_manage_recipe(uuid) exists'
);
select is(
  (select p.prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'workforce' and p.proname = 'can_manage_recipe'),
  false,
  'workforce.can_manage_recipe(uuid) is NOT security definer'
);
select ok(
  has_function_privilege('authenticated', 'workforce.can_manage_recipe(uuid)', 'EXECUTE'),
  'authenticated can EXECUTE workforce.can_manage_recipe(uuid)'
);
select ok(
  not has_function_privilege('anon', 'workforce.can_manage_recipe(uuid)', 'EXECUTE'),
  'anon cannot EXECUTE workforce.can_manage_recipe(uuid)'
);

-- --- recipe_categories: exactly select/insert/update, no delete -------------
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'recipe_categories' and cmd = 'DELETE'),
  0, 'no DELETE policy on workforce.recipe_categories'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'recipe_categories'),
  3, 'workforce.recipe_categories carries exactly 3 policies (select/insert/update)'
);

-- --- recipes: exactly 2 select + insert + update, no delete -----------------
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'recipes' and cmd = 'DELETE'),
  0, 'no DELETE policy on workforce.recipes'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'recipes'),
  4, 'workforce.recipes carries exactly 4 policies (2x select + insert + update)'
);

-- --- child tables: select/insert/update/delete on each of the 3 ------------
select ok(
  not exists (
    select 1 from pg_policies
     where schemaname = 'workforce'
       and tablename in ('recipe_ingredients', 'recipe_steps', 'recipe_notes')
     group by tablename
    having count(*) <> 4
  ),
  'each recipe child table carries exactly 4 policies (select/insert/update/delete)'
);

-- ============================================================================
-- Section 2: test-only grants (rolled back with the rest of this transaction)
-- ============================================================================

grant usage on schema workforce to authenticated;
grant select, insert, update, delete on
  workforce.employees,
  workforce.recipe_categories,
  workforce.recipes,
  workforce.recipe_ingredients,
  workforce.recipe_steps,
  workforce.recipe_notes
to authenticated;

-- ============================================================================
-- Section 3: role-hop helpers (SET LOCAL ROLE reverts when the helper
-- returns -- see supabase/tests/0003_authenticated_access.sql for the same
-- pattern and rationale).
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

create function pg_temp.as_auth_bool(p_sub text, p_sql text)
returns boolean
language plpgsql
as $$
declare b boolean;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into b;
  return b;
end;
$$;

-- Executes an INSERT/UPDATE/DELETE as `authenticated` for the given sub and
-- returns the affected row count (0 = RLS silently excluded every row, which
-- is how UPDATE/DELETE denial shows up -- there is no matching row to act on,
-- not an error).
create function pg_temp.as_auth_rowcount(p_sub text, p_sql text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Executes a statement as `authenticated` for the given sub and returns true
-- if it raised an error (e.g. an INSERT whose WITH CHECK fails always raises,
-- since there is no pre-existing row set to filter the way UPDATE/DELETE
-- have), false if it completed without error. The EXCEPTION block gives this
-- one an implicit subtransaction, so the role hop and any partial effect of
-- p_sql are both rolled back on the error path.
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

-- ============================================================================
-- Section 4: fixtures (inserted as superuser; bypasses RLS)
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('8a000000-0000-0000-0000-00000000000a', 'pgtap-1l2-tenant-a', 'pgTAP 1L-2 Tenant A'),
  ('8b000000-0000-0000-0000-00000000000b', 'pgtap-1l2-tenant-b', 'pgTAP 1L-2 Tenant B');

insert into core.locations (id, tenant_id, name) values
  ('8a200000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000000a', 'Tenant A Location A'),
  ('8a200000-0000-0000-0000-000000000002', '8a000000-0000-0000-0000-00000000000a', 'Tenant A Location B');

insert into core.users (id, display_name) values
  ('8a900000-0000-0000-0000-000000000001', 'Employee (self-read)'),
  ('8a900000-0000-0000-0000-000000000002', 'Manager (Location A only)'),
  ('8a900000-0000-0000-0000-000000000003', 'Owner (tenant-wide)'),
  ('8a900000-0000-0000-0000-000000000004', 'Admin (tenant-wide)'),
  ('8a900000-0000-0000-0000-000000000005', 'Manager (tenant-wide)'),
  ('8a900000-0000-0000-0000-000000000006', 'Reader (Location A only)'),
  ('8a900000-0000-0000-0000-000000000007', 'Reader (Location B only)'),
  ('8a900000-0000-0000-0000-000000000008', 'Recipe manager, no publish (tenant-wide)'),
  ('8b900000-0000-0000-0000-000000000001', 'Tenant B owner (tenant-wide)');

-- Custom tenant-scoped role: recipe.manage only, no staff.*, no
-- recipe.read/publish. Needed to isolate the "manage alone cannot publish"
-- behavior from the system manager role (which already holds publish too).
insert into core.roles (id, tenant_id, key, name, is_system) values
  ('8a700000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000000a',
   'qa_recipe_manage_only', 'QA Recipe Manage Only', false);
insert into core.role_permissions (role_id, permission_key) values
  ('8a700000-0000-0000-0000-000000000001', 'workforce.recipe.manage');

-- Role assignments -----------------------------------------------------------
-- System roles: 003 tenant_owner, 004 tenant_admin, 005 manager, 006 employee.
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  -- Manager scoped to Location A only.
  ('8a000000-0000-0000-0000-00000000000a', '8a900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '8a200000-0000-0000-0000-000000000001'),
  -- Owner/Admin/Manager, tenant-wide (location_id null).
  ('8a000000-0000-0000-0000-00000000000a', '8a900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000003', null),
  ('8a000000-0000-0000-0000-00000000000a', '8a900000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000004', null),
  ('8a000000-0000-0000-0000-00000000000a', '8a900000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000005', null),
  -- Employee (recipe.read only), scoped to Location A / Location B respectively.
  ('8a000000-0000-0000-0000-00000000000a', '8a900000-0000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000006', '8a200000-0000-0000-0000-000000000001'),
  ('8a000000-0000-0000-0000-00000000000a', '8a900000-0000-0000-0000-000000000007',
   '00000000-0000-0000-0000-000000000006', '8a200000-0000-0000-0000-000000000002'),
  -- Custom recipe-manage-only role, tenant-wide.
  ('8a000000-0000-0000-0000-00000000000a', '8a900000-0000-0000-0000-000000000008',
   '8a700000-0000-0000-0000-000000000001', null),
  -- Tenant B owner, tenant-wide, in Tenant B.
  ('8b000000-0000-0000-0000-00000000000b', '8b900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003', null);

-- Employees -------------------------------------------------------------------
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('8a300000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000000a',
   '8a200000-0000-0000-0000-000000000001', '8a900000-0000-0000-0000-000000000001', '\x00'),
  ('8a300000-0000-0000-0000-000000000002', '8a000000-0000-0000-0000-00000000000a',
   '8a200000-0000-0000-0000-000000000001', null, '\x00'),
  ('8a300000-0000-0000-0000-000000000003', '8a000000-0000-0000-0000-00000000000a',
   '8a200000-0000-0000-0000-000000000002', null, '\x00'),
  ('8b300000-0000-0000-0000-000000000001', '8b000000-0000-0000-0000-00000000000b',
   null, null, '\x00');

-- Recipe category --------------------------------------------------------------
insert into workforce.recipe_categories (id, tenant_id, label_ja, is_active) values
  ('8a400000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000000a', 'Drinks', true);

-- Recipes -----------------------------------------------------------------------
insert into workforce.recipes (id, tenant_id, location_id, title_ja, status) values
  ('8a500000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000000a', null, 'Published Tenant-wide', 'published'),
  ('8a500000-0000-0000-0000-000000000002', '8a000000-0000-0000-0000-00000000000a', null, 'Draft Tenant-wide', 'draft'),
  ('8a500000-0000-0000-0000-000000000003', '8a000000-0000-0000-0000-00000000000a', null, 'Archived Tenant-wide', 'archived'),
  ('8a500000-0000-0000-0000-000000000004', '8a000000-0000-0000-0000-00000000000a',
   '8a200000-0000-0000-0000-000000000001', 'Published Location A', 'published'),
  ('8a500000-0000-0000-0000-000000000005', '8a000000-0000-0000-0000-00000000000a', null, 'Dedicated publish-mutation target', 'draft');

-- Recipe child rows -------------------------------------------------------------
insert into workforce.recipe_ingredients (id, tenant_id, recipe_id, label_ja) values
  ('8a600000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000000a',
   '8a500000-0000-0000-0000-000000000002', 'Ingredient of draft recipe'),
  ('8a600000-0000-0000-0000-000000000002', '8a000000-0000-0000-0000-00000000000a',
   '8a500000-0000-0000-0000-000000000001', 'Ingredient of published recipe');

-- ============================================================================
-- Section 5: core.has_permission_in_tenant behavior
-- ============================================================================

select ok(
  pg_temp.as_auth_bool('8a900000-0000-0000-0000-000000000005',
    $q$ select core.has_permission_in_tenant(
          '8a000000-0000-0000-0000-00000000000a', 'workforce.staff.read') $q$),
  'has_permission_in_tenant: tenant-wide role assignment resolves to true'
);

select ok(
  pg_temp.as_auth_bool('8a900000-0000-0000-0000-000000000002',
    $q$ select core.has_permission_in_tenant(
          '8a000000-0000-0000-0000-00000000000a', 'workforce.staff.read') $q$),
  'has_permission_in_tenant: location-scoped role assignment ALSO resolves to true (location ignored)'
);

select ok(
  not pg_temp.as_auth_bool('8a900000-0000-0000-0000-000000000002',
    $q$ select core.has_permission_in_tenant(
          '8b000000-0000-0000-0000-00000000000b', 'workforce.staff.read') $q$),
  'has_permission_in_tenant: wrong tenant resolves to false'
);

select ok(
  not pg_temp.as_auth_bool('8a900000-0000-0000-0000-000000000002',
    $q$ select core.has_permission_in_tenant(
          '8a000000-0000-0000-0000-00000000000a', 'workforce.nonexistent.permission') $q$),
  'has_permission_in_tenant: missing/unknown permission resolves to false'
);

-- ============================================================================
-- Section 6: workforce.employees RLS behavior
-- ============================================================================

-- --- self-read ---------------------------------------------------------------
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from workforce.employees $q$),
  1,
  'employee self-read: sees exactly their own employee row (no staff.* permission held)'
);

-- --- cannot self-update --------------------------------------------------------
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000001',
    $q$ update workforce.employees set position_label = 'changed'
          where user_id = '8a900000-0000-0000-0000-000000000001' $q$),
  0,
  'employee self-update: 0 rows affected (self-read grants no write, self has no staff.manage)'
);

-- --- manager scoped to Location A: can read/manage Location A, not Location B
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000002',
    $q$ select count(*)::int from workforce.employees
          where id = '8a300000-0000-0000-0000-000000000002' $q$),
  1,
  'location-A manager can read the Location A employee'
);
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000002',
    $q$ select count(*)::int from workforce.employees
          where id = '8a300000-0000-0000-0000-000000000003' $q$),
  0,
  'location-A manager cannot read the Location B employee'
);
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000002',
    $q$ update workforce.employees set position_label = 'loc-a-update'
          where id = '8a300000-0000-0000-0000-000000000002' $q$),
  1,
  'location-A manager CAN update the Location A employee'
);
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000002',
    $q$ update workforce.employees set position_label = 'loc-b-update'
          where id = '8a300000-0000-0000-0000-000000000003' $q$),
  0,
  'location-A manager CANNOT update the Location B employee (0 rows affected)'
);

-- --- cross-tenant denial -------------------------------------------------------
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000002',
    $q$ select count(*)::int from workforce.employees
          where tenant_id = '8b000000-0000-0000-0000-00000000000b' $q$),
  0,
  'location-A manager (Tenant A) cannot read Tenant B employee rows'
);

-- --- anon / no-JWT denial --------------------------------------------------
select is(
  pg_temp.as_auth_count('',
    $q$ select count(*)::int from workforce.employees $q$),
  0,
  'authenticated with no JWT sub sees no employee rows'
);
select ok(
  not has_table_privilege('anon', 'workforce.employees', 'SELECT'),
  'anon cannot SELECT workforce.employees (no grant, matching the zero-grants baseline)'
);

-- ============================================================================
-- Section 7: workforce.recipe_categories RLS behavior
-- ============================================================================

-- --- select: recipe.read or recipe.manage in tenant -------------------------
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000006', -- reader (recipe.read only)
    $q$ select count(*)::int from workforce.recipe_categories
          where id = '8a400000-0000-0000-0000-000000000001' $q$),
  1,
  'recipe.read holder can see the tenant recipe category'
);
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000008', -- recipe.manage only
    $q$ select count(*)::int from workforce.recipe_categories
          where id = '8a400000-0000-0000-0000-000000000001' $q$),
  1,
  'recipe.manage holder (no recipe.read) can also see the tenant recipe category'
);
select is(
  pg_temp.as_auth_count('8b900000-0000-0000-0000-000000000001', -- tenant B owner
    $q$ select count(*)::int from workforce.recipe_categories
          where id = '8a400000-0000-0000-0000-000000000001' $q$),
  0,
  'a Tenant B user cannot see Tenant A''s recipe category'
);

-- --- insert: recipe.manage required ------------------------------------------
select ok(
  not pg_temp.as_auth_throws('8a900000-0000-0000-0000-000000000008',
    $q$ insert into workforce.recipe_categories (tenant_id, label_ja)
          values ('8a000000-0000-0000-0000-00000000000a', 'Desserts') $q$),
  'recipe.manage holder can insert a new recipe category'
);
select ok(
  pg_temp.as_auth_throws('8a900000-0000-0000-0000-000000000006', -- recipe.read only
    $q$ insert into workforce.recipe_categories (tenant_id, label_ja)
          values ('8a000000-0000-0000-0000-00000000000a', 'Should Fail') $q$),
  'recipe.read-only holder cannot insert a recipe category'
);

-- --- no hard delete, for Owner/Admin/Manager --------------------------------
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000003', -- owner
    $q$ delete from workforce.recipe_categories where id = '8a400000-0000-0000-0000-000000000001' $q$),
  0,
  'Owner cannot hard-delete a recipe category (0 rows affected)'
);
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000004', -- admin
    $q$ delete from workforce.recipe_categories where id = '8a400000-0000-0000-0000-000000000001' $q$),
  0,
  'Admin cannot hard-delete a recipe category (0 rows affected)'
);
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000005', -- manager
    $q$ delete from workforce.recipe_categories where id = '8a400000-0000-0000-0000-000000000001' $q$),
  0,
  'Manager cannot hard-delete a recipe category (0 rows affected)'
);

-- --- retirement via is_active = false ----------------------------------------
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000005', -- manager
    $q$ update workforce.recipe_categories set is_active = false
          where id = '8a400000-0000-0000-0000-000000000001' $q$),
  1,
  'Manager CAN retire a recipe category via is_active = false'
);

-- ============================================================================
-- Section 8: workforce.recipes RLS behavior
-- ============================================================================

-- --- recipe.read sees published only -----------------------------------------
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000006', -- reader @ Location A
    $q$ select count(*)::int from workforce.recipes
          where id = '8a500000-0000-0000-0000-000000000001' $q$), -- published, tenant-wide
  1, 'recipe.read (location-A) sees the published tenant-wide recipe'
);
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000006',
    $q$ select count(*)::int from workforce.recipes
          where id = '8a500000-0000-0000-0000-000000000002' $q$), -- draft, tenant-wide
  0, 'recipe.read does NOT see a draft tenant-wide recipe'
);
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000006',
    $q$ select count(*)::int from workforce.recipes
          where id = '8a500000-0000-0000-0000-000000000003' $q$), -- archived, tenant-wide
  0, 'recipe.read does NOT see an archived tenant-wide recipe'
);

-- --- recipe.manage sees draft/published/archived -----------------------------
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000005', -- manager, tenant-wide
    $q$ select count(*)::int from workforce.recipes
          where id in (
            '8a500000-0000-0000-0000-000000000001',
            '8a500000-0000-0000-0000-000000000002',
            '8a500000-0000-0000-0000-000000000003'
          ) $q$),
  3, 'recipe.manage (tenant-wide) sees the published, draft, and archived recipes'
);

-- --- tenant-wide recipe visible to a location-scoped user with recipe.read --
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000006', -- reader @ Location A
    $q$ select count(*)::int from workforce.recipes
          where id = '8a500000-0000-0000-0000-000000000001' $q$), -- published, tenant-wide
  1,
  'a location-scoped recipe.read holder sees a tenant-wide (location_id null) published recipe'
);

-- --- location-specific recipe not visible to a user from a different location
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000006', -- reader @ Location A
    $q$ select count(*)::int from workforce.recipes
          where id = '8a500000-0000-0000-0000-000000000004' $q$), -- published, Location A
  1,
  'reader @ Location A sees the published Location A recipe'
);
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000007', -- reader @ Location B
    $q$ select count(*)::int from workforce.recipes
          where id = '8a500000-0000-0000-0000-000000000004' $q$), -- published, Location A
  0,
  'reader @ Location B does NOT see the published Location A recipe'
);

-- --- recipe.publish required for status = 'published' ------------------------
-- Manage-only (no publish) cannot insert a published recipe...
select ok(
  pg_temp.as_auth_throws('8a900000-0000-0000-0000-000000000008',
    $q$ insert into workforce.recipes (tenant_id, title_ja, status)
          values ('8a000000-0000-0000-0000-00000000000a', 'Should fail (insert published)', 'published') $q$),
  'recipe.manage without recipe.publish cannot insert a status=published recipe'
);
-- ...but CAN insert a draft.
select ok(
  not pg_temp.as_auth_throws('8a900000-0000-0000-0000-000000000008',
    $q$ insert into workforce.recipes (tenant_id, title_ja, status)
          values ('8a000000-0000-0000-0000-00000000000a', 'OK draft insert', 'draft') $q$),
  'recipe.manage without recipe.publish CAN insert a status=draft recipe'
);
-- Manage-only cannot flip an existing draft to published...
select ok(
  pg_temp.as_auth_throws('8a900000-0000-0000-0000-000000000008',
    $q$ update workforce.recipes set status = 'published'
          where id = '8a500000-0000-0000-0000-000000000005' $q$),
  'recipe.manage without recipe.publish cannot update a recipe to status=published'
);
-- ...but a holder of recipe.manage + recipe.publish (system manager role) can.
select ok(
  not pg_temp.as_auth_throws('8a900000-0000-0000-0000-000000000005',
    $q$ update workforce.recipes set status = 'published'
          where id = '8a500000-0000-0000-0000-000000000005' $q$),
  'recipe.manage + recipe.publish CAN update a recipe to status=published'
);

-- --- no hard delete on recipes ------------------------------------------------
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000005', -- manager, tenant-wide
    $q$ delete from workforce.recipes where id = '8a500000-0000-0000-0000-000000000003' $q$),
  0,
  'recipe.manage holder cannot hard-delete a recipe (0 rows affected)'
);

-- ============================================================================
-- Section 9: recipe child tables (recipe_ingredients / steps / notes)
-- ============================================================================

-- --- select mirrors parent recipe visibility (exercised on recipe_ingredients)
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000006', -- reader (recipe.read only)
    $q$ select count(*)::int from workforce.recipe_ingredients
          where id = '8a600000-0000-0000-0000-000000000002' $q$), -- ingredient of published recipe
  1,
  'read-only user sees the ingredient of a published (visible) recipe'
);
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000006',
    $q$ select count(*)::int from workforce.recipe_ingredients
          where id = '8a600000-0000-0000-0000-000000000001' $q$), -- ingredient of draft recipe
  0,
  'read-only user does NOT see the ingredient of a draft (invisible) recipe'
);
select is(
  pg_temp.as_auth_count('8a900000-0000-0000-0000-000000000005', -- manager, sees all statuses
    $q$ select count(*)::int from workforce.recipe_ingredients
          where id in (
            '8a600000-0000-0000-0000-000000000001',
            '8a600000-0000-0000-0000-000000000002'
          ) $q$),
  2,
  'recipe.manage holder sees ingredients of both the draft and the published recipe'
);

-- --- read-only user cannot write child rows ----------------------------------
select ok(
  pg_temp.as_auth_throws('8a900000-0000-0000-0000-000000000006', -- reader (recipe.read only)
    $q$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja)
          values ('8a000000-0000-0000-0000-00000000000a',
                  '8a500000-0000-0000-0000-000000000001', 'Should fail') $q$),
  'recipe.read-only holder cannot insert a recipe_ingredients row'
);

-- --- manage user can write child rows -----------------------------------------
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000005', -- manager, tenant-wide
    $q$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja)
          values ('8a000000-0000-0000-0000-00000000000a',
                  '8a500000-0000-0000-0000-000000000002', 'Manager-added ingredient') $q$),
  1,
  'recipe.manage holder CAN insert a recipe_ingredients row'
);
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000005',
    $q$ update workforce.recipe_ingredients set label_ja = 'Updated'
          where id = '8a600000-0000-0000-0000-000000000002' $q$),
  1,
  'recipe.manage holder CAN update a recipe_ingredients row'
);
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000005',
    $q$ delete from workforce.recipe_ingredients
          where id = '8a600000-0000-0000-0000-000000000002' $q$),
  1,
  'recipe.manage holder CAN delete a recipe_ingredients row (children allow hard delete)'
);
select is(
  pg_temp.as_auth_rowcount('8a900000-0000-0000-0000-000000000006', -- reader, read-only
    $q$ update workforce.recipe_ingredients set label_ja = 'Should not change'
          where id = '8a600000-0000-0000-0000-000000000001' $q$),
  0,
  'recipe.read-only holder cannot update a recipe_ingredients row (0 rows affected)'
);

-- --- structural parity: recipe_steps / recipe_notes carry the same 4 policies
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'recipe_steps'
      and policyname in (
        'wf_recipe_steps_select', 'wf_recipe_steps_insert',
        'wf_recipe_steps_update', 'wf_recipe_steps_delete'
      )),
  4, 'workforce.recipe_steps carries the select/insert/update/delete policy set'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'workforce' and tablename = 'recipe_notes'
      and policyname in (
        'wf_recipe_notes_select', 'wf_recipe_notes_insert',
        'wf_recipe_notes_update', 'wf_recipe_notes_delete'
      )),
  4, 'workforce.recipe_notes carries the select/insert/update/delete policy set'
);

select * from finish();
rollback;
