-- ============================================================================
-- 0046 Inventory reorder levels
-- ----------------------------------------------------------------------------
-- Separates the target stock level from the reorder trigger:
--   required_quantity = target quantity after replenishment
--   reorder_point      = minimum quantity that triggers replenishment
--
-- Example: target 15, reorder point 5, current 10 => no purchase required.
--          target 15, reorder point 5, current 5  => buy 10.
-- Existing items retain the previous behaviour by starting with
-- reorder_point = required_quantity.
-- ============================================================================

alter table inventory.items
  add column if not exists reorder_point numeric(12, 3);

update inventory.items
set reorder_point = required_quantity
where reorder_point is null;

alter table inventory.items
  alter column reorder_point set default 0,
  alter column reorder_point set not null;

alter table inventory.items
  drop constraint if exists inventory_items_reorder_point_check;

alter table inventory.items
  add constraint inventory_items_reorder_point_check
  check (reorder_point >= 0 and reorder_point <= required_quantity);

comment on column inventory.items.required_quantity is
  'Manager-set target quantity after replenishment. Purchase recommendation is target minus current quantity, but only when current quantity is at or below reorder_point.';

comment on column inventory.items.reorder_point is
  'Manager-set minimum/reorder trigger. Current quantity at or below this value requires replenishment.';

alter table inventory.check_session_items
  add column if not exists reorder_point numeric(12, 3);

update inventory.check_session_items
set reorder_point = required_quantity
where reorder_point is null;

alter table inventory.check_session_items
  alter column reorder_point set default 0,
  alter column reorder_point set not null;

alter table inventory.check_session_items
  add constraint inventory_check_session_items_reorder_point_check
  check (reorder_point >= 0 and reorder_point <= required_quantity);

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
     or new.required_quantity <> old.required_quantity
     or new.reorder_point <> old.reorder_point then
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

create or replace view api.inventory_items
  with (security_invoker = true) as
select
  i.id as item_id,
  i.tenant_id,
  i.location_id,
  i.name,
  i.unit,
  i.required_quantity,
  i.sort_order,
  i.is_active,
  i.created_at,
  i.updated_at,
  i.reorder_point
from inventory.items i;

create or replace view api.inventory_item_status
  with (security_invoker = true) as
select
  i.id as item_id,
  i.tenant_id,
  i.location_id,
  i.name,
  i.unit,
  i.required_quantity,
  i.sort_order,
  i.is_active,
  lc.actual_quantity,
  lc.counted_at,
  e.id as counted_by_staff_id,
  case
    when lc.actual_quantity is not null
      and lc.actual_quantity <= i.reorder_point
      then greatest(i.required_quantity - lc.actual_quantity, 0)
    else 0
  end as shortage_quantity,
  case
    when lc.actual_quantity is null then 'unknown'
    when lc.actual_quantity <= i.reorder_point then 'shortage'
    else 'sufficient'
  end as status,
  i.reorder_point
from inventory.items i
left join lateral (
  select sc.actual_quantity, sc.counted_at, sc.counted_by
  from inventory.stock_counts sc
  where sc.tenant_id = i.tenant_id and sc.item_id = i.id
  order by sc.counted_at desc, sc.id desc
  limit 1
) lc on true
left join workforce.employees e
  on e.tenant_id = i.tenant_id and e.user_id = lc.counted_by;

create or replace view api.inventory_check_session_items
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
  case
    when i.actual_quantity is not null and i.actual_quantity <= i.reorder_point
      then greatest(i.required_quantity - i.actual_quantity, 0)
    else 0
  end as shortage_quantity,
  i.counted_at,
  i.reorder_point
from inventory.check_session_items i;

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
    tenant_id, location_id, session_id, item_id, item_name, unit,
    required_quantity, reorder_point
  )
  select
    i.tenant_id, i.location_id, v_session_id, i.id, i.name, i.unit,
    i.required_quantity, i.reorder_point
  from inventory.items i
  where i.tenant_id = p_tenant_id
    and i.location_id = p_location_id
    and i.is_active = true
  on conflict (tenant_id, session_id, item_id) do nothing;

  return v_session_id;
end;
$$;
