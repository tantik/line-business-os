-- ============================================================================
-- DB test: Entitlements engine (migration 0069_core_entitlements_engine.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * RLS is enabled on all 4 new tables.
--   * A tenant member can read their own core.tenant_plans row; not another
--     tenant's.
--   * A tenant_owner (holds core.billing.manage, and CAN already toggle
--     tenant_modules) is still denied writing tenant_plans /
--     tenant_entitlement_limits -- these are platform-staff-only by design
--     (see 0069's header rationale), a stricter gate than tenant_modules_write.
--   * core.has_module_access: enabled+active -> true; disabled -> false;
--     enabled but plan suspended -> false (the actual new behavior this
--     migration adds); platform staff -> true regardless.
--   * core.check_entitlement_limit: no limit row -> true (unlimited);
--     usage < limit -> true; usage >= limit -> false; tenant override beats
--     plan default.
--   * Backfill: every core.tenants row has exactly one core.tenant_plans row
--     (proves the migration's backfill + the on-insert trigger both work).
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core;
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

create function pg_temp.as_auth_exec(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(p_sub, ''))::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return true;
exception when others then
  raise notice 'as_auth_exec failed: %', sqlerrm;
  reset role;
  return false;
end;
$$;

-- --- RLS enabled on all 4 new tables -----------------------------------------
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and c.relname = 'entitlement_plans'),
  'RLS is enabled on core.entitlement_plans'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and c.relname = 'plan_default_limits'),
  'RLS is enabled on core.plan_default_limits'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and c.relname = 'tenant_plans'),
  'RLS is enabled on core.tenant_plans'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and c.relname = 'tenant_entitlement_limits'),
  'RLS is enabled on core.tenant_entitlement_limits'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('e9600000-0000-0000-0000-000000000001', 'pgtap-entitlements-tenant-a', 'pgTAP Entitlements A'),
  ('e9600000-0000-0000-0000-000000000002', 'pgtap-entitlements-tenant-b', 'pgTAP Entitlements B');

insert into core.users (id, display_name, is_platform_staff) values
  ('e9620000-0000-0000-0000-000000000001', 'Tenant A Owner', false),
  ('e9620000-0000-0000-0000-000000000002', 'Tenant B Member', false),
  ('e9620000-0000-0000-0000-000000000003', 'Platform Staff', true);

insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('e9600000-0000-0000-0000-000000000001', 'e9620000-0000-0000-0000-000000000001', 'active'),
  ('e9600000-0000-0000-0000-000000000002', 'e9620000-0000-0000-0000-000000000002', 'active');

-- tenant_owner system role (0008) -- holds core.billing.manage, i.e. can
-- already toggle tenant_modules; used to prove tenant_plans_write is stricter.
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('e9600000-0000-0000-0000-000000000001', 'e9620000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003', null);

-- ============================================================================
-- Backfill sanity
-- ============================================================================

select is(
  (select count(*)::int from core.tenants t
    where not exists (select 1 from core.tenant_plans tp where tp.tenant_id = t.id)),
  0,
  'every core.tenants row has a core.tenant_plans row (migration backfill)'
);

select is(
  (select plan_code from core.tenant_plans where tenant_id = 'e9600000-0000-0000-0000-000000000001'),
  'standard',
  'a fixture tenant created after the migration gets plan_code=standard from the on-insert trigger'
);
select is(
  (select status from core.tenant_plans where tenant_id = 'e9600000-0000-0000-0000-000000000001')::text,
  'active',
  'a fixture tenant created after the migration gets status=active from the on-insert trigger'
);

-- ============================================================================
-- RLS: select
-- ============================================================================

select ok(
  pg_temp.as_auth_bool('e9620000-0000-0000-0000-000000000001',
    $q$ select exists (select 1 from core.tenant_plans where tenant_id = 'e9600000-0000-0000-0000-000000000001') $q$),
  'a tenant A member can select their own tenant_plans row'
);
select ok(
  not pg_temp.as_auth_bool('e9620000-0000-0000-0000-000000000001',
    $q$ select exists (select 1 from core.tenant_plans where tenant_id = 'e9600000-0000-0000-0000-000000000002') $q$),
  'a tenant A member cannot select tenant B''s tenant_plans row'
);

-- ============================================================================
-- RLS: write is platform-staff-only, even for a core.billing.manage holder
-- ============================================================================

select ok(
  not pg_temp.as_auth_exec('e9620000-0000-0000-0000-000000000001',
    $q$ update core.tenant_plans set status = 'suspended' where tenant_id = 'e9600000-0000-0000-0000-000000000001' $q$),
  'a tenant A Owner (holds core.billing.manage) CANNOT update their own tenant_plans row'
);
select ok(
  not pg_temp.as_auth_exec('e9620000-0000-0000-0000-000000000001',
    $q$ insert into core.tenant_entitlement_limits (tenant_id, module, limit_key, limit_value)
        values ('e9600000-0000-0000-0000-000000000001', 'workforce', 'max_staff', 5) $q$),
  'a tenant A Owner cannot insert a tenant_entitlement_limits row'
);

-- No table-level INSERT/UPDATE/DELETE grant to `authenticated` exists on
-- tenant_plans/tenant_entitlement_limits yet, matching the same latent-policy
-- convention already used by core.tenant_modules/tenant_memberships/locations
-- (RLS write policies defined in 0007/0069, but no facade/grant wired up
-- until an actual write consumer lands -- Module Registry or a future admin
-- surface, out of scope for this migration per its own header). So there is
-- no positive "platform staff writes via the authenticated role" case to
-- assert here yet; the negative cases above (denied for a non-platform-staff
-- member) are the meaningful assertion at this stage. Platform staff / the
-- service role can still administer these tables directly (RLS is bypassed
-- for service_role by design, same as every other core.* table).

-- ============================================================================
-- core.has_module_access
-- ============================================================================

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('e9600000-0000-0000-0000-000000000001', 'workforce', true);

select ok(
  core.has_module_access('e9600000-0000-0000-0000-000000000001', 'workforce'),
  'enabled module + active plan -> has_module_access is true'
);

update core.tenant_modules set is_enabled = false
  where tenant_id = 'e9600000-0000-0000-0000-000000000001' and module = 'workforce';
select ok(
  not core.has_module_access('e9600000-0000-0000-0000-000000000001', 'workforce'),
  'disabled module -> has_module_access is false'
);

update core.tenant_modules set is_enabled = true
  where tenant_id = 'e9600000-0000-0000-0000-000000000001' and module = 'workforce';
update core.tenant_plans set status = 'suspended'
  where tenant_id = 'e9600000-0000-0000-0000-000000000001';
select ok(
  not core.has_module_access('e9600000-0000-0000-0000-000000000001', 'workforce'),
  'enabled module but SUSPENDED plan -> has_module_access is false (the new behavior this migration adds)'
);
update core.tenant_plans set status = 'active'
  where tenant_id = 'e9600000-0000-0000-0000-000000000001';

select ok(
  pg_temp.as_auth_bool('e9620000-0000-0000-0000-000000000003',
    $q$ select core.has_module_access('e9600000-0000-0000-0000-000000000002', 'workforce') $q$),
  'platform staff -> has_module_access is true regardless of tenant_modules/tenant_plans state'
);

-- ============================================================================
-- core.check_entitlement_limit / core.get_entitlement_limit
-- ============================================================================

select ok(
  core.check_entitlement_limit('e9600000-0000-0000-0000-000000000001', 'workforce', 'max_staff', 999),
  'no limit row anywhere -> unlimited -> check_entitlement_limit is true'
);

insert into core.plan_default_limits (plan_code, module, limit_key, limit_value)
  values ('standard', 'workforce', 'max_staff', 10);
select ok(
  core.check_entitlement_limit('e9600000-0000-0000-0000-000000000001', 'workforce', 'max_staff', 9),
  'usage below plan default limit -> true'
);
select ok(
  not core.check_entitlement_limit('e9600000-0000-0000-0000-000000000001', 'workforce', 'max_staff', 10),
  'usage at plan default limit -> false'
);

insert into core.tenant_entitlement_limits (tenant_id, module, limit_key, limit_value)
  values ('e9600000-0000-0000-0000-000000000001', 'workforce', 'max_staff', 20);
select is(
  core.get_entitlement_limit('e9600000-0000-0000-0000-000000000001', 'workforce', 'max_staff'),
  20::bigint,
  'a tenant override (20) takes precedence over the plan default (10)'
);
select ok(
  core.check_entitlement_limit('e9600000-0000-0000-0000-000000000001', 'workforce', 'max_staff', 15),
  'usage within the tenant override limit -> true'
);

select * from finish();
rollback;
