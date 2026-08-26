begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce, inventory;
select no_plan();

select has_table('workforce', 'shift_exchanges', 'shift exchange table exists');
select has_table('inventory', 'check_sessions', 'inventory check session table exists');
select has_table('inventory', 'check_session_items', 'inventory check session item table exists');
select has_view('api', 'workforce_shift_exchanges', 'shift exchange API view exists');
select has_view('api', 'inventory_check_sessions', 'inventory session API view exists');
select has_view('api', 'inventory_check_session_items', 'inventory session-item API view exists');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('workforce', 'inventory')
      and c.relname in ('shift_exchanges', 'check_sessions', 'check_session_items')
      and not c.relrowsecurity),
  0,
  'RLS is enabled on every new business table'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee = 'anon'
     and table_schema in ('workforce', 'inventory')
     and table_name in ('shift_exchanges', 'check_sessions', 'check_session_items')),
  0,
  'anon has no grants on new business tables'
);

create function pg_temp.as_auth_exec(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return true;
exception when others then
  reset role;
  return false;
end;
$$;

insert into core.tenants (id, slug, name) values
  ('fd000000-0000-0000-0000-000000000001', 'final-improvements-test', 'Final Improvements Test');
-- WP-S3 (0095_inventory_module_access_gate.sql) gates
-- inventory.check_sessions/check_session_items RLS on
-- core.has_module_access(...) -- this file's role-hop RPC assertions
-- (api.start_inventory_check_session / api.complete_inventory_check_session
-- further down) assume normal, module-ON behavior.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('fd000000-0000-0000-0000-000000000001', 'inventory', true);
-- Workforce is fail-closed by default since 0097_workforce_module_access_gate.sql;
-- this file's shift-exchange scenarios assume normal, Workforce-ON behavior.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('fd000000-0000-0000-0000-000000000001', 'workforce', true);
insert into core.locations (id, tenant_id, name) values
  ('fd100000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'Cafe');
insert into core.users (id, display_name) values
  ('fd200000-0000-0000-0000-000000000001', 'Staff One'),
  ('fd200000-0000-0000-0000-000000000002', 'Staff Two'),
  ('fd200000-0000-0000-0000-000000000003', 'Manager');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('fd000000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'fd100000-0000-0000-0000-000000000001'),
  ('fd000000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000006', 'fd100000-0000-0000-0000-000000000001'),
  ('fd000000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000005', 'fd100000-0000-0000-0000-000000000001');
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('fd300000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001',
   'fd100000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000001', '\x00'),
  ('fd300000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-000000000001',
   'fd100000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000002', '\x00');
insert into workforce.shifts (id, tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('fd400000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001',
   'fd100000-0000-0000-0000-000000000001', 'fd300000-0000-0000-0000-000000000001',
   '2030-08-01 09:00+00', '2030-08-01 17:00+00', true);

select ok(
  pg_temp.as_auth_exec('fd200000-0000-0000-0000-000000000001',
    $q$ insert into api.workforce_shift_exchanges
      (tenant_id, location_id, shift_id, requester_employee_id, reason)
      values ('fd000000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001',
              'fd400000-0000-0000-0000-000000000001', 'fd300000-0000-0000-0000-000000000001', 'Cannot work') $q$),
  'assigned staff can offer a future published shift'
);
select ok(
  not pg_temp.as_auth_exec('fd200000-0000-0000-0000-000000000002',
    $q$ update workforce.shift_exchanges
        set reason = 'tampered', status = 'accepted',
            replacement_employee_id = 'fd300000-0000-0000-0000-000000000002'
        where shift_id = 'fd400000-0000-0000-0000-000000000001' $q$),
  'accepting staff cannot alter immutable exchange fields'
);
select ok(
  pg_temp.as_auth_exec('fd200000-0000-0000-0000-000000000002',
    $q$ select api.accept_workforce_shift_exchange(
      (select exchange_id from api.workforce_shift_exchanges where shift_id = 'fd400000-0000-0000-0000-000000000001')) $q$),
  'another location-matched staff member can accept the exchange'
);
insert into workforce.shifts (id, tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('fd400000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-000000000001',
   'fd100000-0000-0000-0000-000000000001', 'fd300000-0000-0000-0000-000000000002',
   '2030-08-01 12:00+00', '2030-08-01 18:00+00', true);
select ok(
  not pg_temp.as_auth_exec('fd200000-0000-0000-0000-000000000003',
    $q$ select api.decide_workforce_shift_exchange(
      (select exchange_id from api.workforce_shift_exchanges where shift_id = 'fd400000-0000-0000-0000-000000000001'),
      'approved') $q$),
  'manager approval rechecks replacement overlap after acceptance'
);
delete from workforce.shifts where id = 'fd400000-0000-0000-0000-000000000002';
select ok(
  pg_temp.as_auth_exec('fd200000-0000-0000-0000-000000000003',
    $q$ select api.decide_workforce_shift_exchange(
      (select exchange_id from api.workforce_shift_exchanges where shift_id = 'fd400000-0000-0000-0000-000000000001'),
      'approved') $q$),
  'manager can approve an accepted exchange'
);
select is(
  (select employee_id from workforce.shifts where id = 'fd400000-0000-0000-0000-000000000001'),
  'fd300000-0000-0000-0000-000000000002'::uuid,
  'approval atomically assigns the shift to the accepting employee'
);

insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity) values
  ('fd500000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001',
   'fd100000-0000-0000-0000-000000000001', 'Ice', 'kg', 10);
select ok(
  pg_temp.as_auth_exec('fd200000-0000-0000-0000-000000000001',
    $q$ select api.start_inventory_check_session(
      'fd000000-0000-0000-0000-000000000001',
      'fd100000-0000-0000-0000-000000000001', '2030-08-01', 'opening') $q$),
  'staff can start an opening inventory session for their location'
);
select is(
  (select count(*)::int from inventory.check_session_items
    where tenant_id = 'fd000000-0000-0000-0000-000000000001'),
  1,
  'starting a session snapshots every active inventory item'
);
select ok(
  pg_temp.as_auth_exec('fd200000-0000-0000-0000-000000000001',
    $q$ select api.record_inventory_session_item(
      (select id from inventory.check_sessions where tenant_id = 'fd000000-0000-0000-0000-000000000001'),
      'fd500000-0000-0000-0000-000000000001', 3) $q$),
  'staff can record a session item count'
);
select ok(
  pg_temp.as_auth_exec('fd200000-0000-0000-0000-000000000001',
    $q$ select api.complete_inventory_check_session(
      (select id from inventory.check_sessions where tenant_id = 'fd000000-0000-0000-0000-000000000001')) $q$),
  'a fully counted session can be completed'
);
select is(
  (select status from inventory.check_sessions
    where tenant_id = 'fd000000-0000-0000-0000-000000000001'),
  'completed',
  'completed session is immutable in its completed state'
);
select is(
  (select actual_quantity from inventory.stock_counts
    where tenant_id = 'fd000000-0000-0000-0000-000000000001'
    order by counted_at desc, id desc limit 1),
  3.000::numeric,
  'session completion appends the final stock count'
);
update inventory.items
set is_active = false
where id = 'fd500000-0000-0000-0000-000000000001';
select ok(
  pg_temp.as_auth_exec('fd200000-0000-0000-0000-000000000001',
    $q$ select api.start_inventory_check_session(
      'fd000000-0000-0000-0000-000000000001',
      'fd100000-0000-0000-0000-000000000001', '2030-08-01', 'closing') $q$),
  'staff can start a closing session even when the active catalog is empty'
);
select ok(
  not pg_temp.as_auth_exec('fd200000-0000-0000-0000-000000000001',
    $q$ select api.complete_inventory_check_session(
      (select id from inventory.check_sessions
       where tenant_id = 'fd000000-0000-0000-0000-000000000001'
         and check_type = 'closing')) $q$),
  'an empty inventory session cannot be completed'
);

select * from finish();
rollback;
