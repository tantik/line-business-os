-- ============================================================================
-- DB test: Owner Weekly Review -- attendance + out-of-range readings
--          (migration 0136_weekly_review_attendance_and_thresholds.sql, QA4 F3)
-- ----------------------------------------------------------------------------
-- Scenarios:
--   A  Lateness (minute precision, location-local day matching):
--      early / +59 s (on time) / +1 min (late 1) / +15 min 30 s (late 15)
--      -> lateCount 2, lateMinutesTotal 16
--   B  No-show: a published past shift with no clock-in (an attendance row
--      WITHOUT clock_in does not rescue it); a DRAFT shift with no attendance
--      is never a no-show
--   C  Unscheduled clock-in: attendance on a day with no published shift
--   D  Timezone: a 08:00 JST shift (= previous UTC day) matches the
--      attendance of its JST work_date (not unscheduled, not a no-show)
--   E  attendanceCount: only clock-ins inside the week's local dates
--   F  Only up to now: a future and an in-progress shift are never no-shows;
--      an ended one is
--   G  Threshold exceptions: created in the week counted (2), open subset
--      (1); before-week threshold and in-week 'reported' excluded
--   H  Another tenant's rows are never counted; a foreign location id under
--      the caller's own tenant returns zeros
--   I  Module OFF -> workforce / operations blocks are JSON null
--   J  Non-member and Employee are denied
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, issues, ai;

select no_plan();

-- --- Fixtures ---------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('a7500000-0000-0000-0000-00000000000a', 'pgtap-wr-att-m', 'pgTAP WR attendance M'),
  ('a7500000-0000-0000-0000-00000000000b', 'pgtap-wr-att-n', 'pgTAP WR attendance N'),
  ('a7500000-0000-0000-0000-00000000000c', 'pgtap-wr-att-p', 'pgTAP WR attendance P (workforce+operations OFF)');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a7500000-0000-0000-0000-00000000000a', 'workforce', true),
  ('a7500000-0000-0000-0000-00000000000a', 'operations', true),
  ('a7500000-0000-0000-0000-00000000000b', 'workforce', true),
  ('a7500000-0000-0000-0000-00000000000b', 'operations', true),
  ('a7500000-0000-0000-0000-00000000000c', 'issues', true);

insert into core.locations (id, tenant_id, name, timezone) values
  ('a7510000-0000-0000-0000-000000000001', 'a7500000-0000-0000-0000-00000000000a', 'M / L1 (Tokyo)', 'Asia/Tokyo'),
  ('a7510000-0000-0000-0000-000000000002', 'a7500000-0000-0000-0000-00000000000a', 'M / L2 (UTC, now-relative)', 'UTC'),
  ('a7510000-0000-0000-0000-000000000003', 'a7500000-0000-0000-0000-00000000000b', 'N / L1', 'Asia/Tokyo'),
  ('a7510000-0000-0000-0000-000000000004', 'a7500000-0000-0000-0000-00000000000c', 'P / L1', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('a7590000-0000-0000-0000-000000000001', 'M Manager tenant-wide'),
  ('a7590000-0000-0000-0000-000000000002', 'M Employee L1'),
  ('a7590000-0000-0000-0000-000000000003', 'N Manager tenant-wide'),
  ('a7590000-0000-0000-0000-000000000004', 'P Manager tenant-wide'),
  ('a7590000-0000-0000-0000-000000000005', 'Nobody (no membership)');

-- role ids: manager=...005, employee=...006
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a7500000-0000-0000-0000-00000000000a', 'a7590000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', null),
  ('a7500000-0000-0000-0000-00000000000a', 'a7590000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'a7510000-0000-0000-0000-000000000001'),
  ('a7500000-0000-0000-0000-00000000000b', 'a7590000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', null),
  ('a7500000-0000-0000-0000-00000000000c', 'a7590000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', null);

insert into workforce.employees (id, tenant_id, location_id, name_encrypted, employment_type, is_active) values
  ('a7520000-0000-0000-0000-000000000001', 'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', convert_to('E1', 'UTF8'), 'part_time', true),
  ('a7520000-0000-0000-0000-000000000002', 'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', convert_to('E2', 'UTF8'), 'part_time', true),
  ('a7520000-0000-0000-0000-000000000003', 'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', convert_to('E3', 'UTF8'), 'part_time', true),
  ('a7520000-0000-0000-0000-000000000004', 'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', convert_to('E4', 'UTF8'), 'part_time', true),
  ('a7520000-0000-0000-0000-000000000005', 'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000002', convert_to('E5', 'UTF8'), 'part_time', true),
  ('a7520000-0000-0000-0000-000000000006', 'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000002', convert_to('E6', 'UTF8'), 'part_time', true),
  ('a7520000-0000-0000-0000-000000000007', 'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000002', convert_to('E7', 'UTF8'), 'part_time', true),
  ('a7520000-0000-0000-0000-000000000009', 'a7500000-0000-0000-0000-00000000000b', 'a7510000-0000-0000-0000-000000000003', convert_to('N1', 'UTF8'), 'part_time', true);

-- --- Week under test (L1, Asia/Tokyo): Mon 2026-01-05 .. Sun 2026-01-11 ----
-- UTC instants: 2026-01-04 15:00Z .. 2026-01-11 15:00Z (exclusive).
insert into workforce.shifts (tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  -- E1: Mon / Tue / Wed 09:00-17:00 JST
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000001', '2026-01-05 09:00+09', '2026-01-05 17:00+09', true),
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000001', '2026-01-06 09:00+09', '2026-01-06 17:00+09', true),
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000001', '2026-01-07 09:00+09', '2026-01-07 17:00+09', true),
  -- E2: Wed 10:00 JST (late 15) and Thu 09:00 JST (no-show)
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000002', '2026-01-07 10:00+09', '2026-01-07 18:00+09', true),
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000002', '2026-01-08 09:00+09', '2026-01-08 17:00+09', true),
  -- E3: a DRAFT shift on Fri with no attendance (never a no-show)
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000003', '2026-01-09 09:00+09', '2026-01-09 17:00+09', false),
  -- E4: Mon 08:00 JST = Sun 2026-01-04 23:00 UTC (timezone day mapping)
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000004', '2026-01-05 08:00+09', '2026-01-05 12:00+09', true),
  -- tenant N: a no-show and a late arrival of its own in the same week
  ('a7500000-0000-0000-0000-00000000000b', 'a7510000-0000-0000-0000-000000000003', 'a7520000-0000-0000-0000-000000000009', '2026-01-06 09:00+09', '2026-01-06 17:00+09', true),
  ('a7500000-0000-0000-0000-00000000000b', 'a7510000-0000-0000-0000-000000000003', 'a7520000-0000-0000-0000-000000000009', '2026-01-07 09:00+09', '2026-01-07 17:00+09', true);

insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, clock_in, clock_out, status) values
  -- E1 Mon: 30 s early -> on time
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000001', '2026-01-05', '2026-01-05 08:59:30+09', '2026-01-05 17:00+09', 'present'),
  -- E1 Tue: +59 s -> still on time (minute precision)
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000001', '2026-01-06', '2026-01-06 09:00:59+09', '2026-01-06 17:00+09', 'present'),
  -- E1 Wed: +1 min -> late 1 (status deliberately left 'present': lateness is computed)
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000001', '2026-01-07', '2026-01-07 09:01:00+09', '2026-01-07 17:00+09', 'present'),
  -- E1 next Monday: outside the week
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000001', '2026-01-12', '2026-01-12 09:30+09', null, 'present'),
  -- E2 Wed: +15 min 30 s -> late 15
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000002', '2026-01-07', '2026-01-07 10:15:30+09', '2026-01-07 18:00+09', 'present'),
  -- E2 Thu: a row with NO clock_in -> still a no-show
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000002', '2026-01-08', null, null, 'absent'),
  -- E3 Sat: clock-in with no shift -> unscheduled
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000003', '2026-01-10', '2026-01-10 11:00+09', '2026-01-10 15:00+09', 'present'),
  -- E4 Mon (JST work_date) on time for the 08:00 JST shift
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000004', '2026-01-05', '2026-01-05 08:00+09', '2026-01-05 12:00+09', 'present'),
  -- tenant N: late 30 min on Wed (Tue is its no-show)
  ('a7500000-0000-0000-0000-00000000000b', 'a7510000-0000-0000-0000-000000000003', 'a7520000-0000-0000-0000-000000000009', '2026-01-07', '2026-01-07 09:30+09', null, 'present'),
  -- tenant N: an unscheduled clock-in
  ('a7500000-0000-0000-0000-00000000000b', 'a7510000-0000-0000-0000-000000000003', 'a7520000-0000-0000-0000-000000000009', '2026-01-09', '2026-01-09 09:00+09', null, 'present');

-- --- F fixtures: L2 (UTC), now-relative shifts ------------------------------
insert into workforce.shifts (tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  -- E5: future (starts in 2 h)
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000002', 'a7520000-0000-0000-0000-000000000005', now() + interval '2 hours', now() + interval '6 hours', true),
  -- E6: in progress (started 1 h ago, ends in 3 h)
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000002', 'a7520000-0000-0000-0000-000000000006', now() - interval '1 hour', now() + interval '3 hours', true),
  -- E7: ended 1 h ago, nobody clocked in
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000002', 'a7520000-0000-0000-0000-000000000007', now() - interval '5 hours', now() - interval '1 hour', true);

-- --- Operations: threshold exceptions ----------------------------------------
insert into operations.checklist_templates (id, tenant_id, location_id, name, category, is_active) values
  ('a7530000-0000-0000-0000-000000000001', 'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'M temps', 'Temperature', true),
  ('a7530000-0000-0000-0000-000000000002', 'a7500000-0000-0000-0000-00000000000b', 'a7510000-0000-0000-0000-000000000003', 'N temps', 'Temperature', true);
insert into operations.checklist_items (id, tenant_id, template_id, label, response_type, is_critical, is_required, sort_order) values
  ('a7531000-0000-0000-0000-000000000001', 'a7500000-0000-0000-0000-00000000000a', 'a7530000-0000-0000-0000-000000000001', 'Fridge', 'boolean', false, true, 1),
  ('a7531000-0000-0000-0000-000000000002', 'a7500000-0000-0000-0000-00000000000b', 'a7530000-0000-0000-0000-000000000002', 'Fridge', 'boolean', false, true, 1);
insert into operations.task_schedules (id, schedule_group_id, tenant_id, location_id, template_id, recurrence_kind, due_time, effective_from, is_active) values
  ('a7532000-0000-0000-0000-000000000001', 'a7532000-0000-0000-0000-000000000001', 'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7530000-0000-0000-0000-000000000001', 'daily', '09:00', '2025-12-01', true),
  ('a7532000-0000-0000-0000-000000000002', 'a7532000-0000-0000-0000-000000000002', 'a7500000-0000-0000-0000-00000000000b', 'a7510000-0000-0000-0000-000000000003', 'a7530000-0000-0000-0000-000000000002', 'daily', '09:00', '2025-12-01', true);
insert into operations.task_instances (id, tenant_id, location_id, schedule_id, template_id, business_date, status, started_at, started_by) values
  ('a7533000-0000-0000-0000-000000000001', 'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7532000-0000-0000-0000-000000000001', 'a7530000-0000-0000-0000-000000000001', '2026-01-06', 'in_progress', '2026-01-06 09:00+09', 'a7590000-0000-0000-0000-000000000002'),
  ('a7533000-0000-0000-0000-000000000002', 'a7500000-0000-0000-0000-00000000000b', 'a7510000-0000-0000-0000-000000000003', 'a7532000-0000-0000-0000-000000000002', 'a7530000-0000-0000-0000-000000000002', '2026-01-06', 'in_progress', '2026-01-06 09:00+09', 'a7590000-0000-0000-0000-000000000003');

insert into operations.task_exceptions (tenant_id, location_id, instance_id, item_id, severity, source, note, status, resolved_at, created_at) values
  -- in week, still open
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7533000-0000-0000-0000-000000000001', 'a7531000-0000-0000-0000-000000000001', 'action_required', 'threshold', 'fridge 9C', 'open', null, '2026-01-06 09:10+09'),
  -- in week, resolved
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7533000-0000-0000-0000-000000000001', 'a7531000-0000-0000-0000-000000000001', 'action_required', 'threshold', 'fridge 8C', 'resolved', '2026-01-06 12:00+09', '2026-01-06 09:05+09'),
  -- before the week (Sun 23:30 JST), open -> excluded
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7533000-0000-0000-0000-000000000001', null, 'warning', 'threshold', 'before week', 'open', null, '2026-01-04 23:30+09'),
  -- in week but a Staff report, not a threshold -> excluded
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7533000-0000-0000-0000-000000000001', null, 'warning', 'reported', 'reported', 'open', null, '2026-01-07 10:00+09'),
  -- tenant N, in week, open -> never counted for M
  ('a7500000-0000-0000-0000-00000000000b', 'a7510000-0000-0000-0000-000000000003', 'a7533000-0000-0000-0000-000000000002', 'a7531000-0000-0000-0000-000000000002', 'action_required', 'threshold', 'N fridge', 'open', null, '2026-01-07 09:10+09');

-- --- Role-hop helpers (same shape as 0060) ------------------------------------
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

-- Tenant/location + JST week call for the given caller.
create function pg_temp.call_week(p_sub text, p_tenant text, p_location text)
returns jsonb language plpgsql as $fn$
begin
  return pg_temp.as_auth_jsonb(p_sub, format(
    $sql$ select api.weekly_review_summary(%L::uuid, %L::uuid,
         '2026-01-05'::date, '2026-01-11'::date,
         '2026-01-05 00:00+09'::timestamptz, '2026-01-12 00:00+09'::timestamptz) $sql$,
    p_tenant, p_location));
end;
$fn$;

create temp table r_m as
  select pg_temp.call_week('a7590000-0000-0000-0000-000000000001',
    'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001') as j;

-- ============================================================================
-- A -- Lateness
-- ============================================================================
select is((select (j->'workforce'->>'lateCount')::int from r_m), 2,
  'A: lateCount = 2 (early and +59 s are on time; +1 min and +15 min 30 s are late)');
select is((select (j->'workforce'->>'lateMinutesTotal')::int from r_m), 16,
  'A: lateMinutesTotal = floor(60 s/60) + floor(930 s/60) = 1 + 15 = 16');

-- ============================================================================
-- B -- No-show
-- ============================================================================
select is((select (j->'workforce'->>'noShowCount')::int from r_m), 1,
  'B: noShowCount = 1 (E2 Thursday; an attendance row without clock_in does not count; a draft shift is never a no-show)');

-- ============================================================================
-- C -- Unscheduled clock-in
-- ============================================================================
select is((select (j->'workforce'->>'unscheduledClockInsCount')::int from r_m), 1,
  'C: unscheduledClockInsCount = 1 (E3 Saturday, no published shift)');

-- ============================================================================
-- D -- Timezone day mapping (E4: 08:00 JST shift = previous UTC day)
-- ============================================================================
-- Covered by B and C staying at 1: if E4's shift were mapped to its UTC date
-- (2026-01-04) it would be a no-show AND E4's attendance would be
-- unscheduled, making both 2.
select ok((select (j->'workforce'->>'noShowCount')::int = 1 and (j->'workforce'->>'unscheduledClockInsCount')::int = 1 from r_m),
  'D: an early-morning JST shift is matched to its JST work_date, not the UTC date');

-- ============================================================================
-- E -- attendanceCount
-- ============================================================================
select is((select (j->'workforce'->>'attendanceCount')::int from r_m), 6,
  'E: attendanceCount = 6 clock-ins in the week (E1 x3, E2 x1, E3 x1, E4 x1; next-Monday and no-clock-in rows excluded)');

select is((select (j->'workforce'->>'shiftAssignmentsCount')::int from r_m), 7,
  'E: existing shiftAssignmentsCount unchanged in meaning (all assigned shifts incl. drafts: 7)');

-- ============================================================================
-- F -- Only up to now (L2, UTC, now-relative window)
-- ============================================================================
select is(
  (pg_temp.as_auth_jsonb('a7590000-0000-0000-0000-000000000001', format(
    $sql$ select api.weekly_review_summary('a7500000-0000-0000-0000-00000000000a'::uuid, 'a7510000-0000-0000-0000-000000000002'::uuid,
         %L::date, %L::date, %L::timestamptz, %L::timestamptz) $sql$,
    (now() at time zone 'UTC')::date - 7, (now() at time zone 'UTC')::date + 7,
    (((now() at time zone 'UTC')::date - 7)::timestamp at time zone 'UTC'),
    (((now() at time zone 'UTC')::date + 8)::timestamp at time zone 'UTC')))
   ->'workforce'->>'noShowCount')::int,
  1, 'F: only the shift that has already ended is a no-show (future and in-progress shifts are not)');

-- ============================================================================
-- G -- Threshold (out-of-range) exceptions
-- ============================================================================
select is((select (j->'operations'->>'thresholdOutOfRangeCount')::int from r_m), 2,
  'G: thresholdOutOfRangeCount = 2 (in-week threshold rows; before-week and reported excluded)');
select is((select (j->'operations'->>'thresholdOutOfRangeOpenCount')::int from r_m), 1,
  'G: thresholdOutOfRangeOpenCount = 1 (the resolved one is not open)');
select is((select (j->'operations'->>'openExceptionsCount')::int from r_m), 3,
  'G: existing openExceptionsCount unchanged in meaning (all open, any date: 3)');

-- ============================================================================
-- H -- Tenant isolation
-- ============================================================================
create temp table r_n as
  select pg_temp.call_week('a7590000-0000-0000-0000-000000000003',
    'a7500000-0000-0000-0000-00000000000b', 'a7510000-0000-0000-0000-000000000003') as j;

select is((select j->'workforce' from r_n),
  '{"shiftAssignmentsCount": 2, "shiftExchangesCount": 0, "unresolvedShiftRequestsCount": 0,
    "attendanceCount": 2, "lateCount": 1, "lateMinutesTotal": 30, "noShowCount": 1, "unscheduledClockInsCount": 1}'::jsonb,
  'H: tenant N sees only its own workforce numbers');
select is((select (j->'operations'->>'thresholdOutOfRangeCount')::int from r_n), 1,
  'H: tenant N sees only its own threshold exception');

select ok(
  pg_temp.as_auth_throws('a7590000-0000-0000-0000-000000000003', $$ select api.weekly_review_summary(
    'a7500000-0000-0000-0000-00000000000a'::uuid, 'a7510000-0000-0000-0000-000000000001'::uuid,
    '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00+09'::timestamptz, '2026-01-12 00:00+09'::timestamptz) $$),
  'H: tenant N''s Manager cannot read tenant M''s summary');

-- M's tenant-wide Manager passing N's location id under M's tenant id: zeros.
select is(
  (select j->'workforce' from (select pg_temp.call_week('a7590000-0000-0000-0000-000000000001',
     'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000003') as j) x),
  '{"shiftAssignmentsCount": 0, "shiftExchangesCount": 0, "unresolvedShiftRequestsCount": 0,
    "attendanceCount": 0, "lateCount": 0, "lateMinutesTotal": 0, "noShowCount": 0, "unscheduledClockInsCount": 0}'::jsonb,
  'H: a foreign location id under the caller''s own tenant counts nothing from the other tenant');
select is(
  (select j->'operations' from (select pg_temp.call_week('a7590000-0000-0000-0000-000000000001',
     'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000003') as j) x),
  '{"completedCount": 0, "criticalMissedCount": 0, "openExceptionsCount": 0,
    "thresholdOutOfRangeCount": 0, "thresholdOutOfRangeOpenCount": 0}'::jsonb,
  'H: same for the operations block');

-- ============================================================================
-- I -- Module OFF -> null blocks
-- ============================================================================
create temp table r_p as
  select pg_temp.call_week('a7590000-0000-0000-0000-000000000004',
    'a7500000-0000-0000-0000-00000000000c', 'a7510000-0000-0000-0000-000000000004') as j;
select is((select jsonb_typeof(j->'workforce') from r_p), 'null', 'I: workforce OFF -> workforce block is JSON null');
select is((select jsonb_typeof(j->'operations') from r_p), 'null', 'I: operations OFF -> operations block is JSON null');
select is((select jsonb_typeof(j->'issues') from r_p), 'object', 'I: the enabled issues block still computes');

-- ============================================================================
-- J -- Denied callers
-- ============================================================================
select ok(
  pg_temp.as_auth_throws('a7590000-0000-0000-0000-000000000005', $$ select api.weekly_review_summary(
    'a7500000-0000-0000-0000-00000000000a'::uuid, 'a7510000-0000-0000-0000-000000000001'::uuid,
    '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00+09'::timestamptz, '2026-01-12 00:00+09'::timestamptz) $$),
  'J: a non-member is denied');
select ok(
  pg_temp.as_auth_throws('a7590000-0000-0000-0000-000000000002', $$ select api.weekly_review_summary(
    'a7500000-0000-0000-0000-00000000000a'::uuid, 'a7510000-0000-0000-0000-000000000001'::uuid,
    '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00+09'::timestamptz, '2026-01-12 00:00+09'::timestamptz) $$),
  'J: an Employee (no core.weekly_review.view) is denied');

-- ============================================================================
-- K -- A day marked on_leave is not a possible no-show (F3 reviews)
-- ============================================================================
-- E4 gets an ended Friday shift; with no attendance it is a no-show (2), with
-- an on_leave row (no clock_in) it is not (back to 1).
insert into workforce.shifts (tenant_id, location_id, employee_id, starts_at, ends_at, published) values
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000004', '2026-01-09 08:00+09', '2026-01-09 12:00+09', true);
select is((pg_temp.call_week('a7590000-0000-0000-0000-000000000001',
    'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001')->'workforce'->>'noShowCount')::int, 2,
  'K: an ended shift with no attendance is a possible no-show');
insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, clock_in, clock_out, status) values
  ('a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001', 'a7520000-0000-0000-0000-000000000004', '2026-01-09', null, null, 'on_leave');
select is((pg_temp.call_week('a7590000-0000-0000-0000-000000000001',
    'a7500000-0000-0000-0000-00000000000a', 'a7510000-0000-0000-0000-000000000001')->'workforce'->>'noShowCount')::int, 1,
  'K: the same day marked on_leave is not counted');

-- Security posture unchanged.
select is((select prosecdef from pg_proc where oid = 'api.weekly_review_summary(uuid,uuid,date,date,timestamptz,timestamptz)'::regprocedure),
  false, 'posture: still SECURITY INVOKER');

select * from finish();
rollback;
