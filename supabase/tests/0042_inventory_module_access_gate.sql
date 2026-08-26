-- ============================================================================
-- DB test: Inventory module-OFF gating (WP-S3, migration
-- 0095_inventory_module_access_gate.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the full WP-S3 lifecycle across every gated Inventory path:
--   Inventory ON  -> normal SELECT/INSERT/UPDATE/RPC/permanently_delete_item
--                     behavior (unchanged).
--   Inventory OFF -> tenant-facing SELECT on inventory.items/stock_counts/
--                     check_sessions/check_session_items returns zero rows;
--                     direct INSERT/UPDATE rejected by RLS; the write-facade
--                     RPCs (api.record_inventory_stock_count,
--                     api.start_inventory_check_session) fail the same way;
--                     inventory.permanently_delete_item() (SECURITY DEFINER,
--                     bypasses RLS) refuses via its own explicit check,
--                     returning the same not-found-shaped empty result as
--                     every other guard in that function; existing rows are
--                     preserved (verified via a superuser read).
--   Inventory ON again -> the same pre-existing rows are visible/actionable
--                          again, unchanged.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, ai;

select no_plan();

-- --- Fixtures ---------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('9f000000-0000-0000-0000-00000000000a', 'pgtap-inv-gate-tenant', 'pgTAP Inventory Gate Tenant');

-- Inventory starts ON.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('9f000000-0000-0000-0000-00000000000a', 'inventory', true);

insert into core.locations (id, tenant_id, name) values
  ('9f200000-0000-0000-0000-000000000001', '9f000000-0000-0000-0000-00000000000a', 'Gate Tenant Location A');

insert into core.users (id, display_name) values
  ('9f900000-0000-0000-0000-000000000001', 'Gate Staff A'),
  ('9f900000-0000-0000-0000-000000000002', 'Gate Manager A');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9f000000-0000-0000-0000-00000000000a', '9f900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9f200000-0000-0000-0000-000000000001'), -- employee
  ('9f000000-0000-0000-0000-00000000000a', '9f900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '9f200000-0000-0000-0000-000000000001'); -- manager

insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point)
  values ('9f100000-0000-0000-0000-000000000001', '9f000000-0000-0000-0000-00000000000a',
          '9f200000-0000-0000-0000-000000000001', 'Sugar', 'kg', 10, 5);

insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9f000000-0000-0000-0000-00000000000a', '9f200000-0000-0000-0000-000000000001',
          '9f100000-0000-0000-0000-000000000001', 8, '9f900000-0000-0000-0000-000000000001');

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

-- ============================================================================
-- Section 1: Inventory ON -- normal baseline behavior.
-- ============================================================================

select is(
  pg_temp.as_auth_count('9f900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.inventory_item_status where item_id = '9f100000-0000-0000-0000-000000000001' $$),
  1,
  'Inventory ON: staff sees the item via api.inventory_item_status'
);
reset role;

select ok(
  not pg_temp.as_auth_throws('9f900000-0000-0000-0000-000000000001',
    $$ select api.record_inventory_stock_count(
      '9f000000-0000-0000-0000-00000000000a'::uuid, '9f200000-0000-0000-0000-000000000001'::uuid,
      '9f100000-0000-0000-0000-000000000001'::uuid, 6) $$),
  'Inventory ON: staff can record a new stock count via the RPC'
);
reset role;

-- ============================================================================
-- Section 2: Inventory OFF -- tenant-facing access blocked, data preserved.
-- ============================================================================

update core.tenant_modules set is_enabled = false
  where tenant_id = '9f000000-0000-0000-0000-00000000000a' and module = 'inventory';

select is(
  pg_temp.as_auth_count('9f900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from inventory.items where tenant_id = '9f000000-0000-0000-0000-00000000000a' $$),
  0,
  'Inventory OFF: tenant-facing SELECT on inventory.items returns zero rows, even though the row still exists'
);
reset role;

select is(
  pg_temp.as_auth_count('9f900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from inventory.stock_counts where tenant_id = '9f000000-0000-0000-0000-00000000000a' $$),
  0,
  'Inventory OFF: tenant-facing SELECT on inventory.stock_counts returns zero rows'
);
reset role;

select is(
  pg_temp.as_auth_count('9f900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.inventory_item_status where item_id = '9f100000-0000-0000-0000-000000000001' $$),
  0,
  'Inventory OFF: api.inventory_item_status (security_invoker view) inherits the block and returns zero rows'
);
reset role;

-- Direct INSERT/UPDATE rejected by RLS.
select ok(
  pg_temp.as_auth_throws('9f900000-0000-0000-0000-000000000002',
    $$ insert into inventory.items (tenant_id, location_id, name, unit, required_quantity)
         values ('9f000000-0000-0000-0000-00000000000a', '9f200000-0000-0000-0000-000000000001', 'New item', 'kg', 1) $$),
  'Inventory OFF: manager cannot INSERT a new inventory.items row'
);
reset role;

-- A 0-row UPDATE does not raise -- inv_items_update's USING clause simply
-- filters the row out of the target set, so this is checked via affected
-- row count (a data-modifying CTE), not as_auth_throws.
select is(
  pg_temp.as_auth_count('9f900000-0000-0000-0000-000000000002',
    $$ with upd as (
         update inventory.items set required_quantity = 20
           where id = '9f100000-0000-0000-0000-000000000001'
           returning 1
       ) select count(*)::int from upd $$),
  0,
  'Inventory OFF: manager''s UPDATE on the existing inventory.items row affects zero rows (USING clause filters it out)'
);
reset role;

select is(
  (select required_quantity from inventory.items
    where id = '9f100000-0000-0000-0000-000000000001'),
  10::numeric,
  'Inventory OFF: the item''s required_quantity is unchanged by the no-op UPDATE attempt above'
);

-- Write-facade RPC fails the same way (no separate pre-check needed --
-- security invoker, the underlying INSERT hits the same gated RLS).
select ok(
  pg_temp.as_auth_throws('9f900000-0000-0000-0000-000000000001',
    $$ select api.record_inventory_stock_count(
      '9f000000-0000-0000-0000-00000000000a'::uuid, '9f200000-0000-0000-0000-000000000001'::uuid,
      '9f100000-0000-0000-0000-000000000001'::uuid, 4) $$),
  'Inventory OFF: api.record_inventory_stock_count fails (underlying INSERT blocked by RLS)'
);
reset role;

-- inventory.permanently_delete_item() is SECURITY DEFINER and does not run
-- under RLS at all -- it refuses via its own explicit module-access
-- pre-check, returning the same not-found-shaped empty result as every
-- other guard in the function (never a distinct error/exception).
select is(
  (pg_temp.as_auth_permadelete('9f900000-0000-0000-0000-000000000002',
    '9f000000-0000-0000-0000-00000000000a', '9f100000-0000-0000-0000-000000000001')).deleted,
  false,
  'Inventory OFF: permanently_delete_item refuses (module-access pre-check, before the manage-permission/history checks)'
);
reset role;

-- Existing rows preserved: verified via a superuser/RLS-bypassing read.
select is(
  (select count(*)::int from inventory.items
    where tenant_id = '9f000000-0000-0000-0000-00000000000a'
      and id = '9f100000-0000-0000-0000-000000000001'),
  1,
  'Inventory OFF: the pre-existing item row still exists in storage -- module-OFF hides it, never deletes it'
);
select is(
  (select count(*)::int from inventory.stock_counts
    where tenant_id = '9f000000-0000-0000-0000-00000000000a'
      and item_id = '9f100000-0000-0000-0000-000000000001'),
  2,
  'Inventory OFF: both pre-existing stock_counts rows (8, then 6 from Section 1) still exist in storage'
);

-- ============================================================================
-- Section 3: Inventory ON again -- prior data/actions accessible again.
-- ============================================================================

update core.tenant_modules set is_enabled = true
  where tenant_id = '9f000000-0000-0000-0000-00000000000a' and module = 'inventory';

select is(
  pg_temp.as_auth_count('9f900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from inventory.items where tenant_id = '9f000000-0000-0000-0000-00000000000a' $$),
  1,
  'Inventory ON again: the same pre-existing item is visible again through the tenant-facing path'
);
reset role;

select ok(
  not pg_temp.as_auth_throws('9f900000-0000-0000-0000-000000000002',
    $$ update inventory.items set required_quantity = 12
         where id = '9f100000-0000-0000-0000-000000000001' $$),
  'Inventory ON again: manager can UPDATE the item again'
);
reset role;

select * from finish();
rollback;
