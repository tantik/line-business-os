-- Cafe v2 Final Improvements: auditable, manager-approved shift exchange.

alter table workforce.shifts
  add constraint shifts_tenant_id_id_key unique (tenant_id, id);

create table workforce.shift_exchanges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  location_id uuid not null,
  shift_id uuid not null,
  requester_employee_id uuid not null,
  replacement_employee_id uuid,
  reason text not null,
  status text not null default 'open'
    check (status in ('open', 'accepted', 'approved', 'rejected', 'cancelled')),
  accepted_at timestamptz,
  decided_by uuid references core.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, location_id)
    references core.locations(tenant_id, id),
  foreign key (tenant_id, shift_id)
    references workforce.shifts(tenant_id, id),
  foreign key (tenant_id, requester_employee_id)
    references workforce.employees(tenant_id, id),
  foreign key (tenant_id, replacement_employee_id)
    references workforce.employees(tenant_id, id),
  check (replacement_employee_id is null or replacement_employee_id <> requester_employee_id)
);

create unique index wf_shift_exchanges_one_active_per_shift
  on workforce.shift_exchanges (tenant_id, shift_id)
  where status in ('open', 'accepted');
create index wf_shift_exchanges_location_status
  on workforce.shift_exchanges (tenant_id, location_id, status, created_at desc);

create trigger set_updated_at
  before update on workforce.shift_exchanges
  for each row execute function core.set_updated_at();

create or replace function workforce.guard_shift_exchange_update()
returns trigger
language plpgsql
set search_path = core, workforce, public
as $$
begin
  if core.has_permission(old.tenant_id, 'workforce.request.manage', old.location_id) then
    return new;
  end if;

  if old.status = 'open'
     and new.status = 'accepted'
     and workforce.is_own_employee(new.replacement_employee_id)
     and not workforce.is_own_employee(old.requester_employee_id) then
    if new.tenant_id <> old.tenant_id
       or new.location_id <> old.location_id
       or new.shift_id <> old.shift_id
       or new.requester_employee_id <> old.requester_employee_id
       or new.reason <> old.reason
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

create trigger guard_shift_exchange_update
  before update on workforce.shift_exchanges
  for each row execute function workforce.guard_shift_exchange_update();

alter table workforce.shift_exchanges enable row level security;

create policy wf_shift_exchanges_read on workforce.shift_exchanges
  for select using (
    workforce.is_own_employee(requester_employee_id)
    or (
      replacement_employee_id is not null
      and workforce.is_own_employee(replacement_employee_id)
    )
    or core.has_permission(tenant_id, 'workforce.request.manage', location_id)
    or (
      status = 'open'
      and core.has_permission(tenant_id, 'workforce.shift.read', location_id)
    )
  );

create policy wf_shift_exchanges_request on workforce.shift_exchanges
  for insert with check (
    workforce.is_own_employee(requester_employee_id)
    and replacement_employee_id is null
    and status = 'open'
    and length(btrim(reason)) between 1 and 500
    and exists (
      select 1
      from workforce.shifts s
      where s.tenant_id = shift_exchanges.tenant_id
        and s.location_id = shift_exchanges.location_id
        and s.id = shift_exchanges.shift_id
        and s.employee_id = shift_exchanges.requester_employee_id
        and s.published = true
        and s.starts_at > clock_timestamp()
    )
  );

create policy wf_shift_exchanges_manage on workforce.shift_exchanges
  for update
  using (core.has_permission(tenant_id, 'workforce.request.manage', location_id))
  with check (core.has_permission(tenant_id, 'workforce.request.manage', location_id));

create policy wf_shift_exchanges_accept on workforce.shift_exchanges
  for update
  using (
    status = 'open'
    and core.has_permission(tenant_id, 'workforce.shift.read', location_id)
  )
  with check (
    status = 'accepted'
    and replacement_employee_id is not null
    and workforce.is_own_employee(replacement_employee_id)
    and not workforce.is_own_employee(requester_employee_id)
  );

create policy wf_shift_exchanges_cancel_own on workforce.shift_exchanges
  for update
  using (
    status in ('open', 'accepted')
    and workforce.is_own_employee(requester_employee_id)
  )
  with check (
    status = 'cancelled'
    and workforce.is_own_employee(requester_employee_id)
  );

grant select, insert, update on workforce.shift_exchanges to authenticated;

create view api.workforce_shift_exchanges
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
  x.updated_at
from workforce.shift_exchanges x;

grant select, insert on api.workforce_shift_exchanges to authenticated;
revoke all on api.workforce_shift_exchanges from anon, public;

create or replace function api.accept_workforce_shift_exchange(
  p_exchange_id uuid
)
returns table (exchange_id uuid, status text, replacement_employee_id uuid)
language plpgsql
security invoker
set search_path = core, workforce, public
as $$
declare
  v_exchange workforce.shift_exchanges%rowtype;
  v_employee_id uuid;
begin
  select x.* into v_exchange
  from workforce.shift_exchanges x
  where x.id = p_exchange_id
    and x.status = 'open'
  for update;

  if not found then
    raise exception 'shift_exchange_not_open' using errcode = 'P0001';
  end if;

  select e.id into v_employee_id
  from workforce.employees e
  where e.tenant_id = v_exchange.tenant_id
    and e.location_id = v_exchange.location_id
    and e.is_active = true
    and workforce.is_own_employee(e.id)
  limit 1;

  if v_employee_id is null or v_employee_id = v_exchange.requester_employee_id then
    raise exception 'shift_exchange_not_eligible' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from workforce.shifts candidate, workforce.shifts offered
    where offered.id = v_exchange.shift_id
      and candidate.tenant_id = v_exchange.tenant_id
      and candidate.employee_id = v_employee_id
      and candidate.published = true
      and tstzrange(candidate.starts_at, candidate.ends_at, '[)')
          && tstzrange(offered.starts_at, offered.ends_at, '[)')
  ) then
    raise exception 'shift_exchange_schedule_conflict' using errcode = 'P0001';
  end if;

  return query
  update workforce.shift_exchanges x
     set replacement_employee_id = v_employee_id,
         status = 'accepted',
         accepted_at = clock_timestamp()
   where x.id = p_exchange_id
  returning x.id, x.status, x.replacement_employee_id;
end;
$$;

create or replace function api.cancel_workforce_shift_exchange(
  p_exchange_id uuid
)
returns text
language plpgsql
security invoker
set search_path = core, workforce, public
as $$
declare
  v_status text;
begin
  update workforce.shift_exchanges x
     set status = 'cancelled'
   where x.id = p_exchange_id
     and x.status in ('open', 'accepted')
     and workforce.is_own_employee(x.requester_employee_id)
  returning x.status into v_status;
  if v_status is null then
    raise exception 'shift_exchange_not_cancellable' using errcode = 'P0001';
  end if;
  return v_status;
end;
$$;

create or replace function api.decide_workforce_shift_exchange(
  p_exchange_id uuid,
  p_decision text
)
returns table (exchange_id uuid, status text, shift_id uuid, replacement_employee_id uuid)
language plpgsql
security invoker
set search_path = core, workforce, public
as $$
declare
  v_exchange workforce.shift_exchanges%rowtype;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'shift_exchange_invalid_decision' using errcode = '22023';
  end if;

  select x.* into v_exchange
  from workforce.shift_exchanges x
  where x.id = p_exchange_id
    and x.status in ('open', 'accepted')
    and core.has_permission(x.tenant_id, 'workforce.request.manage', x.location_id)
  for update;

  if not found then
    raise exception 'shift_exchange_not_decidable' using errcode = 'P0001';
  end if;
  if p_decision = 'approved' and v_exchange.replacement_employee_id is null then
    raise exception 'shift_exchange_replacement_required' using errcode = 'P0001';
  end if;

  if p_decision = 'approved' then
    if exists (
      select 1
      from workforce.shifts candidate
      join workforce.shifts offered
        on offered.tenant_id = v_exchange.tenant_id
       and offered.id = v_exchange.shift_id
      where candidate.tenant_id = v_exchange.tenant_id
        and candidate.employee_id = v_exchange.replacement_employee_id
        and candidate.published = true
        and candidate.id <> offered.id
        and tstzrange(candidate.starts_at, candidate.ends_at, '[)')
            && tstzrange(offered.starts_at, offered.ends_at, '[)')
    ) then
      raise exception 'shift_exchange_schedule_conflict' using errcode = 'P0001';
    end if;

    update workforce.shifts s
       set employee_id = v_exchange.replacement_employee_id
     where s.tenant_id = v_exchange.tenant_id
       and s.location_id = v_exchange.location_id
       and s.id = v_exchange.shift_id
       and s.employee_id = v_exchange.requester_employee_id
       and s.published = true
       and s.starts_at > clock_timestamp();
    if not found then
      raise exception 'shift_exchange_shift_changed' using errcode = 'P0001';
    end if;
  end if;

  return query
  update workforce.shift_exchanges x
     set status = p_decision,
         decided_by = core.current_user_id(),
         decided_at = clock_timestamp()
   where x.id = p_exchange_id
  returning x.id, x.status, x.shift_id, x.replacement_employee_id;
end;
$$;

revoke all on function api.accept_workforce_shift_exchange(uuid) from public;
revoke all on function api.cancel_workforce_shift_exchange(uuid) from public;
revoke all on function api.decide_workforce_shift_exchange(uuid, text) from public;
grant execute on function api.accept_workforce_shift_exchange(uuid) to authenticated;
grant execute on function api.cancel_workforce_shift_exchange(uuid) to authenticated;
grant execute on function api.decide_workforce_shift_exchange(uuid, text) to authenticated;
