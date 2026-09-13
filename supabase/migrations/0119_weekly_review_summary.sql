-- ============================================================================
-- 0119  Owner Weekly Review — read-model summary (Cafe v2.2 WP3)
-- ----------------------------------------------------------------------------
-- Adds ONE new permission key (`core.weekly_review.view`, module = 'core' --
-- this is a permission-gated COMPOSITION over already-enabled modules, never
-- a new `core.module_code` value, and no `core.tenant_modules` row is ever
-- written for it) plus one `SECURITY INVOKER` aggregation RPC,
-- `api.weekly_review_summary`. No new table. No new module. No business data
-- is written by this migration.
--
-- WHY AN RPC, NOT A VIEW (or set of views): the summary spans five
-- independent domains (workforce/operations/issues/inventory/purchases),
-- some week-scoped (business_date / created_at BETWEEN) and some "as of now"
-- (open exceptions, unresolved issues, current shortages) in the SAME
-- response, several of which must degrade to an explicit `null` ("not
-- available") rather than `0` when their owning module is OFF for the
-- tenant. Composing that many conditionally-null aggregates cleanly in plain
-- SQL views (which cannot branch) would need one view per domain plus a
-- client-side merge; a single plpgsql function returning one `jsonb` payload
-- is simpler, keeps the "module off -> null, not 0" precision in ONE place,
-- and gives the frontend one round trip.
--
-- SECURITY POSTURE (ADR 0008 — no SECURITY DEFINER in `api`): `SECURITY
-- INVOKER`, `search_path` pinned. The function does NOT implement its own
-- tenant/location authorization boundary — that remains entirely the SELECT
-- RLS policies already enforced on `workforce.shifts` / `shift_exchanges` /
-- `shift_requests`, `operations.task_instances` / `task_exceptions`,
-- `issues.issues`, and the existing `api.inventory_item_status` /
-- `api.purchases_needed` views (queried, not reimplemented, per their own
-- "reuse before invent" precedent). `p_tenant_id` / `p_location_id` are used
-- ONLY to shape correct aggregation math (which rows to count), never as an
-- authorization decision — a caller who does not actually hold read access
-- under the underlying RLS simply sees zero matching rows for that domain,
-- same as querying the base tables directly. The one authorization check
-- this function DOES perform up front is `core.weekly_review.view` itself
-- (the feature-level gate), exactly mirroring `api.issues_create`'s posture
-- of an early named-exception check before doing any real work.
--
-- WEEK/TIMEZONE: this function takes the week boundary ALREADY resolved by
-- the caller (`p_week_start`/`p_week_end` as location-local calendar dates
-- for the `business_date`-scoped domains, `p_week_starts_at`/
-- `p_week_ends_at_exclusive` as the equivalent UTC instant bounds for the
-- `timestamptz`-scoped workforce domain) -- it does not re-derive a
-- timezone conversion in SQL. Mirrors the existing convention already used
-- throughout `apps/web/src/lib/workforce/schedule-actions.ts` (`fromIso`/
-- `toIsoExclusive` computed via `localDateTimeToUtcIso` in TypeScript, not
-- duplicated in SQL) -- avoids a second, potentially-diverging timezone
-- implementation for the same Monday-Sunday week model
-- (`apps/web/src/lib/workforce/period.ts`).
--
-- NOT built here (mission non-goals, explicit): no AI summary; no
-- durable/persisted snapshot table (this is a live read-model, recomputed
-- every call); no financial/payroll/performance-scoring field; no
-- week-over-week percentage math; no new `module_code` value; no
-- `core.tenant_modules` row.
--
-- Rollback:
--   drop function if exists api.weekly_review_summary(uuid, uuid, date, date, timestamptz, timestamptz);
--   -- filters by permission_key only (no role_id filter), so this single
--   -- statement removes all 3 role grants seeded below (owner, admin, manager):
--   delete from core.role_permissions where permission_key = 'core.weekly_review.view';
--   -- removes the 1 permission-catalog row seeded below:
--   delete from core.permissions where key = 'core.weekly_review.view';
-- Purely additive; no existing object is modified; no data is deleted.
-- ============================================================================

-- --- Permission catalog ------------------------------------------------------
insert into core.permissions (key, module, description) values
  ('core.weekly_review.view', 'core', 'View the Owner Weekly Review summary (Team/Operations/Issues/Purchasing rollup for a completed or in-progress business week) for the caller''s location(s)')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Role -> permission seed. Owner/Admin/Manager only -- explicitly NOT
-- Employee, NOT Client (mission contract). Same role-UUID constants as
-- 0118's own seed block.
do $$
declare
  r_owner   uuid := '00000000-0000-0000-0000-000000000003';
  r_admin   uuid := '00000000-0000-0000-0000-000000000004';
  r_manager uuid := '00000000-0000-0000-0000-000000000005';
begin
  insert into core.role_permissions (role_id, permission_key) values
    (r_owner,   'core.weekly_review.view'),
    (r_admin,   'core.weekly_review.view'),
    (r_manager, 'core.weekly_review.view')
  on conflict do nothing;
end $$;

-- ============================================================================
-- api.weekly_review_summary — SECURITY INVOKER aggregation RPC
-- ============================================================================
create or replace function api.weekly_review_summary(
  p_tenant_id               uuid,
  p_location_id             uuid,
  p_week_start              date,
  p_week_end                date,
  p_week_starts_at          timestamptz,
  p_week_ends_at_exclusive  timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = api, core, workforce, operations, issues, inventory, purchases, public
as $$
declare
  v_user       uuid := core.current_user_id();
  v_workforce  jsonb;
  v_operations jsonb;
  v_issues     jsonb;
  v_purchasing jsonb;
  v_recurring  jsonb;
begin
  if v_user is null then
    raise exception 'weekly_review_no_auth_context' using errcode = 'P0001';
  end if;
  if p_week_start is null or p_week_end is null or p_week_end < p_week_start then
    raise exception 'weekly_review_invalid_week' using errcode = 'P0001';
  end if;
  if p_week_starts_at is null or p_week_ends_at_exclusive is null or p_week_ends_at_exclusive <= p_week_starts_at then
    raise exception 'weekly_review_invalid_week' using errcode = 'P0001';
  end if;

  -- Feature-level gate. Location-scoped, same shape as every other
  -- Manager-surface permission check in this codebase (hasManagerAccess).
  if not core.has_permission(p_tenant_id, 'core.weekly_review.view', p_location_id) then
    raise exception 'weekly_review_permission_denied' using errcode = 'P0001';
  end if;

  -- --- Team / Workforce ------------------------------------------------------
  if core.has_module_access(p_tenant_id, 'workforce') then
    select jsonb_build_object(
      'shiftAssignmentsCount', (
        select count(*)::int from workforce.shifts s
        where s.tenant_id = p_tenant_id and s.location_id = p_location_id
          and s.employee_id is not null
          and s.starts_at >= p_week_starts_at and s.starts_at < p_week_ends_at_exclusive
      ),
      'shiftExchangesCount', (
        select count(*)::int from workforce.shift_exchanges x
        where x.tenant_id = p_tenant_id and x.location_id = p_location_id
          and x.created_at >= p_week_starts_at and x.created_at < p_week_ends_at_exclusive
      ),
      -- "Still unresolved" -- regardless of when originally created, NOT
      -- scoped to this week (mission contract: label clearly, don't imply
      -- they're from this week).
      'unresolvedShiftRequestsCount', (
        select count(*)::int from workforce.shift_requests r
        where r.tenant_id = p_tenant_id and r.location_id = p_location_id
          and r.status = 'pending'
      )
    ) into v_workforce;
  else
    v_workforce := null;
  end if;

  -- --- Operations --------------------------------------------------------------
  if core.has_module_access(p_tenant_id, 'operations') then
    select jsonb_build_object(
      'completedCount', (
        select count(*)::int from operations.task_instances ti
        where ti.tenant_id = p_tenant_id and ti.location_id = p_location_id
          and ti.status = 'completed'
          and ti.business_date >= p_week_start and ti.business_date <= p_week_end
      ),
      'criticalMissedCount', (
        select count(*)::int from operations.task_exceptions te
        where te.tenant_id = p_tenant_id and te.location_id = p_location_id
          and te.source = 'critical_missed'
          and te.business_date >= p_week_start and te.business_date <= p_week_end
      ),
      -- "Still open" as of now -- NOT necessarily created this week.
      'openExceptionsCount', (
        select count(*)::int from operations.task_exceptions te
        where te.tenant_id = p_tenant_id and te.location_id = p_location_id
          and te.status = 'open'
      )
    ) into v_operations;
  else
    v_operations := null;
  end if;

  -- --- Issues & Handover ---------------------------------------------------
  if core.has_module_access(p_tenant_id, 'issues') then
    select coalesce(jsonb_agg(jsonb_build_object('category', category, 'count', cnt) order by cnt desc, category), '[]'::jsonb)
      into v_recurring
    from (
      select category, count(*)::int as cnt
      from issues.issues i
      where i.tenant_id = p_tenant_id and i.location_id = p_location_id
        and i.kind = 'issue'
        and i.category is not null
        and i.business_date >= p_week_start and i.business_date <= p_week_end
      group by category
      having count(*) >= 2
    ) c;

    select jsonb_build_object(
      'newIssuesCount', (
        select count(*)::int from issues.issues i
        where i.tenant_id = p_tenant_id and i.location_id = p_location_id
          and i.kind = 'issue'
          and i.business_date >= p_week_start and i.business_date <= p_week_end
      ),
      'newHandoversCount', (
        select count(*)::int from issues.issues i
        where i.tenant_id = p_tenant_id and i.location_id = p_location_id
          and i.kind = 'handover'
          and i.business_date >= p_week_start and i.business_date <= p_week_end
      ),
      -- "Still unresolved" as of now -- NOT necessarily reported this week.
      'unresolvedIssuesCount', (
        select count(*)::int from issues.issues i
        where i.tenant_id = p_tenant_id and i.location_id = p_location_id
          and i.kind = 'issue' and i.status in ('open', 'acknowledged')
      ),
      'unresolvedImportantIssuesCount', (
        select count(*)::int from issues.issues i
        where i.tenant_id = p_tenant_id and i.location_id = p_location_id
          and i.kind = 'issue' and i.severity = 'important'
          and i.status in ('open', 'acknowledged')
      ),
      'recurringCategories', v_recurring
    ) into v_issues;
  else
    v_issues := null;
  end if;

  -- --- Inventory / Purchasing ------------------------------------------------
  -- Purchases has no dedicated module_code -- it rides on `inventory`
  -- (0089's own documented Founder decision). Reuses the EXISTING
  -- `api.inventory_item_status` / `api.purchases_needed` security_invoker
  -- views verbatim rather than re-deriving the shortage/pending rule here
  -- (D3-style reuse, avoids a second, potentially-diverging definition of
  -- "shortage"). Both are current live state -- inventory has no history, so
  -- these are never week-scoped, per the mission contract.
  if core.has_module_access(p_tenant_id, 'inventory') then
    select jsonb_build_object(
      'shortageItemsCount', (
        select count(*)::int from api.inventory_item_status s
        where s.tenant_id = p_tenant_id and s.location_id = p_location_id
          and s.status = 'shortage'
      ),
      'pendingPurchasesCount', (
        select count(*)::int from api.purchases_needed p
        where p.tenant_id = p_tenant_id and p.location_id = p_location_id
          and p.purchase_status = 'pending'
      )
    ) into v_purchasing;
  else
    v_purchasing := null;
  end if;

  return jsonb_build_object(
    'weekStart', p_week_start,
    'weekEnd', p_week_end,
    'workforce', v_workforce,
    'operations', v_operations,
    'issues', v_issues,
    'purchasing', v_purchasing
  );
end;
$$;
comment on function api.weekly_review_summary(uuid, uuid, date, date, timestamptz, timestamptz) is
  'Owner Weekly Review read-model (Cafe v2.2 WP3): a single JSON summary of Team/Operations/Issues/Purchasing counts for one Monday-Sunday business week at one tenant+location. SECURITY INVOKER -- relies entirely on the underlying tables'' / views'' own RLS for the real access boundary; only checks core.weekly_review.view itself as the feature-level gate. Per-domain section is null (not 0) when that domain''s module is OFF for the tenant. No new table, no persisted snapshot -- recomputed on every call.';

revoke all on function api.weekly_review_summary(uuid, uuid, date, date, timestamptz, timestamptz) from public, anon;
grant execute on function api.weekly_review_summary(uuid, uuid, date, date, timestamptz, timestamptz) to authenticated;
