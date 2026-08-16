# Phase 1J-1C — apps/api Auth-Boundary Spike: Implementation Plan

## Status / scope

Status: **Plan only. Not implementation approval.**
Branch: `plan/phase-1j-1c-apps-api-auth-boundary-spike`
Base: `a7bcb4f` (PR #64, merge of `plan/phase-1j-1b-apps-api-boundary-review`).

This document is the only file produced by this task
(`docs/phase-1j-1c-apps-api-auth-boundary-spike-plan.md`). No other file was
read-modified, no code was written, no dependency was added, no migration
was touched, no Supabase command was run, no `service_role` client was
constructed, and no `.env` value was read or printed to produce it.

This is a plan for a **future, separately-approved** spike that would
validate the minimal identity/authorization path between `apps/web` and
`apps/api`:

```
apps/web (server-side)
  -> obtains current Supabase session/access token safely
  -> forwards Authorization: Bearer <access_token> to apps/api
  -> apps/api verifies token via createUserClient(token).auth.getUser()
  -> apps/api resolves tenant/location context via resolveTenantContext
  -> apps/api checks permission via requirePermission
  -> apps/api returns a safe, non-PII test response
```

Explicitly **not** in scope for the spike this plan describes: Workforce
implementation, PII implementation, `service_role` writes, or deployment.
Those remain gated behind separate approvals per
[`phase-1j-1-workforce-mvp-architecture-plan.md`](./phase-1j-1-workforce-mvp-architecture-plan.md)
and
[`phase-1j-1b-apps-api-boundary-review.md`](./phase-1j-1b-apps-api-boundary-review.md).

## Executive summary

Phase 1J-1B verified that `apps/api` has no auth, no tenant/permission
wiring, and no deployment target, but that the primitives this boundary
needs — `createUserClient`, `createServiceClient`, `resolveTenantContext`,
`requirePermission`, `writeAudit`, `redactPII`, and the PII crypto helpers —
already exist in `packages/core` and `packages/db`, are already declared as
`apps/api` dependencies, and are unused and untested from `apps/api`. This
plan lays out the smallest safe spike that would prove that chain actually
works end to end — one Nest guard, one throwaway non-PII test route, one
`apps/web` server-side call — with **no** `service_role` usage, **no**
Workforce logic, and **no** deployment step required to validate it locally.
The guard would use `createUserClient` (anon key + forwarded bearer token)
for both JWT verification and tenant/permission resolution, so
`service_role` is not needed for this spike at all (see "service_role
safety decision" below). The output of running this spike (once approved)
would be direct evidence — not just design confidence — that the auth
boundary `apps/api` needs for Workforce PII/writes actually functions,
before any Workforce-specific code is written.

## Verified repository findings

All claims below were checked directly against the current working tree on
this branch (`a7bcb4f` base) during this planning pass; file:line references
are exact.

- `apps/api/src/app.module.ts:1-9` — registers exactly two controllers,
  `HealthController` and `LineWebhookController`. No `providers`, no
  `imports`, no guards.
- `apps/api/src/main.ts:1-26` — Nest bootstrap; raw-body capture middleware
  (for LINE signature verification only); `app.enableCors({ origin:
  env.WEB_ORIGIN, credentials: true })`; listens on `env.API_PORT`.
- `apps/api/src/health.controller.ts:1-9` — `GET /health`, no auth, returns
  `{ status: 'ok', service: 'line-business-os-api' }`.
- `apps/api/src/line/line-webhook.controller.ts:1-43` — `POST
  /line/webhook`, verifies `x-line-signature` against the raw body; the only
  existing "verification" pattern in `apps/api`, and it is signature-based,
  not JWT/session-based — not reusable for user auth.
- No `@UseGuards`, `@Injectable` guard class, `CanActivate` implementation,
  `@Catch`/`ExceptionFilter`, or `HttpException` subclass exists anywhere in
  the repository (confirmed by repo-wide search) — `apps/api` has zero
  existing guard or error-mapping infrastructure to build on or conflict
  with.
- `apps/api/package.json` — dependencies already include `@line-os/core`,
  `@line-os/db`, `@line-os/config`, `@nestjs/common`, `@nestjs/core`,
  `@nestjs/platform-express`, `reflect-metadata`, `rxjs`. **No new package
  would be required for this spike.**
- `packages/core/src/index.ts:1-3` re-exports `permissions.js`,
  `tenant-context.js`, `audit.js` in full; `packages/core/package.json`
  exposes subpath exports `./permissions`, `./tenant-context`, `./audit` in
  addition to `.`.
- `packages/db/src/index.ts:1-3` re-exports `client.js`, `crypto.js`,
  `types.js` in full; `packages/db/package.json` exposes subpath exports
  `./crypto`, `./client`, `./types` in addition to `.`.
- `packages/core/src/tenant-context.ts:18-52` — `resolveTenantContext(db,
  { userId, tenantId, locationId })`: looks up `core.users.is_platform_staff`
  for a bypass; otherwise requires an active
  `core.tenant_memberships` row (`tenant_id`, `user_id`,
  `status = 'active'`), throwing `PermissionError` if none exists; then
  loads permissions from `core.role_assignments` joined through
  `roles.role_permissions`, respecting location-scoped vs. tenant-wide
  assignments. Docstring (lines 14-17): "We do NOT trust a tenant_id
  supplied by the client without this check." Its own parameter docs (line
  14) state `db` "should be a service-role client (server only)."
- `packages/core/src/tenant-context.ts:80-86` — `can(ctx, permission)` and
  `requirePermission(ctx, permission)`, checking `ctx.permissions` /
  `ctx.isPlatformStaff`.
- `packages/core/src/permissions.ts:5-29` — canonical `PERMISSIONS` map,
  including `PERMISSIONS.core.auditRead` ('core.audit.read'),
  `PERMISSIONS.workforce.shiftRead` ('workforce.shift.read'), etc.;
  `PermissionError` class (lines 37-42).
- `packages/core/src/audit.ts:11-25` — `writeAudit(db, entry)`, inserts into
  `audit.audit_logs` via `db.schema('audit').from('audit_logs')`; docstring:
  "`db` must be a service-role client (inserts bypass the read-only RLS)."
- `packages/core/src/audit.ts:31-38` — `redactPII(obj)`, regex-based
  key redaction (`/(email|phone|address|name|line_user_id|password|secret|token)/i`).
- `packages/db/src/client.ts:15-28` — `createServiceClient()` (service_role
  key, `autoRefreshToken:false`, docstring: "ONLY... trusted server
  contexts... Never import into the web client bundle") and
  `createUserClient(accessToken)` (anon key + `Authorization: Bearer
  <accessToken>` header, same auth options). Both read config via
  `serverEnv()`.
- `packages/db/src/crypto.ts` — `encryptPII`/`decryptPII`/`blindIndex`
  (AES-256-GCM / HMAC-SHA256), not needed for this spike (no PII involved)
  but confirmed present and unused, per Phase 1J-1B.
- `packages/config/src/env.ts:15-36` — `serverSchema` already defines
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL`, `PII_ENCRYPTION_KEY`, `PII_HASH_PEPPER`,
  `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LIFF_ID`,
  `API_PORT` (default 3001), `WEB_ORIGIN` (default `http://localhost:3000`).
  `publicSchema:38-42` defines only `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_LIFF_ID`. Comment (lines
  6-13): `serverEnv()` "MUST only be imported from server contexts
  (apps/api, apps/worker, packages/db, packages/line server code)."
- `apps/web/src/lib/supabase/server.ts:17-38` — `createClient()`, a
  request-scoped Supabase server client using `@supabase/ssr`'s
  `createServerClient`, cookie-backed, anon key only (`requirePublicSupabaseEnv`).
  Comment (lines 7-11): "RLS remains the security boundary; this client
  never uses the service-role key."
- `apps/web/src/lib/auth/session.ts:13-27` — `getCurrentUser()` (calls
  `auth.getUser()`, validated against the Auth server) and
  `getCurrentSession()` (local cookie state; comment recommends
  `getCurrentUser()` for authorization decisions). `getCurrentSession()`
  returns a `Session` object which carries `.access_token` — this is the
  token this spike would forward.
- No file anywhere under `apps/web/src` references `API_URL`,
  `NEXT_PUBLIC_API_URL`, or performs a `fetch` to `apps/api` (confirmed by
  repo-wide search, consistent with Phase 1J-1B's finding) — this spike
  would be the first such call in the repository, not a modification of an
  existing one.
- No `vercel.json`, `Dockerfile`, or other deploy config exists for
  `apps/api` anywhere in the repo (confirmed, consistent with Phase 1J-1B) —
  this plan assumes the spike runs **locally only** (`apps/web` dev server →
  `apps/api` dev server), since deployment is explicitly out of scope.

## Existing reusable helpers

No new helper needs to be invented for this spike; everything is already
written and merely needs to be imported and wired:

| Helper | Source | Role in spike |
| --- | --- | --- |
| `createUserClient(accessToken)` | `@line-os/db` (`client.ts:22-28`) | Verifies the forwarded bearer token via `.auth.getUser()`; also usable as the `db` argument to `resolveTenantContext` for this spike (see below — avoids `service_role`). |
| `resolveTenantContext(db, { userId, tenantId, locationId })` | `@line-os/core` (`tenant-context.ts:18-52`) | Resolves verified tenant membership + permission set. |
| `requirePermission(ctx, permission)` | `@line-os/core` (`tenant-context.ts:84-86`) | Gates the test route on a specific permission. |
| `PERMISSIONS` | `@line-os/core` (`permissions.ts:5-29`) | Source of the test permission key (see below). |
| `PermissionError` | `@line-os/core` (`permissions.ts:37-42`) | Thrown by `resolveTenantContext`/`requirePermission`; the error-mapping layer should catch this type specifically. |
| `serverEnv()` | `@line-os/config` (`env.ts:95-103`) | Reads `API_PORT`, `WEB_ORIGIN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` for `apps/api`. |
| `getCurrentSession()` / `getCurrentUser()` | `apps/web/src/lib/auth/session.ts` | Source of the access token on the `apps/web` side. |

`createServiceClient()` and the PII crypto helpers (`encryptPII`/
`decryptPII`/`blindIndex`) and `writeAudit` exist and are confirmed reusable
for **later** stages, but this spike does not need them (see "service_role
safety decision").

## Recommended auth-boundary design *(recommendation)*

A single Nest guard, e.g. `SupabaseAuthGuard implements CanActivate`,
registered on the new test controller only (not globally, so `/health` and
`/line/webhook` are unaffected):

1. Read the `Authorization` header off the incoming `Request`.
2. Reject (see "reject" behavior below) if missing or not of the form
   `Bearer <token>`.
3. Call `createUserClient(token).auth.getUser()`. Reject if it errors or
   returns no user.
4. Attach the verified `userId` (and the per-request `createUserClient`
   instance, so downstream code reuses the same authenticated client rather
   than re-deriving it) to the request object for the route handler to read.

The route handler itself (not the guard) would then call
`resolveTenantContext` and `requirePermission`, because those two calls need
request-specific input (`tenantId`, optionally `locationId`) that a generic
reusable guard should not hard-code — keeping the guard limited to "who is
this" and the handler responsible for "what may they do here" mirrors the
two-layer split already documented in `docs/architecture/rbac.md` (DB RLS
layer + application `requirePermission` layer) and keeps the guard reusable
for future non-Workforce routes.

## apps/web -> apps/api call strategy *(recommendation)*

- Server-side only: a Next.js Server Action or Route Handler in `apps/web`
  (never a Client Component) calls `getCurrentSession()`
  (`apps/web/src/lib/auth/session.ts:23-27`) to obtain the current
  `access_token`, then issues a plain server-to-server `fetch` to `apps/api`
  with `Authorization: Bearer <access_token>`.
- `apps/api`'s base URL for this call would come from a new **server-only**
  env var in `apps/web` (e.g. `API_URL`, not `NEXT_PUBLIC_API_URL`) — this
  spike plan does not invent the exact name, only the constraint that it
  must not be `NEXT_PUBLIC_*`.
- This reuses `WEB_ORIGIN`/CORS wiring already present in
  `apps/api/src/main.ts:20` (`app.enableCors({ origin: env.WEB_ORIGIN,
  credentials: true })`) without needing `credentials: true`/cookies for
  this call, since the token travels in the `Authorization` header, not a
  cookie.

## Bearer token strategy

- **Should `apps/web` pass the Supabase access token?** Yes — via
  `getCurrentSession().access_token`, forwarded as `Authorization: Bearer
  <token>` on the server-to-server `fetch` described above.
- **How should `apps/api` extract and validate it?** Read the
  `Authorization` header in the guard, split on the literal `Bearer ` prefix
  (reject if the header is absent or doesn't match that shape), then pass
  the raw token string to `createUserClient(token)` and call
  `.auth.getUser()` — this call round-trips to Supabase Auth and both
  validates the token's signature/expiry and confirms the corresponding
  user still exists, rather than only checking local expiry.
- **How should missing/invalid/expired tokens be rejected?** All three
  collapse to the same guard-level outcome: `401 Unauthorized` with a
  generic body (e.g. `{ "message": "Unauthorized" }`), thrown as a Nest
  `UnauthorizedException` from the guard before the route handler runs.
  Missing header, malformed header, and a token that `auth.getUser()`
  rejects (invalid signature, expired, revoked) are not meaningfully
  different to the caller and should not be — returning different codes for
  "expired" vs. "invalid" would leak information about token validity
  structure for no legitimate benefit at this boundary.

## Tenant/location/permission strategy

- **Should `tenant_id`/`location_id` come from route params, body, headers,
  or server-side web context?** Per `resolveTenantContext`'s own docstring
  (`tenant-context.ts:6-8`, "Tenant context is derived from the
  AUTHENTICATED USER'S MEMBERSHIP — never from the request body") and the
  binding rule already established in `.cursor/rules/01-security.mdc`
  ("Never trust `tenant_id` from the request body / query / headers"), the
  `tenant_id` value itself may be *carried* in a route param or query string
  for this spike (there is no session-side "active tenant" concept inside
  `apps/api` the way `apps/web`'s `active-tenant-cookie.ts` provides one),
  but it must be treated purely as a **candidate to verify**, never as
  authorization on its own. `resolveTenantContext` is exactly the function
  that turns "the caller claims tenant X" into "the caller is verifiably an
  active member of tenant X" — the guard/handler must call it before doing
  anything else with that id, and must reject (not silently ignore) if
  membership doesn't hold.
- **How should `requirePermission` be called?** After `resolveTenantContext`
  returns a `TenantContext`, the handler calls `requirePermission(ctx,
  PERMISSIONS.<something>)` (see next section for which key) and lets the
  thrown `PermissionError` propagate to the error-mapping layer, which maps
  it to `403 Forbidden`.
- **`service_role` vs. anon client for `resolveTenantContext`'s `db`
  parameter**: the function's docstring says `db` "should be" a
  service-role client, but nothing in its implementation requires
  bypassing RLS — it only reads `core.users`, `core.tenant_memberships`,
  and `core.role_assignments`/`role_permissions` for rows tied to the
  already-verified caller. This plan recommends passing the **same
  `createUserClient(token)` instance already used for JWT verification**
  for this spike specifically, so the entire spike runs on the caller's own
  RLS-scoped identity with zero `service_role` usage (see "service_role
  safety decision"). This is a deviation from the docstring's literal
  wording and should be flagged for explicit confirmation during
  implementation review — it may turn out `core.tenant_memberships` /
  `core.role_assignments` are only readable via RLS to the row's own
  `user_id`, in which case the anon/RLS client works for this precisely
  because the caller is reading only their own rows, but this has not been
  verified against the actual RLS policies on those two tables as part of
  this plan (would require reading `supabase/migrations/*` policy text,
  which is in scope to *read* but implementing/confirming this behavior is
  an implementation-time verification step, not a claim this plan makes).

## Safe test endpoint proposal *(recommendation)*

- **Route**: e.g. `GET /auth-spike/whoami` (exact path is an implementation
  detail; the important property is that it lives outside `/workforce/*` or
  any real module namespace, so it is obviously a throwaway diagnostic
  route, not a permanent API surface).
- **Test permission**: `PERMISSIONS.core.auditRead` (`'core.audit.read'`)
  is the best available candidate already defined in
  `packages/core/src/permissions.ts:12` — it is a `core`-module permission
  unrelated to Workforce, so using it cannot be mistaken for partial
  Workforce implementation, and it plausibly exists on a test tenant's
  owner/admin role without needing any new seed data. (Confirming which
  local seed roles actually hold it is an implementation-time check, not
  asserted here.)
- **Response shape**: the minimum needed to prove the chain worked, and
  nothing else — e.g. `{ userId, tenantId, locationId: locationId ?? null,
  permissionChecked: 'core.audit.read', isPlatformStaff }`. No employee
  name, no email, no other PII, no full `TenantContext.permissions` array
  (returning the full permission list is unnecessary for the spike's
  purpose and unnecessarily widens the response's information content for
  no test value).

## Error-handling strategy

- **Verified fact**: no `ExceptionFilter`/`@Catch`/`HttpException` subclass
  exists anywhere in the repository today — this must be built new, not
  adapted from an existing pattern.
- **Recommendation**: a single Nest exception filter registered on the test
  controller (or globally, if judged safe at implementation time) that maps:
  - Missing/invalid/expired token (guard-thrown `UnauthorizedException`) →
    `401`, generic body.
  - `PermissionError` (from `resolveTenantContext`/`requirePermission`) →
    `403`, generic body (e.g. `{ "message": "Forbidden" }`), never
    including the internal permission key string or tenant id in the
    response body, even though that information isn't deeply sensitive —
    the discipline of never forwarding internal identifiers in error
    bodies should start here, before any Workforce/PII route exists.
  - Any other thrown error (including raw Supabase/Postgres errors) →
    generic `500`, logged server-side with detail, never serialized to the
    client. This is the specific mechanism that prevents raw DB errors from
    leaking, per the "no raw DB/Supabase error rendering" requirement
    carried over from Phase 1J-1B.

## Env/secrets strategy

- **What env vars are needed locally for `apps/api`?** Already defined in
  `packages/config/src/env.ts:15-36` and requiring no schema change for
  this spike: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (both needed by
  `createUserClient`), `API_PORT`, `WEB_ORIGIN`. This spike does **not**
  need `SUPABASE_SERVICE_ROLE_KEY`, `PII_ENCRYPTION_KEY`, `PII_HASH_PEPPER`,
  `DATABASE_URL`, or the LINE vars to function, though `serverEnv()` will
  still require them to be present (its Zod schema has no optional escape
  hatch for a partial environment) — this is a pre-existing characteristic
  of `serverEnv()`'s all-or-nothing validation, not something this spike
  needs to change.
- On the `apps/web` side, one new server-only var would be needed to point
  at the local `apps/api` instance (e.g. `API_URL=http://localhost:3001`) —
  never `NEXT_PUBLIC_API_URL`.
- **What env vars are forbidden in `apps/web`?** `SUPABASE_SERVICE_ROLE_KEY`,
  `PII_ENCRYPTION_KEY`, `PII_HASH_PEPPER`, `DATABASE_URL`,
  `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` — none of these belong
  in `apps/web`'s environment under any circumstance; this is already
  enforced today by the `serverSchema`/`publicSchema` split
  (`packages/config/src/env.ts:15-42`) and by `apps/web/eslint.config.mjs`'s
  `no-restricted-imports` rule banning `createServiceClient`. This spike
  introduces nothing that would require weakening that boundary.

## service_role safety decision

**`service_role` is not needed for this spike, and should not be used.**
Every step — JWT verification (`createUserClient(token).auth.getUser()`),
tenant/permission resolution (`resolveTenantContext` called with the same
`createUserClient(token)` instance, per the "Tenant/location/permission
strategy" section above), and the test response itself — operates entirely
on the caller's own verified, RLS-scoped identity. This is deliberate: the
spike's purpose is to validate the *identity and authorization* path, which
does not require bypassing RLS. Introducing `service_role` here would both
violate this task's explicit constraint ("Do not use service_role") and
add risk with no corresponding test value — `service_role` becomes
necessary only once a route needs to read/write rows the caller's own RLS
grants don't cover (e.g. a manager reading another employee's PII), which
is out of scope until the Workforce PII/write stage.

## Local test strategy

- Run entirely against a local Supabase instance (`supabase start`) and
  local `apps/api`/`apps/web` dev servers — no Supabase Cloud involvement,
  consistent with this task's constraints and the repo's local-first
  posture (`AGENTS.md`).
- Nest-level unit tests for the guard in isolation (mocking
  `createUserClient`/`auth.getUser()`) so token-validation behavior doesn't
  require a live Supabase instance for every test run.
- One integration-style test (local Supabase required) exercising the full
  chain: sign in a local test user → obtain a real access token → call the
  test endpoint → assert `200` with the expected shape for a
  permission-holding user, `403` for one without the permission, `401` for
  a missing/garbage token.
- A manual smoke test: `apps/web` dev server (a Server Action or a
  temporary debug page) calling the local `apps/api` test endpoint,
  confirming the full browser → `apps/web` → `apps/api` path works, not
  just a direct `curl` against `apps/api`.

## Minimum test matrix

| # | Case | Expected result |
| --- | --- | --- |
| 1 | No `Authorization` header | `401` |
| 2 | Malformed header (not `Bearer <token>`) | `401` |
| 3 | Well-formed but invalid/garbage token | `401` |
| 4 | Expired token | `401` |
| 5 | Valid token, user has no active membership in the requested tenant | `403` (from `resolveTenantContext`'s `PermissionError`) |
| 6 | Valid token, active membership, missing the test permission | `403` (from `requirePermission`) |
| 7 | Valid token, active membership, holds the test permission | `200`, response matches the minimal shape in "Safe test endpoint proposal" |
| 8 | Valid token, `is_platform_staff = true` (bypass path in `resolveTenantContext`) | `200`, regardless of explicit membership row |
| 9 | Response body never contains the raw permission key, tenant id, or any Supabase/Postgres error text on a `401`/`403`/`500` | Verified by asserting exact error body shape in each failing case above |
| 10 | Local smoke test: `apps/web` → `apps/api` round trip succeeds with a real session | `200`, matching case 7 |

## Implementation sequence for later approval *(recommendation, not authorized by this document)*

1. Add the server-only `API_URL` (or equivalent) var to `apps/web`'s env
   schema/local `.env.local` (not committed), pointed at local `apps/api`.
2. Implement `SupabaseAuthGuard` in `apps/api` (JWT extraction + `createUserClient(...).auth.getUser()`).
3. Implement the exception filter (401/403/500 mapping, no raw error
   leakage).
4. Implement the throwaway `GET /auth-spike/whoami`-style controller,
   calling `resolveTenantContext` + `requirePermission` per this plan.
5. Write the guard unit tests and the integration test (test matrix above).
6. Wire the `apps/web` server-side call (Server Action or Route Handler)
   forwarding the bearer token.
7. Manual local smoke test end to end.
8. Report results; do not proceed to Workforce, PII, `service_role`, or
   deployment work without a separate, explicit approval.

## Risks

- `resolveTenantContext`/`requirePermission` have zero existing test
  coverage anywhere in the repository (confirmed in Phase 1J-1B and again
  here) — this spike is also the first real exercise of that code path, so
  it may surface a defect in already-merged `packages/core` code, not just
  validate the new `apps/api` wiring.
- The "pass `createUserClient(token)` instead of `createServiceClient()` to
  `resolveTenantContext`" choice (see "Tenant/location/permission
  strategy") deviates from that function's own docstring wording and has
  not been verified against the actual RLS policies on
  `core.tenant_memberships`/`core.role_assignments` as part of this plan —
  implementation must confirm this actually returns correct data under RLS
  before relying on it, and fall back to documenting why `service_role`
  would be required instead if it doesn't.
- No exception-filter pattern exists yet in this codebase; getting the
  401/403/500 mapping wrong (e.g. letting a raw Postgres error string
  through on an unexpected exception type) would reintroduce the exact
  "raw DB error leakage" risk this plan is trying to close.
- Even a throwaway test route adds a small amount of permanent surface
  area if not deliberately removed or clearly marked before any later
  production deployment.

## Do-not-do-yet list

- Do not implement any of the above without separate, explicit human
  approval — this document is a plan, not a go-ahead.
- Do not implement any Workforce controller, route, or business logic.
- Do not implement any PII display/decryption logic.
- Do not use `createServiceClient()`/`service_role` anywhere in this spike.
- Do not deploy `apps/api` anywhere as part of this spike.
- Do not run any Supabase Cloud command, `db push`/`db pull`/migration
  repair, or touch `supabase/migrations/**`.
- Do not add any new package/dependency.
- Do not modify `apps/api`, `apps/web`, or `packages/**` source as part of
  producing this document (none was modified).
- Do not merge this plan as authorization to start stage sequence items
  above without a separate approval step.

## Final recommendation

Accept this document as the plan for the Phase 1J-1C spike. The spike as
scoped here is low-risk relative to the Workforce PII/write boundary it
de-risks: it touches no `service_role`, no PII, no migrations, and no
deployment, while still exercising the real, currently-untested
`resolveTenantContext`/`requirePermission` code path against a real verified
identity. Proceed only to a separate, explicitly-approved implementation
task for the sequence in "Implementation sequence for later approval" —
this document does not authorize starting it.

## Next practical step

Get explicit human approval to begin implementation step 1 of the sequence
above (in a new branch/task, not this one), and — in the same approval —
confirm the "pass `createUserClient(token)` to `resolveTenantContext`"
design choice is acceptable, or decide it should be verified against the
actual `core.tenant_memberships`/`core.role_assignments` RLS policies
first as a preceding read-only check.
