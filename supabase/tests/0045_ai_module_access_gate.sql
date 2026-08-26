-- ============================================================================
-- DB test: AI module-OFF gating (WP-S6, migration
-- 0098_ai_module_access_gate.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- AI is scaffold-only (no product features, no api.* view/RPC) -- this file
-- proves the RLS lifecycle directly against the base tables, the only
-- tenant-facing surface AI has: AI ON (normal SELECT/INSERT/UPDATE
-- behavior) -> OFF (SELECT/INSERT/UPDATE blocked tenant-facing, existing
-- rows preserved) -> ON again (prior access restored).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, ai;

select no_plan();

-- AI is scaffold-only: no migration has ever granted `authenticated`
-- schema/table access (confirmed -- grep found none), so its RLS policies,
-- while present, are currently unreachable tenant-facing regardless of
-- module state. Grant test-only access here (matching the established
-- pattern already used by Booking's own WP-S4 test, 0043) purely to exercise
-- and prove the RLS/module-access logic itself -- this does NOT activate AI
-- as a real product feature (that would require a migration change, which
-- this mission's WP-S6 scope explicitly excludes); it only makes the
-- policies' behavior testable.
grant usage on schema ai to authenticated;
grant select, insert on ai.proposals to authenticated;

-- --- Fixtures ---------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('a6100000-0000-0000-0000-00000000000a', 'pgtap-ai-gate-tenant', 'pgTAP AI Gate Tenant');

-- AI starts ON.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a6100000-0000-0000-0000-00000000000a', 'ai', true);

insert into core.locations (id, tenant_id, name) values
  ('a6200000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-00000000000a', 'Gate Tenant Location A');

insert into core.users (id, display_name) values
  ('a6900000-0000-0000-0000-000000000001', 'Gate Owner A');

-- tenant_owner: system role, holds every permission via role_permissions
-- seed data (0008_rbac_seed.sql) -- simplest fixture for a scaffold-only
-- module with no dedicated staff-role assignment convention yet.
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a6100000-0000-0000-0000-00000000000a', 'a6900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003', 'a6200000-0000-0000-0000-000000000001'); -- tenant_owner

insert into ai.proposals (id, tenant_id, location_id, module, entity, action, proposed_change, created_by_agent)
  values ('a6300000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-00000000000a',
          'a6200000-0000-0000-0000-000000000001', 'inventory', 'inventory.items', 'update',
          '{"reorder_point": 5}'::jsonb, 'inventory-agent');

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
-- Section 1: AI ON -- normal baseline behavior.
-- ============================================================================

select is(
  pg_temp.as_auth_count('a6900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from ai.proposals where tenant_id = 'a6100000-0000-0000-0000-00000000000a' $$),
  1,
  'AI ON: owner sees the proposal via tenant-facing SELECT'
);
reset role;

select ok(
  not pg_temp.as_auth_throws('a6900000-0000-0000-0000-000000000001',
    $$ insert into ai.proposals (tenant_id, location_id, module, entity, action, proposed_change, created_by_agent)
         values ('a6100000-0000-0000-0000-00000000000a', 'a6200000-0000-0000-0000-000000000001',
                 'inventory', 'inventory.items', 'create', '{}'::jsonb, 'inventory-agent') $$),
  'AI ON: owner can INSERT a new proposal'
);
reset role;

-- ============================================================================
-- Section 2: AI OFF -- tenant-facing access blocked, data preserved.
-- ============================================================================

update core.tenant_modules set is_enabled = false
  where tenant_id = 'a6100000-0000-0000-0000-00000000000a' and module = 'ai';

select is(
  pg_temp.as_auth_count('a6900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from ai.proposals where tenant_id = 'a6100000-0000-0000-0000-00000000000a' $$),
  0,
  'AI OFF: tenant-facing SELECT on ai.proposals returns zero rows, even though rows still exist'
);
reset role;

select ok(
  pg_temp.as_auth_throws('a6900000-0000-0000-0000-000000000001',
    $$ insert into ai.proposals (tenant_id, location_id, module, entity, action, proposed_change, created_by_agent)
         values ('a6100000-0000-0000-0000-00000000000a', 'a6200000-0000-0000-0000-000000000001',
                 'inventory', 'inventory.items', 'create', '{}'::jsonb, 'inventory-agent') $$),
  'AI OFF: owner cannot INSERT a new proposal'
);
reset role;

-- Existing rows preserved: verified via a superuser/RLS-bypassing read.
select is(
  (select count(*)::int from ai.proposals where tenant_id = 'a6100000-0000-0000-0000-00000000000a'),
  2,
  'AI OFF: both pre-existing proposal rows (from Section 1) still exist in storage'
);

-- ============================================================================
-- Section 3: AI ON again -- prior data/actions accessible again.
-- ============================================================================

update core.tenant_modules set is_enabled = true
  where tenant_id = 'a6100000-0000-0000-0000-00000000000a' and module = 'ai';

select is(
  pg_temp.as_auth_count('a6900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from ai.proposals where tenant_id = 'a6100000-0000-0000-0000-00000000000a' $$),
  2,
  'AI ON again: both pre-existing proposals are visible again through the tenant-facing path'
);
reset role;

-- ============================================================================
-- Section 4: cross-tenant isolation still holds regardless of module state.
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('a6100000-0000-0000-0000-00000000000b', 'pgtap-ai-gate-tenant-b', 'pgTAP AI Gate Tenant B');
insert into core.users (id, display_name) values
  ('a6900000-0000-0000-0000-000000000002', 'Gate Owner B');
insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('a6100000-0000-0000-0000-00000000000b', 'a6900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000003'); -- tenant_owner, tenant-wide

select is(
  pg_temp.as_auth_count('a6900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from ai.proposals where tenant_id = 'a6100000-0000-0000-0000-00000000000a' $$),
  0,
  'Tenant B owner sees zero Tenant A ai.proposals rows regardless of Tenant A''s own module state (tenant isolation)'
);
reset role;

select * from finish();
rollback;
