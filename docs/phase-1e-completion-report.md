# Phase 1E Completion Report — Data API Facade + Authenticated Tenant Isolation

## Executive summary

Phase 1E delivered a production-safe Supabase Data API surface for authenticated
multi-tenant reads. Instead of ever exposing the internal `core` schema (tables +
`SECURITY DEFINER` helpers) to PostgREST, the app now reads tenant context only
through a dedicated, minimal `api` facade. The facade exposes a single
security-invoker view, `api.my_tenant_memberships`, that projects the current
user's active memberships joined to their tenant (ids + non-PII labels only) while
leaving the underlying `core` RLS as the sole source of truth.

The phase included a pre-exposure hardening step (explicit, minimal EXECUTE grants
on every `core` helper), the facade migration, the Cloud dev Data API exposure
change to `public, api`, and an end-to-end Stage 2 verification using a synthetic
fixture and two authenticated users. An initial Stage 2 failure (0 rows for
authenticated users) was root-caused to a JWT-claims GUC mismatch and fixed in a
forward-only migration. Final verification passed **23/23** checks.

## Repository state

- Branch: `dev`
- Latest commit: `c92de9f` — "Merge pull request #12 from
  tantik/feature/fix-current-user-id-jwt-claims"
- Working tree: clean (`git status --short` empty)
- Recent history (newest first):
  - `c92de9f` Merge PR #12 (JWT claims fix)
  - `b3fcb58` Sanitize SQL comments in JWT claims fix
  - `4c665a3` Fix current user id for JWT claims
  - `0516a67` Merge PR #11 (Phase 1E Data API facade)
  - `91c75e5` feat: add app-facing api facade
  - `0a4429e` Merge PR #9 (core helper execute hardening)
  - `5caf78e` feat: harden core helper execute privileges
- Migration files confirmed present: `0014_core_helper_execute_hardening.sql`,
  `0015_api_facade.sql`, `0016_fix_current_user_id_jwt_claims.sql`.
- Tests confirmed present: `supabase/tests/0003_authenticated_access.sql`,
  `0004_core_helper_execute.sql`, `0005_api_facade.sql` (plus `0001`/`0002`),
  and app-layer unit tests under `apps/web/src/lib/tenant/`.

## Cloud dev state

- Project: `line-business-os-dev`
- Region: `ap-southeast-1`
- Applied migrations: `0000`–`0016`
- Phase 1E Stage 2 verification: PASS, 23/23 checks
- No Cloud writes, setting changes, migration applies, `db pull`, `db reset
  --linked`, or `migration repair` were performed by this report.

## Architecture outcome

- The app reads tenant context exclusively through the `api` facade
  (`apps/web/src/lib/tenant/membership.ts` selects from
  `api.my_tenant_memberships`).
- `api.my_tenant_memberships` is a `security_invoker = true` view: it runs with
  the caller's privileges, so `core` RLS (`memberships_select_self`,
  `tenants_select`) remains the single source of truth. The view neither widens
  nor bypasses RLS; it only projects an allowed, self-scoped read
  (`user_id = core.current_user_id()` AND `status = 'active'`).
- Internal `core` (tables + `SECURITY DEFINER` helpers) stays unexposed to the
  Data API both locally and in Cloud.
- No `SECURITY DEFINER` object exists in `api`; no PII columns are projected
  (tenant id/slug/name/kind + membership location_id/status only).

## Security outcome

- `service_role` is not used on the frontend; the app uses the anon key + RLS.
- `anon` is granted nothing on the facade (no `api` schema USAGE, no view SELECT).
- `authenticated` has minimal grants: USAGE on `api` + SELECT on the view, plus
  the Phase 1D underlying privileges (USAGE on `core`, SELECT on the two core
  tables, EXECUTE on the required helpers).
- All `core` helper EXECUTE grants are explicit and minimal (PUBLIC revoked); no
  helper depends on the implicit PUBLIC grant.
- The facade is read-only from the app path; mutations remain on the backend
  service-role path.

## Migrations included

| Migration | Purpose | Behavior change |
| --- | --- | --- |
| `0014_core_helper_execute_hardening.sql` | Revoke implicit PUBLIC EXECUTE on all `core` helpers; grant EXECUTE only to `authenticated` for the five RLS/app helpers; trigger helpers get no client EXECUTE. | Privileges only — no function bodies, RLS, or table grants changed. |
| `0015_api_facade.sql` | Add schema `api` and the security-invoker view `api.my_tenant_memberships`; grant USAGE on `api` + SELECT on the view to `authenticated`. | Additive only; `core` untouched, `anon` granted nothing. |
| `0016_fix_current_user_id_jwt_claims.sql` | Redefine `core.current_user_id()` to resolve identity from the JSON `request.jwt.claims` GUC, then legacy `request.jwt.claim.sub`, then `app.current_user_id`. | Behavior-preserving superset; signature, SECURITY INVOKER posture, and EXECUTE ACL unchanged. |

## Data API exposure state

- Cloud dev Data API exposed schemas: `public`, `api`.
- `core` is NOT exposed.
- `audit`, `workforce`, `booking`, `ai` are NOT exposed.
- Local `supabase/config.toml` mirrors this: `[api].schemas = ["public", "api"]`.

## api facade behavior

- `api.my_tenant_memberships` is routable through the Data API.
- `anon` is denied (permission denied) on the view.
- `authenticated` users can read the view.
- The view is read-only from the app path (no INSERT/UPDATE/DELETE grants).

## Stage 2 synthetic fixture

- A synthetic smoke fixture was created in Cloud dev: two synthetic tenants
  (referred to here as smoke-tenant-a and smoke-tenant-b), two synthetic
  authenticated users (Alice, Bob), and active memberships scoping Alice to
  smoke-tenant-a and Bob to smoke-tenant-b.
- The fixture contains no real PII and exists only to validate authenticated
  isolation through the facade. It is retained (see "Remaining fixture state").

## Authenticated verification result

- Alice signs in and sees exactly smoke-tenant-a.
- Alice does not see smoke-tenant-b.
- Bob signs in and sees exactly smoke-tenant-b.
- Bob does not see smoke-tenant-a.
- Both users see only active memberships.

## Anon verification result

- `anon` is denied on `api.my_tenant_memberships` with a permission-denied error
  (no rows leaked, fail-closed).

## Negative schema exposure checks

- Requests to `core`, `audit`, `workforce`, `booking`, and `ai` through the Data
  API return `PGRST106` (Invalid schema), confirming these schemas are not
  reachable via PostgREST.

## Write-denial checks

- INSERT, UPDATE, and DELETE on `api.my_tenant_memberships` are denied from the
  app path. The facade is read-only; mutations stay on the backend service-role
  path.

## Incident / fix summary — current_user_id JWT claims

- Symptom: initial Stage 2 verification failed because authenticated Alice and
  Bob each saw 0 rows from `api.my_tenant_memberships`, even though Auth login,
  the fixture, direct DB reads, and the negative checks were all correct.
- Root cause: `core.current_user_id()` (from migration `0006`) resolved identity
  only from the legacy flattened GUC `request.jwt.claim.sub`. Supabase Cloud
  PostgREST exposes the verified JWT to SQL through the JSON GUC
  `request.jwt.claims` and does not reliably set the legacy GUC, so the helper
  resolved to NULL and RLS identity collapsed to "no user".
- Fix: `0016_fix_current_user_id_jwt_claims.sql` redefines the helper to resolve
  identity in priority order — (1) `request.jwt.claims` JSON `sub`, (2) legacy
  `request.jwt.claim.sub`, (3) `app.current_user_id` fallback — first non-null
  wins, using missing-ok `current_setting()` + `nullif()` so unset/empty GUCs
  yield NULL rather than raising. Signature, SECURITY INVOKER posture, and EXECUTE
  ACL are unchanged.
- Outcome: after applying `0016` to Cloud dev, the full Stage 2 suite passed
  23/23.

## Remaining fixture state

- The synthetic smoke fixture (synthetic tenants, users, and active memberships)
  is retained in Cloud dev. It contains no real PII and is the basis for the
  passing Stage 2 verification. It can be reused for Phase 1F and removed later
  under the normal approval-gated Cloud-write path.

## What was intentionally not done

- No migrations were applied and no Cloud writes were performed by this report.
- No Cloud settings were changed.
- No `supabase db pull`, `db reset --linked`, or `migration repair`.
- `.env.local` was not edited.
- No product features were built (the facade and helpers are foundation
  plumbing only).
- No legacy repo (`cafe-shift`, `line-app`) content was moved or copied.
- No secrets, DB URLs, keys, passwords, JWTs, refresh tokens, or user UUIDs are
  included here.

## Risks / watch items

- JWT-claims GUC dependency: `core.current_user_id()` now depends on PostgREST
  setting `request.jwt.claims`. Any future change to the Auth/PostgREST claim
  shape should be re-verified against this helper.
- Cloud Data API exposure drift: the exposed-schemas list must stay `public, api`.
  `core`/`audit`/`workforce`/`booking`/`ai` must never be added to the Cloud Data
  API. Treat exposure changes as reviewed, approval-gated events.
- Local vs Cloud parity: local `config.toml` and Cloud exposure currently match;
  keep them in sync when either changes.
- Fixture lifecycle: the synthetic fixture lives in Cloud dev and should be
  cleaned up via the approval-gated write path once no longer needed.
- Facade growth: each new `api` view/RPC must preserve the no-PII /
  no-`SECURITY DEFINER` / RLS-preserving invariants through a reviewed migration.

## Recommended next phase — Phase 1F app integration verification

Phase 1E proved the database + Data API surface end-to-end with raw clients and a
synthetic fixture. Phase 1F should verify the same isolation through the actual
`apps/web` authenticated app path:

- Exercise `listTenantMemberships` against Cloud dev with real authenticated
  sessions for the synthetic users and confirm the same per-user isolation.
- Confirm the app's fail-closed mapping (`unauthorized` / `no_membership`)
  behaves correctly for anon, no-membership, and over-restricted-grant cases.
- Validate protected-route / tenant-context wiring on top of the facade read.
- Keep all Cloud writes (including eventual fixture teardown) approval-gated.
