-- ============================================================================
-- 0061  Workforce: Staff-safe coworker roster (real display names, not
--       frontend-synthesized "Staff N" labels)
-- ----------------------------------------------------------------------------
-- PROBLEM (Founder P1, 2026-08-13, follow-up to 0059): the Staff schedule page
-- has never had ANY data path to a coworker's actual name. RLS on
-- workforce.employees (0022) only lets a plain shift.read (Staff) caller
-- SELECT their OWN row (wf_employees_self_read); every other employee's row --
-- including name_encrypted -- is invisible to them. api.workforce_my_staff_profile
-- and api.workforce_shift_assignments (both Staff-reachable) carry no name
-- field at all, and the two views that do carry names (api.workforce_staff_manage,
-- api.workforce_staff_directory) are gated to workforce.staff.read/.manage,
-- permissions the `employee` role never holds. So the Staff frontend
-- (apps/web/src/lib/preview/preview-staff-schedule.tsx) has been synthesizing
-- "Staff N" labels from a stable alphabetical sort of employee_id -- verified
-- directly against Preview: renaming all 5 QA employees to real Japanese names
-- through the normal Manager UI produced zero change in the Staff view, with
-- or without a reload.
--
-- FOUNDER DECISION (this migration): Staff members inside the same cafe
-- workforce/schedule scope are not anonymous to each other. Staff must see
-- real, Manager-entered display names, keyed by employee_id (never by name --
-- names may duplicate and change; employee_id remains the sole identity key).
--
-- SCOPE RULE: "same cafe workforce/schedule scope" is defined here identically
-- to how a coworker's shift already becomes visible to Staff (0026's
-- wf_shifts_select_published + 0059's active-employee filter): same tenant_id,
-- and same location_id OR either side is location_id IS NULL (tenant-wide --
-- mirroring the existing location_id IS NULL = tenant-wide convention already
-- used for workforce.recipes, 0022's header note, and core.role_assignments'
-- location_id IS NULL = tenant-wide permission grant, 0006_helpers.sql). This
-- is deliberately the narrowest rule that still matches "could this coworker
-- plausibly appear in my schedule" -- not "anyone in the tenant" and not
-- "anyone who has ever had a shift with me historically".
--
-- MINIMAL EXPOSURE: a new SECURITY DEFINER helper,
-- workforce.is_caller_employee_in_scope(tenant_id, location_id), answers only
-- "is the calling user an ACTIVE employee within this scope" -- the same
-- narrow, non-PII-boolean pattern 0059's workforce.is_employee_active_for_schedule
-- already established, needed here because a Staff caller cannot otherwise
-- read even their OWN row's tenant_id/location_id in the context of another
-- row's policy check without it. The new RLS policy
-- (wf_employees_coworker_roster_read) is purely additive: it grants SELECT on
-- an ACTIVE coworker's row within scope, on top of (never replacing) the
-- existing wf_employees_staff_read/self_read/staff_manage policies.
--
-- COLUMN MINIMIZATION: RLS is row-level only, so a new, narrow view
-- (api.workforce_staff_roster) does the column-level minimization -- it
-- projects ONLY employee_id, tenant_id, location_id, name_encrypted, is_active.
-- No email/phone/wage/LINE user id/user_id/name_hash/notes -- the exact fields
-- api.workforce_staff_manage carries and api.workforce_staff_roster must never
-- carry. name_encrypted stays ciphertext at this layer too: the application
-- server-side helper that queries this view (listWorkforceStaffRoster,
-- apps/web/src/lib/workforce/employees.ts) decrypts it with the same
-- decryptPII()/byteaToBuffer() helpers listWorkforceStaffForManager already
-- uses, and returns only { employeeId, displayName, isActive } to the caller
-- -- ciphertext never reaches a Server Action's return value, let alone the
-- browser.
-- ============================================================================

create or replace function workforce.is_caller_employee_in_scope(
  p_tenant_id uuid,
  p_location_id uuid
)
returns boolean
language sql stable security definer set search_path = workforce, core, public as $$
  select exists (
    select 1
    from workforce.employees caller
    where caller.user_id = core.current_user_id()
      and caller.tenant_id = p_tenant_id
      and caller.is_active = true
      and (
        caller.location_id = p_location_id
        or caller.location_id is null
        or p_location_id is null
      )
  );
$$;

comment on function workforce.is_caller_employee_in_scope(uuid, uuid) is
  'Non-PII helper for the Staff-safe coworker roster: true when the calling user is themselves an ACTIVE workforce.employees row in p_tenant_id, scoped to p_location_id with the same location_id IS NULL = tenant-wide convention used elsewhere (workforce.recipes, core.role_assignments). SECURITY DEFINER because a plain shift.read (Staff) caller cannot otherwise read even their own row in the context of evaluating another row''s RLS policy (wf_employees_self_read matches only user_id = current_user_id() on the ROW BEING READ, not an arbitrary tenant/location pair). Returns a boolean only -- never a name or other PII.';

revoke all on function workforce.is_caller_employee_in_scope(uuid, uuid) from public;
grant execute on function workforce.is_caller_employee_in_scope(uuid, uuid) to authenticated;

-- Additive: grants SELECT on an ACTIVE coworker's row within the caller's own
-- schedule scope, on top of the existing wf_employees_staff_read (staff.read/
-- .manage holders, unrestricted by active status) / wf_employees_self_read
-- (always own row) / wf_employees_staff_manage (staff.manage holders, all
-- ops) policies -- none of which are modified or removed.
create policy wf_employees_coworker_roster_read on workforce.employees
  for select
  using (
    is_active = true
    and workforce.is_caller_employee_in_scope(tenant_id, location_id)
  );

comment on policy wf_employees_coworker_roster_read on workforce.employees is
  'Lets a plain Staff (employee-role) caller SELECT an active coworker''s workforce.employees row when that coworker is within the caller''s own tenant/location schedule scope (workforce.is_caller_employee_in_scope). This is what api.workforce_staff_roster relies on for row visibility; it does not by itself expose any column -- api.workforce_staff_roster performs the column-level minimization (employee_id/tenant_id/location_id/name_encrypted/is_active only).';

-- --- api.workforce_staff_roster ----------------------------------------------
-- Staff-safe roster projection: employee_id + display name (still ciphertext
-- here) + is_active, and NOTHING else. security_invoker = true, so row
-- visibility is entirely governed by workforce.employees' own RLS
-- (wf_employees_coworker_roster_read above, plus the pre-existing
-- wf_employees_self_read/staff_read/staff_manage policies for a Manager
-- caller reading through this same view). No WHERE clause needed here for
-- the same reason api.workforce_staff_manage has none.
create view api.workforce_staff_roster
  with (security_invoker = true) as
select
  e.id as employee_id,
  e.tenant_id,
  e.location_id,
  e.name_encrypted,
  e.is_active
from workforce.employees e;

comment on view api.workforce_staff_roster is
  'Staff-safe coworker roster facade (0061): employee_id, tenant_id, location_id, name_encrypted (ciphertext -- decrypted server-side only, e.g. listWorkforceStaffRoster), is_active. Deliberately excludes name_hash/family_name_encrypted/given_name_encrypted/email_encrypted/email_hash/notes_encrypted/user_id/hourly_wage_yen/position_label/employment_type/created_at/updated_at -- everything api.workforce_staff_manage carries beyond what schedule display needs. Row visibility is entirely RLS-driven (security_invoker): a plain Staff caller sees their own row (wf_employees_self_read) plus any ACTIVE coworker within their own tenant/location schedule scope (wf_employees_coworker_roster_read, this migration); a Manager (staff.read/.manage holder) sees the full tenant/location roster via the pre-existing wf_employees_staff_read/staff_manage policies, active or not.';

revoke all on api.workforce_staff_roster from anon, public;
grant select on api.workforce_staff_roster to authenticated;
