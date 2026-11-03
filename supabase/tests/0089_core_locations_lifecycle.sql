-- ============================================================================
-- DB test: migration 0151 (several locations per client, DEBT-139 L1).
-- Run with:  supabase db reset && supabase test db
--   A  grants / ADR 0008 / definers pin search_path; permission + limit seed
--   B  create: refusals (permission, args, name, timezone, tenant, source)
--   C  create: copied defaults match the source, nothing else copied,
--      effective_from rule, audit row
--   D  limit 3: 4th refused, archive one then add works, reactivate rules
--   E  rename + archive refusals, audit
--   F  console (service_role + platform-staff actor)
--   G  api.my_locations: Owner / location Manager / staff / non-member / other tenant
--   H  scoped Manager appointment + revoke (0138 overload untouched)
--   I  move employee (roles, membership, future-shift refusal)
--   J  isolation: a Manager scoped to store A reads nothing of store B
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit;

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

create function pg_temp.svc(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  execute p_sql into v;
  reset role;
  return v;
exception when others then
  reset role;
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
-- TA = ...a1 (main), TB = ...a2 (other client), TS = ...a3 (suspended)
insert into core.tenants (id, slug, name, status) values
  ('a8900000-0000-0000-0000-0000000000a1', 'pgtap-0151-ta', 'pgTAP 0151 TA', 'active'),
  ('a8900000-0000-0000-0000-0000000000a2', 'pgtap-0151-tb', 'pgTAP 0151 TB', 'active'),
  ('a8900000-0000-0000-0000-0000000000a3', 'pgtap-0151-ts', 'pgTAP 0151 TS', 'suspended');
insert into core.tenant_modules (tenant_id, module, is_enabled)
select 'a8900000-0000-0000-0000-0000000000a1', m::core.module_code, true
  from unnest(array['workforce', 'inventory', 'purchases', 'operations', 'issues']) m;
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a8900000-0000-0000-0000-0000000000a2', 'workforce', true);
-- LA (oldest, source), LB, LZ (archived) in TA; LX in TB; LS in TS
insert into core.locations (id, tenant_id, name, timezone, is_active, created_at) values
  ('a8910000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-0000000000a1', 'Store A', 'Asia/Tokyo', true,  '2026-01-01 00:00+00'),
  ('a8910000-0000-0000-0000-000000000002', 'a8900000-0000-0000-0000-0000000000a1', 'Store B', 'Asia/Tokyo', true,  '2026-01-02 00:00+00'),
  ('a8910000-0000-0000-0000-000000000005', 'a8900000-0000-0000-0000-0000000000a1', 'Store Z', 'Asia/Tokyo', false, '2025-12-01 00:00+00'),
  ('a8910000-0000-0000-0000-000000000003', 'a8900000-0000-0000-0000-0000000000a2', 'TB Store', 'Asia/Tokyo', true, '2026-01-01 00:00+00'),
  ('a8910000-0000-0000-0000-000000000004', 'a8900000-0000-0000-0000-0000000000a3', 'TS Store', 'Asia/Tokyo', true, '2026-01-01 00:00+00');
-- users: 01 O owner, 02 AD admin, 03 MW tenant-wide Manager, 04 MA Manager of LA only, 05 SA staff LA,
-- 06 SB staff LB, 07 X owner of TB, 08 P platform staff, 09 N nobody, 0a E5 staff LA (to appoint),
-- 0b E6 staff LA (to move), 0c E7 staff without a home location
insert into core.users (id, display_name) values
  ('a8990000-0000-0000-0000-000000000001', 'O'),
  ('a8990000-0000-0000-0000-000000000002', 'AD'),
  ('a8990000-0000-0000-0000-000000000003', 'MW'),
  ('a8990000-0000-0000-0000-000000000004', 'MA'),
  ('a8990000-0000-0000-0000-000000000005', 'SA'),
  ('a8990000-0000-0000-0000-000000000006', 'SB'),
  ('a8990000-0000-0000-0000-000000000007', 'X'),
  ('a8990000-0000-0000-0000-000000000009', 'N'),
  ('a8990000-0000-0000-0000-00000000000a', 'E5'),
  ('a8990000-0000-0000-0000-00000000000b', 'E6'),
  ('a8990000-0000-0000-0000-00000000000c', 'E7');
insert into core.users (id, display_name, is_platform_staff) values
  ('a8990000-0000-0000-0000-000000000008', 'P', true);
insert into core.tenant_memberships (tenant_id, user_id, status, location_id) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000001', 'active', null),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000002', 'active', null),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000003', 'active', null),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000004', 'active', 'a8910000-0000-0000-0000-000000000001'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000005', 'active', 'a8910000-0000-0000-0000-000000000001'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000006', 'active', 'a8910000-0000-0000-0000-000000000002'),
  ('a8900000-0000-0000-0000-0000000000a2', 'a8990000-0000-0000-0000-000000000007', 'active', null),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-00000000000a', 'active', 'a8910000-0000-0000-0000-000000000001'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-00000000000b', 'active', 'a8910000-0000-0000-0000-000000000001'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-00000000000c', 'active', null);
-- roles: tenant_owner ...003, tenant_admin ...004, manager ...005, employee ...006
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', null),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', null),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', null),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'a8910000-0000-0000-0000-000000000001'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', 'a8910000-0000-0000-0000-000000000001'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'a8910000-0000-0000-0000-000000000001'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006', 'a8910000-0000-0000-0000-000000000001'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'a8910000-0000-0000-0000-000000000002'),
  ('a8900000-0000-0000-0000-0000000000a2', 'a8990000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', null),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000006', 'a8910000-0000-0000-0000-000000000001'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000006', 'a8910000-0000-0000-0000-000000000001'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000006', null);
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, user_id, is_active) values
  ('a8920000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', convert_to('O', 'UTF8'),  'a8990000-0000-0000-0000-000000000001', true),
  ('a8920000-0000-0000-0000-000000000003', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', convert_to('MW', 'UTF8'), 'a8990000-0000-0000-0000-000000000003', true),
  ('a8920000-0000-0000-0000-000000000004', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', convert_to('MA', 'UTF8'), 'a8990000-0000-0000-0000-000000000004', true),
  ('a8920000-0000-0000-0000-000000000005', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', convert_to('SA', 'UTF8'), 'a8990000-0000-0000-0000-000000000005', true),
  ('a8920000-0000-0000-0000-000000000006', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', convert_to('SB', 'UTF8'), 'a8990000-0000-0000-0000-000000000006', true),
  ('a8920000-0000-0000-0000-000000000007', 'a8900000-0000-0000-0000-0000000000a2', 'a8910000-0000-0000-0000-000000000003', convert_to('X', 'UTF8'),  'a8990000-0000-0000-0000-000000000007', true),
  ('a8920000-0000-0000-0000-00000000000a', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', convert_to('E5', 'UTF8'), 'a8990000-0000-0000-0000-00000000000a', true),
  ('a8920000-0000-0000-0000-00000000000b', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', convert_to('E6', 'UTF8'), 'a8990000-0000-0000-0000-00000000000b', true),
  ('a8920000-0000-0000-0000-00000000000c', 'a8900000-0000-0000-0000-0000000000a1', null,                                   convert_to('E7', 'UTF8'), 'a8990000-0000-0000-0000-00000000000c', true);

-- per-location defaults at the source LA (and some data that must NOT be copied)
insert into workforce.schedule_settings
  (tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, max_weekly_hours,
   max_days_per_week, auto_create_day_of_month, auto_create_enabled, auto_create_last_generated_month)
values ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', '[1,2,3,4,5,6,7]', 150, 30, 4, 10, true, '2026-10-01');
insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, label_en, starts_at_local, ends_at_local, break_minutes, is_custom, sort_order, is_active) values
  ('a8930000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'early', '早番', 'Early', '08:00', '14:00', 30, false, 1, true),
  ('a8930000-0000-0000-0000-000000000002', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'late',  '遅番', null,    '14:00', '22:00', 45, true,  2, true),
  ('a8930000-0000-0000-0000-000000000003', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'old',   '旧',   null,    '09:00', '10:00', 0,  false, 3, false),
  ('a8930000-0000-0000-0000-000000000004', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', 'b-day', 'B',    null,    '09:00', '17:00', 0,  false, 1, true);
-- templates: T1 at LA (active, 2 active + 1 inactive item), T2 at LA retired, T3 tenant-wide, T4 at LB
insert into operations.checklist_templates (id, tenant_id, location_id, name, category, description, is_active, retired_on) values
  ('a8940000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'Open', 'Opening', 'desc', true, null),
  ('a8940000-0000-0000-0000-000000000002', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'Retired', null, null, false, '2026-02-01'),
  ('a8940000-0000-0000-0000-000000000003', 'a8900000-0000-0000-0000-0000000000a1', null, 'Fridge', 'HACCP', null, true, null),
  ('a8940000-0000-0000-0000-000000000004', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', 'B only', null, null, true, null);
insert into operations.checklist_items (tenant_id, template_id, label, response_type, is_critical, is_required, is_active, numeric_min, numeric_max, numeric_unit, sort_order) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8940000-0000-0000-0000-000000000001', 'Lights', 'boolean', false, true, true, null, null, null, 0),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8940000-0000-0000-0000-000000000001', 'Temp',   'numeric', true, true, true, 0, 10, '°C', 1),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8940000-0000-0000-0000-000000000001', 'Gone',   'text', false, false, false, null, null, null, 2),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8940000-0000-0000-0000-000000000003', 'Fridge temp', 'numeric', true, true, true, null, 5, '°C', 0),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8940000-0000-0000-0000-000000000004', 'B check', 'boolean', false, true, true, null, null, null, 0);
-- schedules at LA: S1 T1 daily (current), S2 T1 retired, S3 T3 weekdays starting in 10 days; S4 at LB
insert into operations.task_schedules (id, tenant_id, location_id, template_id, recurrence_kind, weekdays, due_time, window_end_time, effective_from, effective_to, is_active) values
  ('a8950000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'a8940000-0000-0000-0000-000000000001', 'daily', null, '09:00', '10:00', '2026-01-01', null, true),
  ('a8950000-0000-0000-0000-000000000002', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'a8940000-0000-0000-0000-000000000001', 'daily', null, '18:00', null, '2026-01-01', '2026-02-01', false),
  ('a8950000-0000-0000-0000-000000000003', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'a8940000-0000-0000-0000-000000000003', 'weekdays', '{1,3}', '07:00', null, current_date + 10, null, true),
  ('a8950000-0000-0000-0000-000000000004', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', 'a8940000-0000-0000-0000-000000000004', 'daily', null, '09:00', null, '2026-01-01', null, true);
insert into purchases.receipt_settings (tenant_id, location_id, receipts_enabled, photo_mode) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', true, 'required');
-- store data at LA and LB (never copied; J reads it)
insert into inventory.items (id, tenant_id, location_id, name, unit) values
  ('a8960000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'Milk A', 'L'),
  ('a8960000-0000-0000-0000-000000000002', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', 'Milk B', 'L');
insert into workforce.shifts (tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'a8920000-0000-0000-0000-000000000005', now() - interval '3 days', now() - interval '3 days' + interval '6 hours', true),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', 'a8920000-0000-0000-0000-000000000006', now() - interval '3 days', now() - interval '3 days' + interval '6 hours', true);
insert into issues.issues (tenant_id, location_id, kind, note, reported_by, reported_by_role) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'handover', 'A note', 'a8990000-0000-0000-0000-000000000005', 'staff'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', 'handover', 'B note', 'a8990000-0000-0000-0000-000000000006', 'staff');
insert into purchases.spend_receipts (tenant_id, location_id, purchased_on, amount_jpy, created_by, created_on, client_request_id) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', current_date, 1000, 'a8990000-0000-0000-0000-000000000005', current_date, gen_random_uuid()),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', current_date, 2000, 'a8990000-0000-0000-0000-000000000006', current_date, gen_random_uuid());
insert into operations.task_instances (tenant_id, location_id, schedule_id, template_id, business_date, started_by) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'a8950000-0000-0000-0000-000000000001', 'a8940000-0000-0000-0000-000000000001', current_date - 1, 'a8990000-0000-0000-0000-000000000005'),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', 'a8950000-0000-0000-0000-000000000004', 'a8940000-0000-0000-0000-000000000004', current_date - 1, 'a8990000-0000-0000-0000-000000000006');
insert into workforce.schedule_settings (tenant_id, location_id) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002');

create function pg_temp.loc_audits(p_action text) returns int language sql as $$
  select count(*)::int from audit.audit_logs
   where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and module = 'core' and entity = 'location' and action = p_action;
$$;
create function pg_temp.ta_locations() returns int language sql as $$
  select count(*)::int from core.locations where tenant_id = 'a8900000-0000-0000-0000-0000000000a1';
$$;
create function pg_temp.role_locs(p_user text, p_role text) returns text language sql as $$
  select coalesce(string_agg(coalesce(location_id::text, 'tenant'), ',' order by location_id nulls first), 'none')
    from core.role_assignments
   where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and user_id = p_user::uuid and role_id = p_role::uuid;
$$;
create function pg_temp.my_locs(p_user text) returns text language plpgsql as $$
begin
  return pg_temp.as_user(p_user, $q$
    select coalesce(string_agg(location_name || '=' || access || case when is_active then '' else '(off)' end, ',' order by location_name collate "C"), '')
      from api.my_locations $q$);
end $$;

-- A: grants / seeds ------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.create_location(uuid, text, text, uuid)', 'execute'), false, 'A: anon cannot call api.create_location');
select is(has_function_privilege('anon', 'api.rename_location(uuid, text)', 'execute'), false, 'A: anon cannot call api.rename_location');
select is(has_function_privilege('anon', 'api.set_location_active(uuid, boolean)', 'execute'), false, 'A: anon cannot call api.set_location_active');
select is(has_function_privilege('anon', 'api.move_employee_location(uuid, uuid)', 'execute'), false, 'A: anon cannot call api.move_employee_location');
select is(has_function_privilege('anon', 'api.set_employee_manager_role(uuid, uuid, boolean, text)', 'execute'), false, 'A: anon cannot call the scoped appointment');
select is(has_function_privilege('anon', 'api.platform_create_location(uuid, text, text, uuid, uuid)', 'execute'), false, 'A: anon cannot call the console create');
select is(has_table_privilege('anon', 'api.my_locations', 'select'), false, 'A: anon cannot read api.my_locations');
select is(pg_temp.anon_err($$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'x') $$), '42501', 'A: anon call refused');

select is(has_function_privilege('authenticated', 'api.create_location(uuid, text, text, uuid)', 'execute'), true, 'A: authenticated can call api.create_location');
select is(has_function_privilege('authenticated', 'api.rename_location(uuid, text)', 'execute'), true, 'A: authenticated can call api.rename_location');
select is(has_function_privilege('authenticated', 'api.set_location_active(uuid, boolean)', 'execute'), true, 'A: authenticated can call api.set_location_active');
select is(has_function_privilege('authenticated', 'api.move_employee_location(uuid, uuid)', 'execute'), true, 'A: authenticated can call api.move_employee_location');
select is(has_function_privilege('authenticated', 'api.set_employee_manager_role(uuid, uuid, boolean, text)', 'execute'), true, 'A: authenticated can call the scoped appointment');
select is(has_table_privilege('authenticated', 'api.my_locations', 'select'), true, 'A: authenticated can read api.my_locations');
select is(has_function_privilege('authenticated', 'api.platform_create_location(uuid, text, text, uuid, uuid)', 'execute'), false, 'A: authenticated cannot call the console create');
select is(has_function_privilege('authenticated', 'api.platform_rename_location(uuid, text, uuid)', 'execute'), false, 'A: authenticated cannot call the console rename');
select is(has_function_privilege('authenticated', 'api.platform_set_location_active(uuid, boolean, uuid)', 'execute'), false, 'A: authenticated cannot call the console archive');
select is(has_function_privilege('authenticated', 'core.platform_create_location(uuid, text, text, uuid, uuid)', 'execute'), false, 'A: authenticated cannot call core.platform_create_location');
select is(has_function_privilege('authenticated', 'core.create_location(uuid, text, text, uuid, uuid)', 'execute'), false, 'A: internal writer not callable by authenticated');
select is(has_function_privilege('authenticated', 'core.rename_location(uuid, text, uuid)', 'execute'), false, 'A: internal rename not callable by authenticated');
select is(has_function_privilege('authenticated', 'core.set_location_active(uuid, boolean, uuid)', 'execute'), false, 'A: internal archive not callable by authenticated');
select is(has_function_privilege('service_role', 'core.create_location(uuid, text, text, uuid, uuid)', 'execute'), false, 'A: internal writer not callable by service_role');
select is(has_function_privilege('service_role', 'api.platform_create_location(uuid, text, text, uuid, uuid)', 'execute'), true, 'A: service_role can call the console create');
select is(has_function_privilege('service_role', 'api.platform_rename_location(uuid, text, uuid)', 'execute'), true, 'A: service_role can call the console rename');
select is(has_function_privilege('service_role', 'api.platform_set_location_active(uuid, boolean, uuid)', 'execute'), true, 'A: service_role can call the console archive');
select is(has_function_privilege('authenticated', 'api.set_employee_manager_role(uuid, uuid, boolean)', 'execute'), true, 'A: the 0138 3-argument wrapper still exists');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.prosecdef), 0, 'A: api schema still contains no SECURITY DEFINER function');
select is((select count(*)::int from pg_proc
            where oid in ('core.create_location(uuid, text, text, uuid, uuid)'::regprocedure,
                          'core.rename_location(uuid, text, uuid)'::regprocedure,
                          'core.set_location_active(uuid, boolean, uuid)'::regprocedure,
                          'core.caller_create_location(uuid, text, text, uuid)'::regprocedure,
                          'core.caller_rename_location(uuid, text)'::regprocedure,
                          'core.caller_set_location_active(uuid, boolean)'::regprocedure,
                          'core.caller_location_tenant(uuid)'::regprocedure,
                          'core.platform_create_location(uuid, text, text, uuid, uuid)'::regprocedure,
                          'core.platform_rename_location(uuid, text, uuid)'::regprocedure,
                          'core.platform_set_location_active(uuid, boolean, uuid)'::regprocedure,
                          'core.set_employee_manager_role(uuid, uuid, boolean, text)'::regprocedure,
                          'core.move_employee_location(uuid, uuid)'::regprocedure,
                          'core.caller_is_employee_at(uuid, uuid)'::regprocedure,
                          'core.assert_tenant_active(uuid)'::regprocedure,
                          'core.assert_location_name_free(uuid, text, uuid)'::regprocedure,
                          'core.assert_location_limit(uuid)'::regprocedure)
              and prosecdef and proconfig::text like '%search_path=%'), 16,
  'A: every new definer is SECURITY DEFINER with a pinned search_path');
select ok((select exists (select 1 from pg_class c cross join lateral unnest(c.reloptions) o(opt)
            where c.oid = 'api.my_locations'::regclass and lower(o.opt) = 'security_invoker=true')),
  'A: api.my_locations is security_invoker');
select is((select string_agg(r.key, ',' order by r.key) from core.role_permissions rp join core.roles r on r.id = rp.role_id
            where rp.permission_key = 'core.location.manage' and r.tenant_id is null),
  'tenant_admin,tenant_owner', 'A: core.location.manage = Owner + Admin only');
select is((select count(*)::int from core.entitlement_plans p
            where not exists (select 1 from core.plan_default_limits l where l.plan_code = p.code and l.module = 'core'
                                and l.limit_key = 'max_locations' and l.limit_value = 3)), 0,
  'A: every plan has max_locations = 3');
select is(core.get_entitlement_limit('a8900000-0000-0000-0000-0000000000a1', 'core', 'max_locations'), 3::bigint, 'A: TA effective limit is 3');

-- B: create refusals -------------------------------------------------------------------------------
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000003',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store M')::text $$),
  '^ERR 42501 permission_denied', 'B: a tenant-wide Manager cannot create');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000004',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store M')::text $$),
  '^ERR 42501 permission_denied', 'B: a location Manager cannot create');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000005',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store M')::text $$),
  '^ERR 42501 permission_denied', 'B: staff cannot create');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000007',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store M')::text $$),
  '^ERR 42501 permission_denied', 'B: the Owner of another tenant cannot create');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000009',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store M')::text $$),
  '^ERR 42501 permission_denied', 'B: a non-member cannot create');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000008',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store M')::text $$),
  '^ERR 42501 permission_denied', 'B: platform staff in the cabinet has no bypass');
select matches(pg_temp.as_user('',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store M')::text $$),
  '^ERR 28000 not_authenticated', 'B: no identity -> 28000');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', null)::text $$),
  '^ERR 22004', 'B: null name -> 22004');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location(null, 'x')::text $$),
  '^ERR 22004', 'B: null tenant -> 22004');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', '   ')::text $$),
  '^ERR P0001 invalid_location_name', 'B: blank name refused');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', repeat('x', 61))::text $$),
  '^ERR P0001 invalid_location_name', 'B: 61-character name refused');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', '  store a ')::text $$),
  '^ERR P0001 location_name_taken', 'B: name of an active location (case/space-insensitive) refused');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store M', 'Mars/Base')::text $$),
  '^ERR P0001 invalid_timezone', 'B: unknown timezone refused');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store M', 'Asia/Tokyo', 'a8910000-0000-0000-0000-000000000003')::text $$),
  '^ERR P0001 location_not_found', 'B: a source location of another tenant refused');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store M', 'Asia/Tokyo', 'a8910000-0000-0000-0000-000000000005')::text $$),
  '^ERR P0001 location_not_found', 'B: an archived source location refused');
select matches(pg_temp.svc($$ select api.platform_create_location('a8900000-0000-0000-0000-0000000000a3', 'TS 2', 'Asia/Tokyo', null,
  'a8990000-0000-0000-0000-000000000008')::text $$),
  '^ERR P0001 tenant_not_active', 'B: a suspended tenant refused');
select matches(pg_temp.svc($$ select api.platform_create_location('a8900000-0000-0000-0000-0000000000ff', 'Ghost', 'Asia/Tokyo', null,
  'a8990000-0000-0000-0000-000000000008')::text $$),
  '^ERR P0001 tenant_not_active', 'B: an unknown tenant refused');
select is(pg_temp.ta_locations(), 3, 'B: refusals created no location');
select is(pg_temp.loc_audits('create'), 0, 'B: refusals wrote no audit row');

-- C: create copies the source defaults ----------------------------------------------------------------
create temp table c_res (r jsonb);
grant all on c_res to authenticated;
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ with x as (insert into c_res select api.create_location('a8900000-0000-0000-0000-0000000000a1', '  Store C ', 'Pacific/Pago_Pago') returning r)
     select (r -> 'counts')::text from x $$)::jsonb,
  '{"schedule_settings": 1, "shift_types": 2, "operations_templates": 1, "operations_items": 2, "operations_schedules": 2, "receipt_settings": 1}'::jsonb,
  'C: Owner creates Store C; counts reported');
create temp table ids as select (r ->> 'location_id')::uuid as lc from c_res;
select is((select (r ->> 'source_location_id') from c_res), 'a8910000-0000-0000-0000-000000000001', 'C: default source = oldest active location (LA)');
select is((select name || '/' || timezone || '/' || is_active from core.locations where id = (select lc from ids)),
  'Store C/Pacific/Pago_Pago/true', 'C: trimmed name, timezone, active');
select is((select required_headcount_by_weekday::text || '/' || max_monthly_hours || '/' || max_weekly_hours || '/' || max_days_per_week
                  || '/' || auto_create_day_of_month || '/' || auto_create_enabled || '/' || coalesce(auto_create_last_generated_month::text, 'null')
             from workforce.schedule_settings where location_id = (select lc from ids)),
  '[1, 2, 3, 4, 5, 6, 7]/150/30/4/10/false/null', 'C: schedule settings copied, auto-create forced off');
select is((select string_agg(code || ':' || label_ja || ':' || coalesce(label_en, '-') || ':' || starts_at_local || '-' || ends_at_local
                             || ':' || break_minutes || ':' || is_custom || ':' || sort_order, ',' order by sort_order)
             from workforce.shift_types where location_id = (select lc from ids)),
  'early:早番:Early:08:00:00-14:00:00:30:false:1,late:遅番:-:14:00:00-22:00:00:45:true:2', 'C: active shift types copied (retired one not)');
select is((select string_agg(name || ':' || coalesce(category, '-') || ':' || coalesce(description, '-'), ',')
             from operations.checklist_templates where location_id = (select lc from ids)),
  'Open:Opening:desc', 'C: active location template copied (retired and other-store ones not)');
select is((select string_agg(i.label || ':' || i.response_type || ':' || i.is_critical || ':' || coalesce(i.numeric_max::text, '-') || ':' || coalesce(i.numeric_unit, '-'), ',' order by i.sort_order)
             from operations.checklist_items i join operations.checklist_templates t on t.id = i.template_id
            where t.location_id = (select lc from ids)),
  'Lights:boolean:false:-:-,Temp:numeric:true:10:°C', 'C: active items copied (inactive item not)');
select is((select count(*)::int from operations.checklist_templates where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and location_id is null), 1,
  'C: the tenant-wide template is shared, not duplicated');
select is((select string_agg(s.recurrence_kind || ':' || coalesce(s.weekdays::text, '-') || ':' || s.due_time || ':' || coalesce(s.window_end_time::text, '-')
                             || ':' || (s.template_id = 'a8940000-0000-0000-0000-000000000003'), ',' order by s.due_time)
             from operations.task_schedules s where s.location_id = (select lc from ids)),
  'weekdays:{1,3}:07:00:00:-:true,daily:-:09:00:00:10:00:00:false', 'C: active schedules copied (retired version not)');
select is((select effective_from from operations.task_schedules where location_id = (select lc from ids) and due_time = '09:00'),
  current_date, 'C: effective_from = today, never before current_date (UTC-11 location)');
select is((select effective_from from operations.task_schedules where location_id = (select lc from ids) and due_time = '07:00'),
  current_date + 10, 'C: a version starting later keeps its later start');
select ok((select bool_and(s.schedule_group_id <> src.schedule_group_id and s.is_active and s.effective_to is null)
             from operations.task_schedules s
             join operations.task_schedules src on src.location_id = 'a8910000-0000-0000-0000-000000000001' and src.due_time = s.due_time and src.is_active
            where s.location_id = (select lc from ids)),
  'C: new schedule groups, active, open-ended');
select is((select receipts_enabled || '/' || photo_mode || '/' || updated_by from purchases.receipt_settings where location_id = (select lc from ids)),
  'true/required/a8990000-0000-0000-0000-000000000001', 'C: receipt settings copied (updated_by = actor)');
select is((select (select count(*) from inventory.items where location_id = (select lc from ids))
                + (select count(*) from workforce.shifts where location_id = (select lc from ids))
                + (select count(*) from workforce.employees where location_id = (select lc from ids))
                + (select count(*) from issues.issues where location_id = (select lc from ids))
                + (select count(*) from purchases.spend_receipts where location_id = (select lc from ids))
                + (select count(*) from operations.task_instances where location_id = (select lc from ids))
                + (select count(*) from core.role_assignments where location_id = (select lc from ids)))::int, 0,
  'C: no inventory, shifts, employees, issues, receipts, task instances or roles copied');
select is(pg_temp.loc_audits('create'), 1, 'C: one create audit row');
select is((select actor_id::text || '/' || entity_id || '/' || (after ->> 'timezone') || '/' || (metadata -> 'counts' ->> 'shift_types')
                  || '/' || (metadata ->> 'source_location_id')
             from audit.audit_logs where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and entity = 'location' and action = 'create'),
  'a8990000-0000-0000-0000-000000000001/' || (select lc from ids) || '/Pacific/Pago_Pago/2/a8910000-0000-0000-0000-000000000001',
  'C: audit row: actor, entity id, timezone, counts, source');
select ok((select (coalesce(before::text, '') || after::text || metadata::text) !~* '(store|@|email)'
             from audit.audit_logs where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and entity = 'location' and action = 'create'),
  'C: the audit row carries no name / PII');

-- D: limit = 3 -------------------------------------------------------------------------------------------
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store D')::text $$),
  '^ERR P0001 location_limit_reached', 'D: a 4th active location is refused');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  format($$ select api.set_location_active(%L, false)::text $$, (select lc from ids)))::jsonb ->> 'changed',
  'true', 'D: Owner archives Store C');
select is((select is_active from core.locations where id = (select lc from ids)), false, 'D: Store C is inactive (row kept)');
select is(pg_temp.loc_audits('deactivate'), 1, 'D: deactivate audited');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  format($$ select api.set_location_active(%L, false)::text $$, (select lc from ids)))::jsonb ->> 'changed',
  'false', 'D: archiving again is a no-op');
select is(pg_temp.loc_audits('deactivate'), 1, 'D: no second deactivate audit row');
-- archive then add: works, and the archived name may be reused
create temp table d_res as select pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'store c', 'Pacific/Kiritimati')::text $$)::jsonb as r;
select is((select r -> 'counts' ->> 'operations_schedules' from d_res), '2', 'D: after archiving one, a new location can be added (archived name reusable)');
create temp table ld as select (r ->> 'location_id')::uuid as id from d_res;
select is((select effective_from from operations.task_schedules where location_id = (select id from ld) and due_time = '09:00'),
  greatest(current_date, (now() at time zone 'Pacific/Kiritimati')::date), 'D: effective_from = today in the new location''s timezone (UTC+14)');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  format($$ select api.set_location_active(%L, true)::text $$, (select lc from ids))),
  '^ERR P0001 location_limit_reached', 'D: reactivation respects the limit');
-- per-tenant override (sales) raises the limit; reactivation still checks the name
insert into core.tenant_entitlement_limits (tenant_id, module, limit_key, limit_value) values
  ('a8900000-0000-0000-0000-0000000000a1', 'core', 'max_locations', 4);
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  format($$ select api.set_location_active(%L, true)::text $$, (select lc from ids))),
  '^ERR P0001 location_name_taken', 'D: reactivation refused while an active location has the same name');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000002',
  format($$ select api.rename_location(%L, 'Store C old')::text $$, (select lc from ids)))::jsonb ->> 'changed',
  'true', 'D: Admin renames the archived location');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000002',
  format($$ select api.set_location_active(%L, true)::text $$, (select lc from ids)))::jsonb ->> 'changed',
  'true', 'D: Admin reactivates it (override 4)');
select is(pg_temp.loc_audits('reactivate'), 1, 'D: reactivate audited');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'Store E')::text $$),
  '^ERR P0001 location_limit_reached', 'D: the override is a limit too (5th refused)');

-- E: rename / archive refusals ------------------------------------------------------------------------------
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000003',
  $$ select api.rename_location('a8910000-0000-0000-0000-000000000002', 'B2')::text $$),
  '^ERR 42501 permission_denied', 'E: a Manager cannot rename');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000007',
  $$ select api.rename_location('a8910000-0000-0000-0000-000000000002', 'B2')::text $$),
  '^ERR 42501 permission_denied', 'E: another tenant''s Owner cannot rename');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.rename_location('a8910000-0000-0000-0000-0000000000ff', 'B2')::text $$),
  '^ERR 42501 permission_denied', 'E: unknown location id -> 42501 (no oracle)');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.rename_location('a8910000-0000-0000-0000-000000000002', 'STORE A')::text $$),
  '^ERR P0001 location_name_taken', 'E: rename to an active name refused');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.rename_location('a8910000-0000-0000-0000-000000000002', '')::text $$),
  '^ERR P0001 invalid_location_name', 'E: empty rename refused');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.rename_location('a8910000-0000-0000-0000-000000000002', 'Store B')::text $$)::jsonb ->> 'changed',
  'false', 'E: same name is a no-op');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.rename_location('a8910000-0000-0000-0000-000000000002', 'Store B ')::text $$)::jsonb ->> 'changed',
  'false', 'E: same name after trim is a no-op');
select is(pg_temp.loc_audits('rename'), 1, 'E: only the real rename was audited');
select is((select before::text || after::text from audit.audit_logs where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and entity = 'location' and action = 'rename'),
  '{"name_changed": false}{"name_changed": true}', 'E: rename audit carries no names');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_location_active('a8910000-0000-0000-0000-000000000002', false)::text $$),
  '^ERR P0001 location_has_active_staff', 'E: a location with active staff cannot be archived');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000003',
  $$ select api.set_location_active('a8910000-0000-0000-0000-000000000002', false)::text $$),
  '^ERR 42501 permission_denied', 'E: a Manager cannot archive');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_location_active('a8910000-0000-0000-0000-000000000002', null)::text $$),
  '^ERR 22004', 'E: null is_active -> 22004');
select is((select is_active from core.locations where id = 'a8910000-0000-0000-0000-000000000002'), true, 'E: Store B still active');

-- F: console ---------------------------------------------------------------------------------------------------
select matches(pg_temp.svc($$ select api.platform_create_location('a8900000-0000-0000-0000-0000000000a2', 'TB 2', 'Asia/Tokyo', null,
  'a8990000-0000-0000-0000-000000000007')::text $$),
  '^ERR 42501 actor_not_platform_staff', 'F: a non-staff actor is refused');
select matches(pg_temp.svc($$ select api.platform_create_location('a8900000-0000-0000-0000-0000000000a2', 'TB 2', 'Asia/Tokyo', null, null)::text $$),
  '^ERR 42501 actor_not_platform_staff', 'F: a null actor is refused');
create temp table f_res as select pg_temp.svc($$ select api.platform_create_location('a8900000-0000-0000-0000-0000000000a2', 'TB 2', 'Asia/Tokyo', null,
  'a8990000-0000-0000-0000-000000000008')::text $$)::jsonb as r;
select is((select r ->> 'source_location_id' from f_res), 'a8910000-0000-0000-0000-000000000003', 'F: platform staff creates a location in TB');
select is((select actor_id::text from audit.audit_logs where tenant_id = 'a8900000-0000-0000-0000-0000000000a2' and entity = 'location' and action = 'create'),
  'a8990000-0000-0000-0000-000000000008', 'F: audited with the staff actor');
select is(pg_temp.svc(format($$ select api.platform_rename_location(%L, 'TB Second', 'a8990000-0000-0000-0000-000000000008')::text $$,
  (select r ->> 'location_id' from f_res)))::jsonb ->> 'changed', 'true', 'F: console rename');
select matches(pg_temp.svc($$ select api.platform_rename_location('a8910000-0000-0000-0000-0000000000ff', 'x', 'a8990000-0000-0000-0000-000000000008')::text $$),
  '^ERR P0001 location_not_found', 'F: console rename of an unknown location');
select is(pg_temp.svc(format($$ select api.platform_set_location_active(%L, false, 'a8990000-0000-0000-0000-000000000008')::text $$,
  (select r ->> 'location_id' from f_res)))::jsonb ->> 'changed', 'true', 'F: console archive');
select matches(pg_temp.svc($$ select api.platform_set_location_active('a8910000-0000-0000-0000-000000000003', false, 'a8990000-0000-0000-0000-000000000008')::text $$),
  '^ERR P0001 last_active_location', 'F: the last active location cannot be archived');
select matches(pg_temp.svc($$ select api.platform_set_location_active('a8910000-0000-0000-0000-000000000003', false, 'a8990000-0000-0000-0000-000000000007')::text $$),
  '^ERR 42501 actor_not_platform_staff', 'F: console archive needs a staff actor');

-- G: api.my_locations -----------------------------------------------------------------------------------------
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000001'),
  'Store A=all,Store B=all,Store C old=all,Store Z=all(off),store c=all', 'G: Owner sees every TA location (archived included)');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000002'),
  'Store A=all,Store B=all,Store C old=all,Store Z=all(off),store c=all', 'G: Admin sees every TA location');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000003'),
  'Store A=all,Store B=all,Store C old=all,Store Z=all(off),store c=all', 'G: a tenant-wide Manager sees every TA location');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000004'), 'Store A=manage', 'G: a Manager of LA sees LA only (manage beats staff)');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000005'), 'Store A=staff', 'G: staff of LA sees LA only');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000006'), 'Store B=staff', 'G: staff of LB sees LB only');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000009'), '', 'G: a non-member sees nothing');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000008'), '', 'G: platform staff sees nothing in the cabinet view');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000007'), 'TB Second=all(off),TB Store=all', 'G: TB Owner sees only TB');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000007',
  $$ select count(*)::text from api.my_locations where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' $$),
  '0', 'G: ... and nothing of TA');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', 'a8910000-0000-0000-0000-000000000005');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000004'), 'Store A=manage', 'G: an inactive location is not listed for a location Manager');
delete from core.role_assignments where user_id = 'a8990000-0000-0000-0000-000000000004' and location_id = 'a8910000-0000-0000-0000-000000000005';
update core.tenant_memberships set status = 'suspended' where user_id = 'a8990000-0000-0000-0000-000000000006';
select is(pg_temp.my_locs('a8990000-0000-0000-0000-000000000006'), '', 'G: a suspended membership lists nothing');
update core.tenant_memberships set status = 'active' where user_id = 'a8990000-0000-0000-0000-000000000006';
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000005',
  $$ select count(*)::text from api.my_tenant_locations where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' $$),
  '5', 'G: api.my_tenant_locations unchanged (membership-scoped: staff still sees every TA location there)');

-- H: scoped Manager appointment ---------------------------------------------------------------------------------
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000003',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', true, 'location')::text $$),
  '^ERR 42501 permission_denied', 'H: a Manager cannot appoint');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', true, 'store')::text $$),
  '^ERR 22023', 'H: unknown scope -> 22023');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', true, null)::text $$),
  '^ERR 22004', 'H: null scope -> 22004');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000c', true, 'location')::text $$),
  '^ERR P0001 employee_has_no_location', 'H: no home location -> employee_has_no_location');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', true, 'location')::text $$)::jsonb,
  '{"employee_id": "a8920000-0000-0000-0000-00000000000a", "is_manager": true, "scope": "location", "changed": true}'::jsonb,
  'H: Owner appoints E5 for this store only');
select is(pg_temp.role_locs('a8990000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005'),
  'a8910000-0000-0000-0000-000000000001', 'H: manager row at E5''s home location');
select is(pg_temp.role_locs('a8990000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000006'),
  'a8910000-0000-0000-0000-000000000001', 'H: employee role kept');
select is((select metadata ->> 'scope' || '/' || (metadata ->> 'location_id') from audit.audit_logs
            where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and action = 'appoint_manager'
              and metadata ->> 'user_id' = 'a8990000-0000-0000-0000-00000000000a'),
  'location/a8910000-0000-0000-0000-000000000001', 'H: appoint audited with the scope');
select is(pg_temp.as_user('a8990000-0000-0000-0000-00000000000a',
  $$ select core.has_permission('a8900000-0000-0000-0000-0000000000a1', 'workforce.staff.manage', 'a8910000-0000-0000-0000-000000000001')::text
            || '/' || core.has_permission('a8900000-0000-0000-0000-0000000000a1', 'workforce.staff.manage', 'a8910000-0000-0000-0000-000000000002')::text
            || '/' || core.has_permission('a8900000-0000-0000-0000-0000000000a1', 'workforce.staff.manage', null)::text $$),
  'true/false/false', 'H: E5 manages LA only');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-00000000000a'), 'Store A=manage', 'H: my_locations for the new store Manager');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', true, 'location')::text $$)::jsonb ->> 'changed',
  'false', 'H: same scope again is a no-op');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', true)::text $$)::jsonb ->> 'changed',
  'false', 'H: the 0138 3-argument call keeps its behaviour (already a Manager -> no change)');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', true, 'tenant')::text $$)::jsonb ->> 'changed',
  'true', 'H: switch to all stores');
select is(pg_temp.role_locs('a8990000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005'), 'tenant', 'H: one tenant-wide manager row now');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-00000000000a'),
  'Store A=all,Store B=all,Store C old=all,Store Z=all(off),store c=all', 'H: ... and access all');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', false, 'tenant')::text $$)::jsonb ->> 'changed',
  'true', 'H: revoke via the scoped overload');
select is(pg_temp.role_locs('a8990000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005'), 'none', 'H: no manager row left');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', true, 'location')::text $$)::jsonb ->> 'changed',
  'true', 'H: re-appointed for this store');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', false)::text $$)::jsonb ->> 'changed',
  'true', 'H: the 0138 revoke removes a location-scoped Manager too');
select is(pg_temp.role_locs('a8990000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005'), 'none', 'H: no manager row left (either scope)');
select is(pg_temp.role_locs('a8990000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000006'),
  'a8910000-0000-0000-0000-000000000001', 'H: employee role never touched');
-- E5 back as store Manager for J
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000a', true, 'location')::text $$)::jsonb ->> 'changed',
  'true', 'H: E5 store Manager again');

-- I: move employee ------------------------------------------------------------------------------------------------
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-00000000000b', true, 'location')::text $$)::jsonb ->> 'changed',
  'true', 'I: E6 is a store Manager of LA');
insert into workforce.shifts (tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'a8920000-0000-0000-0000-00000000000b', now() - interval '5 days', now() - interval '5 days' + interval '4 hours', true);
insert into workforce.shifts (id, tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('a8970000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000001', 'a8920000-0000-0000-0000-00000000000b', now() + interval '2 days', now() + interval '2 days' + interval '4 hours', false);
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000003',
  $$ select api.move_employee_location('a8920000-0000-0000-0000-00000000000b', 'a8910000-0000-0000-0000-000000000002')::text $$),
  '^ERR 42501 permission_denied', 'I: a Manager cannot move staff');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000007',
  $$ select api.move_employee_location('a8920000-0000-0000-0000-00000000000b', 'a8910000-0000-0000-0000-000000000003')::text $$),
  '^ERR 42501 permission_denied', 'I: another tenant''s Owner cannot move TA staff');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.move_employee_location('a8920000-0000-0000-0000-0000000000ff', 'a8910000-0000-0000-0000-000000000002')::text $$),
  '^ERR 42501 permission_denied', 'I: unknown employee -> 42501 (no oracle)');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.move_employee_location('a8920000-0000-0000-0000-00000000000b', 'a8910000-0000-0000-0000-000000000003')::text $$),
  '^ERR P0001 location_not_found', 'I: a location of another tenant refused');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.move_employee_location('a8920000-0000-0000-0000-00000000000b', 'a8910000-0000-0000-0000-000000000005')::text $$),
  '^ERR P0001 location_not_found', 'I: an archived location refused');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.move_employee_location('a8920000-0000-0000-0000-00000000000b', 'a8910000-0000-0000-0000-000000000002')::text $$),
  '^ERR P0001 employee_has_future_shifts', 'I: future shifts at the old store block the move');
select is((select location_id::text from workforce.employees where id = 'a8920000-0000-0000-0000-00000000000b'),
  'a8910000-0000-0000-0000-000000000001', 'I: nothing moved on refusal');
delete from workforce.shifts where id = 'a8970000-0000-0000-0000-000000000001';
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.move_employee_location('a8920000-0000-0000-0000-00000000000b', 'a8910000-0000-0000-0000-000000000002')::text $$)::jsonb,
  '{"employee_id": "a8920000-0000-0000-0000-00000000000b", "from_location_id": "a8910000-0000-0000-0000-000000000001", "to_location_id": "a8910000-0000-0000-0000-000000000002", "changed": true, "role_assignments_moved": 2}'::jsonb,
  'I: Owner moves E6 to LB (past shift does not block)');
select is((select location_id::text from workforce.employees where id = 'a8920000-0000-0000-0000-00000000000b'),
  'a8910000-0000-0000-0000-000000000002', 'I: home location updated');
select is(pg_temp.role_locs('a8990000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000006'),
  'a8910000-0000-0000-0000-000000000002', 'I: employee role moved');
select is(pg_temp.role_locs('a8990000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005'),
  'a8910000-0000-0000-0000-000000000002', 'I: store Manager role moved');
select is((select location_id::text from core.tenant_memberships where user_id = 'a8990000-0000-0000-0000-00000000000b'),
  'a8910000-0000-0000-0000-000000000002', 'I: membership default location moved');
select is((select count(*)::int from workforce.shifts where employee_id = 'a8920000-0000-0000-0000-00000000000b'
            and location_id = 'a8910000-0000-0000-0000-000000000001'), 1, 'I: past shift stays at the old store');
select is(pg_temp.my_locs('a8990000-0000-0000-0000-00000000000b'), 'Store B=manage', 'I: E6 now relates to LB only');
select is((select (before ->> 'location_id') || '>' || (after ->> 'location_id') || '/' || jsonb_array_length(metadata -> 'moved_role_assignment_ids')
             from audit.audit_logs where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and action = 'move_location'),
  'a8910000-0000-0000-0000-000000000001>a8910000-0000-0000-0000-000000000002/2', 'I: move audited');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.move_employee_location('a8920000-0000-0000-0000-00000000000b', 'a8910000-0000-0000-0000-000000000002')::text $$)::jsonb ->> 'changed',
  'false', 'I: same location is a no-op');
-- back to LA where a duplicate employee role already exists: dropped instead of moved
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000006', 'a8910000-0000-0000-0000-000000000001');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000002',
  $$ select api.move_employee_location('a8920000-0000-0000-0000-00000000000b', 'a8910000-0000-0000-0000-000000000001')::text $$)::jsonb ->> 'changed',
  'true', 'I: Admin moves E6 back to LA');
select is(pg_temp.role_locs('a8990000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000006'),
  'a8910000-0000-0000-0000-000000000001', 'I: exactly one employee role, at LA');
select is(pg_temp.role_locs('a8990000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005'),
  'a8910000-0000-0000-0000-000000000001', 'I: store Manager role back at LA');

-- J: isolation — a Manager of store A reads nothing of store B -------------------------------------------------
create function pg_temp.seen(p_user text, p_loc text) returns text language plpgsql as $$
begin
  return pg_temp.as_user(p_user, format($q$
    select concat_ws(',',
      (select count(*) from workforce.shifts where location_id = %1$L),
      (select count(*) from workforce.shift_types where location_id = %1$L),
      (select count(*) from workforce.schedule_settings where location_id = %1$L),
      (select count(*) from api.workforce_staff_manage where location_id = %1$L),
      (select count(*) from inventory.items where location_id = %1$L),
      (select count(*) from purchases.spend_receipts where location_id = %1$L),
      (select count(*) from api.spend_receipts where location_id = %1$L),
      (select count(*) from issues.issues where location_id = %1$L),
      (select count(*) from operations.task_instances where location_id = %1$L),
      (select count(*) from operations.task_schedules where location_id = %1$L),
      (select count(*) from operations.checklist_templates where location_id = %1$L)) $q$, p_loc));
end $$;
-- columns: shifts, shift types, schedule settings, staff, inventory items, receipts (table), receipts (api),
--          issues, task instances, task schedules, location templates
select is(pg_temp.seen('a8990000-0000-0000-0000-000000000004', 'a8910000-0000-0000-0000-000000000002'),
  '0,0,0,0,0,0,0,0,0,0,0', 'J: Manager of LA reads NOTHING of LB');
select is(pg_temp.seen('a8990000-0000-0000-0000-00000000000a', 'a8910000-0000-0000-0000-000000000002'),
  '0,0,0,0,0,0,0,0,0,0,0', 'J: the API-appointed store Manager (E5) reads NOTHING of LB');
select is(pg_temp.seen('a8990000-0000-0000-0000-000000000004', 'a8910000-0000-0000-0000-000000000001'),
  '2,3,1,6,1,1,1,1,1,3,2', 'J: ... while reading LA');
select is(pg_temp.seen('a8990000-0000-0000-0000-000000000003', 'a8910000-0000-0000-0000-000000000002'),
  '1,1,1,1,1,1,1,1,1,1,1', 'J: a tenant-wide Manager reads LB');
select is(pg_temp.seen('a8990000-0000-0000-0000-000000000001', 'a8910000-0000-0000-0000-000000000002'),
  '1,1,1,1,1,1,1,1,1,1,1', 'J: the Owner reads LB');
select is(pg_temp.seen('a8990000-0000-0000-0000-000000000007', 'a8910000-0000-0000-0000-000000000002'),
  '0,0,0,0,0,0,0,0,0,0,0', 'J: the Owner of another tenant reads nothing of LB');

-- J2: more store-B rows (requests, attendance, messages) + writes of store-B rows touch 0 rows
insert into workforce.shift_requests (tenant_id, location_id, employee_id, work_date, status) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', 'a8920000-0000-0000-0000-000000000006', current_date + 3, 'pending');
insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, clock_in) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', 'a8920000-0000-0000-0000-000000000006', current_date - 1, now() - interval '1 day');
insert into workforce.staff_messages (tenant_id, location_id, employee_id, sender_role, sender_user_id, body) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8910000-0000-0000-0000-000000000002', 'a8920000-0000-0000-0000-000000000006', 'staff', 'a8990000-0000-0000-0000-000000000006', 'B msg');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  select concat_ws(',',
    (select count(*) from workforce.shift_requests where location_id = 'a8910000-0000-0000-0000-000000000002'),
    (select count(*) from api.workforce_shift_requests where location_id = 'a8910000-0000-0000-0000-000000000002'),
    (select count(*) from workforce.attendance where location_id = 'a8910000-0000-0000-0000-000000000002'),
    (select count(*) from workforce.staff_messages where location_id = 'a8910000-0000-0000-0000-000000000002')) $q$),
  '0,0,0,0', 'J2: store-A Manager reads no LB requests (table + api), attendance, messages');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000003', $q$
  select concat_ws(',',
    (select count(*) from workforce.shift_requests where location_id = 'a8910000-0000-0000-0000-000000000002'),
    (select count(*) from workforce.attendance where location_id = 'a8910000-0000-0000-0000-000000000002'),
    (select count(*) from workforce.staff_messages where location_id = 'a8910000-0000-0000-0000-000000000002')) $q$),
  '1,1,1', 'J2: ... the tenant-wide Manager does');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  with u1 as (update workforce.shift_requests set work_date = work_date where location_id = 'a8910000-0000-0000-0000-000000000002' returning 1),
       u2 as (update workforce.attendance set clock_in = clock_in where location_id = 'a8910000-0000-0000-0000-000000000002' returning 1),
       u3 as (update inventory.items set name = 'hacked' where location_id = 'a8910000-0000-0000-0000-000000000002' returning 1),
       u4 as (update workforce.shifts set published = false where location_id = 'a8910000-0000-0000-0000-000000000002' returning 1)
  select concat_ws(',', (select count(*) from u1), (select count(*) from u2), (select count(*) from u3), (select count(*) from u4)) $q$),
  '0,0,0,0', 'J2: store-A Manager UPDATEs of LB requests / attendance / items / shifts touch 0 rows');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  with d as (delete from workforce.shifts where location_id = 'a8910000-0000-0000-0000-000000000002' returning 1)
  select count(*)::text from d $q$),
  '^(0|ERR 42501 permission denied for table shifts)$', 'J2: store-A Manager cannot DELETE LB shifts (no grant / 0 rows)');

-- K: 0152 boundaries + 0151 review fixes --------------------------------------------------------------------
-- fixtures: LINE links + pending invitations for SA (LA) and SB (LB); SB is a store Manager at LB
insert into workforce.employee_line_links (tenant_id, employee_id, line_user_id_encrypted, line_user_id_hash, is_active) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-000000000005', '\x01', 'pgtap-0151-la', true),
  ('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-000000000006', '\x02', 'pgtap-0151-lb', true);
insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, status, invited_by) values
  ('a89b0000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-000000000005', 'a8990000-0000-0000-0000-000000000009', 'pending', 'a8990000-0000-0000-0000-000000000001'),
  ('a89b0000-0000-0000-0000-000000000002', 'a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-000000000006', 'a8990000-0000-0000-0000-000000000009', 'pending', 'a8990000-0000-0000-0000-000000000001');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000005', 'a8910000-0000-0000-0000-000000000002');

select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  select concat_ws(',',
    (select count(*) from workforce.employee_line_links where employee_id = 'a8920000-0000-0000-0000-000000000005'),
    (select count(*) from workforce.employee_line_links where employee_id = 'a8920000-0000-0000-0000-000000000006'),
    (select count(*) from api.workforce_employee_line_links where employee_id = 'a8920000-0000-0000-0000-000000000006'),
    (select count(*) from workforce.employee_invitations where employee_id = 'a8920000-0000-0000-0000-000000000005'),
    (select count(*) from workforce.employee_invitations where employee_id = 'a8920000-0000-0000-0000-000000000006'),
    (select count(*) from api.workforce_employee_invitations where employee_id = 'a8920000-0000-0000-0000-000000000006')) $q$),
  '1,0,0,1,0,0', 'K: store-A Manager sees LINE links / invitations of LA staff only (table + api)');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000003', $q$
  select concat_ws(',',
    (select count(*) from workforce.employee_line_links where employee_id = 'a8920000-0000-0000-0000-000000000006'),
    (select count(*) from workforce.employee_invitations where employee_id = 'a8920000-0000-0000-0000-000000000006')) $q$),
  '1,1', 'K: the tenant-wide Manager sees LB staff links and invitations');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  with u as (update workforce.employee_line_links set is_active = false where employee_id = 'a8920000-0000-0000-0000-000000000006' returning 1)
  select count(*)::text from u $q$),
  '0', 'K: store-A Manager cannot deactivate an LB LINE link (0 rows)');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  insert into workforce.employee_line_links (tenant_id, employee_id, line_user_id_encrypted, line_user_id_hash, is_active)
  values ('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-000000000006', '\x03', 'pgtap-0151-lb2', false) returning 'ok' $q$),
  '^ERR 42501', 'K: store-A Manager cannot bind a LINE link to an LB employee');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  with u as (update workforce.employee_invitations set status = 'revoked', revoked_at = now()
              where id = 'a89b0000-0000-0000-0000-000000000002' returning 1)
  select count(*)::text from u $q$),
  '0', 'K: store-A Manager cannot revoke an LB invitation (0 rows)');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  update workforce.employee_invitations set status = 'revoked', revoked_at = now(), employee_id = 'a8920000-0000-0000-0000-000000000006'
   where id = 'a89b0000-0000-0000-0000-000000000001' returning 'ok' $q$),
  '^ERR 42501', 'K: revoking an LA invitation cannot re-point it to an LB employee');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  update workforce.employee_invitations set status = 'revoked', revoked_at = now()
   where id = 'a89b0000-0000-0000-0000-000000000001' returning 'ok' $q$),
  'ok', 'K: store-A Manager revokes an LA invitation');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  select core.employee_user_is_manager('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000006')::text $q$),
  'false', 'K: store-A Manager cannot learn that an LB employee is a Manager');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000003', $q$
  select core.employee_user_is_manager('a8900000-0000-0000-0000-0000000000a1', 'a8990000-0000-0000-0000-000000000006')::text $q$),
  'true', 'K: the tenant-wide Manager can');

-- K: tenant-wide Operations templates / recipes need a tenant-wide grant
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  select api.operations_create_template('a8900000-0000-0000-0000-0000000000a1', 'Shared', null)::text $q$),
  '^ERR P0001 operations_permission_denied', 'K: store-A Manager cannot create a tenant-wide template');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  select api.operations_create_template('a8900000-0000-0000-0000-0000000000a1', 'Mine', 'a8910000-0000-0000-0000-000000000001')::text $q$),
  '^[0-9a-f-]{36}$', 'K: ... but creates one at LA');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000003', $q$
  select api.operations_create_template('a8900000-0000-0000-0000-0000000000a1', 'Shared', null)::text $q$),
  '^[0-9a-f-]{36}$', 'K: the tenant-wide Manager creates a tenant-wide template');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  with u as (update operations.checklist_templates set description = 'x' where id = 'a8940000-0000-0000-0000-000000000003' returning 1)
  select count(*)::text from u $q$),
  '0', 'K: store-A Manager cannot edit the tenant-wide template (0 rows)');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  insert into operations.checklist_items (tenant_id, template_id, label, response_type)
  values ('a8900000-0000-0000-0000-0000000000a1', 'a8940000-0000-0000-0000-000000000003', 'x', 'boolean') returning 'ok' $q$),
  '^ERR 42501', 'K: store-A Manager cannot add an item to the tenant-wide template');
insert into core.tenant_modules (tenant_id, module, is_enabled) values ('a8900000-0000-0000-0000-0000000000a1', 'recipes', true)
on conflict (tenant_id, module) do update set is_enabled = true;
insert into workforce.recipes (id, tenant_id, location_id, title_ja, status) values
  ('a89c0000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-0000000000a1', null, 'Shared recipe', 'draft');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  insert into workforce.recipe_categories (tenant_id, label_ja) values ('a8900000-0000-0000-0000-0000000000a1', 'Cat') returning 'ok' $q$),
  '^ERR 42501', 'K: store-A Manager cannot create a recipe category (tenant-wide; also no direct table grant)');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  select count(*)::text from workforce.recipes where id = 'a89c0000-0000-0000-0000-000000000001' $q$),
  '0', 'K: store-A Manager does not see a tenant-wide recipe draft');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000004', $q$
  insert into storage.objects (bucket_id, name) values ('recipe-media',
    'a8900000-0000-0000-0000-0000000000a1/a8910000-0000-0000-0000-000000000001/a89c0000-0000-0000-0000-000000000001/a89d0000-0000-0000-0000-000000000001.jpg') returning 'ok' $q$),
  '^ERR 42501', 'K: store-A Manager cannot upload media for a tenant-wide recipe');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000003', $q$
  insert into storage.objects (bucket_id, name) values ('recipe-media',
    'a8900000-0000-0000-0000-0000000000a1/a8910000-0000-0000-0000-000000000001/a89c0000-0000-0000-0000-000000000001/a89d0000-0000-0000-0000-000000000001.jpg') returning 'ok' $q$),
  'ok', 'K: the tenant-wide Manager can');

-- K: home location changes only through move_employee_location (0151 guard)
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000003', $q$
  update api.workforce_staff_manage set location_id = 'a8910000-0000-0000-0000-000000000002'
   where staff_id = 'a8920000-0000-0000-0000-000000000005' returning 'ok' $q$),
  '^ERR 42501 employee_location_change_requires_move', 'K: a direct location_id change through the staff view is refused');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000003', $q$
  update api.workforce_staff_manage set location_id = 'a8910000-0000-0000-0000-000000000001', position_label = 'barista'
   where staff_id = 'a8920000-0000-0000-0000-000000000005' returning 'ok' $q$),
  'ok', 'K: an edit that sends the same location_id still works');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001', $q$
  update workforce.employees set location_id = 'a8910000-0000-0000-0000-000000000001'
   where id = 'a8920000-0000-0000-0000-00000000000c' returning 'ok' $q$),
  'ok', 'K: a first home location (NULL -> LA) can still be set');

-- K: module off / other tenant on the new entry points
update core.tenant_modules set is_enabled = false where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and module = 'workforce';
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001', $q$
  select api.move_employee_location('a8920000-0000-0000-0000-00000000000b', 'a8910000-0000-0000-0000-000000000002')::text $q$),
  '^ERR P0001 workforce_module_disabled', 'K: move refused while Workforce is off');
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001', $q$
  select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-000000000005', true, 'location')::text $q$),
  '^ERR P0001 workforce_module_disabled', 'K: scoped appointment refused while Workforce is off');
update core.tenant_modules set is_enabled = true where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and module = 'workforce';
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000007', $q$
  select api.set_employee_manager_role('a8900000-0000-0000-0000-0000000000a1', 'a8920000-0000-0000-0000-000000000005', true, 'location')::text $q$),
  '^ERR 42501', 'K: another tenant''s Owner cannot appoint in TA');

-- K: archive stops auto-schedule + Operations schedules; console audit actor_kind; name key
update core.tenant_entitlement_limits set limit_value = 10
 where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and module = 'core' and limit_key = 'max_locations';
create temp table k_res as select pg_temp.svc($$ select api.platform_create_location('a8900000-0000-0000-0000-0000000000a1', 'Store K', 'Asia/Tokyo',
  'a8910000-0000-0000-0000-000000000001', 'a8990000-0000-0000-0000-000000000008')::text $$)::jsonb as r;
select is((select actor_kind from audit.audit_logs where entity = 'location' and action = 'create' and entity_id = (select r ->> 'location_id' from k_res)),
  'platform', 'K: console create is audited as actor_kind platform');
select is((select actor_kind from audit.audit_logs where tenant_id = 'a8900000-0000-0000-0000-0000000000a1' and entity = 'location' and action = 'rename' limit 1),
  'user', 'K: cabinet change stays actor_kind user');
select is((select count(*)::int from operations.task_schedules where location_id = (select (r ->> 'location_id')::uuid from k_res) and is_active),
  2, 'K: Store K got the two active LA schedules (current + future)');
update workforce.schedule_settings set auto_create_enabled = true where location_id = (select (r ->> 'location_id')::uuid from k_res);
select matches(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  $$ select api.create_location('a8900000-0000-0000-0000-0000000000a1', 'ｓｔｏｒｅ　ｋ')::text $$),
  '^ERR P0001 location_name_taken', 'K: full-width / case variant of an active name is taken (NFKC key)');
select throws_ok(
  $$ insert into core.locations (tenant_id, name, timezone) values ('a8900000-0000-0000-0000-0000000000a1', ' STORE K　', 'Asia/Tokyo') $$,
  '23505', null, 'K: the partial unique index refuses a duplicate active name even outside the RPC');
select is(pg_temp.as_user('a8990000-0000-0000-0000-000000000001',
  format($$ select api.set_location_active(%L, false)::text $$, (select r ->> 'location_id' from k_res)))::jsonb ->> 'changed',
  'true', 'K: Owner archives Store K');
select is((select auto_create_enabled from workforce.schedule_settings where location_id = (select (r ->> 'location_id')::uuid from k_res)),
  false, 'K: archive turned auto-create off');
select is((select count(*)::int from operations.task_schedules where location_id = (select (r ->> 'location_id')::uuid from k_res) and is_active),
  0, 'K: no active schedule left at the archived store');
select is((select count(*)::int || ':' || bool_and(effective_to = (now() at time zone 'Asia/Tokyo')::date)::text
             from operations.task_schedules where location_id = (select (r ->> 'location_id')::uuid from k_res)),
  '1:true', 'K: the started version ends today (store calendar); the future version is removed');

select * from finish();
rollback;
