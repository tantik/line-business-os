-- ============================================================================
-- DB test: migration 0145 (api.staff_dashboard, DEBT-135).
-- Run with:  supabase db reset && supabase test db
-- Fixtures: the same as 0083 (api.manager_dashboard), plus today's Operations
-- task instances with responses.
--   A  grants / ADR 0008 / anon refused
--   B  shared parts equal api.manager_dashboard's same parts for the same
--      caller and inputs; staff-only parts equal the direct read of their
--      source with the same filters, order and limit: Employee, Manager and
--      Owner of T1 (each with an employee id), Manager of T2 asked for T1
--   C  isolation: a T2 user sees no T1 row in any part
--   D  input validation (22023); unrequested parts are omitted
--   E  a failing part is isolated; 20000+ rows of a paged part -> LBO_ROW_CAP
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core;

select no_plan();

-- run p_sql as an authenticated user; returns the text result or 'ERR <state> <msg>'
create function pg_temp.as_user(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return 'ERR ' || sqlstate || ' ' || sqlerrm;
end $$;

create function pg_temp.anon_err(p_sql text) returns text language plpgsql as $$
begin
  set local role anon;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;

-- fixtures ------------------------------------------------------------------------------------
-- T1 (every module on, L1 + L2), T2 (every module on, one location).
-- Users: O owner of T1, M manager at T1/L1, E employee at T1/L1, X manager of T2, N invitee.
insert into core.tenants (id, slug, name) values
  ('a8400000-0000-0000-0000-0000000000a1', 'pgtap-0144-t1', 'pgTAP 0144 T1'),
  ('a8400000-0000-0000-0000-0000000000a2', 'pgtap-0144-t2', 'pgTAP 0144 T2');
insert into core.tenant_modules (tenant_id, module, is_enabled)
select t, m::core.module_code, true
  from unnest(array['a8400000-0000-0000-0000-0000000000a1', 'a8400000-0000-0000-0000-0000000000a2']::uuid[]) t,
       unnest(array['workforce', 'inventory', 'purchases', 'recipes', 'operations', 'issues']) m;
insert into core.locations (id, tenant_id, name, timezone) values
  ('a8410000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'T1 / L1', 'Asia/Tokyo'),
  ('a8410000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'T1 / L2', 'Asia/Tokyo'),
  ('a8410000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a2', 'T2 / L1', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('a8490000-0000-0000-0000-000000000001', 'O'),
  ('a8490000-0000-0000-0000-000000000002', 'M'),
  ('a8490000-0000-0000-0000-000000000003', 'E'),
  ('a8490000-0000-0000-0000-000000000004', 'X'),
  ('a8490000-0000-0000-0000-000000000005', 'N');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a8400000-0000-0000-0000-0000000000a1', 'a8490000-0000-0000-0000-000000000001', 'active'),
  ('a8400000-0000-0000-0000-0000000000a1', 'a8490000-0000-0000-0000-000000000002', 'active'),
  ('a8400000-0000-0000-0000-0000000000a1', 'a8490000-0000-0000-0000-000000000003', 'active'),
  ('a8400000-0000-0000-0000-0000000000a2', 'a8490000-0000-0000-0000-000000000004', 'active');
-- role ids: tenant_owner=...003, manager=...005, employee=...006
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a8400000-0000-0000-0000-0000000000a1', 'a8490000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', null),
  ('a8400000-0000-0000-0000-0000000000a1', 'a8490000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'a8410000-0000-0000-0000-000000000001'),
  ('a8400000-0000-0000-0000-0000000000a1', 'a8490000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'a8410000-0000-0000-0000-000000000001'),
  ('a8400000-0000-0000-0000-0000000000a2', 'a8490000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', null);

-- employees: e1 (E, T1/L1), e2 (T1/L2), e3 (T2), e4 (M, T1/L1)
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('a8430000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8490000-0000-0000-0000-000000000003', '\x01'),
  ('a8430000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', null, '\x02'),
  ('a8430000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', null, '\x03'),
  ('a8430000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8490000-0000-0000-0000-000000000002', '\x04');

insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, break_minutes) values
  ('a8440000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'DAY', '日勤', '09:00', '17:00', 60),
  ('a8440000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'DAY', '日勤', '09:00', '17:00', 60),
  ('a8440000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'DAY', '日勤', '09:00', '17:00', 60);

-- shifts: week window [2026-01-05, 2026-01-12), exchange window [2025-11-01, 2026-03-01)
insert into workforce.shifts (id, tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('a8450000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', '2026-01-06 00:00:00+00', '2026-01-06 08:00:00+00', true),
  ('a8450000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', '2026-02-10 00:00:00+00', '2026-02-10 08:00:00+00', false),
  ('a8450000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a8430000-0000-0000-0000-000000000002', '2026-01-07 00:00:00+00', '2026-01-07 08:00:00+00', true),
  ('a8450000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'a8430000-0000-0000-0000-000000000003', '2026-01-06 00:00:00+00', '2026-01-06 08:00:00+00', true),
  ('a8450000-0000-0000-0000-000000000005', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000004', '2026-01-05 00:00:00+00', '2026-01-05 08:00:00+00', true),
  ('a8450000-0000-0000-0000-000000000006', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', '2026-01-12 00:00:00+00', '2026-01-12 08:00:00+00', true),
  ('a8450000-0000-0000-0000-000000000007', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', null, '2025-06-01 00:00:00+00', '2025-06-01 08:00:00+00', false);

-- attendance: range [2025-12-01, 2026-01-31]
insert into workforce.attendance (id, tenant_id, location_id, employee_id, work_date, clock_in, clock_out) values
  ('a8460000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', '2026-01-06', '2026-01-06 00:00:00+00', '2026-01-06 08:00:00+00'),
  ('a8460000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', '2025-10-01', null, null),
  ('a8460000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a8430000-0000-0000-0000-000000000002', '2026-01-07', null, null),
  ('a8460000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'a8430000-0000-0000-0000-000000000003', '2026-01-06', null, null),
  ('a8460000-0000-0000-0000-000000000005', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000004', '2026-01-31', null, null);

-- shift requests: preference window starts 2025-11-01
insert into workforce.shift_requests (id, tenant_id, location_id, employee_id, work_date, kind, status, attendance_id, details) values
  ('a8470000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', '2026-01-08', 'preference', 'pending', null, '{}'),
  ('a8470000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', '2025-10-15', 'preference', 'pending', null, '{}'),
  ('a8470000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', '2026-01-06', 'correction', 'pending', 'a8460000-0000-0000-0000-000000000001', '{"clockInLocal": "09:05"}'),
  ('a8470000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a8430000-0000-0000-0000-000000000002', '2026-01-09', 'preference', 'pending', null, '{}'),
  ('a8470000-0000-0000-0000-000000000005', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'a8430000-0000-0000-0000-000000000003', '2026-01-08', 'preference', 'pending', null, '{}'),
  ('a8470000-0000-0000-0000-000000000006', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000004', '2025-11-01', 'preference', 'approved', null, '{}');

insert into workforce.shift_exchanges (id, tenant_id, location_id, shift_id, requester_employee_id, reason, status, created_at) values
  ('a8480000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8450000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', 'swap please', 'open', '2026-01-06 03:00:00+00'),
  ('a8480000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8450000-0000-0000-0000-000000000002', 'a8430000-0000-0000-0000-000000000001', 'later one', 'open', '2026-01-07 03:00:00+00'),
  ('a8480000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a8450000-0000-0000-0000-000000000003', 'a8430000-0000-0000-0000-000000000002', 'other location', 'open', '2026-01-06 03:00:00+00'),
  ('a8480000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'a8450000-0000-0000-0000-000000000004', 'a8430000-0000-0000-0000-000000000003', 'other tenant', 'open', '2026-01-06 03:00:00+00');

insert into workforce.employee_line_links (tenant_id, employee_id, line_user_id_encrypted, line_user_id_hash, is_active) values
  ('a8400000-0000-0000-0000-0000000000a1', 'a8430000-0000-0000-0000-000000000001', '\x01', 'pgtap-0144-h1', true),
  ('a8400000-0000-0000-0000-0000000000a1', 'a8430000-0000-0000-0000-000000000002', '\x02', 'pgtap-0144-h2', false),
  ('a8400000-0000-0000-0000-0000000000a2', 'a8430000-0000-0000-0000-000000000003', '\x03', 'pgtap-0144-h3', true);

insert into workforce.employee_invitations (tenant_id, employee_id, target_user_id, status, invited_by) values
  ('a8400000-0000-0000-0000-0000000000a1', 'a8430000-0000-0000-0000-000000000002', 'a8490000-0000-0000-0000-000000000005', 'pending', 'a8490000-0000-0000-0000-000000000001'),
  ('a8400000-0000-0000-0000-0000000000a2', 'a8430000-0000-0000-0000-000000000003', 'a8490000-0000-0000-0000-000000000005', 'pending', 'a8490000-0000-0000-0000-000000000004');

insert into workforce.staff_messages (tenant_id, location_id, employee_id, sender_role, sender_user_id, body, created_at, deleted_at) values
  ('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', 'staff', 'a8490000-0000-0000-0000-000000000003', 'hi', '2026-01-06 01:00:00+00', null),
  ('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', 'manager', 'a8490000-0000-0000-0000-000000000002', 'hello', '2026-01-06 02:00:00+00', null),
  ('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001', 'staff', 'a8490000-0000-0000-0000-000000000003', 'deleted', '2026-01-06 03:00:00+00', now()),
  ('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a8430000-0000-0000-0000-000000000002', 'manager', 'a8490000-0000-0000-0000-000000000001', 'l2', '2026-01-06 01:00:00+00', null),
  ('a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'a8430000-0000-0000-0000-000000000003', 'manager', 'a8490000-0000-0000-0000-000000000004', 't2', '2026-01-06 01:00:00+00', null);

-- inventory + purchases: i1 short at T1/L1 with an open order, i2 inactive at T1/L1, i3 at T1/L2, i4 at T2
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point, is_active) values
  ('a84a0000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'Milk', 'L', 10, 3, true),
  ('a84a0000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'Old syrup', 'L', 2, 1, false),
  ('a84a0000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'Beans', 'kg', 10, 5, true),
  ('a84a0000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'T2 Milk', 'L', 10, 5, true);
insert into inventory.stock_counts (id, tenant_id, location_id, item_id, actual_quantity, counted_by) values
  ('a84b0000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a84a0000-0000-0000-0000-000000000001', 1, 'a8490000-0000-0000-0000-000000000003'),
  ('a84b0000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a84a0000-0000-0000-0000-000000000003', 1, 'a8490000-0000-0000-0000-000000000001'),
  ('a84b0000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'a84a0000-0000-0000-0000-000000000004', 1, 'a8490000-0000-0000-0000-000000000004');
insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type, ordered_quantity, actioned_at) values
  ('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a84a0000-0000-0000-0000-000000000001', 'a84b0000-0000-0000-0000-000000000001', 'a8490000-0000-0000-0000-000000000002', 'ordered', 6, '2026-01-06 01:00:00+00'),
  ('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a84a0000-0000-0000-0000-000000000003', 'a84b0000-0000-0000-0000-000000000003', 'a8490000-0000-0000-0000-000000000001', 'ordered', 4, '2026-01-06 02:00:00+00'),
  ('a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'a84a0000-0000-0000-0000-000000000004', 'a84b0000-0000-0000-0000-000000000004', 'a8490000-0000-0000-0000-000000000004', 'ordered', 2, '2026-01-06 01:00:00+00');
insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type, actioned_at) values
  ('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a84a0000-0000-0000-0000-000000000001', 'a84b0000-0000-0000-0000-000000000001', 'a8490000-0000-0000-0000-000000000002', 'bought', '2026-01-05 01:00:00+00');

-- recipes: published + draft + archived in T1, one in T2; translations: title (T1, T2) and a description (other field)
insert into workforce.recipe_categories (id, tenant_id, label_ja, sort_order, is_active) values
  ('a84c0000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'Drinks', 1, true),
  ('a84c0000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'Old', 2, false),
  ('a84c0000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a2', 'T2 Drinks', 1, true);
insert into workforce.recipes (id, tenant_id, location_id, recipe_category_id, title_ja, status) values
  ('a84d0000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', null, 'a84c0000-0000-0000-0000-000000000001', 'ラテ', 'published'),
  ('a84d0000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', null, null, '下書き', 'draft'),
  ('a84d0000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', null, 'L2 recipe', 'archived'),
  ('a84d0000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a2', null, null, 'T2 recipe', 'published');
insert into content.translations (tenant_id, source_entity_type, source_entity_id, source_field, target_language, translated_text, source_content_hash) values
  ('a8400000-0000-0000-0000-0000000000a1', 'workforce_recipe', 'a84d0000-0000-0000-0000-000000000001', 'title', 'en', 'Latte', 'h1'),
  ('a8400000-0000-0000-0000-0000000000a1', 'workforce_recipe', 'a84d0000-0000-0000-0000-000000000002', 'title', 'en', 'Draft', 'h2'),
  ('a8400000-0000-0000-0000-0000000000a1', 'workforce_recipe', 'a84d0000-0000-0000-0000-000000000001', 'description', 'en', 'Milk coffee', 'h3'),
  ('a8400000-0000-0000-0000-0000000000a2', 'workforce_recipe', 'a84d0000-0000-0000-0000-000000000004', 'title', 'en', 'T2', 'h4');

insert into workforce.schedule_settings (tenant_id, location_id) values
  ('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001'),
  ('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003'),
  ('a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002');

-- auto-schedule runs: 7 at T1/L1 (only the newest 6 come back), one at T1/L2, one at T2
insert into workforce.auto_schedule_runs (tenant_id, location_id, target_month, outcome, error_code, last_seen_at)
select 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
       make_date(2026, g, 1), case when g % 2 = 0 then 'generated' else 'failed' end,
       case when g % 2 = 0 then null else 'apply_failed' end, '2026-01-01 00:00:00+00'::timestamptz + g * interval '1 day'
  from generate_series(1, 7) g;
insert into workforce.auto_schedule_runs (tenant_id, location_id, target_month, outcome) values
  ('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', '2026-02-01', 'generated'),
  ('a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', '2026-02-01', 'generated');

-- operations: a daily template per location (T1/L1, T1/L2, T2), items, schedules, an open exception each
insert into operations.checklist_templates (id, tenant_id, location_id, name, category, is_active) values
  ('a84e0000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'Open L1', 'Temperature', true),
  ('a84e0000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'Open L2', 'Temperature', true),
  ('a84e0000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'Open T2', 'Temperature', true);
insert into operations.checklist_items (id, tenant_id, template_id, label, response_type, is_critical, is_required, sort_order) values
  ('a84f0000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a84e0000-0000-0000-0000-000000000001', 'Fridge', 'boolean', true, true, 1),
  ('a84f0000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a84e0000-0000-0000-0000-000000000002', 'Fridge', 'boolean', true, true, 1),
  ('a84f0000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a2', 'a84e0000-0000-0000-0000-000000000003', 'Fridge', 'boolean', true, true, 1);
insert into operations.task_schedules (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, due_time, effective_from, is_active) values
  ('a8510000-0000-0000-0000-000000000001', 'a8510000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a84e0000-0000-0000-0000-000000000001', 'daily', '09:00', current_date - 10, true),
  ('a8510000-0000-0000-0000-000000000002', 'a8510000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a84e0000-0000-0000-0000-000000000002', 'daily', '09:00', current_date - 10, true),
  ('a8510000-0000-0000-0000-000000000003', 'a8510000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'a84e0000-0000-0000-0000-000000000003', 'daily', '09:00', current_date - 10, true);
insert into operations.task_exceptions (id, tenant_id, location_id, schedule_id, business_date, severity, source, note, status) values
  ('a8520000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8510000-0000-0000-0000-000000000001', current_date - 1, 'action_required', 'critical_missed', 'missed L1', 'open'),
  ('a8520000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a8510000-0000-0000-0000-000000000002', current_date - 1, 'action_required', 'critical_missed', 'missed L2', 'open'),
  ('a8520000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'a8510000-0000-0000-0000-000000000003', current_date - 1, 'action_required', 'critical_missed', 'missed T2', 'open');

-- issues: open + acknowledged + resolved at T1/L1, open at T1/L2, open at T2
insert into issues.issues (id, tenant_id, location_id, kind, category, severity, status, note, business_date, reported_by, reported_by_role, created_at) values
  ('a8530000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'issue', 'equipment', 'normal', 'open', 'fridge noisy', '2026-01-05', 'a8490000-0000-0000-0000-000000000003', 'staff', '2026-01-05 01:00:00+00'),
  ('a8530000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'issue', 'equipment', 'normal', 'open', 'l2 issue', '2026-01-05', 'a8490000-0000-0000-0000-000000000001', 'manager', '2026-01-05 02:00:00+00'),
  ('a8530000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002', 'handover', null, null, 'open', 't2 note', '2026-01-05', 'a8490000-0000-0000-0000-000000000004', 'manager', '2026-01-05 01:00:00+00');
insert into issues.issues (id, tenant_id, location_id, kind, category, severity, status, note, business_date, reported_by, reported_by_role, acknowledged_by, acknowledged_at, created_at) values
  ('a8530000-0000-0000-0000-000000000005', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'handover', null, null, 'acknowledged', 'low on milk', '2026-01-06', 'a8490000-0000-0000-0000-000000000003', 'staff', 'a8490000-0000-0000-0000-000000000002', '2026-01-06 05:00:00+00', '2026-01-06 01:00:00+00');
insert into issues.issues (id, tenant_id, location_id, kind, category, severity, status, note, business_date, reported_by, reported_by_role, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution_note, created_at) values
  ('a8530000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'issue', 'cleaning', 'normal', 'resolved', 'floor', '2026-01-04', 'a8490000-0000-0000-0000-000000000003', 'staff', 'a8490000-0000-0000-0000-000000000002', '2026-01-04 04:00:00+00', 'a8490000-0000-0000-0000-000000000002', '2026-01-04 05:00:00+00', 'mopped', '2026-01-04 01:00:00+00');


-- today's task instances: T1/L1 (with a response), T1/L2 (with a response), and a
-- T1/L1 instance of yesterday whose response must not come back
insert into operations.task_instances (id, tenant_id, location_id, schedule_id, template_id, business_date, started_by) values
  ('a8540000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8510000-0000-0000-0000-000000000001', 'a84e0000-0000-0000-0000-000000000001', current_date, 'a8490000-0000-0000-0000-000000000003'),
  ('a8540000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a8510000-0000-0000-0000-000000000002', 'a84e0000-0000-0000-0000-000000000002', current_date, 'a8490000-0000-0000-0000-000000000001'),
  ('a8540000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8510000-0000-0000-0000-000000000001', 'a84e0000-0000-0000-0000-000000000001', current_date - 1, 'a8490000-0000-0000-0000-000000000003');
insert into operations.item_responses (id, tenant_id, location_id, instance_id, item_id, response_bool, recorded_by) values
  ('a8550000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8540000-0000-0000-0000-000000000001', 'a84f0000-0000-0000-0000-000000000001', true, 'a8490000-0000-0000-0000-000000000003'),
  ('a8550000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003', 'a8540000-0000-0000-0000-000000000002', 'a84f0000-0000-0000-0000-000000000002', true, 'a8490000-0000-0000-0000-000000000001'),
  ('a8550000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8540000-0000-0000-0000-000000000003', 'a84f0000-0000-0000-0000-000000000001', false, 'a8490000-0000-0000-0000-000000000003');

-- helpers ---------------------------------------------------------------------------------------
create function pg_temp.shared_parts() returns jsonb language sql as $$
  select '["shiftTypes", "assignments", "shiftExchanges", "inventoryItems", "purchasesNeeded", "purchaseHistory",
           "purchasesAwaiting", "recipeCategories", "recipes", "recipeTitleTranslations", "operationsTodayTasks",
           "operationsItems", "issuesOpen"]'::jsonb;
$$;
create function pg_temp.own_parts() returns jsonb language sql as $$
  select '["myPreferenceRequests", "myCorrectionRequests", "myAttendance", "myStaffMessages", "staffRoster",
           "operationsResponses"]'::jsonb;
$$;

create function pg_temp.params(p_parts jsonb, p_employee text) returns jsonb language sql as $$
  select jsonb_build_object(
    'parts', p_parts,
    'fromIso', '2025-11-01T00:00:00.000Z', 'toIsoExclusive', '2026-03-01T00:00:00.000Z',
    'today', current_date::text,
    'employeeId', p_employee);
$$;

create function pg_temp.call(p_fn text, p_uid text, p_tenant text, p_location text, p_params jsonb) returns jsonb language plpgsql as $$
declare v text;
begin
  v := pg_temp.as_user(p_uid, format('select api.%I(%L::uuid, %L::uuid, %L::jsonb)::text', p_fn, p_tenant, p_location, p_params));
  if v like 'ERR %' then return to_jsonb(v); end if;
  return v::jsonb;
end $$;

-- direct reads of each staff-only source, written from the TS lib functions (same columns, filters, order, limit)
create temp table direct_sql (part text primary key, q text not null, ordered boolean not null);
insert into direct_sql values
  ('myPreferenceRequests', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by work_date, request_id), '[]') from (select request_id, tenant_id, location_id, employee_id, shift_id, shift_type_id, work_date, kind, is_unavailable, status, details, attendance_id, created_at, updated_at from api.workforce_shift_requests where tenant_id = %1$L and kind = 'preference') x $q$, true),
  ('myCorrectionRequests', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by work_date, request_id), '[]') from (select request_id, tenant_id, location_id, employee_id, shift_id, shift_type_id, work_date, kind, is_unavailable, status, details, attendance_id, created_at, updated_at from api.workforce_shift_requests where tenant_id = %1$L and kind = 'correction') x $q$, true),
  ('myAttendance', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by work_date, attendance_id), '[]') from (select attendance_id, tenant_id, location_id, employee_id, shift_id, work_date, clock_in, clock_out, actual_break_minutes, status, transportation_cost, daily_message, created_at, updated_at from api.workforce_attendance where tenant_id = %1$L) x $q$, true),
  ('myStaffMessages', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by created_at, message_id), '[]') from (select message_id, tenant_id, location_id, employee_id, sender_role, sender_user_id, body, is_read, read_at, read_by, archived_at, deleted_at, created_at, updated_at from api.workforce_staff_messages where tenant_id = %1$L and employee_id = %3$L) x $q$, true),
  ('staffRoster', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select employee_id, tenant_id, location_id, name_encrypted, is_active from api.workforce_staff_roster where tenant_id = %1$L) x $q$, false),
  ('operationsResponses', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by response_id), '[]') from (select response_id, tenant_id, location_id, instance_id, item_id, response_bool, response_numeric, response_text, recorded_at, updated_at from api.operations_item_responses where tenant_id = %1$L and instance_id in (select t.instance_id from api.operations_expected_tasks(current_date, current_date) t where t.tenant_id = %1$L and t.location_id = %2$L and t.instance_id is not null)) x $q$, true);

create function pg_temp.direct(p_uid text, p_tenant text, p_location text, p_employee text, p_part text) returns jsonb language plpgsql as $$
declare v text;
begin
  v := pg_temp.as_user(p_uid, 'select (' || format((select d.q from direct_sql d where d.part = p_part), p_tenant, p_location, p_employee) || ')::text');
  if v like 'ERR %' then return to_jsonb(v); end if;
  return v::jsonb;
end $$;

-- order-insensitive equality of two jsonb arrays
create function pg_temp.same_set(a jsonb, b jsonb) returns boolean language sql as $$
  select jsonb_typeof(a) = 'array' and jsonb_typeof(b) = 'array'
     and jsonb_array_length(a) = jsonb_array_length(b) and a @> b and b @> a;
$$;

-- callers: (label, uid, tenant, location, employee id passed as employeeId)
create temp table callers (label text primary key, uid text, tenant text, location text, employee text);
insert into callers values
  ('employee T1/L1',         'a8490000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001'),
  ('manager T1/L1',          'a8490000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000004'),
  ('owner T1/L1 as e1',      'a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001'),
  ('T2 manager asked at T1', 'a8490000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001');

create temp table bundles as
  select c.*,
         pg_temp.call('staff_dashboard', c.uid, c.tenant, c.location,
           pg_temp.params(pg_temp.shared_parts() || pg_temp.own_parts(), c.employee)) as j,
         pg_temp.call('manager_dashboard', c.uid, c.tenant, c.location,
           pg_temp.params(pg_temp.shared_parts(), c.employee) - 'employeeId') as m
    from callers c;

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.staff_dashboard(uuid, uuid, jsonb)', 'execute'), false, 'A: anon cannot call api.staff_dashboard');
select is(has_function_privilege('authenticated', 'api.staff_dashboard(uuid, uuid, jsonb)', 'execute'), true, 'A: authenticated can call api.staff_dashboard');
select is((select prosecdef from pg_proc where oid = 'api.staff_dashboard(uuid, uuid, jsonb)'::regprocedure), false, 'A: SECURITY INVOKER (ADR 0008)');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'api.staff_dashboard(uuid, uuid, jsonb)'::regprocedure), 'A: pins search_path');
select is(pg_temp.anon_err($$select api.staff_dashboard('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', '{"parts": ["staffRoster"]}')$$), '42501', 'A: anon call refused');

-- B: equivalence ---------------------------------------------------------------------------------
select is(jsonb_typeof(b.j), 'object', format('B: %s gets a bundle object (%s)', b.label, left(b.j::text, 120)))
  from bundles b order by b.label;

select is(
  (select array_agg(k order by k) from jsonb_object_keys(b.j) k),
  (select array_agg(p order by p) from jsonb_array_elements_text(pg_temp.shared_parts() || pg_temp.own_parts()) p),
  format('B: %s gets every requested part', b.label))
  from bundles b order by b.label;

select is(
  (select count(*)::int from jsonb_each(b.j) kv where kv.value ? 'error'),
  0, format('B: %s gets no part error', b.label))
  from bundles b order by b.label;

select is(b.j -> p, b.m -> p, format('B: %s shared part %s equals api.manager_dashboard''s', b.label, p))
  from bundles b, jsonb_array_elements_text(pg_temp.shared_parts()) p
 order by b.label, p;

select ok(
  case when d.ordered
       then b.j -> d.part -> 'rows' = pg_temp.direct(b.uid, b.tenant, b.location, b.employee, d.part)
       else pg_temp.same_set(b.j -> d.part -> 'rows', pg_temp.direct(b.uid, b.tenant, b.location, b.employee, d.part)) end,
  format('B: %s %s equals the direct read (%s)', b.label, d.part, case when d.ordered then 'same order' else 'same set' end))
  from bundles b cross join direct_sql d
 order by b.label, d.part;

-- spot values, so equivalence cannot pass with both sides empty
create function pg_temp.ids(p_label text, p_part text, p_key text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(r ->> p_key order by ord), '[]')
    from bundles b, jsonb_array_elements(b.j -> p_part -> 'rows') with ordinality as e(r, ord)
   where b.label = p_label;
$$;

select ok(jsonb_array_length(b.j -> p -> 'rows') >= 1, format('B: employee T1/L1 sees at least one %s row', p))
  from bundles b, jsonb_array_elements_text(pg_temp.own_parts()) p
 where b.label = 'employee T1/L1'
 order by p;

select is(pg_temp.ids('employee T1/L1', 'myPreferenceRequests', 'request_id'),
  '["a8470000-0000-0000-0000-000000000002", "a8470000-0000-0000-0000-000000000001"]'::jsonb,
  'B: employee myPreferenceRequests = their own preferences, all dates, work_date order');
select is(pg_temp.ids('employee T1/L1', 'myCorrectionRequests', 'request_id'),
  '["a8470000-0000-0000-0000-000000000003"]'::jsonb, 'B: employee myCorrectionRequests = their own correction');
select is(pg_temp.ids('employee T1/L1', 'myAttendance', 'attendance_id'),
  '["a8460000-0000-0000-0000-000000000002", "a8460000-0000-0000-0000-000000000001"]'::jsonb,
  'B: employee myAttendance = their own rows, work_date ascending');
select is(pg_temp.ids('employee T1/L1', 'myStaffMessages', 'body'), '["hi", "hello", "deleted"]'::jsonb,
  'B: employee myStaffMessages = their own thread, oldest first');
select is(pg_temp.ids('owner T1/L1 as e1', 'myStaffMessages', 'employee_id') - 'a8430000-0000-0000-0000-000000000001', '[]'::jsonb,
  'B: myStaffMessages is narrowed to employeeId even for an Owner who may read every thread');
select is(pg_temp.ids('owner T1/L1 as e1', 'operationsResponses', 'response_id'),
  '["a8550000-0000-0000-0000-000000000001"]'::jsonb,
  'B: operationsResponses = responses of today''s tasks at this location only (not L2, not yesterday)');
select is(pg_temp.ids('employee T1/L1', 'operationsResponses', 'response_id'),
  '["a8550000-0000-0000-0000-000000000001"]'::jsonb, 'B: employee sees today''s L1 response');
select ok(pg_temp.ids('employee T1/L1', 'staffRoster', 'employee_id') @> '["a8430000-0000-0000-0000-000000000001"]'::jsonb,
  'B: staffRoster includes the caller''s own row');
select is(
  (select count(*)::int from jsonb_array_elements(b.j -> p -> 'rows') r where r ->> 'employee_id' <> 'a8430000-0000-0000-0000-000000000001'),
  0, format('B: employee sees only their own %s rows', p))
  from bundles b, unnest(array['myPreferenceRequests', 'myCorrectionRequests', 'myAttendance', 'myStaffMessages']) p
 where b.label = 'employee T1/L1'
 order by p;

-- C: isolation --------------------------------------------------------------------------------
select is(
  (select count(*)::int from jsonb_each(b.j) kv, jsonb_array_elements(kv.value -> 'rows') r),
  0, 'C: a T2 manager asking for T1 gets no row in any part')
  from bundles b where b.label = 'T2 manager asked at T1';
select is(
  (select count(*)::int from bundles b, jsonb_each(b.j) kv, jsonb_array_elements(kv.value -> 'rows') r
    where b.label <> 'T2 manager asked at T1' and r ->> 'tenant_id' = 'a8400000-0000-0000-0000-0000000000a2'),
  0, 'C: no T1 caller sees a T2 row');
select is(
  (select count(*)::int from bundles b, jsonb_each(b.j) kv, jsonb_array_elements(kv.value -> 'rows') r
    where b.label in ('employee T1/L1', 'manager T1/L1') and r ->> 'location_id' = 'a8410000-0000-0000-0000-000000000003'),
  0, 'C: L1 employee / manager see no T1/L2 row in any part');

-- D: input validation ---------------------------------------------------------------------------
create function pg_temp.call_err(p_params text, p_tenant text default 'a8400000-0000-0000-0000-0000000000a1', p_location text default 'a8410000-0000-0000-0000-000000000001') returns text language sql as $$
  select left(pg_temp.as_user('a8490000-0000-0000-0000-000000000003',
    format('select api.staff_dashboard(%L::uuid, %L::uuid, %L::jsonb)::text', p_tenant, p_location, p_params)), 9);
$$;
select is(pg_temp.call_err('{"parts": ["nope"]}'), 'ERR 22023', 'D: unknown part -> 22023');
select is(pg_temp.call_err('{"parts": ["staff"]}'), 'ERR 22023', 'D: a Manager-only part is unknown here -> 22023');
select is(pg_temp.call_err('{"parts": [1]}'), 'ERR 22023', 'D: non-string part -> 22023');
select is(pg_temp.call_err('{}'), 'ERR 22023', 'D: missing parts -> 22023');
select is(pg_temp.call_err('[]'), 'ERR 22023', 'D: params not an object -> 22023');
select is(pg_temp.call_err('{"parts": ["myStaffMessages"]}'), 'ERR 22023', 'D: missing employeeId -> 22023');
select is(pg_temp.call_err('{"parts": ["myStaffMessages"], "employeeId": "nope"}'), 'ERR 22023', 'D: invalid employeeId -> 22023');
select is(pg_temp.call_err('{"parts": ["operationsResponses"], "today": "2026-01-01"}'), 'ERR 22023', 'D: operationsResponses without operationsTodayTasks -> 22023');
select is(pg_temp.call_err('{"parts": ["assignments"], "fromIso": "2026-01-05T00:00:00Z"}'), 'ERR 22023', 'D: a shared part''s missing input -> 22023 (from api.manager_dashboard)');
select is(pg_temp.call_err('{"parts": ["staffRoster"]}', null), 'ERR 22023', 'D: null tenant -> 22023');
select is(pg_temp.call_err('{"parts": ["staffRoster"]}', 'a8400000-0000-0000-0000-0000000000a1', null), 'ERR 22023', 'D: null location -> 22023');
select is(
  pg_temp.call('staff_dashboard', 'a8490000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', '{"parts": []}'),
  '{}'::jsonb, 'D: no parts -> empty object');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.call('staff_dashboard', 'a8490000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
     '{"parts": ["staffRoster", "shiftTypes", "staffRoster"]}')) k),
  array['shiftTypes', 'staffRoster'], 'D: only the requested parts are returned (duplicates collapse)');

-- E: part error isolation -----------------------------------------------------------------------
revoke select on api.workforce_staff_roster from authenticated;
select is(
  pg_temp.call('staff_dashboard', 'a8490000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    '{"parts": ["staffRoster", "shiftTypes"]}') #>> '{staffRoster,error,code}',
  '42501', 'E: an unreadable staff-only source becomes {"error": {"code": "42501"}} for that part');
select ok(
  jsonb_array_length(pg_temp.call('staff_dashboard', 'a8490000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    '{"parts": ["staffRoster", "shiftTypes"]}') #> '{shiftTypes,rows}') >= 1,
  'E: ... while the shared parts still return their rows');
grant select on api.workforce_staff_roster to authenticated;

-- a failing operationsTodayTasks -> operationsResponses is empty, not an error (the app read no responses then)
revoke execute on function api.operations_expected_tasks(date, date) from authenticated;
select is(
  pg_temp.call('staff_dashboard', 'a8490000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    pg_temp.params('["operationsTodayTasks", "operationsResponses"]', null)) -> 'operationsResponses',
  '{"rows": []}'::jsonb, 'E: operationsTodayTasks failing -> operationsResponses = no rows');
grant execute on function api.operations_expected_tasks(date, date) to authenticated;

-- 20000 rows of a paged part -> LBO_ROW_CAP (as the app's fetchAllRows refused at 20 full pages)
insert into workforce.staff_messages (tenant_id, location_id, employee_id, sender_role, sender_user_id, body)
select 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001',
       'staff', 'a8490000-0000-0000-0000-000000000003', 'bulk ' || g
  from generate_series(1, 20000) g;
select is(
  pg_temp.call('staff_dashboard', 'a8490000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    pg_temp.params('["myStaffMessages", "staffRoster"]', 'a8430000-0000-0000-0000-000000000001')) #>> '{myStaffMessages,error,code}',
  'LBO_ROW_CAP', 'E: 20000+ rows of a paged part -> LBO_ROW_CAP for that part');
select ok(
  jsonb_array_length(pg_temp.call('staff_dashboard', 'a8490000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    pg_temp.params('["myStaffMessages", "staffRoster"]', 'a8430000-0000-0000-0000-000000000001')) #> '{staffRoster,rows}') >= 1,
  'E: ... and only for that part');

select * from finish();
rollback;
