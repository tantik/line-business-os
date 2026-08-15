begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;
select no_plan();

/**
 * Canonical Manager shift-exchange decision surface (Cafe v2.1 acceptance
 * gap closure) -- the app-layer Manager UI/action added in
 * `apps/web/src/app/(protected)/dashboard/workforce/manager/manager-dashboard-client.tsx`
 * and `apps/web/src/lib/workforce/shift-exchange-actions.ts`'s
 * `decideShiftExchange` has no app-level permission check of its own; RLS
 * (`wf_shift_exchanges_manage`) and `api.decide_workforce_shift_exchange`'s
 * own `workforce.request.manage` re-check (0044/0050) are the entire
 * authorization boundary. These are the negative-path/isolation cases not
 * already covered by 0017_cafe_final_improvements.sql (happy-path
 * approve/accept) or 0021_workforce_shift_change_requests.sql (request_kind
 * variants): a non-manager staff member cannot decide at all, a manager in
 * another tenant cannot see or decide, a manager without location-scoped
 * permission cannot decide, and an already-decided request cannot be
 * decided again.
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

-- Same auth-context switch as as_auth_exec, but for a `select count(*) ...`
-- whose result is itself the assertion (RLS silently filters rows rather
-- than erroring the statement, so "cannot see" must be checked this way,
-- not via as_auth_exec's success/failure).
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
  ('ec000000-0000-0000-0000-000000000001', 'exchange-decision-test-a', 'Exchange Decision Test A');
insert into core.locations (id, tenant_id, name, timezone) values
  ('ec100000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-000000000001', 'Cafe A', 'Asia/Tokyo'),
  ('ec100000-0000-0000-0000-000000000002', 'ec000000-0000-0000-0000-000000000001', 'Cafe A - Second Location', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('ec200000-0000-0000-0000-000000000001', 'Staff A'),
  ('ec200000-0000-0000-0000-000000000002', 'Manager A (location 1)'),
  ('ec200000-0000-0000-0000-000000000003', 'Manager A (location 2 only)');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('ec000000-0000-0000-0000-000000000001', 'ec200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'ec100000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000001', 'ec200000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'ec100000-0000-0000-0000-000000000001'),
  ('ec000000-0000-0000-0000-000000000001', 'ec200000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'ec100000-0000-0000-0000-000000000002');
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('ec300000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-000000000001', 'ec100000-0000-0000-0000-000000000001', 'ec200000-0000-0000-0000-000000000001', '\x00');
insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, break_minutes) values
  ('ec400000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-000000000001', 'ec100000-0000-0000-0000-000000000001', 'DAY', '日勤', '09:00', '17:00', 60);
insert into workforce.shifts (id, tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, published) values
  ('ec500000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-000000000001', 'ec100000-0000-0000-0000-000000000001', 'ec300000-0000-0000-0000-000000000001', 'ec400000-0000-0000-0000-000000000001', '2030-08-01 00:00+00', '2030-08-01 08:00+00', true),
  ('ec500000-0000-0000-0000-000000000002', 'ec000000-0000-0000-0000-000000000001', 'ec100000-0000-0000-0000-000000000001', 'ec300000-0000-0000-0000-000000000001', 'ec400000-0000-0000-0000-000000000001', '2030-08-02 00:00+00', '2030-08-02 08:00+00', true);

-- Tenant B: an unrelated tenant, used only for the cross-tenant isolation case.
insert into core.tenants (id, slug, name) values
  ('ec000000-0000-0000-0000-000000000002', 'exchange-decision-test-b', 'Exchange Decision Test B');
insert into core.locations (id, tenant_id, name, timezone) values
  ('ec100000-0000-0000-0000-000000000003', 'ec000000-0000-0000-0000-000000000002', 'Cafe B', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('ec200000-0000-0000-0000-000000000004', 'Manager B');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('ec000000-0000-0000-0000-000000000002', 'ec200000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', 'ec100000-0000-0000-0000-000000000003');

-- Case 1: staff can submit a valid cancellation request (canonical Staff submit path, already existing).
select ok(pg_temp.as_auth_exec('ec200000-0000-0000-0000-000000000001',
  $q$insert into api.workforce_shift_exchanges
    (tenant_id, location_id, shift_id, requester_employee_id, reason, request_kind)
    values ('ec000000-0000-0000-0000-000000000001', 'ec100000-0000-0000-0000-000000000001', 'ec500000-0000-0000-0000-000000000001', 'ec300000-0000-0000-0000-000000000001', 'Doctor appointment', 'cancel')$q$),
  'staff can submit a valid shift-exchange (cancellation) request');

-- Case 2: an unauthorized staff member (the requester themself, who holds no workforce.request.manage) cannot decide.
select ok(
  not pg_temp.as_auth_exec('ec200000-0000-0000-0000-000000000001',
    $q$select api.decide_workforce_shift_exchange((select id from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'), 'approved')$q$),
  'unauthorized staff (the requester, no workforce.request.manage) cannot decide their own request'
);
select is(
  (select status from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'),
  'open',
  'the unauthorized decide attempt left the request untouched (still open)'
);

-- Case 3: a manager of a different tenant cannot see or decide the request (tenant isolation).
select is(
  pg_temp.as_auth_count('ec200000-0000-0000-0000-000000000004',
    $q$select count(*) from api.workforce_shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'$q$),
  0,
  'a manager from a different tenant cannot see the request at all (RLS-filtered, not just decision-denied)'
);
select ok(
  not pg_temp.as_auth_exec('ec200000-0000-0000-0000-000000000004',
    $q$select api.decide_workforce_shift_exchange((select id from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'), 'approved')$q$),
  'a manager from a different tenant cannot decide the request'
);
select is(
  (select status from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'),
  'open',
  'the cross-tenant decide attempt left the request untouched (still open)'
);

-- Case 4: a manager who holds workforce.request.manage only at a different location in the SAME tenant cannot decide (location scoping).
select ok(
  not pg_temp.as_auth_exec('ec200000-0000-0000-0000-000000000003',
    $q$select api.decide_workforce_shift_exchange((select id from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'), 'approved')$q$),
  'a manager scoped to a different location in the same tenant cannot decide the request'
);
select is(
  (select status from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'),
  'open',
  'the wrong-location decide attempt left the request untouched (still open)'
);

-- Case 5: the correctly-scoped manager CAN approve.
select ok(
  pg_temp.as_auth_exec('ec200000-0000-0000-0000-000000000002',
    $q$select api.decide_workforce_shift_exchange((select id from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'), 'approved')$q$),
  'the correctly tenant+location-scoped manager can approve'
);
select is(
  (select status from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'),
  'approved',
  'approval is persisted'
);
select is(
  (select employee_id from workforce.shifts where id='ec500000-0000-0000-0000-000000000001'),
  null::uuid,
  'approved cancellation unassigns the shift (resulting state correctly reflected)'
);

-- Case 6: an already-decided request cannot be decided again (no re-approve, no flip to rejected after approval).
select ok(
  not pg_temp.as_auth_exec('ec200000-0000-0000-0000-000000000002',
    $q$select api.decide_workforce_shift_exchange((select id from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'), 'approved')$q$),
  'an already-approved request cannot be approved again'
);
select ok(
  not pg_temp.as_auth_exec('ec200000-0000-0000-0000-000000000002',
    $q$select api.decide_workforce_shift_exchange((select id from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'), 'rejected')$q$),
  'an already-approved request cannot be flipped to rejected'
);
select is(
  (select status from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000001'),
  'approved',
  'status is unchanged by the rejected re-decide attempts'
);

-- Case 7: a separate valid request can be rejected (Definition of Done #4).
select ok(pg_temp.as_auth_exec('ec200000-0000-0000-0000-000000000001',
  $q$insert into api.workforce_shift_exchanges
    (tenant_id, location_id, shift_id, requester_employee_id, reason, request_kind)
    values ('ec000000-0000-0000-0000-000000000001', 'ec100000-0000-0000-0000-000000000001', 'ec500000-0000-0000-0000-000000000002', 'ec300000-0000-0000-0000-000000000001', 'Second request', 'cancel')$q$),
  'staff can submit a second, separate valid request');
select ok(
  pg_temp.as_auth_exec('ec200000-0000-0000-0000-000000000002',
    $q$select api.decide_workforce_shift_exchange((select id from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000002'), 'rejected')$q$),
  'the manager can reject a separate valid request'
);
select is(
  (select status from workforce.shift_exchanges where shift_id='ec500000-0000-0000-0000-000000000002'),
  'rejected',
  'rejection is persisted'
);
select is(
  (select employee_id from workforce.shifts where id='ec500000-0000-0000-0000-000000000002'),
  'ec300000-0000-0000-0000-000000000001'::uuid,
  'a rejected cancellation leaves the shift assignment untouched'
);

select * from finish();
rollback;
