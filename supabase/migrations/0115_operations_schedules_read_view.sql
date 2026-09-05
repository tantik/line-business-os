-- ============================================================================
-- 0115  Operations module — schedules read view (Cafe v2.2 WP1-A, slice 2 UI)
-- ----------------------------------------------------------------------------
-- The Manager scheduling UI (Manager applies a checklist template to a
-- location with a simple recurrence, then revises/deactivates/cancels it)
-- needs a way to READ `operations.task_schedules` rows the caller may see.
-- 0100 added `api.operations_templates` / `api.operations_template_items`
-- (foundation slice) but no equivalent read view was ever added for
-- `operations.task_schedules` (0101) even though its write RPCs
-- (`api.operations_create_schedule` / `_revise_schedule` /
-- `_deactivate_schedule` / `_cancel_scheduled_revision`, 0102/0105) have
-- existed since those migrations.
--
-- This migration ONLY adds a `security_invoker` read view + grant, mirroring
-- 0100's `api.operations_templates` view pattern exactly. It does not touch
-- any existing migration, table, RLS policy, or RPC. The table's existing
-- `operations_schedules_select` RLS policy (0101) is unchanged and remains
-- the real tenant/location/module authorization boundary — this view simply
-- exposes it as a stable `api.*` read surface for the frontend, the same way
-- every other Operations read view (0100, 0101) already does.
--
-- NO Cloud apply. RED path (supabase/migrations/**) — PR left for Founder
-- merge. Purely additive; no existing object is modified; no data is deleted.
--
-- Rollback:
--   drop view if exists api.operations_schedules;
-- ============================================================================

create or replace view api.operations_schedules
  with (security_invoker = true) as
select
  s.id as schedule_id,
  s.tenant_id,
  s.location_id,
  s.template_id,
  s.schedule_group_id,
  s.recurrence_kind,
  s.weekdays,
  s.due_time,
  s.window_end_time,
  s.effective_from,
  s.effective_to,
  s.is_active,
  s.created_at,
  s.updated_at
from operations.task_schedules s;

comment on view api.operations_schedules is
  'Operational task schedules the caller may see (operations.task_schedules RLS: operations.task.read OR operations.template.manage at the schedule''s location, plus module ON). security_invoker view, no created_by/updated_by.';

grant select on api.operations_schedules to authenticated;
revoke all on api.operations_schedules from anon, public;
