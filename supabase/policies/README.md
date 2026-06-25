# RLS Policies

Row Level Security policies are defined **inline with their tables** in
`supabase/migrations/` so that schema and policy always ship together and apply
in order via the Supabase CLI:

- Core + audit policies: `0007_rls_policies.sql`
- Workforce policies: `0009_workforce.sql`
- Booking policies: `0010_booking.sql`
- AI policies: `0011_ai.sql`
- Phase 1D authenticated access (Option T1): `0013_authenticated_tenant_access.sql`
  — narrow `authenticated` grants (`USAGE` on `core`; `SELECT` on `core.tenants`
  and `core.tenant_memberships`), the `core.shares_tenant_with` helper, and the
  split membership policies `memberships_select_self` /
  `memberships_select_managed` (replacing `memberships_select`).
- Phase 1E-1 core helper EXECUTE hardening: `0014_core_helper_execute_hardening.sql`
  — privileges only (no policy changes). Removes the implicit `PUBLIC` EXECUTE
  from every `core` helper and grants EXECUTE explicitly: `authenticated` for the
  five RLS/app helpers (`current_user_id`, `is_platform_staff`, `is_member_of`,
  `has_permission`, `shares_tenant_with`), and nothing for the two trigger
  helpers (`set_updated_at`, `enforce_platform_staff_immutable`). `anon` gets
  nothing. See `docs/phase-1e-data-api-exposure.md` and ADR 0007.

Shared helper functions used by all policies (`core.is_member_of`,
`core.has_permission`, `core.is_platform_staff`, and `core.shares_tenant_with`)
live in `0006_helpers.sql` and `0013_authenticated_tenant_access.sql`; their
EXECUTE privileges are hardened in `0014_core_helper_execute_hardening.sql`.

This folder is intentionally documentation-only; do not add standalone policy
SQL here that the migration runner would miss.

## Verifying policies

pgTAP tests in `supabase/tests/` assert the security invariants these policies
depend on: RLS is enabled on every business table, the audit log is append-only,
the platform-staff self-escalation guard is installed, and client grants stay
minimal — `anon` gets nothing, and `authenticated` gets only the narrow Phase 1D
surface (`USAGE` on `core` + `SELECT` on `core.tenants` and
`core.tenant_memberships`; see ADR 0005 + ADR 0006). `0003_authenticated_access.sql`
additionally proves the Option T1 access behavior (own-only membership reads,
manager-gated managed reads, cross-tenant denial, co-member visibility via
`core.shares_tenant_with`, anon/no-JWT denial, writes blocked). Run them with
`pnpm db:reset` followed by `pnpm db:test`. See `docs/phase-1-core-db.md` and
`docs/phase-1d-db-access-hardening.md`.
