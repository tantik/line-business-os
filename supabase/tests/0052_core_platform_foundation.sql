-- ============================================================================
-- DB test: Platform Foundation reconciliation
-- (migrations 0106-0111: entitlements, module registry, tenant_settings,
--  notifications, event bus, Operations module registration)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the reconciled Foundation's security model and the invariants the
-- reconciliation mission (§8) requires. Does NOT re-test main's original
-- 0069-0073 line by line — it tests the contract that must hold on the `dev`
-- lineage now.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, ai, api;

select no_plan();

-- --- Fixtures -------------------------------------------------------------
insert into core.tenants (id, slug, name, kind) values
  ('0a110000-0000-0000-0000-00000000f001', 'pgtap-pf-a', 'pgTAP PF A', 'client'),
  ('0b220000-0000-0000-0000-00000000f002', 'pgtap-pf-b', 'pgTAP PF B', 'client');

-- tenant A: workforce ON. tenant B: no module rows at all.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0a110000-0000-0000-0000-00000000f001', 'workforce', true);

insert into core.users (id, display_name, is_platform_staff) values
  ('0a900000-0000-0000-0000-0000000000f1', 'PF Platform Staff', true),
  ('0a900000-0000-0000-0000-0000000000f2', 'PF A Owner',        false),
  ('0a900000-0000-0000-0000-0000000000f3', 'PF A Staff',        false),
  ('0b900000-0000-0000-0000-0000000000f4', 'PF B Owner',        false);

insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('0a110000-0000-0000-0000-00000000f001', '0a900000-0000-0000-0000-0000000000f2', 'active'),
  ('0a110000-0000-0000-0000-00000000f001', '0a900000-0000-0000-0000-0000000000f3', 'active'),
  ('0b220000-0000-0000-0000-00000000f002', '0b900000-0000-0000-0000-0000000000f4', 'active');

-- A Owner = tenant_owner (holds core.settings.manage); A Staff = employee (does not).
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0a110000-0000-0000-0000-00000000f001', '0a900000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000003', null),
  ('0a110000-0000-0000-0000-00000000f001', '0a900000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-000000000006', null),
  ('0b220000-0000-0000-0000-00000000f002', '0b900000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-000000000003', null);

-- --- role-hop helpers --------------------------------------------------
create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end $$;

create function pg_temp.as_auth_throws(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return false;
exception when others then
  reset role;
  return true;
end $$;

-- ============================================================================
-- STRUCTURE
-- ============================================================================
select has_table('core', 'entitlement_plans', 'core.entitlement_plans exists');
select has_table('core', 'plan_default_limits', 'core.plan_default_limits exists');
select has_table('core', 'tenant_plans', 'core.tenant_plans exists');
select has_table('core', 'tenant_entitlement_limits', 'core.tenant_entitlement_limits exists');
select has_table('core', 'module_registry', 'core.module_registry exists');
select has_table('core', 'module_dependencies', 'core.module_dependencies exists');
select has_table('core', 'tenant_settings', 'core.tenant_settings exists');
select has_table('core', 'notifications', 'core.notifications exists');
select has_table('core', 'events', 'core.events exists');
select has_function('core', 'can_enable_module', array['uuid', 'module_code'], 'core.can_enable_module exists');
select has_function('core', 'get_entitlement_limit', array['uuid', 'module_code', 'text'], 'core.get_entitlement_limit exists');

-- ============================================================================
-- INVARIANT: core.has_module_access is UNCHANGED (0093's simple form) — the
-- reconciliation must NOT wire plan/entitlement checks into the runtime gate.
-- ============================================================================
select is(
  (select position('tenant_plans' in pg_get_functiondef(oid))
     from pg_proc where proname = 'has_module_access' and pronamespace = 'core'::regnamespace),
  0, 'has_module_access does NOT join core.tenant_plans (runtime gate unchanged from 0093)');
select is(
  (select position('is_platform_staff' in pg_get_functiondef(oid))
     from pg_proc where proname = 'has_module_access' and pronamespace = 'core'::regnamespace),
  0, 'has_module_access still has NO platform-staff bypass (0093 contract)');

-- ============================================================================
-- ENTITLEMENTS
-- ============================================================================
-- default-plan trigger: every seed tenant + our 2 fixtures have exactly one plan row
select is(
  (select count(*)::int from core.tenant_plans tp where tp.tenant_id = '0a110000-0000-0000-0000-00000000f001'),
  1, 'entitlements: A has exactly one tenant_plans row (default trigger, no duplicate)');
select is(
  (select count(*)::int from core.tenant_plans),
  (select count(*)::int from core.tenants),
  'entitlements: exactly one tenant_plans row per tenant (uniqueness + trigger)');

-- tenant_id is UNIQUE — a second plan row for the same tenant is rejected
select throws_ok(
  $$ insert into core.tenant_plans (tenant_id, plan_code, status)
     values ('0a110000-0000-0000-0000-00000000f001', 'trial', 'trial') $$,
  '23505', null, 'entitlements: a second tenant_plans row for one tenant is rejected (unique tenant_id)');

-- tenant isolation on read: A owner sees A's plan, not B's
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000000f2',
    $$ select count(*)::int from core.tenant_plans where tenant_id = '0b220000-0000-0000-0000-00000000f002' $$),
  0, 'entitlements: A owner cannot read B''s tenant_plans row');
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000000f2',
    $$ select count(*)::int from core.tenant_plans where tenant_id = '0a110000-0000-0000-0000-00000000f001' $$),
  1, 'entitlements: A owner CAN read A''s own tenant_plans row');

-- Writes: no table grant to `authenticated` at all (platform-staff writes go
-- via service_role / a future admin RPC). The RLS `_write` policy is the
-- documented boundary — exercise it directly by granting for the test window.
grant update on core.tenant_plans to authenticated;
grant insert on core.entitlement_plans to authenticated;

-- A owner (tenant_owner, NOT platform staff): RLS with-check denies the write
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000000f2',
    $$ with u as (update core.tenant_plans set status = 'suspended' where tenant_id = '0a110000-0000-0000-0000-00000000f001' returning 1) select count(*)::int from u $$),
  0, 'entitlements: A owner (tenant_owner, not platform staff) cannot change A''s plan status (RLS)');
-- platform staff: RLS allows
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000000f1',
    $$ with u as (update core.tenant_plans set status = 'active' where tenant_id = '0a110000-0000-0000-0000-00000000f001' returning 1) select count(*)::int from u $$),
  1, 'entitlements: platform staff CAN change a tenant plan (RLS)');
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-0000000000f2',
    $$ insert into core.entitlement_plans (code, name) values ('pgtap-x','X') $$),
  'entitlements: a tenant owner cannot insert an entitlement_plans row (RLS with-check)');

revoke update on core.tenant_plans from authenticated;
revoke insert on core.entitlement_plans from authenticated;

-- ============================================================================
-- MODULE REGISTRY
-- ============================================================================
select is(
  (select lifecycle_status::text from core.module_registry where module = 'workforce'),
  'ga', 'registry: workforce lifecycle = ga');

-- can_enable_module: a lifecycle-retired module cannot be enabled
select is(
  (select core.can_enable_module('0a110000-0000-0000-0000-00000000f001', 'workforce')::text),
  'true', 'can_enable_module: workforce (ga, no deps) can be enabled for A');

-- absent registry row => cannot enable (fail closed). 'logistics' has a
-- registry row but is 'planned'; use a temp deletion to simulate "no row".
select is(
  (select core.can_enable_module('0a110000-0000-0000-0000-00000000f001', 'booking')::text),
  'true', 'can_enable_module: booking (ga) enable-able');
-- dependency check: add a synthetic dependency booking -> ai, ai OFF for A
insert into core.module_dependencies (module, depends_on) values ('booking', 'ai');
select is(
  (select core.can_enable_module('0a110000-0000-0000-0000-00000000f001', 'booking')::text),
  'false', 'can_enable_module: booking blocked when its dependency (ai) is not enabled for the tenant');
delete from core.module_dependencies where module = 'booking' and depends_on = 'ai';

-- registry is NOT the runtime gate: workforce has a 'ga' registry row, but a
-- tenant with the module OFF still fails core.has_module_access.
select is(
  (select core.has_module_access('0b220000-0000-0000-0000-00000000f002', 'workforce')::text),
  'false', 'registry is not the runtime gate: B (no tenant_modules row) fails has_module_access despite a ga registry row');

-- registry write is platform-staff-only (RLS; no authenticated grant normally)
grant update on core.module_registry to authenticated;
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000000f2',
    $$ with u as (update core.module_registry set lifecycle_status = 'deprecated' where module = 'workforce' returning 1) select count(*)::int from u $$),
  0, 'registry: a tenant owner cannot mutate module_registry (RLS)');
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000000f1',
    $$ with u as (update core.module_registry set version = version where module = 'workforce' returning 1) select count(*)::int from u $$),
  1, 'registry: platform staff CAN mutate module_registry (RLS)');
revoke update on core.module_registry from authenticated;

-- ============================================================================
-- TENANT SETTINGS
-- ============================================================================
grant insert, update, delete on core.tenant_settings to authenticated;

-- A owner (holds core.settings.manage) can write; A staff (employee) cannot
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000000f2',
    $$ with i as (insert into core.tenant_settings (tenant_id, module, setting_key, setting_value)
                  values ('0a110000-0000-0000-0000-00000000f001', 'workforce', 'k1', '{"v":1}') returning 1) select count(*)::int from i $$),
  1, 'tenant_settings: A owner (core.settings.manage) can write a settings row');
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-0000000000f3',
    $$ insert into core.tenant_settings (tenant_id, module, setting_key, setting_value)
       values ('0a110000-0000-0000-0000-00000000f001', 'workforce', 'k2', '{"v":2}') $$),
  'tenant_settings: A staff (employee, no core.settings.manage) cannot write a settings row');

-- tenant isolation
select is(
  pg_temp.as_auth_count('0b900000-0000-0000-0000-0000000000f4',
    $$ select count(*)::int from core.tenant_settings where tenant_id = '0a110000-0000-0000-0000-00000000f001' $$),
  0, 'tenant_settings: B owner cannot read A''s settings');

-- MODULE-OFF behavior (DELIBERATE, surfaced — see 0108 header + handoff):
-- a settings write for module 'ai' succeeds for A even though 'ai' is NOT in
-- A's tenant_modules. This asserts the CURRENT (main 0071) semantics so any
-- future change to gate it is visible in this test's diff.
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-0000000000f2',
    $$ with i as (insert into core.tenant_settings (tenant_id, module, setting_key, setting_value)
                  values ('0a110000-0000-0000-0000-00000000f001', 'ai', 'k3', '{"v":3}') returning 1) select count(*)::int from i $$),
  1, 'tenant_settings: a write tagged module=ai succeeds while ai is OFF for the tenant — CURRENT semantics, flagged for Founder review');

revoke insert, update, delete on core.tenant_settings from authenticated;

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
-- no INSERT grant to authenticated at all (system-generated only)
select ok(
  not has_table_privilege('authenticated', 'core.notifications', 'INSERT'),
  'notifications: authenticated has NO INSERT privilege (system-generated outbox)');
select ok(
  has_table_privilege('authenticated', 'core.notifications', 'SELECT'),
  'notifications: authenticated CAN SELECT (own-tenant history)');

-- idempotency: (tenant_id, module, idempotency_key) is unique
insert into core.line_accounts (id, tenant_id, line_user_id_encrypted, line_user_id_hash)
  values ('0ac00000-0000-0000-0000-0000000000f1', '0a110000-0000-0000-0000-00000000f001', '\x00', 'pf-hash-1');
insert into core.notifications (tenant_id, module, recipient_line_account_id, idempotency_key, template_key)
  values ('0a110000-0000-0000-0000-00000000f001', 'workforce', '0ac00000-0000-0000-0000-0000000000f1', 'idem-1', 't');
select throws_ok(
  $$ insert into core.notifications (tenant_id, module, recipient_line_account_id, idempotency_key, template_key)
     values ('0a110000-0000-0000-0000-00000000f001', 'workforce', '0ac00000-0000-0000-0000-0000000000f1', 'idem-1', 't') $$,
  '23505', null, 'notifications: duplicate (tenant, module, idempotency_key) rejected');

-- tenant isolation on read
select is(
  pg_temp.as_auth_count('0b900000-0000-0000-0000-0000000000f4',
    $$ select count(*)::int from core.notifications where tenant_id = '0a110000-0000-0000-0000-00000000f001' $$),
  0, 'notifications: B owner cannot read A''s notifications');

-- ============================================================================
-- EVENT BUS
-- ============================================================================
select ok(
  not has_table_privilege('authenticated', 'core.events', 'INSERT'),
  'events: authenticated has NO INSERT privilege');
insert into core.events (tenant_id, module, event_type) values ('0a110000-0000-0000-0000-00000000f001', 'workforce', 'pgtap.test');
select throws_ok(
  $$ update core.events set event_type = 'x' where tenant_id = '0a110000-0000-0000-0000-00000000f001' $$,
  'P0001', 'core.events is append-only', 'events: UPDATE is blocked (append-only trigger)');
select throws_ok(
  $$ delete from core.events where tenant_id = '0a110000-0000-0000-0000-00000000f001' $$,
  'P0001', 'core.events is append-only', 'events: DELETE is blocked (append-only trigger)');
select is(
  pg_temp.as_auth_count('0b900000-0000-0000-0000-0000000000f4',
    $$ select count(*)::int from core.events where tenant_id = '0a110000-0000-0000-0000-00000000f001' $$),
  0, 'events: B owner cannot read A''s events');

-- ============================================================================
-- OPERATIONS MODULE REGISTRATION (0111)
-- ============================================================================
select is(
  (select lifecycle_status::text from core.module_registry where module = 'operations'),
  'beta', 'operations: registry row exists with lifecycle = beta');
select is(
  (select nav_route from core.module_registry where module = 'operations'),
  null, 'operations: nav_route is NULL (no dashboard route yet)');
select is(
  (select count(*)::int from core.module_dependencies where module = 'operations'),
  0, 'operations: no module dependencies');
select is(
  (select count(*)::int from core.tenant_modules where module = 'operations'),
  0, 'operations: NOT enabled for any tenant (no tenant_modules row inserted by the reconciliation)');
select is(
  (select core.has_module_access('0a110000-0000-0000-0000-00000000f001', 'operations')::text),
  'false', 'operations: missing tenant_modules row => has_module_access = false (fail-closed, unchanged)');
select is(
  (select core.can_enable_module('0a110000-0000-0000-0000-00000000f001', 'operations')::text),
  'true', 'operations: can_enable_module = true (beta, no deps, no min_plan) — a PRE-CHECK, not the runtime gate');

select * from finish();
rollback;
