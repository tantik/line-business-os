# RLS Policies

Row Level Security policies are defined **inline with their tables** in
`supabase/migrations/` so that schema and policy always ship together and apply
in order via the Supabase CLI:

- Core + audit policies: `0007_rls_policies.sql`
- Workforce policies: `0009_workforce.sql`
- Booking policies: `0010_booking.sql`
- AI policies: `0011_ai.sql`

Shared helper functions used by all policies (`core.is_member_of`,
`core.has_permission`, `core.is_platform_staff`) live in `0006_helpers.sql`.

This folder is intentionally documentation-only; do not add standalone policy
SQL here that the migration runner would miss.

## Verifying policies

pgTAP tests in `supabase/tests/` assert the security invariants these policies
depend on: RLS is enabled on every business table, the audit log is append-only,
the platform-staff self-escalation guard is installed, and there are **no broad
grants** to `anon` / `authenticated` (the no-grants posture from ADR 0005, which
keeps direct browser DB access closed even though RLS is in place). Run them
with `pnpm db:reset` followed by `pnpm db:test`. See `docs/phase-1-core-db.md`.
