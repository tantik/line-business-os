# ADR 0007: Core helper EXECUTE hardening before Data API exposure (Phase 1E-1)

- Status: Accepted
- Date: 2026-06-25
- Extends: ADR 0006 (authenticated tenant read access), ADR 0005 (data access model)

## Context

Phase 1E needs the Supabase Cloud **Data API** to expose schema `core` so the
authenticated browser client can read `core.tenants` / `core.tenant_memberships`
through PostgREST (the Phase 1D surface). The Phase 1E-0 review flagged a
conflict before exposing `core`:

- PostgREST serves only objects in the exposed schemas, and exposing a schema
  turns every function in it into a callable **RPC** for any role that has both
  schema `USAGE` and function `EXECUTE`.
- Supabase explicitly warns that **SECURITY DEFINER functions should not live in
  an exposed schema**, because they run with the definer's (owner `postgres`)
  privileges and bypass RLS.
- Schema `core` contains the RBAC/identity helpers from migration `0006`
  (`core.current_user_id`, `core.is_platform_staff`, `core.is_member_of`,
  `core.has_permission`) plus the trigger helpers (`core.set_updated_at`,
  `core.enforce_platform_staff_immutable`). All of them were created **without
  explicit EXECUTE control**, so they still carried PostgreSQL's implicit
  `PUBLIC` EXECUTE grant.

Migration `0013` had already fixed exactly this for
`core.shares_tenant_with(uuid)` (revoke from `PUBLIC`, grant only to
`authenticated`). The remaining `0006` helpers were never given the same
treatment — an inconsistency, and a real risk the moment `core` is exposed.

The review also confirmed the residual data risk is **low**: every DEFINER
helper is self-constrained (filters on `core.current_user_id()` and returns only
a boolean, or returns the caller's own id), so even with RLS bypassed there is
no row/PII exfiltration path — the worst case is a boolean oracle. The fix is
therefore about removing the *implicit PUBLIC* surface and making grants
explicit and minimal, not about a data leak.

## Decision

Add forward-only migration
`supabase/migrations/0014_core_helper_execute_hardening.sql` (privileges only —
no function bodies, RLS policies, or table grants change):

1. **Revoke the implicit `PUBLIC` EXECUTE** from all seven `core` helpers.

2. **Grant EXECUTE only to `authenticated`** for the five helpers that RLS
   policies / app-facing checks must call:
   `core.current_user_id()`, `core.is_platform_staff()`,
   `core.is_member_of(uuid)`, `core.has_permission(uuid, text, uuid)`, and
   `core.shares_tenant_with(uuid)` (the last reasserted identically to `0013`).

3. **Grant nothing to the trigger helpers** (`core.set_updated_at`,
   `core.enforce_platform_staff_immutable`). A trigger fires under the
   table-owner context and PostgreSQL does not check the invoking role's EXECUTE
   privilege on a trigger function, so revoking `PUBLIC` is safe and they need
   no client-role grant.

4. **Never grant to `anon`** (which also has no `core` schema `USAGE`).

5. **Do not grant to `service_role`.** It bypasses RLS (`BYPASSRLS`) so it never
   invokes these helpers through a policy, and the owning role (`postgres`)
   keeps EXECUTE on functions it owns regardless of these grants — so
   migrations, seed, and pgTAP (run as superuser) are unaffected. This mirrors
   the `0013` precedent.

Helper-to-helper composition is unaffected: when a DEFINER helper calls another
helper, the nested EXECUTE check runs as the function owner (`postgres`), which
owns all of them.

## Consequences

- No core helper relies on the implicit `PUBLIC` grant any more; the EXECUTE
  posture of the whole `core` helper set is explicit, minimal, and stated in one
  migration.
- Behavior is unchanged: RLS still engages for `authenticated` exactly as in
  Phase 1D, and the Phase 1D access tests (`0003`) continue to pass.
- New pgTAP coverage (`supabase/tests/0004_core_helper_execute.sql`) asserts the
  exact posture: PUBLIC has EXECUTE on none of the helpers, every helper has an
  explicit (non-null) ACL, `anon` can execute none, `authenticated` can execute
  the five RLS/app helpers and **cannot** execute the two trigger helpers.
- **This does NOT expose `core`.** Exposing `core` in the Supabase Cloud Data
  API remains a separate, explicitly approved step. Phase 1E Stage 2 stays
  blocked until `0014` is merged/applied **and** `core` exposure is approved.
- **Long-term**, the production-safe path is a dedicated `api`/facade schema
  (security-invoker views + a curated RPC set) as the only Data-API-exposed
  surface, keeping internal `core` private. That is later, separately scoped
  work (see `docs/phase-1e-data-api-exposure.md`).
