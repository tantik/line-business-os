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
>
> ✅ **Status: Phase 1E-3 — implemented locally.** Migration `0015` adds the
> production-safe **`api` facade** (security-invoker view `api.my_tenant_memberships`)
> and the local Data API now exposes only `public` + `api`. **`core` is still NOT
> exposed** (neither locally nor in Cloud), and no Cloud/Dashboard setting is
> changed. Validated against the **local** Supabase stack only. See ADR 0008.

## Stages

- **Phase 1E-0 — review (done).** Inventoried `core` functions and confirmed
  that exposing `core` would make the SECURITY DEFINER helpers callable via RPC
  by `authenticated`, that `anon` stays blocked (no `core` schema `USAGE`), and
  that the residual risk is low (self-scoped boolean oracles, no row/PII leak).
- **Phase 1E-1 — core helper EXECUTE hardening (this change).** Remove the
  implicit `PUBLIC` EXECUTE from every `core` helper and grant EXECUTE explicitly
  and minimally. See ADR 0007 and migration `0014`.
- **Phase 1E-3 — `api` facade (implemented locally).** Migration `0015` adds the
  `api` schema + the security-invoker view `api.my_tenant_memberships`, the app
  reads tenant context through `api` (not `core`), and local
  `supabase/config.toml` exposes only `public` + `api`. This supersedes the
  earlier plan to expose `core`: **`core` is never exposed to the Data API.** See
  ADR 0008.
- **Phase 1E Stage 2 — BLOCKED.** The Stage 2 fixtures (Auth users / tenants /
  `core.users` / `core.tenant_memberships` in Cloud dev) remain blocked until
  `0015` is merged, applied to Cloud dev under the approval gate, **and** the
  Cloud Data API is changed to expose `api` (NOT `core`). `core` exposure is no
  longer a path at all.

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

## Production-safe path (implemented in Phase 1E-3)

The production-safe design is **not** to expose raw `core`. Instead, expose only
a dedicated `api`/facade schema to the Data API. Phase 1E-3 (migration `0015`)
implements the first piece of this:

- `api` contains security-invoker views over the intended read surfaces (RLS in
  `core` still enforced as the caller). The first object is
  `api.my_tenant_memberships`. Future curated views / invoker RPCs are added
  through new reviewed migrations, keeping the no-PII / no-`SECURITY DEFINER` /
  RLS-preserving invariants (ADR 0008).
- Internal `core` (tables + `SECURITY DEFINER` helpers) stays unexposed.
- The app reads `api.*` only (`apps/web/src/lib/tenant/membership.ts`).

### Local Data API exposure (config.toml)

`supabase/config.toml` `[api].schemas` is now `["public", "api"]`. `core`,
`audit`, `workforce`, `booking`, and `ai` are **not** exposed to the local
PostgREST Data API. The DB schemas still exist (pgTAP runs directly against the
database); only the PostgREST surface is narrowed.

### Cloud dev Data API (NOT changed yet)

The Cloud dev project (`line-business-os-dev`, PostgreSQL 17) Data API still
exposes its existing schemas; **no Cloud/Dashboard setting was changed by this
work.** Eventually, after `0015` is merged and applied to Cloud dev under the
approval gate, the Cloud Data API exposed-schemas list should be set to
`public, api` (add `api`, keep `public`). **`core` (and `audit` / `workforce` /
`booking` / `ai`) must never be added to the Cloud Data API.**

## Safety / scope guardrails

- ❌ No Cloud Data API / Dashboard setting changed; `core` is **not** exposed
  (locally or in Cloud). Phase 1E-3 narrows only the **local** `config.toml`
  Data API to `public` + `api`.
- ❌ No Auth users created; no tenants / `core.users` / `core.tenant_memberships`
  inserted.
- ❌ No `core` function bodies, RLS policies, or `core` table grants changed by
  `0015` (the facade is additive: a new schema + invoker view + its own grants).
- ❌ No grant to `anon`; no `SECURITY DEFINER` object in `api`; no PII exposed.
- ❌ No edits to migrations `0000`–`0014`; forward-only migration `0015`.
- ❌ No `supabase db push` / `db pull` / `db reset --linked` / `migration repair`.
- ✅ Local-only validation; Cloud apply and any Cloud Data API `api` exposure
  require explicit approval (ADR 0005 / 0006 / 0007 / 0008,
  `docs/phase-1-core-db.md` §3).
