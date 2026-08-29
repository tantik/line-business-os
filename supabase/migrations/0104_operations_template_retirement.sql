-- ============================================================================
-- 0104  Operations — template historical-expectation integrity via retirement
--       dating
-- ----------------------------------------------------------------------------
-- Follow-up to PR #462 / #463 (migrations 0102 / 0103). 0102 closed the
-- historical-expectation defect for SCHEDULE configuration changes via
-- effective-dated schedule versioning; it explicitly left one sibling defect
-- of the SAME class open (0102 header, classification note):
--
--   A Manager deactivating a checklist_template today (is_active = false)
--   RETROACTIVELY hides what was an operational obligation on a PAST business
--   date for which no task_instance was ever materialised.
--   `api.operations_expected_tasks` gated the `expected` projection on
--   `checklist_templates.is_active` — a single mutable boolean evaluated
--   against every historical date.
--
-- CONFIRMED by reproduction against `dev` (0102/0103 applied):
--   Day 1  active template + active daily schedule, window 09:00-10:00,
--          nobody opens ORUWA, no task_instance, window expires.
--          api.operations_expected_tasks(Day1, Day1) -> 1 row, state='overdue'.
--   Day 2  UPDATE checklist_templates SET is_active = false.
--          api.operations_expected_tasks(Day1, Day1) -> 0 rows.  <-- history erased
--
-- Canonical requirement (scope §11, §13; mission §3): later configuration
-- changes MUST NOT silently erase or rewrite a past operational obligation
-- that existed at that time. Required Operations / future Cafe HACCP history.
--
-- FIX — retirement dating for templates, the direct analogue of 0102's
-- schedule effective-dating (smallest model that satisfies BOTH directions:
-- past obligation preserved AND legitimate future retirement still stops task
-- generation):
--
--   * `checklist_templates.retired_on date` (nullable) — the LAST business
--     date this template may generate expected tasks. NULL = not retired.
--     This is the template-level equivalent of `task_schedules.effective_to`.
--   * `CHECK (is_active or retired_on is not null)` — a deactivated template
--     must carry a retirement boundary; it can never be "silently off forever
--     with no history boundary". This is exactly what makes dropping
--     `is_active` from the projection SAFE (mirrors 0102's
--     `operations_task_schedules_retired_has_end`).
--   * `BEFORE UPDATE` trigger `operations.checklist_templates_history_guard()`
--     — `retired_on` may be set or advanced, never set into the past and
--     never pulled back / cleared once it has elapsed. Blocks a raw
--     retroactive rewrite of the template's operational history on every write
--     path (fires for every role, unlike RLS). Mirrors
--     `operations.task_schedules_history_guard()`. Once `retired_on` has
--     itself elapsed it is fully frozen (no pull-back, no clear, no
--     forward-advance — the last would fabricate missed history).
--   * `api.operations_expected_tasks` (create-or-replace; SAME signature and
--     return type as 0102) — the `expected` projection no longer consults
--     `checklist_templates.is_active`. A template applies to a business date
--     iff `retired_on is null OR d <= retired_on`. A retired template still
--     reports every past date it covered (history preserved) and no date
--     after its boundary (retirement still works). Everything else (timezone,
--     overnight windows, horizon clamp, `expected UNION materialised`, overdue
--     derivation, schedule effective-range gate, RLS as the
--     tenant/location/module gate) is UNCHANGED from 0102.
--
-- NO write RPC is added here. There is currently NO tenant-facing write path
-- to `checklist_templates` at all (0100 grants `select` only; the RLS write
-- policies are defence-in-depth). Setting `retired_on` alongside `is_active`
-- is the job of the future Operations Configuration API slice — which this
-- migration constrains: the CHECK + guard make it impossible for that slice
-- to deactivate a template without recording a non-retroactive boundary.
--
-- Item-level config surfaces (`checklist_items.response_type` / `is_critical`
-- / `is_required` / `label` / numeric range) are NOT touched here — see the
-- classification in the mission report. Their durable protection is either
-- already in place (0101 persists `item_responses.item_id` + value and writes
-- `task_exceptions` at record time — regression-tested in 0048 §20) or is
-- explicitly deferred to the config slice (`response_type` freeze).
--
-- NO cron / job / Event Bus / event-sourcing / snapshot JSON / generic
-- temporal framework / form versioning / pre-materialised instances. NO edit
-- to 0099-0103. NO Cloud apply. Additive only; no row deleted; no historical
-- Operations data dropped.
--
-- Rollback:
--   drop function if exists api.operations_expected_tasks(date, date);
--   -- then re-apply 0102's api.operations_expected_tasks body
--   drop trigger if exists checklist_templates_history_guard on operations.checklist_templates;
--   drop function if exists operations.checklist_templates_history_guard();
--   alter table operations.checklist_templates drop constraint if exists operations_checklist_templates_retired_has_end;
--   alter table operations.checklist_templates drop column if exists retired_on;
-- ============================================================================

-- --- retired_on: template-level operational-history boundary ---------------
alter table operations.checklist_templates
  add column if not exists retired_on date;

comment on column operations.checklist_templates.retired_on is
  'Last business date this template may generate expected tasks (template-level equivalent of task_schedules.effective_to). NULL = not retired. Set/advanced only, never retroactively (guard trigger). api.operations_expected_tasks derives historical applicability from this boundary, NOT from is_active.';

-- A deactivated template must carry a retirement boundary — it can never be
-- "off forever with no history boundary". This is what makes it safe for the
-- projection to stop consulting is_active. (Mirrors 0102's
-- operations_task_schedules_retired_has_end for schedule versions.)
alter table operations.checklist_templates
  add constraint operations_checklist_templates_retired_has_end
  check (is_active or retired_on is not null);

-- --- history guard: retired_on is set/advanced only, never retroactive ----
create or replace function operations.checklist_templates_history_guard()
returns trigger language plpgsql as $$
begin
  -- retired_on is an operational-history boundary.
  if new.retired_on is distinct from old.retired_on then
    -- (1) it may never be set to a date already in the past — that would
    --     erase an operational obligation that has already elapsed.
    if new.retired_on is not null and new.retired_on < current_date then
      raise exception 'operations_template_retire_retroactive' using errcode = 'P0001';
    end if;
    -- (2) once a retirement boundary has itself elapsed, it is FROZEN — it
    --     cannot be pulled back, cleared (un-retire), or pushed forward.
    --     Pushing it forward would retroactively fabricate missed/overdue
    --     history for the gap days on which no obligation existed (review P2).
    --     Resuming a retired template is a configuration-slice concern
    --     (a new template / an explicit forward-only resume mechanism), not
    --     a mutation of frozen history.
    if old.retired_on is not null and old.retired_on < current_date then
      raise exception 'operations_template_retirement_elapsed_frozen' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
comment on function operations.checklist_templates_history_guard() is
  'BEFORE UPDATE on operations.checklist_templates: retired_on may be set or advanced while still in the future, never set into the past; once it has elapsed it is frozen (no pull-back, clear, or forward-advance — the last would fabricate missed history). Blocks raw retroactive rewrites of a template''s operational history on every write path. Mirrors operations.task_schedules_history_guard().';

drop trigger if exists checklist_templates_history_guard on operations.checklist_templates;
create trigger checklist_templates_history_guard
  before update on operations.checklist_templates
  for each row execute function operations.checklist_templates_history_guard();

-- ============================================================================
-- api.operations_expected_tasks — rebuilt (create-or-replace; SAME signature
-- and return type as 0102). ONE behavioural change vs 0102:
--   * the `expected` projection no longer joins on
--     `checklist_templates.is_active`. A template applies to a business date
--     iff `retired_on is null OR d <= retired_on`. A retired/deactivated
--     template still reports every past date it covered and no date after its
--     boundary.
-- Everything else is byte-for-byte the 0102 body.
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
  'Deterministic expected-task projection. A schedule version applies to a business date iff the date is inside its [effective_from, effective_to] range AND the template''s retirement boundary has not passed (retired_on is null or d <= retired_on). Neither task_schedules.is_active nor checklist_templates.is_active is consulted — a retired/superseded schedule version or a retired template still reports every past date it covered and no date after its boundary. Horizon clamped to [current_date-31, current_date+62] in the body. SECURITY INVOKER — task_schedules RLS is the tenant/location/module gate.';

revoke all on function api.operations_expected_tasks(date, date) from public, anon;
grant execute on function api.operations_expected_tasks(date, date) to authenticated;
