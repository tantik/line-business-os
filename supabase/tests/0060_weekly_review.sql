-- ============================================================================
-- DB test: Owner Weekly Review — read-model summary
--          (migration 0119_weekly_review_summary.sql — Cafe v2.2 WP3)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Scenarios:
--   A  Permission gating: employee and client roles are denied
--      (weekly_review_permission_denied); owner/admin/manager succeed
--   B  Tenant isolation: a tenant-N manager cannot read tenant-M's summary
--   C  Location isolation: an L1-only manager cannot read L2's summary
--   D  Week-boundary correctness: an issue business_date one day before the
--      window is excluded from newIssuesCount but still counted in
--      unresolvedIssuesCount (as-of-now, not week-scoped) -- proves the two
--      counting rules are genuinely different, not accidentally identical
--   E  "Problem week": shift assignments/exchanges/pending requests,
--      operations completed + critical_missed + open exception, new
--      issues/handovers + unresolved + unresolved-important + a recurring
--      category (>=2 same category in the week), inventory shortage +
--      pending purchase -- all present and correctly counted together
--   F  Quiet week: a location with zero activity in the window returns all
--      zero counts (real zero, not "not available")
--   G  Missing/not-available: a tenant with `issues` OFF returns
--      issues = null (not 0) while the other enabled domains still compute
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, issues, ai;

select no_plan();

-- --- Fixtures ---------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('0f120000-0000-0000-0000-000000000000', 'pgtap-weekly-review-m', 'pgTAP Weekly Review M'),
  ('10120000-0000-0000-0000-000000000000', 'pgtap-weekly-review-n', 'pgTAP Weekly Review N'),
  ('11120000-0000-0000-0000-000000000000', 'pgtap-weekly-review-p', 'pgTAP Weekly Review P (issues OFF)');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0f120000-0000-0000-0000-000000000000', 'workforce', true),
  ('0f120000-0000-0000-0000-000000000000', 'operations', true),
  ('0f120000-0000-0000-0000-000000000000', 'issues', true),
  ('0f120000-0000-0000-0000-000000000000', 'inventory', true),
  ('10120000-0000-0000-0000-000000000000', 'workforce', true),
  ('11120000-0000-0000-0000-000000000000', 'workforce', true),
  ('11120000-0000-0000-0000-000000000000', 'operations', true),
  ('11120000-0000-0000-0000-000000000000', 'inventory', true);
  -- Tenant P deliberately has NO 'issues' row at all -> has_module_access
  -- fails closed to false -> the RPC's issues section must be null.

insert into core.locations (id, tenant_id, name, timezone) values
  ('0f200000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', 'M / L1', 'Asia/Tokyo'),
  ('0f200000-0000-0000-0000-000000000002', '0f120000-0000-0000-0000-000000000000', 'M / L2 (quiet)', 'Asia/Tokyo'),
  ('10200000-0000-0000-0000-000000000001', '10120000-0000-0000-0000-000000000000', 'N / L1', 'Asia/Tokyo'),
  ('11200000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000000', 'P / L1', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('0f900000-0000-0000-0000-00000000001a', 'M Owner tenant-wide'),
  ('0f900000-0000-0000-0000-00000000001b', 'M Admin tenant-wide'),
  ('0f900000-0000-0000-0000-00000000001c', 'M Manager tenant-wide'),
  ('0f900000-0000-0000-0000-00000000001d', 'M Manager L1-only'),
  ('0f900000-0000-0000-0000-00000000001e', 'M Employee L1'),
  ('0f900000-0000-0000-0000-00000000001f', 'M Client'),
  ('10900000-0000-0000-0000-00000000001a', 'N Manager tenant-wide'),
  ('11900000-0000-0000-0000-00000000001a', 'P Manager tenant-wide');

-- role ids: owner=...003, admin=...004, manager=...005, employee=...006, client=...007
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0f120000-0000-0000-0000-000000000000', '0f900000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-000000000003', null),
  ('0f120000-0000-0000-0000-000000000000', '0f900000-0000-0000-0000-00000000001b', '00000000-0000-0000-0000-000000000004', null),
  ('0f120000-0000-0000-0000-000000000000', '0f900000-0000-0000-0000-00000000001c', '00000000-0000-0000-0000-000000000005', null),
  ('0f120000-0000-0000-0000-000000000000', '0f900000-0000-0000-0000-00000000001d', '00000000-0000-0000-0000-000000000005', '0f200000-0000-0000-0000-000000000001'),
  ('0f120000-0000-0000-0000-000000000000', '0f900000-0000-0000-0000-00000000001e', '00000000-0000-0000-0000-000000000006', '0f200000-0000-0000-0000-000000000001'),
  ('0f120000-0000-0000-0000-000000000000', '0f900000-0000-0000-0000-00000000001f', '00000000-0000-0000-0000-000000000007', null),
  ('10120000-0000-0000-0000-000000000000', '10900000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-000000000005', null),
  ('11120000-0000-0000-0000-000000000000', '11900000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-000000000005', null);

-- --- Employees (workforce.shifts/shift_requests/shift_exchanges FK target) --
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted, employment_type, is_active) values
  ('0f300000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', '0f900000-0000-0000-0000-00000000001e', convert_to('Employee L1', 'UTF8'), 'part_time', true);

-- --- Week window under test: 2026-01-05 (Mon) .. 2026-01-11 (Sun) ----------
-- Boundary UTC instants match the calendar dates exactly (timezone
-- conversion itself is TS-side, out of scope for this SQL-level test).

-- Workforce: 2 assignments inside the week, 1 just before the window (must
-- NOT be counted); 1 exchange created inside the week; 1 still-pending
-- shift request created well before the window (must still count -- "still
-- unresolved", not week-scoped).
insert into workforce.shifts (id, tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('0f400000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', '0f300000-0000-0000-0000-000000000001', '2026-01-05 09:00:00+00', '2026-01-05 17:00:00+00', true),
  ('0f400000-0000-0000-0000-000000000002', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', '0f300000-0000-0000-0000-000000000001', '2026-01-10 09:00:00+00', '2026-01-10 17:00:00+00', true),
  ('0f400000-0000-0000-0000-000000000003', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', '0f300000-0000-0000-0000-000000000001', '2026-01-04 09:00:00+00', '2026-01-04 17:00:00+00', true);

insert into workforce.shift_exchanges (id, tenant_id, location_id, shift_id, requester_employee_id, reason, status, created_at) values
  ('0f500000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', '0f400000-0000-0000-0000-000000000001', '0f300000-0000-0000-0000-000000000001', 'need to swap', 'open', '2026-01-06 03:00:00+00');

insert into workforce.shift_requests (id, tenant_id, location_id, employee_id, work_date, kind, status, created_at) values
  ('0f600000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', '0f300000-0000-0000-0000-000000000001', '2025-12-20', 'preference', 'pending', '2025-12-15 00:00:00+00');

-- Operations: template + schedule, 1 completed instance in-week, 1
-- critical_missed exception (open) with business_date in-week.
insert into operations.checklist_templates (id, tenant_id, location_id, name, category, is_active) values
  ('0f700000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', 'M L1 critical', 'Temperature', true);
insert into operations.checklist_items (id, tenant_id, template_id, label, response_type, is_critical, is_required, sort_order) values
  ('0f710000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f700000-0000-0000-0000-000000000001', 'Fridge temp', 'boolean', true, true, 1);
insert into operations.task_schedules (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, due_time, effective_from, is_active) values
  ('0f720000-0000-0000-0000-000000000001', '0f720000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', '0f700000-0000-0000-0000-000000000001', 'daily', '09:00', '2026-01-01', true);

insert into operations.task_instances (id, tenant_id, location_id, schedule_id, template_id, business_date, status, started_at, started_by, completed_at, completed_by) values
  ('0f730000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', '0f720000-0000-0000-0000-000000000001', '0f700000-0000-0000-0000-000000000001', '2026-01-06', 'completed', '2026-01-06 09:00:00+00', '0f900000-0000-0000-0000-00000000001e', '2026-01-06 09:05:00+00', '0f900000-0000-0000-0000-00000000001e');

insert into operations.task_exceptions (id, tenant_id, location_id, schedule_id, business_date, severity, source, note, status) values
  ('0f740000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', '0f720000-0000-0000-0000-000000000001', '2026-01-07', 'action_required', 'critical_missed', 'missed the fridge check', 'open');

-- Issues: 2 equipment issues in-week (recurring category), 1 handover
-- in-week, 1 unresolved important issue in-week, and ONE issue business_date
-- one day BEFORE the window (2026-01-04) that must be excluded from
-- newIssuesCount but still counted in unresolvedIssuesCount (status open).
insert into issues.issues (id, tenant_id, location_id, kind, category, severity, status, note, business_date, reported_by, reported_by_role) values
  ('0f750000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', 'issue', 'equipment', 'normal', 'open', 'fridge noisy', '2026-01-05', '0f900000-0000-0000-0000-00000000001e', 'staff'),
  ('0f750000-0000-0000-0000-000000000002', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', 'issue', 'equipment', 'important', 'open', 'freezer door broken', '2026-01-06', '0f900000-0000-0000-0000-00000000001c', 'manager'),
  ('0f750000-0000-0000-0000-000000000003', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', 'handover', null, null, 'open', 'low on oat milk', '2026-01-07', '0f900000-0000-0000-0000-00000000001e', 'staff'),
  ('0f750000-0000-0000-0000-000000000004', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', 'issue', 'cleaning', 'normal', 'open', 'boundary case: reported the day before the window', '2026-01-04', '0f900000-0000-0000-0000-00000000001e', 'staff');

-- Inventory: 1 item in shortage (actual <= reorder_point), no purchase_action
-- recorded against its latest count -> purchase_status = 'pending'.
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point, is_active) values
  ('0f760000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', 'Milk', 'L', 10, 3, true);
insert into inventory.stock_counts (id, tenant_id, location_id, item_id, actual_quantity, counted_by) values
  ('0f770000-0000-0000-0000-000000000001', '0f120000-0000-0000-0000-000000000000', '0f200000-0000-0000-0000-000000000001', '0f760000-0000-0000-0000-000000000001', 1, '0f900000-0000-0000-0000-00000000001e');

-- --- Role-hop helpers (same shape as 0059/0058) ------------------------------
create function pg_temp.as_auth_jsonb(p_sub text, p_sql text)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  return v;
end;
$$;

create function pg_temp.as_auth_throws(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return false;
exception when others then
  reset role;
  return true;
end;
$$;

-- Fixed call template for tenant M / L1's "problem week".
-- weekly_review_summary(tenant, location, week_start, week_end, starts_at, ends_at_exclusive)
create function pg_temp.call_m_l1(p_sub text)
returns jsonb language plpgsql as $fn$
begin
  return pg_temp.as_auth_jsonb(p_sub,
    $sql$ select api.weekly_review_summary(
         '0f120000-0000-0000-0000-000000000000'::uuid,
         '0f200000-0000-0000-0000-000000000001'::uuid,
         '2026-01-05'::date, '2026-01-11'::date,
         '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $sql$);
end;
$fn$;

-- ============================================================================
-- A — Permission gating
-- ============================================================================
select ok(
  pg_temp.as_auth_throws('0f900000-0000-0000-0000-00000000001e',
    $$ select api.weekly_review_summary('0f120000-0000-0000-0000-000000000000'::uuid, '0f200000-0000-0000-0000-000000000001'::uuid,
         '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $$),
  'A: an Employee (no core.weekly_review.view) is denied');

select ok(
  pg_temp.as_auth_throws('0f900000-0000-0000-0000-00000000001f',
    $$ select api.weekly_review_summary('0f120000-0000-0000-0000-000000000000'::uuid, '0f200000-0000-0000-0000-000000000001'::uuid,
         '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $$),
  'A: a Client (no core.weekly_review.view) is denied');

select isnt(pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001a'), null, 'A: Owner succeeds');
select isnt(pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001b'), null, 'A: Admin succeeds');
select isnt(pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'), null, 'A: tenant-wide Manager succeeds');

-- ============================================================================
-- B — Tenant isolation
-- ============================================================================
select ok(
  pg_temp.as_auth_throws('10900000-0000-0000-0000-00000000001a',
    $$ select api.weekly_review_summary('0f120000-0000-0000-0000-000000000000'::uuid, '0f200000-0000-0000-0000-000000000001'::uuid,
         '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $$),
  'B: tenant N''s Manager cannot read tenant M''s summary (no role_assignment in tenant M)');

-- ============================================================================
-- C — Location isolation
-- ============================================================================
select ok(
  pg_temp.as_auth_throws('0f900000-0000-0000-0000-00000000001d',
    $$ select api.weekly_review_summary('0f120000-0000-0000-0000-000000000000'::uuid, '0f200000-0000-0000-0000-000000000002'::uuid,
         '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $$),
  'C: an L1-only Manager cannot read L2''s summary');

select isnt(
  pg_temp.as_auth_jsonb('0f900000-0000-0000-0000-00000000001d',
    $$ select api.weekly_review_summary('0f120000-0000-0000-0000-000000000000'::uuid, '0f200000-0000-0000-0000-000000000001'::uuid,
         '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $$),
  null, 'C: the SAME L1-only Manager can read L1''s own summary');

-- ============================================================================
-- D — Week-boundary correctness + "still unresolved" vs "this week" distinction
-- ============================================================================
select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'issues'->>'newIssuesCount')::int,
  2, 'D: newIssuesCount excludes the issue business_date one day before the window (2, not 3)');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'issues'->>'unresolvedIssuesCount')::int,
  3, 'D: unresolvedIssuesCount is as-of-now (not week-scoped) and DOES include the boundary issue (3)');

-- ============================================================================
-- E — Problem week: every domain populated and correctly counted
-- ============================================================================
select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'workforce'->>'shiftAssignmentsCount')::int,
  2, 'E: shiftAssignmentsCount excludes the shift starting just before the window (2, not 3)');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'workforce'->>'shiftExchangesCount')::int,
  1, 'E: shiftExchangesCount counts the in-week exchange');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'workforce'->>'unresolvedShiftRequestsCount')::int,
  1, 'E: unresolvedShiftRequestsCount counts the still-pending request created well before the window');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'operations'->>'completedCount')::int,
  1, 'E: operations completedCount counts the in-week completed instance');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'operations'->>'criticalMissedCount')::int,
  1, 'E: operations criticalMissedCount counts the in-week critical_missed exception');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'operations'->>'openExceptionsCount')::int,
  1, 'E: operations openExceptionsCount (as-of-now) counts the still-open exception');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'issues'->>'newHandoversCount')::int,
  1, 'E: newHandoversCount counts the in-week handover');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'issues'->>'unresolvedImportantIssuesCount')::int,
  1, 'E: unresolvedImportantIssuesCount counts the important open issue');

select is(
  jsonb_array_length((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'issues'->'recurringCategories'),
  1, 'E: exactly one recurring category surfaced (equipment, 2 occurrences in-week)');

select is(
  (pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'issues'->'recurringCategories'->0->>'category',
  'equipment', 'E: the recurring category is equipment');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'issues'->'recurringCategories'->0->>'count')::int,
  2, 'E: the recurring category count is 2');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'purchasing'->>'shortageItemsCount')::int,
  1, 'E: shortageItemsCount counts the Milk item (1 <= reorder_point 3)');

select is(
  ((pg_temp.call_m_l1('0f900000-0000-0000-0000-00000000001c'))->'purchasing'->>'pendingPurchasesCount')::int,
  1, 'E: pendingPurchasesCount counts the same item (no purchase_actions row yet)');

-- ============================================================================
-- F — Quiet week (L2 has zero activity in this window): real zeros, not null
-- ============================================================================
select is(
  pg_temp.as_auth_jsonb('0f900000-0000-0000-0000-00000000001c',
    $$ select api.weekly_review_summary('0f120000-0000-0000-0000-000000000000'::uuid, '0f200000-0000-0000-0000-000000000002'::uuid,
         '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $$),
  '{
     "weekStart": "2026-01-05", "weekEnd": "2026-01-11",
     "workforce": {"shiftAssignmentsCount": 0, "shiftExchangesCount": 0, "unresolvedShiftRequestsCount": 0},
     "operations": {"completedCount": 0, "criticalMissedCount": 0, "openExceptionsCount": 0},
     "issues": {"newIssuesCount": 0, "newHandoversCount": 0, "unresolvedIssuesCount": 0, "unresolvedImportantIssuesCount": 0, "recurringCategories": []},
     "purchasing": {"shortageItemsCount": 0, "pendingPurchasesCount": 0}
   }'::jsonb,
  'F: a location with zero activity returns real zeros in every section, not null');

-- ============================================================================
-- G — Missing/not-available: tenant P has no `issues` module row at all
-- ============================================================================
select is(
  jsonb_typeof(
    pg_temp.as_auth_jsonb('11900000-0000-0000-0000-00000000001a',
      $$ select api.weekly_review_summary('11120000-0000-0000-0000-000000000000'::uuid, '11200000-0000-0000-0000-000000000001'::uuid,
           '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $$)
      ->'issues'
  ),
  'null', 'G: issues section is JSON null (not 0/empty) when the issues module has no tenant_modules row at all');

select is(
  jsonb_typeof(
    pg_temp.as_auth_jsonb('11900000-0000-0000-0000-00000000001a',
      $$ select api.weekly_review_summary('11120000-0000-0000-0000-000000000000'::uuid, '11200000-0000-0000-0000-000000000001'::uuid,
           '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $$)
      ->'workforce'
  ),
  'object', 'G: workforce section still computes (a real object with zeros) because that module IS enabled for tenant P');

select * from finish();
rollback;
