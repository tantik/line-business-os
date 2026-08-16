begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce, inventory;
select no_plan();

select has_column('inventory', 'items', 'reorder_point', 'inventory items have a separate reorder point');
select has_column('inventory', 'check_session_items', 'reorder_point', 'inventory sessions snapshot the reorder point');

insert into core.tenants (id, slug, name) values
  ('fe000000-0000-0000-0000-000000000001', 'inventory-reorder-test', 'Inventory Reorder Test');
insert into core.locations (id, tenant_id, name) values
  ('fe100000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'Cafe');
insert into inventory.items (
  id, tenant_id, location_id, name, unit, required_quantity, reorder_point
) values (
  'fe200000-0000-0000-0000-000000000001',
  'fe000000-0000-0000-0000-000000000001',
  'fe100000-0000-0000-0000-000000000001',
  'Lids', 'pcs', 15, 5
);
insert into core.users (id, display_name) values
  ('fe300000-0000-0000-0000-000000000001', 'Counter');

insert into inventory.stock_counts (
  tenant_id, location_id, item_id, actual_quantity, counted_by
) values (
  'fe000000-0000-0000-0000-000000000001',
  'fe100000-0000-0000-0000-000000000001',
  'fe200000-0000-0000-0000-000000000001',
  10,
  'fe300000-0000-0000-0000-000000000001'
);

select is(
  (select status from api.inventory_item_status
   where item_id = 'fe200000-0000-0000-0000-000000000001'),
  'sufficient',
  'stock between the reorder point and target does not request a purchase'
);
select is(
  (select shortage_quantity from api.inventory_item_status
   where item_id = 'fe200000-0000-0000-0000-000000000001'),
  0.000::numeric,
  'no purchase quantity is recommended above the reorder point'
);

insert into inventory.stock_counts (
  tenant_id, location_id, item_id, actual_quantity, counted_by
) values (
  'fe000000-0000-0000-0000-000000000001',
  'fe100000-0000-0000-0000-000000000001',
  'fe200000-0000-0000-0000-000000000001',
  5,
  'fe300000-0000-0000-0000-000000000001'
);

select is(
  (select status from api.inventory_item_status
   where item_id = 'fe200000-0000-0000-0000-000000000001'),
  'shortage',
  'stock at the reorder point requests replenishment'
);
select is(
  (select shortage_quantity from api.inventory_item_status
   where item_id = 'fe200000-0000-0000-0000-000000000001'),
  10.000::numeric,
  'recommended purchase fills stock from the current quantity to the target'
);

select throws_ok(
  $$ update inventory.items
     set reorder_point = 16
     where id = 'fe200000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'reorder point cannot exceed the target quantity'
);

select * from finish();
rollback;
