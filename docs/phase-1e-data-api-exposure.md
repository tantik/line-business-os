# Phase 1E — Data API exposure (core helper hardening first)

Phase 1E prepares the Supabase **Cloud dev** Data API to serve the Phase 1D
authenticated read surface (`core.tenants`, `core.tenant_memberships`) through
PostgREST. Exposing a schema to the Data API makes every function in it a
callable RPC, so this phase front-loads a focused security-hardening step before
any exposure happens.

> ✅ **Status: Phase 1E-1 — implemented locally.** Migration `0014` makes the
> EXECUTE posture of all `core` helper functions explicit. **`core` is NOT
> exposed** in the Cloud Data API by this work, and no Cloud/Dashboard setting is
> changed. Validated against the **local** Supabase stack only.

## Stages

- **Phase 1E-0 — review (done).** Inventoried `core` functions and confirmed
  that exposing `core` would make the SECURITY DEFINER helpers callable via RPC
  by `authenticated`, that `anon` stays blocked (no `core` schema `USAGE`), and
  that the residual risk is low (self-scoped boolean oracles, no row/PII leak).
- **Phase 1E-1 — core helper EXECUTE hardening (this change).** Remove the
  implicit `PUBLIC` EXECUTE from every `core` helper and grant EXECUTE explicitly
  and minimally. See ADR 0007 and migration `0014`.
- **Phase 1E Stage 2 — BLOCKED.** Do not create Stage 2 fixtures and do not
  expose `core` until `0014` is merged/applied **and** Cloud dev `core` exposure
  is explicitly approved.

## What migration 0014 does

`supabase/migrations/0014_core_helper_execute_hardening.sql` (privileges only):

| Function | Type | PUBLIC | anon | authenticated | service_role |
| --- | --- | --- | --- | --- | --- |
| `core.current_user_id()` | INVOKER | revoked | none | **EXECUTE** | not granted (owner-only) |
| `core.is_platform_staff()` | DEFINER | revoked | none | **EXECUTE** | not granted (owner-only) |
| `core.is_member_of(uuid)` | DEFINER | revoked | none | **EXECUTE** | not granted (owner-only) |
| `core.has_permission(uuid, text, uuid)` | DEFINER | revoked | none | **EXECUTE** | not granted (owner-only) |
| `core.shares_tenant_with(uuid)` | DEFINER | revoked (0013) | none | **EXECUTE** (0013) | not granted (owner-only) |
| `core.set_updated_at()` | INVOKER (trigger) | revoked | none | none | not granted (owner-only) |
| `core.enforce_platform_staff_immutable()` | INVOKER (trigger) | revoked | none | none | not granted (owner-only) |

Notes:

- **No function bodies, RLS policies, or table grants change.** This is a pure
  EXECUTE-grant hardening migration.
- **Trigger helpers need no client EXECUTE.** A trigger fires under the
  table-owner context and PostgreSQL does not check the invoking role's EXECUTE
  privilege on a trigger function, so revoking `PUBLIC` is safe.
- **`service_role` is intentionally not granted.** It bypasses RLS (`BYPASSRLS`)
  and never invokes these helpers through a policy; the owner (`postgres`) keeps
  EXECUTE on what it owns, so migrations/seed/pgTAP (superuser) are unaffected.
  This mirrors the `0013` precedent for `shares_tenant_with`.
- **`anon` stays fully blocked** from both schema usage and RPC: it has no `core`
  schema `USAGE` (never granted) and now no EXECUTE either.

## Tests

```bash
pnpm exec supabase db reset
pnpm exec supabase test db
```

- `supabase/tests/0004_core_helper_execute.sql` — asserts the exact EXECUTE
  posture above: PUBLIC has EXECUTE on none of the helpers, every helper has an
  explicit (non-null) ACL, `anon` can execute none, `authenticated` can execute
  the five RLS/app helpers and cannot execute the two trigger helpers.
- `supabase/tests/0003_authenticated_access.sql` — unchanged Phase 1D behavior
  still passes (own-membership read, own-tenant read, cross-tenant denial,
  manager/platform managed path, `shares_tenant_with` behavior + EXECUTE posture,
  anon/no-JWT denial, writes blocked).
- `supabase/tests/0002_security_rls.sql` — unchanged grant invariants still hold.

## Long-term production-safe path (not this PR)

The production-safe design is **not** to expose raw `core`. Instead, expose only
a dedicated `api`/facade schema to the Data API:

- `api` contains security-invoker views over the intended read surfaces (RLS
  still enforced) and a curated set of RPCs.
- Internal `core` (tables + SECURITY DEFINER helpers) stays unexposed.
- The app reads `api.*` only.

That facade is later, separately scoped work. Phase 1E-1 is the minimal,
low-risk hardening that must land first regardless of which exposure path is
chosen.

## Safety / scope guardrails

- ❌ No Cloud Data API / Dashboard setting changed; `core` is **not** exposed.
- ❌ No Auth users created; no tenants / `core.users` / `core.tenant_memberships`
  inserted.
- ❌ No function bodies, RLS policies, or table grants changed.
- ❌ No grant to `anon`; no broad schema/table permissions.
- ❌ No edits to migrations `0000`–`0013`; forward-only migration `0014`.
- ❌ No `supabase db push` / `db pull` / `db reset --linked` / `migration repair`.
- ✅ Local-only validation; Cloud apply and `core` exposure require explicit
  approval (ADR 0005 / 0006 / 0007, `docs/phase-1-core-db.md` §3).
