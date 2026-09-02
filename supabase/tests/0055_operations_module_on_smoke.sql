-- ============================================================================
-- DB test: Operations module-ON smoke — Step 4 acceptance matrix (LOCAL proof)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- This is the LOCAL mirror of the Cloud DEV "Operations module-ON smoke"
-- (Step 4, docs/operations/operations-cloud-dev-module-on-smoke-runbook.md).
-- It does NOT re-prove the full Operations engine (0046-0051 already do that);
-- it frames the Step 4 acceptance scenarios A-E + the mandatory negative
-- enforcement tests as one categorical matrix, on a fixture shaped like the
-- Cloud DEV smoke tenants:
--
--   smoke-tenant-b   : Operations ENABLED   (core.tenant_modules is_enabled = true)
--   smoke-tenant-off : Operations row EXISTS but is_enabled = false
--   smoke-tenant-nil : NO core.tenant_modules operations row at all (fail-closed)
--
-- Every application-facing assertion runs as a real `authenticated` role-hop
-- (set role authenticated + request.jwt.claim.sub), i.e. the exact path the
-- Next.js Server Action -> api.* facade uses. Fixture setup runs as the test
-- superuser and is NOT the mechanism under test (Step 4 §13:
-- "fixture setup privilege != application runtime privilege").
--
-- SCENARIO A  — ENABLED_TENANT       : entitled tenant can read + write Operations
-- SCENARIO B  — DISABLED_TENANT      : OFF / missing row is enforced, not just hidden
-- SCENARIO C  — CROSS_TENANT_ISOLATION: same path an app uses -> DENIED / EMPTY
-- SCENARIO D  — ROLE_BOUNDARY        : Manager vs Staff (employee) split enforced
-- SCENARIO E  — LOCATION_BOUNDARY    : location-scoped template is a real boundary
-- NEGATIVE    — module gate in the write RPC + RLS with-check; anon fully denied
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, ai;

select no_plan();

-- --- Fixtures (superuser — bypasses RLS; this is setup, not the test) -----
insert into core.tenants (id, slug, name) values
  ('50b00000-0000-0000-0000-000000000000', 'pgtap-smoke-tenant-b',   'pgTAP Smoke Tenant B (ops ON)'),
  ('50f00000-0000-0000-0000-000000000000', 'pgtap-smoke-tenant-off', 'pgTAP Smoke Tenant OFF (row, disabled)'),
  ('50000000-0000-0000-0000-000000000000', 'pgtap-smoke-tenant-nil', 'pgTAP Smoke Tenant NIL (no module row)');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('50b00000-0000-0000-0000-000000000000', 'operations', true),
  ('50f00000-0000-0000-0000-000000000000', 'operations', false);
-- tenant NIL: deliberately no operations row.

insert into core.locations (id, tenant_id, name, timezone) values
  ('50b10000-0000-0000-0000-000000000001', '50b00000-0000-0000-0000-000000000000', 'Smoke Cafe B / L1', 'Asia/Tokyo'),
  ('50b10000-0000-0000-0000-000000000002', '50b00000-0000-0000-0000-000000000000', 'Smoke Cafe B / L2', 'Asia/Tokyo'),
  ('50f10000-0000-0000-0000-000000000001', '50f00000-0000-0000-0000-000000000000', 'OFF Cafe / L1',     'Asia/Tokyo'),
  ('50010000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', 'NIL Cafe / L1',     'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('50b90000-0000-0000-0000-0000000000a1', 'B Manager tenant-wide'),
  ('50b90000-0000-0000-0000-0000000000a2', 'B Manager L1 only'),
  ('50b90000-0000-0000-0000-0000000000e1', 'B Employee L1'),
  ('50b90000-0000-0000-0000-0000000000c1', 'B Client L1 (no ops perm)'),
  ('50f90000-0000-0000-0000-0000000000a1', 'OFF Manager tenant-wide'),
  ('50090000-0000-0000-0000-0000000000a1', 'NIL Manager tenant-wide'),
  ('50ff0000-0000-0000-0000-0000000000ff', 'Non-member');

-- role ids: manager = ...005, employee = ...006, client = ...007
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('50b00000-0000-0000-0000-000000000000', '50b90000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000005', null),
  ('50b00000-0000-0000-0000-000000000000', '50b90000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000005', '50b10000-0000-0000-0000-000000000001'),
  ('50b00000-0000-0000-0000-000000000000', '50b90000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000006', '50b10000-0000-0000-0000-000000000001'),
  ('50b00000-0000-0000-0000-000000000000', '50b90000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000007', '50b10000-0000-0000-0000-000000000001'),
  ('50f00000-0000-0000-0000-000000000000', '50f90000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000005', null),
  ('50000000-0000-0000-0000-000000000000', '50090000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000005', null);

-- Seed templates directly (superuser fixture). B: one tenant-wide, one L2-scoped.
-- OFF tenant: one tenant-wide template that already exists from "when it was ON".
insert into operations.checklist_templates (id, tenant_id, location_id, name, category) values
  ('50b1e000-0000-0000-0000-0000000000b1', '50b00000-0000-0000-0000-000000000000', null,                                   'B opening (tenant-wide)', 'Opening'),
  ('50b1e000-0000-0000-0000-0000000000b2', '50b00000-0000-0000-0000-000000000000', '50b10000-0000-0000-0000-000000000002', 'B L2 closing',            'Closing'),
  ('50f1e000-0000-0000-0000-0000000000f1', '50f00000-0000-0000-0000-000000000000', null,                                   'OFF legacy template',     'Opening');

insert into operations.checklist_items (id, tenant_id, template_id, label, response_type, is_critical, numeric_min, numeric_max, numeric_unit) values
  ('50b17000-0000-0000-0000-000000000001', '50b00000-0000-0000-0000-000000000000', '50b1e000-0000-0000-0000-0000000000b1', 'Fridge temperature', 'numeric', true, 1, 5, 'C'),
  ('50b17000-0000-0000-0000-000000000002', '50b00000-0000-0000-0000-000000000000', '50b1e000-0000-0000-0000-0000000000b1', 'Floor mopped',       'boolean', false, null, null, null);

-- --- Role-hop helpers (same style as 0046 / 0047) ------------------------
create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end;
$$;

create function pg_temp.as_auth_throws(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return false;
exception when others then
  reset role;
  return true;
end;
$$;

-- Returns the SQLERRM of a failing statement run as an authenticated user
-- (so we can assert the *specific* fail-closed reason, not just "it threw").
create function pg_temp.as_auth_errm(p_sub text, p_sql text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return '<<no error>>';
exception when others then
  reset role;
  return sqlerrm;
end;
$$;

create function pg_temp.as_role_throws(p_role text, p_sql text)
returns boolean language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  return false;
exception when others then
  reset role;
  return true;
end;
$$;

grant execute on function api.operations_create_template(uuid, text, uuid, text, text) to authenticated;

-- ============================================================================
-- SCENARIO A — ENABLED_TENANT
--   smoke-tenant-b has Operations ON. A permitted Manager can see the
--   Operations foundation and perform a safe representative write.
-- ============================================================================
select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000a1',
    $$ select count(*)::int from api.operations_templates
        where tenant_id = '50b00000-0000-0000-0000-000000000000' $$),
  2, 'A/ENABLED: tenant-B manager reads both tenant-B templates through api.operations_templates');

select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000a1',
    $$ select count(*)::int from api.operations_template_items
        where tenant_id = '50b00000-0000-0000-0000-000000000000' $$),
  2, 'A/ENABLED: tenant-B manager reads the 2 checklist items of the tenant-wide template');

-- expected-tasks projection is reachable (no schedules yet -> 0 rows, but the
-- call itself must not error for an entitled caller).
select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000a1',
    $$ select count(*)::int from api.operations_expected_tasks(current_date, current_date) $$),
  0, 'A/ENABLED: tenant-B manager can call api.operations_expected_tasks (0 rows, no error)');

-- Representative write through the sanctioned config RPC (caller JWT, RLS + perm).
select is(
  pg_temp.as_auth_errm('50b90000-0000-0000-0000-0000000000a1',
    $$ select api.operations_create_template(
         '50b00000-0000-0000-0000-000000000000', 'Smoke A/ENABLED template', null, 'Smoke', null) $$),
  '<<no error>>', 'A/ENABLED: tenant-B manager creates a template via api.operations_create_template');

select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000a1',
    $$ select count(*)::int from api.operations_templates
        where tenant_id = '50b00000-0000-0000-0000-000000000000' $$),
  3, 'A/ENABLED: the newly created template is now visible (2 -> 3)');

-- ============================================================================
-- SCENARIO B — DISABLED_TENANT
--   Operations must be *enforced* off, not merely hidden in the UI:
--   both the read facade and the write RPC fail closed.
-- ============================================================================
select is(
  pg_temp.as_auth_count('50f90000-0000-0000-0000-0000000000a1',
    $$ select count(*)::int from api.operations_templates
        where tenant_id = '50f00000-0000-0000-0000-000000000000' $$),
  0, 'B/DISABLED: OFF-tenant manager sees zero templates through api.operations_templates');

select is(
  pg_temp.as_auth_count('50f90000-0000-0000-0000-0000000000a1',
    $$ select count(*)::int from operations.checklist_templates
        where tenant_id = '50f00000-0000-0000-0000-000000000000' $$),
  0, 'B/DISABLED: OFF-tenant manager sees zero templates through the base table directly');

select is(
  pg_temp.as_auth_errm('50f90000-0000-0000-0000-0000000000a1',
    $$ select api.operations_create_template(
         '50f00000-0000-0000-0000-000000000000', 'should fail', null, null, null) $$),
  'operations_module_disabled', 'B/DISABLED: api.operations_create_template raises operations_module_disabled for the OFF tenant');

select is(
  (select count(*)::int from operations.checklist_templates where tenant_id = '50f00000-0000-0000-0000-000000000000'),
  1, 'B/DISABLED: the OFF tenant''s legacy template still exists in storage (hidden, never deleted)');

-- fail-closed when there is NO tenant_modules row at all
select is(
  pg_temp.as_auth_count('50090000-0000-0000-0000-0000000000a1',
    $$ select count(*)::int from api.operations_templates
        where tenant_id = '50000000-0000-0000-0000-000000000000' $$),
  0, 'B/DISABLED: NIL-tenant (no operations row) manager sees zero templates — fail-closed');

select is(
  pg_temp.as_auth_errm('50090000-0000-0000-0000-0000000000a1',
    $$ select api.operations_create_template(
         '50000000-0000-0000-0000-000000000000', 'should fail', null, null, null) $$),
  'operations_module_disabled', 'B/DISABLED: NIL-tenant write RPC also fails closed (missing row = disabled)');

-- ============================================================================
-- SCENARIO C — CROSS_TENANT_ISOLATION
--   Using the same api.* path an application uses. Never accept
--   "the query included tenant_id" as proof.
-- ============================================================================
select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000a1',
    $$ select count(*)::int from api.operations_templates
        where tenant_id = '50f00000-0000-0000-0000-000000000000' $$),
  0, 'C/CROSS-TENANT: tenant-B manager sees zero templates of the OFF tenant');

select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000a1',
    $$ select count(*)::int from api.operations_templates $$),
  3, 'C/CROSS-TENANT: tenant-B manager''s unfiltered api.operations_templates read returns only tenant-B rows');

-- write attempt across the tenant boundary, via the sanctioned RPC
select is(
  pg_temp.as_auth_errm('50b90000-0000-0000-0000-0000000000a1',
    $$ select api.operations_create_template(
         '50000000-0000-0000-0000-000000000000', 'cross-tenant create', null, null, null) $$),
  'operations_module_disabled', 'C/CROSS-TENANT: tenant-B manager cannot create a template for another tenant (module gate on the target tenant)');

-- raw RLS with-check backstop: even a direct INSERT for another tenant is
-- rejected. (INSERT on operations.checklist_templates is already granted to
-- `authenticated` by migration 0105 — RLS, not the table grant, is the boundary.)
select ok(
  pg_temp.as_auth_throws('50b90000-0000-0000-0000-0000000000a1',
    $$ insert into operations.checklist_templates (tenant_id, location_id, name)
       values ('50f00000-0000-0000-0000-000000000000', null, 'raw cross-tenant') $$),
  'C/CROSS-TENANT: raw INSERT into another tenant is rejected by RLS with-check');

-- ============================================================================
-- SCENARIO D — ROLE_BOUNDARY  (Manager vs Staff / employee)
--   The foundation DOES define a Manager/Staff split: employee holds
--   task.read + task.execute only (no template.manage, no exception.resolve).
-- ============================================================================
select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000e1',
    $$ select count(*)::int from api.operations_templates
        where tenant_id = '50b00000-0000-0000-0000-000000000000' $$),
  2, 'D/ROLE: tenant-B employee (task.read) at L1 sees the tenant-wide templates (read allowed)');

select is(
  pg_temp.as_auth_errm('50b90000-0000-0000-0000-0000000000e1',
    $$ select api.operations_create_template(
         '50b00000-0000-0000-0000-000000000000', 'by employee', null, null, null) $$),
  'operations_permission_denied', 'D/ROLE: tenant-B employee cannot create a template (operations.template.manage denied)');

-- employee does NOT hold operations.exception.resolve; manager does. This is
-- the Manager-only half of the split, checked on the exact predicate the
-- exception-resolve RPC and its RLS use.
select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000e1',
    $$ select (core.has_permission_in_tenant(
         '50b00000-0000-0000-0000-000000000000', 'operations.exception.resolve'))::int $$),
  0, 'D/ROLE: tenant-B employee does NOT hold operations.exception.resolve');

select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000a1',
    $$ select (core.has_permission_in_tenant(
         '50b00000-0000-0000-0000-000000000000', 'operations.exception.resolve'))::int $$),
  1, 'D/ROLE: tenant-B manager DOES hold operations.exception.resolve');

select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000e1',
    $$ select (core.has_permission_in_tenant(
         '50b00000-0000-0000-0000-000000000000', 'operations.task.execute'))::int $$),
  1, 'D/ROLE: tenant-B employee DOES hold operations.task.execute (Staff can record results)');

-- client (member, no operations permission at all) sees nothing
select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000c1',
    $$ select count(*)::int from api.operations_templates
        where tenant_id = '50b00000-0000-0000-0000-000000000000' $$),
  0, 'D/ROLE: tenant-B client (no operations permission) sees zero templates');

-- ============================================================================
-- SCENARIO E — LOCATION_BOUNDARY
--   Operations IS location-scoped (location_id NULL = tenant-wide;
--   non-null = a real boundary via core.has_permission(..., location_id)).
-- ============================================================================
select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000a2',
    $$ select count(*)::int from api.operations_templates
        where tenant_id = '50b00000-0000-0000-0000-000000000000' $$),
  2, 'E/LOCATION: an L1-scoped manager sees tenant-wide templates (the 2 tenant-wide), not the L2-scoped one');

select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000a2',
    $$ select count(*)::int from api.operations_templates
        where template_id = '50b1e000-0000-0000-0000-0000000000b2' $$),
  0, 'E/LOCATION: the L1-scoped manager cannot see the L2-scoped template');

-- (UPDATE on operations.checklist_templates is already granted to
-- `authenticated` by migration 0105 — RLS is the boundary being tested here.)
select is(
  pg_temp.as_auth_count('50b90000-0000-0000-0000-0000000000a2',
    $$ with u as (
         update operations.checklist_templates set name = 'hijacked'
         where id = '50b1e000-0000-0000-0000-0000000000b2' returning 1
       ) select count(*)::int from u $$),
  0, 'E/LOCATION: the L1-scoped manager cannot UPDATE the L2-scoped template (0 rows affected)');

select is(
  (select name from operations.checklist_templates where id = '50b1e000-0000-0000-0000-0000000000b2'),
  'B L2 closing', 'E/LOCATION: the L2 template is unchanged after the blocked update');

-- ============================================================================
-- NEGATIVE / SECRET-SAFETY backstops
-- ============================================================================
select ok(
  pg_temp.as_role_throws('anon', $$ select count(*) from api.operations_templates $$),
  'NEGATIVE: anon is denied SELECT on api.operations_templates');

select ok(
  pg_temp.as_role_throws('anon', $$ select count(*) from operations.checklist_templates $$),
  'NEGATIVE: anon is denied SELECT on the operations.checklist_templates base table');

select is(
  pg_temp.as_auth_count('50ff0000-0000-0000-0000-0000000000ff',
    $$ select count(*)::int from api.operations_templates $$),
  0, 'NEGATIVE: a non-member authenticated user sees zero Operations templates anywhere');

select * from finish();
rollback;
