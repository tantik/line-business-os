-- ============================================================================
-- 0102  Operations — historical-expectation integrity via schedule versioning
-- ----------------------------------------------------------------------------
-- Follow-up to PR #460 (slice 2, migration 0101). 0101 shipped a correct
-- expected-task projection (schedule x calendar) with lazy instance
-- materialisation, but left one architectural integrity defect, confirmed by
-- reproduction against merged `dev`:
--
--   A Manager changing a schedule's recurrence/timing today, via a raw UPDATE
--   of the single task_schedules row, RETROACTIVELY rewrites what was an
--   operational obligation on a PAST business date for which no task_instance
--   was ever materialised. `api.operations_expected_tasks` evaluated every
--   date against the schedule's CURRENT columns.
--
-- Canonical requirement (scope §11, §13): later configuration changes MUST NOT
-- silently erase or rewrite a past operational obligation that existed at that
-- time — this is required Operations / future Cafe HACCP history.
--
-- FIX — effective-dated schedule versioning (smallest model compatible with
-- 0101):
--   * `schedule_group_id` — a stable logical-schedule identity across
--     versions (backfilled = id for existing rows). One logical schedule =
--     the rows sharing a schedule_group_id; historical query picks the
--     version whose [effective_from, effective_to] range contains the
--     business date.
--   * A version whose effective period has already begun is IMMUTABLE in its
--     recurrence / timing / identity (trigger). Recurrence changes are made
--     by INSERTing a NEW version for future periods; the current version's
--     end boundary is closed the day before. Only the end boundary may be
--     set / advanced, never pulled back to erase elapsed obligation.
--   * `EXCLUDE` constraint: no two versions of one logical schedule may have
--     overlapping effective ranges.
--   * `CHECK (is_active or effective_to is not null)`: a superseded / retired
--     version must carry an end boundary — it can never be "silently off
--     forever with no history boundary".
--   * `api.operations_expected_tasks` no longer gates on `task_schedules.is_active`
--     — historical applicability is the effective range alone. (Template
--     `is_active` still gates it — see the classification note below; template
--     effective-dating is a separate, deferred follow-up, not this defect.)
--   * Two write RPCs make the safe path the only path:
--       api.operations_revise_schedule(...)     — atomic close-old + create-new-version
--       api.operations_deactivate_schedule(...) — retire at a boundary (no history loss)
--     Raw client UPDATE of a started version's recurrence is blocked by the
--     trigger regardless.
--
-- HISTORICAL ANALYSIS of the other config surfaces (scope §11):
--   * template name / item label edits      -> SAFE TO MUTATE (the recorded
--       response value is the durable fact; exact historical wording is
--       explicitly deferred, design §T).
--   * item is_active / is_required changes  -> ALREADY PRESERVED — the
--       completion gate and projection are schedule-level; past
--       item_responses keep their item_id + value.
--   * numeric_min / numeric_max changes     -> ALREADY PRESERVED — a threshold
--       violation is a persisted operations.task_exceptions row written at
--       record time (0101). Changing the range later does not touch it.
--       Proven by a regression test (0048).
--   * response_type change                  -> MUST PRESERVE; today only
--       reachable by raw UPDATE of checklist_items (no tenant-facing write
--       path in this or prior slices). The future config slice must version
--       or forbid it. Tracked, not fixed here (no exposed path to defend).
--   * checklist_templates.is_active = false -> retroactively hides past
--       NON-materialised expected occurrences (same defect class, smaller
--       blast radius). NOT fixed here — needs template effective-dating.
--       Tracked as a follow-up. Materialised history is unaffected.
--
-- NO cron / job / Event Bus / event-sourcing / snapshot JSON / pre-materialised
-- instances. NO edit to 0099 / 0100 / 0101. NO Cloud apply. Additive only;
-- no row is deleted; no historical Operations data is dropped.
--
-- Rollback:
--   drop function if exists api.operations_deactivate_schedule(uuid, uuid, date);
--   drop function if exists api.operations_revise_schedule(uuid, uuid, operations.recurrence_kind, smallint[], time, time, date);
--   drop trigger if exists task_schedules_history_guard on operations.task_schedules;
--   drop function if exists operations.task_schedules_history_guard();
--   alter table operations.task_schedules drop constraint if exists operations_task_schedules_no_overlap;
--   alter table operations.task_schedules drop constraint if exists operations_task_schedules_retired_has_end;
--   alter table operations.task_schedules drop column if exists schedule_group_id;
--   -- then re-apply 0101's api.operations_expected_tasks definition
--   (the 0101 body is restored by checking out 0101 — this migration only
--    replaces the function, it does not delete 0101's file).
-- ============================================================================

-- --- schedule_group_id: stable logical identity across versions -----------
alter table operations.task_schedules
  add column if not exists schedule_group_id uuid;

update operations.task_schedules
  set schedule_group_id = id
  where schedule_group_id is null;

alter table operations.task_schedules
  alter column schedule_group_id set not null,
  alter column schedule_group_id set default gen_random_uuid();

create index if not exists operations_task_schedules_group_idx
  on operations.task_schedules(tenant_id, schedule_group_id, effective_from);

comment on column operations.task_schedules.schedule_group_id is
  'Stable identity of one LOGICAL schedule across its effective-dated versions. Rows sharing this value are the version history of a single schedule; at most one version''s effective range contains any given date (EXCLUDE constraint).';

-- --- integrity constraints ------------------------------------------------
-- A retired / superseded version must carry an end boundary. This is what
-- makes "drop task_schedules.is_active from the projection" safe: an
-- is_active=false version is bounded, so it stops projecting future dates at
-- its boundary while keeping every past date it really covered.
alter table operations.task_schedules
  add constraint operations_task_schedules_retired_has_end
  check (is_active or effective_to is not null);

-- No two versions of one logical schedule may overlap in effective time.
-- (daterange treats a NULL bound as unbounded, so an open-ended current
-- version is [effective_from, infinity).)
create extension if not exists btree_gist;
alter table operations.task_schedules
  add constraint operations_task_schedules_no_overlap
  exclude using gist (
    tenant_id with =,
    schedule_group_id with =,
    daterange(effective_from, effective_to, '[]') with &&
  );

-- --- history guard: a started version is immutable in recurrence/timing ---
create or replace function operations.task_schedules_history_guard()
returns trigger language plpgsql as $$
begin
  -- Once a version's effective period has begun, its recurrence / timing /
  -- identity can never change — a change is a NEW version
  -- (api.operations_revise_schedule). The end boundary may only be set or
  -- advanced (retirement), never pulled back to erase an already-elapsed
  -- operational obligation.
  if old.effective_from <= current_date then
    if new.recurrence_kind   is distinct from old.recurrence_kind
       or new.weekdays        is distinct from old.weekdays
       or new.due_time        is distinct from old.due_time
       or new.window_end_time is distinct from old.window_end_time
       or new.effective_from  is distinct from old.effective_from
       or new.template_id     is distinct from old.template_id
       or new.location_id     is distinct from old.location_id
       or new.schedule_group_id is distinct from old.schedule_group_id
       or new.tenant_id       is distinct from old.tenant_id then
      raise exception 'operations_started_schedule_version_immutable' using errcode = 'P0001';
    end if;
    if new.effective_to is distinct from old.effective_to then
      if new.effective_to is null then
        raise exception 'operations_schedule_cannot_unretire' using errcode = 'P0001';
      end if;
      if new.effective_to < greatest(old.effective_from, current_date - 1)
         or (old.effective_to is not null and new.effective_to < old.effective_to) then
        raise exception 'operations_schedule_effective_to_retroactive' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;
comment on function operations.task_schedules_history_guard() is
  'BEFORE UPDATE on operations.task_schedules: a version whose effective_from has passed is immutable in recurrence/timing/identity; its effective_to may only be set or moved forward, never pulled back before current_date-1 or before a prior end. Blocks raw retroactive rewrites of operational obligation.';

drop trigger if exists task_schedules_history_guard on operations.task_schedules;
create trigger task_schedules_history_guard
  before update on operations.task_schedules
  for each row execute function operations.task_schedules_history_guard();

-- --- grants: the SECURITY INVOKER config RPCs act as the caller ----------
grant insert, update on operations.task_schedules to authenticated;
revoke all on operations.task_schedules from anon, public;
grant select on operations.task_schedules to authenticated;

-- ============================================================================
-- api.operations_expected_tasks — rebuilt (drop+create: the return type gains
-- schedule_group_id). Only two behavioural changes vs 0101:
--   * historical applicability of a schedule version = its effective range
--     alone; `task_schedules.is_active` is NOT consulted (a bounded,
--     is_active=false version still covers every past date inside its range,
--     and covers no date after effective_to).
--   * emits schedule_group_id so a consumer can see version history as one
--     logical schedule.
-- Everything else (timezone, overnight windows, horizon clamp, materialised
-- UNION, overdue derivation, RLS as the tenant/location/module gate) is
-- unchanged from 0101.
-- ============================================================================
drop function if exists api.operations_expected_tasks(date, date);
create function api.operations_expected_tasks(
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
      on et.tenant_id = s.tenant_id and et.id = s.template_id and et.is_active
    join cal c
      on s.effective_from <= c.d
     and (s.effective_to is null or c.d <= s.effective_to)
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
        and te.instance_id = ti.id
        and te.status = 'open'
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
  'Deterministic expected-task projection. A schedule version applies to a business date iff that date is inside its [effective_from, effective_to] range — task_schedules.is_active is NOT consulted, so a retired/superseded version still reports every past date it covered and no date after its boundary. Horizon clamped to [current_date-31, current_date+62] in the body. SECURITY INVOKER — task_schedules RLS is the tenant/location/module gate.';

revoke all on function api.operations_expected_tasks(date, date) from public, anon;
grant execute on function api.operations_expected_tasks(date, date) to authenticated;

-- ============================================================================
-- api.operations_revise_schedule — atomic recurrence/timing change as a NEW
-- effective-dated version. The current (open-ended, active) version is closed
-- the day before the new version starts; the new version shares the
-- schedule_group_id. Default boundary = next business date (scope §9 MVP rule)
-- — a revision can never take effect on a date that is already in the past or
-- inside the current version's already-elapsed span.
-- ============================================================================
create or replace function api.operations_revise_schedule(
  p_tenant_id       uuid,
  p_schedule_id     uuid,
  p_recurrence_kind operations.recurrence_kind,
  p_weekdays        smallint[] default null,
  p_due_time        time       default null,
  p_window_end_time time       default null,
  p_effective_from  date       default null
)
returns table (
  schedule_id            uuid,
  schedule_group_id      uuid,
  effective_from         date,
  superseded_schedule_id uuid
)
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user       uuid := core.current_user_id();
  v_group      uuid;
  v_location   uuid;
  v_template   uuid;
  v_cur_from   date;
  v_cur_to     date;
  v_cur_active boolean;
  v_cur_due    time;
  v_boundary   date;
  v_new_id     uuid;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select s.schedule_group_id, s.location_id, s.template_id,
         s.effective_from, s.effective_to, s.is_active, s.due_time
    into v_group, v_location, v_template, v_cur_from, v_cur_to, v_cur_active, v_cur_due
  from operations.task_schedules s
  where s.tenant_id = p_tenant_id and s.id = p_schedule_id;

  if v_group is null then
    raise exception 'operations_schedule_not_found' using errcode = 'P0002';
  end if;
  if not core.has_permission(p_tenant_id, 'operations.template.manage', v_location) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;
  if not v_cur_active or v_cur_to is not null then
    raise exception 'operations_schedule_not_current_version' using errcode = 'P0001';
  end if;

  v_boundary := coalesce(p_effective_from, current_date + 1);
  if v_boundary <= current_date then
    raise exception 'operations_schedule_revision_must_be_future' using errcode = 'P0001';
  end if;
  if v_boundary <= v_cur_from then
    raise exception 'operations_schedule_revision_before_current_version' using errcode = 'P0001';
  end if;

  -- close the current version the day before the new one takes effect
  update operations.task_schedules
    set effective_to = v_boundary - 1, is_active = false, updated_at = now()
  where tenant_id = p_tenant_id and id = p_schedule_id;

  -- new version — table CHECKs validate recurrence_kind/weekdays/window; the
  -- EXCLUDE constraint rejects any overlap with a sibling version.
  insert into operations.task_schedules
    (tenant_id, location_id, template_id, schedule_group_id, recurrence_kind,
     weekdays, due_time, window_end_time, effective_from, effective_to, is_active)
  values
    (p_tenant_id, v_location, v_template, v_group, p_recurrence_kind,
     p_weekdays, coalesce(p_due_time, v_cur_due), p_window_end_time,
     v_boundary, null, true)
  returning id into v_new_id;

  return query select v_new_id, v_group, v_boundary, p_schedule_id;
end;
$$;
comment on function api.operations_revise_schedule(uuid, uuid, operations.recurrence_kind, smallint[], time, time, date) is
  'Revise a schedule''s recurrence/timing by creating a NEW effective-dated version (default: from next business date) and closing the current one the day before. Never mutates a version whose effective period has begun — past expectation is preserved. Requires operations.template.manage at the schedule''s location + module ON. SECURITY INVOKER.';

revoke all on function api.operations_revise_schedule(uuid, uuid, operations.recurrence_kind, smallint[], time, time, date) from public, anon;
grant execute on function api.operations_revise_schedule(uuid, uuid, operations.recurrence_kind, smallint[], time, time, date) to authenticated;

-- ============================================================================
-- api.operations_deactivate_schedule — retire a schedule at a boundary without
-- erasing history. effective_to defaults to today (the schedule stops
-- producing expected tasks from tomorrow); a retroactive boundary is rejected.
-- Only a version whose effective period has already begun can be retired this
-- way — cancelling a not-yet-effective future version is left to the future
-- config slice (it can DELETE such a row since it has no history).
-- ============================================================================
create or replace function api.operations_deactivate_schedule(
  p_tenant_id   uuid,
  p_schedule_id uuid,
  p_effective_to date default null
)
returns table (schedule_id uuid, effective_to date)
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user     uuid := core.current_user_id();
  v_location uuid;
  v_from     date;
  v_to       date;
  v_end      date;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select s.location_id, s.effective_from, s.effective_to
    into v_location, v_from, v_to
  from operations.task_schedules s
  where s.tenant_id = p_tenant_id and s.id = p_schedule_id;

  if v_location is null then
    raise exception 'operations_schedule_not_found' using errcode = 'P0002';
  end if;
  if not core.has_permission(p_tenant_id, 'operations.template.manage', v_location) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;
  if v_to is not null then
    raise exception 'operations_schedule_already_retired' using errcode = 'P0001';
  end if;
  if v_from > current_date then
    raise exception 'operations_schedule_not_yet_effective' using errcode = 'P0001';
  end if;

  v_end := coalesce(p_effective_to, current_date);
  if v_end < current_date then
    raise exception 'operations_schedule_deactivation_retroactive' using errcode = 'P0001';
  end if;

  update operations.task_schedules
    set effective_to = v_end, is_active = false, updated_at = now()
  where tenant_id = p_tenant_id and id = p_schedule_id;

  return query select p_schedule_id, v_end;
end;
$$;
comment on function api.operations_deactivate_schedule(uuid, uuid, date) is
  'Retire a schedule at an effective_to boundary (default today; retroactive rejected). Past expected occurrences are preserved; future ones stop after the boundary. Requires operations.template.manage at the location + module ON. SECURITY INVOKER.';

revoke all on function api.operations_deactivate_schedule(uuid, uuid, date) from public, anon;
grant execute on function api.operations_deactivate_schedule(uuid, uuid, date) to authenticated;
