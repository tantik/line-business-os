-- ============================================================================
-- DB test: api.has_permission_in_tenant RPC facade (migration
--          0066_api_has_permission_in_tenant_facade.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * api.has_permission_in_tenant(uuid, text) exists, returns boolean, is
--     NOT SECURITY DEFINER.
--   * PUBLIC/anon denied EXECUTE; authenticated allowed.
--   * Behaviorally: a LOCATION-SCOPED role assignment (the case
--     api.has_permission(tenant, perm, null) gets wrong -- see this
--     migration's own comment) still returns true here; a tenant-wide
--     assignment also returns true; no assignment / wrong tenant / no-JWT
--     all return false.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce, api;
select no_plan();

create function pg_temp.as_auth_bool(p_sub text, p_sql text)
returns boolean language plpgsql as $$
declare b boolean;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(p_sub, ''))::text, true);
  set local role authenticated;
  execute p_sql into b;
  reset role;
  return b;
end;
$$;

select is(
  (select t.typname from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     join pg_type t on t.oid = p.prorettype
    where n.nspname = 'api' and p.proname = 'has_permission_in_tenant'),
  'bool',
  'api.has_permission_in_tenant returns boolean'
);
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.prosecdef),
  0,
  'api schema still contains no SECURITY DEFINER function after 0066'
);
select ok(
  not has_function_privilege('anon', 'api.has_permission_in_tenant(uuid, text)', 'EXECUTE'),
  'anon cannot EXECUTE api.has_permission_in_tenant'
);
select ok(
  has_function_privilege('authenticated', 'api.has_permission_in_tenant(uuid, text)', 'EXECUTE'),
  'authenticated can EXECUTE api.has_permission_in_tenant'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('da600000-0000-0000-0000-000000000001', 'pgtap-has-perm-tenant-tenant', 'pgTAP has_permission_in_tenant A'),
  ('da600000-0000-0000-0000-000000000002', 'pgtap-has-perm-tenant-tenant-b', 'pgTAP has_permission_in_tenant B');
insert into core.locations (id, tenant_id, name) values
  ('da610000-0000-0000-0000-000000000001', 'da600000-0000-0000-0000-000000000001', 'Loc A');
insert into core.users (id, display_name) values
  ('da620000-0000-0000-0000-000000000001', 'Location-scoped Manager'),
  ('da620000-0000-0000-0000-000000000002', 'Tenant-wide Manager'),
  ('da620000-0000-0000-0000-000000000003', 'Employee (no manage)');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('da600000-0000-0000-0000-000000000001', 'da620000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005', 'da610000-0000-0000-0000-000000000001'), -- location-scoped
  ('da600000-0000-0000-0000-000000000001', 'da620000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', null), -- tenant-wide
  ('da600000-0000-0000-0000-000000000001', 'da620000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000006', 'da610000-0000-0000-0000-000000000001'); -- employee, no manage

select ok(
  pg_temp.as_auth_bool('da620000-0000-0000-0000-000000000001',
    $q$ select api.has_permission_in_tenant('da600000-0000-0000-0000-000000000001', 'workforce.staff.manage') $q$),
  'a LOCATION-SCOPED Manager gets true (the exact case api.has_permission(tenant, perm, null) gets wrong)'
);
select ok(
  pg_temp.as_auth_bool('da620000-0000-0000-0000-000000000002',
    $q$ select api.has_permission_in_tenant('da600000-0000-0000-0000-000000000001', 'workforce.staff.manage') $q$),
  'a tenant-wide Manager gets true'
);
select ok(
  not pg_temp.as_auth_bool('da620000-0000-0000-0000-000000000003',
    $q$ select api.has_permission_in_tenant('da600000-0000-0000-0000-000000000001', 'workforce.staff.manage') $q$),
  'an Employee without workforce.staff.manage gets false'
);
select ok(
  not pg_temp.as_auth_bool('da620000-0000-0000-0000-000000000001',
    $q$ select api.has_permission_in_tenant('da600000-0000-0000-0000-000000000002', 'workforce.staff.manage') $q$),
  'the same Manager gets false for a DIFFERENT tenant they have no assignment in'
);
select ok(
  not pg_temp.as_auth_bool(null,
    $q$ select api.has_permission_in_tenant('da600000-0000-0000-0000-000000000001', 'workforce.staff.manage') $q$),
  'no JWT sub -> false (fail closed)'
);

select * from finish();
rollback;
