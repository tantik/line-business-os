# Phase 1J-1D — apps/api Auth-Boundary Blocker: Decision Review

## 1. Status / scope

Status: **Decision review only. Not implementation approval.**
Branch: `plan/phase-1j-1d-apps-api-auth-boundary-blocker-decision`

This document is the only file produced by this task
(`docs/phase-1j-1d-apps-api-auth-boundary-blocker-decision.md`). No
`apps/api`, `apps/web`, or `packages/**` code was modified; no Supabase
migration was modified; no Supabase Cloud command was run; no
`service_role` client was constructed; no `.env` value was read or printed;
no dependency was added; nothing was deployed; no Workforce code was
written, to produce this document.

This document picks up directly from the Phase 1J-1D implementation attempt
(`feature/phase-1j-1d-apps-api-auth-boundary-spike`), which was stopped
before any code change because pre-implementation review found a blocker in
`resolveTenantContext` that the implementation task's own "Core security
rule" required stopping and reporting on rather than working around. This
document evaluates unblock options and recommends a path — it does not
implement one.

## 2. Executive summary

The Phase 1J-1C auth-boundary spike plan assumed `resolveTenantContext`
could run against `createUserClient(accessToken)` (anon key + forwarded
JWT), falling back to a human decision about `service_role` only if RLS or
grants blocked it. Pre-implementation review found something more
fundamental: `resolveTenantContext` and `writeAudit` call
`db.schema('core')`/`db.schema('audit')` on a `@supabase/supabase-js`
client, and `supabase/config.toml` deliberately excludes `core`, `audit`,
`workforce`, `booking`, and `ai` from the Data API's exposed-schema list
(`schemas = ["public", "api"]`). PostgREST rejects any `.schema()` call
outside that allowlist **regardless of which Postgres role is behind the
request** — so this is not an RLS-policy problem or a missing-`GRANT`
problem alone; it is a schema-exposure/architecture problem that
`service_role` does not fix. This document confirms that finding, explains
why exposing the internal schemas to fix it would be a step backward from
already-accepted architecture (ADR 0007, ADR 0008), and recommends the
**`api` facade/RPC pattern already established and accepted for exactly
this class of problem** as the path for a follow-up, still-non-PII
auth-boundary spike — not `service_role`, and not Workforce implementation.

## 3. Verified blocker

- `packages/core/src/tenant-context.ts:18-52` — `resolveTenantContext`'s
  first query is `db.schema('core').from('users')...` (lines 24-29),
  followed by `db.schema('core').from('tenant_memberships')...` (lines
  34-41) and, inside `loadPermissions`, `db.schema('core').from('role_assignments')...`
  (lines 59-64).
- `packages/core/src/audit.ts:12` — `writeAudit` calls
  `db.schema('audit').from('audit_logs').insert(...)`.
- `packages/db/src/client.ts:15-28` — both `createServiceClient()` and
  `createUserClient(accessToken)` are built via `createClient` from
  `@supabase/supabase-js`, i.e. both are PostgREST-backed HTTP clients, not
  direct Postgres connections. `.schema('core')` on either sets PostgREST's
  `Accept-Profile`/`Content-Profile` header to request that schema.
- `supabase/config.toml:5-15` (`[api]` block): `schemas = ["public", "api"]`,
  with an explicit inline comment: *"Data API exposes ONLY `public` + the
  app-facing `api` facade (Phase 1E-3). `core` and the product schemas
  (audit/workforce/booking/ai) are intentionally NOT exposed to
  PostgREST... This mirrors the intended Cloud dev Data API posture."*
- This is confirmed as a **deliberate, previously-accepted decision**, not
  an oversight: `docs/adr/0008-api-facade-schema.md` §"Decision" point 6
  states *"Local Data API exposes only `public` + `api`. `supabase/config.toml`
  `[api].schemas` is set to `["public", "api"]`, removing `core`, `audit`,
  `workforce`, `booking`, and `ai` from local PostgREST. This mirrors the
  intended Cloud dev posture."* and its Consequences section adds: *"`core`
  must never be added to the Cloud Data API."*
- Grant surface (all 19 migration files, `0000`–`0018`, checked): the
  `authenticated` role has `SELECT` on exactly `core.tenants`,
  `core.tenant_memberships`, `core.locations`, `core.tenant_modules`, plus
  `EXECUTE` on five specific `core` helper functions. It has **no** grant
  on `core.users`, `core.role_assignments`, `core.role_permissions`, or
  `core.roles`. `supabase/migrations/0013_authenticated_tenant_access.sql:12-14`
  states explicitly: *"No broad grants to all `core` tables."* This is a
  second, independent reason `resolveTenantContext`'s later queries would
  also fail even if the schema-exposure block (above) were lifted for
  `authenticated` alone.
- **Net effect**: `resolveTenantContext` and `writeAudit`, exactly as
  currently written, cannot succeed through the Supabase Data API for any
  Postgres role — `anon`, `authenticated`, or `service_role` — because the
  schema they target is not in PostgREST's exposed-schema list at all.

## 4. Why service_role via Supabase JS does not solve it

The Phase 1J-1C plan's fallback framing ("if blocked by RLS or grants,
consider `service_role` only with separate approval") assumed the blocker
was a *privilege* problem — the kind `service_role`'s RLS bypass is designed
to solve. It is not, or not only: PostgREST's `db-schemas` exposed-schema
allowlist (`supabase/config.toml`'s `[api].schemas`) is evaluated **before**
any role/RLS question, at the API-routing layer. A `.schema('core')` call
via `createServiceClient()` goes through the same PostgREST endpoint as
`createUserClient()` and is rejected the same way, because `core` is
simply not a schema PostgREST will resolve `Accept-Profile: core` against —
independent of the fact that the underlying Postgres role (`service_role`)
would otherwise bypass every RLS policy in that schema. Switching to
`service_role` would only ever have fixed reason (b) in §3 (missing
grants) — never reason (a) (schema not exposed at all), which is the
blocking one. This is consistent with this task's decision guidance: do
not recommend `service_role` as a quick fix, because it is not actually a
fix for the verified problem.

## 5. Why exposing core/audit/workforce in Data API is risky

Exposing `core` (or `audit`/`workforce`) by adding them to
`supabase/config.toml`'s `[api].schemas` would resolve the immediate
blocker but reopen exactly the risk ADR 0007 and ADR 0008 were written to
close:

- **Every function in an exposed schema becomes a callable PostgREST RPC.**
  `core` holds `SECURITY DEFINER` helpers (`core.is_member_of`,
  `core.has_permission`, `core.is_platform_staff`, `core.shares_tenant_with`)
  specifically because they need to evaluate membership/permission logic
  independent of the caller's own row-visibility. Exposing `core` would
  publish these as directly callable RPCs, which Supabase's own guidance
  (cited in ADR 0008) warns against for `SECURITY DEFINER` functions in an
  exposed schema.
- **`core.role_assignments`/`role_permissions`/`roles` currently have no
  `authenticated` grant at all** (§3) — a schema-exposure change alone
  would not even be sufficient; it would have to be paired with new grants
  on tables that were deliberately left ungranted, widening the surface
  further than the schema-exposure change by itself.
- **`audit.audit_logs`** is append-only and intended to be written only via
  the backend `service_role` path (per `security-requirements.md` §6);
  exposing `audit` to PostgREST — even read-only — adds a second path to a
  table whose current invariants (write-once, backend-only) were designed
  around a single access path.
- **`workforce`** exposure would put the entire Workforce schema (including
  `employees.name_encrypted`) inside the Data API surface before any
  PII-boundary design (Phase 1J-1 plan §13) is implemented — directly
  contrary to that plan's binding CTO correction against ad hoc PII
  exposure.
- This would also contradict this repository's own explicit, twice-recorded
  decision (ADR 0008 Decision point 1 and its Consequences: *"`core` must
  never be added to the Cloud Data API"*) — reversing it here, as a side
  effect of unblocking a diagnostic spike, would be a significant,
  under-reviewed architecture regression for a small task.

## 6. Option A: api facade/RPC for non-PII permission resolution

Extend the existing, already-accepted `api` facade pattern
(`supabase/migrations/0015_api_facade.sql`, `0017_api_tenant_dashboard_facade.sql`,
`0018_api_tenant_admin_members_facade.sql`; ADR 0008) with one more
security-invoker view or invoker RPC that exposes exactly what
`resolveTenantContext`'s permission-resolution step needs — a non-PII,
self-scoped read of the caller's effective permission-key set for a given
tenant (and, if useful, location) — without publishing raw `core` or any
`SECURITY DEFINER` object.

- **Fits precedent exactly**: ADR 0008 itself names this as the intended
  extension mechanism — *"Long-term: additional `api` objects (more curated
  views or invoker RPCs) are added only through new, reviewed forward
  migrations, each keeping the no-PII / no-`SECURITY DEFINER` /
  RLS-preserving invariants of this ADR."* ADR 0008's own "Alternatives
  considered" section already scoped an `api.get_my_tenant_memberships()`
  RPC design (security-invoker, not definer) as "reserved for future use
  cases that need encapsulated logic" — a permission-resolution view/RPC is
  exactly such a case.
- **Non-PII**: the shape needed is permission keys (strings) plus tenant
  id/location id/active-membership boolean — no name, email, or other PII
  column from `core.users` needs to be touched.
- **RLS-preserving**: as a `security_invoker` view/RPC, it runs with the
  caller's own privileges, so it can only ever return what the caller's own
  `memberships_select_self` / `role_assignments_select` RLS would already
  allow them to see about themselves — it does not widen access, it
  republishes an already-permitted self-read through a narrow, audited
  surface, exactly as `api.my_tenant_memberships` already does for
  membership rows.
- **Cost**: requires a new, reviewed migration (schema/view or RPC
  definition + grants + pgTAP coverage) — explicitly out of scope for this
  document and for a "spike," and requires separate approval before being
  written, per this repo's standing migration-approval rule.

## 7. Option B: direct Postgres backend access from apps/api

Rewrite `resolveTenantContext`/`writeAudit` (or provide `apps/api`-local
equivalents) to use a direct Postgres connection — bypassing PostgREST
entirely — instead of a `@supabase/supabase-js` client.

- **Not a novel idea for this codebase**: `packages/db/scripts/onboard-write.ts:35,691`,
  `onboard-db.ts:20,133`, and `onboard-commit.ts:32,174` already use `new
  Client({ connectionString })` from the `pg` package (already a
  `packages/db` dependency) for backend-only onboarding operations,
  connecting via `DATABASE_URL` directly rather than through PostgREST.
  `packages/db/scripts/onboard-tenant.test.ts:1477` and
  `onboard-write.test.ts:1092` even assert specific scripts stay
  "driver-free" (no direct `pg` import) — evidence of an existing,
  deliberate layering discipline around when direct Postgres access is and
  is not allowed in this codebase.
- **PostgREST's schema-exposure allowlist doesn't apply** to a direct `pg`
  connection at all — it is a PostgREST-specific restriction, not a
  Postgres-level one — so this path sidesteps §3's blocker entirely without
  touching `supabase/config.toml`.
- **RLS still applies** if the connection is authenticated as a role RLS
  policies constrain (e.g. by setting `role`/`request.jwt.claims` session
  variables the way PostgREST does internally) — but replicating PostgREST's
  JWT-to-role-and-claims translation by hand is nontrivial and easy to get
  subtly wrong; more realistically this path would run as a privileged
  Postgres role (similar in spirit to `service_role`, since `DATABASE_URL`
  in `packages/config/src/env.ts` is a server-only credential), meaning the
  application code itself becomes fully responsible for tenant/permission
  scoping with no RLS safety net — the same category of risk `service_role`
  already carries today, just reached by a different connection mechanism.
- **Cost**: nontrivial rewrite of already-merged, shared `packages/core`
  functions used (in principle) by more than just this spike; needs its own
  design review for connection pooling, error handling, and — most
  importantly — how tenant/permission scoping is re-derived safely without
  RLS doing it automatically.

## 8. Option C: expose internal schemas to PostgREST/Data API

Add `core` (and/or `audit`, `workforce`) to `supabase/config.toml`'s
`[api].schemas` list so `resolveTenantContext`/`writeAudit` work unmodified.

- **Directly reverses ADR 0007/ADR 0008's accepted decision** (§5) and
  reopens the `SECURITY DEFINER`-as-RPC risk those ADRs exist to close.
- **Insufficient by itself**: would still need new grants on
  `core.users`/`core.role_assignments`/`core.role_permissions`/`core.roles`
  to `authenticated` (§3), which is a second, independently-risky change on
  top of the schema-exposure change.
- **Not recommended** — consistent with this task's decision guidance to
  prefer not exposing `core`/`audit`/`workforce` to the Data API.

## 9. Recommendation for MVP *(recommendation)*

Do not unblock via `service_role` (§4) or schema exposure (§8, §5). For the
**next spike** (still non-PII, still no Workforce, still no writes), pursue
**Option A**: propose a narrowly-scoped `api` facade view/RPC for
permission-key resolution, following the exact review/migration process
ADR 0008 already establishes, before attempting the auth-boundary spike's
tenant/permission-check step again. This keeps the MVP path consistent with
every accepted architecture decision to date rather than introducing a new
exception under time pressure.

## 10. Recommendation for professional SaaS *(recommendation)*

Once Workforce (or any module) needs PII-bearing reads or writes that
genuinely cannot be expressed as a narrow, non-PII `api` facade projection
(e.g. decrypting `employees.name_encrypted`, or a manager mutating another
employee's row), **Option B (direct Postgres backend access, or the
existing `service_role`-via-Supabase-JS path for tables that don't need
`.schema('core')`)** is the appropriate professional-grade mechanism for
that specific, permission-checked operation — matching the already-planned
Workforce PII-boundary design (Phase 1J-1 plan §13: verify, then decrypt,
narrowly). This should remain a deliberate, reviewed, per-operation choice,
not a blanket "give `apps/api` a direct DB connection" change made now.

## 11. Recommendation for 300+ clients *(recommendation)*

No different architectural direction than §10 — ADR 0009's shared-infra
posture already assumes a single DB + RLS model scales this way. At that
scale, the operational concern shifts from "which access path" to
"connection pooling and query-plan discipline" for whichever of Option A
(PostgREST, connection-pooled by Supabase already) or Option B (direct `pg`,
would need its own pool, e.g. via `pg.Pool` rather than ad hoc `pg.Client`
instances as seen in the onboarding scripts) ends up handling the higher
QPS paths. This is a future operational-tuning concern, not a blocker to
resolve now.

## 12. Security implications

- **Option A** keeps the existing security invariants (no `SECURITY
  DEFINER` exposure, RLS-preserving, no PII, `anon` gets nothing) fully
  intact — it is additive within an already-reviewed pattern.
- **Option B** shifts the RLS safety net to application code for whatever
  it touches — the same risk class `service_role` already carries, so it
  must be held to the same "checks before use" discipline (verified
  tenant/permission resolution first, narrowly scoped queries, audit
  logging) already specified for `service_role` in the Phase 1J-1B review.
- **Option C** is the only one of the three that regresses an already-
  accepted security posture; not recommended.

## 13. Migration/RLS implications

- **Option A** requires a new, separately-approved migration (new `api.*`
  object + grants) and new pgTAP coverage, following the same review bar as
  `0015`/`0017`/`0018`. No existing RLS policy needs to change.
- **Option B** requires no migration or RLS change at all — it changes only
  application-layer connection code in `packages/core`/`packages/db`.
- **Option C** requires a `supabase/config.toml` change (not a SQL
  migration, but a Data-API-exposure change with migration-equivalent
  security weight) plus new grants (a real migration).
- None of the three is authorized by this document; all require a separate,
  explicit approval before any SQL, config, or migration file changes.

## 14. Env/secrets implications

- **Option A** needs no new env vars — it uses the same
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser) or
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` (backend, via `createUserClient`)
  already in use.
- **Option B** would use the already-defined, server-only `DATABASE_URL`
  (`packages/config/src/env.ts:22`) — already restricted to server contexts,
  no new var needed, but its usage surface would grow from "onboarding
  scripts only" to "shared `packages/core` runtime code," which is a
  meaningful change in how broadly that credential is relied upon even
  though the variable itself is unchanged.
- **Option C** needs no new env var either — the risk is entirely in what
  becomes reachable via the already-public anon key once `core` is exposed,
  which is precisely why it's the risky option despite needing no secret
  changes.

## 15. Testing implications

- **Option A**: extend the existing pgTAP pattern
  (`supabase/tests/0005_api_facade.sql`-style) with own-only /
  cross-tenant-denied / no-JWT-denied cases for the new view/RPC, mirroring
  ADR 0008's existing test coverage description.
- **Option B**: needs new unit/integration coverage for the direct-`pg`
  code path specifically proving it does not silently skip the
  tenant/permission checks that RLS would otherwise have enforced — this is
  a meaningfully larger testing burden than Option A because there is no
  database-level safety net to fall back on if a test case is missed.
- **Option C**: would need the full RLS/grant test suite re-run against a
  wider exposed surface, plus new tests proving `SECURITY DEFINER` helpers
  are not reachable as RPCs despite exposure — essentially re-doing the
  verification ADR 0007/0008 already did, in reverse.

## 16. Do-not-do-yet list

- Do not add `core`, `audit`, `workforce`, `booking`, or `ai` to
  `supabase/config.toml`'s `[api].schemas` (Option C) without a separate,
  explicit, security-focused approval — this reverses ADR 0008.
- Do not use `service_role`/`createServiceClient()` as a workaround for
  this blocker — confirmed in §4 that it would not even fix it.
- Do not rewrite `packages/core`'s `resolveTenantContext`/`writeAudit` to
  use direct Postgres (Option B) without a separate design review — the
  RLS-safety-net loss is real and needs its own scrutiny, not a fix folded
  into an auth-boundary spike.
- Do not write any new `api.*` migration (Option A) as part of accepting
  this document — this document recommends the option, it does not approve
  the migration.
- Do not resume the Phase 1J-1D auth-boundary spike's tenant/permission-check
  implementation until one of Option A/B is separately approved and, for
  Option A, merged.
- Do not proceed to any Workforce implementation — unaffected and unchanged
  by this decision, still gated on its own separate approvals per the
  Phase 1J-1 plan.

## 17. Final recommendation

Accept Option A (a narrow, non-PII `api` facade view/RPC for permission
resolution, following the ADR 0008 pattern and review process) as the
recommended unblock path for the next iteration of the auth-boundary spike.
Reject Option C (exposing `core`/`audit`/`workforce`) as inconsistent with
already-accepted architecture. Hold Option B (direct Postgres backend
access) in reserve for genuinely PII-bearing or cross-row Workforce
operations later, where a narrow facade view cannot suffice — not as the
immediate fix for a diagnostic spike's permission-check step.

## 18. Next practical step

Get explicit human approval to scope and write a small, separately-reviewed
migration proposal for the Option A `api` facade object (exact
view/RPC shape, non-PII column list, grant list, pgTAP coverage) as its own
task — distinct from, and prerequisite to, resuming the Phase 1J-1
auth-boundary spike's tenant/permission-check implementation step.
