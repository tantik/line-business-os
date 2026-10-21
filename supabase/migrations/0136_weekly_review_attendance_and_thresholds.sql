-- ============================================================================
-- 0136  Owner Weekly Review: attendance + out-of-range readings (QA4 F3)
-- ----------------------------------------------------------------------------
-- Replaces the body of api.weekly_review_summary only (plus one additive
-- index). Starting point: the LIVE definition = 0119's body with 0131's single
-- gate rewrite (the purchasing block gates on 'purchases'). 0122 did not
-- redefine this function (it only mentions it in a comment). Signature,
-- SECURITY INVOKER, search_path, the feature-level permission check, the
-- per-module gates, every existing output key and its math are unchanged;
-- grants are unchanged (CREATE OR REPLACE keeps them; restated below anyway,
-- identical to 0119).
--
-- NEW OUTPUT KEYS
--   workforce (still null when the workforce module is OFF):
--     attendanceCount           worked days in the week: distinct
--                               (employee, work_date) attendance rows with a
--                               clock_in, work_date inside [p_week_start,
--                               p_week_end] (attendance.work_date is already a
--                               location-local date).
--     lateCount                 worked days whose earliest clock_in is >= 1
--                               minute after the start of that employee's
--                               first published shift that local day.
--     lateMinutesTotal          sum over late days of
--                               floor((clock_in - shift start) / 60 s).
--     noShowCount               (employee, local day) pairs that have a
--                               published assigned shift in the week, whose
--                               (first) shift has already ENDED (ends_at <=
--                               now()), and no attendance row with a clock_in
--                               for that employee/day. Future and in-progress
--                               shifts are never counted, nor a day with an
--                               attendance row status='on_leave'. A "possible"
--                               no-show: workforce.leave_requests (scaffold,
--                               unused) is not consulted. Limits: DEBT-115.
--     unscheduledClockInsCount  worked days with no published assigned shift
--                               for that employee on that local day.
--   operations (still null when the operations module is OFF):
--     thresholdOutOfRangeCount      task_exceptions source='threshold'
--                                   created in [p_week_starts_at,
--                                   p_week_ends_at_exclusive).
--     thresholdOutOfRangeOpenCount  the subset of those still status='open'.
--
-- TIMEZONE: shifts are timestamptz; their location-local day is
-- (starts_at at time zone core.locations.timezone) -- the same conversion
-- 0050 uses for shift work dates. The timezone is read under the caller's own
-- RLS (locations_select = tenant membership; the caller has already passed
-- core.weekly_review.view at this location), defaulting to 'Asia/Tokyo' (the
-- column default) if not visible. Shifts are selected by the caller-resolved
-- UTC week instants, attendance by the location-local week dates -- the same
-- two-bound convention 0119 already uses.
--
-- SECURITY: unchanged posture (ADR 0008). SECURITY INVOKER; workforce.shifts,
-- workforce.attendance (wf_attendance_manage: workforce.attendance.manage +
-- workforce module) and operations.task_exceptions RLS remain the real
-- boundary; p_tenant_id / p_location_id only shape the aggregation.
--
-- COST: still one RPC per review open. New reads use existing indexes
-- wf_shifts_tenant_idx (tenant_id, starts_at) and wf_attendance_tenant_idx
-- (tenant_id, work_date). task_exceptions had no index usable for a
-- created_at window (only a partial status='open' index and the unique
-- (tenant_id, instance_id, ...) index, which bounds the scan to one tenant's
-- whole history); the additive index below bounds it to one location-week.
-- Plain CREATE INDEX briefly blocks writes to task_exceptions while it
-- builds -- fine at current volumes; note it for the production apply.
--
-- Rollback: re-run the previous body reproduced verbatim at the end of this
-- file (CREATE OR REPLACE), then
--   drop index if exists operations.operations_task_exceptions_location_created_idx;
-- No data is written or deleted in either direction.
-- ============================================================================

create index if not exists operations_task_exceptions_location_created_idx
  on operations.task_exceptions (tenant_id, location_id, created_at);

create or replace function api.weekly_review_summary(
  p_tenant_id               uuid,
  p_location_id             uuid,
  p_week_start              date,
  p_week_end                date,
  p_week_starts_at          timestamptz,
  p_week_ends_at_exclusive  timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = api, core, workforce, operations, issues, inventory, purchases, public
as $$
declare
  v_user       uuid := core.current_user_id();
  v_workforce  jsonb;
  v_operations jsonb;
  v_issues     jsonb;
  v_purchasing jsonb;
  v_recurring  jsonb;
  v_tz                 text;
  v_attendance_count   int;
  v_late_count         int;
  v_late_minutes       int;
  v_no_show_count      int;
  v_unscheduled_count  int;
begin
  if v_user is null then
    raise exception 'weekly_review_no_auth_context' using errcode = 'P0001';
  end if;
  if p_week_start is null or p_week_end is null or p_week_end < p_week_start then
    raise exception 'weekly_review_invalid_week' using errcode = 'P0001';
  end if;
  if p_week_starts_at is null or p_week_ends_at_exclusive is null or p_week_ends_at_exclusive <= p_week_starts_at then
    raise exception 'weekly_review_invalid_week' using errcode = 'P0001';
  end if;

  -- Feature-level gate. Location-scoped, same shape as every other
  -- Manager-surface permission check in this codebase (hasManagerAccess).
  if not core.has_permission(p_tenant_id, 'core.weekly_review.view', p_location_id) then
    raise exception 'weekly_review_permission_denied' using errcode = 'P0001';
  end if;

  -- --- Team / Workforce ------------------------------------------------------
  if core.has_module_access(p_tenant_id, 'workforce') then
    -- Location-local wall clock for mapping a shift instant to its work day.
    v_tz := coalesce(
      (select l.timezone from core.locations l
        where l.tenant_id = p_tenant_id and l.id = p_location_id),
      'Asia/Tokyo');

    -- Attendance vs published shifts, matched per (employee, local day):
    -- the earliest clock_in of the day against the start of that employee's
    -- first published shift of the day (0136).
    with day_shift as (
      select distinct on (s.employee_id, (s.starts_at at time zone v_tz)::date)
             s.employee_id,
             (s.starts_at at time zone v_tz)::date as work_date,
             s.starts_at,
             s.ends_at
        from workforce.shifts s
       where s.tenant_id = p_tenant_id and s.location_id = p_location_id
         and s.employee_id is not null
         and s.published
         and s.starts_at >= p_week_starts_at and s.starts_at < p_week_ends_at_exclusive
       order by s.employee_id, (s.starts_at at time zone v_tz)::date, s.starts_at
    ),
    worked as (
      select a.employee_id, a.work_date, min(a.clock_in) as clock_in
        from workforce.attendance a
       where a.tenant_id = p_tenant_id and a.location_id = p_location_id
         and a.work_date >= p_week_start and a.work_date <= p_week_end
         and a.clock_in is not null
       group by a.employee_id, a.work_date
    )
    select
      count(w.employee_id)::int,
      count(*) filter (where w.employee_id is not null and ds.employee_id is not null
                         and w.clock_in >= ds.starts_at + interval '1 minute')::int,
      coalesce(sum(floor(extract(epoch from (w.clock_in - ds.starts_at)) / 60))
                 filter (where w.employee_id is not null and ds.employee_id is not null
                           and w.clock_in >= ds.starts_at + interval '1 minute'), 0)::int,
      -- A day the Manager marked on_leave (attendance row, no clock_in) is
      -- not a possible no-show (F3 reviews, 2026-10-21).
      count(*) filter (where w.employee_id is null and ds.ends_at <= now()
                         and not exists (
                           select 1 from workforce.attendance lv
                            where lv.tenant_id = p_tenant_id and lv.location_id = p_location_id
                              and lv.employee_id = ds.employee_id and lv.work_date = ds.work_date
                              and lv.status = 'on_leave'))::int,
      count(*) filter (where w.employee_id is not null and ds.employee_id is null)::int
      into v_attendance_count, v_late_count, v_late_minutes, v_no_show_count, v_unscheduled_count
      from worked w
      full join day_shift ds
        on ds.employee_id = w.employee_id and ds.work_date = w.work_date;

    select jsonb_build_object(
      'shiftAssignmentsCount', (
        select count(*)::int from workforce.shifts s
        where s.tenant_id = p_tenant_id and s.location_id = p_location_id
          and s.employee_id is not null
          and s.starts_at >= p_week_starts_at and s.starts_at < p_week_ends_at_exclusive
      ),
      'shiftExchangesCount', (
        select count(*)::int from workforce.shift_exchanges x
        where x.tenant_id = p_tenant_id and x.location_id = p_location_id
          and x.created_at >= p_week_starts_at and x.created_at < p_week_ends_at_exclusive
      ),
      -- "Still unresolved" -- regardless of when originally created, NOT
      -- scoped to this week (mission contract: label clearly, don't imply
      -- they're from this week).
      'unresolvedShiftRequestsCount', (
        select count(*)::int from workforce.shift_requests r
        where r.tenant_id = p_tenant_id and r.location_id = p_location_id
          and r.status = 'pending'
      ),
      'attendanceCount', v_attendance_count,
      'lateCount', v_late_count,
      'lateMinutesTotal', v_late_minutes,
      'noShowCount', v_no_show_count,
      'unscheduledClockInsCount', v_unscheduled_count
    ) into v_workforce;
  else
    v_workforce := null;
  end if;

  -- --- Operations --------------------------------------------------------------
  if core.has_module_access(p_tenant_id, 'operations') then
    select jsonb_build_object(
      'completedCount', (
        select count(*)::int from operations.task_instances ti
        where ti.tenant_id = p_tenant_id and ti.location_id = p_location_id
          and ti.status = 'completed'
          and ti.business_date >= p_week_start and ti.business_date <= p_week_end
      ),
      'criticalMissedCount', (
        select count(*)::int from operations.task_exceptions te
        where te.tenant_id = p_tenant_id and te.location_id = p_location_id
          and te.source = 'critical_missed'
          and te.business_date >= p_week_start and te.business_date <= p_week_end
      ),
      -- "Still open" as of now -- NOT necessarily created this week.
      'openExceptionsCount', (
        select count(*)::int from operations.task_exceptions te
        where te.tenant_id = p_tenant_id and te.location_id = p_location_id
          and te.status = 'open'
      ),
      -- Out-of-range numeric answers (temperature etc.) recorded in the week,
      -- and how many of THOSE are still open (0136).
      'thresholdOutOfRangeCount', (
        select count(*)::int from operations.task_exceptions te
        where te.tenant_id = p_tenant_id and te.location_id = p_location_id
          and te.source = 'threshold'
          and te.created_at >= p_week_starts_at and te.created_at < p_week_ends_at_exclusive
      ),
      'thresholdOutOfRangeOpenCount', (
        select count(*)::int from operations.task_exceptions te
        where te.tenant_id = p_tenant_id and te.location_id = p_location_id
          and te.source = 'threshold'
          and te.status = 'open'
          and te.created_at >= p_week_starts_at and te.created_at < p_week_ends_at_exclusive
      )
    ) into v_operations;
  else
    v_operations := null;
  end if;

  -- --- Issues & Handover ---------------------------------------------------
  if core.has_module_access(p_tenant_id, 'issues') then
    select coalesce(jsonb_agg(jsonb_build_object('category', category, 'count', cnt) order by cnt desc, category), '[]'::jsonb)
      into v_recurring
    from (
      select category, count(*)::int as cnt
      from issues.issues i
      where i.tenant_id = p_tenant_id and i.location_id = p_location_id
        and i.kind = 'issue'
        and i.category is not null
        and i.business_date >= p_week_start and i.business_date <= p_week_end
      group by category
      having count(*) >= 2
    ) c;

    select jsonb_build_object(
      'newIssuesCount', (
        select count(*)::int from issues.issues i
        where i.tenant_id = p_tenant_id and i.location_id = p_location_id
          and i.kind = 'issue'
          and i.business_date >= p_week_start and i.business_date <= p_week_end
      ),
      'newHandoversCount', (
        select count(*)::int from issues.issues i
        where i.tenant_id = p_tenant_id and i.location_id = p_location_id
          and i.kind = 'handover'
          and i.business_date >= p_week_start and i.business_date <= p_week_end
      ),
      -- "Still unresolved" as of now -- NOT necessarily reported this week.
      'unresolvedIssuesCount', (
        select count(*)::int from issues.issues i
        where i.tenant_id = p_tenant_id and i.location_id = p_location_id
          and i.kind = 'issue' and i.status in ('open', 'acknowledged')
      ),
      'unresolvedImportantIssuesCount', (
        select count(*)::int from issues.issues i
        where i.tenant_id = p_tenant_id and i.location_id = p_location_id
          and i.kind = 'issue' and i.severity = 'important'
          and i.status in ('open', 'acknowledged')
      ),
      'recurringCategories', v_recurring
    ) into v_issues;
  else
    v_issues := null;
  end if;

  -- --- Inventory / Purchasing ------------------------------------------------
  -- Gated on the Purchasing module (its own module_code since 0131).
  -- Reuses the EXISTING `api.inventory_item_status` / `api.purchases_needed`
  -- security_invoker views verbatim rather than re-deriving the shortage/
  -- pending rule here (D3-style reuse, avoids a second, potentially-diverging
  -- definition of "shortage"). Both are current live state -- inventory has
  -- no history, so these are never week-scoped, per the mission contract.
  if core.has_module_access(p_tenant_id, 'purchases') then
    select jsonb_build_object(
      'shortageItemsCount', (
        select count(*)::int from api.inventory_item_status s
        where s.tenant_id = p_tenant_id and s.location_id = p_location_id
          and s.status = 'shortage'
      ),
      'pendingPurchasesCount', (
        select count(*)::int from api.purchases_needed p
        where p.tenant_id = p_tenant_id and p.location_id = p_location_id
          and p.purchase_status = 'pending'
      )
    ) into v_purchasing;
  else
    v_purchasing := null;
  end if;

  return jsonb_build_object(
    'weekStart', p_week_start,
    'weekEnd', p_week_end,
    'workforce', v_workforce,
    'operations', v_operations,
    'issues', v_issues,
    'purchasing', v_purchasing
  );
end;
$$;
comment on function api.weekly_review_summary(uuid, uuid, date, date, timestamptz, timestamptz) is
  'Owner Weekly Review read-model (Cafe v2.2 WP3; attendance + out-of-range readings since 0136): a single JSON summary of Team/Operations/Issues/Purchasing counts for one Monday-Sunday business week at one tenant+location. Team adds attendanceCount/lateCount/lateMinutesTotal/noShowCount/unscheduledClockInsCount (late = earliest clock_in >= 1 min after the first published shift start of that local day); Operations adds thresholdOutOfRangeCount/thresholdOutOfRangeOpenCount. SECURITY INVOKER -- relies entirely on the underlying tables'' / views'' own RLS for the real access boundary; only checks core.weekly_review.view itself as the feature-level gate. Per-domain section is null (not 0) when that domain''s module is OFF for the tenant. No new table, no persisted snapshot -- recomputed on every call.';

revoke all on function api.weekly_review_summary(uuid, uuid, date, date, timestamptz, timestamptz) from public, anon;
grant execute on function api.weekly_review_summary(uuid, uuid, date, date, timestamptz, timestamptz) to authenticated;

-- ============================================================================
-- ROLLBACK -- previous body (0119 as rewritten by 0131), verbatim. To roll
-- back, run this block uncommented, restore 0119's COMMENT ON FUNCTION text
-- (below), and drop the index above.
--
-- comment on function api.weekly_review_summary(uuid, uuid, date, date, timestamptz, timestamptz) is
--   'Owner Weekly Review read-model (Cafe v2.2 WP3): a single JSON summary of Team/Operations/Issues/Purchasing counts for one Monday-Sunday business week at one tenant+location. SECURITY INVOKER -- relies entirely on the underlying tables'' / views'' own RLS for the real access boundary; only checks core.weekly_review.view itself as the feature-level gate. Per-domain section is null (not 0) when that domain''s module is OFF for the tenant. No new table, no persisted snapshot -- recomputed on every call.';
-- ----------------------------------------------------------------------------
-- create or replace function api.weekly_review_summary(
--   p_tenant_id               uuid,
--   p_location_id             uuid,
--   p_week_start              date,
--   p_week_end                date,
--   p_week_starts_at          timestamptz,
--   p_week_ends_at_exclusive  timestamptz
-- )
-- returns jsonb
-- language plpgsql
-- security invoker
-- set search_path = api, core, workforce, operations, issues, inventory, purchases, public
-- as $$
-- declare
--   v_user       uuid := core.current_user_id();
--   v_workforce  jsonb;
--   v_operations jsonb;
--   v_issues     jsonb;
--   v_purchasing jsonb;
--   v_recurring  jsonb;
-- begin
--   if v_user is null then
--     raise exception 'weekly_review_no_auth_context' using errcode = 'P0001';
--   end if;
--   if p_week_start is null or p_week_end is null or p_week_end < p_week_start then
--     raise exception 'weekly_review_invalid_week' using errcode = 'P0001';
--   end if;
--   if p_week_starts_at is null or p_week_ends_at_exclusive is null or p_week_ends_at_exclusive <= p_week_starts_at then
--     raise exception 'weekly_review_invalid_week' using errcode = 'P0001';
--   end if;
--
--   -- Feature-level gate. Location-scoped, same shape as every other
--   -- Manager-surface permission check in this codebase (hasManagerAccess).
--   if not core.has_permission(p_tenant_id, 'core.weekly_review.view', p_location_id) then
--     raise exception 'weekly_review_permission_denied' using errcode = 'P0001';
--   end if;
--
--   -- --- Team / Workforce ------------------------------------------------------
--   if core.has_module_access(p_tenant_id, 'workforce') then
--     select jsonb_build_object(
--       'shiftAssignmentsCount', (
--         select count(*)::int from workforce.shifts s
--         where s.tenant_id = p_tenant_id and s.location_id = p_location_id
--           and s.employee_id is not null
--           and s.starts_at >= p_week_starts_at and s.starts_at < p_week_ends_at_exclusive
--       ),
--       'shiftExchangesCount', (
--         select count(*)::int from workforce.shift_exchanges x
--         where x.tenant_id = p_tenant_id and x.location_id = p_location_id
--           and x.created_at >= p_week_starts_at and x.created_at < p_week_ends_at_exclusive
--       ),
--       -- "Still unresolved" -- regardless of when originally created, NOT
--       -- scoped to this week (mission contract: label clearly, don't imply
--       -- they're from this week).
--       'unresolvedShiftRequestsCount', (
--         select count(*)::int from workforce.shift_requests r
--         where r.tenant_id = p_tenant_id and r.location_id = p_location_id
--           and r.status = 'pending'
--       )
--     ) into v_workforce;
--   else
--     v_workforce := null;
--   end if;
--
--   -- --- Operations --------------------------------------------------------------
--   if core.has_module_access(p_tenant_id, 'operations') then
--     select jsonb_build_object(
--       'completedCount', (
--         select count(*)::int from operations.task_instances ti
--         where ti.tenant_id = p_tenant_id and ti.location_id = p_location_id
--           and ti.status = 'completed'
--           and ti.business_date >= p_week_start and ti.business_date <= p_week_end
--       ),
--       'criticalMissedCount', (
--         select count(*)::int from operations.task_exceptions te
--         where te.tenant_id = p_tenant_id and te.location_id = p_location_id
--           and te.source = 'critical_missed'
--           and te.business_date >= p_week_start and te.business_date <= p_week_end
--       ),
--       -- "Still open" as of now -- NOT necessarily created this week.
--       'openExceptionsCount', (
--         select count(*)::int from operations.task_exceptions te
--         where te.tenant_id = p_tenant_id and te.location_id = p_location_id
--           and te.status = 'open'
--       )
--     ) into v_operations;
--   else
--     v_operations := null;
--   end if;
--
--   -- --- Issues & Handover ---------------------------------------------------
--   if core.has_module_access(p_tenant_id, 'issues') then
--     select coalesce(jsonb_agg(jsonb_build_object('category', category, 'count', cnt) order by cnt desc, category), '[]'::jsonb)
--       into v_recurring
--     from (
--       select category, count(*)::int as cnt
--       from issues.issues i
--       where i.tenant_id = p_tenant_id and i.location_id = p_location_id
--         and i.kind = 'issue'
--         and i.category is not null
--         and i.business_date >= p_week_start and i.business_date <= p_week_end
--       group by category
--       having count(*) >= 2
--     ) c;
--
--     select jsonb_build_object(
--       'newIssuesCount', (
--         select count(*)::int from issues.issues i
--         where i.tenant_id = p_tenant_id and i.location_id = p_location_id
--           and i.kind = 'issue'
--           and i.business_date >= p_week_start and i.business_date <= p_week_end
--       ),
--       'newHandoversCount', (
--         select count(*)::int from issues.issues i
--         where i.tenant_id = p_tenant_id and i.location_id = p_location_id
--           and i.kind = 'handover'
--           and i.business_date >= p_week_start and i.business_date <= p_week_end
--       ),
--       -- "Still unresolved" as of now -- NOT necessarily reported this week.
--       'unresolvedIssuesCount', (
--         select count(*)::int from issues.issues i
--         where i.tenant_id = p_tenant_id and i.location_id = p_location_id
--           and i.kind = 'issue' and i.status in ('open', 'acknowledged')
--       ),
--       'unresolvedImportantIssuesCount', (
--         select count(*)::int from issues.issues i
--         where i.tenant_id = p_tenant_id and i.location_id = p_location_id
--           and i.kind = 'issue' and i.severity = 'important'
--           and i.status in ('open', 'acknowledged')
--       ),
--       'recurringCategories', v_recurring
--     ) into v_issues;
--   else
--     v_issues := null;
--   end if;
--
--   -- --- Inventory / Purchasing ------------------------------------------------
--   -- Purchases has no dedicated module_code -- it rides on `inventory`
--   -- (0089's own documented Founder decision). Reuses the EXISTING
--   -- `api.inventory_item_status` / `api.purchases_needed` security_invoker
--   -- views verbatim rather than re-deriving the shortage/pending rule here
--   -- (D3-style reuse, avoids a second, potentially-diverging definition of
--   -- "shortage"). Both are current live state -- inventory has no history, so
--   -- these are never week-scoped, per the mission contract.
--   if core.has_module_access(p_tenant_id, 'purchases') then
--     select jsonb_build_object(
--       'shortageItemsCount', (
--         select count(*)::int from api.inventory_item_status s
--         where s.tenant_id = p_tenant_id and s.location_id = p_location_id
--           and s.status = 'shortage'
--       ),
--       'pendingPurchasesCount', (
--         select count(*)::int from api.purchases_needed p
--         where p.tenant_id = p_tenant_id and p.location_id = p_location_id
--           and p.purchase_status = 'pending'
--       )
--     ) into v_purchasing;
--   else
--     v_purchasing := null;
--   end if;
--
--   return jsonb_build_object(
--     'weekStart', p_week_start,
--     'weekEnd', p_week_end,
--     'workforce', v_workforce,
--     'operations', v_operations,
--     'issues', v_issues,
--     'purchasing', v_purchasing
--   );
-- end;
-- $$;
-- ============================================================================
