-- ============================================================================
-- DB test: Operations module foundation slice (migrations
-- 0099_core_module_code_add_operations.sql + 0100_operations_module_foundation.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves, for the foundation slice (checklist_templates + checklist_items only):
--   1. permission catalog + role seed are exactly as designed
--   2. tenant isolation (incl. the P2-6 cross-tenant parent-forgery attack)
--   3. location isolation (location-scoped templates are a real boundary)
--   4. permission enforcement (employee cannot configure; client/non-member
--      see nothing; anon fully denied)
--   5. module ON -> OFF -> ON lifecycle with historical-data preservation
--   6. fail-closed when the tenant has no core.tenant_modules row at all
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, ai;

select no_plan();

-- --- Fixtures -------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('0a110000-0000-0000-0000-000000000000', 'pgtap-ops-tenant-a', 'pgTAP Ops Tenant A'),
  ('0b220000-0000-0000-0000-000000000000', 'pgtap-ops-tenant-b', 'pgTAP Ops Tenant B'),
  ('0c330000-0000-0000-0000-000000000000', 'pgtap-ops-tenant-c', 'pgTAP Ops Tenant C (no module row)');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0a110000-0000-0000-0000-000000000000', 'operations', true),
  ('0b220000-0000-0000-0000-000000000000', 'operations', true);
-- Tenant C deliberately has NO operations row.

insert into core.locations (id, tenant_id, name) values
  ('0a100000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', 'A / Location 1'),
  ('0a100000-0000-0000-0000-000000000002', '0a110000-0000-0000-0000-000000000000', 'A / Location 2'),
  ('0b100000-0000-0000-0000-000000000001', '0b220000-0000-0000-0000-000000000000', 'B / Location 1'),
  ('0c100000-0000-0000-0000-000000000001', '0c330000-0000-0000-0000-000000000000', 'C / Location 1');

insert into core.users (id, display_name) values
  ('0a900000-0000-0000-0000-00000000000a', 'A Manager tenant-wide'),
  ('0a900000-0000-0000-0000-00000000000b', 'A Manager location 1'),
  ('0a900000-0000-0000-0000-00000000000c', 'A Employee location 1'),
  ('0a900000-0000-0000-0000-00000000000d', 'A Client location 1'),
  ('0aff0000-0000-0000-0000-0000000000ff', 'Non-member'),
  ('0b900000-0000-0000-0000-00000000000a', 'B Manager tenant-wide'),
  ('0c900000-0000-0000-0000-00000000000a', 'C Manager tenant-wide');

-- role ids: manager = ...005, employee = ...006, client = ...007
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null),
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', '0a100000-0000-0000-0000-000000000001'),
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000006', '0a100000-0000-0000-0000-000000000001'),
  ('0a110000-0000-0000-0000-000000000000', '0a900000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000007', '0a100000-0000-0000-0000-000000000001'),
  ('0b220000-0000-0000-0000-000000000000', '0b900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null),
  ('0c330000-0000-0000-0000-000000000000', '0c900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null);

-- Templates (inserted as superuser, bypassing RLS — this is fixture setup).
insert into operations.checklist_templates (id, tenant_id, location_id, name, category) values
  ('0a1e0000-0000-0000-0000-00000000000a', '0a110000-0000-0000-0000-000000000000', null,                                   'A tenant-wide template', 'Opening'),
  ('0a1e0000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', 'A location-1 template',  'Closing'),
  ('0a1e0000-0000-0000-0000-000000000002', '0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000002', 'A location-2 template',  'Cleaning'),
  ('0b2e0000-0000-0000-0000-00000000000b', '0b220000-0000-0000-0000-000000000000', null,                                   'B tenant-wide template', 'Opening'),
  ('0c3e0000-0000-0000-0000-00000000000c', '0c330000-0000-0000-0000-000000000000', null,                                   'C tenant-wide template', 'Opening');

insert into operations.checklist_items (id, tenant_id, template_id, label, response_type, is_critical, numeric_min, numeric_max, numeric_unit) values
  ('0a170000-0000-0000-0000-000000000001', '0a110000-0000-0000-0000-000000000000', '0a1e0000-0000-0000-0000-00000000000a', 'Fridge temperature', 'numeric', true, 1, 5, 'C'),
  ('0a170000-0000-0000-0000-000000000002', '0a110000-0000-0000-0000-000000000000', '0a1e0000-0000-0000-0000-00000000000a', 'Floor mopped',       'boolean', false, null, null, null);

-- --- Role-hop helpers (match supabase/tests/0041 style) ------------------
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

-- ============================================================================
-- Section 1: permission catalog + role seed
-- ============================================================================
select is(
  (select count(*)::int from core.permissions
     where key in ('operations.template.manage','operations.task.read','operations.task.execute','operations.exception.resolve')
       and module = 'operations'),
  4, 'catalog: all 4 operations.* permission keys exist tagged module=operations');

select is(
  (select count(*)::int from core.role_permissions
     where role_id = '00000000-0000-0000-0000-000000000005' and permission_key like 'operations.%'),
  4, 'seed: manager holds all 4 operations permissions');

select is(
  (select count(*)::int from core.role_permissions
     where role_id = '00000000-0000-0000-0000-000000000006' and permission_key like 'operations.%'),
  2, 'seed: employee holds exactly 2 operations permissions');

select ok(
  exists (select 1 from core.role_permissions where role_id = '00000000-0000-0000-0000-000000000006' and permission_key = 'operations.task.read')
  and exists (select 1 from core.role_permissions where role_id = '00000000-0000-0000-0000-000000000006' and permission_key = 'operations.task.execute')
  and not exists (select 1 from core.role_permissions where role_id = '00000000-0000-0000-0000-000000000006' and permission_key = 'operations.template.manage')
  and not exists (select 1 from core.role_permissions where role_id = '00000000-0000-0000-0000-000000000006' and permission_key = 'operations.exception.resolve'),
  'seed: employee = task.read + task.execute only (no template.manage, no exception.resolve)');

select is(
  (select count(*)::int from core.role_permissions
     where role_id = '00000000-0000-0000-0000-000000000003' and permission_key like 'operations.%'),
  4, 'seed: tenant_owner holds all 4 operations permissions');

-- ============================================================================
-- Section 2: tenant isolation (operations ON for A and B)
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_templates where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  3, 'tenant isolation: A manager sees all 3 tenant-A templates');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_templates where tenant_id = '0b220000-0000-0000-0000-000000000000' $$),
  0, 'tenant isolation: A manager sees zero tenant-B templates');

select is(
  pg_temp.as_auth_count('0b900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_templates where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  0, 'tenant isolation: B manager sees zero tenant-A templates');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_template_items i
         join api.operations_templates t on t.template_id = i.template_id
        where i.tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  2, 'tenant isolation: A manager sees the 2 items under the A tenant-wide template');

-- P2-6: cross-tenant parent forgery — claim tenant_id = A but reference a
-- template that belongs to B. Composite FK (tenant_id, template_id) makes the
-- row unresolvable; RLS with-check would also reject it.
grant insert on operations.checklist_items to authenticated;
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000a',
    $$ insert into operations.checklist_items (tenant_id, template_id, label, response_type)
       values ('0a110000-0000-0000-0000-000000000000', '0b2e0000-0000-0000-0000-00000000000b', 'forged', 'text') $$),
  'P2-6: A manager cannot insert an item claiming tenant A but pointing at a tenant-B template');
revoke insert on operations.checklist_items from authenticated;

-- Cross-tenant template insert — A manager tries to create a template for B.
grant insert on operations.checklist_templates to authenticated;
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000a',
    $$ insert into operations.checklist_templates (tenant_id, location_id, name)
       values ('0b220000-0000-0000-0000-000000000000', null, 'cross-tenant') $$),
  'tenant isolation: A manager cannot create a template for tenant B (RLS with check)');
revoke insert on operations.checklist_templates from authenticated;

-- ============================================================================
-- Section 3: location isolation
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000b',
    $$ select count(*)::int from api.operations_templates where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  2, 'location isolation: L1-scoped manager sees tenant-wide + L1 templates (2), not L2');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000b',
    $$ select count(*)::int from api.operations_templates
        where template_id = '0a1e0000-0000-0000-0000-000000000002' $$),
  0, 'location isolation: L1-scoped manager cannot see the L2-scoped template');

grant update on operations.checklist_templates to authenticated;
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000b',
    $$ with u as (
         update operations.checklist_templates set name = 'hijacked'
         where id = '0a1e0000-0000-0000-0000-000000000002' returning 1
       ) select count(*)::int from u $$),
  0, 'location isolation: L1-scoped manager cannot UPDATE the L2-scoped template (0 rows)');
revoke update on operations.checklist_templates from authenticated;

select is(
  (select name from operations.checklist_templates where id = '0a1e0000-0000-0000-0000-000000000002'),
  'A location-2 template', 'location isolation: the L2 template name is unchanged after the blocked update');

-- ============================================================================
-- Section 4: permission enforcement
-- ============================================================================
select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000c',
    $$ select count(*)::int from api.operations_templates where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  2, 'permission: employee (task.read) at L1 sees tenant-wide + L1 templates');

grant insert on operations.checklist_templates to authenticated;
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000c',
    $$ insert into operations.checklist_templates (tenant_id, location_id, name)
       values ('0a110000-0000-0000-0000-000000000000', '0a100000-0000-0000-0000-000000000001', 'by employee') $$),
  'permission: employee (no template.manage) cannot create a template');
revoke insert on operations.checklist_templates from authenticated;

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000d',
    $$ select count(*)::int from api.operations_templates where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  0, 'permission: tenant-A client (no operations permission) sees zero templates');

select is(
  pg_temp.as_auth_count('0aff0000-0000-0000-0000-0000000000ff',
    $$ select count(*)::int from api.operations_templates $$),
  0, 'permission: non-member sees zero templates');

select ok(
  pg_temp.as_role_throws('anon', $$ select count(*) from api.operations_templates $$),
  'permission: anon is denied SELECT on api.operations_templates');

select ok(
  pg_temp.as_role_throws('anon', $$ select count(*) from operations.checklist_templates $$),
  'permission: anon is denied SELECT on operations.checklist_templates base table');

-- ============================================================================
-- Section 5: module ON -> OFF -> ON, historical data preserved
-- ============================================================================
update core.tenant_modules set is_enabled = false
  where tenant_id = '0a110000-0000-0000-0000-000000000000' and module = 'operations';

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_templates where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  0, 'module OFF: A manager sees zero templates through the api facade');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from operations.checklist_templates where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  0, 'module OFF: A manager sees zero templates through direct base-table SELECT');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_template_items where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  0, 'module OFF: A manager sees zero checklist items');

grant insert on operations.checklist_templates to authenticated;
select ok(
  pg_temp.as_auth_throws('0a900000-0000-0000-0000-00000000000a',
    $$ insert into operations.checklist_templates (tenant_id, location_id, name)
       values ('0a110000-0000-0000-0000-000000000000', null, 'while off') $$),
  'module OFF: A manager cannot create a template (module gate in with check)');
revoke insert on operations.checklist_templates from authenticated;

select is(
  (select count(*)::int from operations.checklist_templates where tenant_id = '0a110000-0000-0000-0000-000000000000'),
  3, 'module OFF: the 3 pre-existing templates still exist in storage (superuser read) — hidden, never deleted');

select is(
  (select count(*)::int from operations.checklist_items where tenant_id = '0a110000-0000-0000-0000-000000000000'),
  2, 'module OFF: the 2 pre-existing items still exist in storage');

update core.tenant_modules set is_enabled = true
  where tenant_id = '0a110000-0000-0000-0000-000000000000' and module = 'operations';

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_templates where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  3, 'module ON again: A manager sees all 3 templates again, unchanged');

select is(
  pg_temp.as_auth_count('0a900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_template_items where tenant_id = '0a110000-0000-0000-0000-000000000000' $$),
  2, 'module ON again: A manager sees the 2 items again');

-- ============================================================================
-- Section 6: fail closed when the tenant has NO core.tenant_modules row
-- ============================================================================
select is(
  pg_temp.as_auth_count('0c900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.operations_templates where tenant_id = '0c330000-0000-0000-0000-000000000000' $$),
  0, 'fail-closed: tenant C (no operations tenant_modules row) — manager sees zero templates');

select * from finish();
rollback;
