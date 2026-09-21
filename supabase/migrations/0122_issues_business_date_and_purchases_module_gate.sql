-- ============================================================================
-- 0122: three correctness/security fixes found by the Cafe v2.2 Full Integrated
-- Acceptance (2026-09-21). They replace function, policy and view bodies (plus
-- one small SECURITY DEFINER helper) only: no table or column is added or
-- dropped, no data is touched, no grant is widened.
--
-- A. Issues business_date is the location-local date (DEBT-050).
--    issues.issues.business_date defaults to current_date, which is the DB
--    session date (UTC on Supabase), and api.issues_create does not set it.
--    An issue reported 00:00-09:00 JST therefore got yesterday's business
--    date, and api.weekly_review_summary (0119) put a Monday-morning issue
--    into the previous week. api.issues_create now sets it from the
--    location's own timezone (core.locations.timezone, read through the new
--    SECURITY DEFINER helper issues.location_timezone, the same pattern as
--    operations.location_timezone / schedule_business_date, 0101).
--    Only the INSERT value changes: the 0118 guard trigger forbids UPDATEs of
--    business_date and is untouched; existing rows keep their stored date
--    (correcting history is a separate Founder decision).
--
-- B. Restore the explicit Inventory module gate on Purchases writes (DEBT-051).
--    0094 gated purchases_actions_insert with core.has_module_access(...,
--    'inventory') and gave api.record_purchase_action a distinguishable
--    purchases_module_disabled (P0004) pre-check. 0120 recreated the insert
--    policy and added api.record_purchase_order / api.record_purchase_receipt
--    without either, so the gate was only indirect (through inventory RLS).
--    This restores both, changing nothing else in those bodies.
--
-- C. api.workforce_staff_manage is Manager-only for real (DEBT-062).
--    The view is security_invoker and had no predicate, so it returned every
--    row the caller's RLS lets them SELECT. 0061's coworker-roster policy
--    (wf_employees_coworker_roster_read) lets a plain Staff caller SELECT
--    active coworker rows, so a Staff caller could read this view and get a
--    coworker's hourly_wage_yen plus the encrypted contact/notes columns
--    (reproduced on a local DB before this fix: Staff A saw both rows and the
--    other employee's wage). The view now requires workforce.staff.manage at
--    the row's location, the same kind of predicate 0023 uses for the staff
--    directory. Column list and order are unchanged; the Staff-facing roster
--    (api.workforce_staff_roster: id and name only), directory and own-profile
--    views and the wf_employees_* RLS policies are untouched.
--
-- Rollback: re-apply api.issues_create from 0118 (drop the v_tz lookup and the
-- business_date column from the insert) and drop issues.location_timezone;
-- re-apply purchases_actions_insert and the two RPC bodies from 0120;
-- re-apply api.workforce_staff_manage from 0067 (no WHERE). Function, policy
-- and view bodies only: no data change in either direction.
-- ============================================================================

-- --- A. issues.location_timezone ---------------------------------------------
-- Wall-clock timezone of a location. SECURITY DEFINER: a location's timezone is
-- not sensitive, and it must resolve for any caller api.issues_create has
-- already authorised (issues.report at that location), independent of the
-- caller's core.locations RLS view. Mirrors operations.location_timezone (0101).
create or replace function issues.location_timezone(p_tenant_id uuid, p_location_id uuid)
returns text
language sql stable security definer set search_path = core, public as $$
  select l.timezone from core.locations l
  where l.tenant_id = p_tenant_id and l.id = p_location_id;
$$;
comment on function issues.location_timezone(uuid, uuid) is
  'Wall-clock timezone for a location. SECURITY DEFINER -- timezone is non-sensitive config; keeps api.issues_create off the membership-gated core.locations RLS join (0122).';

revoke all on function issues.location_timezone(uuid, uuid) from public;
grant execute on function issues.location_timezone(uuid, uuid) to authenticated;

-- --- A. api.issues_create ----------------------------------------------------
create or replace function api.issues_create(
  p_tenant_id   uuid,
  p_location_id uuid,
  p_kind        text,
  p_note        text,
  p_category    text default null,
  p_severity    text default null
)
returns uuid
language plpgsql
security invoker
set search_path = api, issues, core, public
as $$
declare
  v_user uuid := core.current_user_id();
  v_role text;
  v_tz   text;
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'issues_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'issues') then
    raise exception 'issues_module_disabled' using errcode = 'P0001';
  end if;

  if p_kind not in ('issue', 'handover') then
    raise exception 'issues_invalid_kind' using errcode = 'P0001';
  end if;
  if p_category is not null and p_category not in
      ('equipment', 'inventory', 'cleaning', 'facility', 'customer', 'operations', 'other') then
    raise exception 'issues_invalid_category' using errcode = 'P0001';
  end if;
  if p_severity is not null and p_severity not in ('normal', 'important') then
    raise exception 'issues_invalid_severity' using errcode = 'P0001';
  end if;
  if p_kind = 'handover' and p_severity is not null then
    raise exception 'issues_severity_not_applicable_to_handover' using errcode = 'P0001';
  end if;
  if p_note is null or length(p_note) < 1 or length(p_note) > 1000 then
    raise exception 'issues_invalid_note' using errcode = 'P0001';
  end if;

  if not core.has_permission(p_tenant_id, 'issues.report', p_location_id) then
    raise exception 'issues_permission_denied' using errcode = 'P0001';
  end if;

  -- Resolve the actor's role server-side -- never trust client-supplied
  -- identity/role (mirrors every operations.* write RPC).
  v_role := case
    when core.has_permission(p_tenant_id, 'issues.manage', p_location_id) then 'manager'
    else 'staff'
  end;

  -- Location-local business date. core.locations.timezone is NOT NULL (default
  -- 'Asia/Tokyo'). Read through a SECURITY DEFINER helper (same reason as
  -- operations.location_timezone, 0101): the timezone is non-sensitive config
  -- and this path must not depend on the membership-gated core.locations RLS
  -- join. Fail closed: a location that does not exist in the tenant is refused
  -- rather than silently stored with a UTC date.
  v_tz := issues.location_timezone(p_tenant_id, p_location_id);

  if v_tz is null then
    raise exception 'issues_location_not_found' using errcode = 'P0002';
  end if;

  insert into issues.issues
    (tenant_id, location_id, kind, category, severity, note, reported_by, reported_by_role, source, business_date)
  values
    (p_tenant_id, p_location_id, p_kind, p_category, p_severity, p_note, v_user, v_role, 'manual',
     (now() at time zone v_tz)::date)
  returning id into v_id;

  return v_id;
end;
$$;
comment on function api.issues_create(uuid, uuid, text, text, text, text) is
  'Create an issue or handover note. Resolves reported_by/reported_by_role server-side from the authenticated actor (never client-supplied) and business_date from the location''s own timezone (core.locations.timezone), not the UTC DB session date (0122). Validates kind/category/severity against their allowed value sets with a clear error, ahead of the CHECK constraints. SECURITY INVOKER -- RLS on issues.issues is the real gate.';

revoke all on function api.issues_create(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function api.issues_create(uuid, uuid, text, text, text, text) to authenticated;

-- --- B. purchases_actions_insert: restore the Inventory module gate ----------
-- Identical to 0120's policy with one added conjunct (as 0094 had it).
drop policy if exists purchases_actions_insert on purchases.purchase_actions;

create policy purchases_actions_insert on purchases.purchase_actions
  for insert
  with check (
    core.has_module_access(tenant_id, 'inventory')
    and actioned_by = core.current_user_id()
    and (
      (
        action_type in ('bought', 'ordered')
        and core.has_permission(tenant_id, 'purchases.action.write', location_id)
        and exists (
          select 1
          from inventory.items i
          join lateral (
            select sc.id, sc.actual_quantity
            from inventory.stock_counts sc
            where sc.tenant_id = i.tenant_id and sc.item_id = i.id
            order by sc.counted_at desc, sc.id desc
            limit 1
          ) lc on true
          where i.tenant_id = purchase_actions.tenant_id
            and i.id = purchase_actions.item_id
            and i.location_id = purchase_actions.location_id
            and i.is_active = true
            and lc.id = purchase_actions.snapshot_stock_count_id
            and lc.actual_quantity <= i.reorder_point
        )
      )
      or (
        action_type = 'received'
        and core.has_permission(tenant_id, 'purchases.action.write', location_id)
        -- The referenced snapshot must be the item's true current latest
        -- stock count (never stale/forged) AND must have been counted by
        -- this SAME caller (see 0120).
        and exists (
          select 1
          from inventory.items i
          join lateral (
            select sc.id, sc.counted_by
            from inventory.stock_counts sc
            where sc.tenant_id = i.tenant_id and sc.item_id = i.id
            order by sc.counted_at desc, sc.id desc
            limit 1
          ) lc on true
          where i.tenant_id = purchase_actions.tenant_id
            and i.id = purchase_actions.item_id
            and i.location_id = purchase_actions.location_id
            and i.is_active = true
            and lc.id = purchase_actions.snapshot_stock_count_id
            and lc.counted_by = purchase_actions.actioned_by
        )
      )
    )
  );

-- --- B. api.record_purchase_order: add the module pre-check -----------------
create or replace function api.record_purchase_order(
  p_tenant_id uuid,
  p_location_id uuid,
  p_item_id uuid,
  p_ordered_quantity numeric
)
returns table (
  action_id uuid,
  item_id uuid,
  ordered_quantity numeric,
  actioned_at timestamptz
)
language plpgsql
security invoker
set search_path = core, inventory, purchases, public
as $$
declare
  v_snapshot_count_id uuid;
  v_actual_quantity   numeric(12, 3);
  v_reorder_point     numeric(12, 3);
  v_is_active         boolean;
begin
  if not core.has_module_access(p_tenant_id, 'inventory') then
    raise exception 'purchases_module_disabled' using errcode = 'P0004';
  end if;

  if p_ordered_quantity is null or p_ordered_quantity <= 0 or p_ordered_quantity = 'NaN'::numeric then
    raise exception 'purchases_invalid_quantity' using errcode = 'P0006';
  end if;

  select i.reorder_point, i.is_active into v_reorder_point, v_is_active
  from inventory.items i
  where i.tenant_id = p_tenant_id and i.id = p_item_id;

  if v_reorder_point is null then
    raise exception 'purchases_item_not_found' using errcode = 'P0002';
  end if;

  select sc.id, sc.actual_quantity into v_snapshot_count_id, v_actual_quantity
  from inventory.stock_counts sc
  where sc.tenant_id = p_tenant_id and sc.item_id = p_item_id
  order by sc.counted_at desc, sc.id desc
  limit 1;

  if v_snapshot_count_id is null then
    raise exception 'purchases_item_never_counted' using errcode = 'P0001';
  end if;

  if not v_is_active or v_actual_quantity > v_reorder_point then
    raise exception 'purchases_item_not_short' using errcode = 'P0003';
  end if;

  return query
  insert into purchases.purchase_actions as pa (
    tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by,
    action_type, ordered_quantity
  ) values (
    p_tenant_id, p_location_id, p_item_id, v_snapshot_count_id, core.current_user_id(),
    'ordered', p_ordered_quantity
  )
  returning pa.id, pa.item_id, pa.ordered_quantity, pa.actioned_at;
end;
$$;

comment on function api.record_purchase_order(uuid, uuid, uuid, numeric) is
  'Logs an Ordered acknowledgement with an informational quantity. Never writes to Inventory. actioned_by is always core.current_user_id(). Raises purchases_module_disabled (P0004) when the tenant''s Inventory module is OFF, before any other check (0122). SECURITY INVOKER: purchases_actions_insert RLS is the real authorization boundary.';

revoke all on function api.record_purchase_order(uuid, uuid, uuid, numeric) from public;
grant execute on function api.record_purchase_order(uuid, uuid, uuid, numeric) to authenticated;

-- --- B. api.record_purchase_receipt: add the module pre-check ---------------
create or replace function api.record_purchase_receipt(
  p_tenant_id uuid,
  p_location_id uuid,
  p_item_id uuid,
  p_received_quantity numeric,
  p_expected_stock_count_id uuid default null
)
returns table (
  action_id uuid,
  item_id uuid,
  received_quantity numeric,
  new_actual_quantity numeric,
  actioned_at timestamptz
)
language plpgsql
security invoker
set search_path = api, core, inventory, purchases, public
as $$
declare
  v_current_count_id  uuid;
  v_current_quantity  numeric(12, 3);
  v_is_active         boolean;
  v_new_quantity      numeric(12, 3);
  v_new_count_id      uuid;
  v_action_id         uuid;
  v_actioned_at       timestamptz;
begin
  if not core.has_module_access(p_tenant_id, 'inventory') then
    raise exception 'purchases_module_disabled' using errcode = 'P0004';
  end if;

  if p_received_quantity is null or p_received_quantity <= 0 or p_received_quantity = 'NaN'::numeric then
    raise exception 'purchases_invalid_quantity' using errcode = 'P0006';
  end if;

  -- Serializes concurrent receipts for the SAME item within this transaction
  -- (see 0120).
  perform pg_advisory_xact_lock(hashtextextended(p_item_id::text, 0));

  select i.is_active into v_is_active
  from inventory.items i
  where i.tenant_id = p_tenant_id and i.id = p_item_id;

  if v_is_active is null or not v_is_active then
    raise exception 'purchases_item_not_found' using errcode = 'P0002';
  end if;

  select sc.id, sc.actual_quantity into v_current_count_id, v_current_quantity
  from inventory.stock_counts sc
  where sc.tenant_id = p_tenant_id and sc.item_id = p_item_id
  order by sc.counted_at desc, sc.id desc
  limit 1;

  if v_current_count_id is null then
    raise exception 'purchases_item_never_counted' using errcode = 'P0001';
  end if;

  if p_expected_stock_count_id is not null and p_expected_stock_count_id <> v_current_count_id then
    raise exception 'purchases_stale_snapshot' using errcode = 'P0005';
  end if;

  v_new_quantity := v_current_quantity + p_received_quantity;

  -- Canonical Inventory write -- the only place actual_quantity is ever
  -- mutated, unchanged since 0035/0038.
  select count_id into v_new_count_id
  from api.record_inventory_stock_count(p_tenant_id, p_location_id, p_item_id, v_new_quantity);

  insert into purchases.purchase_actions as pa (
    tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by,
    action_type, received_quantity
  ) values (
    p_tenant_id, p_location_id, p_item_id, v_new_count_id, core.current_user_id(),
    'received', p_received_quantity
  )
  returning pa.id, pa.actioned_at into v_action_id, v_actioned_at;

  return query select v_action_id, p_item_id, p_received_quantity, v_new_quantity, v_actioned_at;
end;
$$;

comment on function api.record_purchase_receipt(uuid, uuid, uuid, numeric, uuid) is
  'Records a real delivery: writes the new total into Inventory via the unmodified api.record_inventory_stock_count (canonical quantity mechanism, unchanged), then logs a ''received'' purchase_actions row against the resulting new stock count, in one transaction. actioned_by/counted_by are always core.current_user_id(). p_expected_stock_count_id is an optional optimistic-concurrency guard against a stale/duplicate submit. Raises purchases_module_disabled (P0004) when the tenant''s Inventory module is OFF, before any other check (0122). SECURITY INVOKER: purchases_actions_insert and inv_stock_counts_insert RLS remain the real authorization boundaries.';

revoke all on function api.record_purchase_receipt(uuid, uuid, uuid, numeric, uuid) from public;
grant execute on function api.record_purchase_receipt(uuid, uuid, uuid, numeric, uuid) to authenticated;

-- --- C. api.workforce_staff_manage: require workforce.staff.manage ----------
-- Same columns, same order as 0067 (CREATE OR REPLACE VIEW may only append);
-- only the WHERE is new.
create or replace view api.workforce_staff_manage
  with (security_invoker = true) as
select
  e.id as staff_id,
  e.tenant_id,
  e.location_id,
  e.name_encrypted,
  e.name_hash,
  e.position_label,
  e.employment_type,
  e.is_active,
  e.created_at,
  e.updated_at,
  e.hourly_wage_yen,
  e.family_name_encrypted,
  e.given_name_encrypted,
  e.email_encrypted,
  e.email_hash,
  e.notes_encrypted,
  (e.user_id is not null) as has_account_access
from workforce.employees e
where core.has_permission(e.tenant_id, 'workforce.staff.manage', e.location_id);

comment on view api.workforce_staff_manage is
  'Manager-only staff read/write facade. Includes advisory hourly wage, contact PII (encrypted), and has_account_access (derived boolean, never the raw user_id itself). security_invoker/RLS, and since 0122 the view itself only returns rows where the caller holds workforce.staff.manage at the row''s location (a plain Staff caller can no longer read coworkers'' wage or encrypted contact columns through it).';

grant select, insert, update on api.workforce_staff_manage to authenticated;
revoke all on api.workforce_staff_manage from anon, public;
