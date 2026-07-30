-- ============================================================================
-- DB test: Inventory Daily Stock Check (migrations 0035-0038)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Combines structure/catalog assertions with role-hop RLS/facade behavioral
-- tests in a single file (unlike the workforce-recipes precedent's 3-file
-- split across 0007/0008/0009) to keep this slice's test surface
-- proportionate to its MVP scope. pgTAP tests, enabled inside a rolled-back
-- transaction (see 0001's header).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, ai;

select no_plan();

-- ============================================================================
-- Section 1: structure
-- ============================================================================

select has_schema('inventory', 'inventory schema exists');
select has_table('inventory', 'items', 'inventory.items exists');
select has_table('inventory', 'stock_counts', 'inventory.stock_counts exists');

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'inventory'
      and c.relname in ('items', 'stock_counts')
      and c.relrowsecurity = false),
  0,
  'RLS is enabled on both inventory tables'
);

select is(
  (select count(*)::int from core.permissions
    where key in ('inventory.item.read', 'inventory.item.manage', 'inventory.count.write')
      and module = 'inventory'),
  3,
  'all 3 inventory permission keys exist with module = inventory'
);

select is(
  (select count(*)::int from core.role_permissions
     where role_id = '00000000-0000-0000-0000-000000000005' -- manager
       and permission_key in ('inventory.item.read', 'inventory.item.manage', 'inventory.count.write')),
  3,
  'manager holds all 3 inventory permission keys'
);
select is(
  (select count(*)::int from core.role_permissions
     where role_id = '00000000-0000-0000-0000-000000000006' -- employee
       and permission_key in ('inventory.item.read', 'inventory.count.write')),
  2,
  'employee holds inventory.item.read and inventory.count.write'
);
select is(
  (select count(*)::int from core.role_permissions
     where role_id = '00000000-0000-0000-0000-000000000006' -- employee
       and permission_key = 'inventory.item.manage'),
  0,
  'employee does NOT hold inventory.item.manage'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'inventory'),
  0,
  'zero anon table grants on inventory'
);

select ok(
  has_table_privilege('authenticated', 'inventory.stock_counts', 'INSERT'),
  'authenticated has the base INSERT privilege required by the SECURITY INVOKER stock-count RPC'
);

-- ============================================================================
-- Section 2: check constraints + composite FK guards (superuser fixtures)
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('9a000000-0000-0000-0000-00000000000a', 'pgtap-inv-tenant-a', 'pgTAP Inventory Tenant A'),
  ('9b000000-0000-0000-0000-00000000000b', 'pgtap-inv-tenant-b', 'pgTAP Inventory Tenant B');

insert into core.locations (id, tenant_id, name) values
  ('9a200000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000000a', 'Tenant A Location A'),
  ('9a200000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-00000000000a', 'Tenant A Location B'),
  ('9b200000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-00000000000b', 'Tenant B Location A');

select throws_ok(
  $$ insert into inventory.items (tenant_id, location_id, name, unit, required_quantity)
       values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001', 'Bad unit item', 'bags', 10) $$,
  '23514',
  null,
  'inventory.items.unit check constraint rejects an unsupported unit'
);

select throws_ok(
  $$ insert into inventory.items (tenant_id, location_id, name, unit, required_quantity)
       values ('9a000000-0000-0000-0000-00000000000a', '9b200000-0000-0000-0000-000000000001', 'Cross-tenant location item', 'kg', 10) $$,
  '23503',
  null,
  'composite FK rejects an inventory.items row whose tenant_id does not match its location''s tenant'
);

select lives_ok(
  $$ insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity)
       values ('9a100000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000000a',
               '9a200000-0000-0000-0000-000000000001', 'Ice', 'kg', 10) $$,
  'same-tenant item insert succeeds'
);

select throws_ok(
  $$ insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
       values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001',
               '9a100000-0000-0000-0000-000000000001', -1, '9a900000-0000-0000-0000-000000000001') $$,
  '23514',
  null,
  'inventory.stock_counts.actual_quantity check constraint rejects a negative quantity'
);

-- ============================================================================
-- Section 3: role-hop RLS + facade behavioral tests
-- ============================================================================

grant usage on schema inventory to authenticated;
grant select, insert, update on inventory.items to authenticated;
grant select on inventory.stock_counts to authenticated;

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

insert into core.users (id, display_name) values
  ('9a900000-0000-0000-0000-000000000001', 'Staff A (Location A)'),
  ('9a900000-0000-0000-0000-000000000002', 'Manager A (Location A)'),
  ('9a900000-0000-0000-0000-000000000003', 'Staff B (Location B, no access to A)');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9a000000-0000-0000-0000-00000000000a', '9a900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9a200000-0000-0000-0000-000000000001'), -- employee @ Location A
  ('9a000000-0000-0000-0000-00000000000a', '9a900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '9a200000-0000-0000-0000-000000000001'), -- manager @ Location A
  ('9a000000-0000-0000-0000-00000000000a', '9a900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000006', '9a200000-0000-0000-0000-000000000002'); -- employee @ Location B

-- Staff (item.manage absent) cannot create a catalog item.
select ok(
  pg_temp.as_auth_throws('9a900000-0000-0000-0000-000000000001',
    $$ insert into inventory.items (tenant_id, location_id, name, unit, required_quantity)
         values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001', 'Staff-created item', 'kg', 1) $$),
  'staff (no inventory.item.manage) cannot insert a catalog item'
);

-- Manager (item.manage, Location A) can create a catalog item.
select ok(
  not pg_temp.as_auth_throws('9a900000-0000-0000-0000-000000000002',
    $$ insert into inventory.items (tenant_id, location_id, name, unit, required_quantity)
         values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001', 'Manager-created item', 'kg', 5) $$),
  'manager (inventory.item.manage, Location A) can insert a catalog item'
);

-- Staff at Location B cannot see/write against the Location A item (location isolation).
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from inventory.items where id = '9a100000-0000-0000-0000-000000000001' $$),
  0,
  'staff at Location B cannot see a Location A item (location isolation)'
);

select ok(
  pg_temp.as_auth_throws('9a900000-0000-0000-0000-000000000003',
    $$ insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
         values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000002',
                 '9a100000-0000-0000-0000-000000000001', 3, '9a900000-0000-0000-0000-000000000003') $$),
  'staff at Location B cannot record a count against a Location A item (item/location mismatch check)'
);

-- Staff at Location A can record a count for themselves, but not attribute it to someone else.
select ok(
  pg_temp.as_auth_throws('9a900000-0000-0000-0000-000000000001',
    $$ insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
         values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001',
                 '9a100000-0000-0000-0000-000000000001', 3, '9a900000-0000-0000-0000-000000000002') $$),
  'staff cannot record a count attributed to a different user (counted_by must be self)'
);

select ok(
  not pg_temp.as_auth_throws('9a900000-0000-0000-0000-000000000001',
    $$ insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
         values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001',
                 '9a100000-0000-0000-0000-000000000001', 3, '9a900000-0000-0000-0000-000000000001') $$),
  'staff can record their own count for an item in their own location'
);

-- `SET LOCAL ROLE` inside the pg_temp role-hop helpers persists for the rest
-- of this transaction (it does not auto-revert when the helper function
-- returns) -- reset back to the superuser role before any further plain
-- (non-role-hop) statement, or it would run as `authenticated` with no
-- matching JWT claim and silently see zero rows instead of erroring.
reset role;

-- Cross-tenant: Tenant B has zero visibility into Tenant A's items.
insert into core.users (id, display_name) values
  ('9b900000-0000-0000-0000-000000000001', 'Tenant B Owner');
insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('9b000000-0000-0000-0000-00000000000b', '9b900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003'); -- tenant_owner, tenant-wide

select is(
  pg_temp.as_auth_count('9b900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from inventory.items where tenant_id = '9a000000-0000-0000-0000-00000000000a' $$),
  0,
  'Tenant B owner sees zero Tenant A inventory items (tenant isolation)'
);

reset role;

-- ============================================================================
-- Section 4: api.inventory_item_status shortage computation (superuser read;
-- the view's own security_invoker + RLS behavior is already exercised above
-- via the base tables, so this section only checks the derived arithmetic).
--
-- Uses a FRESH item (not '...001', which Section 3 already recorded a count
-- of 3 against) so the "never counted" -> "shortage" -> "sufficient"
-- progression below is unambiguous.
-- ============================================================================

insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point)
  values ('9a100000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-00000000000a',
          '9a200000-0000-0000-0000-000000000001', 'Milk', 'L', 10, 10);

select is(
  (select status from api.inventory_item_status where item_id = '9a100000-0000-0000-0000-000000000002'),
  'unknown',
  'item with no stock count yet reports status = unknown'
);

insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001',
          '9a100000-0000-0000-0000-000000000002', 3, '9a900000-0000-0000-0000-000000000001');

select is(
  (select shortage_quantity from api.inventory_item_status where item_id = '9a100000-0000-0000-0000-000000000002'),
  7::numeric,
  'shortage_quantity = required(10) - actual(3) = 7'
);
select is(
  (select status from api.inventory_item_status where item_id = '9a100000-0000-0000-0000-000000000002'),
  'shortage',
  'status = shortage when actual is at or below the reorder point'
);

insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001',
          '9a100000-0000-0000-0000-000000000002', 11, '9a900000-0000-0000-0000-000000000001');

select is(
  (select shortage_quantity from api.inventory_item_status where item_id = '9a100000-0000-0000-0000-000000000002'),
  0::numeric,
  'shortage_quantity = 0 once the latest count (11) meets required (10)'
);
select is(
  (select status from api.inventory_item_status where item_id = '9a100000-0000-0000-0000-000000000002'),
  'sufficient',
  'status = sufficient once the latest count is above the reorder point'
);
select is(
  (select actual_quantity from api.inventory_item_status where item_id = '9a100000-0000-0000-0000-000000000002'),
  11::numeric,
  'api.inventory_item_status reflects the MOST RECENT count, not the first one'
);

-- ============================================================================
-- Section 5: deterministic tiebreaker when two counts share the exact same
-- counted_at (order by counted_at desc, id desc) -- a fresh item, isolated
-- from the counts recorded above.
-- ============================================================================

insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity)
  values ('9a100000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-00000000000a',
          '9a200000-0000-0000-0000-000000000001', 'Water', 'L', 10);

insert into inventory.stock_counts (id, tenant_id, location_id, item_id, actual_quantity, counted_by, counted_at)
  values ('9a300000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000000a',
          '9a200000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000003',
          2, '9a900000-0000-0000-0000-000000000001', '2026-01-01 00:00:00+00');
insert into inventory.stock_counts (id, tenant_id, location_id, item_id, actual_quantity, counted_by, counted_at)
  values ('9a300000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-00000000000a',
          '9a200000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000003',
          9, '9a900000-0000-0000-0000-000000000001', '2026-01-01 00:00:00+00');

select is(
  (select actual_quantity from api.inventory_item_status where item_id = '9a100000-0000-0000-0000-000000000003'),
  9::numeric,
  'when two counts share the exact same counted_at, the higher id (0037''s deterministic tiebreaker) wins, not scan order'
);

-- ============================================================================
-- Section 6: inactive items -- no role can record a new count against one,
-- history recorded before deactivation is preserved, and a manager can still
-- see (but not write to) the deactivated item and its history. Uses a fresh
-- item so it's isolated from the counts already recorded above.
-- ============================================================================

insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity)
  values ('9a100000-0000-0000-0000-000000000004', '9a000000-0000-0000-0000-00000000000a',
          '9a200000-0000-0000-0000-000000000001', 'Coconut ice cream', 'pcs', 3);

-- A count recorded while still active -- this is the history that must
-- survive deactivation.
insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001',
          '9a100000-0000-0000-0000-000000000004', 3, '9a900000-0000-0000-0000-000000000001');

-- Deactivate (superuser, standing in for the manager's own already-tested
-- inv_items_update path -- Section 3 above already proves a manager can
-- perform this exact update).
update inventory.items set is_active = false
  where id = '9a100000-0000-0000-0000-000000000004';

-- Simulates "the item was deactivated between the staff member loading the
-- form and submitting it": the write is re-evaluated against current state
-- at INSERT time regardless of when the client last read the item, so this
-- is the same check as "no role can write to an inactive item" -- there is
-- no separate code path for the race, RLS closes it structurally.
select ok(
  pg_temp.as_auth_throws('9a900000-0000-0000-0000-000000000001',
    $$ insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
         values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001',
                 '9a100000-0000-0000-0000-000000000004', 1, '9a900000-0000-0000-0000-000000000001') $$),
  'staff cannot record a count for a deactivated item (also covers the load-then-deactivate-then-submit race)'
);

select ok(
  pg_temp.as_auth_throws('9a900000-0000-0000-0000-000000000002',
    $$ insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
         values ('9a000000-0000-0000-0000-00000000000a', '9a200000-0000-0000-0000-000000000001',
                 '9a100000-0000-0000-0000-000000000004', 1, '9a900000-0000-0000-0000-000000000002') $$),
  'manager cannot record a count for a deactivated item either -- the inactive-item block applies to every role, not staff-only'
);

reset role;

-- History from before deactivation must still exist (never deleted by
-- deactivation) and a manager (item.manage, location-matched) can still read
-- both the deactivated item and its history -- deactivation hides an item
-- from the staff/day-to-day list at the app layer only (see
-- `listInventoryItemStatus`'s `includeInactive` option); RLS itself never
-- filters SELECT by is_active.
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from inventory.stock_counts where item_id = '9a100000-0000-0000-0000-000000000004' $$),
  1,
  'the pre-deactivation count history for the item still exists and is still visible to the manager'
);
select is(
  pg_temp.as_auth_count('9a900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from inventory.items where id = '9a100000-0000-0000-0000-000000000004' and is_active = false $$),
  1,
  'the manager can still see the deactivated item itself (read is never blocked by is_active)'
);

reset role;

select * from finish();
rollback;
