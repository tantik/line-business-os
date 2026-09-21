-- ============================================================================
-- DB test: migration 0122 (Issues business_date in the location timezone,
-- Inventory module gate restored on Purchases writes) plus the permission
-- boundary of the employee hourly wage (workforce.employees.hourly_wage_yen,
-- 0048) that the Manager staff form now edits.
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, issues, ai;

select no_plan();

-- ============================================================================
-- Fixtures
-- ============================================================================
insert into core.tenants (id, slug, name) values
  ('a2000000-0000-0000-0000-00000000000a', 'pgtap-0122-tenant-a', 'pgTAP 0122 Tenant A');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a2000000-0000-0000-0000-00000000000a', 'inventory', true),
  ('a2000000-0000-0000-0000-00000000000a', 'issues', true),
  ('a2000000-0000-0000-0000-00000000000a', 'workforce', true);

-- Two locations whose local dates can never both equal the UTC date at the
-- same instant (UTC+14 and UTC-11 are 25 hours apart).
insert into core.locations (id, tenant_id, name, timezone) values
  ('a2200000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000a', 'Kiritimati Location', 'Pacific/Kiritimati'),
  ('a2200000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a', 'Pago Pago Location', 'Pacific/Pago_Pago');

insert into core.users (id, display_name) values
  ('a2900000-0000-0000-0000-000000000001', 'Staff A'),
  ('a2900000-0000-0000-0000-000000000002', 'Manager A'),
  ('a2900000-0000-0000-0000-000000000003', 'Tenant-wide Manager');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'a2200000-0000-0000-0000-000000000001'), -- employee, loc 1
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'a2200000-0000-0000-0000-000000000002'), -- employee, loc 2
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', 'a2200000-0000-0000-0000-000000000001'), -- manager, loc 1
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000005', null); -- manager, tenant-wide (any location)

-- Short item at location 1 (reorder point 5, latest count 3).
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point)
  values ('a2100000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000a',
          'a2200000-0000-0000-0000-000000000001', 'Coffee Beans', 'kg', 20, 5);

insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by)
  values ('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001',
          'a2100000-0000-0000-0000-000000000001', 3, 'a2900000-0000-0000-0000-000000000001');

-- An employee whose wage and notes must survive and be permission-protected.
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, hourly_wage_yen, notes_encrypted) values
  ('a2300000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000a',
   'a2200000-0000-0000-0000-000000000001', '\x00', 1200, '\x0102');

-- Staff A's own employee row (linked to the auth user): this is what makes the
-- 0061 coworker-roster policy let Staff A SELECT the coworker row above.
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted, hourly_wage_yen) values
  ('a2300000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a',
   'a2200000-0000-0000-0000-000000000001', 'a2900000-0000-0000-0000-000000000001', '\x00', 1000);

insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000001', 'active'),
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000002', 'active'),
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000003', 'active');

create function pg_temp.as_auth_throws_code(p_sub text, p_sql text, p_expected_code text)
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
  -- P0004 is ASSERT_FAILURE in PL/pgSQL, which WHEN OTHERS does not catch.
  when assert_failure then
    return p_expected_code = 'P0004';
  when others then
    return sqlstate = p_expected_code;
end;
$$;

-- Runs a write as p_sub and returns the affected row count, or -1 when it raised.
create function pg_temp.as_auth_rowcount(p_sub text, p_sql text)
returns integer
language plpgsql
as $$
declare v_n integer;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  get diagnostics v_n = row_count;
  return v_n;
exception
  when assert_failure then
    return -1;
  when others then
    return -1;
end;
$$;

create function pg_temp.as_create_issue(p_sub text, p_location uuid)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select api.issues_create('a2000000-0000-0000-0000-00000000000a', p_location, 'issue', 'pgTAP 0122 note') into v_id;
  return v_id;
end;
$$;

-- ============================================================================
-- A. Issues business_date is the location-local date
-- ============================================================================
create temp table t_issue_ids (loc int, id uuid);

insert into t_issue_ids select 1, pg_temp.as_create_issue('a2900000-0000-0000-0000-000000000001', 'a2200000-0000-0000-0000-000000000001');
reset role;
insert into t_issue_ids select 2, pg_temp.as_create_issue('a2900000-0000-0000-0000-000000000001', 'a2200000-0000-0000-0000-000000000002');
reset role;

select is(
  (select i.business_date from issues.issues i join t_issue_ids t on t.id = i.id where t.loc = 1),
  (now() at time zone 'Pacific/Kiritimati')::date,
  'issue at a UTC+14 location gets that location''s local date'
);
select is(
  (select i.business_date from issues.issues i join t_issue_ids t on t.id = i.id where t.loc = 2),
  (now() at time zone 'Pacific/Pago_Pago')::date,
  'issue at a UTC-11 location gets that location''s local date'
);
select isnt(
  (select i.business_date from issues.issues i join t_issue_ids t on t.id = i.id where t.loc = 1),
  (select i.business_date from issues.issues i join t_issue_ids t on t.id = i.id where t.loc = 2),
  'the two locations get different business dates at the same instant (so at least one differs from the UTC date)'
);

-- The 0118 guard trigger itself (a Manager reaches it; Staff would be stopped by RLS first).
select ok(
  pg_temp.as_auth_throws_code('a2900000-0000-0000-0000-000000000002',
    $$update issues.issues set business_date = business_date + 1$$, 'P0001'),
  'the 0118 guard still rejects a business_date change (issue_immutable_fields, P0001) for a Manager'
);
reset role;

-- The fail-closed branch: a caller authorised at every location (tenant-wide
-- manager) naming a location that does not exist gets P0002, never a UTC date.
select ok(
  pg_temp.as_auth_throws_code('a2900000-0000-0000-0000-000000000003',
    $$select api.issues_create('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000ff', 'issue', 'no such location')$$,
    'P0002'),
  'api.issues_create raises issues_location_not_found (P0002) for a location that does not exist in the tenant'
);
reset role;

-- The timezone helper works for a caller with NO core.locations RLS visibility
-- (role assignment but no active membership), so issue creation does not depend on it.
-- A caller with a role assignment but NO tenant membership cannot read core.locations
-- through RLS; the SECURITY DEFINER helper must still return the timezone.
insert into core.users (id, display_name) values ('a2900000-0000-0000-0000-000000000004', 'Role-only user (no membership)');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000006', 'a2200000-0000-0000-0000-000000000001');

create function pg_temp.as_auth_text(p_sub text, p_sql text)
returns text
language plpgsql
as $$
declare v_out text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into v_out;
  return v_out;
exception
  when others then
    return 'ERROR ' || sqlstate;
end;
$$;

select is(
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000004',
    $$select id from core.locations where id = 'a2200000-0000-0000-0000-000000000001'$$),
  0,
  'precondition: the role-only user cannot read core.locations through RLS'
);
reset role;
select is(
  pg_temp.as_auth_text('a2900000-0000-0000-0000-000000000004',
    $$select issues.location_timezone('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001')$$),
  'Pacific/Kiritimati',
  'issues.location_timezone still returns the timezone for a caller with no core.locations visibility (independent of RLS)'
);
reset role;
reset role;

-- ============================================================================
-- B. Inventory module OFF blocks Purchases writes with P0004 (0122)
-- ============================================================================
-- Positive control first (module ON): the very same direct INSERT succeeds, so the
-- refusal below can only be the restored policy conjunct, not a CHECK/FK/grant.
select is(
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000002', format(
    $f$insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type, ordered_quantity)
       values ('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', %L, 'a2900000-0000-0000-0000-000000000002', 'ordered', 5)$f$,
    (select id from inventory.stock_counts where item_id = 'a2100000-0000-0000-0000-000000000001' order by counted_at desc, id desc limit 1)
  )),
  1,
  'positive control: a direct purchase_actions INSERT is accepted while Inventory is ON'
);
reset role;

update core.tenant_modules set is_enabled = false
  where tenant_id = 'a2000000-0000-0000-0000-00000000000a' and module = 'inventory';

select ok(
  pg_temp.as_auth_throws_code('a2900000-0000-0000-0000-000000000002',
    $$select * from api.record_purchase_order('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', 5)$$,
    'P0004'),
  'record_purchase_order raises purchases_module_disabled (P0004) when Inventory is OFF'
);
reset role;
select ok(
  pg_temp.as_auth_throws_code('a2900000-0000-0000-0000-000000000002',
    $$select * from api.record_purchase_receipt('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', 5)$$,
    'P0004'),
  'record_purchase_receipt raises purchases_module_disabled (P0004) when Inventory is OFF'
);
reset role;
select ok(
  pg_temp.as_auth_throws_code('a2900000-0000-0000-0000-000000000002',
    $$select * from api.record_purchase_action('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001')$$,
    'P0004'),
  'record_purchase_action (0094) still raises P0004 when Inventory is OFF'
);
reset role;

-- The policy itself, not only the RPC pre-check: a direct INSERT is refused too.
select ok(
  pg_temp.as_auth_throws_code('a2900000-0000-0000-0000-000000000002', format(
    $f$insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type, ordered_quantity)
       values ('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', %L, 'a2900000-0000-0000-0000-000000000002', 'ordered', 5)$f$,
    (select id from inventory.stock_counts where item_id = 'a2100000-0000-0000-0000-000000000001' order by counted_at desc, id desc limit 1)
  ), '42501'),
  'the identical direct INSERT is refused by RLS (42501) while Inventory is OFF (the has_module_access conjunct itself is asserted by the pg_policy check below and by the P0004 RPC checks)'
);
reset role;

select ok(
  (select pg_get_expr(polwithcheck, polrelid) like '%has_module_access%'
     from pg_policy where polname = 'purchases_actions_insert'),
  'purchases_actions_insert WITH CHECK contains the has_module_access conjunct'
);

-- Back ON: the same caller can order again (the gate blocks only the OFF state).
update core.tenant_modules set is_enabled = true
  where tenant_id = 'a2000000-0000-0000-0000-00000000000a' and module = 'inventory';

select ok(
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000002',
    $$select * from api.record_purchase_order('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', 5)$$) >= 0,
  'with Inventory ON the Manager can record an order again'
);
reset role;

-- ============================================================================
-- C. Employee hourly wage: Manager can write it, Staff cannot
-- ============================================================================
select is(
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000001',
    $$update api.workforce_staff_manage set hourly_wage_yen = 1 where staff_id = 'a2300000-0000-0000-0000-000000000001'$$) = 0,
  true,
  'Staff cannot change an employee''s hourly wage through api.workforce_staff_manage (0 rows match: the view no longer shows Staff any row)'
);
reset role;
select is(
  (select hourly_wage_yen from workforce.employees where id = 'a2300000-0000-0000-0000-000000000001'),
  1200,
  'the wage is unchanged after the Staff attempt'
);

select is(
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000002',
    $$update api.workforce_staff_manage set hourly_wage_yen = 1500 where staff_id = 'a2300000-0000-0000-0000-000000000001'$$),
  1,
  'Manager can change the hourly wage of an employee at their location'
);
reset role;
select is(
  (select hourly_wage_yen from workforce.employees where id = 'a2300000-0000-0000-0000-000000000001'),
  1500,
  'the new wage is persisted'
);
select is(
  (select notes_encrypted from workforce.employees where id = 'a2300000-0000-0000-0000-000000000001'),
  '\x0102'::bytea,
  'a wage-only update leaves the encrypted notes untouched'
);

select ok(
  pg_temp.as_auth_throws_code('a2900000-0000-0000-0000-000000000002',
    $$update api.workforce_staff_manage set hourly_wage_yen = -1 where staff_id = 'a2300000-0000-0000-0000-000000000001'$$, '23514'),
  'a negative wage is rejected by the 0048 CHECK'
);
reset role;
select ok(
  pg_temp.as_auth_throws_code('a2900000-0000-0000-0000-000000000002',
    $$update api.workforce_staff_manage set hourly_wage_yen = 1000001 where staff_id = 'a2300000-0000-0000-0000-000000000001'$$, '23514'),
  'a wage above 1,000,000 is rejected by the 0048 CHECK'
);
reset role;
select is(
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000002',
    $$update api.workforce_staff_manage set hourly_wage_yen = null where staff_id = 'a2300000-0000-0000-0000-000000000001'$$),
  1,
  'a NULL wage (not set) is allowed'
);
reset role;

-- ============================================================================
-- D. api.workforce_staff_manage is Manager-only for READ too (0122, Part C)
-- ============================================================================
select is(
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000001',
    $$select staff_id, hourly_wage_yen from api.workforce_staff_manage$$),
  0,
  'a plain Staff caller reads ZERO rows from api.workforce_staff_manage (no coworker wage, no encrypted contact columns)'
);
reset role;

select ok(
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000001',
    $$select employee_id from api.workforce_staff_roster where tenant_id = 'a2000000-0000-0000-0000-00000000000a'$$) >= 2,
  'the Staff-facing roster (id and name only) still works for Staff'
);
reset role;

select ok(
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000002',
    $$select staff_id, hourly_wage_yen from api.workforce_staff_manage$$) >= 2,
  'the Manager still reads the staff rows (with wage) from api.workforce_staff_manage'
);
reset role;

select is(
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000002',
    $$insert into api.workforce_staff_manage (tenant_id, location_id, name_encrypted, hourly_wage_yen)
      values ('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', '\x00', 1234)$$),
  1,
  'the Manager can still create an employee through the view'
);
reset role;

select ok(
  pg_temp.as_auth_throws_code('a2900000-0000-0000-0000-000000000001',
    $$insert into api.workforce_staff_manage (tenant_id, location_id, name_encrypted, hourly_wage_yen)
      values ('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', '\x00', 1)$$, '42501'),
  'a Staff caller cannot create an employee through the view (RLS 42501)'
);
reset role;

select * from finish();
rollback;
