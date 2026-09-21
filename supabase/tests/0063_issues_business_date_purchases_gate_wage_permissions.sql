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
  ('a2900000-0000-0000-0000-000000000002', 'Manager A');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'a2200000-0000-0000-0000-000000000001'), -- employee, loc 1
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'a2200000-0000-0000-0000-000000000002'), -- employee, loc 2
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', 'a2200000-0000-0000-0000-000000000001'); -- manager, loc 1

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

insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000001', 'active'),
  ('a2000000-0000-0000-0000-00000000000a', 'a2900000-0000-0000-0000-000000000002', 'active');

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

select ok(
  pg_temp.as_auth_throws_code('a2900000-0000-0000-0000-000000000001',
    $$update issues.issues set business_date = business_date + 1$$, '42501')
  or pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000001',
    $$update issues.issues set business_date = business_date + 1$$) <= 0,
  'business_date stays immutable for a Staff caller (0118 guard / no update grant)'
);
reset role;

-- ============================================================================
-- B. Inventory module OFF blocks Purchases writes with P0004 (0122)
-- ============================================================================
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
  pg_temp.as_auth_rowcount('a2900000-0000-0000-0000-000000000002', format(
    $f$insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type, ordered_quantity)
       values ('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', %L, 'a2900000-0000-0000-0000-000000000002', 'ordered', 5)$f$,
    (select id from inventory.stock_counts where item_id = 'a2100000-0000-0000-0000-000000000001' limit 1)
  )) = -1,
  'a direct purchase_actions INSERT is refused while Inventory is OFF (policy gate restored)'
);
reset role;

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
    $$update api.workforce_staff_manage set hourly_wage_yen = 1 where staff_id = 'a2300000-0000-0000-0000-000000000001'$$) <= 0,
  true,
  'Staff cannot change an employee''s hourly wage through api.workforce_staff_manage'
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

select * from finish();
rollback;
