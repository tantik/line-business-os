# Phase 1J-1B — apps/api Boundary and Deployment Readiness Review

Status: **Review only. Not implementation approval.**
Branch: `plan/phase-1j-1b-apps-api-boundary-review`
Scope of this document: repository inspection and written analysis only. No
files were modified, no migrations or SQL were written, no Supabase command
was run, no `service_role` client was constructed or used, no package was
added, and no `apps/api`/`apps/web` code was written, to produce this
document. This satisfies stage 1 of
[`phase-1j-1-workforce-mvp-architecture-plan.md`](./phase-1j-1-workforce-mvp-architecture-plan.md)
§14/§18 ("apps/api readiness review ... docs/config only").

Read with: [`phase-1j-1-workforce-mvp-architecture-plan.md`](./phase-1j-1-workforce-mvp-architecture-plan.md),
[`architecture/overview.md`](./architecture/overview.md),
[`architecture/multi-tenancy.md`](./architecture/multi-tenancy.md),
[`architecture/rbac.md`](./architecture/rbac.md),
[`security/security-requirements.md`](./security/security-requirements.md),
[`operations/deployment-checklist.md`](./operations/deployment-checklist.md),
[`operations/env-inventory.md`](./operations/env-inventory.md),
[`adr/0005-data-access-model.md`](./adr/0005-data-access-model.md),
[`adr/0008-api-facade-schema.md`](./adr/0008-api-facade-schema.md).

---

## 1. Executive summary

`apps/api` is a minimal NestJS app: a health check and a LINE-webhook
controller, nothing else. It has never been deployed anywhere — there is no
`vercel.json`, `Dockerfile`, `Procfile`, `railway.json`, `render.yaml`, or
`fly.toml` in the repository, and `docs/operations/deployment-checklist.md`
is written entirely around Vercel(`apps/web`) + Supabase and never mentions
`apps/api`'s own deploy target. That confirms the concern flagged in the
Workforce plan (§14): **`apps/api` cannot be a Workforce PII/write boundary
today because nothing calls it, nothing authenticates a caller, and there is
nowhere for it to run in preview/production.**

The encouraging finding: the hard, security-sensitive *logic* this boundary
needs already exists, fully written, framework-agnostic, and already listed
as an `apps/api` dependency — it is simply unused. `packages/core` has
`resolveTenantContext` (membership-derived, never trusts a client `tenant_id`)
and `requirePermission`; `packages/db` has `createServiceClient()` /
`createUserClient(accessToken)` and `writeAudit`/`redactPII`; `packages/db`
also has the PII `encryptPII`/`decryptPII`/`blindIndex` primitives already
used for Workforce's `name_encrypted`/`name_hash` columns. None of this is
wired into `apps/api/src/` yet, and none of it is used anywhere in the
codebase today (not even by `apps/web`, which enforces authorization purely
through RLS + Postgres error-code mapping, with no app-layer permission
helper of its own). So the missing piece is not "design and build a
tenant/permission/audit system" — it is: (a) verify an incoming JWT and turn
it into a user id, (b) give `apps/api` somewhere to actually run in
preview/production, (c) decide how `apps/web` forwards a caller's identity to
it, and (d) write the Workforce-specific controllers and tests. That is a
materially smaller and lower-risk piece of work than a from-scratch backend
boundary, but it is still real work requiring a human decision on hosting and
a separate implementation approval — this document does not grant either.

## 2. Current repository findings — apps/api (Q1)

- Framework/runtime: NestJS 10 on Express (`@nestjs/platform-express`),
  TypeScript, Node. `apps/api/src/main.ts:1-26` bootstraps via
  `NestFactory.create`, installs a raw-body-capturing JSON middleware (needed
  for LINE signature verification), enables CORS with
  `origin: env.WEB_ORIGIN, credentials: true`, and listens on `env.API_PORT`.
- Endpoints/controllers: exactly two.
  - `GET /health` (`health.controller.ts:1-9`) — returns
    `{ status: 'ok', service: 'line-business-os-api' }`, no auth, no tenant
    data.
  - `POST /line/webhook` (`line/line-webhook.controller.ts:1-43`) — verifies
    `x-line-signature` against the raw body via `verifyLineSignature`,
    rejects with `403` on mismatch, parses events, and currently just counts
    them (`// TODO: enqueue events for processing (apps/worker)`). This is
    the *only* existing "auth" pattern in `apps/api`, and it is a
    signature-based webhook check, **not** representative of an
    authenticated-user request path — it has no bearing on how a logged-in
    `apps/web` user's request would be authenticated.
- `app.module.ts:1-9` registers only these two controllers. No guards, no
  interceptors, no auth middleware, no tenant-context wiring exist anywhere
  in `apps/api/src/`.
- Local start: `apps/api/package.json` script `dev` → `nest start --watch`
  (via Turbo/pnpm workspace filter), `build` → `nest build`, `start` → `node
  dist/main.js`.
- Deployed anywhere: **no.** No `vercel.json`, `Dockerfile`, `Procfile`,
  `railway.json`, `render.yaml`, or `fly.toml` exists anywhere in the repo.
  `docs/operations/deployment-checklist.md` and `docs/operations/env-inventory.md`
  are both scoped to Vercel (`apps/web`) + Supabase and do not document an
  `apps/api` deploy target at all. `env-inventory.md` lists exactly two
  `apps/api`-relevant vars (`API_PORT`, `WEB_ORIGIN`), both flagged `When =
  future` — i.e. the inventory itself already anticipated this as
  not-yet-provisioned.
- Tests: `package.json` declares `"test": "node --test"`, but **no
  `*.test.ts`/`*.spec.ts` files exist anywhere under `apps/api/src`**
  (confirmed by glob). The test script currently runs against nothing. CI
  (`.github/workflows/ci.yml`) runs the Turbo pipeline
  (`typecheck && test && build && lint`) on PRs/pushes to `dev`/`feature/**`,
  so `apps/api` is typechecked/linted/built on every PR, but has zero actual
  test coverage today.
- Health checks: yes, `GET /health` (see above) — suitable as a bare
  liveness check, not a readiness check (it doesn't touch Supabase or any
  dependency).
- Supabase integration: **not yet.** No Supabase client is constructed
  anywhere in `apps/api/src/`. However, `@line-os/db` and `@line-os/core`
  (which contain the client factories and tenant/permission/audit helpers,
  see §7) are already listed in `apps/api/package.json` dependencies —
  imported by nothing yet.
- Scope today: LINE webhook signature verification only. No other business
  logic, no Workforce controller, no generic API surface.

## 3. Auth/session boundary (Q2)

- `apps/web` authenticates via `@supabase/ssr`, cookie-based, anon-key only.
  `apps/web/src/lib/supabase/client.ts` (browser) and `server.ts` (request-scoped
  server client) both use only `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `apps/web/src/middleware.ts` calls
  `updateSession()` to refresh cookies on every request; the actual
  "must be signed in" gate is `requireUser()`
  (`apps/web/src/lib/auth/require-user.ts`), invoked from the `(protected)`
  layout, not from middleware.
- **No session-forwarding or fetch-to-external-API pattern exists in
  `apps/web` today.** No code anywhere under `apps/web/src` calls out to
  `apps/api`; no `API_URL`/`NEXT_PUBLIC_API_URL` env var is referenced;
  `next.config.mjs` has no `rewrites()`/proxy config; there is no
  `vercel.json` anywhere in the repo. This is being built from nothing, not
  adjusted from an existing (possibly-wrong) pattern.
- Should `apps/web` pass the Supabase access token? **Yes, as a
  server-to-server bearer token, not a browser-to-`apps/api` cookie or
  header.** `apps/web`'s Server Actions/Route Handlers already hold a valid,
  request-scoped Supabase server client (`apps/web/src/lib/supabase/server.ts`)
  that can call `auth.getSession()` / `auth.getUser()` to obtain the current
  access token server-side. The safest MVP shape is: browser talks only to
  `apps/web` (as it does today, cookie session); `apps/web`'s server-side
  code (Server Action or Route Handler) extracts the caller's access token
  and forwards it as `Authorization: Bearer <token>` on a server-to-server
  `fetch` to `apps/api`. The browser never talks to `apps/api` directly and
  never needs to know its URL.
- Should `apps/api` verify the JWT via Supabase JWKS/auth API? **Yes, and the
  primitive to do it already exists**: `packages/db/src/client.ts`'s
  `createUserClient(accessToken)` builds an anon-key client with
  `Authorization: Bearer <accessToken>` attached; calling
  `.auth.getUser()` on that client validates the token against Supabase Auth
  and returns the verified user id (or an error if invalid/expired). This is
  the standard supabase-js server-side verification pattern and requires no
  new dependency — `@line-os/db` is already an `apps/api` package.json
  dependency.
- Are browser cookies usable across `apps/web` and `apps/api` in
  local/preview/prod? **Not safely, and not recommended.** Supabase's
  `@supabase/ssr` cookies are scoped to `apps/web`'s own domain/subdomain.
  Once `apps/api` is deployed to a different host or a different Vercel
  project (see §9), sharing those cookies cross-origin would require
  `SameSite=None; Secure` plus a shared registrable domain — extra
  complexity and a wider CSRF/cookie-theft surface for no benefit, since
  `apps/web` already has the token available server-side. **Bearer-token
  forwarding, not cookie sharing, is the safest MVP option** and is
  environment-independent (works the same in local/preview/prod regardless
  of where `apps/api` ends up hosted).

## 4. Supabase access model (Q3)

Three options, evaluated against this codebase's existing primitives:

- **anon/RLS client inside `apps/api`** (`createUserClient(accessToken)`):
  safe for reads/writes that RLS already correctly scopes to the caller —
  e.g. proxying "my published shifts." Unsafe/insufficient for: PII display
  (RLS does not decrypt `bytea` columns; decryption is application code, not
  a database privilege) and for any write whose business rule is
  intentionally broader than a single row's own RLS predicate (e.g. a
  manager approving another employee's request touches a row the approver
  doesn't "own" in the RLS sense — this is already handled by the existing
  `workforce.request.manage` policy being permission-gated rather than
  ownership-gated, so the anon/RLS client is actually sufficient for that
  specific case *if* the caller's JWT carries the right role — but is
  insufficient the moment logic needs to touch rows beyond what RLS grants
  the caller, e.g. cross-referencing another table without matching grants).
- **`service_role` client inside `apps/api`** (`createServiceClient()`)
  **after explicit permission checks**: necessary for PII decryption/display
  (§6) and for any write where relying on RLS alone would either be
  insufficient or would require loosening RLS in ways that create a broader
  hole than the app-layer check would. Unsafe as a first line of defense —
  `service_role` bypasses RLS entirely, so if it is used before tenant
  membership and permission are verified, there is no isolation left at all.
- **Hybrid (recommended)**: `apps/api` verifies the JWT (§3) →
  `resolveTenantContext(serviceClient, { userId, tenantId, locationId })` to
  derive real membership and permissions (this function's own docstring
  already says "we do NOT trust a tenant_id supplied by the client without
  this check" — `packages/core/src/tenant-context.ts:14-17`) →
  `requirePermission(ctx, key)` → **then** perform the specific,
  already-authorized operation. Whether that operation itself uses
  `createUserClient` (RLS-enforced, preferred when sufficient) or
  `createServiceClient` (needed for PII decrypt or cross-row manager
  actions) is decided per-route, but either way it runs only after the
  tenant/permission gate has already passed. This matches ADR 0005 ("two
  clients, one DB... sensitive mutations go through the backend via
  service-role after `resolveTenantContext`") and the Workforce plan §12
  exactly — no new access model needs to be invented.

## 5. service_role safety (Q4)

- Where it can be stored safely: as `SUPABASE_SERVICE_ROLE_KEY`, a
  server-only env var read exclusively through `serverEnv()`
  (`packages/config/src/env.ts`), which is documented (env.ts:6-13) as
  importable only from `apps/api`, `apps/worker`, `packages/db`, and
  `packages/line` server code. `createServiceClient()`
  (`packages/db/src/client.ts:15-20`) is the single sanctioned constructor.
- Ensuring it never reaches `apps/web`/the browser: this is **already
  enforced today**, not merely documented — `apps/web/eslint.config.mjs`
  has a `no-restricted-imports` rule banning `createServiceClient`, and
  multiple `apps/web` unit tests (`membership.test.ts`, `selection.test.ts`,
  `health.test.ts`) assert the string `service_role`/`createServiceClient`
  never appears in `apps/web` source. A repo-wide grep during this review
  found zero occurrences of `service_role` usage in `apps/web`. `apps/api`
  has no equivalent lint guard yet (it's expected to use `service_role`, so
  a blanket ban doesn't apply) — but it should get a narrower rule when
  implemented: `createServiceClient()` should be called from a small number
  of trusted service modules, not constructed ad hoc per controller, so a
  future code reviewer can audit all its call sites at a glance.
- Checks required before any `service_role` DB read/write (this is exactly
  the CTO-corrected sequence already specified in the Workforce plan §2.1,
  restated here as the general `apps/api` rule, not Workforce-specific):
  1. Verified JWT → real `userId` (§3).
  2. `resolveTenantContext` → real, active `tenant_id`/`location_id`/
     permission set, never a client-supplied `tenant_id` (§4).
  3. `requirePermission` for the exact permission the operation needs.
  4. Only then, a `service_role` query scoped explicitly to the
     already-authorized `tenant_id`/`location_id`/entity ids — since
     `service_role` bypasses RLS, the `WHERE` clause must do by hand the
     scoping RLS would otherwise do. A `service_role` query with no
     `tenant_id`/`location_id` predicate is a cross-tenant leak regardless
     of how the request got there.
- Logs/audit: every mutating `service_role` action must call `writeAudit`
  (`packages/core/src/audit.ts:11-25`, already written, already redacts
  nothing automatically — callers must pre-redact PII via `redactPII` before
  passing `before`/`after`, per its own docstring "Do NOT pass raw PII in
  before/after — redact at the call site"). `audit.audit_logs` is
  append-only per `security-requirements.md` §6 (delete/update blocked by
  trigger). PII-bearing *reads* (e.g. name-display) are not currently
  required to be audited by existing docs, but a lightweight access log
  (actor id, tenant id, entity id, no plaintext PII) is a reasonable
  addition to decide at implementation time, not this review.
- What must be forbidden: a generic decrypt-by-id endpoint (§6); constructing
  `service_role` clients outside the sanctioned factory/service layer;
  `service_role` queries that trust a client-supplied `tenant_id`/
  `location_id` without re-deriving them from `resolveTenantContext`;
  `service_role` key material in `apps/web`, `NEXT_PUBLIC_*`, logs, or
  response bodies; skipping `writeAudit` for any mutation.

## 6. Workforce PII boundary (Q5)

The Workforce plan (§13) already specifies this precisely; this review
confirms the primitives it depends on actually exist and are unused:

- `packages/db/src/crypto.ts` already implements `encryptPII`/`decryptPII`
  (AES-256-GCM, `[12-byte IV][16-byte tag][ciphertext]` layout for `bytea`
  columns, hard-fails unless the key decodes to exactly 32 bytes) and
  `blindIndex` (deterministic HMAC-SHA256 for equality search without
  decrypting). This is the same pattern already used for
  `employees.name_encrypted`/`name_hash`
  (`supabase/migrations/0009_workforce.sql:20-33`) — reuse as-is, per plan
  §13.
- Minimal safe flow for a Workforce name-display route:
  1. Verify JWT → `userId` (§3).
  2. `resolveTenantContext` → verified `tenant_id`, `location_id`,
     permissions (§4/§5) — never a client-supplied `tenant_id`.
  3. `requirePermission(ctx, PERMISSIONS.workforce.shiftRead)` (or a
     manager-only key for roster-wide views).
  4. Run the actual employee/shift query **scoped to that already-verified
     tenant_id/location_id** (and, for self-service employee views, further
     scoped to `employees.user_id = userId`), returning a row set that has
     already passed authorization — *then* decrypt `name_encrypted` only for
     those rows.
  5. Return a minimal DTO, never the raw row.
- Minimal DTO shape (illustrative, not a schema decision — that's
  implementation stage, per plan §18 stage 3): something like
  `{ employeeId, displayName, position, isActive }` — only fields the UI in
  scope (plan §6/§15) actually needs.
- Fields that must never be returned: `name_encrypted` (raw ciphertext
  bytes), `name_hash` (blind index — a search input, not a display output),
  any row belonging to a different `tenant_id`/`location_id` than already
  authorized, `PII_ENCRYPTION_KEY`/`PII_HASH_PEPPER` (obviously), and any
  other employee's data not part of the authorized result set.
- Avoiding a generic decrypt endpoint: the discipline is ordering — decrypt
  must be the **last** step, applied to a result set a tenant/location/
  permission-scoped query already produced (step 4 above), never the
  **first** step applied to a bare `employee_id` taken directly from request
  input. A route that accepts `{ employeeId }` and decrypts+returns it
  without first proving that id is inside an authorized query result is
  exactly the anti-pattern the plan's CTO correction (§2.1) forbids.
- Testing for no PII leakage (concrete cases for implementation stage, not
  performed here): (a) permitted same-tenant/location read → decrypted name
  returned; (b) cross-tenant `employeeId` supplied → denied/empty, name
  never present in the response body; (c) caller without the required
  permission → denied before any decrypt call happens; (d) response-shape
  assertion (e.g. a snapshot/contract test) that `name_encrypted`/`name_hash`
  never appear in any Workforce API response; (e) revoked/inactive
  membership → denied even if `employees.user_id` still links to that user
  (plan §2.4/§8.2).

## 7. Workforce write boundary (Q6)

Per the Workforce plan's binding CTO correction (§2.2/§12): *any* write and
*any* PII-bearing read go through `apps/api`. Concretely:

| Action | Boundary | Needs audit log |
| --- | --- | --- |
| Create staff | `apps/api` (writes `name_encrypted`/`name_hash`) | Yes |
| Update staff | `apps/api` (may re-encrypt PII) | Yes |
| Submit shift/leave request | `apps/api` (self-service permission logic, plan §10/§11) | Yes |
| Approve/reject request | `apps/api` (manager touches another user's row) | Yes |
| Publish schedule | `apps/api` (bulk state change, business rule beyond single-row RLS) | Yes |
| Edit schedule/shift | `apps/api` (draft-only invariants, plan §11) | Yes |

Every row above needs an audit log per `security-requirements.md` §6
("every mutating action ... via `writeAudit`") — there is no MVP write in
this list that is exempt.

What could plausibly stay in `apps/web` for MVP, if anything: only
**non-PII, self-scoped reads** that don't need decryption or cross-row
logic — e.g. "my published shifts," "status of my own requests" — are a
candidate for the existing `api.*` security-invoker view pattern
(`supabase/migrations/0015_api_facade.sql`,
`0017_api_tenant_dashboard_facade.sql`; ADR 0008), called directly from
`apps/web` exactly like `api.my_tenant_memberships` is today
(`apps/web/src/lib/tenant/membership.ts`). The Workforce plan itself already
flags this as "a candidate for a later stage, not MVP stage 1" (§12) — this
review does not change that; it is out of scope for the current stage
regardless of technical feasibility, since it would require its own new
migration.

## 8. Tenant/location/permission checks (Q7)

This is the section with the best news in this review: the centralization
this question asks for **already exists** and is unused.

- `packages/core/src/tenant-context.ts`'s `resolveTenantContext(db, {
  userId, tenantId, locationId })` (lines 18-52) already: looks up
  `core.users.is_platform_staff` for a platform-staff bypass; otherwise
  requires an **active** `core.tenant_memberships` row matching
  `tenant_id`/`user_id`/`status = 'active'`, throwing `PermissionError` if
  none exists; then loads the caller's effective permission set from
  `core.role_assignments` joined through `roles.role_permissions`, applying
  tenant-wide vs. location-scoped assignment rules. It explicitly documents
  "we do NOT trust a tenant_id supplied by the client without this check"
  (line 16) — this already answers "how to avoid trusting client-supplied
  tenant_id blindly."
- `packages/core/src/permissions.ts`'s `can`/`requirePermission` (lines
  80-86 of `tenant-context.ts`) check the resolved `TenantContext.permissions`
  array (or `isPlatformStaff`) against a canonical `PERMISSIONS` map that
  mirrors `supabase/migrations/0008_rbac_seed.sql` — including
  `PERMISSIONS.workforce.shiftRead/shiftWrite/attendanceManage/requestManage`
  already defined and ready to reference.
- Location scope is enforced the same way: `resolveTenantContext` accepts
  and threads `locationId`, and `loadPermissions` only counts a
  location-scoped role assignment when it matches the active location
  (tenant-wide assignments, `location_id IS NULL`, always apply) —
  `tenant-context.ts:70-73`.
- **Gap**: none of this is imported anywhere in `apps/api/src/` today, and
  it has never been exercised by any test (no test file references
  `resolveTenantContext`/`requirePermission` in the repo). It is
  well-written and consistent with every architecture doc reviewed, but it
  is **unverified in practice** — implementation stage should add tests
  before relying on it for PII-bearing routes (revoked membership,
  location-mismatched assignment, platform-staff bypass, missing permission
  — each as an explicit case).
- Avoiding cross-tenant leakage: use `resolveTenantContext`'s output
  everywhere downstream, never a raw request field; every `service_role`
  query must still carry an explicit `tenant_id`/`location_id` predicate
  even though `service_role` bypasses RLS (§5) — the app code must do by
  hand what RLS would otherwise guarantee.

## 9. apps/web → apps/api communication (Q8)

- Local dev: `apps/web` (localhost:3000) → `apps/api`
  (`localhost:${API_PORT}`, default port already configured in
  `packages/config/src/env.ts`) via a server-side `fetch` from a Server
  Action/Route Handler, with `WEB_ORIGIN` already wired into `apps/api`'s
  CORS config (`main.ts:20`). This direction requires no new config today —
  `API_PORT`/`WEB_ORIGIN` already exist in `serverEnv()`.
- Preview: **blocked today.** There is nowhere for `apps/api` to run that a
  Vercel Preview deployment of `apps/web` could reach — this is the concrete
  form of the "no confirmed deployed environment" gap the Workforce plan
  flagged (§14). A hosting decision (§10) must be made and the resulting URL
  provisioned as a server-only env var for the matching `apps/web` Preview
  environment before this direction works.
- Production: same shape as preview, once `apps/api` has a stable
  production URL, its own production env vars (§10), and CORS locked to the
  production `WEB_ORIGIN`.
- CORS/cookies/token approach: **bearer-token forwarding, not cross-origin
  cookie sharing** (§3) — sidesteps `SameSite`/domain complexity entirely
  and works identically across local/preview/prod regardless of where
  `apps/api` ends up hosted.
- Error handling / no raw DB error rendering: `apps/api` should translate
  Postgres/Supabase errors (which can leak schema/column/constraint names)
  into a small set of generic client-safe error codes before any response
  leaves it — e.g. a Nest exception filter that maps `PermissionError` →
  `403`, "not found within authorized scope" → `404`, everything else →
  generic `500` with no internal detail. Nothing in `apps/api` does this
  today (no exception filter exists), and this is a real gap relative to
  the "no raw DB error rendering" requirement — it needs to be built as part
  of implementation, not assumed to already work.
- Secrets in `NEXT_PUBLIC_*`: no change needed — `apps/web`'s public schema
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_LIFF_ID`) already contains nothing sensitive, and this
  boundary design (server-to-server forwarding, browser never talks to
  `apps/api` directly) means `apps/web` does not need a
  `NEXT_PUBLIC_API_URL` at all for MVP — only a server-only `API_URL` (or
  equivalent) is needed, which is not exposed to the browser bundle.

## 10. Deployment readiness (Q9)

- Is `apps/api` currently deployable? **Buildable, yes** (`nest build`
  succeeds as part of the Turbo `build` pipeline, which CI already runs on
  every PR). **Deployed, no** — confirmed no deployment config of any kind
  exists in the repository, and no operations doc names a target for it.
  This is the central finding of this review and the reason the Workforce
  plan gated Workforce implementation behind this document.
- Where should it be deployed for MVP? **This review does not decide that —
  it is a human/architecture decision**, but the two realistic shapes worth
  weighing are: (a) a separate Vercel project adapted to run a persistent
  Node/Nest server (Vercel's Node function model has cold-start and
  execution-time characteristics that fit a stateless health-check-style API
  reasonably but are a worse fit for a long-running LINE webhook consumer
  than a normal Node process), or (b) a small always-on Node host (Railway,
  Render, Fly.io, or similar) that runs `apps/api` as a normal long-lived
  process. Recommendation for this review: **do not fold `apps/api` into
  the existing `apps/web` Vercel project** — it is a distinct Node server
  (raw-body middleware, its own CORS, its own env, intended to hold
  `service_role`), and mixing it into the Next.js app's deploy target blurs
  exactly the boundary the architecture docs establish. Beyond that
  recommendation, the actual platform choice is out of scope here.
- Env vars required (all already defined in `packages/config`'s
  `serverSchema`, none need inventing): `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `PII_ENCRYPTION_KEY`,
  `PII_HASH_PEPPER`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`,
  `API_PORT`, `WEB_ORIGIN`, plus (once decided) a database connection var if
  any direct-pg access is added. All must be provisioned per-environment
  (local/preview/prod) only once a hosting target exists.
- What must never be added to `apps/web`'s env: `SUPABASE_SERVICE_ROLE_KEY`,
  `PII_ENCRYPTION_KEY`, `PII_HASH_PEPPER`, `LINE_CHANNEL_SECRET`,
  `LINE_CHANNEL_ACCESS_TOKEN`, `DATABASE_URL` — none of these belong in
  `apps/web`'s Vercel env under any circumstance; this is already enforced
  by the existing ESLint guard and the `serverEnv`/`publicEnv` schema split
  (§5), and should stay that way.
- What should be deferred: choosing and provisioning the actual hosting
  platform, wiring CI/CD for `apps/api`'s own deploy, provisioning
  production env vars, and all Workforce-specific controller work — all of
  it waits on a human decision this document does not make.

## 11. Testing strategy (Q10)

- Unit tests: none exist for `apps/api` today (§2) despite a configured
  `test` script. Before any Workforce route is coded, `apps/api` needs at
  least: a test harness (Nest's testing module, or the existing `node
  --test` runner used elsewhere in the monorepo — check `packages/core`/
  `packages/db` for the established pattern before choosing) and coverage
  for the JWT-verification step in isolation (valid token → user id;
  invalid/expired token → rejected).
- Route/service tests: `resolveTenantContext`/`requirePermission` currently
  have zero test coverage anywhere in the repo (§8) — this should be closed
  before they're relied on for a PII boundary, independent of Workforce.
- Auth/permission tests: active membership → allowed; inactive/revoked
  membership → denied (plan §2.4's specific concern); missing permission →
  denied; platform-staff bypass → allowed regardless of membership.
- Tenant isolation tests: cross-tenant `tenantId`/`employeeId` combinations
  → denied, and specifically **never present in the response body** (not
  just a non-200 status — verify no data leaks in an error payload either).
- PII redaction tests: response DTOs never contain `name_encrypted`/
  `name_hash` (§6); audit log `before`/`after` payloads are redacted via
  `redactPII` before being written (its regex-based key matching — `/
  (email|phone|address|name|line_user_id|password|secret|token)/i` — should
  itself be tested against the actual Workforce field names in use).
- Local smoke tests: `apps/api` health check reachable from a local
  `apps/web` dev server; CORS succeeds for `WEB_ORIGIN`; a stubbed
  authenticated round trip once the JWT guard exists.
- Vercel Preview smoke tests: blocked until §10's hosting decision is made
  and provisioned — cannot be performed today.
- No Cloud writes without approval: all of the above should run against
  local Supabase (`supabase start`), consistent with the repo's
  local-first Phase 1 posture (AGENTS.md) — none of it requires or should
  use Supabase Cloud.

## 12. Recommended staged plan (Q11)

Restating and slightly refining the Workforce plan's own §18 sequencing,
now informed by this review's findings:

- **Stage 1J-1B-A (this document)**: docs/review only. Confirms `apps/api`'s
  current state, identifies that its core dependencies
  (`resolveTenantContext`, `requirePermission`, `createServiceClient`,
  `createUserClient`, `writeAudit`, `redactPII`, PII crypto) already exist
  and are unused, and identifies the deployment gap as the primary blocker.
  **Complete as of this document.**
- **Stage 1J-1B-B (optional, small)**: `apps/api` local health/readiness
  docs — e.g. a short `apps/api`-specific section in
  `docs/operations/deployment-checklist.md` or a new doc describing local
  start, health-check verification, and the env vars it needs, so the
  hosting decision in the next stage has a documented baseline to deploy
  against. Docs/config only, no code.
- **Stage 1J-1B-C**: auth boundary spike, no Workforce. Wire a minimal JWT
  guard in `apps/api` (using `createUserClient` + `.auth.getUser()`, §3),
  one throwaway authenticated `GET` route that calls `resolveTenantContext`
  and returns the resolved `TenantContext` (no business data), and the
  `apps/web` → `apps/api` server-to-server fetch pattern (§9). This proves
  the auth boundary end-to-end with no PII and no Workforce logic in scope,
  and is where a real hosting target (§10) would first get used for a
  preview smoke test. Requires human approval to start (it's code, not
  docs), but is deliberately scoped away from Workforce and PII.
- **Stage 1J-1D**: Workforce service design — a design pass (not code) that
  takes the Workforce plan's §12/§13 proposals and the auth-boundary spike's
  concrete shape and produces the actual controller/route list, DTO shapes,
  and error-mapping design for the Workforce MVP scope (plan §6). Docs only.
- **Stage 1J-2**: DB/RLS local-only implementation plan — the Workforce
  plan's stage 2 (§10/§11: `workforce.request.self` permission, split
  shifts-read policy on `published`, self-service OR-branches), with pgTAP
  coverage. Requires separate explicit human approval per CLAUDE.md/plan §2.6.
- **Stage 1J-3**: API/service implementation — the actual Workforce
  controllers in `apps/api` (create/update staff, submit/approve/reject
  requests, publish schedule, name-display route), built on stages 1J-1B-C
  and 1J-2.
- **Stage 1J-4**: UI plan/implementation — `apps/web` Manager/Employee
  Workforce views wired to stage 3's routes (plan §15).

## 13. Risks (Q12)

- **Security**: an unverified permission-resolution path
  (`resolveTenantContext`/`requirePermission`) is about to become the sole
  gate for a PII display route; it has never been exercised by a test.
  Mitigate by testing it in stage 1J-1B-C before any Workforce PII route
  depends on it.
- **Tenant isolation**: `service_role` queries in `apps/api` must hand-roll
  the `tenant_id`/`location_id` scoping that RLS normally provides; a missed
  predicate on any single query is a cross-tenant leak that RLS won't catch
  (`service_role` bypasses it by design).
- **PII**: the biggest process risk is scope creep from a scoped
  name-display route into a general-purpose "decrypt by id" utility "for
  convenience" — explicitly called out as forbidden in the Workforce plan
  (§2.1) and reaffirmed here (§6).
- **Deployment/env**: `apps/api` has zero deployment history; the first real
  deploy will surface unknowns (cold start vs. long-lived process tradeoffs,
  CORS/env provisioning mistakes, LINE webhook reliability under whatever
  platform is chosen) that are hard to fully predict from a docs review
  alone.
- **Japanese market/product**: none specific to this boundary-review scope
  beyond what the Workforce plan already covers (§16 labels); this review
  did not touch product/UX surface.
- **Cost/complexity**: hosting `apps/api` separately from `apps/web`
  introduces a second deploy target, a second set of environment
  provisioning steps, and a second thing that can be down — worth weighing
  against the security benefit of keeping `service_role` fully out of the
  Next.js deploy target, but that tradeoff is a human call, not one this
  review resolves.

## 14. Do-not-do-yet list (Q13 support)

- Do not deploy `apps/api` anywhere, choose a hosting platform, or
  provision any environment for it based on this document alone — §10's
  hosting choice needs a separate human decision.
- Do not write an `apps/api` auth guard, JWT verification code, or any
  Workforce controller as part of or after this document — that is stage
  1J-1B-C/1J-3 (§12), not this review.
- Do not add any `NEXT_PUBLIC_API_URL` or client-facing `apps/api` reference
  to `apps/web` — the recommended pattern (§9) never has the browser talk to
  `apps/api` directly.
- Do not run any Supabase Cloud command, use `service_role`, read `.env`
  files, or touch customer data, tenants, or seed data — none of that
  happened to produce this document and none of it is authorized by it.
- Do not treat the existence of `resolveTenantContext`/`requirePermission`/
  `createServiceClient` as "already proven safe" — they are well-written and
  consistent with every architecture doc reviewed, but **untested and
  unused in production today** (§8/§11); they need test coverage before
  being trusted for a PII boundary.

## 15. Final recommendation

**Minimal MVP path**: accept this document, then run stage 1J-1B-C (§12) —
a small, explicitly-scoped auth-boundary spike (JWT verification +
`resolveTenantContext` round trip, no Workforce, no PII) against whatever
hosting target is chosen for `apps/api`, with real test coverage for the
permission-resolution path before it's ever asked to gate a PII route. This
is the fastest path to de-risking the actual unknown (does the auth
forwarding + hosting + permission-resolution chain work end to end) without
building any Workforce-specific code yet.

**Professional SaaS path** (same destination, more upfront rigor): before
stage 1J-1B-C, also complete stage 1J-1B-B (a short deployment/readiness doc
for `apps/api` itself, mirroring what already exists for `apps/web` in
`docs/operations/deployment-checklist.md`) and get an explicit human decision
on hosting platform (§10) recorded in that doc, rather than deciding it
implicitly while building the spike. This costs a small amount of extra time
and produces a durable reference doc, which fits this repo's established
pattern of docs-first stages before code stages.

**What to do next**: get a human decision on (a) which of stage 1J-1B-B or
going straight to 1J-1B-C is preferred, and (b) `apps/api`'s hosting
platform (§10) — both are prerequisites this review surfaces but does not
resolve.

**What not to do yet**: anything in §14. In particular, do not let the
"most of the plumbing already exists" finding in this review (§1, §8) be
read as license to skip straight to Workforce controllers — the plumbing is
unused and untested, and the deployment target still does not exist.
