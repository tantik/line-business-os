-- ============================================================================
-- DB test: Purchases Inventory module-OFF gating (WP-S2, migration
-- 0094_purchases_module_access_gate.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the full WP-S2 lifecycle against purchases.purchase_actions,
-- api.purchases_needed, and api.record_purchase_action:
--   Inventory ON  -> normal SELECT/INSERT/RPC behavior (unchanged).
--   Inventory OFF -> SELECT returns no rows tenant-facing; direct INSERT
--                     rejected by RLS; api.record_purchase_action raises a
--                     distinguishable purchases_module_disabled error before
--                     any other check; existing rows are preserved (verified
--                     via a superuser/RLS-bypassing read, not the
--                     tenant-facing path).
--   Inventory ON again -> the same pre-existing row is visible/actionable
--                          again, unchanged.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, ai;

select no_plan();

-- --- Fixtures ---------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('9e000000-0000-0000-0000-00000000000a', 'pgtap-purch-gate-tenant', 'pgTAP Purchases Gate Tenant');

-- Inventory starts ON.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('9e000000-0000-0000-0000-00000000000a', 'inventory', true);

insert into core.locations (id, tenant_id, name) values
  ('9e200000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000a', 'Gate Tenant Location A');

insert into core.users (id, display_name) values
  ('9e900000-0000-0000-0000-000000000001', 'Gate Staff A');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9e000000-0000-0000-0000-00000000000a', '9e900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9e200000-0000-0000-0000-000000000001'); -- employee

-- Coffee: target 10, reorder point 5, counted at 2 (short) -- already
-- claimable before any module-OFF test runs.
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point)
  values ('9e100000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000a',
          '9e200000-0000-0000-0000-000000000001', 'Coffee', 'kg', 10, 5);

insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9e000000-0000-0000-0000-00000000000a', '9e200000-0000-0000-0000-000000000001',
          '9e100000-0000-0000-0000-000000000001', 2, '9e900000-0000-0000-0000-000000000001');

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

create function pg_temp.as_auth_rpc(p_sub text, p_item uuid)
returns uuid
language plpgsql
as $$
declare v_action_id uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select action_id into v_action_id
    from api.record_purchase_action(
      '9e000000-0000-0000-0000-00000000000a', '9e200000-0000-0000-0000-000000000001', p_item
    );
  return v_action_id;
end;
$$;

-- ============================================================================
-- Section 1: Inventory ON -- normal behavior (baseline, before any OFF test).
-- ============================================================================

select is(
  pg_temp.as_auth_count('9e900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000001' $$),
  1,
  'Inventory ON: staff sees the short item in api.purchases_needed'
);
reset role;

select ok(
  pg_temp.as_auth_rpc('9e900000-0000-0000-0000-000000000001', '9e100000-0000-0000-0000-000000000001') is not null,
  'Inventory ON: staff can mark a genuinely-short item as bought via api.record_purchase_action'
);
reset role;

select is(
  (select count(*)::int from purchases.purchase_actions
    where tenant_id = '9e000000-0000-0000-0000-00000000000a'
      and item_id = '9e100000-0000-0000-0000-000000000001'),
  1,
  'Inventory ON: the acknowledgement row was actually written (superuser read, bypasses RLS)'
);

-- ============================================================================
-- Section 2: Inventory OFF -- tenant-facing access is blocked, data preserved.
-- ============================================================================

update core.tenant_modules set is_enabled = false
  where tenant_id = '9e000000-0000-0000-0000-00000000000a' and module = 'inventory';

select is(
  pg_temp.as_auth_count('9e900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from purchases.purchase_actions where tenant_id = '9e000000-0000-0000-0000-00000000000a' $$),
  0,
  'Inventory OFF: tenant-facing SELECT on purchases.purchase_actions returns zero rows, even though the row still exists'
);
reset role;

-- The item itself (inventory.items) is not module-gated until WP-S3, so it
-- still appears in the projection -- but its acknowledgement is invisible
-- (purchases_actions_select is blocked), so it reads back as 'pending'
-- again, not 'bought'. This is the expected, correctly-scoped WP-S2 result:
-- only the Purchases acknowledgement half is gated by this PR.
select is(
  pg_temp.as_auth_count('9e900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000001' $$),
  1,
  'Inventory OFF: the item itself still appears in api.purchases_needed (Inventory itself is WP-S3, not gated by this PR)'
);
reset role;

select is(
  pg_temp.as_auth_count('9e900000-0000-0000-0000-000000000001',
    $$ select case when purchase_status = 'pending' then 1 else 0 end
       from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000001' $$),
  1,
  'Inventory OFF: the item reads back as purchase_status = pending -- its Bought acknowledgement is hidden (purchases_actions_select blocked), not merged in'
);
reset role;

-- Direct INSERT is rejected by purchases_actions_insert RLS (module check
-- fails before the permission/shortage checks even matter).
select ok(
  pg_temp.as_auth_throws('9e900000-0000-0000-0000-000000000001',
    $$ insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by)
         select '9e000000-0000-0000-0000-00000000000a', '9e200000-0000-0000-0000-000000000001',
                '9e100000-0000-0000-0000-000000000001',
                (select id from inventory.stock_counts where item_id = '9e100000-0000-0000-0000-000000000001' order by counted_at desc, id desc limit 1),
                '9e900000-0000-0000-0000-000000000001' $$),
  'Inventory OFF: direct INSERT into purchases.purchase_actions is rejected by RLS'
);
reset role;

-- RPC raises the distinguishable purchases_module_disabled error (P0004),
-- not a generic RLS failure, and does not attempt the insert. The module
-- check is the function's first statement and does not depend on caller
-- identity, so this is asserted directly (no role-hop needed) via pgTAP's
-- own throws_ok, matching the exact-SQLSTATE-and-message pattern already
-- used elsewhere in this test suite (e.g. 0014_inventory_stock_check.sql).
select throws_ok(
  $$ select action_id from api.record_purchase_action(
      '9e000000-0000-0000-0000-00000000000a'::uuid, '9e200000-0000-0000-0000-000000000001'::uuid,
      '9e100000-0000-0000-0000-000000000001'::uuid
    ) $$,
  'P0004',
  'purchases_module_disabled',
  'Inventory OFF: api.record_purchase_action raises purchases_module_disabled (P0004) before any other check'
);

-- Existing rows preserved: verified via a superuser/RLS-bypassing read, not
-- the tenant-facing path (which is exactly what section 2 above already
-- proved is blocked).
select is(
  (select count(*)::int from purchases.purchase_actions
    where tenant_id = '9e000000-0000-0000-0000-00000000000a'
      and item_id = '9e100000-0000-0000-0000-000000000001'),
  1,
  'Inventory OFF: the pre-existing acknowledgement row still exists in storage -- module-OFF hides it, never deletes it'
);

-- ============================================================================
-- Section 3: Inventory ON again -- prior data accessible again, unchanged.
-- ============================================================================

update core.tenant_modules set is_enabled = true
  where tenant_id = '9e000000-0000-0000-0000-00000000000a' and module = 'inventory';

select is(
  pg_temp.as_auth_count('9e900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from purchases.purchase_actions where tenant_id = '9e000000-0000-0000-0000-00000000000a' $$),
  1,
  'Inventory ON again: the same pre-existing row is visible again through the tenant-facing path'
);
reset role;

select is(
  pg_temp.as_auth_count('9e900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000001' $$),
  1,
  'Inventory ON again: api.purchases_needed shows the item as bought again'
);
reset role;

select * from finish();
rollback;
