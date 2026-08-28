-- ============================================================================
-- 0103  Operations — tighten task_schedules history-guard floor (review F1)
-- ----------------------------------------------------------------------------
-- Follow-up to PR #462 (migration 0102). The independent review of 0102 found
-- one P2 gap:
--
--   operations.task_schedules_history_guard() used a floor of
--   `greatest(old.effective_from, current_date - 1)` for how far back
--   `effective_to` could be moved. A privileged caller (a Manager holding
--   operations.template.manage, who has raw UPDATE on the table via the grant
--   0102 added for the SECURITY INVOKER RPCs) could therefore run
--       UPDATE operations.task_schedules SET effective_to = current_date - 1
--       WHERE id = '<started, open version>';
--   which SUCCEEDED and silently dropped TODAY's not-yet-elapsed expected
--   occurrence — bypassing api.operations_deactivate_schedule, which already
--   rejects effective_to < current_date. Blast radius was one day, but it is
--   the same defect class 0102 exists to close.
--
-- FIX: change the floor to `current_date`. This still lets the sanctioned RPCs
-- through unchanged:
--   * api.operations_revise_schedule sets effective_to = v_boundary - 1, and
--     v_boundary is always >= current_date + 1, so effective_to >= current_date.
--   * api.operations_deactivate_schedule sets effective_to =
--     coalesce(p_effective_to, current_date) and already guards
--     p_effective_to >= current_date.
-- Only a raw retroactive pull-back (effective_to < current_date) is now
-- blocked on every write path.
--
-- Additive: replaces one function body. No schema/data change. No edit to any
-- historical migration. No Cloud apply.
--
-- Rollback: restore 0102's function body (floor `current_date - 1`).
-- ============================================================================

create or replace function operations.task_schedules_history_guard()
returns trigger language plpgsql as $$
begin
  -- Once a version's effective period has begun, its recurrence / timing /
  -- identity can never change — a change is a NEW version
  -- (api.operations_revise_schedule). The end boundary may only be set or
  -- advanced (retirement), never pulled back to erase an obligation that has
  -- already become operational (i.e. not before current_date).
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
      if new.effective_to < greatest(old.effective_from, current_date)
         or (old.effective_to is not null and new.effective_to < old.effective_to) then
        raise exception 'operations_schedule_effective_to_retroactive' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;
comment on function operations.task_schedules_history_guard() is
  'BEFORE UPDATE on operations.task_schedules: a version whose effective_from has passed is immutable in recurrence/timing/identity; its effective_to may only be set or moved forward, never pulled back before current_date or before a prior end. Blocks raw retroactive rewrites of operational obligation, including dropping today''s occurrence (review F1, 0103).';
