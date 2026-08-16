-- ============================================================================
-- 0030  Workforce Cafe v0.1: read API facade (shift_types, shift_assignments,
--       shift_requests, attendance) (Slice 1A)
-- ----------------------------------------------------------------------------
-- Follows the exact security_invoker pattern established by
-- 0015/0017/0018/0019/0023: every view below is `security_invoker = true` --
-- no SECURITY DEFINER object is added. The caller's own privileges plus this
-- slice's RLS policies (0025-0029) remain the single source of truth; these
-- views neither widen nor bypass RLS. `workforce` itself stays out of the
-- Data API exposed-schemas list (supabase/config.toml is unchanged); only
-- these 4 new `api` views become reachable via PostgREST.
--
-- DEPENDENCY NOTE: `authenticated` already holds ordinary SELECT on
-- workforce.shift_types/shifts/shift_requests/attendance (granted by
-- 0025/0026/0027/0028 alongside their INSERT/UPDATE, for the Server Action
-- write path a later slice adds) -- no base-table grant is added here, only
-- the 4 new view grants.
--
-- Naming: `api.workforce_shift_assignments` reads `workforce.shifts` --
-- workforce.shifts is not renamed (0009_workforce.sql stays immutable, per
-- this slice's confirmed decisions), but the read-facade name matches the
-- "shift assignment" vocabulary used elsewhere (see
-- docs/architecture/workforce-production-mvp-architecture.md). Every row id
-- is exposed under a semantic alias (shift_type_id, assignment_id,
-- request_id, attendance_id), never as a column literally named `id`.
--
-- No raw user ids: workforce.shift_requests.decided_by (which manager
-- decided a request) is deliberately NOT exposed by
-- api.workforce_shift_requests, matching 0023's "no raw user ids anywhere"
-- precedent (api.my_tenant_admin_members / the workforce staff views expose
-- zero user_id/created_by/updated_by columns). A later slice that needs to
-- show "decided by X" can add a narrowly-scoped manager-only column or view
-- for that specific need rather than exposing the raw id broadly here.
-- ============================================================================

create view api.workforce_shift_types
  with (security_invoker = true) as
select
  t.id as shift_type_id,
  t.tenant_id,
  t.location_id,
  t.code,
  t.label_ja,
  t.label_en,
  t.starts_at_local,
  t.ends_at_local,
  t.break_minutes,
  t.is_custom,
  t.sort_order,
  t.is_active
from workforce.shift_types t;

comment on view api.workforce_shift_types is
  'Tenant/location shift-type templates, relying entirely on wf_shift_types_read / wf_shift_types_write RLS for visibility. security_invoker view.';

create view api.workforce_shift_assignments
  with (security_invoker = true) as
select
  s.id as assignment_id,
  s.tenant_id,
  s.location_id,
  s.employee_id,
  s.shift_type_id,
  s.starts_at,
  s.ends_at,
  s.break_minutes,
  s.role,
  s.notes,
  s.published,
  s.created_at,
  s.updated_at
from workforce.shifts s;

comment on view api.workforce_shift_assignments is
  'Concrete shift occurrences (workforce.shifts), relying entirely on wf_shifts_select_published (staff, published-only) / wf_shifts_manage (managers, draft + published) RLS for visibility. security_invoker view.';

create view api.workforce_shift_requests
  with (security_invoker = true) as
select
  r.id as request_id,
  r.tenant_id,
  r.location_id,
  r.employee_id,
  r.shift_id,
  r.shift_type_id,
  r.work_date,
  r.kind,
  r.is_unavailable,
  r.status,
  r.details,
  r.attendance_id,
  r.created_at,
  r.updated_at
from workforce.shift_requests r;

comment on view api.workforce_shift_requests is
  'Shift preference / correction requests, relying entirely on wf_shift_requests_self_select (own rows) and wf_shift_requests_write (workforce.request.manage, all rows) RLS for visibility. No decided_by (no raw user ids). security_invoker view.';

create view api.workforce_attendance
  with (security_invoker = true) as
select
  a.id as attendance_id,
  a.tenant_id,
  a.location_id,
  a.employee_id,
  a.shift_id,
  a.work_date,
  a.clock_in,
  a.clock_out,
  a.status,
  a.transportation_cost,
  a.daily_message,
  a.created_at,
  a.updated_at
from workforce.attendance a;

comment on view api.workforce_attendance is
  'Attendance records, relying entirely on wf_attendance_manage (managers) and wf_attendance_self_select (own rows only) RLS for visibility. security_invoker view.';

-- Grants ------------------------------------------------------------------
grant select on api.workforce_shift_types to authenticated;
grant select on api.workforce_shift_assignments to authenticated;
grant select on api.workforce_shift_requests to authenticated;
grant select on api.workforce_attendance to authenticated;

-- anon/public: explicit fail-closed revoke, matching 0017/0018/0023's style
-- even though anon was never granted anything on these new objects.
revoke all on api.workforce_shift_types from anon, public;
revoke all on api.workforce_shift_assignments from anon, public;
revoke all on api.workforce_shift_requests from anon, public;
revoke all on api.workforce_attendance from anon, public;
