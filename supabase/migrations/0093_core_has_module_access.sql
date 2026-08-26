-- ============================================================================
-- 0093  core.has_module_access(uuid, core.module_code) — reusable Module-OFF
--       security primitive (Module Access Security Remediation, WP-S1)
-- ----------------------------------------------------------------------------
-- Prior state: `core.tenant_modules.is_enabled` was tenant configuration/UI
-- state only. No RLS policy or RPC checked it, so a tenant with a module
-- turned OFF still had full tenant-facing read/write access to that module's
-- data through direct PostgREST access, views, and mutation RPCs. This
-- migration adds the one reusable helper the staged domain remediation
-- (WP-S2..WP-S6) will call from RLS policies; it does not itself change any
-- product RLS policy or behavior.
--
-- Contract (Founder-approved, MODULE_ACCESS_SECURITY_REMEDIATION mission):
--   * module row missing for the tenant -> false;
--   * core.tenant_modules.is_enabled = false -> false;
--   * core.tenant_modules.is_enabled = true  -> true;
--   * NO core.is_platform_staff() bypass -- deliberately different from
--     core.has_permission(). Platform-staff module access will be a future,
--     separately-designed, explicit/audited capability, not an automatic
--     bypass baked into this primitive.
--   * fail closed on any ambiguity.
--   * a future Entitlement layer can be added inside this function body
--     without changing any RLS call site.
--
-- Follows the established pattern (core.has_permission, 0006_helpers.sql):
-- SECURITY DEFINER, fixed search_path, STABLE, EXECUTE revoked from
-- PUBLIC/anon, granted to authenticated. service_role is also granted
-- EXECUTE up front (0077_has_permission_service_role_grants.sql documents
-- why this was needed as a second migration for has_permission when a view's
-- WHERE clause calls the function directly rather than through an RLS USING
-- clause that service_role's BYPASSRLS would skip -- granting it now avoids
-- repeating that follow-up).
--
-- Rollback: `drop function if exists core.has_module_access(uuid, core.module_code);`
-- Safe — no other object depends on this function yet (nothing calls it
-- until WP-S2 onward).
-- ============================================================================

create or replace function core.has_module_access(
  p_tenant_id uuid,
  p_module core.module_code
)
returns boolean
language sql stable security definer set search_path = core, public as $$
  select coalesce(
    (
      select tm.is_enabled
      from core.tenant_modules tm
      where tm.tenant_id = p_tenant_id
        and tm.module = p_module
    ),
    false
  );
$$;

comment on function core.has_module_access(uuid, core.module_code) is
  'Tenant-facing Module-OFF security boundary. Returns true only when the '
  'tenant has an explicit core.tenant_modules row for p_module with '
  'is_enabled = true. Missing row or is_enabled = false both fail closed to '
  'false. Deliberately has no platform-staff bypass. Combine with '
  'core.has_permission(...) in RLS policies -- module access and permission '
  'are two distinct layers, neither replaces the other.';

revoke all on function core.has_module_access(uuid, core.module_code) from public;
grant execute on function core.has_module_access(uuid, core.module_code) to authenticated;
grant execute on function core.has_module_access(uuid, core.module_code) to service_role;
