-- ============================================================================
-- DB test: Inventory guarded permanent-delete RPC (migration 0055)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Mirrors 0014_inventory_stock_check.sql's role-hop fixture pattern
-- (pg_temp.as_auth_count / as_auth_throws, built-in manager/employee role
-- ids). inventory.items still has no DELETE RLS policy (0036) -- every
-- assertion below goes through api.permanently_delete_inventory_item, the
-- sole guarded exception, never a raw DELETE.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, ai;

select no_plan();

-- ============================================================================
-- Section 1: structure
-- ============================================================================

select has_function('api', 'permanently_delete_inventory_item', array['uuid', 'uuid'], 'api.permanently_delete_inventory_item exists');

select ok(
  has_function_privilege('authenticated', 'api.permanently_delete_inventory_item(uuid, uuid)', 'EXECUTE'),
  'authenticated can execute api.permanently_delete_inventory_item'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'inventory' and table_name = 'items' and privilege_type = 'DELETE'
      -- Excludes the table owner: Postgres always reports an implicit grant
      -- row for the owner (it is not an explicit `grant ... to` statement,
      -- and every table has one regardless of this migration) -- the
      -- invariant this asserts is "no *application* role was granted
      -- DELETE", not "zero rows in this view".
      and grantee not in (select tableowner from pg_tables where schemaname = 'inventory' and tablename = 'items')),
  0,
  'no DELETE grant to any application role exists on inventory.items -- the RPC is still the only hard-delete path'
);

-- ============================================================================
-- Section 2: role-hop behavioral tests
-- ============================================================================

grant usage on schema inventory to authenticated;
grant usage on schema api to authenticated;

create function pg_temp.as_auth_permadelete(p_sub text, p_tenant uuid, p_item uuid, out deleted boolean, out blocked_by_history boolean)
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select r.deleted, r.blocked_by_history
    into deleted, blocked_by_history
    from api.permanently_delete_inventory_item(p_tenant, p_item) r;
  deleted := coalesce(deleted, false);
  blocked_by_history := coalesce(blocked_by_history, false);
end;
$$;

insert into core.tenants (id, slug, name) values
  ('9c000000-0000-0000-0000-00000000000c', 'pgtap-inv-permadelete-tenant', 'pgTAP Inventory Permadelete Tenant');

insert into core.locations (id, tenant_id, name) values
  ('9c200000-0000-0000-0000-000000000001', '9c000000-0000-0000-0000-00000000000c', 'Location A'),
  ('9c200000-0000-0000-0000-000000000002', '9c000000-0000-0000-0000-00000000000c', 'Location B');

insert into core.users (id, display_name) values
  ('9c900000-0000-0000-0000-000000000001', 'Staff A (Location A)'),
  ('9c900000-0000-0000-0000-000000000002', 'Manager A (Location A)'),
  ('9c900000-0000-0000-0000-000000000003', 'Manager B (Location B)');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9c000000-0000-0000-0000-00000000000c', '9c900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9c200000-0000-0000-0000-000000000001'), -- employee @ Location A
  ('9c000000-0000-0000-0000-00000000000c', '9c900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '9c200000-0000-0000-0000-000000000001'), -- manager @ Location A
  ('9c000000-0000-0000-0000-00000000000c', '9c900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000005', '9c200000-0000-0000-0000-000000000002'); -- manager @ Location B

insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity) values
  ('9c100000-0000-0000-0000-000000000001', '9c000000-0000-0000-0000-00000000000c',
   '9c200000-0000-0000-0000-000000000001', 'Never counted item', 'kg', 5),
  ('9c100000-0000-0000-0000-000000000002', '9c000000-0000-0000-0000-00000000000c',
   '9c200000-0000-0000-0000-000000000001', 'Item with history', 'kg', 5);

insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by) values
  ('9c000000-0000-0000-0000-00000000000c', '9c200000-0000-0000-0000-000000000001',
   '9c100000-0000-0000-0000-000000000002', 3, '9c900000-0000-0000-0000-000000000002');

-- Second FK-bound reference to the same item (0045), so the 0082 delete path
-- is exercised against both tables that point at inventory.items, not just
-- stock_counts -- a real (non-cascading) FK here would otherwise turn a
-- permanent-delete attempt into an unhandled constraint-violation error.
insert into inventory.check_sessions (id, tenant_id, location_id, business_date, check_type, started_by) values
  ('9c300000-0000-0000-0000-000000000001', '9c000000-0000-0000-0000-00000000000c',
   '9c200000-0000-0000-0000-000000000001', current_date, 'opening', '9c900000-0000-0000-0000-000000000002');
insert into inventory.check_session_items (tenant_id, location_id, session_id, item_id, item_name, unit, required_quantity) values
  ('9c000000-0000-0000-0000-00000000000c', '9c200000-0000-0000-0000-000000000001',
   '9c300000-0000-0000-0000-000000000001', '9c100000-0000-0000-0000-000000000002', 'Item with history', 'kg', 5);

-- Staff (item.manage absent) cannot permanently delete -- refused (zero rows), item still exists.
select is(
  (select deleted from pg_temp.as_auth_permadelete('9c900000-0000-0000-0000-000000000001',
    '9c000000-0000-0000-0000-00000000000c', '9c100000-0000-0000-0000-000000000001')),
  false,
  'staff (no inventory.item.manage) cannot permanently delete an item'
);
-- `SET LOCAL ROLE` inside pg_temp.as_auth_permadelete persists for the rest of
-- this transaction -- reset back to the superuser role before any plain
-- (non-role-hop) statement, same reasoning as 0014_inventory_stock_check.sql.
reset role;
select ok(
  exists(select 1 from inventory.items where id = '9c100000-0000-0000-0000-000000000001'),
  'item still exists after a staff (unauthorized) permanent-delete attempt'
);

-- Manager at Location B cannot delete a Location A item (location-scoped permission).
select is(
  (select deleted from pg_temp.as_auth_permadelete('9c900000-0000-0000-0000-000000000003',
    '9c000000-0000-0000-0000-00000000000c', '9c100000-0000-0000-0000-000000000001')),
  false,
  'manager at Location B cannot permanently delete a Location A item'
);
reset role;
select ok(
  exists(select 1 from inventory.items where id = '9c100000-0000-0000-0000-000000000001'),
  'item still exists after a cross-location permanent-delete attempt'
);

-- 0082 (Founder decision, 2026-08-23): manager at Location A CAN permanently
-- delete an item WITH stock-count history too -- the history goes with it.
select results_eq(
  $$ select deleted, blocked_by_history from pg_temp.as_auth_permadelete('9c900000-0000-0000-0000-000000000002',
       '9c000000-0000-0000-0000-00000000000c', '9c100000-0000-0000-0000-000000000002') $$,
  $$ values (true, false) $$,
  'manager permanently deletes an item WITH stock-count history (0082 -- no longer refused)'
);
reset role;
select ok(
  not exists(select 1 from inventory.items where id = '9c100000-0000-0000-0000-000000000002'),
  'the item with history is actually gone'
);
select ok(
  not exists(select 1 from inventory.stock_counts where item_id = '9c100000-0000-0000-0000-000000000002'),
  'its stock-count history is gone too -- deleted along with the item, not orphaned'
);
select ok(
  not exists(select 1 from inventory.check_session_items where item_id = '9c100000-0000-0000-0000-000000000002'),
  'its check_session_items reference is gone too -- the other FK-bound table pointing at inventory.items'
);
select ok(
  exists(select 1 from inventory.check_sessions where id = '9c300000-0000-0000-0000-000000000001'),
  'the check_sessions row itself is untouched (only the item-scoped snapshot row was cleaned up)'
);

-- Manager at Location A can permanently delete the item with zero history.
select results_eq(
  $$ select deleted, blocked_by_history from pg_temp.as_auth_permadelete('9c900000-0000-0000-0000-000000000002',
       '9c000000-0000-0000-0000-00000000000c', '9c100000-0000-0000-0000-000000000001') $$,
  $$ values (true, false) $$,
  'manager (inventory.item.manage, same location) permanently deletes an item with no stock-count history'
);
reset role;
select ok(
  not exists(select 1 from inventory.items where id = '9c100000-0000-0000-0000-000000000001'),
  'the item row is actually gone after a successful permanent delete'
);

-- A second attempt against the now-gone item is reported as not_found (zero rows), not an error.
select is(
  (select deleted from pg_temp.as_auth_permadelete('9c900000-0000-0000-0000-000000000002',
    '9c000000-0000-0000-0000-00000000000c', '9c100000-0000-0000-0000-000000000001')),
  false,
  're-deleting an already-gone item is reported as not-found, not an error'
);

reset role;
select * from finish();
rollback;
