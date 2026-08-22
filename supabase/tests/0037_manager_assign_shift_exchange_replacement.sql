begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;
select no_plan();

/**
 * `api.manager_assign_shift_exchange_replacement` (0079) -- Shift Exchange
 * Manager Resolution UX: lets a Manager assign a replacement employee to an
 * 'exchange'-kind request that has none yet, mirroring
 * `api.accept_workforce_shift_exchange`'s own validation (tenant/location/
 * active employee, schedule conflict) but callable by the Manager on a
 * colleague's behalf instead of self-service. Same tenant/location isolation
 * pattern as 0036_workforce_shift_exchange_manager_decision.sql.
 */

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
  raise notice 'as_auth_exec failed: %', sqlerrm;
  reset role;
  return false;
end;
$$;

create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int language plpgsql as $$
declare
  v_count int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql into v_count;
  reset role;
  return v_count;
exception when others then
  raise notice 'as_auth_count failed: %', sqlerrm;
  reset role;
  return -1;
end;
$$;

-- Tenant A: the tenant under test.
insert into core.tenants (id, slug, name) values
  ('ea000000-0000-0000-0000-000000000001', 'exchange-assign-test-a', 'Exchange Assign Test A');
insert into core.locations (id, tenant_id, name, timezone) values
  ('ea100000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001', 'Cafe A', 'Asia/Tokyo'),
  ('ea100000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000001', 'Cafe A - Second Location', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('ea200000-0000-0000-0000-000000000001', 'Requester'),
  ('ea200000-0000-0000-0000-000000000002', 'Manager A (location 1)'),
  ('ea200000-0000-0000-0000-000000000003', 'Manager A (location 2 only)');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('ea000000-0000-0000-0000-000000000001', 'ea200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'ea100000-0000-0000-0000-000000000001'),
  ('ea000000-0000-0000-0000-000000000001', 'ea200000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'ea100000-0000-0000-0000-000000000001'),
  ('ea000000-0000-0000-0000-000000000001', 'ea200000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'ea100000-0000-0000-0000-000000000002');
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted, is_active) values
  ('ea300000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', 'ea200000-0000-0000-0000-000000000001', '\x00', true),
  ('ea300000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', null, '\x00', true),
  ('ea300000-0000-0000-0000-000000000003', 'ea000000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', null, '\x00', false),
  ('ea300000-0000-0000-0000-000000000004', 'ea000000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000002', null, '\x00', true),
  ('ea300000-0000-0000-0000-000000000005', 'ea000000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', null, '\x00', true),
  ('ea300000-0000-0000-0000-000000000006', 'ea000000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', null, '\x00', true);
insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, break_minutes) values
  ('ea400000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', 'DAY', '日勤', '09:00', '17:00', 60);
insert into workforce.shifts (id, tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, published) values
  -- the offered shift (requester's), open exchange request against it
  ('ea500000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', 'ea300000-0000-0000-0000-000000000001', 'ea400000-0000-0000-0000-000000000001', '2030-08-01 00:00+00', '2030-08-01 08:00+00', true),
  -- employee 5 already has an overlapping published shift -> schedule-conflict candidate
  ('ea500000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', 'ea300000-0000-0000-0000-000000000005', 'ea400000-0000-0000-0000-000000000001', '2030-08-01 00:00+00', '2030-08-01 08:00+00', true);

-- Tenant B: unrelated tenant, cross-tenant isolation only.
insert into core.tenants (id, slug, name) values
  ('ea000000-0000-0000-0000-000000000002', 'exchange-assign-test-b', 'Exchange Assign Test B');
insert into core.locations (id, tenant_id, name, timezone) values
  ('ea100000-0000-0000-0000-000000000003', 'ea000000-0000-0000-0000-000000000002', 'Cafe B', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('ea200000-0000-0000-0000-000000000004', 'Manager B');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('ea000000-0000-0000-0000-000000000002', 'ea200000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', 'ea100000-0000-0000-0000-000000000003');

select ok(pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000001',
  $q$insert into api.workforce_shift_exchanges
    (tenant_id, location_id, shift_id, requester_employee_id, reason, request_kind)
    values ('ea000000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', 'ea500000-0000-0000-0000-000000000001', 'ea300000-0000-0000-0000-000000000001', 'Please find me a replacement', 'exchange')$q$),
  'requester can submit an open exchange request with no candidate yet');

-- Case 1: a non-manager (the requester) cannot assign a replacement.
select ok(
  not pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000001',
    $q$select api.manager_assign_shift_exchange_replacement((select id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'), 'ea300000-0000-0000-0000-000000000002')$q$),
  'a non-manager (the requester) cannot assign a replacement'
);

-- Case 2: cross-tenant manager cannot see or assign (isolation).
select is(
  pg_temp.as_auth_count('ea200000-0000-0000-0000-000000000004',
    $q$select count(*) from api.workforce_shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'$q$),
  0,
  'a manager from a different tenant cannot see the request at all'
);
select ok(
  not pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000004',
    $q$select api.manager_assign_shift_exchange_replacement((select id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'), 'ea300000-0000-0000-0000-000000000002')$q$),
  'a manager from a different tenant cannot assign a replacement'
);

-- Case 3: a manager scoped to a different location in the same tenant cannot assign.
select ok(
  not pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000003',
    $q$select api.manager_assign_shift_exchange_replacement((select id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'), 'ea300000-0000-0000-0000-000000000002')$q$),
  'a manager scoped to a different location in the same tenant cannot assign'
);

-- Case 4: the correctly-scoped manager cannot assign the requester as their own replacement.
select ok(
  not pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000002',
    $q$select api.manager_assign_shift_exchange_replacement((select id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'), 'ea300000-0000-0000-0000-000000000001')$q$),
  'the manager cannot assign the requester as their own replacement'
);

-- Case 5: cannot assign an inactive employee.
select ok(
  not pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000002',
    $q$select api.manager_assign_shift_exchange_replacement((select id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'), 'ea300000-0000-0000-0000-000000000003')$q$),
  'cannot assign an inactive employee as replacement'
);

-- Case 6: cannot assign an employee scoped to a different location.
select ok(
  not pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000002',
    $q$select api.manager_assign_shift_exchange_replacement((select id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'), 'ea300000-0000-0000-0000-000000000004')$q$),
  'cannot assign an employee from a different location'
);

-- Case 7: cannot assign a candidate whose own published shift overlaps the offered shift (schedule conflict, same hard-block as accept/decide).
select ok(
  not pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000002',
    $q$select api.manager_assign_shift_exchange_replacement((select id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'), 'ea300000-0000-0000-0000-000000000005')$q$),
  'cannot assign a candidate with an overlapping published shift'
);
select is(
  (select replacement_employee_id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'),
  null::uuid,
  'every rejected assignment attempt above left replacement_employee_id untouched'
);

-- Case 8: the correctly-scoped manager CAN assign a valid, active, same-location, non-requester candidate.
select ok(
  pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000002',
    $q$select api.manager_assign_shift_exchange_replacement((select id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'), 'ea300000-0000-0000-0000-000000000002')$q$),
  'the correctly tenant+location-scoped manager can assign a valid replacement'
);
select is(
  (select replacement_employee_id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'),
  'ea300000-0000-0000-0000-000000000002'::uuid,
  'replacement_employee_id is persisted'
);
select is(
  (select status from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'),
  'open',
  'status stays open after assignment -- assignment alone is not approval'
);

-- Case 9: the manager can change the replacement to a different valid candidate before approval.
select ok(
  pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000002',
    $q$select api.manager_assign_shift_exchange_replacement((select id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'), 'ea300000-0000-0000-0000-000000000006')$q$),
  'the manager can change the replacement to a different valid candidate before approval'
);
select is(
  (select replacement_employee_id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'),
  'ea300000-0000-0000-0000-000000000006'::uuid,
  'the replacement was changed, not left as the first assignment'
);

-- Case 10: after a valid assignment, the canonical decide RPC's own approve path now succeeds (integration -- this migration does not touch decide's own logic).
select ok(
  pg_temp.as_auth_exec('ea200000-0000-0000-0000-000000000002',
    $q$select api.decide_workforce_shift_exchange((select id from workforce.shift_exchanges where shift_id='ea500000-0000-0000-0000-000000000001'), 'approved')$q$),
  'the canonical decide RPC can now approve, since replacement_employee_id is set'
);
select is(
  (select employee_id from workforce.shifts where id='ea500000-0000-0000-0000-000000000001'),
  'ea300000-0000-0000-0000-000000000006'::uuid,
  'the shift is reassigned to the manager-assigned replacement on approval'
);

select * from finish();
rollback;
