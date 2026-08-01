begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;
select no_plan();

select has_column('workforce', 'shift_exchanges', 'request_kind', 'shift request kind is persisted');
select has_column('workforce', 'shift_exchanges', 'requested_shift_type_id', 'requested shift type is persisted');

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

insert into core.tenants (id, slug, name) values
  ('ce000000-0000-0000-0000-000000000001', 'shift-change-test', 'Shift change test');
insert into core.locations (id, tenant_id, name, timezone) values
  ('ce100000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001', 'Cafe', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('ce200000-0000-0000-0000-000000000001', 'Staff'),
  ('ce200000-0000-0000-0000-000000000002', 'Manager');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('ce000000-0000-0000-0000-000000000001', 'ce200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'ce100000-0000-0000-0000-000000000001'),
  ('ce000000-0000-0000-0000-000000000001', 'ce200000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'ce100000-0000-0000-0000-000000000001');
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('ce300000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001', 'ce200000-0000-0000-0000-000000000001', '\x00');
insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, break_minutes) values
  ('ce400000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001', 'DAY', '日勤', '09:00', '17:00', 60),
  ('ce400000-0000-0000-0000-000000000002', 'ce000000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001', 'LATE', '遅番', '13:00', '21:00', 60);
insert into workforce.shifts (id, tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, published) values
  ('ce500000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001', 'ce300000-0000-0000-0000-000000000001', 'ce400000-0000-0000-0000-000000000001', '2030-08-01 00:00+00', '2030-08-01 08:00+00', true),
  ('ce500000-0000-0000-0000-000000000002', 'ce000000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001', 'ce300000-0000-0000-0000-000000000001', 'ce400000-0000-0000-0000-000000000001', '2030-08-02 00:00+00', '2030-08-02 08:00+00', true);

select ok(pg_temp.as_auth_exec('ce200000-0000-0000-0000-000000000001',
  $q$insert into api.workforce_shift_exchanges
    (tenant_id, location_id, shift_id, requester_employee_id, reason, request_kind)
    values ('ce000000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001', 'ce500000-0000-0000-0000-000000000001', 'ce300000-0000-0000-0000-000000000001', 'Family appointment', 'cancel')$q$),
  'staff can request cancellation of their own future shift');
select ok(pg_temp.as_auth_exec('ce200000-0000-0000-0000-000000000002',
  $q$select api.decide_workforce_shift_exchange((select id from workforce.shift_exchanges where shift_id='ce500000-0000-0000-0000-000000000001'), 'approved')$q$),
  'manager can approve cancellation');
select is((select employee_id from workforce.shifts where id='ce500000-0000-0000-0000-000000000001'), null::uuid, 'approved cancellation unassigns the shift');

select ok(pg_temp.as_auth_exec('ce200000-0000-0000-0000-000000000001',
  $q$insert into api.workforce_shift_exchanges
    (tenant_id, location_id, shift_id, requester_employee_id, reason, request_kind, requested_shift_type_id)
    values ('ce000000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001', 'ce500000-0000-0000-0000-000000000002', 'ce300000-0000-0000-0000-000000000001', 'School', 'change', 'ce400000-0000-0000-0000-000000000002')$q$),
  'staff can request a different active shift type');
select ok(pg_temp.as_auth_exec('ce200000-0000-0000-0000-000000000002',
  $q$select api.decide_workforce_shift_exchange((select id from workforce.shift_exchanges where shift_id='ce500000-0000-0000-0000-000000000002'), 'approved')$q$),
  'manager can approve a shift type change');
select is((select shift_type_id from workforce.shifts where id='ce500000-0000-0000-0000-000000000002'), 'ce400000-0000-0000-0000-000000000002'::uuid, 'approved change updates the shift type');
select is((select starts_at from workforce.shifts where id='ce500000-0000-0000-0000-000000000002'), '2030-08-02 04:00+00'::timestamptz, 'approved change recalculates start in location timezone');

select * from finish();
rollback;
