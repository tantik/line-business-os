-- ============================================================================
-- 0111  Register the Operations module in core.module_registry
-- ----------------------------------------------------------------------------
-- Operations (`operations` enum value: 0099; schema + engine + config API:
-- 0100-0105) shipped into `dev` BEFORE the Platform Foundation was reconciled
-- into `dev` (0106-0110). Operations migrations therefore could not — and
-- deliberately did not — reference `core.module_registry` (it did not exist
-- in the `dev` lineage). This migration closes that gap now that the registry
-- exists locally.
--
-- Founder-approved semantics (2026-08-29):
--   module          : operations
--   lifecycle_status : beta   (backend complete + pgTAP-covered; no Manager/
--                              Staff Operations UI exists yet — same status
--                              as inventory / ai)
--   dependencies     : none   (Operations has NO Workforce dependency by
--                              design — every actor column references
--                              core.users, not workforce.employees; it runs
--                              with Workforce OFF)
--   nav_route        : NULL   (no dashboard route exists yet)
--   min_plan_code    : NULL   (no plan gating; Billing stage decides that)
--
-- This does NOT enable Operations for any tenant. No `core.tenant_modules`
-- row is inserted. `core.has_module_access` (0093) remains the canonical
-- runtime Module-OFF gate; a missing `core.tenant_modules` row stays
-- fail-closed. `core.can_enable_module('operations')` becomes answerable
-- (true for a tenant on any plan, since lifecycle=beta and no deps/min_plan)
-- — that is an enablement PRE-CHECK, not the runtime gate.
--
-- DUAL-TARGET: on Cloud dev there is currently NO `operations` module_registry
-- row (verified 2026-08-29) — this inserts it. On a fresh local reset the row
-- is created here. `ON CONFLICT (module) DO NOTHING` makes a re-run a no-op
-- and never overwrites a lifecycle/nav value a later migration might set.
-- ============================================================================

insert into core.module_registry (module, name, description, lifecycle_status, nav_route, nav_sort_order)
values (
  'operations',
  'Operations',
  'Generic operational-execution: what must be done at a location, was it done, what was the result, does it need a Manager. Vertical-agnostic (Cafe HACCP is presets on top).',
  'beta',
  null,
  30
)
on conflict (module) do nothing;

-- No core.module_dependencies rows for 'operations' — intentionally none.

-- ============================================================================
-- Rollback:
--   delete from core.module_registry where module = 'operations';
-- ============================================================================
