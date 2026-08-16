-- ============================================================================
-- 0014  Core helper EXECUTE hardening (Phase 1E-1)
-- ----------------------------------------------------------------------------
-- Pre-exposure security hardening. Migration 0006 created the SECURITY DEFINER
-- RBAC/identity helpers and the trigger helpers WITHOUT explicit EXECUTE
-- control, so they still rely on PostgreSQL's implicit `PUBLIC` EXECUTE grant
-- on every new function. Migration 0013 already fixed this for
-- `core.shares_tenant_with(uuid)` (revoke from PUBLIC, grant only to
-- `authenticated`). This migration applies the same explicit posture to the
-- remaining `core` helpers so that NO core helper depends on the implicit
-- PUBLIC grant.
--
-- WHY NOW (Phase 1E-0 review): exposing `core` to the Supabase Data API turns
-- every function in the schema into a callable PostgREST RPC for any role that
-- has both schema USAGE and function EXECUTE. Supabase warns against keeping
-- SECURITY DEFINER functions in an exposed schema for exactly this reason.
-- Before `core` is ever exposed in Cloud dev, the EXECUTE grants on these
-- helpers must be explicit and minimal rather than implicit/PUBLIC.
--
-- WHAT THIS CHANGES (privileges only — no behavior change):
--   * Revoke the implicit PUBLIC EXECUTE from all core helpers.
--   * Grant EXECUTE only to `authenticated` for the helpers that RLS policies
--     (and app-facing checks) must be able to call:
--       core.current_user_id(), core.is_platform_staff(),
--       core.is_member_of(uuid), core.has_permission(uuid, text, uuid),
--       core.shares_tenant_with(uuid)  [reasserted to match 0013].
--   * Trigger helpers (core.set_updated_at, core.enforce_platform_staff_immutable)
--     get NO role EXECUTE grant: a trigger fires under the table-owner context
--     and PostgreSQL does not check the invoking role's EXECUTE privilege on a
--     trigger function, so revoking PUBLIC is safe and they need nothing else.
--
-- WHAT THIS DOES NOT CHANGE:
--   * No function bodies are altered.
--   * No RLS policies are altered.
--   * No table grants are altered.
--   * `anon` is never granted anything (it also has no `core` schema USAGE).
--   * `service_role` is intentionally NOT granted EXECUTE here: it bypasses RLS
--     (BYPASSRLS) so it never invokes these helpers through a policy, and the
--     owning role (postgres) retains EXECUTE on functions it owns regardless of
--     these grants (so migrations, seed and pgTAP — run as superuser — are
--     unaffected). This mirrors the 0013 precedent for shares_tenant_with.
--
-- SECURITY DEFINER internal composition is unaffected: when a DEFINER helper
-- (e.g. core.is_member_of) calls another helper (core.is_platform_staff,
-- core.current_user_id), the nested EXECUTE check is evaluated as the function
-- owner (postgres), which owns all of them — so revoking PUBLIC does not break
-- helper-to-helper calls.
-- ============================================================================

-- --- Identity (SECURITY INVOKER) -------------------------------------------
-- Returns the caller's own JWT sub. RLS policies (e.g. memberships_select_self)
-- call it directly as the invoking role, so `authenticated` needs EXECUTE.
revoke all on function core.current_user_id() from public;
grant execute on function core.current_user_id() to authenticated;

-- --- RBAC / membership checks (SECURITY DEFINER) ---------------------------
-- Called inside RLS policies on core.tenants / core.tenant_memberships (and
-- future surfaces). To call a SECURITY DEFINER function the caller still needs
-- EXECUTE, so `authenticated` must keep it — but only explicitly, never via the
-- implicit PUBLIC grant.
revoke all on function core.is_platform_staff() from public;
grant execute on function core.is_platform_staff() to authenticated;

revoke all on function core.is_member_of(uuid) from public;
grant execute on function core.is_member_of(uuid) to authenticated;

revoke all on function core.has_permission(uuid, text, uuid) from public;
grant execute on function core.has_permission(uuid, text, uuid) to authenticated;

-- --- Co-member helper (SECURITY DEFINER) — reassert 0013 posture -----------
-- Already hardened in 0013. Reasserted here (identical grant) so 0014 is the
-- single, self-contained statement of the full core-helper EXECUTE posture.
-- This does NOT weaken it: PUBLIC stays revoked, authenticated keeps EXECUTE.
revoke all on function core.shares_tenant_with(uuid) from public;
grant execute on function core.shares_tenant_with(uuid) to authenticated;

-- --- Trigger helpers (no app-role EXECUTE needed) --------------------------
-- Trigger functions are invoked by the trigger machinery under the table-owner
-- context; PostgreSQL does not check the triggering role's EXECUTE privilege.
-- Revoke the implicit PUBLIC grant and grant to no client role.
revoke all on function core.set_updated_at() from public;
revoke all on function core.enforce_platform_staff_immutable() from public;
