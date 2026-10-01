-- ============================================================================
-- 0123 — operations_open_exceptions: resolve template_name in the view
-- ============================================================================
-- Founder Acceptance QA2 2026-09-30 (GPT-authored browser run, finding
-- QA2-02): the Manager Attention feed's "対応が必要" tab showed 111
-- exceptions grouped under a single generic "タスク" bucket instead of their
-- real checklist names. Root cause: `api.operations_open_exceptions` (0116)
-- carries no template identity, so the client
-- (`attention-section.tsx#resolveTaskName`) could only name an exception by
-- looking it up in `tasksToday` — TODAY's expected tasks only. Any exception
-- opened on an earlier business date (the attention feed is explicitly
-- all-time "still open", not date-scoped — see 0116's view comment) fell
-- back to the generic placeholder, silently merging every historical
-- template into one indistinguishable group.
--
-- Fix: resolve the template name IN THE VIEW, so it no longer depends on
-- "today's" task list at all. An exception is either instance-attached
-- (source IN threshold/reported — resolve via task_instances.template_id,
-- denormalised for exactly this history-stability reason, design P2-1) or
-- schedule-attached / instance-less (source = critical_missed — resolve via
-- task_schedules.template_id). Both paths are ON DELETE RESTRICT to
-- checklist_templates (design P1-1), so template_name is never NULL for a
-- row this view can return. security_invoker is preserved; the two new
-- joined tables already carry a `operations.task.read`-gated SELECT policy
-- identical in shape to task_exceptions' own (0101/0100), so this adds no
-- new access boundary — any caller who could already see an exception could
-- already read its instance/schedule and template.
--
-- Rollback: re-create the view exactly as 0116 left it (drop the two LEFT
-- JOINs and the `template_name` column, keep every other column, same
-- `security_invoker = true` / grant / revoke). Pure `create or replace view`,
-- no data written, nothing else depends on the new column yet in this
-- migration's own tree.
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
  e.business_date,
  coalesce(ti_tpl.name, sch_tpl.name) as template_name
from operations.task_exceptions e
left join operations.task_instances ti
  on e.instance_id is not null and ti.tenant_id = e.tenant_id and ti.id = e.instance_id
left join operations.checklist_templates ti_tpl
  on ti_tpl.tenant_id = ti.tenant_id and ti_tpl.id = ti.template_id
left join operations.task_schedules sch
  on e.schedule_id is not null and sch.tenant_id = e.tenant_id and sch.id = e.schedule_id
left join operations.checklist_templates sch_tpl
  on sch_tpl.tenant_id = sch.tenant_id and sch_tpl.id = sch.template_id
where e.status = 'open';

comment on view api.operations_open_exceptions is
  'Open operational exceptions — the Manager Attention feed (scope §8: only actionable exceptions), all-time (not date-scoped). instance_id is NULL for an instance-less exception (source=critical_missed), which instead carries schedule_id + business_date. template_name is resolved here (via task_instances or task_schedules, whichever the row is attached to) so the client never has to fall back to a generic label for a historical exception outside "today". security_invoker.';

grant select on api.operations_open_exceptions to authenticated;
revoke all on api.operations_open_exceptions from anon, public;
