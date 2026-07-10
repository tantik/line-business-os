-- ============================================================================
-- 0027  Workforce Cafe v0.1: extend workforce.attendance + fix self-scope
--       (Slice 1A)
-- ----------------------------------------------------------------------------
-- workforce.attendance (0009_workforce.sql) is extended in place, never
-- renamed. Two new nullable columns (transportation_cost, daily_message) plus
-- a `unique (tenant_id, id)` constraint -- the latter is added here, ahead of
-- 0028's shift_requests.attendance_id column, purely so that FK can be a
-- composite tenant-safe reference `(tenant_id, attendance_id) references
-- attendance(tenant_id, id)` (same pattern as 0021/0025's location_id/
-- shift_type_id composite FKs).
--
-- --- The self-scope security fix (this migration's main purpose) ----------
-- 0009's single wf_attendance_rw policy gated ALL of select/insert/update/
-- delete behind workforce.attendance.manage alone. That looked like a
-- manager-only policy, but 0008_rbac_seed.sql's system `employee` role ALSO
-- holds workforce.attendance.manage (so staff can log their own clock-in/out)
-- -- which means, as written, any employee holding that permission could
-- read/write EVERY employee's attendance rows at their location, not just
-- their own. That is the "unsafe employee-role tenant-wide attendance.manage
-- grant" this slice's task brief calls out.
--
-- Fixed by two changes, together:
--   1. This migration deletes the (`employee` system role) ->
--      workforce.attendance.manage role_permission row. Only manager/admin/
--      owner now hold attendance.manage (0008_rbac_seed.sql's `employee` row
--      is a legacy/historical migration and is not edited -- this is a new,
--      forward-only DELETE against its data, exactly like 0022's UPDATE-only
--      rewiring of workforce.employees' policies without editing 0009/0020).
--   2. New self-scope RLS policies (select/insert/update, keyed to
--      workforce.is_own_employee(employee_id) -- new helper below) replace
--      the employee role's now-removed blanket access with "own rows only."
--      No self-scope DELETE: matches the no-hard-delete convention already
--      used elsewhere in this schema (0022).
-- Manager access is unchanged: wf_attendance_manage (renamed from
-- wf_attendance_rw, same predicate) still grants attendance.manage holders
-- full for-all access across their tenant/location.
-- ============================================================================

alter table workforce.attendance
  add column if not exists transportation_cost integer,
  add column if not exists daily_message text;

alter table workforce.attendance
  add constraint attendance_transportation_cost_check
    check (transportation_cost is null or transportation_cost >= 0);

alter table workforce.attendance
  add constraint attendance_tenant_id_id_key unique (tenant_id, id);

comment on column workforce.attendance.transportation_cost is
  'Optional per-day transportation cost in the tenant''s local currency minor-unit-free integer (e.g. yen), self-reported by staff.';
comment on column workforce.attendance.daily_message is
  'Optional free-text daily message/note from staff, shown to managers alongside the day''s attendance record.';

-- --- workforce.is_own_employee ---------------------------------------------
-- True when p_employee_id is the caller's own workforce.employees row (i.e.
-- that row's user_id = core.current_user_id()). Deliberately plain SECURITY
-- INVOKER (the default -- no `security definer` clause), same reasoning as
-- workforce.can_manage_recipe (0022): the `from workforce.employees e` lookup
-- runs under the calling role's own privileges, so it is automatically
-- filtered by employees' own wf_employees_self_read RLS policy first (which
-- already permits exactly `user_id = core.current_user_id()`), and the
-- explicit `e.user_id = core.current_user_id()` predicate below is what
-- actually decides the answer. No elevated privilege is needed for a correct
-- result, so none is granted. Shared by workforce.attendance (this migration)
-- and workforce.shift_requests (0028) self-scope policies.
create or replace function workforce.is_own_employee(p_employee_id uuid)
returns boolean
language sql stable
set search_path = core, workforce, public
as $$
  select exists (
    select 1
    from workforce.employees e
    where e.id = p_employee_id
      and e.user_id = core.current_user_id()
  );
$$;

comment on function workforce.is_own_employee(uuid) is
  'True when p_employee_id is the caller''s own workforce.employees row (user_id = core.current_user_id()). Plain SECURITY INVOKER: correctness relies on workforce.employees'' own SELECT RLS plus an explicit predicate, not on bypassing RLS. Used by attendance and shift_requests self-scope policies.';

revoke all on function workforce.is_own_employee(uuid) from public;
grant execute on function workforce.is_own_employee(uuid) to authenticated;

-- --- Remove the unsafe tenant-wide employee-role grant ----------------------
delete from core.role_permissions
 where role_id = '00000000-0000-0000-0000-000000000006' -- system `employee` role
   and permission_key = 'workforce.attendance.manage';

-- RLS -------------------------------------------------------------------------
drop policy if exists wf_attendance_rw on workforce.attendance;

create policy wf_attendance_manage on workforce.attendance
  for all
  using (core.has_permission(tenant_id, 'workforce.attendance.manage', location_id))
  with check (core.has_permission(tenant_id, 'workforce.attendance.manage', location_id));

create policy wf_attendance_self_select on workforce.attendance
  for select
  using (workforce.is_own_employee(employee_id));

create policy wf_attendance_self_insert on workforce.attendance
  for insert
  with check (workforce.is_own_employee(employee_id));

create policy wf_attendance_self_update on workforce.attendance
  for update
  using (workforce.is_own_employee(employee_id))
  with check (workforce.is_own_employee(employee_id));

-- Grants ------------------------------------------------------------------
-- First direct-DB grant of any kind on workforce.attendance to authenticated.
-- Required for the self-scope RLS policies above to have anything to engage
-- against (a role with zero table grants is denied before RLS is evaluated).
grant select, insert, update on workforce.attendance to authenticated;
