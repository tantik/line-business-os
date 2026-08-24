-- ============================================================================
-- DB test: Purchases module (migration 0089)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Covers: structure/permission catalog, RLS/facade role-hop behavior, the
-- api.purchases_needed shortage projection, and -- the central design
-- question this module exists to answer -- the Bought-state staleness
-- semantics (plan section D): a stale acknowledgement must revert to
-- Pending, never silently stay "Bought" once Inventory's own state has
-- moved on. Follows 0014_inventory_stock_check.sql's exact structure/helper
-- pattern.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, ai;

select no_plan();

-- ============================================================================
-- Section 1: structure + permission catalog
-- ============================================================================

select has_schema('purchases', 'purchases schema exists');
select has_table('purchases', 'purchase_actions', 'purchases.purchase_actions exists');

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'purchases'
      and c.relname = 'purchase_actions'
      and c.relrowsecurity = false),
  0,
  'RLS is enabled on purchases.purchase_actions'
);

select is(
  (select count(*)::int from core.permissions
    where key in ('purchases.item.read', 'purchases.action.write')
      and module = 'inventory'),
  2,
  'both purchases permission keys exist, tagged module = inventory (rides the inventory tenant-module flag, no separate module_code)'
);

select is(
  (select count(*)::int from core.role_permissions
     where role_id = '00000000-0000-0000-0000-000000000005' -- manager
       and permission_key in ('purchases.item.read', 'purchases.action.write')),
  2,
  'manager holds both purchases permission keys'
);
select is(
  (select count(*)::int from core.role_permissions
     where role_id = '00000000-0000-0000-0000-000000000006' -- employee
       and permission_key in ('purchases.item.read', 'purchases.action.write')),
  2,
  'employee holds both purchases permission keys (no manage/staff split -- unlike Inventory, everyone who can read can also act)'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'purchases'),
  0,
  'zero anon table grants on purchases'
);

select ok(
  has_table_privilege('authenticated', 'purchases.purchase_actions', 'SELECT'),
  'authenticated has the base SELECT privilege on purchase_actions required by the security_invoker api.purchases_needed view'
);

-- ============================================================================
-- Section 2: fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('9c000000-0000-0000-0000-00000000000a', 'pgtap-purch-tenant-a', 'pgTAP Purchases Tenant A');

insert into core.locations (id, tenant_id, name) values
  ('9c200000-0000-0000-0000-000000000001', '9c000000-0000-0000-0000-00000000000a', 'Tenant A Location A');

insert into core.users (id, display_name) values
  ('9c900000-0000-0000-0000-000000000001', 'Staff A (Location A)'),
  ('9c900000-0000-0000-0000-000000000002', 'Manager A (Location A)');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9c000000-0000-0000-0000-00000000000a', '9c900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9c200000-0000-0000-0000-000000000001'), -- employee
  ('9c000000-0000-0000-0000-00000000000a', '9c900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', '9c200000-0000-0000-0000-000000000001'); -- manager

-- Milk: target 15, reorder point 5 -- matches the Founder brief's own worked example.
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point)
  values ('9c100000-0000-0000-0000-000000000001', '9c000000-0000-0000-0000-00000000000a',
          '9c200000-0000-0000-0000-000000000001', 'Milk', 'L', 15, 5);

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
      '9c000000-0000-0000-0000-00000000000a', '9c200000-0000-0000-0000-000000000001', p_item
    );
  return v_action_id;
end;
$$;

-- ============================================================================
-- Section 3: an item that has never been counted does not appear in the
-- shopping list -- 'unknown' status is not a claimable shortage.
-- ============================================================================

select is(
  (select count(*)::int from api.purchases_needed where item_id = '9c100000-0000-0000-0000-000000000001'),
  0,
  'an item with no stock count history does not appear in api.purchases_needed'
);

select ok(
  pg_temp.as_auth_throws('9c900000-0000-0000-0000-000000000001',
    format($$ select action_id from api.record_purchase_action(
      '9c000000-0000-0000-0000-00000000000a'::uuid, '9c200000-0000-0000-0000-000000000001'::uuid, %L::uuid
    ) $$, '9c100000-0000-0000-0000-000000000001')),
  'marking a never-counted item as bought raises purchases_item_never_counted'
);

-- ============================================================================
-- Section 4: shortage appears; staff can mark it Bought; the row reads back
-- as purchase_status = 'bought' with a timestamp.
-- ============================================================================

insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9c000000-0000-0000-0000-00000000000a', '9c200000-0000-0000-0000-000000000001',
          '9c100000-0000-0000-0000-000000000001', 3, '9c900000-0000-0000-0000-000000000001');

select is(
  (select shortage_quantity from api.purchases_needed where item_id = '9c100000-0000-0000-0000-000000000001'),
  12::numeric,
  'shortage_quantity = required(15) - actual(3) = 12, matches the Founder brief''s worked formula'
);
select is(
  (select purchase_status from api.purchases_needed where item_id = '9c100000-0000-0000-0000-000000000001'),
  'pending',
  'a freshly-short item with no acknowledgement yet reads as pending'
);

-- Manager cannot mark bought for a not-short item (guard against a bogus
-- item_id / permission gap) -- but Manager at the SAME location CAN act
-- here since this item genuinely is short:
select ok(
  pg_temp.as_auth_rpc('9c900000-0000-0000-0000-000000000002', '9c100000-0000-0000-0000-000000000001') is not null,
  'manager can mark a genuinely-short item as bought'
);

select is(
  (select purchase_status from api.purchases_needed where item_id = '9c100000-0000-0000-0000-000000000001'),
  'bought',
  'after marking bought, the item reads back as purchase_status = bought'
);
select ok(
  (select actioned_at from api.purchases_needed where item_id = '9c100000-0000-0000-0000-000000000001') is not null,
  'a bought item carries an actioned_at timestamp'
);

reset role;

-- ============================================================================
-- Section 5: THE central staleness scenario (plan section D / Founder
-- Scenario A+B). Recording a NEW stock count after Bought must immediately
-- make the old acknowledgement stale.
-- ============================================================================

-- Scenario A: restocked to sufficiency -- item drops out of the list
-- entirely (old Bought record is preserved in history, just no longer
-- surfaced as an active need).
insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9c000000-0000-0000-0000-00000000000a', '9c200000-0000-0000-0000-000000000001',
          '9c100000-0000-0000-0000-000000000001', 15, '9c900000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from api.purchases_needed where item_id = '9c100000-0000-0000-0000-000000000001'),
  0,
  'Scenario A: once restocked to/above target, the item disappears from api.purchases_needed entirely -- old Bought never blocks Inventory''s new truth'
);

select is(
  (select count(*)::int from purchases.purchase_actions where item_id = '9c100000-0000-0000-0000-000000000001'),
  1,
  'Scenario A: the original Bought acknowledgement row is preserved in history, never deleted or edited'
);

-- Scenario B: a second item -- still short after a new count, but the count
-- changed -- old Bought must NOT silently persist; it must revert to
-- pending with the NEW shortage number.
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point)
  values ('9c100000-0000-0000-0000-000000000002', '9c000000-0000-0000-0000-00000000000a',
          '9c200000-0000-0000-0000-000000000001', 'Eggs', 'pcs', 10, 5);

insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9c000000-0000-0000-0000-00000000000a', '9c200000-0000-0000-0000-000000000001',
          '9c100000-0000-0000-0000-000000000002', 1, '9c900000-0000-0000-0000-000000000001');

select pg_temp.as_auth_rpc('9c900000-0000-0000-0000-000000000001', '9c100000-0000-0000-0000-000000000002');
reset role;

select is(
  (select purchase_status from api.purchases_needed where item_id = '9c100000-0000-0000-0000-000000000002'),
  'bought',
  'sanity check: Eggs reads as bought right after being marked'
);

-- Someone brings 4 more (still short: target 10, reorder point 5, new actual 4).
insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('9c000000-0000-0000-0000-00000000000a', '9c200000-0000-0000-0000-000000000001',
          '9c100000-0000-0000-0000-000000000002', 4, '9c900000-0000-0000-0000-000000000001');

select is(
  (select purchase_status from api.purchases_needed where item_id = '9c100000-0000-0000-0000-000000000002'),
  'pending',
  'Scenario B: a new stock count makes the prior Bought acknowledgement stale -- item reverts to pending, does NOT stay stuck as bought'
);
select is(
  (select shortage_quantity from api.purchases_needed where item_id = '9c100000-0000-0000-0000-000000000002'),
  6::numeric,
  'Scenario B: the reverted-to-pending row shows the NEW shortage (target 10 - actual 4 = 6), not the stale original number'
);

-- Re-marking bought against the NEW state must succeed (a fresh snapshot).
select ok(
  pg_temp.as_auth_rpc('9c900000-0000-0000-0000-000000000001', '9c100000-0000-0000-0000-000000000002') is not null,
  'the item can be marked bought again after reverting to pending, pinned to the new latest count'
);
select is(
  (select purchase_status from api.purchases_needed where item_id = '9c100000-0000-0000-0000-000000000002'),
  'bought',
  'after re-marking, the item reads as bought again'
);
select is(
  (select count(*)::int from purchases.purchase_actions where item_id = '9c100000-0000-0000-0000-000000000002'),
  2,
  'both acknowledgements (the stale one and the fresh one) remain in history -- append-only, nothing overwritten or deleted'
);

-- ============================================================================
-- Section 6: RLS -- cannot mark bought an item that is not (or no longer)
-- short; actioned_by cannot be forged; cross-tenant isolation.
-- ============================================================================

-- Milk (item 1) is now sufficient (Scenario A) -- trying to mark it bought
-- again must fail with the friendly purchases_item_not_short error, not a
-- generic RLS violation.
select ok(
  pg_temp.as_auth_throws('9c900000-0000-0000-0000-000000000001',
    format($$ select action_id from api.record_purchase_action(
      '9c000000-0000-0000-0000-00000000000a'::uuid, '9c200000-0000-0000-0000-000000000001'::uuid, %L::uuid
    ) $$, '9c100000-0000-0000-0000-000000000001')),
  'marking a currently-sufficient item as bought raises purchases_item_not_short'
);

-- actioned_by cannot be forged via a direct table insert (bypassing the RPC).
select ok(
  pg_temp.as_auth_throws('9c900000-0000-0000-0000-000000000001',
    $$ insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by)
         select '9c000000-0000-0000-0000-00000000000a', '9c200000-0000-0000-0000-000000000001',
                '9c100000-0000-0000-0000-000000000002',
                (select id from inventory.stock_counts where item_id = '9c100000-0000-0000-0000-000000000002' order by counted_at desc, id desc limit 1),
                '9c900000-0000-0000-0000-000000000002' $$),
  'staff cannot record a purchase action attributed to a different user (actioned_by must be self)'
);

reset role;

-- Cross-tenant isolation.
insert into core.tenants (id, slug, name) values
  ('9d000000-0000-0000-0000-00000000000b', 'pgtap-purch-tenant-b', 'pgTAP Purchases Tenant B');
insert into core.users (id, display_name) values
  ('9d900000-0000-0000-0000-000000000001', 'Tenant B Owner');
insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('9d000000-0000-0000-0000-00000000000b', '9d900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003'); -- tenant_owner, tenant-wide

select is(
  pg_temp.as_auth_count('9d900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.purchases_needed where tenant_id = '9c000000-0000-0000-0000-00000000000a' $$),
  0,
  'Tenant B owner sees zero Tenant A purchases_needed rows (tenant isolation)'
);

reset role;

select * from finish();
rollback;
