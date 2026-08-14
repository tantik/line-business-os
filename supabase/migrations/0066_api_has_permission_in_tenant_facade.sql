-- ============================================================================
-- 0066  api.has_permission_in_tenant RPC facade
-- ----------------------------------------------------------------------------
-- Adds an app-callable, tenant-wide (location-independent) permission check,
-- delegating to the existing core.has_permission_in_tenant (0022) exactly the
-- way api.has_permission (0019) delegates to core.has_permission.
--
-- WHY THIS IS A DISTINCT RPC, NOT JUST api.has_permission(tenant, perm, null):
-- core.has_permission's location predicate is
-- `ra.location_id is null or ra.location_id = p_location_id` -- passing
-- p_location_id = null does NOT mean "any location", it means "only matches
-- a TENANT-WIDE (location_id IS NULL) role assignment", because
-- `ra.location_id = null` is never true in SQL. A Manager whose role
-- assignment is scoped to a specific location (the common case -- see every
-- pgTAP fixture in this codebase) would silently and incorrectly fail
-- api.has_permission(tenant, 'workforce.staff.manage', null). This bug was
-- caught in this session's own local smoke test of the invite-employee Edge
-- Function (a location-scoped Manager was rejected as not_authorized) before
-- it could reach the same mistake already avoided once in
-- workforce.upsert_employee_invitation (0065), which correctly uses
-- core.has_permission_in_tenant instead. This RPC gives app code (the
-- invite-employee Edge Function, and any future caller with the same
-- tenant-wide-only need) the same correct, location-independent check
-- api.has_permission cannot provide.
--
-- SECURITY MODEL: identical to 0019 -- NOT SECURITY DEFINER (satisfies ADR
-- 0008 by construction; the invoker-only wrapper delegates to an already
-- SECURITY DEFINER core function, exactly like api.has_permission wraps the
-- SECURITY DEFINER core.has_permission). No table/view exposed, only a
-- boolean. `anon` receives no grant.
-- ============================================================================

create or replace function api.has_permission_in_tenant(
  p_tenant_id uuid,
  p_permission text
)
returns boolean
language sql
stable
as $$
  select core.has_permission_in_tenant(p_tenant_id, p_permission);
$$;

comment on function api.has_permission_in_tenant(uuid, text) is
  'Tenant-wide (location-independent) boolean permission check delegating to core.has_permission_in_tenant (0022). Invoker-only (no SECURITY DEFINER); exposes no permission/role/membership rows, only a boolean. Use this instead of api.has_permission(tenant, perm, null) for a permission whose role assignment may be location-scoped -- passing null as api.has_permission''s p_location_id matches ONLY a tenant-wide assignment, never a location-scoped one.';

revoke all on function api.has_permission_in_tenant(uuid, text) from public;
grant execute on function api.has_permission_in_tenant(uuid, text) to authenticated;
