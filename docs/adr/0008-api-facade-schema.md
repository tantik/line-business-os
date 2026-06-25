# ADR 0008: App-facing `api` facade schema (Phase 1E-3)

- Status: Accepted
- Date: 2026-06-25
- Extends: ADR 0007 (core helper EXECUTE hardening), ADR 0006 (authenticated
  tenant read access), ADR 0005 (data access model)

## Context

Phase 1D/1E opened a narrow `authenticated` read surface on `core.tenants` and
`core.tenant_memberships` and hardened the EXECUTE posture of every `core` helper
(ADR 0006 / 0007). To let the browser client read tenant context through the
Supabase **Data API** (PostgREST), a schema must be added to the Data API's
exposed-schemas list. Exposing a schema, however, turns **every function in it
into a callable RPC**, and Supabase explicitly warns against keeping
`SECURITY DEFINER` functions in an exposed schema. Schema `core` holds exactly
those helpers (`core.is_member_of`, `core.has_permission`,
`core.is_platform_staff`, `core.shares_tenant_with`), so exposing raw `core`
would publish them as RPCs.

ADR 0007 already recorded the long-term direction: do **not** expose `core`;
instead expose a dedicated `api`/facade schema that is the only app-facing
surface. Phase 1E-3 implements that facade. The Cloud dev project
(`line-business-os-dev`) was confirmed read-only to run **PostgreSQL major
version 17**, so `security_invoker` views (PostgreSQL ≥ 15) are available.

Two designs were considered for the first use case (list the current user's
active tenant memberships, joined to tenant id/slug/name/kind, to select the
active tenant context):

- **Option A — `api` security-invoker view** over `core.tenant_memberships`
  joined to `core.tenants`. RLS-preserving, no `SECURITY DEFINER`, mirrors the
  existing PostgREST select with minimal app churn.
- **Option B — `api.get_my_tenant_memberships()` RPC** returning only the
  current user's memberships. A valid alternative, better suited to encapsulated
  multi-step logic, but introduces a function to audit and slightly more app
  churn for no current benefit.

## Decision

Adopt **Option A**, implemented in
`supabase/migrations/0015_api_facade.sql`:

1. **Keep `core` internal.** All `core` tables and all `core` helpers
   (including the `SECURITY DEFINER` ones) stay unexposed to the Data API. The
   app never reads raw `core` over PostgREST.

2. **Expose only an `api` facade.** Create schema `api` and a single
   security-invoker view:

   ```sql
   create view api.my_tenant_memberships
     with (security_invoker = true) as
   select tm.tenant_id, t.slug as tenant_slug, t.name as tenant_name,
          t.kind as tenant_kind, tm.location_id, tm.status
   from core.tenant_memberships tm
   join core.tenants t on t.id = tm.tenant_id
   where tm.user_id = core.current_user_id()
     and tm.status = 'active';
   ```

   It exposes **non-PII** columns only (tenant id/slug/name/kind + membership
   location_id/status); no `core.users` columns.

3. **`security_invoker` over `SECURITY DEFINER`.** The view runs with the
   caller's privileges, so the existing core RLS (`memberships_select_self`,
   `tenants_select`) and the 0013/0014 grants + EXECUTE posture remain the single
   source of truth. The view neither widens nor bypasses RLS — it only projects
   an already-permitted read. **No `SECURITY DEFINER` object is allowed in `api`**
   precisely because exposed-schema functions become RPCs; an invoker view keeps
   the privilege story honest and auditable.

4. **Minimal grants.** `GRANT USAGE ON SCHEMA api` and `GRANT SELECT ON
   api.my_tenant_memberships` to `authenticated` only. **`anon` is granted
   nothing** (no schema USAGE, no view SELECT) and stays fully fail-closed. No
   write grants; mutations remain on the backend service-role path (ADR 0005).
   `service_role` needs no grant (it bypasses RLS; the owner keeps privileges).

5. **First supported use case.** The current user's active tenant memberships
   joined to their tenant — feeding `listTenantMemberships` →
   `selectActiveTenant` → `getActiveTenantContext` in `apps/web`.

6. **Local Data API exposes only `public` + `api`.** `supabase/config.toml`
   `[api].schemas` is set to `["public", "api"]`, removing `core`, `audit`,
   `workforce`, `booking`, and `ai` from local PostgREST. This mirrors the
   intended Cloud dev posture.

## Consequences

- The web app reads tenant context through `api.my_tenant_memberships` instead of
  raw `core`. `apps/web/src/lib/tenant/membership.ts` selects the flat view; its
  `listTenantMemberships(supabase, userId)` contract is unchanged (the `userId`
  argument is retained for stability though the view is already self-scoped).
- Internal `core` is never published to the Data API; the `SECURITY DEFINER`
  helpers cannot be called as RPCs through the facade.
- **Dependency:** because the view is security-invoker, `authenticated` still
  needs the Phase 1D underlying privileges (USAGE on `core` + SELECT on the two
  core tables, EXECUTE on `core.current_user_id()`) to resolve it. These are left
  unchanged. Removing them would break the facade — do not "tidy" them away.
- New pgTAP coverage (`supabase/tests/0005_api_facade.sql`) asserts: schema/view
  exist, the view is `security_invoker`, `api` has no `SECURITY DEFINER`
  function, `anon` has no `api` access, `authenticated` has USAGE + SELECT and no
  writes, and the behavioral own-only / active-only / cross-tenant / no-JWT
  outcomes. Existing `0003` / `0004` continue to pass.
- **This does NOT change any Cloud setting.** Migration `0015` is validated
  **locally only**. Applying it to Cloud dev and adding `api` to the Cloud Data
  API exposed schemas remain separate, explicitly approved steps (ADR 0005 /
  `docs/supabase-cloud-dev-setup.md`). **`core` must never be added to the Cloud
  Data API.**
- **Long-term:** additional `api` objects (more curated views or invoker RPCs)
  are added only through new, reviewed forward migrations, each keeping the
  no-PII / no-`SECURITY DEFINER` / RLS-preserving invariants of this ADR.

## Alternatives considered

- **Expose raw `core`** — rejected: publishes `SECURITY DEFINER` helpers as RPCs
  and the full table surface; contradicts ADR 0007.
- **Option B (`api.get_my_tenant_memberships()` RPC)** — viable and RLS-
  preserving if `SECURITY INVOKER`, but adds a function to maintain/audit for no
  present gain. Reserved for future use cases that need encapsulated logic.
