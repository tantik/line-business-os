-- Cafe v2 Final Improvements: auditable opening/closing stock-check sessions.

create table inventory.check_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  location_id uuid not null,
  business_date date not null,
  check_type text not null check (check_type in ('opening', 'closing')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'cancelled')),
  started_by uuid not null references core.users(id),
  started_at timestamptz not null default clock_timestamp(),
  completed_by uuid references core.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, location_id, business_date, check_type),
  foreign key (tenant_id, location_id)
    references core.locations(tenant_id, id)
);

create table inventory.check_session_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  location_id uuid not null,
  session_id uuid not null,
  item_id uuid not null,
  item_name text not null,
  unit text not null check (unit in ('kg', 'g', 'L', 'mL', 'pcs')),
  required_quantity numeric(12,3) not null check (required_quantity >= 0),
  actual_quantity numeric(12,3) check (actual_quantity >= 0),
  counted_by uuid references core.users(id),
  counted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, session_id, item_id),
  foreign key (tenant_id, location_id)
    references core.locations(tenant_id, id),
  foreign key (tenant_id, session_id)
    references inventory.check_sessions(tenant_id, id) on delete cascade,
  foreign key (tenant_id, item_id)
    references inventory.items(tenant_id, id)
);

create index inv_check_sessions_location_date
  on inventory.check_sessions (tenant_id, location_id, business_date desc, check_type);
create index inv_check_session_items_session
  on inventory.check_session_items (tenant_id, session_id);

create trigger set_updated_at
  before update on inventory.check_sessions
  for each row execute function core.set_updated_at();
create trigger set_updated_at
  before update on inventory.check_session_items
  for each row execute function core.set_updated_at();

create or replace function inventory.guard_check_session_update()
returns trigger
language plpgsql
set search_path = core, inventory, public
as $$
begin
  if old.status <> 'in_progress' or new.status <> 'completed' then
    raise exception 'inventory_session_invalid_transition' using errcode = 'P0001';
  end if;
  if new.tenant_id <> old.tenant_id
     or new.location_id <> old.location_id
     or new.business_date <> old.business_date
     or new.check_type <> old.check_type
     or new.started_by <> old.started_by
     or new.started_at <> old.started_at then
    raise exception 'inventory_session_immutable_fields' using errcode = 'P0001';
  end if;
  if not core.has_permission(old.tenant_id, 'inventory.count.write', old.location_id) then
    raise exception 'inventory_session_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from inventory.check_session_items i
    where i.tenant_id = old.tenant_id and i.session_id = old.id
  ) or exists (
    select 1 from inventory.check_session_items i
    where i.tenant_id = old.tenant_id
      and i.session_id = old.id
      and i.actual_quantity is null
  ) then
    raise exception 'inventory_session_incomplete' using errcode = 'P0001';
  end if;
  insert into inventory.stock_counts (
    tenant_id, location_id, item_id, actual_quantity, counted_by, counted_at
  )
  select i.tenant_id, i.location_id, i.item_id, i.actual_quantity,
         core.current_user_id(), coalesce(i.counted_at, clock_timestamp())
  from inventory.check_session_items i
  where i.tenant_id = old.tenant_id
    and i.session_id = old.id;
  new.completed_by := core.current_user_id();
  new.completed_at := clock_timestamp();
  return new;
end;
$$;

create or replace function inventory.guard_check_session_item_update()
returns trigger
language plpgsql
set search_path = core, inventory, public
as $$
begin
  if new.tenant_id <> old.tenant_id
     or new.location_id <> old.location_id
     or new.session_id <> old.session_id
     or new.item_id <> old.item_id
     or new.item_name <> old.item_name
     or new.unit <> old.unit
     or new.required_quantity <> old.required_quantity then
    raise exception 'inventory_session_item_immutable_fields' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from inventory.check_sessions s
    where s.tenant_id = old.tenant_id
      and s.id = old.session_id
      and s.status = 'in_progress'
      and core.has_permission(s.tenant_id, 'inventory.count.write', s.location_id)
  ) then
    raise exception 'inventory_session_item_not_writable' using errcode = 'P0001';
  end if;
  new.counted_by := core.current_user_id();
  new.counted_at := clock_timestamp();
  return new;
end;
$$;

create trigger guard_check_session_update
  before update on inventory.check_sessions
  for each row execute function inventory.guard_check_session_update();
create trigger guard_check_session_item_update
  before update on inventory.check_session_items
  for each row execute function inventory.guard_check_session_item_update();

alter table inventory.check_sessions enable row level security;
alter table inventory.check_session_items enable row level security;

create policy inv_check_sessions_read on inventory.check_sessions
  for select using (
    core.has_permission(tenant_id, 'inventory.item.read', location_id)
  );
create policy inv_check_sessions_write on inventory.check_sessions
  for all
  using (core.has_permission(tenant_id, 'inventory.count.write', location_id))
  with check (core.has_permission(tenant_id, 'inventory.count.write', location_id));

create policy inv_check_session_items_read on inventory.check_session_items
  for select using (
    core.has_permission(tenant_id, 'inventory.item.read', location_id)
  );
create policy inv_check_session_items_write on inventory.check_session_items
  for all
  using (core.has_permission(tenant_id, 'inventory.count.write', location_id))
  with check (core.has_permission(tenant_id, 'inventory.count.write', location_id));

grant select, insert, update on inventory.check_sessions to authenticated;
grant select, insert, update on inventory.check_session_items to authenticated;
grant insert on inventory.stock_counts to authenticated;

create view api.inventory_check_sessions
  with (security_invoker = true) as
select
  s.id as session_id,
  s.tenant_id,
  s.location_id,
  s.business_date,
  s.check_type,
  s.status,
  s.started_at,
  s.completed_at,
  count(i.id)::integer as item_count,
  count(i.actual_quantity)::integer as counted_item_count
from inventory.check_sessions s
left join inventory.check_session_items i
  on i.tenant_id = s.tenant_id and i.session_id = s.id
group by s.id;

create view api.inventory_check_session_items
  with (security_invoker = true) as
select
  i.id as session_item_id,
  i.tenant_id,
  i.location_id,
  i.session_id,
  i.item_id,
  i.item_name,
  i.unit,
  i.required_quantity,
  i.actual_quantity,
  greatest(i.required_quantity - i.actual_quantity, 0) as shortage_quantity,
  i.counted_at
from inventory.check_session_items i;

grant select on api.inventory_check_sessions to authenticated;
grant select on api.inventory_check_session_items to authenticated;
revoke all on api.inventory_check_sessions from anon, public;
revoke all on api.inventory_check_session_items from anon, public;

create or replace function api.start_inventory_check_session(
  p_tenant_id uuid,
  p_location_id uuid,
  p_business_date date,
  p_check_type text
)
returns uuid
language plpgsql
security invoker
set search_path = core, inventory, public
as $$
declare
  v_session_id uuid;
begin
  if p_check_type not in ('opening', 'closing') then
    raise exception 'inventory_invalid_check_type' using errcode = '22023';
  end if;
  if not core.has_permission(p_tenant_id, 'inventory.count.write', p_location_id) then
    raise exception 'inventory_session_forbidden' using errcode = '42501';
  end if;

  insert into inventory.check_sessions (
    tenant_id, location_id, business_date, check_type, started_by
  ) values (
    p_tenant_id, p_location_id, p_business_date, p_check_type, core.current_user_id()
  )
  on conflict (tenant_id, location_id, business_date, check_type)
  do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select s.id into v_session_id
    from inventory.check_sessions s
    where s.tenant_id = p_tenant_id
      and s.location_id = p_location_id
      and s.business_date = p_business_date
      and s.check_type = p_check_type;
  end if;

  insert into inventory.check_session_items (
    tenant_id, location_id, session_id, item_id, item_name, unit, required_quantity
  )
  select i.tenant_id, i.location_id, v_session_id, i.id, i.name, i.unit, i.required_quantity
  from inventory.items i
  where i.tenant_id = p_tenant_id
    and i.location_id = p_location_id
    and i.is_active = true
  on conflict (tenant_id, session_id, item_id) do nothing;

  return v_session_id;
end;
$$;

create or replace function api.record_inventory_session_item(
  p_session_id uuid,
  p_item_id uuid,
  p_actual_quantity numeric
)
returns uuid
language plpgsql
security invoker
set search_path = core, inventory, public
as $$
declare
  v_id uuid;
  v_tenant_id uuid;
  v_location_id uuid;
begin
  if p_actual_quantity < 0 then
    raise exception 'inventory_invalid_quantity' using errcode = '22023';
  end if;

  select s.tenant_id, s.location_id
    into v_tenant_id, v_location_id
  from inventory.check_sessions s
  where s.id = p_session_id
    and s.status = 'in_progress';
  if not found then
    raise exception 'inventory_session_item_not_writable' using errcode = 'P0001';
  end if;
  if not core.has_permission(v_tenant_id, 'inventory.count.write', v_location_id) then
    raise exception 'inventory_session_forbidden' using errcode = '42501';
  end if;

  update inventory.check_session_items i
     set actual_quantity = p_actual_quantity,
         counted_by = core.current_user_id(),
         counted_at = clock_timestamp()
   where i.session_id = p_session_id
     and i.item_id = p_item_id
     and exists (
       select 1 from inventory.check_sessions s
       where s.tenant_id = i.tenant_id
         and s.id = i.session_id
         and s.status = 'in_progress'
     )
  returning i.id into v_id;

  if v_id is null then
    raise exception 'inventory_session_item_not_writable' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

create or replace function api.complete_inventory_check_session(
  p_session_id uuid
)
returns table (session_id uuid, completed_at timestamptz)
language plpgsql
security invoker
set search_path = core, inventory, public
as $$
declare
  v_session inventory.check_sessions%rowtype;
begin
  select s.* into v_session
  from inventory.check_sessions s
  where s.id = p_session_id
    and s.status = 'in_progress'
    and core.has_permission(s.tenant_id, 'inventory.count.write', s.location_id)
  for update;

  if not found then
    raise exception 'inventory_session_not_open' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from inventory.check_session_items i
    where i.tenant_id = v_session.tenant_id
      and i.session_id = v_session.id
      and i.actual_quantity is null
  ) then
    raise exception 'inventory_session_incomplete' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from inventory.check_session_items i
    where i.tenant_id = v_session.tenant_id
      and i.session_id = v_session.id
  ) then
    raise exception 'inventory_session_empty' using errcode = 'P0001';
  end if;

  return query
  update inventory.check_sessions s
     set status = 'completed',
         completed_by = core.current_user_id(),
         completed_at = clock_timestamp()
   where s.id = v_session.id
  returning s.id, s.completed_at;
end;
$$;

revoke all on function api.start_inventory_check_session(uuid, uuid, date, text) from public;
revoke all on function api.record_inventory_session_item(uuid, uuid, numeric) from public;
revoke all on function api.complete_inventory_check_session(uuid) from public;
grant execute on function api.start_inventory_check_session(uuid, uuid, date, text) to authenticated;
grant execute on function api.record_inventory_session_item(uuid, uuid, numeric) to authenticated;
grant execute on function api.complete_inventory_check_session(uuid) to authenticated;
