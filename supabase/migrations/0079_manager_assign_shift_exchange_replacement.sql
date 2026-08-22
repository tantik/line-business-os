-- Shift Exchange Manager Resolution UX (2026-08-22): a Manager currently has
-- no way to assign a replacement employee to an 'exchange'-kind request that
-- has none yet -- `api.decide_workforce_shift_exchange`'s approve path
-- already requires `replacement_employee_id is not null`
-- (`shift_exchange_replacement_required`), but the only existing path that
-- ever sets that column is `api.accept_workforce_shift_exchange`, which is
-- self-service (the accepting employee's id is resolved from their own
-- session, not passed as an argument) and explicitly excludes the requester
-- accepting their own request. There is no Manager-facing equivalent.
--
-- This migration adds exactly one new RPC, modeled directly on
-- `api.accept_workforce_shift_exchange` (0044_workforce_shift_exchanges.sql)
-- so a Manager can perform the same assignment on a colleague's behalf.
--
-- No schema/table/RLS-policy change: `workforce.shift_exchanges` already
-- grants `update` to `authenticated` (0044), the existing
-- `wf_shift_exchanges_manage` RLS policy already permits a caller holding
-- `workforce.request.manage` to update any row in their tenant/location, and
-- `workforce.guard_shift_exchange_update`'s trigger already bypasses its own
-- column-transition checks entirely for that same permission
-- (`if core.has_permission(...) then return new; end if;`, 0044). This
-- function's job is purely to validate the replacement employee (tenant +
-- location + active, mirrors `accept`'s own employee lookup) and preserve
-- the same hard schedule-conflict block `accept`/`decide` already enforce --
-- it does not loosen or invent any new authorization or business rule.
--
-- Deliberately left as a warning-only concern in the UI, not enforced here:
-- an employee having marked the target date `Unavailable` was never a hard
-- block in the existing accept/decide RPCs either (only an overlapping
-- *published* shift is) -- this migration does not change that.

create or replace function api.manager_assign_shift_exchange_replacement(
  p_exchange_id uuid,
  p_replacement_employee_id uuid
)
returns table (exchange_id uuid, status text, replacement_employee_id uuid)
language plpgsql
security invoker
set search_path = core, workforce, public
as $$
declare
  v_exchange workforce.shift_exchanges%rowtype;
begin
  select x.* into v_exchange
  from workforce.shift_exchanges x
  where x.id = p_exchange_id
    and x.status = 'open'
    and x.request_kind = 'exchange'
    and core.has_permission(x.tenant_id, 'workforce.request.manage', x.location_id)
  for update;

  if not found then
    raise exception 'shift_exchange_not_assignable' using errcode = 'P0001';
  end if;

  if p_replacement_employee_id = v_exchange.requester_employee_id then
    raise exception 'shift_exchange_invalid_replacement' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from workforce.employees e
    where e.tenant_id = v_exchange.tenant_id
      and e.id = p_replacement_employee_id
      and e.location_id = v_exchange.location_id
      and e.is_active = true
  ) then
    raise exception 'shift_exchange_invalid_replacement' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from workforce.shifts candidate
    join workforce.shifts offered
      on offered.tenant_id = v_exchange.tenant_id
     and offered.id = v_exchange.shift_id
    where candidate.tenant_id = v_exchange.tenant_id
      and candidate.employee_id = p_replacement_employee_id
      and candidate.published = true
      and candidate.id <> offered.id
      and tstzrange(candidate.starts_at, candidate.ends_at, '[)')
          && tstzrange(offered.starts_at, offered.ends_at, '[)')
  ) then
    raise exception 'shift_exchange_schedule_conflict' using errcode = 'P0001';
  end if;

  return query
  update workforce.shift_exchanges x
     set replacement_employee_id = p_replacement_employee_id
   where x.id = p_exchange_id
  returning x.id, x.status, x.replacement_employee_id;
end;
$$;

revoke all on function api.manager_assign_shift_exchange_replacement(uuid, uuid) from public;
grant execute on function api.manager_assign_shift_exchange_replacement(uuid, uuid) to authenticated;
