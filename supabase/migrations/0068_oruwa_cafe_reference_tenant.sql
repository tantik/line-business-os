-- ============================================================================
-- 0068  ORUWA Cafe reference tenant (bootstrap exception, NOT the customer
--       onboarding architecture)
-- ----------------------------------------------------------------------------
-- Creates the first clean canonical Cafe v2.1 reference tenant: "ORUWA Cafe"
-- (slug oruwa-cafe), with one physical location and the Cafe Package v2
-- required module set (core, workforce, inventory -- see
-- packages/db/scripts/cafe-package-template.ts, CAFE_PACKAGE_V2_TEMPLATE).
--
-- Data model and initialization semantics mirror the two existing generic
-- patterns exactly (no new shape, no tenant-specific columns/behavior):
--   * supabase/seed/seed.sql's idempotent `insert ... on conflict do nothing`
--     tenant/location/tenant_modules pattern, and
--   * packages/db/scripts/onboard-tenant.ts's onboarding write plan (same
--     entities: tenant, location, tenant_modules; same reuse-not-duplicate
--     idempotency rules).
--
-- Fresh, newly generated identity: this migration reuses no Mame To Cha
-- tenant_id/location_id/employee_id. No RLS, permission, or tenant-isolation
-- change is made -- this migration touches only core.tenants,
-- core.locations, and core.tenant_modules rows for one new tenant_id.
--
-- *** BOOTSTRAP EXCEPTION -- READ BEFORE COPYING THIS PATTERN ***
-- This migration exists ONLY to bootstrap the canonical ORUWA Cafe reference
-- tenant for the Cafe v2.1 portability proof (see
-- docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md). It is a
-- ONE-TIME exception, not the intended repeatable mechanism for onboarding
-- real future Cafe customers.
--
-- Future real customers MUST NOT be onboarded by writing one migration per
-- customer -- that does not scale, pollutes the schema-migration history with
-- customer data, and bypasses the auditable onboarding write-plan/idempotency
-- rules that packages/db/scripts/onboard-tenant.ts already implements (and
-- deliberately restricts to local-only, see
-- docs/operations/client-onboarding-runbook.md). The correct future direction
-- is a safely-gated CLOUD target for that existing local onboarding tool
-- (equivalent backup/preflight/idempotency/approval safeguards, extended to
-- reach Preview/Production) -- tracked as a separate, explicitly-scoped
-- platform task, not built as part of this migration.
--
-- Owner/Manager/Staff identities, workforce/inventory/recipe reference data,
-- and role assignments are provisioned separately (real Staff Auth
-- Provisioning invite flow + generic app-level writes under RLS), not by this
-- migration -- this migration only creates the tenant "shell" (tenant row,
-- location row, module entitlements), exactly like seed.sql does for the
-- existing demo tenants.
-- ============================================================================

insert into core.tenants (id, slug, name, kind, status, settings) values
  ('72b81b2f-9ba5-4a4a-a296-02e32d4682b8', 'oruwa-cafe', 'ORUWA Cafe',
   'client', 'active',
   '{"locale":"ja-JP","demo":false}'::jsonb)
on conflict (id) do nothing;

insert into core.locations (id, tenant_id, name, timezone) values
  ('4bad308e-f8d3-4c20-a158-b6eb3bafa71b', '72b81b2f-9ba5-4a4a-a296-02e32d4682b8',
   'ORUWA Cafe Main Store', 'Asia/Tokyo')
on conflict (id) do nothing;

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('72b81b2f-9ba5-4a4a-a296-02e32d4682b8', 'core', true),
  ('72b81b2f-9ba5-4a4a-a296-02e32d4682b8', 'workforce', true),
  ('72b81b2f-9ba5-4a4a-a296-02e32d4682b8', 'inventory', true)
on conflict (tenant_id, module) do update set is_enabled = true where core.tenant_modules.is_enabled = false;
