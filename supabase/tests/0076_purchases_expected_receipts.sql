-- ============================================================================
-- DB test: Purchases expected receipts / awaiting delivery (migration 0137)
-- ----------------------------------------------------------------------------
-- Covers: api.purchases_awaiting_delivery (open = ordered - received since the
-- latest order, listed even above the reorder point, gone when fully received
-- or explicitly closed), api.close_purchase_order_remainder (permissions,
-- P0007 no open order, P0005 stale order id, no Inventory write), the audit row
-- written for every close, receipts without an order (Founder decision F8),
-- api.purchases_needed reading 'order_closed' as 'pending' (and Weekly Review
-- pendingPurchasesCount counting it), tenant isolation (concrete P0002),
-- location isolation inside one tenant, unauthenticated callers, direct
-- order_closed inserts (forged actor / stale snapshot -> 42501), two orders in
-- a row (only the latest is open), the per-item advisory lock in
-- api.record_purchase_order, and module OFF (P0004, empty view).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, ai;

select no_plan();

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('f9000000-0000-0000-0000-00000000000a', 'pgtap-purch-f9-tenant-a', 'pgTAP Purchases F9 Tenant A'),
  ('f9000000-0000-0000-0000-00000000000b', 'pgtap-purch-f9-tenant-b', 'pgTAP Purchases F9 Tenant B');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('f9000000-0000-0000-0000-00000000000a', 'inventory', true),
  ('f9000000-0000-0000-0000-00000000000a', 'purchases', true),
  ('f9000000-0000-0000-0000-00000000000b', 'inventory', true),
  ('f9000000-0000-0000-0000-00000000000b', 'purchases', true);

insert into core.locations (id, tenant_id, name) values
  ('f9200000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-00000000000a', 'Tenant A Location');

insert into core.users (id, display_name) values
  ('f9900000-0000-0000-0000-000000000001', 'Staff A'),
  ('f9900000-0000-0000-0000-000000000002', 'Manager A'),
  ('f9900000-0000-0000-0000-000000000003', 'Tenant B Owner');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('f9000000-0000-0000-0000-00000000000a', 'f9900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'f9200000-0000-0000-0000-000000000001'), -- employee
  ('f9000000-0000-0000-0000-00000000000a', 'f9900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', 'f9200000-0000-0000-0000-000000000001'); -- manager
insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('f9000000-0000-0000-0000-00000000000b', 'f9900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000003'); -- tenant_owner of B only

-- Milk / Beans / Sugar / Napkins: reorder point 5, target 10, actual 2 (short).
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point) values
  ('f9100000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'Milk', 'L', 10, 5),
  ('f9100000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'Beans', 'kg', 10, 5),
  ('f9100000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'Sugar', 'kg', 10, 5),
  ('f9100000-0000-0000-0000-000000000004', 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'Napkins', 'pcs', 10, 5),
  ('f9100000-0000-0000-0000-000000000005', 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'Cups', 'pcs', 10, 5),
  ('f9100000-0000-0000-0000-000000000006', 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'Lids', 'pcs', 10, 5);

insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
select 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', id, 2, 'f9900000-0000-0000-0000-000000000001'
  from inventory.items where tenant_id = 'f9000000-0000-0000-0000-00000000000a';

-- Second location of Tenant A with one short item and an open order (seeded
-- directly as the test superuser; the loc1-scoped manager must not reach it).
insert into core.locations (id, tenant_id, name) values
  ('f9200000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-00000000000a', 'Tenant A Location 2');
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point) values
  ('f9100000-0000-0000-0000-000000000008', 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000002', 'Loc2 Milk', 'L', 10, 5);
insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by) values
  ('f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000008', 2, 'f9900000-0000-0000-0000-000000000002');
insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type, ordered_quantity)
select 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000008',
       sc.id, 'f9900000-0000-0000-0000-000000000002', 'ordered', 6
  from inventory.stock_counts sc where sc.item_id = 'f9100000-0000-0000-0000-000000000008';

create function pg_temp.become(p_sub text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
end;
$$;

create function pg_temp.as_order(p_sub text, p_item uuid, p_qty numeric)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  perform pg_temp.become(p_sub);
  select action_id into v_id from api.record_purchase_order(
    'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', p_item, p_qty);
  return v_id;
end;
$$;

create function pg_temp.as_receipt(p_sub text, p_item uuid, p_qty numeric)
returns numeric
language plpgsql
as $$
declare v_new numeric;
begin
  perform pg_temp.become(p_sub);
  select new_actual_quantity into v_new from api.record_purchase_receipt(
    'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', p_item, p_qty, null);
  return v_new;
end;
$$;

create function pg_temp.as_close(p_sub text, p_item uuid, p_expected uuid)
returns numeric
language plpgsql
as $$
declare v_closed numeric;
begin
  perform pg_temp.become(p_sub);
  select closed_quantity into v_closed from api.close_purchase_order_remainder(
    'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', p_item, p_expected);
  return v_closed;
end;
$$;

create function pg_temp.as_throws_code(p_sub text, p_sql text, p_expected_code text)
returns boolean
language plpgsql
as $$
begin
  perform pg_temp.become(p_sub);
  execute p_sql;
  return false;
exception
  -- P0004 is ASSERT_FAILURE in PL/pgSQL, which WHEN OTHERS does not catch (see 0063).
  when assert_failure then
    return p_expected_code = 'P0004';
  when others then
    return p_expected_code is null or sqlstate = p_expected_code;
end;
$$;

create function pg_temp.as_exec_ok(p_sub text, p_sql text)
returns boolean
language plpgsql
as $$
begin
  perform pg_temp.become(p_sub);
  execute p_sql;
  return true;
end;
$$;

create function pg_temp.anon_throws_code(p_sql text, p_expected_code text)
returns boolean
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  execute p_sql;
  return false;
exception
  when others then
    return sqlstate = p_expected_code;
end;
$$;

-- Weekly Review purchasing.pendingPurchasesCount for Tenant A / location 1.
create function pg_temp.as_pending_count(p_sub text)
returns int
language plpgsql
as $$
begin
  perform pg_temp.become(p_sub);
  return (api.weekly_review_summary(
    'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001',
    current_date - 6, current_date, now() - interval '7 days', now() + interval '1 day'
  ) -> 'purchasing' ->> 'pendingPurchasesCount')::int;
end;
$$;

create function pg_temp.as_count(p_sub text, p_sql text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform pg_temp.become(p_sub);
  execute p_sql into n;
  return n;
end;
$$;

-- ============================================================================
-- 1. order 8 -> receive 4 -> still awaiting 4 above the reorder point -> receive 4 -> closed
-- ============================================================================

select ok(pg_temp.as_order('f9900000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000001', 8) is not null,
  'manager orders 8 L of Milk');
reset role;

select is((select open_order_quantity from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000001'),
  8::numeric, 'right after ordering, 8 L is awaiting delivery');

select is(pg_temp.as_receipt('f9900000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 4),
  6::numeric, 'staff receives 4 L: stock 2 -> 6 (above the reorder point 5)');
reset role;

select is((select count(*)::int from api.purchases_needed where item_id = 'f9100000-0000-0000-0000-000000000001'),
  0, 'Milk is no longer short, so it leaves api.purchases_needed (unchanged semantics)');

select results_eq(
  $$ select ordered_quantity, received_since_order_quantity, open_order_quantity, is_short
       from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000001' $$,
  $$ values (8::numeric, 4::numeric, 4::numeric, false) $$,
  'the open 4 L of the 8 L order is still listed as awaiting delivery, even above the reorder point');

select is(
  pg_temp.as_count('f9900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000001' $$),
  1, 'Staff A sees the awaiting-delivery row through RLS');
reset role;

select is(pg_temp.as_receipt('f9900000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 4),
  10::numeric, 'second delivery of 4 L: stock 6 -> 10');
reset role;

select is((select count(*)::int from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000001'),
  0, 'fully received (8 of 8): the order is closed and no longer listed');

-- ============================================================================
-- 2. order 8 -> receive 3 -> close the rest -> not listed, audited
-- ============================================================================

select pg_temp.as_order('f9900000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000002', 8);
reset role;
select is(pg_temp.as_receipt('f9900000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000002', 3),
  5::numeric, 'Beans: order 8, receive 3 -> stock 5 (still short)');
reset role;

select is((select open_order_quantity from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000002'),
  5::numeric, 'Beans: 5 kg still awaiting delivery');
select is((select purchase_status from api.purchases_needed where item_id = 'f9100000-0000-0000-0000-000000000002'),
  'received', 'Beans still short: purchases_needed shows the receipt (unchanged)');

-- Weekly Review pendingPurchasesCount before the close (Beans is 'received').
select set_config('f9.pending_before', pg_temp.as_pending_count('f9900000-0000-0000-0000-000000000002')::text, true);
reset role;

select is(
  pg_temp.as_close('f9900000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000002',
    (select order_action_id from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000002')),
  5::numeric, 'staff closes the rest of the Beans order: 5 kg closed');
reset role;

select is((select count(*)::int from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000002'),
  0, 'after "cancel the rest" the Beans order is no longer awaiting delivery');
select is((select purchase_status from api.purchases_needed where item_id = 'f9100000-0000-0000-0000-000000000002'),
  'pending', 'a closed order reads as pending in purchases_needed (still short, nothing in progress)');
select is(pg_temp.as_pending_count('f9900000-0000-0000-0000-000000000002'),
  current_setting('f9.pending_before')::int + 1,
  'Weekly Review pendingPurchasesCount counts the order_closed-but-still-short Beans as pending (+1)');
reset role;
select is((select actioned_at from api.purchases_needed where item_id = 'f9100000-0000-0000-0000-000000000002'),
  null::timestamptz, 'pending after a close carries no actioned_at, like any pending row');
select is((select actual_quantity from inventory.stock_counts where item_id = 'f9100000-0000-0000-0000-000000000002'
            order by counted_at desc, id desc limit 1),
  5::numeric, 'closing never writes to Inventory (stock stays 5)');
select is((select action_type from api.purchase_history where item_id = 'f9100000-0000-0000-0000-000000000002'
            order by actioned_at desc limit 1),
  'order_closed', 'the close is in the append-only history');

select results_eq(
  $$ select actor_id, actor_kind, module::text, entity, entity_id, action,
            (before ->> 'open_quantity')::numeric, (after ->> 'open_quantity')::numeric
       from audit.audit_logs
      where tenant_id = 'f9000000-0000-0000-0000-00000000000a' and action = 'close_remainder' $$,
  $$ select 'f9900000-0000-0000-0000-000000000001'::uuid, 'user', 'purchases', 'purchase_order',
            (select id::text from purchases.purchase_actions
              where item_id = 'f9100000-0000-0000-0000-000000000002' and action_type = 'ordered'),
            'close_remainder', 5::numeric, 0::numeric $$,
  'exactly one audit row for the close: actor, module purchases, the order id, open 5 -> 0');

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000001',
    $$ select closed_quantity from api.close_purchase_order_remainder(
         'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001',
         'f9100000-0000-0000-0000-000000000002', null) $$, 'P0007'),
  'closing again raises purchases_no_open_order (P0007)');
reset role;

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000001',
    $$ select closed_quantity from api.close_purchase_order_remainder(
         'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001',
         'f9100000-0000-0000-0000-000000000001', null) $$, 'P0007'),
  'closing a fully received order raises purchases_no_open_order (P0007)');
reset role;

-- ============================================================================
-- 3. stale order id, receipt without an order (F8)
-- ============================================================================

select pg_temp.as_order('f9900000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000003', 3);
reset role;

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000002',
    $$ select closed_quantity from api.close_purchase_order_remainder(
         'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001',
         'f9100000-0000-0000-0000-000000000003', gen_random_uuid()) $$, 'P0005'),
  'closing with an order id that is not the open order raises purchases_stale_snapshot (P0005)');
reset role;
select is((select open_order_quantity from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000003'),
  3::numeric, 'the Sugar order is still open after the refused close');

select is(pg_temp.as_receipt('f9900000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000004', 5),
  7::numeric, 'a receipt without any order still works (F8): Napkins 2 -> 7');
reset role;
select is((select count(*)::int from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000004'),
  0, 'a receipt without an order never creates an awaiting-delivery row');

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000001',
    $$ insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type)
       select 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000004',
              (select id from inventory.stock_counts where item_id = 'f9100000-0000-0000-0000-000000000004' order by counted_at desc, id desc limit 1),
              'f9900000-0000-0000-0000-000000000001', 'order_closed' $$, '42501'),
  'RLS refuses a direct order_closed insert for an item that was never ordered');
reset role;

-- ============================================================================
-- 4. tenant isolation
-- ============================================================================

select is(
  pg_temp.as_count('f9900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.purchases_awaiting_delivery where tenant_id = 'f9000000-0000-0000-0000-00000000000a' $$),
  0, 'a Tenant B owner sees zero Tenant A awaiting-delivery rows');
reset role;

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000003',
    $$ select closed_quantity from api.close_purchase_order_remainder(
         'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001',
         'f9100000-0000-0000-0000-000000000003', null) $$, 'P0002'),
  'a Tenant B owner cannot close a Tenant A order: the item is invisible under RLS -> purchases_item_not_found (P0002)');
reset role;

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000003',
    $$ insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type)
       select 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000003',
              (select id from inventory.stock_counts where item_id = 'f9100000-0000-0000-0000-000000000003' order by counted_at desc, id desc limit 1),
              'f9900000-0000-0000-0000-000000000003', 'order_closed' $$, '42501'),
  'a Tenant B owner cannot insert an order_closed row for Tenant A directly (RLS)');
reset role;

select is((select open_order_quantity from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000003'),
  3::numeric, 'the Tenant A Sugar order is untouched after the Tenant B attempts');
select is((select count(*)::int from audit.audit_logs
            where tenant_id = 'f9000000-0000-0000-0000-00000000000a' and action = 'close_remainder'),
  1, 'refused closes write no audit rows');

-- ============================================================================
-- 4b. second location in the same tenant (location-scoped manager)
-- ============================================================================

select is((select open_order_quantity from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000008'),
  6::numeric, 'fixture: the location-2 order is open (6 L)');

select is(
  pg_temp.as_count('f9900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from api.purchases_awaiting_delivery where location_id = 'f9200000-0000-0000-0000-000000000002' $$),
  0, 'a loc1-scoped manager sees zero location-2 awaiting-delivery rows');
reset role;

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000002',
    $$ select closed_quantity from api.close_purchase_order_remainder(
         'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000002',
         'f9100000-0000-0000-0000-000000000008', null) $$, 'P0002'),
  'a loc1-scoped manager cannot close a location-2 order (item invisible -> P0002)');
reset role;

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000002',
    $$ select closed_quantity from api.close_purchase_order_remainder(
         'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001',
         'f9100000-0000-0000-0000-000000000008', null) $$, 'P0002'),
  'passing loc1 as p_location_id for a location-2 item does not help (P0002)');
reset role;

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000002',
    $$ insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type)
       select 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000008',
              (select id from inventory.stock_counts where item_id = 'f9100000-0000-0000-0000-000000000008' order by counted_at desc, id desc limit 1),
              'f9900000-0000-0000-0000-000000000002', 'order_closed' $$, '42501'),
  'a loc1-scoped manager cannot insert order_closed for location 2 directly (RLS 42501)');
reset role;

select is((select open_order_quantity from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000008'),
  6::numeric, 'the location-2 order is untouched');

-- ============================================================================
-- 4c. unauthenticated callers
-- ============================================================================

select ok(
  pg_temp.as_throws_code(null,
    $$ select closed_quantity from api.close_purchase_order_remainder(
         'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001',
         'f9100000-0000-0000-0000-000000000003', null) $$, 'P0002'),
  'authenticated role without a sub cannot close (no permission -> item invisible -> P0002)');
reset role;

select ok(
  pg_temp.anon_throws_code(
    $$ select closed_quantity from api.close_purchase_order_remainder(
         'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001',
         'f9100000-0000-0000-0000-000000000003', null) $$, '42501'),
  'anon cannot execute the close RPC (42501)');
reset role;

select is((select open_order_quantity from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000003'),
  3::numeric, 'the Sugar order is untouched after the unauthenticated attempts');

-- ============================================================================
-- 4d. direct order_closed inserts: forged actor, stale snapshot (RLS)
-- ============================================================================

select pg_temp.as_order('f9900000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000005', 4);
reset role;

-- A newer stock count makes the previous one stale.
insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by) values
  ('f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000005', 2, 'f9900000-0000-0000-0000-000000000001');

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000001',
    $$ insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type)
       select 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000005',
              (select id from inventory.stock_counts where item_id = 'f9100000-0000-0000-0000-000000000005' order by counted_at desc, id desc limit 1),
              'f9900000-0000-0000-0000-000000000002', 'order_closed' $$, '42501'),
  'RLS refuses order_closed with a forged actioned_by (42501)');
reset role;

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000001',
    $$ insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type)
       select 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000005',
              (select id from inventory.stock_counts where item_id = 'f9100000-0000-0000-0000-000000000005' order by counted_at asc, id asc limit 1),
              'f9900000-0000-0000-0000-000000000001', 'order_closed' $$, '42501'),
  'RLS refuses order_closed against a stale (not latest) stock count (42501)');
reset role;

select is((select open_order_quantity from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000005'),
  4::numeric, 'the Cups order is still open after both refused inserts');

select ok(
  pg_temp.as_exec_ok('f9900000-0000-0000-0000-000000000001',
    $$ insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type)
       select 'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000005',
              (select id from inventory.stock_counts where item_id = 'f9100000-0000-0000-0000-000000000005' order by counted_at desc, id desc limit 1),
              'f9900000-0000-0000-0000-000000000001', 'order_closed' $$),
  'control: the same insert with the real caller and the latest snapshot is accepted');
reset role;

select is((select count(*)::int from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000005'),
  0, 'the accepted direct close closes the Cups order');
select is((select count(*)::int from audit.audit_logs
            where tenant_id = 'f9000000-0000-0000-0000-00000000000a' and action = 'close_remainder'
              and metadata ->> 'item_id' = 'f9100000-0000-0000-0000-000000000005'),
  1, 'a direct (non-RPC) close is audited by the trigger too');

-- ============================================================================
-- 4e. two orders in a row: only the latest is open (documented design)
-- ============================================================================

select pg_temp.as_order('f9900000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000006', 3);
reset role;
select is(pg_temp.as_receipt('f9900000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000006', 1),
  3::numeric, 'Lids: order 3, receive 1 -> stock 3 (still short)');
reset role;
select pg_temp.as_order('f9900000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000006', 5);
reset role;

select results_eq(
  $$ select count(*)::int, max(ordered_quantity), max(received_since_order_quantity), max(open_order_quantity)
       from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000006' $$,
  $$ values (1, 5::numeric, 0::numeric, 5::numeric) $$,
  'two orders in a row: one row, the latest order (5) is open; the earlier order and receipts before it are not counted');
select is((select order_action_id from api.purchases_awaiting_delivery where item_id = 'f9100000-0000-0000-0000-000000000006'),
  (select id from purchases.purchase_actions where item_id = 'f9100000-0000-0000-0000-000000000006' and action_type = 'ordered'
    order by actioned_at desc, id desc limit 1),
  'the open order is the latest ordered action');

-- ============================================================================
-- 4f. race guard: record_purchase_order takes the per-item advisory lock
-- ============================================================================

select ok((select pg_get_functiondef('api.record_purchase_order(uuid, uuid, uuid, numeric)'::regprocedure)
                  like '%pg_advisory_xact_lock(hashtextextended(p_item_id::text, 0))%'),
  'api.record_purchase_order takes the same per-item advisory lock as receipts and closes');
select ok(not (select prosecdef from pg_proc where oid = 'api.record_purchase_order(uuid, uuid, uuid, numeric)'::regprocedure),
  'api.record_purchase_order is still SECURITY INVOKER');
select ok(not has_function_privilege('anon', 'api.record_purchase_order(uuid, uuid, uuid, numeric)', 'execute'),
  'anon still cannot execute api.record_purchase_order');

-- ============================================================================
-- 4g. module OFF (last: flips Tenant A's purchases module)
-- ============================================================================

update core.tenant_modules set is_enabled = false
 where tenant_id = 'f9000000-0000-0000-0000-00000000000a' and module = 'purchases';

select ok(
  pg_temp.as_throws_code('f9900000-0000-0000-0000-000000000002',
    $$ select closed_quantity from api.close_purchase_order_remainder(
         'f9000000-0000-0000-0000-00000000000a', 'f9200000-0000-0000-0000-000000000001',
         'f9100000-0000-0000-0000-000000000003', null) $$, 'P0004'),
  'module OFF: the close RPC raises purchases_module_disabled (P0004)');
reset role;

select is(
  pg_temp.as_count('f9900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from api.purchases_awaiting_delivery where tenant_id = 'f9000000-0000-0000-0000-00000000000a' $$),
  0, 'module OFF: api.purchases_awaiting_delivery returns no rows');
reset role;

select is((select count(*)::int from api.purchases_awaiting_delivery
            where tenant_id = 'f9000000-0000-0000-0000-00000000000a' and item_id = 'f9100000-0000-0000-0000-000000000003'),
  1, 'module OFF: the data is still there (superuser view), only hidden from tenant users');

-- ============================================================================
-- 5. facade posture (ADR 0008)
-- ============================================================================

select ok((select (reloptions @> array['security_invoker=true']) from pg_class
            where oid = 'api.purchases_awaiting_delivery'::regclass),
  'api.purchases_awaiting_delivery is security_invoker');
select ok(not has_table_privilege('anon', 'api.purchases_awaiting_delivery', 'select'),
  'anon cannot read api.purchases_awaiting_delivery');
select ok(not (select prosecdef from pg_proc where oid = 'api.close_purchase_order_remainder(uuid, uuid, uuid, uuid)'::regprocedure),
  'api.close_purchase_order_remainder is SECURITY INVOKER');
select ok(not has_function_privilege('anon', 'api.close_purchase_order_remainder(uuid, uuid, uuid, uuid)', 'execute'),
  'anon cannot execute api.close_purchase_order_remainder');

select * from finish();
rollback;
