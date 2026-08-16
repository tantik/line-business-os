-- ============================================================================
-- 0056  Workforce: guarded permanent-delete RPC for workforce.employees
-- ----------------------------------------------------------------------------
-- Cafe v2.1 Staff lifecycle iteration separates two distinct actions that the
-- existing "Deactivate"/"Reactivate" UI (`api.workforce_staff_manage`'s own
-- `is_active` UPDATE, unchanged by this migration) already covers only the
-- first of:
--   1. Remove staff -- the normal action when an employee leaves. Always
--      available, never blocked, never touches this migration's function --
--      it is the existing `is_active = false` soft-update.
--   2. Permanent Delete -- allowed ONLY when the employee has zero historical
--      references anywhere (never used for scheduling/attendance/requests).
--
-- CONFIRMED INVARIANT (do not re-assume): `workforce.employees` has a `for
-- all` RLS policy (`wf_employees_staff_manage`, 0022) that would *authorize*
-- a `workforce.staff.manage` holder's DELETE, but 0024 deliberately withheld
-- the table-level DELETE grant itself ("staff-profile retirement is
-- `is_active = false`, an UPDATE"). `0002_security_rls.sql`'s own test suite
-- asserts this as a hard invariant across the entire `workforce` schema --
-- "authenticated has no DELETE grant anywhere in workforce" (the only
-- pre-existing exception is the three recipe-content tables) -- confirmed by
-- attempting exactly that grant here first and watching this suite fail it.
-- So this migration does NOT grant DELETE to `authenticated`, mirroring
-- Inventory's equivalent (0055) instead: the guarded logic (history check +
-- the actual privileged DELETE) lives in `workforce.permanently_delete_employee`,
-- a SECURITY DEFINER function outside the `api` schema per ADR 0008 ("no
-- SECURITY DEFINER object in api schema"), re-implementing the
-- `workforce.staff.manage` + location check inline since it cannot lean on
-- RLS for it (SECURITY DEFINER runs as the function owner, not the caller).
-- `api.permanently_delete_employee` is a thin SECURITY INVOKER passthrough
-- with no table access of its own, same shape as
-- `api.permanently_delete_inventory_item`.
--
-- History checked: workforce.shifts, workforce.attendance,
-- workforce.shift_requests (correction requests + legacy swap/pickup/drop),
-- workforce.shift_exchanges (as requester or replacement).
--
-- workforce.leave_requests (0009) is deliberately excluded: dead, unreachable
-- legacy schema for this module -- no Cafe facade, grant, or app code
-- references it at all, so it is not a live history source.
--
-- `workforce.employee_line_links` (0029) is a LINE-binding record, not
-- history -- it is deleted as part of a successful permanent delete (its own
-- FK already cascades on `workforce.employees` delete, so no explicit
-- statement is required here), never counted as a reason to block.
--
-- Never cascades past that: any history hit blocks the whole delete with
-- zero mutations, exactly like Inventory's equivalent.
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
    -- Not found, or the employee has no location -- indistinguishable to the
    -- caller, matching every other staff write path's `not_found`
    -- convention. An employee with no location can never be resolved to a
    -- manager's own scoped location, so it can never legitimately match the
    -- permission check below either.
    return;
  end if;

  if not core.has_permission(p_tenant_id, 'workforce.staff.manage', v_location_id) then
    -- Zero rows here too -- unauthorized and not_found stay indistinguishable
    -- to the caller, matching every other staff write path.
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
  'Hard-deletes a workforce.employees row only when the caller holds workforce.staff.manage for its location and it has zero history across shifts/attendance/shift_requests/shift_exchanges (workforce.leave_requests excluded -- dead, unreachable legacy table, see migration header). SECURITY DEFINER because authenticated has no DELETE grant on workforce.employees (0024, reaffirmed by 0002''s own grant-surface test) -- this function is the sole, guarded exception, and re-implements the manage-permission check inline since it cannot rely on RLS for it. Lives outside the api schema per ADR 0008 (no SECURITY DEFINER object in api); api.permanently_delete_employee is its invoker-only passthrough. Returns zero rows for not-found/unauthorized (indistinguishable to the caller); returns (false, true) when blocked by history; returns (true, false) on success.';

revoke all on function workforce.permanently_delete_employee(uuid, uuid) from public;
grant execute on function workforce.permanently_delete_employee(uuid, uuid) to authenticated;

create or replace function api.permanently_delete_employee(
  p_tenant_id uuid,
  p_employee_id uuid
)
returns table (
  deleted boolean,
  blocked_by_history boolean
)
language sql
security invoker
set search_path = workforce, public
as $$
  select * from workforce.permanently_delete_employee(p_tenant_id, p_employee_id);
$$;

comment on function api.permanently_delete_employee(uuid, uuid) is
  'Invoker-only passthrough to workforce.permanently_delete_employee -- satisfies ADR 0008''s no-SECURITY-DEFINER-in-api invariant by construction (same shape as api.has_permission, 0019, and api.permanently_delete_inventory_item, 0055). All authorization/history-guard logic lives in the workforce-schema DEFINER function.';

revoke all on function api.permanently_delete_employee(uuid, uuid) from public;
grant execute on function api.permanently_delete_employee(uuid, uuid) to authenticated;
