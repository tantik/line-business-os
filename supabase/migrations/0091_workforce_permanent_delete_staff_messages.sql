-- ============================================================================
-- 0091  Workforce: staff_messages joins permanently_delete_employee's
--       history guard
-- ----------------------------------------------------------------------------
-- 0090 added workforce.staff_messages (the Mail module) after
-- 0056_workforce_employee_permanent_delete.sql's history check was written,
-- so a Mail thread was not yet one of the tables that guard inspects. This
-- closes that gap the same way every other domain (shifts/attendance/
-- shift_requests/shift_exchanges) is already protected: Permanent Delete
-- refuses whole-cloth when the employee has any message history, exactly
-- like it already refuses for a shift or an attendance row -- no cascade,
-- no partial deletion, zero mutations on a blocked call.
--
-- Founder direction (2026-08-25): the normal "employee leaves" action is,
-- and remains, `is_active = false` (Deactivate/Reactivate) -- untouched by
-- this migration, never blocked, never touches staff_messages or any other
-- history table. Permanent Delete is explicitly intended, long-term, to be
-- a genuine privacy-purge (cascade-delete all of an employee's data,
-- messages included) rather than a block-on-any-history guard -- that is a
-- separate, larger, not-yet-scoped future change (legal/compliance
-- implications, needs its own session) and is deliberately NOT implemented
-- here. This migration only keeps staff_messages consistent with today's
-- existing block-don't-cascade behavior for every other history table, so
-- Permanent Delete fails the same clean, guarded way for a Mail thread as
-- it already does for a shift, instead of hitting the employee_id foreign
-- key violation raw.
-- ============================================================================

create or replace function workforce.permanently_delete_employee(
  p_tenant_id uuid,
  p_employee_id uuid
)
returns table (
  deleted boolean,
  blocked_by_history boolean
)
language plpgsql
security definer
set search_path = core, workforce, public
as $$
declare
  v_location_id uuid;
  v_has_history boolean;
begin
  select e.location_id into v_location_id
  from workforce.employees e
  where e.tenant_id = p_tenant_id
    and e.id = p_employee_id;

  if v_location_id is null then
    return;
  end if;

  if not core.has_permission(p_tenant_id, 'workforce.staff.manage', v_location_id) then
    return;
  end if;

  select exists (
    select 1 from workforce.shifts s
    where s.tenant_id = p_tenant_id and s.employee_id = p_employee_id
    union all
    select 1 from workforce.attendance a
    where a.tenant_id = p_tenant_id and a.employee_id = p_employee_id
    union all
    select 1 from workforce.shift_requests r
    where r.tenant_id = p_tenant_id and r.employee_id = p_employee_id
    union all
    select 1 from workforce.shift_exchanges x
    where x.tenant_id = p_tenant_id
      and (x.requester_employee_id = p_employee_id or x.replacement_employee_id = p_employee_id)
    union all
    select 1 from workforce.staff_messages m
    where m.tenant_id = p_tenant_id and m.employee_id = p_employee_id
  ) into v_has_history;

  if v_has_history then
    return query select false, true;
    return;
  end if;

  delete from workforce.employees
  where tenant_id = p_tenant_id and id = p_employee_id;

  return query select true, false;
end;
$$;

comment on function workforce.permanently_delete_employee(uuid, uuid) is
  'Hard-deletes a workforce.employees row only when the caller holds workforce.staff.manage for its location and it has zero history across shifts/attendance/shift_requests/shift_exchanges/staff_messages (workforce.leave_requests excluded -- dead, unreachable legacy table, see 0056''s header). SECURITY DEFINER because authenticated has no DELETE grant on workforce.employees (0024, reaffirmed by 0002''s own grant-surface test) -- this function is the sole, guarded exception, and re-implements the manage-permission check inline since it cannot rely on RLS for it. Lives outside the api schema per ADR 0008 (no SECURITY DEFINER object in api); api.permanently_delete_employee is its invoker-only passthrough. Returns zero rows for not-found/unauthorized (indistinguishable to the caller); returns (false, true) when blocked by history; returns (true, false) on success. staff_messages joined the history check in 0091 -- a genuine privacy-purge cascade for Permanent Delete is a separate, future, not-yet-scoped change (see 0091''s header), not implemented by this function.';
