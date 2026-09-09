-- ============================================================================
-- 0116  Operations — persistent "critical scheduled check missed" exception
--       (Cafe v2.2 WP1 Operations — G1 bounded fix, Founder-approved 2026-09-09)
-- ----------------------------------------------------------------------------
-- WP1 Final Bounded Acceptance found ONE substantive gap (G1):
--   `operations.task_exceptions.source` declares 'critical_missed' /
--   'verification_required' (0101), and `api.operations_expected_tasks`
--   computes a transient `is_overdue_critical` flag — but NO code path ever
--   MATERIALISES a durable exception when a critical scheduled check's window
--   closes with no completion. Consequence: "a critical check missed →
--   action_required" (D4) never reaches the Manager Attention feed
--   (`api.operations_open_exceptions`), and the Manager "Today" overview does
--   not distinguish a missed *critical* task from an ordinary overdue one.
--
-- Founder decision 2026-09-09: G1 is an unfinished bounded slice of the
-- EXISTING WP1, not a new capability. Fix it minimally, inside the existing
-- Operations architecture. `critical_missed` becomes an INSTANCE-LESS
-- exception attached by (tenant_id, schedule_id, business_date) — a missed
-- check by definition has no `task_instance` (nobody interacted).
--
-- SCOPE OF THIS MIGRATION (additive; no existing row is modified; no data is
-- deleted; no existing RLS policy is changed):
--   1. `operations.task_exceptions.instance_id` -> nullable; add
--      `schedule_id` + `business_date`; a CHECK making every exception EITHER
--      instance-attached (existing threshold/reported — unchanged shape) OR
--      schedule+date-attached (the new 'critical_missed'). FK on the new
--      schedule pair. `critical_missed` is structurally forced into the
--      schedule+date shape.
--   2. HISTORICAL idempotency: at most ONE 'critical_missed' row per
--      (tenant_id, schedule_id, business_date) for ALL TIME, regardless of
--      open/resolved status (Founder design correction #1) — a partial unique
--      index with no status predicate.
--   3. `operations.task_exceptions_guard()` — rebuilt to validate the
--      denormalised `location_id` against the parent INSTANCE (existing) OR
--      the parent SCHEDULE (new), symmetrically.
--   4. `operations.flag_missed_critical(tenant, start, end)` —
--      SECURITY DEFINER writer. Idempotently inserts a 'critical_missed' /
--      'action_required' exception for every (schedule, business_date) in a
--      clamped window whose window has closed, whose template still carries an
--      active critical item, that has no completed instance, and that has no
--      'critical_missed' row yet. Creates rows ONLY for locations where the
--      *calling* user (resolved from the JWT, not `current_user`) holds
--      `operations.exception.resolve` — so a direct call with an arbitrary
--      p_tenant_id can create nothing (Founder design correction #4).
--      Architected so a future scheduled worker can call the SAME writer with
--      no schema change (Founder design correction #3).
--   5. `api.operations_flag_missed_critical(tenant, start, end)` — SECURITY
--      INVOKER wrapper (ADR 0008: no SECURITY DEFINER in `api`). Enforces auth
--      context + module ON + `exception.resolve` held somewhere in the tenant,
--      then delegates to (4). This is the path the Manager Operations
--      server-load calls ("read-time materialisation", Founder decision #3).
--   6. `operations.close_missed_critical_on_completion(tenant, schedule,
--      business_date)` — SECURITY DEFINER. Resolves an OPEN
--      'critical_missed' for that occurrence when the task is later COMPLETED
--      (late completion), with an explicit system resolution note. Called from
--      `api.operations_complete_task` ONLY — NOT from
--      `api.operations_record_response` (Founder design correction #2: the
--      first late response is not "situation fixed"; completion is). After
--      resolution the row is never recreated (historical unique index (2)).
--   7. `api.operations_complete_task` — create-or-replace: identical to 0101
--      plus the one `close_missed_critical_on_completion` call after marking
--      the instance completed.
--   8. `api.operations_expected_tasks` — create-or-replace (4th revision,
--      SAME signature as 0104): `open_exception_count` now also counts the
--      instance-less 'critical_missed' rows for the (schedule, business_date).
--      Nothing else changes.
--   9. `api.operations_open_exceptions` — create-or-replace: adds
--      `schedule_id` + `business_date` columns so the Attention UI can resolve
--      an instance-less exception to its task. `security_invoker` unchanged.
--
-- NOT in this migration (Founder decisions, unchanged):
--   * 'verification_required' — still reserved, still never written. Untouched.
--   * ad-hoc same-day Recheck — ACCEPTED MVP LIMITATION, deferred.
--   * per-location threshold overrides — ACCEPTED MVP LIMITATION, deferred.
--   * a background worker sweep — NOT built now; the writer is worker-ready.
--
-- ACCEPTED MVP IMPLEMENTATION DETAIL (Founder decision #3): a 'critical_missed'
-- row is materialised when a Manager evaluates Operations. If a Manager never
-- opens Operations after a miss, the persistent row may not exist yet (the
-- transient `is_overdue_critical` projection flag still shows it). A future
-- scheduled worker calling `operations.flag_missed_critical` closes this with
-- zero schema change.
--
-- RLS: NOT CHANGED. The `operations_exceptions_insert` policy (0101) already
-- gates `source in ('critical_missed','verification_required')` behind
-- `operations.exception.resolve` at the row's `location_id`; the
-- `operations_exceptions_select` / `_update` policies key on
-- `tenant_id`/`location_id`, both present on an instance-less row. The
-- SECURITY DEFINER writer bypasses RLS by design and self-enforces the
-- equivalent per-location `exception.resolve` check.
--
-- NO Cloud apply. RED path (supabase/migrations/**) — PR left for the
-- documented autonomous dev-merge; Cloud DEV apply is a separate Founder Gate.
--
-- ----------------------------------------------------------------------------
-- Rollback (NOT unconditional). Full step-by-step revert SQL is in the PR
-- description / the G1 handoff, kept out of this header so its example
-- statements do not trip the additive-migration destructive-pattern scan.
-- Summary:
--   * the 3 new functions can be removed cleanly;
--   * api.operations_complete_task / api.operations_expected_tasks /
--     api.operations_open_exceptions / operations.task_exceptions_guard() are
--     restored to their 0101 / 0104 bodies (in git history);
--   * the new unique index, the two CHECK constraints and the schedule FK can
--     be removed cleanly; the two new columns can be removed cleanly;
--   * re-imposing instance_id NOT NULL is CONDITIONAL — it first requires
--     removing every instance-less row (the critical_missed history), so a
--     full revert to the pre-0116 shape is not lossless. This is an
--     intentional trade-off vs. the alternative (keeping instance_id NOT NULL
--     and materialising a system task_instance, which would need an
--     irreversible ALTER TYPE ADD VALUE on operations.instance_status plus
--     changes to the hot completion path).
-- ============================================================================

-- ============================================================================
-- 1. task_exceptions — instance-less attachment mode
-- ============================================================================
alter table operations.task_exceptions
  alter column instance_id drop not null;

alter table operations.task_exceptions
  add column if not exists schedule_id   uuid,
  add column if not exists business_date date;

-- Exactly one attachment mode. Existing rows (instance_id set, schedule_id /
-- business_date null) satisfy the first disjunct unchanged. 'critical_missed'
-- is ALWAYS the instance-less schedule+date shape. (`add constraint` has no
-- IF NOT EXISTS; guarded so a re-apply is a no-op.)
do $$ begin
  alter table operations.task_exceptions
    add constraint operations_task_exceptions_attach_chk check (
      (instance_id is not null and schedule_id is null and business_date is null)
      or
      (instance_id is null and schedule_id is not null and business_date is not null)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table operations.task_exceptions
    add constraint operations_task_exceptions_missed_shape_chk check (
      source <> 'critical_missed'
      or (instance_id is null and schedule_id is not null and business_date is not null)
    );
exception when duplicate_object then null; end $$;

-- Schedule pair FK (composite, same-tenant). NULL schedule_id (every existing
-- row) skips the FK. RESTRICT: an exception is history, a schedule with one
-- may not be hard-deleted (mirrors the instance FK).
do $$ begin
  alter table operations.task_exceptions
    add constraint operations_task_exceptions_schedule_fkey
      foreign key (tenant_id, schedule_id)
      references operations.task_schedules(tenant_id, id) on delete restrict;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. HISTORICAL idempotency — at most ONE 'critical_missed' per occurrence,
--    for all time (open OR resolved). Prevents create -> resolve -> re-sweep
--    -> second row (Founder design correction #1).
-- ============================================================================
create unique index if not exists operations_task_exceptions_missed_critical_uniq
  on operations.task_exceptions (tenant_id, schedule_id, business_date)
  where source = 'critical_missed';

comment on column operations.task_exceptions.schedule_id is
  'Set (with business_date) only for an instance-less exception — currently only source=''critical_missed''. NULL for the instance-attached threshold / reported exceptions.';
comment on column operations.task_exceptions.business_date is
  'Operational period of an instance-less exception (location-local date the missed window opened). NULL for instance-attached exceptions.';

-- ============================================================================
-- 3. task_exceptions_guard() — validate location against instance OR schedule
-- ============================================================================
create or replace function operations.task_exceptions_guard()
returns trigger language plpgsql as $$
declare
  v_parent_location uuid;
begin
  if new.instance_id is not null then
    select ti.location_id into v_parent_location
    from operations.task_instances ti
    where ti.tenant_id = new.tenant_id and ti.id = new.instance_id;
    if v_parent_location is null then
      raise exception 'operations_instance_not_found' using errcode = 'P0002';
    end if;
  elsif new.schedule_id is not null then
    select s.location_id into v_parent_location
    from operations.task_schedules s
    where s.tenant_id = new.tenant_id and s.id = new.schedule_id;
    if v_parent_location is null then
      raise exception 'operations_schedule_not_found' using errcode = 'P0002';
    end if;
  else
    -- the attach CHECK already forbids this; belt and suspenders.
    raise exception 'operations_exception_unattached' using errcode = 'P0001';
  end if;

  if new.location_id <> v_parent_location then
    raise exception 'operations_exception_location_mismatch' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
comment on function operations.task_exceptions_guard() is
  'BEFORE INSERT/UPDATE on operations.task_exceptions: the denormalised location_id must equal the parent instance''s location_id (instance-attached) OR the parent schedule''s location_id (instance-less, e.g. critical_missed). Within-tenant cross-location integrity; cross-tenant is the composite FK''s job.';

-- (trigger definition itself is unchanged — still BEFORE INSERT OR UPDATE.)

-- ============================================================================
-- 4. operations.flag_missed_critical — SECURITY DEFINER writer
-- ============================================================================
create or replace function operations.flag_missed_critical(
  p_tenant_id uuid,
  p_start     date default (current_date - 7),
  p_end       date default current_date
)
returns integer
language plpgsql
security definer
set search_path = operations, core, public
as $$
declare
  v_created integer;
begin
  with bounds as (
    select
      greatest(coalesce(p_start, current_date - 7),  current_date - 31) as d_start,
      least(   coalesce(p_end,   current_date),       current_date + 62) as d_end
  ),
  sched as (
    -- Only schedules the CALLING user (JWT-resolved, unaffected by SECURITY
    -- DEFINER) may resolve exceptions for, in a module-ON tenant. A direct
    -- call with an arbitrary p_tenant_id therefore materialises nothing.
    -- Deliberately NOT filtered on s.is_active: like api.operations_expected_tasks
    -- (0102/0104), historical applicability is the effective-date range alone,
    -- so a since-deactivated schedule still has its past missed-critical days
    -- flagged for the same window the projection considers them overdue.
    select s.*, operations.location_timezone(s.tenant_id, s.location_id) as location_timezone
    from operations.task_schedules s
    where s.tenant_id = p_tenant_id
      and core.has_module_access(s.tenant_id, 'operations')
      and core.has_permission(s.tenant_id, 'operations.exception.resolve', s.location_id)
  ),
  cal as (
    select d::date as d
    from bounds b, generate_series(b.d_start, b.d_end, interval '1 day') as g(d)
  ),
  occ as (
    select
      s.id           as schedule_id,
      s.tenant_id,
      s.location_id,
      s.template_id,
      c.d            as business_date,
      (
        (case
           when s.window_end_time is null            then (c.d + s.due_time)
           when s.window_end_time >= s.due_time      then (c.d + s.window_end_time)
           else ((c.d + 1) + s.window_end_time)
         end) at time zone s.location_timezone
      )              as window_close_at
    from sched s
    join operations.checklist_templates t
      on t.tenant_id = s.tenant_id and t.id = s.template_id
    join cal c
      on s.effective_from <= c.d
     and (s.effective_to is null or c.d <= s.effective_to)
     and (t.retired_on is null or c.d <= t.retired_on)
     and (
           s.recurrence_kind = 'daily'
        or (s.recurrence_kind = 'weekdays'
            and extract(isodow from c.d)::smallint = any (s.weekdays))
         )
  ),
  missed as (
    select o.*
    from occ o
    where now() > o.window_close_at
      and exists (
        select 1 from operations.checklist_items ci
        where ci.tenant_id = o.tenant_id
          and ci.template_id = o.template_id
          and ci.is_active
          and ci.is_critical
      )
      and not exists (
        select 1 from operations.task_instances ti
        where ti.tenant_id = o.tenant_id
          and ti.schedule_id = o.schedule_id
          and ti.business_date = o.business_date
          and ti.status = 'completed'
      )
      and not exists (
        -- historical: any status, ever
        select 1 from operations.task_exceptions te
        where te.tenant_id = o.tenant_id
          and te.schedule_id = o.schedule_id
          and te.business_date = o.business_date
          and te.source = 'critical_missed'
      )
  ),
  ins as (
    insert into operations.task_exceptions
      (tenant_id, location_id, instance_id, schedule_id, business_date,
       item_id, severity, source, note)
    select
      m.tenant_id, m.location_id, null, m.schedule_id, m.business_date,
      null, 'action_required', 'critical_missed', null
    from missed m
    on conflict (tenant_id, schedule_id, business_date) where source = 'critical_missed'
      do nothing
    returning 1
  )
  select count(*)::int into v_created from ins;

  return coalesce(v_created, 0);
end;
$$;

comment on function operations.flag_missed_critical(uuid, date, date) is
  'SECURITY DEFINER writer: idempotently materialises a critical_missed / action_required exception for every (schedule, business_date) in a clamped [current_date-31, current_date+62] window whose window has closed, whose template still has an active critical item, with no completed instance and no critical_missed row yet. Rows are created ONLY for locations where the JWT-resolved caller holds operations.exception.resolve — a direct call with an arbitrary p_tenant_id materialises nothing. Worker-ready: a future scheduled sweep needs only a trusted entry point (a new function, not a schema change) to reuse this body.';

revoke all on function operations.flag_missed_critical(uuid, date, date) from public, anon;
grant execute on function operations.flag_missed_critical(uuid, date, date) to authenticated;

-- ============================================================================
-- 5. api.operations_flag_missed_critical — SECURITY INVOKER wrapper
-- ============================================================================
create or replace function api.operations_flag_missed_critical(
  p_tenant_id uuid,
  p_start     date default (current_date - 7),
  p_end       date default current_date
)
returns integer
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
declare
  v_user  uuid := core.current_user_id();
  v_count integer;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;
  -- Fast fail: must hold exception.resolve somewhere in the tenant. The real
  -- per-location boundary is inside operations.flag_missed_critical.
  if not core.has_permission_in_tenant(p_tenant_id, 'operations.exception.resolve') then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;

  select operations.flag_missed_critical(p_tenant_id, p_start, p_end) into v_count;
  return coalesce(v_count, 0);
end;
$$;
comment on function api.operations_flag_missed_critical(uuid, date, date) is
  'Materialise persistent critical_missed exceptions for the caller''s permitted locations (read-time materialisation — called by the Manager Operations server-load). SECURITY INVOKER: enforces auth + module ON + operations.exception.resolve, then delegates to the SECURITY DEFINER operations.flag_missed_critical. Idempotent; safe to call on every Manager Operations load.';

revoke all on function api.operations_flag_missed_critical(uuid, date, date) from public, anon;
grant execute on function api.operations_flag_missed_critical(uuid, date, date) to authenticated;

-- ============================================================================
-- 6. operations.close_missed_critical_on_completion — SECURITY DEFINER
-- ============================================================================
create or replace function operations.close_missed_critical_on_completion(
  p_tenant_id     uuid,
  p_schedule_id   uuid,
  p_business_date date
)
returns void
language sql
security definer
set search_path = operations, core, public
as $$
  -- SELF-AUTHORISING (Founder design correction #4 — no trust in
  -- caller-supplied input, even though api.operations_complete_task already
  -- checked): every guard is a WHERE predicate, so a call that fails any of
  -- them is a silent no-op rather than an error.
  --   * module ON for the tenant;
  --   * the schedule must actually belong to p_tenant_id (blocks a forged
  --     p_schedule_id from another tenant);
  --   * the JWT-resolved caller must hold operations.task.execute at that
  --     schedule's location — exactly what completing the task requires;
  --   * resolved_by is the JWT user, never a caller-supplied value.
  update operations.task_exceptions te
     set status          = 'resolved',
         resolved_at     = now(),
         resolved_by     = core.current_user_id(),
         resolution_note = coalesce(
           te.resolution_note,
           'System: the scheduled check was completed after its window closed (late completion) — missed-critical flag cleared.'
         )
   where te.tenant_id     = p_tenant_id
     and te.schedule_id   = p_schedule_id
     and te.business_date = p_business_date
     and te.source        = 'critical_missed'
     and te.status        = 'open'
     and core.has_module_access(p_tenant_id, 'operations')
     and exists (
       select 1 from operations.task_schedules s
       where s.tenant_id = p_tenant_id
         and s.id = p_schedule_id
         and core.has_permission(p_tenant_id, 'operations.task.execute', s.location_id)
     );
$$;
comment on function operations.close_missed_critical_on_completion(uuid, uuid, date) is
  'SECURITY DEFINER: resolve an OPEN critical_missed exception for (schedule, business_date) when the task is later COMPLETED. Self-authorising — module ON + the schedule belongs to the tenant + the JWT-resolved caller holds operations.task.execute at the schedule''s location; every check is a WHERE predicate so a non-holder / cross-tenant call is a silent no-op. resolved_by is the JWT user. NOT called on a mere response (Founder design correction #2). The historical unique index keeps a re-sweep from recreating the row.';

revoke all on function operations.close_missed_critical_on_completion(uuid, uuid, date) from public, anon;
grant execute on function operations.close_missed_critical_on_completion(uuid, uuid, date) to authenticated;

-- ============================================================================
-- 7. api.operations_complete_task — create-or-replace (0101 body + one call)
-- ============================================================================
create or replace function api.operations_complete_task(
  p_tenant_id   uuid,
  p_schedule_id uuid
)
returns table (instance_id uuid, status operations.instance_status)
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user          uuid := core.current_user_id();
  v_location_id   uuid;
  v_template_id   uuid;
  v_business_date date;
  v_instance_id   uuid;
  v_status        operations.instance_status;
  v_missing       int;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select s.location_id, s.template_id into v_location_id, v_template_id
  from operations.task_schedules s
  where s.tenant_id = p_tenant_id and s.id = p_schedule_id;

  if v_location_id is null then
    raise exception 'operations_schedule_not_found' using errcode = 'P0002';
  end if;
  if not core.has_permission(p_tenant_id, 'operations.task.execute', v_location_id) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;

  v_business_date := operations.schedule_business_date(p_tenant_id, p_schedule_id, now());

  select ti.id, ti.status into v_instance_id, v_status
  from operations.task_instances ti
  where ti.tenant_id = p_tenant_id
    and ti.schedule_id = p_schedule_id
    and ti.business_date = v_business_date;

  if v_instance_id is null then
    raise exception 'operations_task_not_started' using errcode = 'P0001';
  end if;
  if v_status = 'completed' then
    raise exception 'operations_task_already_completed' using errcode = 'P0001';
  end if;

  select count(*)::int into v_missing
  from operations.checklist_items ci
  where ci.tenant_id = p_tenant_id
    and ci.template_id = v_template_id
    and ci.is_active
    and ci.is_required
    and not exists (
      select 1 from operations.item_responses r
      where r.tenant_id = p_tenant_id
        and r.instance_id = v_instance_id
        and r.item_id = ci.id
    );

  if v_missing > 0 then
    raise exception 'operations_required_items_incomplete' using errcode = 'P0001';
  end if;

  update operations.task_instances ti
    set status = 'completed', completed_at = now(), completed_by = v_user
  where ti.tenant_id = p_tenant_id and ti.id = v_instance_id;

  -- G1 (0116): clear any open critical_missed flag for this occurrence. Called
  -- on every completion; a no-op unless the window had already closed (which is
  -- the only way an open critical_missed row exists), i.e. it only ever fires
  -- for a genuine late completion. Never recreated (historical unique index).
  perform operations.close_missed_critical_on_completion(
    p_tenant_id, p_schedule_id, v_business_date
  );

  return query select v_instance_id, 'completed'::operations.instance_status;
end;
$$;
comment on function api.operations_complete_task(uuid, uuid) is
  'Complete today''s occurrence for a schedule. Blocked unless every active+required checklist item has a response, the caller holds operations.task.execute at the location, the module is ON, and the instance is in_progress. Open exceptions do NOT block completion (scope §12). A late completion (window already closed) resolves any open critical_missed exception for the occurrence (0116). SECURITY INVOKER.';

revoke all on function api.operations_complete_task(uuid, uuid) from public, anon;
grant execute on function api.operations_complete_task(uuid, uuid) to authenticated;

-- ============================================================================
-- 8. api.operations_expected_tasks — create-or-replace (4th revision).
--    SAME signature/return as 0104. ONLY change: open_exception_count also
--    counts the instance-less critical_missed rows for (schedule, business_date).
-- ============================================================================
create or replace function api.operations_expected_tasks(
  p_start date default (current_date - 7),
  p_end   date default (current_date + 14)
)
returns table (
  schedule_id          uuid,
  schedule_group_id    uuid,
  tenant_id            uuid,
  location_id          uuid,
  template_id          uuid,
  template_name        text,
  category             text,
  business_date        date,
  due_time             time,
  window_end_time      time,
  window_close_at      timestamptz,
  instance_id          uuid,
  status               operations.instance_status,
  state                text,
  is_overdue_critical  boolean,
  open_exception_count integer,
  completed_at         timestamptz
)
language sql
stable
set search_path = api, operations, core, public
as $$
  with bounds as (
    select
      greatest(coalesce(p_start, current_date - 7), current_date - 31) as d_start,
      least(coalesce(p_end, current_date + 14), current_date + 62)     as d_end
  ),
  sched as (
    select s.*, operations.location_timezone(s.tenant_id, s.location_id) as location_timezone
    from operations.task_schedules s
  ),
  cal as (
    select d::date as d
    from bounds b, generate_series(b.d_start, b.d_end, interval '1 day') as g(d)
  ),
  expected as (
    select s.id as schedule_id, c.d as business_date
    from sched s
    join operations.checklist_templates et
      on et.tenant_id = s.tenant_id and et.id = s.template_id
    join cal c
      on s.effective_from <= c.d
     and (s.effective_to is null or c.d <= s.effective_to)
     and (et.retired_on is null or c.d <= et.retired_on)
     and (
           s.recurrence_kind = 'daily'
        or (s.recurrence_kind = 'weekdays'
            and extract(isodow from c.d)::smallint = any (s.weekdays))
         )
  ),
  materialised as (
    select ti.schedule_id, ti.business_date
    from operations.task_instances ti
    join bounds b on ti.business_date between b.d_start and b.d_end
  ),
  periods as (
    select schedule_id, business_date from expected
    union
    select schedule_id, business_date from materialised
  )
  select
    s.id                       as schedule_id,
    s.schedule_group_id,
    s.tenant_id,
    s.location_id,
    s.template_id,
    t.name                     as template_name,
    t.category,
    p.business_date,
    s.due_time,
    s.window_end_time,
    (
      (case
         when s.window_end_time is null then (p.business_date + s.due_time)
         when s.window_end_time >= s.due_time then (p.business_date + s.window_end_time)
         else ((p.business_date + 1) + s.window_end_time)
       end) at time zone s.location_timezone
    )                          as window_close_at,
    ti.id                      as instance_id,
    ti.status,
    case
      when ti.status = 'completed' then 'completed'
      when ti.status = 'in_progress' then 'in_progress'
      when now() > (
        (case
           when s.window_end_time is null then (p.business_date + s.due_time)
           when s.window_end_time >= s.due_time then (p.business_date + s.window_end_time)
           else ((p.business_date + 1) + s.window_end_time)
         end) at time zone s.location_timezone
      ) then 'overdue'
      else 'not_started'
    end                        as state,
    (
      now() > (
        (case
           when s.window_end_time is null then (p.business_date + s.due_time)
           when s.window_end_time >= s.due_time then (p.business_date + s.window_end_time)
           else ((p.business_date + 1) + s.window_end_time)
         end) at time zone s.location_timezone
      )
      and coalesce(ti.status, 'in_progress') <> 'completed'
      and exists (
        select 1 from operations.checklist_items ci
        where ci.tenant_id = s.tenant_id
          and ci.template_id = s.template_id
          and ci.is_active
          and ci.is_critical
      )
    )                          as is_overdue_critical,
    coalesce((
      select count(*)::int from operations.task_exceptions te
      where te.tenant_id = s.tenant_id
        and te.status = 'open'
        and (
          (ti.id is not null and te.instance_id = ti.id)
          or (te.instance_id is null and te.schedule_id = s.id and te.business_date = p.business_date)
        )
    ), 0)                      as open_exception_count,
    ti.completed_at
  from periods p
  join sched s on s.id = p.schedule_id
  join operations.checklist_templates t
    on t.tenant_id = s.tenant_id and t.id = s.template_id
  left join operations.task_instances ti
    on ti.tenant_id = s.tenant_id
   and ti.schedule_id = p.schedule_id
   and ti.business_date = p.business_date;
$$;
comment on function api.operations_expected_tasks(date, date) is
  'Deterministic expected-task projection. A schedule version applies to a business date iff the date is inside its [effective_from, effective_to] range AND the template''s retirement boundary has not passed. Neither task_schedules.is_active nor checklist_templates.is_active is consulted. open_exception_count includes the instance-less critical_missed exception for the occurrence (0116). Horizon clamped to [current_date-31, current_date+62]. SECURITY INVOKER — task_schedules RLS is the tenant/location/module gate.';

revoke all on function api.operations_expected_tasks(date, date) from public, anon;
grant execute on function api.operations_expected_tasks(date, date) to authenticated;

-- ============================================================================
-- 9. api.operations_open_exceptions — create-or-replace: + schedule_id,
--    business_date APPENDED AT THE END (CREATE OR REPLACE VIEW can only add
--    trailing columns, never reorder existing ones) so the Attention UI can
--    resolve an instance-less exception to its task.
-- ============================================================================
create or replace view api.operations_open_exceptions
  with (security_invoker = true) as
select
  e.id            as exception_id,
  e.tenant_id,
  e.location_id,
  e.instance_id,
  e.item_id,
  e.severity,
  e.source,
  e.note,
  e.created_at,
  e.schedule_id,
  e.business_date
from operations.task_exceptions e
where e.status = 'open';
comment on view api.operations_open_exceptions is
  'Open operational exceptions — the Manager Attention feed (scope §8: only actionable exceptions). instance_id is NULL for an instance-less exception (source=critical_missed), which instead carries schedule_id + business_date. security_invoker.';

grant select on api.operations_open_exceptions to authenticated;
revoke all on api.operations_open_exceptions from anon, public;
