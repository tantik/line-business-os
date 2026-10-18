-- ============================================================================
-- LOCAL ONLY: a 'qa4-local' tenant shaped like oruwa-cafe, to rehearse
-- qa4-seed-past-month.sql / qa4-seed-cleanup.sql on the local Supabase stack
-- before any Cloud DEV run. Never run against Cloud.
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f packages/db/scripts/qa4-seed-local-fixture.sql
-- Includes pre-existing "real" data the seed must respect: one real shift, one
-- completed instance, open critical_missed rows before and inside the window.
-- ============================================================================
begin;
insert into core.tenants (id, slug, name) values ('9a400000-0000-0000-0000-000000000001', 'qa4-local', 'QA4 Local');
insert into core.tenant_modules (tenant_id, module, is_enabled)
  select '9a400000-0000-0000-0000-000000000001', m::core.module_code, true from unnest(array['workforce', 'operations', 'issues', 'inventory']) m;
insert into core.locations (id, tenant_id, name, timezone) values
  ('9a410000-0000-0000-0000-000000000001', '9a400000-0000-0000-0000-000000000001', 'QA4 Store', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('9a490000-0000-0000-0000-000000000001', 'QA4 Manager'),
  ('9a490000-0000-0000-0000-000000000002', 'QA4 Staff A'),
  ('9a490000-0000-0000-0000-000000000003', 'QA4 Staff B'),
  ('9a490000-0000-0000-0000-000000000004', 'QA4 Staff C');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9a400000-0000-0000-0000-000000000001', '9a490000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', null),
  ('9a400000-0000-0000-0000-000000000001', '9a490000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', '9a410000-0000-0000-0000-000000000001'),
  ('9a400000-0000-0000-0000-000000000001', '9a490000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', '9a410000-0000-0000-0000-000000000001'),
  ('9a400000-0000-0000-0000-000000000001', '9a490000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', '9a410000-0000-0000-0000-000000000001');
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted, is_active, hourly_wage_yen) values
  ('9a430000-0000-0000-0000-000000000002', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '9a490000-0000-0000-0000-000000000002', '\x00', true, 1200),
  ('9a430000-0000-0000-0000-000000000003', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '9a490000-0000-0000-0000-000000000003', '\x00', true, 1500),
  ('9a430000-0000-0000-0000-000000000004', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '9a490000-0000-0000-0000-000000000004', '\x00', true, null),
  ('9a430000-0000-0000-0000-000000000005', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', null, '\x00', true, null),
  ('9a430000-0000-0000-0000-000000000006', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', null, '\x00', true, null);
insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, is_active) values
  ('9a440000-0000-0000-0000-000000000001', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', 'A', '早番', '07:00', '12:00', true),
  ('9a440000-0000-0000-0000-000000000002', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', 'B', '中番', '10:00', '14:00', true),
  ('9a440000-0000-0000-0000-000000000003', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', 'C', '遅番', '12:00', '17:00', true),
  ('9a440000-0000-0000-0000-000000000004', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', 'D', '通し', '06:00', '18:00', true);
insert into workforce.schedule_settings (tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, max_weekly_hours, max_days_per_week)
  values ('9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '[1,2,2,2,3,2,1]', 160, 40, 5);
-- a pre-existing real shift inside the window (must not be doubled)
insert into workforce.shifts (tenant_id, location_id, employee_id, starts_at, ends_at, published, shift_type_id)
  values ('9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '9a430000-0000-0000-0000-000000000002',
          '2026-09-24 07:00+09', '2026-09-24 12:00+09', true, '9a440000-0000-0000-0000-000000000001');
-- operations: two templates
insert into operations.checklist_templates (id, tenant_id, location_id, name, category) values
  ('9a450000-0000-0000-0000-000000000001', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '温度管理チェック（Temperature Monitoring Check）', '温度管理'),
  ('9a450000-0000-0000-0000-000000000002', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', 'クロージング衛生チェック（Closing Hygiene Check）', 'クロージング');
insert into operations.checklist_items (tenant_id, template_id, label, response_type, is_critical, is_required, numeric_min, numeric_max, numeric_unit, sort_order) values
  ('9a400000-0000-0000-0000-000000000001', '9a450000-0000-0000-0000-000000000001', '冷蔵庫内温度確認（営業中）（Fridge）', 'numeric', true, true, 0, 5, '°C', 0),
  ('9a400000-0000-0000-0000-000000000001', '9a450000-0000-0000-0000-000000000001', '冷凍庫内温度確認（営業中）（Freezer）', 'numeric', true, true, null, null, '°C', 1),
  ('9a400000-0000-0000-0000-000000000001', '9a450000-0000-0000-0000-000000000001', '温蔵・保温機器の温度確認（Hot-holding）', 'numeric', true, false, null, null, '°C', 2),
  ('9a400000-0000-0000-0000-000000000001', '9a450000-0000-0000-0000-000000000002', '調理台・シンクの清掃・消毒', 'boolean', true, true, null, null, null, 0);
insert into operations.task_schedules (id, tenant_id, location_id, template_id, recurrence_kind, due_time, window_end_time, effective_from) values
  ('9a460000-0000-0000-0000-000000000001', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '9a450000-0000-0000-0000-000000000001', 'daily', '13:00', '14:00', '2026-09-08'),
  ('9a460000-0000-0000-0000-000000000002', '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '9a450000-0000-0000-0000-000000000002', 'daily', '21:00', '22:00', '2026-09-08');
-- one real completed instance in the window
insert into operations.task_instances (tenant_id, location_id, schedule_id, template_id, business_date, status, started_at, started_by, completed_at, completed_by)
  values ('9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '9a460000-0000-0000-0000-000000000002',
          '9a450000-0000-0000-0000-000000000002', '2026-09-25', 'completed', '2026-09-25 21:00+09', '9a490000-0000-0000-0000-000000000002',
          '2026-09-25 21:05+09', '9a490000-0000-0000-0000-000000000002');
-- open critical_missed: before the window (backlog) and inside it
insert into operations.task_exceptions (tenant_id, location_id, schedule_id, business_date, severity, source)
  select '9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', s, dd::date, 'action_required', 'critical_missed'
    from unnest(array['9a460000-0000-0000-0000-000000000001'::uuid, '9a460000-0000-0000-0000-000000000002'::uuid]) s,
         generate_series(date '2026-09-10', date '2026-09-30', interval '1 day') dd
   where not (s = '9a460000-0000-0000-0000-000000000002' and dd::date = '2026-09-25');
-- inventory
insert into inventory.items (tenant_id, location_id, name, unit, required_quantity, reorder_point) values
  ('9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '牛乳', 'L', 10, 3),
  ('9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', 'コーヒー豆', 'kg', 5, 2),
  ('9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', '蓋（Lサイズ）', 'pcs', 150, 40),
  ('9a400000-0000-0000-0000-000000000001', '9a410000-0000-0000-0000-000000000001', 'QAフィクスチャー：紙コップ', 'pcs', 200, 50);
commit;
