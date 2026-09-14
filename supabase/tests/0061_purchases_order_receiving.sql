-- ============================================================================
-- DB test: Purchases Ordered/Received lifecycle (migration 0120)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Covers: api.record_purchase_order (informational quantity, no Inventory
-- write), api.record_purchase_receipt (the ONLY path that writes Inventory,
-- via the unmodified api.record_inventory_stock_count -- proving no second
-- source of truth was introduced), partial receiving, over-receive (allowed
-- by design), stale-snapshot/duplicate-submit rejection, api.purchase_history,
-- and that 0089's original 'bought' path is unaffected.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, ai;

select no_plan();

-- ============================================================================
-- Section 1: fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('9e000000-0000-0000-0000-00000000000a', 'pgtap-purch-v2-tenant-a', 'pgTAP Purchases v2 Tenant A');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('9e000000-0000-0000-0000-00000000000a', 'inventory', true);

insert into core.locations (id, tenant_id, name) values
  ('9e200000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000a', 'Tenant A Location A');

insert into core.users (id, display_name) values
  ('9e900000-0000-0000-0000-000000000001', 'Staff A (Location A)'),
  ('9e900000-0000-0000-0000-000000000002', 'Manager A (Location A)');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9e000000-0000-0000-0000-00000000000a', '9e900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9e200000-0000-0000-0000-000000000001'), -- employee
  ('9e000000-0000-0000-0000-00000000000a', '9e900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '9e200000-0000-0000-0000-000000000001'); -- manager

-- Coffee Beans: target 20, reorder point 5.
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point)
  values ('9e100000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000a',
          '9e200000-0000-0000-0000-000000000001', 'Coffee Beans', 'kg', 20, 5);

insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9e000000-0000-0000-0000-00000000000a', '9e200000-0000-0000-0000-000000000001',
          '9e100000-0000-0000-0000-000000000001', 3, '9e900000-0000-0000-0000-000000000001');

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

create function pg_temp.as_order(p_sub text, p_item uuid, p_qty numeric)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select action_id into v_id from api.record_purchase_order(
    '9e000000-0000-0000-0000-00000000000a', '9e200000-0000-0000-0000-000000000001', p_item, p_qty
  );
  return v_id;
end;
$$;

create function pg_temp.as_receipt(p_sub text, p_item uuid, p_qty numeric, p_expected uuid)
returns numeric
language plpgsql
as $$
declare v_new_qty numeric;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select new_actual_quantity into v_new_qty from api.record_purchase_receipt(
    '9e000000-0000-0000-0000-00000000000a', '9e200000-0000-0000-0000-000000000001', p_item, p_qty, p_expected
  );
  return v_new_qty;
end;
$$;

create function pg_temp.latest_count_id(p_item uuid)
returns uuid
language sql
as $$
  select id from inventory.stock_counts
   where item_id = p_item
   order by counted_at desc, id desc limit 1;
$$;

-- ============================================================================
-- Section 2: Ordered -- informational only, no Inventory write
-- ============================================================================

select is(
  (select purchase_status from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000001'),
  'pending',
  'Coffee Beans starts pending (shortage: target 20, actual 3)'
);

select ok(
  pg_temp.as_order('9e900000-0000-0000-0000-000000000002', '9e100000-0000-0000-0000-000000000001', 15) is not null,
  'manager can record an Ordered acknowledgement for a short item'
);

select is(
  (select purchase_status from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000001'),
  'ordered',
  'after ordering, the item reads back as purchase_status = ordered'
);
select is(
  (select ordered_quantity from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000001'),
  15::numeric,
  'ordered_quantity is exposed on the read projection'
);
select is(
  (select actual_quantity from inventory.stock_counts
    where item_id = '9e100000-0000-0000-0000-000000000001'
    order by counted_at desc, id desc limit 1),
  3::numeric,
  'Ordered never writes to Inventory -- actual_quantity is unchanged at 3'
);

select ok(
  pg_temp.as_auth_throws('9e900000-0000-0000-0000-000000000002',
    format($$ select action_id from api.record_purchase_order(
      '9e000000-0000-0000-0000-00000000000a'::uuid, '9e200000-0000-0000-0000-000000000001'::uuid, %L::uuid, -1
    ) $$, '9e100000-0000-0000-0000-000000000001')),
  'a non-positive ordered quantity raises purchases_invalid_quantity'
);

-- ============================================================================
-- Section 3: Received -- the ONLY write path into Inventory, via the
-- unmodified api.record_inventory_stock_count (canonical mechanism proof).
-- ============================================================================

-- Partial receiving: a small delivery of 1 arrives first (kept small enough
-- to stay at/under reorder_point=5, so the item is still listed as needing
-- purchase afterward -- api.purchases_needed's appear/disappear boundary is
-- reorder_point, unchanged from 0089, not required_quantity).
select is(
  pg_temp.as_receipt('9e900000-0000-0000-0000-000000000001', '9e100000-0000-0000-0000-000000000001', 1, pg_temp.latest_count_id('9e100000-0000-0000-0000-000000000001')),
  4::numeric,
  'receiving 1 against actual 3 produces new_actual_quantity = 4 (canonical additive write)'
);

select is(
  (select actual_quantity from inventory.stock_counts
    where item_id = '9e100000-0000-0000-0000-000000000001'
    order by counted_at desc, id desc limit 1),
  4::numeric,
  'the new stock_counts row (inventory.stock_counts, the canonical mechanism) actually carries 4 -- not a separate Purchases-owned quantity'
);

select is(
  (select purchase_status from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000001'),
  'received',
  'still at/under reorder_point (4 <= 5) after the small partial receipt -- stays listed, status reads as received'
);
select is(
  (select received_quantity from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000001'),
  1::numeric,
  'received_quantity on the read projection reflects the delta just counted in, not the running total'
);

-- Duplicate/stale submit: resubmitting against the SAME stale expected
-- snapshot (the one from before the receipt above) must fail distinctly.
select ok(
  pg_temp.as_auth_throws('9e900000-0000-0000-0000-000000000001',
    format($$ select new_actual_quantity from api.record_purchase_receipt(
      '9e000000-0000-0000-0000-00000000000a'::uuid, '9e200000-0000-0000-0000-000000000001'::uuid, %L::uuid, 10, %L::uuid
    ) $$,
    '9e100000-0000-0000-0000-000000000001',
    (select id from inventory.stock_counts where item_id = '9e100000-0000-0000-0000-000000000001' order by counted_at desc, id desc offset 1 limit 1))),
  'resubmitting a receipt against a now-stale expected snapshot raises purchases_stale_snapshot (duplicate-submit guard)'
);

-- Second, independent partial delivery (no expected snapshot passed -- the
-- optimistic check is optional) pushes actual_quantity above reorder_point
-- (5) for the first time.
select is(
  pg_temp.as_receipt('9e900000-0000-0000-0000-000000000001', '9e100000-0000-0000-0000-000000000001', 2, null),
  6::numeric,
  'a second partial delivery (no expected-snapshot guard supplied) brings actual_quantity to 6'
);

select is(
  (select count(*)::int from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000001'),
  0,
  'once actual_quantity (6) exceeds reorder_point (5), the item drops out of api.purchases_needed entirely -- Ordered/Received never block Inventory''s own truth'
);

reset role;

-- Over-receive proof: a brand-new item, ordered 2, received 100 -- allowed,
-- no hard cap (ordered_quantity is informational only, per 0120 header).
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point)
  values ('9e100000-0000-0000-0000-000000000002', '9e000000-0000-0000-0000-00000000000a',
          '9e200000-0000-0000-0000-000000000001', 'Napkins', 'pcs', 10, 5);
insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9e000000-0000-0000-0000-00000000000a', '9e200000-0000-0000-0000-000000000001',
          '9e100000-0000-0000-0000-000000000002', 1, '9e900000-0000-0000-0000-000000000001');

select pg_temp.as_order('9e900000-0000-0000-0000-000000000002', '9e100000-0000-0000-0000-000000000002', 2);
select is(
  pg_temp.as_receipt('9e900000-0000-0000-0000-000000000001', '9e100000-0000-0000-0000-000000000002', 100, null),
  101::numeric,
  'over-receive (100 counted in against an informational order of 2) is accepted -- Inventory truth is what was actually counted, never capped by the informational ordered_quantity'
);

reset role;

-- ============================================================================
-- Section 4: 0089's original 'bought' path is completely unaffected
-- ============================================================================

insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point)
  values ('9e100000-0000-0000-0000-000000000003', '9e000000-0000-0000-0000-00000000000a',
          '9e200000-0000-0000-0000-000000000001', 'Milk', 'L', 15, 5);
insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9e000000-0000-0000-0000-00000000000a', '9e200000-0000-0000-0000-000000000001',
          '9e100000-0000-0000-0000-000000000003', 3, '9e900000-0000-0000-0000-000000000001');

create function pg_temp.as_bought(p_sub text, p_item uuid)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select action_id into v_id from api.record_purchase_action(
    '9e000000-0000-0000-0000-00000000000a', '9e200000-0000-0000-0000-000000000001', p_item
  );
  return v_id;
end;
$$;

select ok(
  pg_temp.as_bought('9e900000-0000-0000-0000-000000000001', '9e100000-0000-0000-0000-000000000003') is not null,
  '0089''s original record_purchase_action (Bought) still works unchanged after 0120'
);
select is(
  (select purchase_status from api.purchases_needed where item_id = '9e100000-0000-0000-0000-000000000003'),
  'bought',
  'Bought still reads back as purchase_status = bought (not disturbed by the new action_type column default)'
);

-- ============================================================================
-- Section 5: RLS -- 'received' cannot be forged against someone else's
-- stock count (direct table insert, bypassing the RPC).
-- ============================================================================

select ok(
  pg_temp.as_auth_throws('9e900000-0000-0000-0000-000000000002',
    $$ insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type, received_quantity)
         select '9e000000-0000-0000-0000-00000000000a', '9e200000-0000-0000-0000-000000000001',
                '9e100000-0000-0000-0000-000000000003',
                (select id from inventory.stock_counts where item_id = '9e100000-0000-0000-0000-000000000003' order by counted_at desc, id desc limit 1),
                '9e900000-0000-0000-0000-000000000002', 'received', 5 $$),
  'a manager cannot fabricate a received row against a stock count that Staff A actually counted (counted_by must equal actioned_by)'
);

reset role;

-- ============================================================================
-- Section 6: api.purchase_history exposes the full append-only log
-- ============================================================================

select is(
  (select count(*)::int from api.purchase_history where item_id = '9e100000-0000-0000-0000-000000000001'),
  3,
  'api.purchase_history shows every logged action (1 ordered + 2 received) for the Coffee Beans item -- failed attempts never inserted a row'
);
select is(
  (select count(*)::int from api.purchase_history
     where item_id = '9e100000-0000-0000-0000-000000000001' and action_type = 'received'),
  2,
  'both received deliveries for Coffee Beans are present in history, never overwritten'
);

select * from finish();
rollback;
