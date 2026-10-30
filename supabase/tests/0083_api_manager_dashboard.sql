-- ============================================================================
-- DB test: migration 0144 (api.manager_dashboard, DEBT-135).
-- Run with:  supabase db reset && supabase test db
--   A  grants / ADR 0008 / anon refused
--   B  every part equals the direct read of its source with the same filters,
--      order and limit, as the same caller: Owner (tenant-wide), Manager
--      (location-scoped, at L1 and asked at L2 where they have no access),
--      Employee, Manager of another tenant (asked for T1, and for their own
--      T2); fixtures include rows of another tenant / another location /
--      outside the date windows / inactive / deleted / resolved
--   C  isolation: a T2 user sees no T1 row in any part
--   D  input validation (22023); unrequested parts are omitted
--   E  a failing part is isolated (others still return rows); 20000+ rows of
--      a paged part -> LBO_ROW_CAP for that part only
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

-- helpers ---------------------------------------------------------------------------------------
create function pg_temp.all_parts() returns jsonb language sql as $$
  select '["staff", "lineLinks", "shiftTypes", "preferenceRequests", "assignments", "correctionRequests", "attendance",
           "invitations", "shiftExchanges", "exchangeAssignments", "staffMessages", "inventoryItems", "purchasesNeeded",
           "purchaseHistory", "purchasesAwaiting", "recipeCategories", "recipes", "scheduleSettings",
           "recipeTitleTranslations", "myProfile", "operationsTemplates", "operationsItems", "operationsSchedules",
           "operationsTodayTasks", "operationsOpenExceptions", "issuesOpen", "issuesAll", "autoScheduleRuns"]'::jsonb;
$$;

create function pg_temp.params(p_parts jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'parts', p_parts,
    'preferenceFromDate', '2025-11-01',
    'fromIso', '2026-01-05T00:00:00.000Z', 'toIsoExclusive', '2026-01-12T00:00:00.000Z',
    'exchangeFromIso', '2025-11-01T00:00:00.000Z', 'exchangeToIsoExclusive', '2026-03-01T00:00:00.000Z',
    'attendanceFromDate', '2025-12-01', 'attendanceToDate', '2026-01-31',
    'today', current_date::text);
$$;

create function pg_temp.bundle(p_uid text, p_tenant text, p_location text, p_params jsonb) returns jsonb language plpgsql as $$
declare v text;
begin
  v := pg_temp.as_user(p_uid, format('select api.manager_dashboard(%L::uuid, %L::uuid, %L::jsonb)::text', p_tenant, p_location, p_params));
  if v like 'ERR %' then return to_jsonb(v); end if;
  return v::jsonb;
end $$;

-- direct reads of each source, written from the TS lib functions (same columns, filters, order, limit)
create temp table direct_sql (part text primary key, q text not null, ordered boolean not null);
insert into direct_sql values
  ('staff', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select staff_id, tenant_id, location_id, name_encrypted, name_hash, family_name_encrypted, given_name_encrypted, email_encrypted, email_hash, notes_encrypted, position_label, employment_type, is_active, created_at, updated_at, hourly_wage_yen, has_account_access, is_manager, is_admin from api.workforce_staff_manage where tenant_id = %1$L) x $q$, false),
  ('lineLinks', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select link_id, tenant_id, employee_id, is_active, linked_at, created_at, updated_at from api.workforce_employee_line_links where tenant_id = %1$L) x $q$, false),
  ('shiftTypes', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select shift_type_id, tenant_id, location_id, code, label_ja, label_en, starts_at_local, ends_at_local, break_minutes, is_custom, sort_order, is_active from api.workforce_shift_types where tenant_id = %1$L) x $q$, false),
  ('preferenceRequests', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by work_date, request_id), '[]') from (select request_id, tenant_id, location_id, employee_id, shift_id, shift_type_id, work_date, kind, is_unavailable, status, details, attendance_id, created_at, updated_at from api.workforce_shift_requests where tenant_id = %1$L and kind = 'preference' and work_date >= '2025-11-01') x $q$, true),
  ('assignments', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by starts_at, assignment_id), '[]') from (select assignment_id, tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, role, notes, published, created_at, updated_at from api.workforce_shift_assignments where tenant_id = %1$L and starts_at >= '2026-01-05T00:00:00Z' and starts_at < '2026-01-12T00:00:00Z') x $q$, true),
  ('correctionRequests', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by work_date, request_id), '[]') from (select request_id, tenant_id, location_id, employee_id, shift_id, shift_type_id, work_date, kind, is_unavailable, status, details, attendance_id, created_at, updated_at from api.workforce_shift_requests where tenant_id = %1$L and kind = 'correction') x $q$, true),
  ('attendance', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by work_date desc, attendance_id), '[]') from (select attendance_id, tenant_id, location_id, employee_id, shift_id, work_date, clock_in, clock_out, actual_break_minutes, status, transportation_cost, daily_message, created_at, updated_at from api.workforce_attendance where tenant_id = %1$L and work_date >= '2025-12-01' and work_date <= '2026-01-31') x $q$, true),
  ('invitations', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select invitation_id, tenant_id, employee_id, status, created_at, updated_at, expires_at, accepted_at, revoked_at from api.workforce_employee_invitations where tenant_id = %1$L) x $q$, false),
  ('shiftExchanges', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc, exchange_id), '[]') from (select exchange_id, tenant_id, location_id, shift_id, requester_employee_id, replacement_employee_id, reason, status, accepted_at, decided_at, created_at, updated_at, request_kind, requested_shift_type_id from api.workforce_shift_exchanges where tenant_id = %1$L and location_id = %2$L) x $q$, true),
  ('exchangeAssignments', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by starts_at, assignment_id), '[]') from (select assignment_id, tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, role, notes, published, created_at, updated_at from api.workforce_shift_assignments where tenant_id = %1$L and starts_at >= '2025-11-01T00:00:00Z' and starts_at < '2026-03-01T00:00:00Z') x $q$, true),
  ('staffMessages', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by created_at, message_id), '[]') from (select message_id, tenant_id, location_id, employee_id, sender_role, sender_user_id, body, is_read, read_at, read_by, archived_at, deleted_at, created_at, updated_at from api.workforce_staff_messages where tenant_id = %1$L) x $q$, true),
  ('inventoryItems', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select item_id, tenant_id, location_id, name, unit, required_quantity, reorder_point, sort_order, is_active, actual_quantity, counted_at, counted_by_staff_id, shortage_quantity, status, media_path from api.inventory_item_status where tenant_id = %1$L and location_id = %2$L) x $q$, false),
  ('purchasesNeeded', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select item_id, tenant_id, location_id, name, unit, required_quantity, reorder_point, actual_quantity, shortage_quantity, latest_stock_count_id, purchase_status, actioned_at, actioned_by_staff_id, ordered_quantity, received_quantity from api.purchases_needed where tenant_id = %1$L and location_id = %2$L) x $q$, false),
  ('purchaseHistory', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by actioned_at desc, action_id), '[]') from (select action_id, tenant_id, location_id, item_id, item_name, unit, action_type, ordered_quantity, received_quantity, actioned_at, actioned_by_staff_id from api.purchase_history where tenant_id = %1$L and location_id = %2$L) x $q$, true),
  ('purchasesAwaiting', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select item_id, tenant_id, location_id, name, unit, required_quantity, reorder_point, actual_quantity, shortage_quantity, is_short, latest_stock_count_id, order_action_id, ordered_quantity, received_since_order_quantity, open_order_quantity, ordered_at, ordered_by_staff_id from api.purchases_awaiting_delivery where tenant_id = %1$L and location_id = %2$L) x $q$, false),
  ('recipeCategories', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select category_id, tenant_id, label_ja, label_en, sort_order, is_active from api.workforce_recipe_categories where tenant_id = %1$L) x $q$, false),
  ('recipes', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select recipe_id, tenant_id, location_id, recipe_category_id, title_ja, title_en, description_ja, description_en, content_kind, is_popular, status, created_at, updated_at, media_path, original_language from api.workforce_recipes where tenant_id = %1$L) x $q$, false),
  ('scheduleSettings', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, max_weekly_hours, max_days_per_week, auto_create_day_of_month, auto_create_enabled, auto_create_last_generated_month from api.workforce_schedule_settings where tenant_id = %1$L and location_id = %2$L) x $q$, false),
  ('recipeTitleTranslations', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by translation_id), '[]') from (select translation_id, tenant_id, source_entity_type, source_entity_id, source_field, source_language, target_language, translated_text, translation_status, translation_provider, source_content_hash, machine_generated, reviewed_at, translated_at, updated_at from api.content_translations where tenant_id = %1$L and source_entity_type = 'workforce_recipe' and source_field = 'title') x $q$, true),
  ('myProfile', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select staff_id, tenant_id, location_id, position_label, employment_type, is_active, created_at, hourly_wage_yen from api.workforce_my_staff_profile where tenant_id = %1$L) x $q$, false),
  ('operationsTemplates', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select template_id, tenant_id, location_id, name, category, description, is_active, created_at, updated_at from api.operations_templates where tenant_id = %1$L) x $q$, false),
  ('operationsItems', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select item_id, tenant_id, template_id, label, response_type, is_critical, is_required, is_active, numeric_min, numeric_max, numeric_unit, sort_order, created_at, updated_at from api.operations_template_items where tenant_id = %1$L) x $q$, false),
  ('operationsSchedules', $q$ select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select schedule_id, tenant_id, location_id, template_id, schedule_group_id, recurrence_kind, weekdays, due_time, window_end_time, effective_from, effective_to, is_active, created_at, updated_at from api.operations_schedules where tenant_id = %1$L) x $q$, false),
  ('operationsTodayTasks', $q$ select coalesce(jsonb_agg(to_jsonb(t)), '[]') from api.operations_expected_tasks(current_date, current_date) t where t.tenant_id = %1$L $q$, false),
  ('operationsOpenExceptions', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc, exception_id), '[]') from (select exception_id, tenant_id, location_id, instance_id, schedule_id, business_date, item_id, severity, source, note, created_at, template_name from api.operations_open_exceptions where tenant_id = %1$L) x $q$, true),
  ('issuesOpen', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc, issue_id), '[]') from (select issue_id, tenant_id, location_id, kind, category, severity, status, note, business_date, reported_by, reported_by_role, acknowledged_by, acknowledged_at, source, operations_exception_id, created_at, updated_at, reporter_employee_id from api.issues_open where tenant_id = %1$L) x $q$, true),
  ('issuesAll', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc, issue_id), '[]') from (select issue_id, tenant_id, location_id, kind, category, severity, status, note, business_date, reported_by, reported_by_role, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution_note, source, operations_exception_id, created_at, updated_at, reporter_employee_id from api.issues where tenant_id = %1$L) x $q$, true),
  ('autoScheduleRuns', $q$ select coalesce(jsonb_agg(to_jsonb(x) order by last_seen_at desc), '[]') from (select run_id, target_month, outcome, created_count, shortage_count, error_code, attempt_count, last_seen_at from api.workforce_auto_schedule_runs where tenant_id = %1$L and location_id = %2$L order by last_seen_at desc limit 6) x $q$, true);

create function pg_temp.direct(p_uid text, p_tenant text, p_location text, p_part text) returns jsonb language plpgsql as $$
declare v text;
begin
  v := pg_temp.as_user(p_uid, 'select (' || format((select d.q from direct_sql d where d.part = p_part), p_tenant, p_location) || ')::text');
  if v like 'ERR %' then return to_jsonb(v); end if;
  return v::jsonb;
end $$;

-- the staff part's protected-history ids, read directly
create function pg_temp.direct_history_ids(p_uid text, p_tenant text) returns jsonb language sql as $$
  select pg_temp.as_user(p_uid, format($q$
    select coalesce(jsonb_agg(distinct id), '[]')::text from (
      select employee_id as id from api.workforce_shift_assignments where tenant_id = %1$L
      union all select employee_id from api.workforce_attendance where tenant_id = %1$L
      union all select employee_id from api.workforce_shift_requests where tenant_id = %1$L
      union all select requester_employee_id from api.workforce_shift_exchanges where tenant_id = %1$L
      union all select replacement_employee_id from api.workforce_shift_exchanges where tenant_id = %1$L) s
     where id is not null $q$, p_tenant))::jsonb;
$$;

-- order-insensitive equality of two jsonb arrays
create function pg_temp.same_set(a jsonb, b jsonb) returns boolean language sql as $$
  select jsonb_typeof(a) = 'array' and jsonb_typeof(b) = 'array'
     and jsonb_array_length(a) = jsonb_array_length(b) and a @> b and b @> a;
$$;

-- callers: (label, uid, tenant, location)
create temp table callers (label text primary key, uid text, tenant text, location text);
insert into callers values
  ('owner T1/L1',            'a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001'),
  ('manager T1/L1',          'a8490000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001'),
  ('manager asked at T1/L2', 'a8490000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000003'),
  ('employee T1/L1',         'a8490000-0000-0000-0000-000000000003', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001'),
  ('T2 manager asked at T1', 'a8490000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001'),
  ('T2 manager at T2',       'a8490000-0000-0000-0000-000000000004', 'a8400000-0000-0000-0000-0000000000a2', 'a8410000-0000-0000-0000-000000000002');

create temp table bundles as
  select c.label, c.uid, c.tenant, c.location, pg_temp.bundle(c.uid, c.tenant, c.location, pg_temp.params(pg_temp.all_parts())) as j
    from callers c;

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.manager_dashboard(uuid, uuid, jsonb)', 'execute'), false, 'A: anon cannot call api.manager_dashboard');
select is(has_function_privilege('authenticated', 'api.manager_dashboard(uuid, uuid, jsonb)', 'execute'), true, 'A: authenticated can call api.manager_dashboard');
select is((select prosecdef from pg_proc where oid = 'api.manager_dashboard(uuid, uuid, jsonb)'::regprocedure), false, 'A: SECURITY INVOKER (ADR 0008)');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'api.manager_dashboard(uuid, uuid, jsonb)'::regprocedure), 'A: pins search_path');
select is(pg_temp.anon_err($$select api.manager_dashboard('a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', '{"parts": ["shiftTypes"]}')$$), '42501', 'A: anon call refused');

-- B: equivalence, every part, every caller ---------------------------------------------------
select is(jsonb_typeof(b.j), 'object', format('B: %s gets a bundle object (%s)', b.label, left(b.j::text, 120)))
  from bundles b order by b.label;

select is(
  (select array_agg(k order by k) from jsonb_object_keys(b.j) k),
  (select array_agg(p order by p) from jsonb_array_elements_text(pg_temp.all_parts()) p),
  format('B: %s gets every requested part', b.label))
  from bundles b order by b.label;

select is(
  (select count(*)::int from jsonb_each(b.j) kv where kv.value ? 'error'),
  0, format('B: %s gets no part error', b.label))
  from bundles b order by b.label;

select ok(
  case when d.ordered
       then b.j -> d.part -> 'rows' = pg_temp.direct(b.uid, b.tenant, b.location, d.part)
       else pg_temp.same_set(b.j -> d.part -> 'rows', pg_temp.direct(b.uid, b.tenant, b.location, d.part)) end,
  format('B: %s %s equals the direct read (%s)', b.label, d.part, case when d.ordered then 'same order' else 'same set' end))
  from bundles b cross join direct_sql d
 order by b.label, d.part;

select ok(pg_temp.same_set(b.j -> 'staff' -> 'protectedHistoryIds', pg_temp.direct_history_ids(b.uid, b.tenant)),
  format('B: %s staff.protectedHistoryIds equal the direct reads', b.label))
  from bundles b order by b.label;

-- spot values, so equivalence cannot pass with both sides empty
create function pg_temp.ids(p_label text, p_part text, p_key text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(r ->> p_key order by ord), '[]')
    from bundles b, jsonb_array_elements(b.j -> p_part -> 'rows') with ordinality as e(r, ord)
   where b.label = p_label;
$$;

select ok(jsonb_array_length(b.j -> d.part -> 'rows') >= 1, format('B: owner T1/L1 sees at least one %s row', d.part))
  from bundles b cross join direct_sql d
 where b.label = 'owner T1/L1' and d.part <> 'myProfile'
 order by d.part;
select ok(jsonb_array_length(b.j -> d.part -> 'rows') >= 1, format('B: manager T1/L1 sees at least one %s row', d.part))
  from bundles b cross join direct_sql d
 where b.label = 'manager T1/L1'
 order by d.part;

select is(pg_temp.ids('manager T1/L1', 'assignments', 'assignment_id'),
  '["a8450000-0000-0000-0000-000000000005", "a8450000-0000-0000-0000-000000000001"]'::jsonb,
  'B: assignments = the week window only ([from, to) on starts_at, start-inclusive, end-exclusive), in starts_at order; not L2');
select is(pg_temp.ids('manager T1/L1', 'exchangeAssignments', 'assignment_id'),
  '["a8450000-0000-0000-0000-000000000005", "a8450000-0000-0000-0000-000000000001", "a8450000-0000-0000-0000-000000000006", "a8450000-0000-0000-0000-000000000002"]'::jsonb,
  'B: exchangeAssignments = the -8..+8 window, drafts included, the June orphan excluded');
select is(pg_temp.ids('manager T1/L1', 'preferenceRequests', 'request_id'),
  '["a8470000-0000-0000-0000-000000000006", "a8470000-0000-0000-0000-000000000001"]'::jsonb,
  'B: preferenceRequests from preferenceFromDate (inclusive) on, work_date order; the older one, the correction and L2 excluded');
select is(pg_temp.ids('manager T1/L1', 'correctionRequests', 'request_id'),
  '["a8470000-0000-0000-0000-000000000003"]'::jsonb, 'B: correctionRequests = kind correction only');
select is(pg_temp.ids('manager T1/L1', 'attendance', 'attendance_id'),
  '["a8460000-0000-0000-0000-000000000005", "a8460000-0000-0000-0000-000000000001"]'::jsonb,
  'B: attendance = the date range (to-date inclusive), work_date desc; the October row and L2 excluded');
select is(pg_temp.ids('manager T1/L1', 'shiftExchanges', 'exchange_id'),
  '["a8480000-0000-0000-0000-000000000002", "a8480000-0000-0000-0000-000000000001"]'::jsonb,
  'B: shiftExchanges = this location only, newest first');
select is(pg_temp.ids('owner T1/L1', 'inventoryItems', 'item_id') @> '["a84a0000-0000-0000-0000-000000000002"]'::jsonb, true,
  'B: inventoryItems include the inactive item (includeInactive: true)');
select is(pg_temp.ids('owner T1/L1', 'inventoryItems', 'item_id') @> '["a84a0000-0000-0000-0000-000000000003"]'::jsonb, false,
  'B: inventoryItems exclude the other location');
select is(jsonb_array_length((select j from bundles where label = 'owner T1/L1') -> 'purchaseHistory' -> 'rows'), 2,
  'B: purchaseHistory = this location''s two actions');
select is(pg_temp.ids('owner T1/L1', 'purchaseHistory', 'action_type'), '["ordered", "bought"]'::jsonb,
  'B: purchaseHistory newest first');
select is(pg_temp.ids('owner T1/L1', 'recipeTitleTranslations', 'source_field'), '["title", "title"]'::jsonb,
  'B: recipeTitleTranslations = title only (the description translation is excluded)');
select is(jsonb_array_length((select j from bundles where label = 'owner T1/L1') -> 'autoScheduleRuns' -> 'rows'), 6,
  'B: autoScheduleRuns returns the newest 6 of 7');
select is(pg_temp.ids('owner T1/L1', 'autoScheduleRuns', 'target_month'),
  '["2026-07-01", "2026-06-01", "2026-05-01", "2026-04-01", "2026-03-01", "2026-02-01"]'::jsonb,
  'B: autoScheduleRuns newest first (last_seen_at desc)');
select is(pg_temp.ids('owner T1/L1', 'issuesOpen', 'issue_id') @> '["a8530000-0000-0000-0000-000000000002"]'::jsonb, false,
  'B: issuesOpen excludes the resolved issue');
select is(pg_temp.ids('owner T1/L1', 'issuesAll', 'issue_id') @> '["a8530000-0000-0000-0000-000000000002"]'::jsonb, true,
  'B: issuesAll includes the resolved issue');
select is(pg_temp.ids('manager T1/L1', 'myProfile', 'staff_id'), '["a8430000-0000-0000-0000-000000000004"]'::jsonb,
  'B: myProfile = the caller''s own employee row');
select is(pg_temp.ids('employee T1/L1', 'myProfile', 'staff_id'), '["a8430000-0000-0000-0000-000000000001"]'::jsonb,
  'B: employee myProfile = their own employee row');
select is(jsonb_array_length((select j from bundles where label = 'owner T1/L1') -> 'myProfile' -> 'rows'), 0,
  'B: an owner without an employee row gets no profile row');
select is(
  (select jsonb_agg(i order by i) from jsonb_array_elements_text((select j from bundles where label = 'owner T1/L1') -> 'staff' -> 'protectedHistoryIds') i),
  '["a8430000-0000-0000-0000-000000000001", "a8430000-0000-0000-0000-000000000002", "a8430000-0000-0000-0000-000000000004"]'::jsonb,
  'B: owner staff.protectedHistoryIds = every T1 employee with a shift/attendance/request/exchange row, no nulls');

-- manager asked at L2 (no permission there): every location-narrowed part is empty
select is(jsonb_array_length(b.j -> p -> 'rows'), 0, format('B: manager asked at T1/L2 gets no %s row', p))
  from bundles b, unnest(array['shiftExchanges', 'inventoryItems', 'purchasesNeeded', 'purchaseHistory', 'purchasesAwaiting', 'scheduleSettings', 'autoScheduleRuns']) p
 where b.label = 'manager asked at T1/L2'
 order by p;
-- ... and the tenant-wide parts never show L2 rows to an L1 manager
select is(
  (select count(*)::int from bundles b, jsonb_each(b.j) kv, jsonb_array_elements(kv.value -> 'rows') r
    where b.label like 'manager%' and r ->> 'location_id' = 'a8410000-0000-0000-0000-000000000003'),
  0, 'B: an L1 manager sees no T1/L2 row in any part, wherever they ask');

-- employee: Manager-only sources come back empty (not as errors); self-scoped ones carry only their own rows
select is(jsonb_array_length(b.j -> p -> 'rows'), 0, format('B: employee gets no %s row', p))
  from bundles b, unnest(array['staff', 'invitations']) p
 where b.label = 'employee T1/L1'
 order by p;
select is(
  (select count(*)::int from jsonb_array_elements(b.j -> p -> 'rows') r where r ->> 'employee_id' <> 'a8430000-0000-0000-0000-000000000001'),
  0, format('B: employee sees only their own %s rows', p))
  from bundles b, unnest(array['correctionRequests', 'attendance', 'preferenceRequests', 'staffMessages']) p
 where b.label = 'employee T1/L1'
 order by p;

-- C: isolation --------------------------------------------------------------------------------
select is(
  (select count(*)::int from bundles b, jsonb_each(b.j) kv, jsonb_array_elements(kv.value -> 'rows') r
    where b.label like 'T2 manager%' and r ->> 'tenant_id' = 'a8400000-0000-0000-0000-0000000000a1'),
  0, 'C: a T2 manager sees no T1 row in any part, whichever tenant they ask for');
select is(
  (select count(*)::int from bundles b, jsonb_each(b.j) kv, jsonb_array_elements(kv.value -> 'rows') r
    where b.label = 'T2 manager asked at T1'),
  0, 'C: a T2 manager asking for T1 gets no row at all');
select ok(jsonb_array_length((select j from bundles where label = 'T2 manager at T2') -> 'shiftTypes' -> 'rows') >= 1,
  'C: the T2 manager does see their own tenant');
select is(
  (select count(*)::int from bundles b, jsonb_each(b.j) kv, jsonb_array_elements(kv.value -> 'rows') r
    where b.label in ('owner T1/L1', 'manager T1/L1', 'employee T1/L1') and r ->> 'tenant_id' = 'a8400000-0000-0000-0000-0000000000a2'),
  0, 'C: no T1 caller sees a T2 row');

-- D: input validation ---------------------------------------------------------------------------
create function pg_temp.call_err(p_params text, p_tenant text default 'a8400000-0000-0000-0000-0000000000a1', p_location text default 'a8410000-0000-0000-0000-000000000001') returns text language sql as $$
  select left(pg_temp.as_user('a8490000-0000-0000-0000-000000000001',
    format('select api.manager_dashboard(%L::uuid, %L::uuid, %L::jsonb)::text', p_tenant, p_location, p_params)), 9);
$$;
select is(pg_temp.call_err('{"parts": ["nope"]}'), 'ERR 22023', 'D: unknown part -> 22023');
select is(pg_temp.call_err('{"parts": [1]}'), 'ERR 22023', 'D: non-string part -> 22023');
select is(pg_temp.call_err('{"parts": "shiftTypes"}'), 'ERR 22023', 'D: parts not an array -> 22023');
select is(pg_temp.call_err('{}'), 'ERR 22023', 'D: missing parts -> 22023');
select is(pg_temp.call_err('[]'), 'ERR 22023', 'D: params not an object -> 22023');
select is(pg_temp.call_err('{"parts": ["assignments"], "fromIso": "not-a-date", "toIsoExclusive": "2026-01-12T00:00:00Z"}'), 'ERR 22023', 'D: bad timestamp -> 22023');
select is(pg_temp.call_err('{"parts": ["assignments"], "fromIso": "2026-01-05T00:00:00Z"}'), 'ERR 22023', 'D: missing toIsoExclusive -> 22023');
select is(pg_temp.call_err('{"parts": ["attendance"], "attendanceFromDate": "2026-02-30", "attendanceToDate": "2026-03-31"}'), 'ERR 22023', 'D: impossible date -> 22023');
select is(pg_temp.call_err('{"parts": ["preferenceRequests"]}'), 'ERR 22023', 'D: missing preferenceFromDate -> 22023');
select is(pg_temp.call_err('{"parts": ["exchangeAssignments"], "exchangeFromIso": "2025-11-01T00:00:00Z"}'), 'ERR 22023', 'D: missing exchangeToIsoExclusive -> 22023');
select is(pg_temp.call_err('{"parts": ["operationsTodayTasks"], "today": "yesterday-ish"}'), 'ERR 22023', 'D: bad today -> 22023');
select is(pg_temp.call_err('{"parts": ["shiftTypes"]}', null), 'ERR 22023', 'D: null tenant -> 22023');
select is(pg_temp.call_err('{"parts": ["shiftTypes"]}', 'a8400000-0000-0000-0000-0000000000a1', null), 'ERR 22023', 'D: null location -> 22023');
select is(
  pg_temp.bundle('a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', '{"parts": []}'),
  '{}'::jsonb, 'D: no parts -> empty object');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.bundle('a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
     '{"parts": ["shiftTypes", "lineLinks", "shiftTypes"]}')) k),
  array['lineLinks', 'shiftTypes'], 'D: only the requested parts are returned (duplicates collapse); dates of unrequested parts are not required');

-- E: part error isolation -----------------------------------------------------------------------
-- a source the caller cannot read (simulated by revoking the grant inside this test transaction)
revoke select on api.workforce_shift_types from authenticated;
select is(
  pg_temp.bundle('a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    '{"parts": ["shiftTypes", "lineLinks"]}') #>> '{shiftTypes,error,code}',
  '42501', 'E: an unreadable source becomes {"error": {"code": "42501"}} for that part');
select ok(
  jsonb_array_length(pg_temp.bundle('a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    '{"parts": ["shiftTypes", "lineLinks"]}') #> '{lineLinks,rows}') >= 1,
  'E: ... while the other parts still return their rows');
grant select on api.workforce_shift_types to authenticated;

-- a failing protected-history source does not fail the staff part (the app ignored those errors)
revoke select on api.workforce_attendance from authenticated;
select ok(
  pg_temp.bundle('a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    '{"parts": ["staff"]}') #> '{staff}' ? 'rows',
  'E: staff still returns rows when one protected-history source fails');
grant select on api.workforce_attendance to authenticated;

-- a part of a disabled module equals the direct read of its source with the module off
-- (the app does not request it then, but a direct RPC call must not see more than the view)
update core.tenant_modules set is_enabled = false
 where tenant_id = 'a8400000-0000-0000-0000-0000000000a1' and module = 'inventory';
select ok(
  pg_temp.same_set(
    pg_temp.bundle('a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
      pg_temp.params('["inventoryItems"]')) #> '{inventoryItems,rows}',
    pg_temp.direct('a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'inventoryItems')),
  'E: inventory module off -- inventoryItems equals the direct read of the view');
update core.tenant_modules set is_enabled = true
 where tenant_id = 'a8400000-0000-0000-0000-0000000000a1' and module = 'inventory';

-- a non-paged part keeps the PostgREST max_rows cap (1000), silently, as the app's single read did
insert into workforce.shift_types (tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local)
select 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'BULK' || g, 'bulk', '09:00', '17:00'
  from generate_series(1, 1001) g;
select is(
  jsonb_array_length(pg_temp.bundle('a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    '{"parts": ["shiftTypes"]}') #> '{shiftTypes,rows}'),
  1000, 'E: a non-paged part is capped at 1000 rows (PostgREST max_rows), no error');

-- 20000 rows of a paged part -> LBO_ROW_CAP (as the app's fetchAllRows refused at 20 full pages)
insert into workforce.staff_messages (tenant_id, location_id, employee_id, sender_role, sender_user_id, body)
select 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001', 'a8430000-0000-0000-0000-000000000001',
       'staff', 'a8490000-0000-0000-0000-000000000003', 'bulk ' || g
  from generate_series(1, 20000) g;
select is(
  pg_temp.bundle('a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    '{"parts": ["staffMessages", "shiftTypes"]}') #>> '{staffMessages,error,code}',
  'LBO_ROW_CAP', 'E: 20000+ rows of a paged part -> LBO_ROW_CAP for that part');
select ok(
  jsonb_array_length(pg_temp.bundle('a8490000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-0000000000a1', 'a8410000-0000-0000-0000-000000000001',
    '{"parts": ["staffMessages", "shiftTypes"]}') #> '{shiftTypes,rows}') >= 1,
  'E: ... and only for that part');

select * from finish();
rollback;
