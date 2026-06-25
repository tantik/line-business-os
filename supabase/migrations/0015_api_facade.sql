-- ============================================================================
-- 0015  App-facing `api` facade schema (Phase 1E-3, Option A)
-- ----------------------------------------------------------------------------
-- Production-safe Data API surface. Instead of ever exposing raw `core` to the
-- Supabase Data API (PostgREST), this migration introduces a dedicated, minimal
-- `api` facade schema that is the ONLY app-facing schema. Internal `core`
-- (tables + SECURITY DEFINER helpers) stays unexposed.
--
-- WHY (Phase 1E review, ADR 0007 → ADR 0008): exposing a schema to the Data API
-- turns every function in it into a callable RPC and Supabase warns against
-- keeping SECURITY DEFINER functions in an exposed schema. `core` holds exactly
-- those helpers, so `core` must remain internal. The app reads `api.*` only.
--
-- WHAT THIS ADDS:
--   * schema `api`
--   * security-invoker view `api.my_tenant_memberships` projecting the current
--     user's ACTIVE memberships joined to their tenant (ids + non-PII labels)
--   * minimal grants: USAGE on `api` + SELECT on the view to `authenticated`
--
-- SECURITY MODEL:
--   * `security_invoker = true`: the view runs with the caller's privileges, so
--     the existing core RLS (memberships_select_self / tenants_select) and the
--     0013/0014 grants/EXECUTE posture remain the single source of truth. The
--     view neither widens nor bypasses RLS — it only projects an allowed read.
--   * No SECURITY DEFINER object is created in `api`.
--   * No PII is exposed (no core.users columns; only tenant id/slug/name/kind +
--     membership location_id/status).
--   * `anon` is granted NOTHING (no schema USAGE, no view SELECT).
--   * No write grants; mutations stay on the backend service-role path.
--   * `service_role` needs no grant: it bypasses RLS and the owner (postgres)
--     keeps privileges on what it owns (migrations/seed/pgTAP run as superuser).
--
-- DEPENDENCY NOTE: because the view is security-invoker, `authenticated` still
-- needs the Phase 1D underlying privileges to resolve it — USAGE on `core` +
-- SELECT on core.tenants / core.tenant_memberships (migration 0013) and EXECUTE
-- on core.current_user_id() (migration 0014). Those are intentionally left
-- unchanged here. `core` is still NOT in the Data API exposed-schemas list, so
-- it stays unreachable via PostgREST even though these grants exist.
-- ============================================================================

create schema if not exists api;

comment on schema api is
  'App-facing Data API facade. Security-invoker projections over core; core RLS remains the source of truth. No PII or SECURITY DEFINER objects.';

create view api.my_tenant_memberships
  with (security_invoker = true) as
select
  tm.tenant_id,
  t.slug as tenant_slug,
  t.name as tenant_name,
  t.kind as tenant_kind,
  tm.location_id,
  tm.status
from core.tenant_memberships tm
join core.tenants t on t.id = tm.tenant_id
where tm.user_id = core.current_user_id()
  and tm.status = 'active';

comment on view api.my_tenant_memberships is
  'Current user active tenant memberships joined to tenant. security_invoker view; underlying core RLS is enforced as caller.';

grant usage on schema api to authenticated;
grant select on api.my_tenant_memberships to authenticated;
