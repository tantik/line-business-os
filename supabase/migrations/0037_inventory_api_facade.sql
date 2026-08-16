-- ============================================================================
-- 0037  Inventory read-only API facade (Daily Stock Check MVP)
-- ----------------------------------------------------------------------------
-- Following 0023_workforce_api_facade.sql's exact pattern: `security_invoker`
-- views in `api`, relying entirely on 0036's RLS for row visibility, no
-- SECURITY DEFINER object anywhere, no PII/raw-identity columns exposed.
--
-- Three views:
--   * api.inventory_items -- plain catalog pass-through.
--   * api.inventory_item_status -- computed "current state": each item
--     joined with its most recent stock_counts row (if any) via a LATERAL
--     subquery, with shortage_quantity/status derived server-side
--     (greatest(required - actual, 0); 'sufficient' | 'shortage' | 'unknown'
--     when never counted). This is the safe way to expose "current stock" the
--     brief asks for without a separately-stored column that could drift out
--     of sync with stock_counts history -- there is no "current_quantity"
--     column on inventory.items at all.
--   * api.inventory_stock_counts -- count history, for the "who/when" and
--     history requirements.
--
-- counted_by identity: `inventory.stock_counts.counted_by` is a raw
-- core.users id, which this codebase's api views never expose directly (see
-- 0018/0023's "no raw user ids" rule). Both views below instead LEFT JOIN
-- workforce.employees (matching how api.workforce_staff_directory exposes
-- `employees.id as staff_id`, never a user id) to expose a nullable
-- `counted_by_staff_id`/`entered_by_staff_id`. This is a soft, optional
-- enrichment, not a hard dependency: a tenant with the `inventory` module
-- enabled but no workforce.employees rows for its users simply gets NULL
-- there, and inventory stays fully usable without Workforce.
-- ============================================================================

-- api.inventory_items -----------------------------------------------------
create view api.inventory_items
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
  i.updated_at
from inventory.items i;

comment on view api.inventory_items is
  'Inventory catalog items, relying entirely on inv_items_select RLS for visibility. security_invoker view. No created_by/updated_by (raw user ids never exposed).';

-- api.inventory_item_status -------------------------------------------------
create view api.inventory_item_status
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
  greatest(i.required_quantity - coalesce(lc.actual_quantity, 0), 0) as shortage_quantity,
  case
    when lc.actual_quantity is null then 'unknown'
    when lc.actual_quantity >= i.required_quantity then 'sufficient'
    else 'shortage'
  end as status
from inventory.items i
left join lateral (
  select sc.actual_quantity, sc.counted_at, sc.counted_by
  from inventory.stock_counts sc
  where sc.tenant_id = i.tenant_id and sc.item_id = i.id
  -- id desc is a deterministic tiebreaker: counted_at defaults to
  -- clock_timestamp() (0035), which is already monotonic per-statement, but
  -- two counts could still theoretically share a value at clock_timestamp()'s
  -- resolution limit (or if a future write path ever sets counted_at
  -- explicitly). Ordering by id (a gen_random_uuid(), unrelated to insertion
  -- order) is not itself meaningful, but it makes "the latest row" a single,
  -- reproducible answer instead of leaving ties to arbitrary scan order.
  order by sc.counted_at desc, sc.id desc
  limit 1
) lc on true
left join workforce.employees e on e.tenant_id = i.tenant_id and e.user_id = lc.counted_by;

comment on view api.inventory_item_status is
  'Computed current stock state per item: latest stock_counts row (if any) joined in via LATERAL, with shortage_quantity/status derived server-side (never a stored, driftable column). status is unknown until an item has ever been counted. Relies entirely on inv_items_select/inv_stock_counts_select RLS. security_invoker view.';

-- api.inventory_stock_counts ---------------------------------------------------
create view api.inventory_stock_counts
  with (security_invoker = true) as
select
  sc.id as count_id,
  sc.tenant_id,
  sc.location_id,
  sc.item_id,
  sc.actual_quantity,
  sc.counted_at,
  e.id as counted_by_staff_id
from inventory.stock_counts sc
left join workforce.employees e on e.tenant_id = sc.tenant_id and e.user_id = sc.counted_by;

comment on view api.inventory_stock_counts is
  'Stock count history, relying entirely on inv_stock_counts_select RLS for visibility. security_invoker view. No raw counted_by user id (see header note).';

-- ============================================================================
-- Grants
-- ============================================================================

grant usage on schema inventory to authenticated;

grant select on inventory.items, inventory.stock_counts to authenticated;

grant select on api.inventory_items to authenticated;
grant select on api.inventory_item_status to authenticated;
grant select on api.inventory_stock_counts to authenticated;

revoke all on api.inventory_items from anon, public;
revoke all on api.inventory_item_status from anon, public;
revoke all on api.inventory_stock_counts from anon, public;
