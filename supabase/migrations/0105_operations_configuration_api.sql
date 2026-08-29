-- ============================================================================
-- 0105  Operations module — tenant-facing Configuration API (Cafe v2.2 WP1-A)
-- ----------------------------------------------------------------------------
-- The execution engine (0101) and the two historical-integrity fixes (0102/
-- 0103 schedule versioning, 0104 template retirement) are merged. This slice
-- adds the CONTROLLED WRITE BOUNDARY for Manager configuration:
--
--   checklist_templates -> checklist_items -> task_schedules
--
-- so a future Manager configuration UI never needs raw writes to the internal
-- `operations` tables. NO UI, NO presets, NO Attention, NO notifications.
--
--   * product scope  docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md §4
--   * technical design docs/ai/CAFE_V2_2_WP1_A_OPERATIONS_TECHNICAL_DESIGN_2026-08-28.md §D
--   * handoffs: PR #462/#463 (schedule versioning), PR #464 (template retirement)
--
-- ARCHITECTURE — identical posture to 0101/0102: every tenant-facing write is
-- an explicit `api.*` business RPC, `SECURITY INVOKER`, fixed `search_path`,
-- `#variable_conflict use_column`, with an early distinguishable raise on
-- module-OFF / permission / lifecycle violations. RLS write policies + BEFORE
-- triggers are the REAL authorization / integrity boundary (ADR 0008: no
-- SECURITY DEFINER object in the `api` schema — preserved; the only
-- SECURITY DEFINER helper added here, operations.item_is_operationalized, is
-- a factual check, not an authorization check, and lives in the operations
-- schema like operations.schedule_business_date). `operations` stays OUT of
-- the PostgREST exposed schemas.
--
-- CLOSES three mandatory invariants recorded by prior reviews:
--   * F2 — an authenticated Manager could raw-INSERT a backdated,
--     non-overlapping task_schedules version (fabricate historical
--     obligation forward), and raw-UPDATE a not-yet-started version's
--     effective_from into the past. CONFIRMED by reproduction against merged
--     dev. Closed by tightened RLS write policies (insert requires
--     effective_from >= current_date and an open end; a not-yet-started
--     version's effective_from can never move into the past) + the
--     configuration RPCs as the sanctioned path.
--   * effective_to elapsed-forward-advance asymmetry (PR #464 review P3) —
--     an elapsed task_schedules.effective_to could be pushed forward,
--     fabricating missed/overdue history for the gap dates. CONFIRMED.
--     Closed by freezing an elapsed effective_to (mirrors 0104's
--     checklist_templates.retired_on rule).
--   * template is_active / retired_on coherence (PR #464 review P3) — the
--     two columns could be toggled independently into contradictory states.
--     Closed by making api.operations_retire_template the atomic operation
--     and never granting a bare is_active toggle path.
--
-- RESPONSE_TYPE (mandatory invariant, deferred by 0104): a checklist item's
-- response_type is IMMUTABLE once the item is OPERATIONALIZED — defined as:
-- a response has been recorded against it (operations.item_responses), OR its
-- template is bound to at least one schedule (operations.task_schedules exists
-- for the template, any version). Enforced by a BEFORE UPDATE trigger on
-- every write path. The sanctioned way to "change" a type is
-- api.operations_replace_template_item — retire the old item, create a new
-- one on the same template. NO item-definition versioning table.
--
-- is_critical is frozen by the SAME operationalization gate (PR #464 review
-- P3 flagged that api.operations_expected_tasks.is_overdue_critical is
-- recomputed live from checklist_items.is_critical/is_active). is_overdue_critical
-- remains an intentional LIVE Manager-attention signal, not frozen history
-- (the durable record of a critical failure is a task_exceptions row); but a
-- Manager can no longer silently reclassify an operational item's criticality
-- and thereby rewrite the flag on past occurrences.
--
-- FUTURE-VERSION CANCELLATION (scope): api.operations_cancel_scheduled_revision
-- physically DELETEs a task_schedules version that is GENUINELY not yet
-- effective (effective_from > current_date) and has zero task_instances (it
-- cannot have any — instances only ever materialise for the current business
-- date), and re-opens the predecessor version that api.operations_revise_schedule
-- closed the day before. Non-destructive to elapsed history; no obligation
-- fabricated. A narrow RLS DELETE policy (effective_from > current_date AND no
-- instances) is the durable boundary.
--
-- NO edit to 0099-0104. Additive only; no row deleted by the migration
-- itself; no historical Operations data dropped. NO Cloud apply. RED path.
--
-- Rollback: see the end of this file.
-- ============================================================================

-- ============================================================================
-- 1. Table privileges — the SECURITY INVOKER RPCs act as the caller; RLS
--    write policies + triggers below are the boundary. (task_schedules
--    already has insert,update from 0102; add delete for cancellation.)
-- ============================================================================
grant insert, update on operations.checklist_templates to authenticated;
grant insert, update on operations.checklist_items     to authenticated;
grant delete          on operations.task_schedules     to authenticated;
revoke all on operations.checklist_templates from anon, public;
revoke all on operations.checklist_items     from anon, public;

-- ============================================================================
-- 2. RLS write policies — split `for all` into explicit INSERT / UPDATE
--    (+ a narrow DELETE for task_schedules) and tighten the INSERT checks so
--    a raw write cannot fabricate history.
-- ============================================================================

-- --- checklist_templates -------------------------------------------------
drop policy if exists operations_templates_write on operations.checklist_templates;

create policy operations_templates_insert on operations.checklist_templates
  for insert with check (
    core.has_module_access(tenant_id, 'operations')
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'operations.template.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'operations.template.manage', location_id))
    )
    -- a template is always created live; retirement is a later, explicit op
    and is_active
    and retired_on is null
  );

create policy operations_templates_update on operations.checklist_templates
  for update using (
    core.has_module_access(tenant_id, 'operations')
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'operations.template.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'operations.template.manage', location_id))
    )
  ) with check (
    core.has_module_access(tenant_id, 'operations')
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'operations.template.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'operations.template.manage', location_id))
    )
  );
-- no DELETE policy — templates are operational history.

-- --- checklist_items ----------------------------------------------------
drop policy if exists operations_items_write on operations.checklist_items;

create policy operations_items_insert on operations.checklist_items
  for insert with check (
    core.has_module_access(tenant_id, 'operations')
    and operations.can_manage_template(tenant_id, template_id)
  );

create policy operations_items_update on operations.checklist_items
  for update using (
    core.has_module_access(tenant_id, 'operations')
    and operations.can_manage_template(tenant_id, template_id)
  ) with check (
    core.has_module_access(tenant_id, 'operations')
    and operations.can_manage_template(tenant_id, template_id)
  );
-- no DELETE policy — items are operational history.

-- --- task_schedules -----------------------------------------------------
drop policy if exists operations_schedules_write on operations.task_schedules;

create policy operations_schedules_insert on operations.task_schedules
  for insert with check (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.template.manage', location_id)
    -- F2: a raw INSERT can never create a backdated version. A new schedule
    -- (or a revision's new version) always starts today or later and is
    -- open-ended; closing the previous version is an UPDATE, gated by the
    -- history guard.
    and effective_from >= current_date
    and effective_to is null
    and is_active
  );

create policy operations_schedules_update on operations.task_schedules
  for update using (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.template.manage', location_id)
  ) with check (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.template.manage', location_id)
  );

-- DELETE: ONLY a version that is genuinely not yet effective and has no
-- execution history. This is the durable boundary for
-- api.operations_cancel_scheduled_revision.
create policy operations_schedules_delete on operations.task_schedules
  for delete using (
    core.has_module_access(tenant_id, 'operations')
    and core.has_permission(tenant_id, 'operations.template.manage', location_id)
    and effective_from > current_date
    and not exists (
      select 1 from operations.task_instances ti
      where ti.tenant_id = task_schedules.tenant_id
        and ti.schedule_id = task_schedules.id
    )
  );

-- ============================================================================
-- 3. task_schedules history guard — extended (create-or-replace; 0102/0103
--    body + two rules). Still fires BEFORE UPDATE for every role.
--      (a) a NOT-yet-started version's effective_from may never move to the
--          past (F2 via UPDATE).
--      (b) an ELAPSED effective_to is frozen — no pull-back, no forward
--          advance (would fabricate missed history), no clear. A
--          not-yet-elapsed effective_to may still be cleared (un-retire) —
--          that only affects today/future expectations and is what
--          api.operations_cancel_scheduled_revision relies on.
-- ============================================================================
create or replace function operations.task_schedules_history_guard()
returns trigger language plpgsql as $$
begin
  -- A not-yet-started future version: its recurrence/timing may still be
  -- edited freely, but its effective_from may not be backdated into the past
  -- or to today (that would fabricate an obligation for an elapsed / current
  -- period the version never really covered).
  if old.effective_from > current_date then
    if new.effective_from is distinct from old.effective_from
       and new.effective_from <= current_date then
      raise exception 'operations_schedule_future_version_cannot_be_backdated' using errcode = 'P0001';
    end if;
  end if;

  -- Once a version's effective period has begun, its recurrence / timing /
  -- identity can never change — a change is a NEW version
  -- (api.operations_revise_schedule).
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
  end if;

  -- effective_to movement rules (apply to any version whose row is being
  -- updated, started or not).
  if new.effective_to is distinct from old.effective_to then
    if old.effective_to is not null and old.effective_to < current_date then
      -- elapsed boundary: fully frozen (mirrors 0104 checklist_templates).
      raise exception 'operations_schedule_retirement_elapsed_frozen' using errcode = 'P0001';
    end if;
    if new.effective_to is null then
      -- clearing (un-retire) is allowed ONLY while the boundary has not
      -- elapsed — it then only affects today/future expectations. Used by
      -- api.operations_cancel_scheduled_revision.
      if old.effective_from <= current_date and old.effective_to < current_date then
        raise exception 'operations_schedule_cannot_unretire' using errcode = 'P0001';
      end if;
    else
      if old.effective_from <= current_date then
        if new.effective_to < greatest(old.effective_from, current_date)
           or (old.effective_to is not null and new.effective_to < old.effective_to) then
          raise exception 'operations_schedule_effective_to_retroactive' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;
comment on function operations.task_schedules_history_guard() is
  'BEFORE UPDATE on operations.task_schedules: a started version is immutable in recurrence/timing/identity; a not-yet-started version cannot be backdated; effective_to may be set or advanced while it has not elapsed, cleared only while it has not elapsed, and is fully frozen once elapsed. Blocks raw retroactive rewrites and forward fabrication of operational obligation on every write path (0102/0103 + 0105 F2/F3).';

-- ============================================================================
-- 4. checklist_items definition guard — response_type and is_critical are
--    immutable once the item is OPERATIONALIZED. BEFORE UPDATE, every role.
-- ============================================================================
create or replace function operations.item_is_operationalized(p_tenant_id uuid, p_item_id uuid)
returns boolean
language sql stable security definer set search_path = operations, public as $$
  select exists (
           select 1 from operations.item_responses r
           where r.tenant_id = p_tenant_id and r.item_id = p_item_id
         )
      or exists (
           select 1
           from operations.checklist_items ci
           join operations.task_schedules s
             on s.tenant_id = ci.tenant_id and s.template_id = ci.template_id
           where ci.tenant_id = p_tenant_id and ci.id = p_item_id
         );
$$;
comment on function operations.item_is_operationalized(uuid, uuid) is
  'True once a checklist item has entered operational use: a response has been recorded against it, OR its template is bound to at least one task_schedules row (any version). SECURITY DEFINER — a factual check (not authorization), same posture as operations.schedule_business_date; callers still pass through RLS/permission checks of their own.';

revoke all on function operations.item_is_operationalized(uuid, uuid) from public;
grant execute on function operations.item_is_operationalized(uuid, uuid) to authenticated;

create or replace function operations.checklist_items_definition_guard()
returns trigger language plpgsql as $$
begin
  if (new.response_type is distinct from old.response_type
      or new.is_critical is distinct from old.is_critical)
     and operations.item_is_operationalized(new.tenant_id, new.id) then
    raise exception 'operations_item_definition_frozen_after_operational' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
comment on function operations.checklist_items_definition_guard() is
  'BEFORE UPDATE on operations.checklist_items: response_type and is_critical are immutable once the item is operationalized (operations.item_is_operationalized). A different response type requires a replacement item (api.operations_replace_template_item). Protects historical response interpretation and the is_overdue_critical signal on past occurrences.';

drop trigger if exists checklist_items_definition_guard on operations.checklist_items;
create trigger checklist_items_definition_guard
  before update on operations.checklist_items
  for each row execute function operations.checklist_items_definition_guard();

-- ============================================================================
-- 5. api.* configuration RPCs — SECURITY INVOKER, fixed search_path.
--    Actor is never a client argument. tenant/location re-derived and
--    re-checked; a forged cross-tenant id resolves to not_found.
-- ============================================================================

-- --- TEMPLATES ----------------------------------------------------------
create or replace function api.operations_create_template(
  p_tenant_id   uuid,
  p_name        text,
  p_location_id uuid default null,
  p_category    text default null,
  p_description text default null
)
returns uuid
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user uuid := core.current_user_id();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'operations_template_name_required' using errcode = 'P0001';
  end if;
  if p_location_id is null then
    if not core.has_permission_in_tenant(p_tenant_id, 'operations.template.manage') then
      raise exception 'operations_permission_denied' using errcode = 'P0001';
    end if;
  else
    if not core.has_permission(p_tenant_id, 'operations.template.manage', p_location_id) then
      raise exception 'operations_permission_denied' using errcode = 'P0001';
    end if;
  end if;

  -- a bad / cross-tenant p_location_id is rejected by the composite FK
  -- (tenant_id, location_id) -> core.locations(tenant_id, id).
  insert into operations.checklist_templates (tenant_id, location_id, name, category, description)
  values (p_tenant_id, p_location_id, btrim(p_name), p_category, p_description)
  returning id into v_id;

  return v_id;
end;
$$;
comment on function api.operations_create_template(uuid, text, uuid, text, text) is
  'Create an operational checklist template (location_id NULL = tenant-wide). Requires operations.template.manage (in-tenant for a tenant-wide template, at the location otherwise) + module ON. SECURITY INVOKER.';

create or replace function api.operations_update_template(
  p_tenant_id   uuid,
  p_template_id uuid,
  p_name        text,
  p_category    text,
  p_description text
)
returns void
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user uuid := core.current_user_id();
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;
  if not exists (select 1 from operations.checklist_templates t
                 where t.tenant_id = p_tenant_id and t.id = p_template_id) then
    raise exception 'operations_template_not_found' using errcode = 'P0002';
  end if;
  if not operations.can_manage_template(p_tenant_id, p_template_id) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'operations_template_name_required' using errcode = 'P0001';
  end if;

  -- metadata only — never is_active / retired_on / location_id here.
  update operations.checklist_templates
    set name = btrim(p_name), category = p_category, description = p_description
  where tenant_id = p_tenant_id and id = p_template_id;
end;
$$;
comment on function api.operations_update_template(uuid, uuid, text, text, text) is
  'Update a template''s safe mutable metadata (name / category / description) only. Never touches is_active / retired_on / location_id — retirement is api.operations_retire_template. Requires operations.template.manage + module ON. SECURITY INVOKER.';

create or replace function api.operations_retire_template(
  p_tenant_id   uuid,
  p_template_id uuid,
  p_retired_on  date default current_date
)
returns date
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user     uuid := core.current_user_id();
  v_active   boolean;
  v_retired  date;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select t.is_active, t.retired_on into v_active, v_retired
  from operations.checklist_templates t
  where t.tenant_id = p_tenant_id and t.id = p_template_id;

  if not found then
    raise exception 'operations_template_not_found' using errcode = 'P0002';
  end if;
  if not operations.can_manage_template(p_tenant_id, p_template_id) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;
  if v_retired is not null then
    raise exception 'operations_template_already_retired' using errcode = 'P0001';
  end if;
  if coalesce(p_retired_on, current_date) < current_date then
    raise exception 'operations_template_retire_retroactive' using errcode = 'P0001';
  end if;

  -- atomic: the two columns are set together (the 0104 CHECK + guard enforce
  -- non-retroactive / elapsed-frozen; this RPC is the only sanctioned path).
  update operations.checklist_templates
    set is_active = false, retired_on = coalesce(p_retired_on, current_date)
  where tenant_id = p_tenant_id and id = p_template_id;

  return coalesce(p_retired_on, current_date);
end;
$$;
comment on function api.operations_retire_template(uuid, uuid, date) is
  'Retire a template atomically (is_active=false + retired_on, default today; retroactive rejected). Past expected tasks are preserved; future generation stops after the boundary (0104). Requires operations.template.manage + module ON. SECURITY INVOKER.';

-- --- ITEMS -------------------------------------------------------------
create or replace function api.operations_add_template_item(
  p_tenant_id     uuid,
  p_template_id   uuid,
  p_label         text,
  p_response_type operations.response_type,
  p_is_critical   boolean default false,
  p_is_required   boolean default true,
  p_numeric_min   numeric default null,
  p_numeric_max   numeric default null,
  p_numeric_unit  text    default null,
  p_sort_order    integer default 0
)
returns uuid
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user    uuid := core.current_user_id();
  v_retired date;
  v_id      uuid;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select t.retired_on into v_retired
  from operations.checklist_templates t
  where t.tenant_id = p_tenant_id and t.id = p_template_id;

  if not found then
    raise exception 'operations_template_not_found' using errcode = 'P0002';
  end if;
  if not operations.can_manage_template(p_tenant_id, p_template_id) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;
  if v_retired is not null then
    raise exception 'operations_template_retired' using errcode = 'P0001';
  end if;
  if p_label is null or length(btrim(p_label)) = 0 then
    raise exception 'operations_item_label_required' using errcode = 'P0001';
  end if;

  insert into operations.checklist_items
    (tenant_id, template_id, label, response_type, is_critical, is_required,
     numeric_min, numeric_max, numeric_unit, sort_order)
  values
    (p_tenant_id, p_template_id, btrim(p_label), p_response_type, coalesce(p_is_critical, false),
     coalesce(p_is_required, true), p_numeric_min, p_numeric_max, p_numeric_unit, coalesce(p_sort_order, 0))
  returning id into v_id;

  return v_id;
end;
$$;
comment on function api.operations_add_template_item(uuid, uuid, text, operations.response_type, boolean, boolean, numeric, numeric, text, integer) is
  'Add a checklist item to a non-retired template. response_type is fixed at creation (immutable once operational). Requires operations.template.manage + module ON. SECURITY INVOKER.';

create or replace function api.operations_update_template_item(
  p_tenant_id    uuid,
  p_item_id      uuid,
  p_label        text,
  p_is_critical  boolean,
  p_is_required  boolean,
  p_numeric_min  numeric,
  p_numeric_max  numeric,
  p_numeric_unit text,
  p_sort_order   integer
)
returns void
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user     uuid := core.current_user_id();
  v_template uuid;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select ci.template_id into v_template
  from operations.checklist_items ci
  where ci.tenant_id = p_tenant_id and ci.id = p_item_id;

  if not found then
    raise exception 'operations_item_not_found' using errcode = 'P0002';
  end if;
  if not operations.can_manage_template(p_tenant_id, v_template) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;
  if p_label is null or length(btrim(p_label)) = 0 then
    raise exception 'operations_item_label_required' using errcode = 'P0001';
  end if;

  -- response_type is intentionally NOT a parameter. is_critical is passed but
  -- the definition guard rejects a change once the item is operationalized.
  update operations.checklist_items
    set label        = btrim(p_label),
        is_critical  = coalesce(p_is_critical, is_critical),
        is_required  = coalesce(p_is_required, is_required),
        numeric_min  = p_numeric_min,
        numeric_max  = p_numeric_max,
        numeric_unit = p_numeric_unit,
        sort_order   = coalesce(p_sort_order, sort_order)
  where tenant_id = p_tenant_id and id = p_item_id;
end;
$$;
comment on function api.operations_update_template_item(uuid, uuid, text, boolean, boolean, numeric, numeric, text, integer) is
  'Update a checklist item''s safe mutable fields (label / is_required / numeric range / unit / sort_order, and is_critical only while not yet operational). response_type is never mutable here — use api.operations_replace_template_item. Requires operations.template.manage + module ON. SECURITY INVOKER.';

create or replace function api.operations_retire_template_item(
  p_tenant_id uuid,
  p_item_id   uuid
)
returns void
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user     uuid := core.current_user_id();
  v_template uuid;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select ci.template_id into v_template
  from operations.checklist_items ci
  where ci.tenant_id = p_tenant_id and ci.id = p_item_id;

  if not found then
    raise exception 'operations_item_not_found' using errcode = 'P0002';
  end if;
  if not operations.can_manage_template(p_tenant_id, v_template) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;

  update operations.checklist_items
    set is_active = false
  where tenant_id = p_tenant_id and id = p_item_id;
end;
$$;
comment on function api.operations_retire_template_item(uuid, uuid) is
  'Deactivate a checklist item (is_active=false). Past item_responses keep item_id + value; the completion gate and expected projection are template/schedule-level, so history is preserved (0104 handoff §7). Requires operations.template.manage + module ON. SECURITY INVOKER.';

create or replace function api.operations_replace_template_item(
  p_tenant_id     uuid,
  p_old_item_id   uuid,
  p_label         text,
  p_response_type operations.response_type,
  p_is_critical   boolean default false,
  p_is_required   boolean default true,
  p_numeric_min   numeric default null,
  p_numeric_max   numeric default null,
  p_numeric_unit  text    default null,
  p_sort_order    integer default null
)
returns uuid
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user     uuid := core.current_user_id();
  v_template uuid;
  v_sort     integer;
  v_new_id   uuid;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select ci.template_id, ci.sort_order into v_template, v_sort
  from operations.checklist_items ci
  where ci.tenant_id = p_tenant_id and ci.id = p_old_item_id;

  if not found then
    raise exception 'operations_item_not_found' using errcode = 'P0002';
  end if;
  if not operations.can_manage_template(p_tenant_id, v_template) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;
  if p_label is null or length(btrim(p_label)) = 0 then
    raise exception 'operations_item_label_required' using errcode = 'P0001';
  end if;

  -- retire the old item (history intact) and create a fresh one on the same
  -- template — the sanctioned way to change a response_type.
  update operations.checklist_items
    set is_active = false
  where tenant_id = p_tenant_id and id = p_old_item_id;

  insert into operations.checklist_items
    (tenant_id, template_id, label, response_type, is_critical, is_required,
     numeric_min, numeric_max, numeric_unit, sort_order)
  values
    (p_tenant_id, v_template, btrim(p_label), p_response_type, coalesce(p_is_critical, false),
     coalesce(p_is_required, true), p_numeric_min, p_numeric_max, p_numeric_unit,
     coalesce(p_sort_order, v_sort))
  returning id into v_new_id;

  return v_new_id;
end;
$$;
comment on function api.operations_replace_template_item(uuid, uuid, text, operations.response_type, boolean, boolean, numeric, numeric, text, integer) is
  'Retire a checklist item and create a replacement on the same template (e.g. to change response_type after the item is operational). Old responses keep their item_id + value. Requires operations.template.manage + module ON. SECURITY INVOKER.';

-- --- SCHEDULES --------------------------------------------------------
-- api.operations_revise_schedule / api.operations_deactivate_schedule (0102)
-- are already correct and are REUSED unchanged. This slice adds create + a
-- future-version cancellation.

create or replace function api.operations_create_schedule(
  p_tenant_id       uuid,
  p_location_id     uuid,
  p_template_id     uuid,
  p_recurrence_kind operations.recurrence_kind,
  p_due_time        time,
  p_weekdays        smallint[] default null,
  p_window_end_time time        default null,
  p_effective_from  date        default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user      uuid := core.current_user_id();
  v_tmpl_loc  uuid;
  v_retired   date;
  v_from      date := coalesce(p_effective_from, current_date);
  v_id        uuid;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;
  if p_location_id is null then
    raise exception 'operations_schedule_location_required' using errcode = 'P0001';
  end if;
  if not core.has_permission(p_tenant_id, 'operations.template.manage', p_location_id) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;

  select t.location_id, t.retired_on into v_tmpl_loc, v_retired
  from operations.checklist_templates t
  where t.tenant_id = p_tenant_id and t.id = p_template_id;

  if not found then
    raise exception 'operations_template_not_found' using errcode = 'P0002';
  end if;
  if v_retired is not null then
    raise exception 'operations_template_retired' using errcode = 'P0001';
  end if;
  -- a location-scoped template can only be scheduled at its own location.
  if v_tmpl_loc is not null and v_tmpl_loc <> p_location_id then
    raise exception 'operations_template_location_mismatch' using errcode = 'P0001';
  end if;
  if v_from < current_date then
    raise exception 'operations_schedule_effective_from_retroactive' using errcode = 'P0001';
  end if;

  -- new logical schedule: schedule_group_id defaults to a fresh uuid.
  insert into operations.task_schedules
    (tenant_id, location_id, template_id, recurrence_kind, weekdays, due_time,
     window_end_time, effective_from, effective_to, is_active)
  values
    (p_tenant_id, p_location_id, p_template_id, p_recurrence_kind, p_weekdays, p_due_time,
     p_window_end_time, v_from, null, true)
  returning id into v_id;

  return v_id;
end;
$$;
comment on function api.operations_create_schedule(uuid, uuid, uuid, operations.recurrence_kind, time, smallint[], time, date) is
  'Create a NEW logical schedule (fresh schedule_group_id) binding a non-retired template to a location with a simple recurrence. effective_from defaults to today; a past date is rejected (no backdated obligation). Requires operations.template.manage at the location + module ON. SECURITY INVOKER.';

create or replace function api.operations_cancel_scheduled_revision(
  p_tenant_id   uuid,
  p_schedule_id uuid
)
returns table (cancelled_schedule_id uuid, reopened_schedule_id uuid)
language plpgsql
security invoker
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user      uuid := core.current_user_id();
  v_group     uuid;
  v_location  uuid;
  v_from      date;
  v_pred_id   uuid;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;

  select s.schedule_group_id, s.location_id, s.effective_from
    into v_group, v_location, v_from
  from operations.task_schedules s
  where s.tenant_id = p_tenant_id and s.id = p_schedule_id;

  if not found then
    raise exception 'operations_schedule_not_found' using errcode = 'P0002';
  end if;
  if not core.has_permission(p_tenant_id, 'operations.template.manage', v_location) then
    raise exception 'operations_permission_denied' using errcode = 'P0001';
  end if;
  if v_from <= current_date then
    raise exception 'operations_schedule_version_already_effective' using errcode = 'P0001';
  end if;

  -- the predecessor version that a revision closed the day before this one
  -- takes effect (if any) — re-open it so the schedule stays continuous.
  select s.id into v_pred_id
  from operations.task_schedules s
  where s.tenant_id = p_tenant_id
    and s.schedule_group_id = v_group
    and s.id <> p_schedule_id
    and s.effective_to = v_from - 1;

  -- DELETE is gated by operations_schedules_delete RLS (future-only, no
  -- instances). If a task_instance somehow exists, the policy blocks it and
  -- the statement affects 0 rows -> raise.
  delete from operations.task_schedules
  where tenant_id = p_tenant_id and id = p_schedule_id;
  if not found then
    raise exception 'operations_schedule_version_not_cancellable' using errcode = 'P0001';
  end if;

  if v_pred_id is not null then
    update operations.task_schedules
      set effective_to = null, is_active = true
    where tenant_id = p_tenant_id and id = v_pred_id;
  end if;

  return query select p_schedule_id, v_pred_id;
end;
$$;
comment on function api.operations_cancel_scheduled_revision(uuid, uuid) is
  'Cancel a task_schedules version that is not yet effective (effective_from > current_date) and has no execution history: physically deletes it and re-opens the predecessor version a prior revision closed. Non-destructive to elapsed history; fabricates nothing. Requires operations.template.manage at the location + module ON. SECURITY INVOKER; the operations_schedules_delete RLS policy is the durable boundary.';

-- ============================================================================
-- 6. Grants on the new RPCs — authenticated only; anon/public revoked.
-- ============================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'api.operations_create_template(uuid, text, uuid, text, text)',
    'api.operations_update_template(uuid, uuid, text, text, text)',
    'api.operations_retire_template(uuid, uuid, date)',
    'api.operations_add_template_item(uuid, uuid, text, operations.response_type, boolean, boolean, numeric, numeric, text, integer)',
    'api.operations_update_template_item(uuid, uuid, text, boolean, boolean, numeric, numeric, text, integer)',
    'api.operations_retire_template_item(uuid, uuid)',
    'api.operations_replace_template_item(uuid, uuid, text, operations.response_type, boolean, boolean, numeric, numeric, text, integer)',
    'api.operations_create_schedule(uuid, uuid, uuid, operations.recurrence_kind, time, smallint[], time, date)',
    'api.operations_cancel_scheduled_revision(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end $$;

-- ============================================================================
-- Rollback:
--   drop function if exists api.operations_cancel_scheduled_revision(uuid, uuid);
--   drop function if exists api.operations_create_schedule(uuid, uuid, uuid, operations.recurrence_kind, time, smallint[], time, date);
--   drop function if exists api.operations_replace_template_item(uuid, uuid, text, operations.response_type, boolean, boolean, numeric, numeric, text, integer);
--   drop function if exists api.operations_retire_template_item(uuid, uuid);
--   drop function if exists api.operations_update_template_item(uuid, uuid, text, boolean, boolean, numeric, numeric, text, integer);
--   drop function if exists api.operations_add_template_item(uuid, uuid, text, operations.response_type, boolean, boolean, numeric, numeric, text, integer);
--   drop function if exists api.operations_retire_template(uuid, uuid, date);
--   drop function if exists api.operations_update_template(uuid, uuid, text, text, text);
--   drop function if exists api.operations_create_template(uuid, text, uuid, text, text);
--   drop trigger if exists checklist_items_definition_guard on operations.checklist_items;
--   drop function if exists operations.checklist_items_definition_guard();
--   drop function if exists operations.item_is_operationalized(uuid, uuid);
--   -- restore 0103's operations.task_schedules_history_guard() body
--   drop policy if exists operations_schedules_delete on operations.task_schedules;
--   drop policy if exists operations_schedules_update on operations.task_schedules;
--   drop policy if exists operations_schedules_insert on operations.task_schedules;
--   drop policy if exists operations_items_update on operations.checklist_items;
--   drop policy if exists operations_items_insert on operations.checklist_items;
--   drop policy if exists operations_templates_update on operations.checklist_templates;
--   drop policy if exists operations_templates_insert on operations.checklist_templates;
--   -- recreate 0100/0101 operations_*_write policies; revoke the added grants.
-- ============================================================================
