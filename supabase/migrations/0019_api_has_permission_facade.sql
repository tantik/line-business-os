-- ============================================================================
-- 0019  api.has_permission RPC facade (Phase 1J-1F)
-- ----------------------------------------------------------------------------
-- Adds the single api-schema RPC scoped and approved by
-- docs/phase-1j-1e-api-facade-permission-resolution-design.md (Option B):
-- a boolean permission check that forwards its arguments to the existing,
-- already-hardened core.has_permission(...) (0006_helpers.sql, EXECUTE granted
-- to authenticated by 0014_core_helper_execute_hardening.sql).
--
-- WHY: resolveTenantContext/requirePermission (packages/core) cannot run
-- through the Data API because `core` is intentionally not in
-- supabase/config.toml's exposed-schema list (ADR 0007/0008, reconfirmed by
-- Phase 1J-1D). This RPC is the smallest unblock: it exposes exactly one
-- boolean per call, duplicates zero permission logic, and adds no new row-set
-- exposure.
--
-- SECURITY MODEL:
--   * NOT SECURITY DEFINER: a plain invoker SQL function. It queries no table
--     directly, so it needs no elevated privilege beyond EXECUTE on
--     core.has_permission, which `authenticated` already holds (0014). This
--     satisfies ADR 0008's "no SECURITY DEFINER object in api" invariant by
--     construction.
--   * No `set search_path`: the body's only reference, core.has_permission, is
--     schema-qualified, so there is no unqualified-name resolution to harden
--     against (mirrors 0016's reasoning for core.current_user_id()).
--   * `revoke all ... from public` + `grant execute ... to authenticated`
--     only. `anon` receives no grant (fail-closed, matching every other `api`
--     object).
--   * No table or view is created or exposed; no permission-key, role, or
--     membership row is projected — the only output is a boolean.
--   * tenant_id/permission/location_id are caller-supplied but never trusted
--     on their own: core.has_permission still requires a matching, active
--     core.role_assignments row (or core.is_platform_staff()) to return true.
--
-- POSTGREST RPC CONTRACT: parameter names become the JSON body keys for the
-- Data API call. Callers invoke this as (supabase-js):
--   supabase.schema('api').rpc('has_permission', {
--     p_tenant_id: tenantId,
--     p_permission: permissionKey,
--     p_location_id: locationId ?? null,
--   })
-- (p_location_id is optional; omitting the key uses the SQL default of NULL.)
-- ============================================================================

create or replace function api.has_permission(
  p_tenant_id uuid,
  p_permission text,
  p_location_id uuid default null
)
returns boolean
language sql
stable
as $$
  select core.has_permission(p_tenant_id, p_permission, p_location_id);
$$;

comment on function api.has_permission(uuid, text, uuid) is
  'Boolean permission check delegating to core.has_permission. Invoker-only (no SECURITY DEFINER); exposes no permission/role/membership rows, only a boolean.';

revoke all on function api.has_permission(uuid, text, uuid) from public;
grant execute on function api.has_permission(uuid, text, uuid) to authenticated;
