-- ============================================================================
-- 0101  Operations module — scheduling & execution slice (Cafe v2.2 WP1-A, slice 2)
-- ----------------------------------------------------------------------------
-- SECOND implementation slice of WP1 Operations. Builds on 0099 (enum value)
-- and 0100 (operations schema, 4 enums, checklist_templates + checklist_items,
-- 4 permissions + role seed, module-gated RLS).
--
--   * product scope  docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md
--   * technical design docs/ai/CAFE_V2_2_WP1_A_OPERATIONS_TECHNICAL_DESIGN_2026-08-28.md
--     (§B3..B6, §E..§J, §L..§O, §Q row 0101)
--
-- SCOPE OF THIS MIGRATION:
--   * operations.task_schedules   — binds a template to a location + a simple
--                                   recurrence (daily / selected weekdays) +
--                                   an operational time / window.
--   * operations.task_instances   — one concrete execution occurrence,
--                                   materialised LAZILY on first interaction.
--   * operations.item_responses   — structured response per item within an
--                                   instance (boolean / numeric / text).
--   * operations.task_exceptions  — operational problem, lifecycle (open ->
--                                   resolved) DISTINCT from task lifecycle.
--   * api.operations_expected_tasks(p_start, p_end) — deterministic
--     "what is expected for the caller's locations between two dates",
--     derived purely from task_schedules + the calendar. Needs NO stored
--     instance row for a task to be "expected" (scope §11 invariant). Horizon
--     is clamped INSIDE the function body (design P1-3).
--   * api.operations_task_instances / api.operations_item_responses /
--     api.operations_open_exceptions — security_invoker read views.
--   * api.operations_record_response / api.operations_complete_task /
--     api.operations_report_problem / api.operations_resolve_exception —
--     SECURITY INVOKER write RPCs. RLS is the real authorization boundary;
--     each RPC additionally raises a distinguishable error early on
--     module-OFF / permission / lifecycle violations.
--
-- TIMEZONE (scope §6 / mission §6): business time is evaluated in the
--   LOCATION timezone — core.locations.timezone (text, NOT NULL, default
--   'Asia/Tokyo', migration 0002). That is the canonical, already-existing
--   timezone source; this migration reuses it and invents nothing.
--
-- RECURRENCE (scope §11): typed columns only — recurrence_kind in
--   (daily, weekdays), weekdays smallint[] (ISO 1..7), due_time, optional
--   window_end_time. No RRULE, no cron, no scheduled job, no DSL, no monthly,
--   no holiday calendar.
--
-- HISTORY IS NOT DESTRUCTIBLE (design P1-1): every FK from task_instances /
--   item_responses / task_exceptions is ON DELETE RESTRICT. task_schedules ->
--   checklist_templates is also RESTRICT (retire a schedule via is_active /
--   effective_to, never DELETE while instances reference it). Only
--   core.tenants ON DELETE CASCADE (whole-tenant offboarding) cascades.
--
-- MISSED / OVERDUE WITHOUT AN INSTANCE (scope §11, mission §11): derived, not
--   persisted in this slice. api.operations_expected_tasks returns
--   state='overdue' for an expected (schedule x date) with no completed
--   instance and an expired window — computed at query time for any horizon,
--   with no row and no job. task_exceptions.source keeps the
--   'critical_missed' / 'verification_required' values for a future slice;
--   NOTHING in this migration writes them.
--
-- NO WORKFORCE DEPENDENCY (scope §8): every actor column references
--   core.users(id). Operations works with Workforce OFF.
--
-- NO Cloud apply. RED path (supabase/migrations/**) — PR left for Founder merge.
--
-- Rollback:
--   drop function if exists api.operations_resolve_exception(uuid, uuid, text);
--   drop function if exists api.operations_report_problem(uuid, uuid, uuid, text, text);
--   drop function if exists api.operations_complete_task(uuid, uuid);
--   drop function if exists api.operations_record_response(uuid, uuid, uuid, boolean, numeric, text);
--   drop view if exists api.operations_open_exceptions;
--   drop view if exists api.operations_item_responses;
--   drop view if exists api.operations_task_instances;
--   drop function if exists api.operations_expected_tasks(date, date);
--   drop function if exists operations.schedule_business_date(uuid, uuid, timestamptz);
--   drop function if exists operations.location_timezone(uuid, uuid);
--   drop function if exists operations.task_exceptions_guard();
--   drop function if exists operations.item_responses_guard();
--   drop table if exists operations.task_exceptions;
--   drop table if exists operations.item_responses;
--   drop table if exists operations.task_instances;
--   drop table if exists operations.task_schedules;
-- Purely additive; no existing object is modified; no data is deleted.
-- ============================================================================

-- ============================================================================
-- operations.task_schedules — template -> location -> recurrence -> window
-- ============================================================================
create table if not exists operations.task_schedules (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenants(id) on delete cascade,
  location_id      uuid not null,
  template_id      uuid not null,
  recurrence_kind  operations.recurrence_kind not null,
  weekdays         smallint[],                 -- ISO 1..7; required for 'weekdays', null for 'daily'
  due_time         time not null,              -- local wall time at the location's timezone (window open)
  window_end_time  time,                       -- optional operational-window close (may be < due_time => crosses midnight)
  effective_from   date not null default current_date,
  effective_to     date,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint operations_task_schedules_tenant_id_id_key unique (tenant_id, id),
  constraint operations_task_schedules_location_fkey
    foreign key (tenant_id, location_id) references core.locations(tenant_id, id),
  constraint operations_task_schedules_template_fkey
    foreign key (tenant_id, template_id)
    references operations.checklist_templates(tenant_id, id) on delete restrict,
  constraint operations_task_schedules_weekdays_chk
    check (
      recurrence_kind <> 'weekdays'
      or (weekdays is not null
          and array_length(weekdays, 1) between 1 and 7
          and weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
    ),
  constraint operations_task_schedules_daily_chk
    check (recurrence_kind <> 'daily' or weekdays is null),
  constraint operations_task_schedules_effective_chk
    check (effective_to is null or effective_to >= effective_from)
);
create index if not exists operations_task_schedules_tenant_idx
  on operations.task_schedules(tenant_id, location_id, is_active);
comment on table operations.task_schedules is
  'Binds a checklist_template to a location with a simple recurrence (daily / selected ISO weekdays) and an operational time/window. Retire via is_active=false / effective_to — never hard-deleted while task_instances reference it (design P1-1).';

-- ============================================================================
-- operations.task_instances — one concrete occurrence (materialised lazily, §E/§J)
-- ============================================================================
create table if not exists operations.task_instances (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants(id) on delete cascade,
  location_id    uuid not null,
  schedule_id    uuid not null,
  template_id    uuid not null,   -- denormalised for history stability + parent-consistency (design P2-1)
  business_date  date not null,   -- operational period (location-local date the window OPENS), design P1-2
  status         operations.instance_status not null default 'in_progress',
  started_at     timestamptz not null default now(),
  started_by     uuid not null references core.users(id),
  completed_at   timestamptz,
  completed_by   uuid references core.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint operations_task_instances_tenant_id_id_key unique (tenant_id, id),
  constraint operations_task_instances_occurrence_key unique (tenant_id, schedule_id, business_date),
  constraint operations_task_instances_location_fkey
    foreign key (tenant_id, location_id) references core.locations(tenant_id, id),
  constraint operations_task_instances_schedule_fkey
    foreign key (tenant_id, schedule_id)
    references operations.task_schedules(tenant_id, id) on delete restrict,
  constraint operations_task_instances_template_fkey
    foreign key (tenant_id, template_id)
    references operations.checklist_templates(tenant_id, id) on delete restrict,
  constraint operations_task_instances_completed_chk
    check ((status = 'completed') = (completed_at is not null)),
  constraint operations_task_instances_completed_by_chk
    check (completed_by is null or completed_at is not null)
);
create index if not exists operations_task_instances_lookup_idx
  on operations.task_instances(tenant_id, location_id, business_date);
comment on table operations.task_instances is
  'A real execution occurrence for one (schedule, business_date). Created lazily by an api.* RPC on first interaction — expectation of a task does NOT depend on this row existing (see api.operations_expected_tasks). status: in_progress -> completed only (minimal lifecycle, scope §12). ''pending'' is reserved for a future pre-materialisation path.';

-- ============================================================================
-- operations.item_responses — structured response per item within an instance
-- ============================================================================
create table if not exists operations.item_responses (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenants(id) on delete cascade,
  location_id       uuid not null,   -- denormalised from the instance for RLS location-scoping
  instance_id       uuid not null,
  item_id           uuid not null,
  response_bool     boolean,
  response_numeric  numeric,
  response_text     text,
  recorded_by       uuid not null references core.users(id),
  recorded_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint operations_item_responses_tenant_id_id_key unique (tenant_id, id),
  constraint operations_item_responses_one_per_item_key unique (tenant_id, instance_id, item_id),
  constraint operations_item_responses_location_fkey
    foreign key (tenant_id, location_id) references core.locations(tenant_id, id),
  constraint operations_item_responses_instance_fkey
    foreign key (tenant_id, instance_id)
    references operations.task_instances(tenant_id, id) on delete restrict,
  constraint operations_item_responses_item_fkey
    foreign key (tenant_id, item_id)
    references operations.checklist_items(tenant_id, id) on delete restrict,
  constraint operations_item_responses_exactly_one_chk
    check (
      (response_bool is not null)::int
      + (response_numeric is not null)::int
      + (response_text is not null)::int
      = 1
    )
);
create index if not exists operations_item_responses_instance_idx
  on operations.item_responses(tenant_id, instance_id);
comment on table operations.item_responses is
  'One current structured response per (instance, item). Numeric measurements stored as numeric, never text (scope §6). A corrective UPDATE is allowed while the instance is not yet completed; after completion the response is immutable (trigger). Parent-consistency (item belongs to the instance''s template) enforced by trigger (design P2-1).';

-- ============================================================================
-- operations.task_exceptions — operational problem, lifecycle distinct from task
-- ============================================================================
create table if not exists operations.task_exceptions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenants(id) on delete cascade,
  location_id      uuid not null,
  instance_id      uuid not null,
  item_id          uuid,            -- null = instance-level problem / report
  severity         text not null check (severity in ('warning', 'action_required')),   -- D4
  source           text not null check (source in ('threshold', 'critical_missed', 'reported', 'verification_required')),
  note             text,
  status           operations.exception_status not null default 'open',
  resolved_by      uuid references core.users(id),
  resolved_at      timestamptz,
  resolution_note  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint operations_task_exceptions_tenant_id_id_key unique (tenant_id, id),
  constraint operations_task_exceptions_location_fkey
    foreign key (tenant_id, location_id) references core.locations(tenant_id, id),
  constraint operations_task_exceptions_instance_fkey
    foreign key (tenant_id, instance_id)
    references operations.task_instances(tenant_id, id) on delete restrict,
  constraint operations_task_exceptions_item_fkey
    foreign key (tenant_id, item_id)
    references operations.checklist_items(tenant_id, id) on delete restrict,
  constraint operations_task_exceptions_resolved_chk
    check ((status = 'resolved') = (resolved_at is not null)),
  constraint operations_task_exceptions_resolved_by_chk
    check (resolved_by is null or resolved_at is not null)
);
create index if not exists operations_task_exceptions_open_idx
  on operations.task_exceptions(tenant_id, location_id) where status = 'open';
-- One OPEN exception per (instance, item, source) — keeps a repeated
-- out-of-range re-record from stacking duplicate open threshold rows, while
-- still allowing a fresh one after the previous was resolved.
create unique index if not exists operations_task_exceptions_one_open_idx
  on operations.task_exceptions(tenant_id, instance_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
  where status = 'open';
comment on table operations.task_exceptions is
  'An operational problem attached to a task_instance. Lifecycle open -> resolved, by a different actor at a different time than task completion (scope §12). source: threshold (numeric out of range), reported (Staff), critical_missed / verification_required (reserved for a later slice — not written here). severity per D4.';

-- --- updated_at triggers -------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'operations.task_schedules', 'operations.task_instances',
    'operations.item_responses', 'operations.task_exceptions'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on %s; '
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t, t);
  end loop;
end $$;

-- --- item_responses: parent-consistency + post-completion immutability ---
create or replace function operations.item_responses_guard()
returns trigger language plpgsql as $$
declare
  v_instance_template uuid;
  v_instance_location uuid;
  v_instance_status   operations.instance_status;
  v_item_template     uuid;
begin
  select ti.template_id, ti.location_id, ti.status
    into v_instance_template, v_instance_location, v_instance_status
  from operations.task_instances ti
  where ti.tenant_id = new.tenant_id and ti.id = new.instance_id;

  if v_instance_template is null then
    raise exception 'operations_instance_not_found' using errcode = 'P0002';
  end if;

  select ci.template_id into v_item_template
  from operations.checklist_items ci
  where ci.tenant_id = new.tenant_id and ci.id = new.item_id;

  if v_item_template is null or v_item_template <> v_instance_template then
    raise exception 'operations_item_not_in_instance_template' using errcode = 'P0001';
  end if;

  if new.location_id <> v_instance_location then
    raise exception 'operations_response_location_mismatch' using errcode = 'P0001';
  end if;

  if v_instance_status = 'completed' then
    -- Immutable after completion: neither a new response row nor an edit to an
    -- existing one (scope §19). The RPC path already blocks this earlier; this
    -- is the data-level backstop for both INSERT and UPDATE.
    raise exception 'operations_response_immutable_after_completion' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
comment on function operations.item_responses_guard() is
  'BEFORE INSERT/UPDATE on operations.item_responses: (1) the item must belong to the same template the instance runs (design P2-1); (2) denormalised location_id must match the instance; (3) no INSERT or UPDATE once the instance is completed (scope §19 immutability).';

drop trigger if exists item_responses_guard on operations.item_responses;
create trigger item_responses_guard
  before insert or update on operations.item_responses
  for each row execute function operations.item_responses_guard();

-- --- task_exceptions: denormalised location_id must match the instance -----
-- Symmetric with item_responses_guard: a forged/mismatched location_id would
-- (within one tenant, across locations) let a caller with task.execute at
-- location L1 attach an exception to an L2 instance and pollute the L2
-- Attention feed. Cross-tenant is already blocked by the composite FK.
create or replace function operations.task_exceptions_guard()
returns trigger language plpgsql as $$
declare
  v_instance_location uuid;
begin
  select ti.location_id into v_instance_location
  from operations.task_instances ti
  where ti.tenant_id = new.tenant_id and ti.id = new.instance_id;

  if v_instance_location is null then
    raise exception 'operations_instance_not_found' using errcode = 'P0002';
  end if;
  if new.location_id <> v_instance_location then
    raise exception 'operations_exception_location_mismatch' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
comment on function operations.task_exceptions_guard() is
  'BEFORE INSERT/UPDATE on operations.task_exceptions: the denormalised location_id must equal the parent instance''s location_id (within-tenant cross-location integrity; cross-tenant is the composite FK''s job).';

drop trigger if exists task_exceptions_guard on operations.task_exceptions;
create trigger task_exceptions_guard
  before insert or update on operations.task_exceptions
  for each row execute function operations.task_exceptions_guard();

-- ============================================================================
-- Helper functions
-- ============================================================================

-- The operational period (location-local calendar date the window OPENS) for a
-- schedule at a given instant. Cross-midnight rule (design P1-2): a task
-- performed inside a window that opened yesterday (window_end_time < due_time
-- and current local time is before window_end_time) is dated to the day the
-- window opened. SECURITY DEFINER: pure date math, must resolve the schedule
-- + location row regardless of the caller's RLS view (the calling RPC has
-- already checked permission).
create or replace function operations.schedule_business_date(
  p_tenant_id uuid,
  p_schedule_id uuid,
  p_now timestamptz default now()
)
returns date
language sql stable security definer set search_path = core, operations, public as $$
  select case
    when s.window_end_time is not null
     and s.window_end_time < s.due_time
     and (p_now at time zone l.timezone)::time < s.window_end_time
      then ((p_now at time zone l.timezone)::date - 1)
    else (p_now at time zone l.timezone)::date
  end
  from operations.task_schedules s
  join core.locations l on l.tenant_id = s.tenant_id and l.id = s.location_id
  where s.tenant_id = p_tenant_id and s.id = p_schedule_id;
$$;
comment on function operations.schedule_business_date(uuid, uuid, timestamptz) is
  'Operational-period date (location-local, at the moment the window opens) for a schedule. Cross-midnight aware (design P1-2). SECURITY DEFINER — date math only, not an authorization check.';

revoke all on function operations.schedule_business_date(uuid, uuid, timestamptz) from public;
grant execute on function operations.schedule_business_date(uuid, uuid, timestamptz) to authenticated;

-- Location timezone lookup. SECURITY DEFINER: a location's timezone is not
-- sensitive, and core.locations RLS (core.is_member_of) is membership-table
-- based — api.operations_expected_tasks must not depend on that join to
-- resolve the wall-clock timezone for a schedule the caller can already see.
create or replace function operations.location_timezone(p_tenant_id uuid, p_location_id uuid)
returns text
language sql stable security definer set search_path = core, public as $$
  select l.timezone from core.locations l
  where l.tenant_id = p_tenant_id and l.id = p_location_id;
$$;
comment on function operations.location_timezone(uuid, uuid) is
  'Wall-clock timezone for a location. SECURITY DEFINER — timezone is non-sensitive config; keeps api.operations_expected_tasks off the membership-gated core.locations RLS join.';

revoke all on function operations.location_timezone(uuid, uuid) from public;
grant execute on function operations.location_timezone(uuid, uuid) to authenticated;

-- ============================================================================
-- RLS — module access AND permission AND domain rule. tenant_id in every
--       predicate comes from the row being checked.
-- ============================================================================
alter table operations.task_schedules  enable row level security;
alter table operations.task_instances  enable row level security;
alter table operations.item_responses  enable row level security;
alter table operations.task_exceptions enable row level security;

-- --- task_schedules ---------------------------------------------------------
-- Always physical (location_id NOT NULL). Read: task.read OR template.manage
-- at that location (a tenant-wide role assignment satisfies both). Write:
-- template.manage at that location. (Schedule-write RPCs are a later config
-- slice; RLS write policy is defined now as the durable boundary.)
drop policy if exists operations_schedules_select on operations.task_schedules;
create policy operations_schedules_select on operations.task_schedules
  for select using (
    core.has_module_access(tenant_id, 'operations')
    and (
      core.has_permission(tenant_id, 'operations.task.read', location_id)
      or core.has_permission(tenant_id, 'operations.template.manage', location_id)
    )
  );

drop policy if exists operations_schedules_write on operations.task_schedules;
create policy operations_schedules_write on operations.task_schedules
  for all using (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.template.manage', location_id)
  ) with check (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.template.manage', location_id)
  );

-- --- task_instances --------------------------------------------------------
-- Read: task.read at the instance's location. Write: task.execute at the
-- instance's location; on INSERT the caller must be starting it themselves.
drop policy if exists operations_instances_select on operations.task_instances;
create policy operations_instances_select on operations.task_instances
  for select using (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.task.read', location_id)
  );

drop policy if exists operations_instances_insert on operations.task_instances;
create policy operations_instances_insert on operations.task_instances
  for insert with check (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.task.execute', location_id)
    and started_by = core.current_user_id()
  );

drop policy if exists operations_instances_update on operations.task_instances;
create policy operations_instances_update on operations.task_instances
  for update using (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.task.execute', location_id)
  ) with check (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.task.execute', location_id)
  );
-- No DELETE policy — instances are history, never tenant-facing-deletable.

-- --- item_responses -------------------------------------------------------
-- Read: anyone with task.read at the location (a Manager must see Staff's
-- responses). Write: task.execute at the location AND the caller records as
-- themselves. Split policies — a `for all` read predicate keyed on
-- recorded_by would hide other people's responses from a Manager.
drop policy if exists operations_item_responses_select on operations.item_responses;
create policy operations_item_responses_select on operations.item_responses
  for select using (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.task.read', location_id)
  );

drop policy if exists operations_item_responses_insert on operations.item_responses;
create policy operations_item_responses_insert on operations.item_responses
  for insert with check (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.task.execute', location_id)
    and recorded_by = core.current_user_id()
  );

drop policy if exists operations_item_responses_update on operations.item_responses;
create policy operations_item_responses_update on operations.item_responses
  for update using (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.task.execute', location_id)
  ) with check (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.task.execute', location_id)
    and recorded_by = core.current_user_id()
  );

-- --- task_exceptions -----------------------------------------------------
-- Read: task.read at location. Split write keys (design P2-4, refined):
--   INSERT source in ('reported','threshold') -> operations.task.execute.
--     'reported' is a Staff action; 'threshold' is a deterministic server-side
--     side effect of a valid measurement the same caller is allowed to record
--     (api.operations_record_response is SECURITY INVOKER) — creating it is not
--     a privileged act, only RESOLVING it is.
--   INSERT source in ('critical_missed','verification_required')
--                             -> operations.exception.resolve (system / Manager; not written by this slice).
--   UPDATE (open -> resolved) -> operations.exception.resolve (always).
drop policy if exists operations_exceptions_select on operations.task_exceptions;
create policy operations_exceptions_select on operations.task_exceptions
  for select using (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.task.read', location_id)
  );

drop policy if exists operations_exceptions_insert on operations.task_exceptions;
create policy operations_exceptions_insert on operations.task_exceptions
  for insert with check (
    core.has_module_access(tenant_id, 'operations')
    and (
      (source in ('reported', 'threshold')
        and core.has_permission(tenant_id, 'operations.task.execute', location_id))
      or (source in ('critical_missed', 'verification_required')
        and core.has_permission(tenant_id, 'operations.exception.resolve', location_id))
    )
  );

drop policy if exists operations_exceptions_update on operations.task_exceptions;
create policy operations_exceptions_update on operations.task_exceptions
  for update using (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.exception.resolve', location_id)
  ) with check (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.exception.resolve', location_id)
  );

-- ============================================================================
-- api.operations_expected_tasks(p_start, p_end) — deterministic projection
-- ----------------------------------------------------------------------------
-- "What Operations tasks are expected for the caller's locations between two
-- dates?" — a pure function of task_schedules x the calendar. Emits one row
-- per (schedule, business_date) where the schedule is active/effective and the
-- recurrence matches, PLUS every (schedule, business_date) that already has a
-- task_instances row (so a materialised occurrence never disappears from
-- history if the recurrence is later edited — design §12 minimal freeze
-- boundary). Attaches the instance status/completion when present and computes
-- a derived state: completed | in_progress | not_started | overdue.
--
-- SECURITY INVOKER (default for SQL functions): reads operations.task_schedules
-- and operations.task_instances, so their RLS filters rows to what the caller
-- may see (operations ON + operations.task.read at the location). No row is
-- returned for a module-OFF tenant.
--
-- Horizon is CLAMPED inside the body (design P1-3): a caller cannot force a
-- multi-year generate_series x per-row RBAC blow-up.
-- ============================================================================
create or replace function api.operations_expected_tasks(
  p_start date default (current_date - 7),
  p_end   date default (current_date + 14)
)
returns table (
  schedule_id         uuid,
  tenant_id           uuid,
  location_id         uuid,
  template_id         uuid,
  template_name       text,
  category            text,
  business_date       date,
  due_time            time,
  window_end_time     time,
  window_close_at     timestamptz,
  instance_id         uuid,
  status              operations.instance_status,
  state               text,
  is_overdue_critical boolean,
  open_exception_count integer,
  completed_at        timestamptz
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
    -- RLS on task_schedules already restricts to the caller's permitted,
    -- module-ON locations. Timezone via a definer helper — not a core.locations
    -- join (that table's RLS is membership-gated, unrelated to task visibility).
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
      on s.is_active
     and s.effective_from <= c.d
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
  'Deterministic "expected Operations tasks" projection for the caller''s permitted locations. Pure function of task_schedules x calendar (+ any already-materialised instance). No stored row needed for a task to be expected (scope §11). Horizon clamped to [current_date-31, current_date+62] inside the body (design P1-3). SECURITY INVOKER — task_schedules RLS is the tenant/location/module gate.';

revoke all on function api.operations_expected_tasks(date, date) from public, anon;
grant execute on function api.operations_expected_tasks(date, date) to authenticated;

-- ============================================================================
-- api.* read views (security_invoker)
-- ============================================================================
create or replace view api.operations_task_instances
  with (security_invoker = true) as
select
  ti.id as instance_id,
  ti.tenant_id,
  ti.location_id,
  ti.schedule_id,
  ti.template_id,
  ti.business_date,
  ti.status,
  ti.started_at,
  ti.completed_at
from operations.task_instances ti;
comment on view api.operations_task_instances is
  'Materialised Operations task occurrences the caller may see (operations ON + operations.task.read at the location, via RLS). security_invoker; no raw actor user ids.';

create or replace view api.operations_item_responses
  with (security_invoker = true) as
select
  r.id as response_id,
  r.tenant_id,
  r.location_id,
  r.instance_id,
  r.item_id,
  r.response_bool,
  r.response_numeric,
  r.response_text,
  r.recorded_at,
  r.updated_at
from operations.item_responses r;
comment on view api.operations_item_responses is
  'Structured responses for instances the caller may see (via RLS). security_invoker.';

create or replace view api.operations_open_exceptions
  with (security_invoker = true) as
select
  e.id as exception_id,
  e.tenant_id,
  e.location_id,
  e.instance_id,
  e.item_id,
  e.severity,
  e.source,
  e.note,
  e.created_at
from operations.task_exceptions e
where e.status = 'open';
comment on view api.operations_open_exceptions is
  'Open operational exceptions — the conceptual Manager Attention feed (scope §8: only actionable exceptions, never normal completions). security_invoker. Manager Attention UI is a later slice.';

grant select on api.operations_task_instances  to authenticated;
grant select on api.operations_item_responses  to authenticated;
grant select on api.operations_open_exceptions to authenticated;
revoke all on api.operations_task_instances  from anon, public;
revoke all on api.operations_item_responses  from anon, public;
revoke all on api.operations_open_exceptions from anon, public;

-- ============================================================================
-- Write RPCs — SECURITY INVOKER. RLS is the real boundary; each RPC raises a
-- distinguishable error early on module-OFF / permission / lifecycle / type
-- violations (same friendly-error posture as api.record_purchase_action).
-- ============================================================================

-- --- api.operations_record_response --------------------------------------
-- Records one structured response for one checklist item, materialising the
-- task_instance for today's operational period if it does not exist yet
-- (idempotent under concurrency via the unique occurrence key). If the item is
-- numeric and the value is outside numeric_min/numeric_max, opens a
-- threshold exception (severity per D4) — the measurement is still recorded.
create or replace function api.operations_record_response(
  p_tenant_id        uuid,
  p_schedule_id      uuid,
  p_item_id          uuid,
  p_response_bool    boolean default null,
  p_response_numeric numeric default null,
  p_response_text    text    default null
)
returns table (
  instance_id  uuid,
  item_id      uuid,
  response_id  uuid,
  exception_id uuid
)
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user           uuid := core.current_user_id();
  v_location_id    uuid;
  v_template_id    uuid;
  v_business_date  date;
  v_instance_id    uuid;
  v_instance_status operations.instance_status;
  v_item_type      operations.response_type;
  v_item_active    boolean;
  v_item_template  uuid;
  v_is_critical    boolean;
  v_num_min        numeric;
  v_num_max        numeric;
  v_response_id    uuid;
  v_exception_id   uuid;
  v_provided       int;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select s.location_id, s.template_id
    into v_location_id, v_template_id
  from operations.task_schedules s
  where s.tenant_id = p_tenant_id and s.id = p_schedule_id and s.is_active;

  if v_location_id is null then
    raise exception 'operations_schedule_not_found' using errcode = 'P0002';
  end if;

  if not core.has_permission(p_tenant_id, 'operations.task.execute', v_location_id) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;

  select ci.response_type, ci.is_active, ci.template_id, ci.is_critical, ci.numeric_min, ci.numeric_max
    into v_item_type, v_item_active, v_item_template, v_is_critical, v_num_min, v_num_max
  from operations.checklist_items ci
  where ci.tenant_id = p_tenant_id and ci.id = p_item_id;

  if v_item_type is null then
    raise exception 'operations_item_not_found' using errcode = 'P0002';
  end if;
  if v_item_template <> v_template_id then
    raise exception 'operations_item_not_in_schedule_template' using errcode = 'P0001';
  end if;
  if not v_item_active then
    raise exception 'operations_item_inactive' using errcode = 'P0001';
  end if;

  -- Response-type validation: exactly one value, of the item's type.
  v_provided := (p_response_bool is not null)::int
              + (p_response_numeric is not null)::int
              + (p_response_text is not null)::int;
  if v_provided <> 1 then
    raise exception 'operations_response_requires_exactly_one_value' using errcode = 'P0001';
  end if;
  if (v_item_type = 'boolean' and p_response_bool is null)
     or (v_item_type = 'numeric' and p_response_numeric is null)
     or (v_item_type = 'text'    and p_response_text is null) then
    raise exception 'operations_response_type_mismatch' using errcode = 'P0001';
  end if;

  v_business_date := operations.schedule_business_date(p_tenant_id, p_schedule_id, now());

  -- Materialise the instance idempotently (concurrency-safe via the unique
  -- (tenant_id, schedule_id, business_date) key).
  insert into operations.task_instances
    (tenant_id, location_id, schedule_id, template_id, business_date, status, started_by)
  values
    (p_tenant_id, v_location_id, p_schedule_id, v_template_id, v_business_date, 'in_progress', v_user)
  on conflict (tenant_id, schedule_id, business_date) do nothing;

  select ti.id, ti.status into v_instance_id, v_instance_status
  from operations.task_instances ti
  where ti.tenant_id = p_tenant_id
    and ti.schedule_id = p_schedule_id
    and ti.business_date = v_business_date;

  if v_instance_status = 'completed' then
    raise exception 'operations_task_already_completed' using errcode = 'P0001';
  end if;

  insert into operations.item_responses
    (tenant_id, location_id, instance_id, item_id, response_bool, response_numeric, response_text, recorded_by)
  values
    (p_tenant_id, v_location_id, v_instance_id, p_item_id, p_response_bool, p_response_numeric, p_response_text, v_user)
  on conflict (tenant_id, instance_id, item_id) do update
    set response_bool    = excluded.response_bool,
        response_numeric = excluded.response_numeric,
        response_text    = excluded.response_text,
        recorded_by      = excluded.recorded_by,
        recorded_at      = now()
  returning id into v_response_id;

  -- Numeric threshold -> exception (measurement already recorded above).
  if v_item_type = 'numeric'
     and (
       (v_num_min is not null and p_response_numeric < v_num_min)
       or (v_num_max is not null and p_response_numeric > v_num_max)
     ) then
    insert into operations.task_exceptions
      (tenant_id, location_id, instance_id, item_id, severity, source, note)
    values
      (p_tenant_id, v_location_id, v_instance_id, p_item_id,
       case when v_is_critical then 'action_required' else 'warning' end,
       'threshold',
       'measured value outside configured range')
    on conflict (tenant_id, instance_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
      where status = 'open'
      do nothing
    returning id into v_exception_id;

    if v_exception_id is null then
      select te.id into v_exception_id
      from operations.task_exceptions te
      where te.tenant_id = p_tenant_id and te.instance_id = v_instance_id
        and te.item_id = p_item_id and te.source = 'threshold' and te.status = 'open';
    end if;
  end if;

  return query select v_instance_id, p_item_id, v_response_id, v_exception_id;
end;
$$;
comment on function api.operations_record_response(uuid, uuid, uuid, boolean, numeric, text) is
  'Record one structured checklist response; materialises the task_instance lazily (idempotent). Validates the value against the item''s response_type. Numeric out-of-range opens a threshold exception (D4 severity) without blocking the measurement. SECURITY INVOKER — RLS on task_instances/item_responses/task_exceptions is the real gate.';

revoke all on function api.operations_record_response(uuid, uuid, uuid, boolean, numeric, text) from public, anon;
grant execute on function api.operations_record_response(uuid, uuid, uuid, boolean, numeric, text) to authenticated;

-- --- api.operations_complete_task ---------------------------------------
-- Marks today's occurrence for a schedule completed. Requires every active,
-- required checklist item of the template to have a response.
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

  return query select v_instance_id, 'completed'::operations.instance_status;
end;
$$;
comment on function api.operations_complete_task(uuid, uuid) is
  'Complete today''s occurrence for a schedule. Blocked unless every active+required checklist item has a response, the caller holds operations.task.execute at the location, the module is ON, and the instance is in_progress. Open exceptions do NOT block completion (scope §12). SECURITY INVOKER.';

revoke all on function api.operations_complete_task(uuid, uuid) from public, anon;
grant execute on function api.operations_complete_task(uuid, uuid) to authenticated;

-- --- api.operations_report_problem ------------------------------------
-- Staff "report a problem" affordance (scope §5). Opens a 'reported'
-- exception, materialising the instance if needed. p_item_id null = an
-- instance-level problem.
create or replace function api.operations_report_problem(
  p_tenant_id   uuid,
  p_schedule_id uuid,
  p_item_id     uuid  default null,
  p_note        text  default null,
  p_severity    text  default 'action_required'
)
returns table (instance_id uuid, exception_id uuid)
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
  v_exception_id  uuid;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;
  if p_severity not in ('warning', 'action_required') then
    raise exception 'operations_invalid_severity' using errcode = 'P0001';
  end if;

  select s.location_id, s.template_id into v_location_id, v_template_id
  from operations.task_schedules s
  where s.tenant_id = p_tenant_id and s.id = p_schedule_id and s.is_active;

  if v_location_id is null then
    raise exception 'operations_schedule_not_found' using errcode = 'P0002';
  end if;
  if not core.has_permission(p_tenant_id, 'operations.task.execute', v_location_id) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;

  if p_item_id is not null and not exists (
    select 1 from operations.checklist_items ci
    where ci.tenant_id = p_tenant_id and ci.id = p_item_id and ci.template_id = v_template_id
  ) then
    raise exception 'operations_item_not_in_schedule_template' using errcode = 'P0001';
  end if;

  v_business_date := operations.schedule_business_date(p_tenant_id, p_schedule_id, now());

  insert into operations.task_instances
    (tenant_id, location_id, schedule_id, template_id, business_date, status, started_by)
  values
    (p_tenant_id, v_location_id, p_schedule_id, v_template_id, v_business_date, 'in_progress', v_user)
  on conflict (tenant_id, schedule_id, business_date) do nothing;

  select ti.id, ti.status into v_instance_id, v_status
  from operations.task_instances ti
  where ti.tenant_id = p_tenant_id and ti.schedule_id = p_schedule_id
    and ti.business_date = v_business_date;

  insert into operations.task_exceptions
    (tenant_id, location_id, instance_id, item_id, severity, source, note)
  values
    (p_tenant_id, v_location_id, v_instance_id, p_item_id, p_severity, 'reported', p_note)
  on conflict (tenant_id, instance_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
    where status = 'open'
    do nothing
  returning id into v_exception_id;

  if v_exception_id is null then
    select te.id into v_exception_id
    from operations.task_exceptions te
    where te.tenant_id = p_tenant_id and te.instance_id = v_instance_id
      and te.source = 'reported' and te.status = 'open'
      and (te.item_id = p_item_id or (te.item_id is null and p_item_id is null));
  end if;

  return query select v_instance_id, v_exception_id;
end;
$$;
comment on function api.operations_report_problem(uuid, uuid, uuid, text, text) is
  'Staff reports an operational problem (scope §5): opens a ''reported'' exception, materialising the instance if needed. Requires operations.task.execute at the location. SECURITY INVOKER.';

revoke all on function api.operations_report_problem(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function api.operations_report_problem(uuid, uuid, uuid, text, text) to authenticated;

-- --- api.operations_resolve_exception --------------------------------
create or replace function api.operations_resolve_exception(
  p_tenant_id       uuid,
  p_exception_id    uuid,
  p_resolution_note text default null
)
returns table (exception_id uuid, status operations.exception_status)
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user        uuid := core.current_user_id();
  v_location_id uuid;
  v_status      operations.exception_status;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select e.location_id, e.status into v_location_id, v_status
  from operations.task_exceptions e
  where e.tenant_id = p_tenant_id and e.id = p_exception_id;

  if v_location_id is null then
    raise exception 'operations_exception_not_found' using errcode = 'P0002';
  end if;
  if not core.has_permission(p_tenant_id, 'operations.exception.resolve', v_location_id) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;
  if v_status = 'resolved' then
    raise exception 'operations_exception_already_resolved' using errcode = 'P0001';
  end if;

  update operations.task_exceptions e
    set status = 'resolved', resolved_at = now(), resolved_by = v_user,
        resolution_note = p_resolution_note
  where e.tenant_id = p_tenant_id and e.id = p_exception_id;

  return query select p_exception_id, 'resolved'::operations.exception_status;
end;
$$;
comment on function api.operations_resolve_exception(uuid, uuid, text) is
  'Resolve an open operational exception. Requires operations.exception.resolve at the exception''s location. Independent of task completion (scope §12). SECURITY INVOKER.';

revoke all on function api.operations_resolve_exception(uuid, uuid, text) from public, anon;
grant execute on function api.operations_resolve_exception(uuid, uuid, text) to authenticated;

-- ============================================================================
-- Grants — base-table privileges the SECURITY INVOKER RPCs need to act as the
-- calling role. RLS remains the real authorization boundary (design P2-5).
-- ============================================================================
grant select on operations.task_schedules  to authenticated;
grant select, insert, update on operations.task_instances  to authenticated;
grant select, insert, update on operations.item_responses  to authenticated;
grant select, insert, update on operations.task_exceptions to authenticated;

revoke all on operations.task_schedules  from anon, public;
revoke all on operations.task_instances  from anon, public;
revoke all on operations.item_responses  from anon, public;
revoke all on operations.task_exceptions from anon, public;
