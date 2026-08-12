-- ============================================================================
-- 0059  Staff schedule: exclude deactivated employees' shifts from the
--       Staff-safe read projection (api.workforce_shift_assignments)
-- ----------------------------------------------------------------------------
-- PROBLEM (STALE-STAFF-ROSTER-LEAK): the Staff schedule page derives its
-- roster purely from `api.workforce_shift_assignments` rows for the
-- displayed week (apps/web/src/lib/preview/preview-staff-schedule.tsx) -- it
-- has never had a way to know an assignment's employee is deactivated,
-- because Staff (the `employee` role) holds only `workforce.shift.read`, not
-- `workforce.staff.read`/`workforce.staff.manage`. A deactivated employee's
-- historical/published shift_assignments rows are therefore fully RLS-visible
-- to every other Staff member forever (0026_workforce_cafe_shifts_extension's
-- wf_shifts_select_published policy checks only `published = true` + tenant/
-- location permission, never workforce.employees.is_active). Manager's own
-- roster is unaffected -- it is staff-list-driven, not assignment-driven
-- (listWorkforceStaffForManager + PreviewManagerRosterSection's
-- `staff.filter(isActive)`), and already excludes inactive employees.
--
-- REJECTED APPROACH (reverted in d1f2d48 / PR #216, see #217's revert): have
-- the Staff page additionally call `listWorkforceStaffDirectory`
-- (api.workforce_staff_directory) to build an active-employee-id set on the
-- client. That view is RLS-gated to `workforce.staff.read` OR
-- `workforce.staff.manage` -- permissions the `employee` role does NOT hold
-- (0008_rbac_seed.sql) -- so for a real Staff caller the call returns empty/
-- denied, the page's own fail-open branch (`activeStaffIds === null`) made
-- the filter a silent no-op, and the "fix" never actually engaged for the
-- users it was meant to protect.
--
-- FIX: extend the existing api.workforce_shift_assignments view itself
-- (Option A) so a deactivated employee's shift rows are excluded from what a
-- plain shift.read-only (Staff) caller gets back, without ever exposing the
-- staff directory or any PII to Staff. This requires one narrow SECURITY
-- DEFINER helper -- `workforce.is_employee_active_for_schedule` -- because a
-- Staff caller's own row-level access to workforce.employees is restricted to
-- their own row (wf_employees_self_read, 0022_workforce_staff_recipes_rls_
-- policies.sql); a security_invoker join from the view straight to
-- workforce.employees would silently collapse to "only my own employee row
-- matches", hiding every coworker's shift instead of just deactivated ones.
-- The helper returns a single boolean (never a name/PII), always scoped to
-- the assignment's own tenant_id/location_id (defense in depth against
-- cross-tenant/location probing via a crafted employee_id), and reads
-- workforce.employees.is_active directly -- it never touches the
-- permission-gated staff-directory views, so it works identically for every
-- shift.read holder regardless of whether they also hold staff.read/manage.
--
-- Manager (workforce.shift.write holders -- the same permission
-- wf_shifts_manage already keys manager-tier draft+published visibility off
-- of) is exempted from this filter entirely and keeps seeing every
-- assignment regardless of employee status, preserving full historical/audit
-- visibility through this same read path. The currently signed-in Staff
-- member's own assignments are also always visible regardless of their own
-- is_active value (belt-and-suspenders; in practice a deactivated employee's
-- login access is handled elsewhere). No RLS policy changes; no new grants
-- beyond EXECUTE on the new function. Historical shift rows are never
-- deleted or mutated by this migration -- only what Staff reads through the
-- view changes.
-- ============================================================================

create or replace function workforce.is_employee_active_for_schedule(
  p_employee_id uuid,
  p_tenant_id uuid,
  p_location_id uuid
)
returns boolean
language sql stable security definer set search_path = workforce, public as $$
  select coalesce(
    (
      select e.is_active
      from workforce.employees e
      where e.id = p_employee_id
        and e.tenant_id = p_tenant_id
        and (e.location_id is null or e.location_id = p_location_id)
    ),
    false
  );
$$;

comment on function workforce.is_employee_active_for_schedule is
  'Non-PII helper for the Staff-safe schedule projection: returns whether the given employee is active, scoped to the caller-supplied tenant/location (defense in depth). SECURITY DEFINER because a plain shift.read (Staff) caller cannot otherwise read any workforce.employees row except their own (wf_employees_self_read). Returns a single boolean only -- never a name or other PII -- and never touches the staff.read/staff.manage-gated directory views. Returns false (never true) for an employee_id that does not exist or does not match the given tenant/location.';

revoke all on function workforce.is_employee_active_for_schedule(uuid, uuid, uuid) from public;
grant execute on function workforce.is_employee_active_for_schedule(uuid, uuid, uuid) to authenticated;

create or replace view api.workforce_shift_assignments
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
from workforce.shifts s
where
  s.employee_id is null
  -- Manager tier (same permission wf_shifts_manage already keys draft+
  -- published visibility off of): unfiltered, sees every assignment.
  or core.has_permission(s.tenant_id, 'workforce.shift.write', s.location_id)
  -- The signed-in caller's own assignment is always visible to them.
  or exists (
    select 1 from workforce.employees e
    where e.id = s.employee_id and e.user_id = core.current_user_id()
  )
  -- Otherwise (plain Staff viewing a coworker's assignment): only if that
  -- coworker is currently active.
  or workforce.is_employee_active_for_schedule(s.employee_id, s.tenant_id, s.location_id)
;

comment on view api.workforce_shift_assignments is
  'Concrete shift occurrences (workforce.shifts), relying on wf_shifts_select_published (staff, published-only) / wf_shifts_manage (managers, draft + published) RLS for base visibility, PLUS an additional filter (this migration, 0059) that excludes a deactivated employee''s assignments for plain shift.read (Staff) callers -- manager-tier (shift.write) callers and the assignment''s own employee are exempt from that additional filter. security_invoker view.';
