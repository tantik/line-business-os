-- ============================================================================
-- DB test: api.has_permission RPC facade (Phase 1J-1F, migration 0019)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the facade added by 0019_api_has_permission_facade.sql:
--   * api.has_permission(uuid, text, uuid) exists and returns boolean;
--   * it is NOT SECURITY DEFINER (extends 0005's "api has no SECURITY
--     DEFINER function" assertion, which only covered views/no functions
--     existed yet);
--   * PUBLIC has no EXECUTE (no implicit-grant leak);
--   * `anon` has no EXECUTE (fail-closed, matching every other api object);
--   * `authenticated` has EXECUTE;
--   * behaviorally, delegates to core.has_permission exactly: tenant-wide
--     grant, no-grant, cross-tenant, location-scoped, and platform-staff-
--     bypass cases, plus the fail-closed no-JWT-sub case.
--
-- pgTAP runs as the superuser test role. To exercise the invoker function
-- under RLS-adjacent grants we hop into the `authenticated` role inside
-- SECURITY INVOKER helper functions (same pg_temp.as_auth_* pattern as
-- 0005_api_facade.sql): SET LOCAL ROLE reverts on return, so every pgTAP
-- assertion call still runs as the superuser.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai, api;

select no_plan();

-- --- Helper: run a query AS the authenticated role for a given JWT sub -----
-- Cloud-style JSON-claims path (request.jwt.claims->>'sub'), matching what
-- Supabase Cloud PostgREST actually sets (0016_fix_current_user_id_jwt_claims.sql).
create function pg_temp.as_auth_bool(p_sub text, p_sql text)
returns boolean
language plpgsql
as $$
declare b boolean;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', coalesce(p_sub, ''))::text, true);
  set local role authenticated;
  execute p_sql into b;
  return b;
end;
$$;

-- --- Fixtures (inserted as superuser; bypasses RLS) ------------------------
-- Tenant E: the tenant under test. Tenant F: used only for the cross-tenant
-- negative case (the manager user has no role assignment there).
insert into core.tenants (id, slug, name, kind) values
  ('e5555555-5555-5555-5555-555555555555', 'pgtap-1f-tenant-e', 'pgTAP 1F Tenant E', 'demo'),
  ('f6666666-6666-6666-6666-666666666666', 'pgtap-1f-tenant-f', 'pgTAP 1F Tenant F', 'client');

insert into core.users (id, display_name, is_platform_staff) values
  ('1a1a1a1a-0000-0000-0000-000000000001', 'Manager (tenant-wide audit read)', false),
  ('1b1b1b1b-0000-0000-0000-000000000002', 'Employee (no audit read)', false),
  ('1c1c1c1c-0000-0000-0000-000000000003', 'LocManager (audit read, location-scoped)', false),
  ('1d1d1d1d-0000-0000-0000-000000000004', 'Platform Staff (no role assignment)', true);

insert into core.locations (id, tenant_id, name, timezone, is_active) values
  ('e1000000-0000-0000-0000-000000000001', 'e5555555-5555-5555-5555-555555555555', 'Tenant E Loc 1', 'Asia/Tokyo', true),
  ('e1000000-0000-0000-0000-000000000002', 'e5555555-5555-5555-5555-555555555555', 'Tenant E Loc 2', 'Asia/Tokyo', true);

-- Role assignments: manager role holds core.audit.read (0008_rbac_seed.sql);
-- employee role does not.
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  -- Manager: tenant-wide (location_id null) core.audit.read in Tenant E.
  (
    'e5555555-5555-5555-5555-555555555555',
    '1a1a1a1a-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000005', -- manager
    null
  ),
  -- Employee: active assignment in Tenant E, but employee role lacks core.audit.read.
  (
    'e5555555-5555-5555-5555-555555555555',
    '1b1b1b1b-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000006', -- employee
    null
  ),
  -- LocManager: manager role (has core.audit.read) but scoped to Loc 1 only.
  (
    'e5555555-5555-5555-5555-555555555555',
    '1c1c1c1c-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000005', -- manager
    'e1000000-0000-0000-0000-000000000001'
  );
  -- Platform Staff intentionally has NO role_assignments row anywhere: the
  -- bypass must come from core.is_platform_staff() alone.

-- --- Structural: function exists, returns boolean, correct arg types -------
select has_function(
  'api', 'has_permission', array['uuid', 'text', 'uuid'],
  'api.has_permission(uuid, text, uuid) exists'
);

select is(
  (select t.typname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     join pg_type t on t.oid = p.prorettype
    where n.nspname = 'api'
      and p.proname = 'has_permission'),
  'bool',
  'api.has_permission returns boolean'
);

-- --- Not SECURITY DEFINER ---------------------------------------------------
-- Extends 0005_api_facade.sql's "api schema contains no SECURITY DEFINER
-- function" assertion (written when api held only views) to also cover the
-- function this migration introduces.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.prosecdef),
  0,
  'api schema contains no SECURITY DEFINER function (including has_permission)'
);

-- --- No new table/view exposure was introduced ------------------------------
select is(
  (select count(*)::int
     from information_schema.tables
    where table_schema = 'api'
      and table_type = 'BASE TABLE'),
  0,
  'api schema still exposes no base tables'
);
select is(
  (select count(*)::int
     from information_schema.views
    where table_schema = 'api'
      and table_name not in (
        'my_tenant_memberships', 'my_tenant_locations',
        'my_tenant_modules', 'my_tenant_admin_members',
        -- Phase 1L-3 (0023_workforce_api_facade.sql): 7 new read-only
        -- workforce views, added in a later, separate migration.
        'workforce_my_staff_profile', 'workforce_staff_directory',
        'workforce_recipe_categories', 'workforce_recipes',
        'workforce_recipe_ingredients', 'workforce_recipe_steps',
        'workforce_recipe_notes',
        -- Workforce Cafe v0.1 Slice 1A (0030_workforce_cafe_api_facade.sql):
        -- 4 new read-only views, added in a later, separate migration.
        'workforce_shift_types', 'workforce_shift_assignments',
        'workforce_shift_requests', 'workforce_attendance',
        -- Workforce Cafe v0.1 Slice 1C (0031_workforce_cafe_write_facade.sql):
        -- 2 new views, added in a later, separate migration.
        'workforce_employee_line_links', 'workforce_staff_manage'
      )),
  0,
  'no new api view was introduced by the has_permission migration, beyond Phase 1L-3/Slice 1A/Slice 1C''s later workforce facades'
);

-- --- Grants: PUBLIC/anon denied, authenticated allowed ----------------------
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(p.proacl) acl
    where n.nspname = 'api'
      and p.proname = 'has_permission'
      and acl.grantee = 0               -- 0 == PUBLIC
      and acl.privilege_type = 'EXECUTE'),
  0,
  'PUBLIC has no EXECUTE on api.has_permission'
);
select ok(
  not has_function_privilege('anon', 'api.has_permission(uuid, text, uuid)', 'EXECUTE'),
  'anon cannot EXECUTE api.has_permission'
);
select ok(
  has_function_privilege('authenticated', 'api.has_permission(uuid, text, uuid)', 'EXECUTE'),
  'authenticated can EXECUTE api.has_permission'
);

-- --- Behavioral: delegates to core.has_permission exactly -------------------

-- Manager holds tenant-wide core.audit.read in Tenant E.
select ok(
  pg_temp.as_auth_bool('1a1a1a1a-0000-0000-0000-000000000001',
    $q$ select api.has_permission(
          'e5555555-5555-5555-5555-555555555555', 'core.audit.read') $q$),
  'manager with tenant-wide role assignment gets true for core.audit.read in Tenant E'
);

-- Employee has an active assignment in Tenant E but the employee role lacks
-- core.audit.read.
select ok(
  not pg_temp.as_auth_bool('1b1b1b1b-0000-0000-0000-000000000002',
    $q$ select api.has_permission(
          'e5555555-5555-5555-5555-555555555555', 'core.audit.read') $q$),
  'employee without core.audit.read gets false in Tenant E'
);

-- Manager has no role assignment at all in Tenant F.
select ok(
  not pg_temp.as_auth_bool('1a1a1a1a-0000-0000-0000-000000000001',
    $q$ select api.has_permission(
          'f6666666-6666-6666-6666-666666666666', 'core.audit.read') $q$),
  'manager with no assignment in Tenant F gets false (cross-tenant denial)'
);

-- LocManager's assignment is scoped to Loc 1 only.
select ok(
  pg_temp.as_auth_bool('1c1c1c1c-0000-0000-0000-000000000003',
    $q$ select api.has_permission(
          'e5555555-5555-5555-5555-555555555555', 'core.audit.read',
          'e1000000-0000-0000-0000-000000000001') $q$),
  'location-scoped manager gets true for their own location'
);
select ok(
  not pg_temp.as_auth_bool('1c1c1c1c-0000-0000-0000-000000000003',
    $q$ select api.has_permission(
          'e5555555-5555-5555-5555-555555555555', 'core.audit.read',
          'e1000000-0000-0000-0000-000000000002') $q$),
  'location-scoped manager gets false for a different location'
);

-- Platform staff bypasses role_assignments entirely.
select ok(
  pg_temp.as_auth_bool('1d1d1d1d-0000-0000-0000-000000000004',
    $q$ select api.has_permission(
          'e5555555-5555-5555-5555-555555555555', 'core.audit.read') $q$),
  'platform staff gets true regardless of role assignment'
);
select ok(
  pg_temp.as_auth_bool('1d1d1d1d-0000-0000-0000-000000000004',
    $q$ select api.has_permission(
          'f6666666-6666-6666-6666-666666666666', 'nonexistent.permission.key') $q$),
  'platform staff gets true even for an unrecognized permission key in any tenant'
);

-- Unrecognized permission key never matches any role_permissions row.
select ok(
  not pg_temp.as_auth_bool('1a1a1a1a-0000-0000-0000-000000000001',
    $q$ select api.has_permission(
          'e5555555-5555-5555-5555-555555555555', 'nonexistent.permission.key') $q$),
  'unrecognized permission key gets false for a non-platform-staff caller'
);

-- Fail-closed: no JWT sub -> core.current_user_id() is NULL -> false.
select ok(
  not pg_temp.as_auth_bool('',
    $q$ select coalesce(api.has_permission(
          'e5555555-5555-5555-5555-555555555555', 'core.audit.read'), false) $q$),
  'authenticated with no JWT sub gets false (fail-closed)'
);

select * from finish();
rollback;
