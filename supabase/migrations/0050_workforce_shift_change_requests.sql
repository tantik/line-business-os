-- Cafe v2.1: one auditable request flow for exchange, change, or cancellation.
-- Existing rows remain `exchange`; all mutations remain manager-approved.

alter table workforce.shift_exchanges
  add column request_kind text not null default 'exchange'
    check (request_kind in ('exchange', 'change', 'cancel')),
  add column requested_shift_type_id uuid,
  add constraint workforce_shift_exchanges_requested_type_fkey
    foreign key (tenant_id, requested_shift_type_id)
    references workforce.shift_types(tenant_id, id),
  add constraint workforce_shift_exchanges_request_shape_check check (
    (request_kind = 'change' and requested_shift_type_id is not null)
    or (request_kind in ('exchange', 'cancel') and requested_shift_type_id is null)
  );

create or replace function workforce.guard_shift_exchange_update()
returns trigger
language plpgsql
set search_path = core, workforce, public
as $$
begin
  if core.has_permission(old.tenant_id, 'workforce.request.manage', old.location_id) then
    return new;
  end if;

  if old.request_kind = 'exchange'
     and old.status = 'open'
     and new.status = 'accepted'
     and workforce.is_own_employee(new.replacement_employee_id)
     and not workforce.is_own_employee(old.requester_employee_id) then
    if new.tenant_id <> old.tenant_id
       or new.location_id <> old.location_id
       or new.shift_id <> old.shift_id
       or new.requester_employee_id <> old.requester_employee_id
       or new.reason <> old.reason
       or new.request_kind <> old.request_kind
       or new.requested_shift_type_id is distinct from old.requested_shift_type_id
       or new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at then
      raise exception 'shift_exchange_immutable_fields' using errcode = 'P0001';
    end if;
    new.accepted_at := clock_timestamp();
    return new;
  end if;

  if old.status in ('open', 'accepted')
     and new.status = 'cancelled'
     and workforce.is_own_employee(old.requester_employee_id) then
    if new.tenant_id <> old.tenant_id
       or new.location_id <> old.location_id
       or new.shift_id <> old.shift_id
       or new.requester_employee_id <> old.requester_employee_id
       or new.replacement_employee_id is distinct from old.replacement_employee_id
       or new.reason <> old.reason
       or new.request_kind <> old.request_kind
       or new.requested_shift_type_id is distinct from old.requested_shift_type_id
       or new.accepted_at is distinct from old.accepted_at
       or new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at then
      raise exception 'shift_exchange_immutable_fields' using errcode = 'P0001';
    end if;
    return new;
  end if;

  raise exception 'shift_exchange_invalid_transition' using errcode = 'P0001';
end;
$$;

drop policy if exists wf_shift_exchanges_request on workforce.shift_exchanges;
create policy wf_shift_exchanges_request on workforce.shift_exchanges
  for insert with check (
    workforce.is_own_employee(requester_employee_id)
    and replacement_employee_id is null
    and status = 'open'
    and length(btrim(reason)) between 1 and 500
    and exists (
      select 1 from workforce.shifts s
      where s.tenant_id = shift_exchanges.tenant_id
        and s.location_id = shift_exchanges.location_id
        and s.id = shift_exchanges.shift_id
        and s.employee_id = shift_exchanges.requester_employee_id
        and s.published = true
        and s.starts_at > clock_timestamp()
    )
    and (
      (request_kind in ('exchange', 'cancel') and requested_shift_type_id is null)
      or (
        request_kind = 'change'
        and exists (
          select 1 from workforce.shift_types st
          where st.tenant_id = shift_exchanges.tenant_id
            and st.id = shift_exchanges.requested_shift_type_id
            and st.is_active = true
            and (st.location_id is null or st.location_id = shift_exchanges.location_id)
        )
      )
    )
  );

create or replace view api.workforce_shift_exchanges
  with (security_invoker = true) as
select
  x.id as exchange_id,
  x.tenant_id,
  x.location_id,
  x.shift_id,
  x.requester_employee_id,
  x.replacement_employee_id,
  x.reason,
  x.status,
  x.accepted_at,
  x.decided_at,
  x.created_at,
  x.updated_at,
  x.request_kind,
  x.requested_shift_type_id
from workforce.shift_exchanges x;

revoke all on api.workforce_shift_exchanges from anon, public;
grant select, insert on api.workforce_shift_exchanges to authenticated;

create or replace function api.accept_workforce_shift_exchange(p_exchange_id uuid)
returns table (exchange_id uuid, status text, replacement_employee_id uuid)
language plpgsql security invoker
set search_path = core, workforce, public
as $$
declare
  v_exchange workforce.shift_exchanges%rowtype;
  v_employee_id uuid;
begin
  select x.* into v_exchange from workforce.shift_exchanges x
   where x.id = p_exchange_id and x.status = 'open' and x.request_kind = 'exchange'
   for update;
  if not found then raise exception 'shift_exchange_not_open' using errcode = 'P0001'; end if;

  select e.id into v_employee_id from workforce.employees e
   where e.tenant_id = v_exchange.tenant_id and e.location_id = v_exchange.location_id
     and e.is_active and workforce.is_own_employee(e.id) limit 1;
  if v_employee_id is null or v_employee_id = v_exchange.requester_employee_id then
    raise exception 'shift_exchange_not_eligible' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from workforce.shifts candidate, workforce.shifts offered
     where offered.id = v_exchange.shift_id and candidate.tenant_id = v_exchange.tenant_id
       and candidate.employee_id = v_employee_id and candidate.published
       and tstzrange(candidate.starts_at, candidate.ends_at, '[)') && tstzrange(offered.starts_at, offered.ends_at, '[)')
  ) then raise exception 'shift_exchange_schedule_conflict' using errcode = 'P0001'; end if;

  return query update workforce.shift_exchanges x
    set replacement_employee_id = v_employee_id, status = 'accepted', accepted_at = clock_timestamp()
    where x.id = p_exchange_id returning x.id, x.status, x.replacement_employee_id;
end;
$$;

create or replace function workforce.shift_request_location_timezone(p_tenant_id uuid, p_location_id uuid)
returns text
language sql stable security definer
set search_path = core, workforce, public
as $$
  select l.timezone
    from core.locations l
   where l.tenant_id = p_tenant_id
     and l.id = p_location_id
     and core.has_permission(p_tenant_id, 'workforce.request.manage', p_location_id)
$$;

revoke all on function workforce.shift_request_location_timezone(uuid, uuid) from public;
grant execute on function workforce.shift_request_location_timezone(uuid, uuid) to authenticated;

create or replace function api.decide_workforce_shift_exchange(p_exchange_id uuid, p_decision text)
returns table (exchange_id uuid, status text, shift_id uuid, replacement_employee_id uuid)
language plpgsql security invoker
set search_path = core, workforce, public
as $$
declare
  v_request workforce.shift_exchanges%rowtype;
  v_shift workforce.shifts%rowtype;
  v_type_id uuid;
  v_type_start time;
  v_type_end time;
  v_type_break integer;
  v_timezone text;
  v_work_date date;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'shift_exchange_invalid_decision' using errcode = '22023';
  end if;
  select x.* into v_request from workforce.shift_exchanges x
   where x.id = p_exchange_id and x.status in ('open', 'accepted')
     and core.has_permission(x.tenant_id, 'workforce.request.manage', x.location_id)
   for update;
  if not found then raise exception 'shift_exchange_not_decidable' using errcode = 'P0001'; end if;

  if p_decision = 'approved' then
    select s.* into v_shift from workforce.shifts s
     where s.tenant_id = v_request.tenant_id and s.location_id = v_request.location_id
       and s.id = v_request.shift_id and s.employee_id = v_request.requester_employee_id
       and s.published and s.starts_at > clock_timestamp() for update;
    if not found then raise exception 'shift_exchange_shift_changed' using errcode = 'P0001'; end if;

    if v_request.request_kind = 'exchange' then
      if v_request.replacement_employee_id is null then
        raise exception 'shift_exchange_replacement_required' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from workforce.shifts candidate
        where candidate.tenant_id = v_request.tenant_id
          and candidate.employee_id = v_request.replacement_employee_id
          and candidate.published
          and candidate.id <> v_shift.id
          and tstzrange(candidate.starts_at, candidate.ends_at, '[)')
              && tstzrange(v_shift.starts_at, v_shift.ends_at, '[)')
      ) then raise exception 'shift_exchange_schedule_conflict' using errcode = 'P0001'; end if;
      update workforce.shifts set employee_id = v_request.replacement_employee_id where id = v_shift.id;
    elsif v_request.request_kind = 'cancel' then
      update workforce.shifts set employee_id = null where id = v_shift.id;
    else
      select st.id, st.starts_at_local, st.ends_at_local, st.break_minutes
        into v_type_id, v_type_start, v_type_end, v_type_break
        from workforce.shift_types st
       where st.tenant_id = v_request.tenant_id
         and st.id = v_request.requested_shift_type_id
         and st.is_active
         and st.location_id = v_request.location_id;
      if not found then raise exception 'shift_change_type_unavailable' using errcode = 'P0001'; end if;
      v_timezone := workforce.shift_request_location_timezone(v_request.tenant_id, v_request.location_id);
      if v_timezone is null then raise exception 'shift_change_location_unavailable' using errcode = 'P0001'; end if;
      v_work_date := (v_shift.starts_at at time zone v_timezone)::date;
      update workforce.shifts s
         set shift_type_id = v_type_id,
             starts_at = ((v_work_date + v_type_start) at time zone v_timezone),
             ends_at = ((v_work_date + v_type_end) at time zone v_timezone),
             break_minutes = v_type_break
       where s.id = v_shift.id;
      if not found then raise exception 'shift_exchange_shift_changed' using errcode = 'P0001'; end if;
    end if;
  end if;

  return query update workforce.shift_exchanges x
    set status = p_decision, decided_by = core.current_user_id(), decided_at = clock_timestamp()
    where x.id = p_exchange_id returning x.id, x.status, x.shift_id, x.replacement_employee_id;
end;
$$;

revoke all on function api.accept_workforce_shift_exchange(uuid) from public;
revoke all on function api.decide_workforce_shift_exchange(uuid, text) from public;
grant execute on function api.accept_workforce_shift_exchange(uuid) to authenticated;
grant execute on function api.decide_workforce_shift_exchange(uuid, text) to authenticated;
