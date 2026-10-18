-- ============================================================================
-- 0128 — Issues & Handover: reporter's employee id on the read views
-- ----------------------------------------------------------------------------
-- Founder decision 2026-10-17 (DEBT-075): show the reporter's NAME on Issues /
-- Handover instead of only 「スタッフ」/「マネージャー」.
--
-- issues.issues.reported_by is an auth user id, and no app-facing view exposes
-- raw user ids (0067). This migration appends one column to api.issues_open
-- and api.issues: reporter_employee_id, the workforce.employees row of the
-- reporter in the same tenant (unique (tenant_id, user_id), 0062).
--
-- Visibility needs no new rule: both views stay security_invoker, so the LEFT
-- JOIN only finds an employee row the CALLER may already read under the
-- existing workforce.employees RLS -- a Manager sees the employees at the
-- locations they manage, a Staff member sees themself plus active coworkers in
-- their own schedule scope (0061). Those are exactly the rows the app's roster
-- reads already decrypt names for, so the app maps the id to a name from data
-- it has; otherwise the column is NULL and the app falls back to the role
-- label. The name itself stays encrypted in the database and is decrypted
-- server-side only.
--
-- Additive only: existing columns keep their order and meaning; the new column
-- is appended (create or replace view allows that).
--
-- Rollback: recreate both views exactly as in 0118 (the views must be removed
-- first, because create or replace cannot remove a column), then re-grant
-- select to authenticated.
-- ============================================================================

create or replace view api.issues_open
  with (security_invoker = true) as
select
  i.id as issue_id,
  i.tenant_id,
  i.location_id,
  i.kind,
  i.category,
  i.severity,
  i.status,
  i.note,
  i.business_date,
  i.reported_by,
  i.reported_by_role,
  i.acknowledged_by,
  i.acknowledged_at,
  i.source,
  i.operations_exception_id,
  i.created_at,
  i.updated_at,
  e.id as reporter_employee_id
from issues.issues i
left join workforce.employees e
  on e.tenant_id = i.tenant_id
 and e.user_id = i.reported_by
where i.status in ('open', 'acknowledged');
comment on view api.issues_open is
  'Open + acknowledged issues/handovers -- the "current" feed (not yet resolved), the conceptual Manager Attention equivalent for this module. security_invoker; RLS on issues.issues is the real access gate. reporter_employee_id (0128) is the reporter''s workforce.employees id, NULL unless the caller may read that employee row under workforce.employees RLS.';

create or replace view api.issues
  with (security_invoker = true) as
select
  i.id as issue_id,
  i.tenant_id,
  i.location_id,
  i.kind,
  i.category,
  i.severity,
  i.status,
  i.note,
  i.business_date,
  i.reported_by,
  i.reported_by_role,
  i.acknowledged_by,
  i.acknowledged_at,
  i.resolved_by,
  i.resolved_at,
  i.resolution_note,
  i.source,
  i.operations_exception_id,
  i.created_at,
  i.updated_at,
  e.id as reporter_employee_id
from issues.issues i
left join workforce.employees e
  on e.tenant_id = i.tenant_id
 and e.user_id = i.reported_by;
comment on view api.issues is
  'Full issue/handover history including resolved rows, for history/list screens. Plain passthrough -- issues.issues RLS already scopes visibility correctly (mirrors api.workforce_staff_messages). security_invoker. reporter_employee_id (0128) is the reporter''s workforce.employees id, NULL unless the caller may read that employee row under workforce.employees RLS.';

grant select on api.issues_open to authenticated;
grant select on api.issues to authenticated;
revoke all on api.issues_open from anon, public;
revoke all on api.issues from anon, public;
