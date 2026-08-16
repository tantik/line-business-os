# Phase 1J-1E — api Facade Permission-Resolution Design

## Status / scope

Status: **Design review only. Not implementation approval. No SQL is
written or proposed as executable in this document — all SQL shown is
illustrative design sketch, to be authored and reviewed as a real migration
in a later, separately-approved task.**
Branch: `plan/phase-1j-1e-api-facade-permission-resolution-design`

This document is the only file produced by this task
(`docs/phase-1j-1e-api-facade-permission-resolution-design.md`). No
`apps/api`, `apps/web`, or `packages/**` code was modified; no Supabase
migration was modified or created; no Supabase Cloud command was run; no
`service_role` client was constructed; no `.env` value was read or printed;
no dependency was added; nothing was deployed; no Workforce code was
written, to produce this document.

This document answers the design question left open by
[`phase-1j-1d-apps-api-auth-boundary-blocker-decision.md`](./phase-1j-1d-apps-api-auth-boundary-blocker-decision.md)
§9 (recommendation for MVP: pursue Option A, a new non-PII `api` facade
object for permission resolution) and its §18 next step (get approval to
scope a small, separately-reviewed migration proposal). It is that scoping
document — it proposes a design, it does not merge or execute it.

## Executive summary

`resolveTenantContext`/`requirePermission` cannot run through the Supabase
Data API today because `core` is deliberately excluded from
`supabase/config.toml`'s exposed-schema list (confirmed in Phase 1J-1D).
Rather than expose `core` (rejected — reverses ADR 0007/0008) or reach for
`service_role` (confirmed in Phase 1J-1D not to even fix this specific
problem), this document designs the smallest possible unblock: a single new
`api`-schema **RPC function**, `api.has_permission(tenant_id, permission,
location_id)`, that does nothing but forward its arguments to the
already-existing, already-hardened `core.has_permission(...)` SQL function
(`supabase/migrations/0006_helpers.sql:47-64`, `authenticated` already has
`EXECUTE` on it per `0014_core_helper_execute_hardening.sql:67-68`). This
single boolean-returning RPC is sufficient for the auth-boundary spike's
actual requirement (check one specific permission for one tenant/location,
collapse "not a member," "no permission," and "wrong location" into one
`false`) — it needs no new table exposure, no permission-array projection,
no `SECURITY DEFINER` object in `api` (forbidden by ADR 0008 regardless),
and duplicates zero logic, since `core.has_permission` already is the
canonical, RLS-reused permission check. This is deliberately narrower than
replicating `resolveTenantContext`'s full `TenantContext` (permissions
array + `isPlatformStaff`) — that richer shape is not needed to unblock the
spike and is not proposed here.

## Verified repository findings

- `supabase/migrations/0006_helpers.sql:47-64` —
  `core.has_permission(p_tenant_id uuid, p_permission text, p_location_id
  uuid default null) returns boolean`, `language sql stable security
  definer set search_path = core, public`. Body: `core.is_platform_staff()
  or exists (select 1 from core.role_assignments ra join
  core.role_permissions rp on rp.role_id = ra.role_id where ra.tenant_id =
  p_tenant_id and ra.user_id = core.current_user_id() and rp.permission_key
  = p_permission and (ra.location_id is null or ra.location_id =
  p_location_id))`. This is the exact function every RLS policy in the
  schema already calls (e.g. `wf_shifts_read` —
  `supabase/migrations/0009_workforce.sql:131-132`).
- `supabase/migrations/0014_core_helper_execute_hardening.sql:67-68` —
  `authenticated` already has `EXECUTE` on `core.has_permission(uuid, text,
  uuid)` (`revoke all ... from public; grant execute ... to authenticated`).
  Also confirmed: `core.is_platform_staff()` (line 61-62),
  `core.is_member_of(uuid)` (64-65), `core.current_user_id()` (53-54, in
  `0006`, reasserted), and `core.shares_tenant_with(uuid)` (74-75) all
  already have `authenticated` `EXECUTE`.
- `supabase/migrations/0006_helpers.sql:11-18` (superseded by
  `0016_fix_current_user_id_jwt_claims.sql:41-51`) —
  `core.current_user_id()` is `language sql stable` (no `security definer`),
  resolving identity as `coalesce(request.jwt.claims->>'sub',
  request.jwt.claim.sub, app.current_user_id)` — i.e. it already reads the
  verified JWT subject PostgREST sets, and is the project's own established
  equivalent of Supabase's `auth.uid()`. `0016`'s own header comment (lines
  6-16) documents exactly why: Cloud PostgREST sets the JSON GUC
  `request.jwt.claims`, not the legacy flattened `request.jwt.claim.sub`,
  and this bug was already found and fixed once for the existing `api`
  facade views.
- `supabase/config.toml:14` — `schemas = ["public", "api"]`; `core` is not
  exposed (Phase 1J-1D finding, reconfirmed).
- `supabase/migrations/0015_api_facade.sql`, `0017_api_tenant_dashboard_facade.sql`,
  `0018_api_tenant_admin_members_facade.sql` — the only three existing
  `api`-schema objects are all **views** (`api.my_tenant_memberships`,
  `api.my_tenant_locations`, `api.my_tenant_modules`,
  `api.my_tenant_admin_members`), all `with (security_invoker = true)`,
  each with `grant usage on schema api to authenticated; grant select on
  api.<view> to authenticated;` and no grant to `anon`. **No `api`-schema
  function/RPC exists anywhere in the repository today** (confirmed by
  repo-wide search — the only `create ... function api.*` pattern matches
  are none; all `create ... function` statements target `core`).
- `docs/adr/0008-api-facade-schema.md` §Decision point 3: *"**No `SECURITY
  DEFINER` object is allowed in `api`** precisely because exposed-schema
  functions become RPCs; an invoker view keeps the privilege story honest
  and auditable."* This is stated as a hard invariant of the `api` schema,
  not scoped only to the view-vs-RPC choice already made — it binds any
  future `api` object, including a new RPC.
- `docs/adr/0008-api-facade-schema.md` §"Alternatives considered": an
  `api.get_my_tenant_memberships()` RPC design was explicitly evaluated
  ("Option B" in that ADR) and rejected only for the *first* use case
  (membership listing) as unnecessary churn — not rejected in principle.
  §Consequences states: *"Long-term: additional `api` objects (more curated
  views or invoker RPCs) are added only through new, reviewed forward
  migrations, each keeping the no-PII / no-`SECURITY DEFINER` /
  RLS-preserving invariants of this ADR."* This document's proposal is
  exactly that anticipated extension.
- `supabase/migrations/0008_rbac_seed.sql:8-24` — permission catalog
  includes `core.audit.read` (line 14, `'Read audit logs'`). Role grants
  (lines 39-84): `tenant_owner` gets every permission; `tenant_admin` gets
  every permission except `core.billing.manage`; `manager` gets
  `core.audit.read` explicitly (line 67) plus Workforce/Booking/AI keys;
  `employee` does **not** get `core.audit.read` (lines 73-78: only
  `workforce.shift.read`, `workforce.attendance.manage`,
  `booking.booking.read`, `ai.propose`).
- `supabase/tests/0005_api_facade.sql` — the existing pgTAP suite for the
  `api` facade already establishes a reusable pattern (`pg_temp.as_auth_count`
  / `as_auth_text` helper functions that `set local role authenticated` and
  set the identity GUC before running a query) for testing `api`-schema
  objects under simulated authenticated sessions, including both the
  legacy flattened-claim and Cloud-style JSON-claims identity paths (lines
  38-100), and explicit assertions that `api` contains no `SECURITY
  DEFINER` function (lines 293-302) and that `anon` has no `api` access at
  all (lines 305-328).

## Existing api facade patterns

All three existing `api` objects share one shape: a `security_invoker`
view over `core.*` tables, self-scoped via `tm.user_id = core.current_user_id()`
(or an `exists (...)` clause using the same helper), exposing a fixed,
narrow, non-PII column list, with `grant usage on schema api` +
`grant select on api.<object>` to `authenticated` only and nothing to
`anon`. `supabase/tests/0005_api_facade.sql` structurally asserts (per
object): schema/view exists, exposes only the approved column list,
`security_invoker=true`, no `SECURITY DEFINER` function anywhere in `api`,
`anon` denied, `authenticated` granted `SELECT` only (no write privileges).
This is the pattern this document's proposal extends — with a **function**
rather than a **view**, because the target primitive (`core.has_permission`)
already returns a single boolean, not a row set.

## Current blocker recap

Restated only for context (fully detailed in Phase 1J-1D): `resolveTenantContext`
(`packages/core/src/tenant-context.ts:18-52`) and `writeAudit`
(`packages/core/src/audit.ts:11-25`) call `.schema('core')`/`.schema('audit')`
on a `@supabase/supabase-js` (PostgREST) client. `core`/`audit` are not in
`supabase/config.toml`'s `schemas = ["public", "api"]` allowlist, so these
calls are rejected by PostgREST for any role — `anon`, `authenticated`, or
`service_role` — before RLS or grants are even evaluated for most of the
tables involved. `service_role` does not fix this (confirmed Phase 1J-1D
§4). Exposing `core`/`audit` to fix it directly (Option C, that document's
§8) is not recommended (reverses ADR 0007/0008; also insufficient alone
since several `core` tables have no `authenticated` grant at all — this
document's §"Verified repository findings" confirms `core.role_assignments`/
`role_permissions`/`roles`/`users` still have none).

## Design goals

1. Unblock exactly the auth-boundary spike's actual need — checking
   whether the caller holds one specific permission for one specific
   tenant (and optionally location) — without reintroducing the
   schema-exposure risk Phase 1J-1D ruled out.
2. Zero duplicated permission logic: the design must call the existing
   `core.has_permission` rather than re-derive membership/role/permission
   logic in a new SQL body or in TypeScript.
3. Expose the absolute minimum: a boolean, nothing else. No permission-key
   rows, no role names, no membership rows, no user identifiers beyond what
   PostgREST/RLS already resolve internally from the JWT.
4. Preserve every existing `api`-schema invariant (`security_invoker`-only,
   no `SECURITY DEFINER`, `anon` denied, least-privilege grants,
   pgTAP-verifiable).
5. Leave `resolveTenantContext`/`packages/core` untouched — this is a new,
   additive database object; no application code changes are proposed or
   required to exist for this design to be valid.

## Non-goals

- Not a general-purpose "give me all my permissions" endpoint (that would
  be a different, richer design with different exposure tradeoffs — not
  needed for the spike, not proposed here).
- Not a replacement for `resolveTenantContext`'s full `TenantContext`
  shape — no `isPlatformStaff` flag or permission array is projected (the
  boolean already folds `is_platform_staff` bypass in via `core.has_permission`'s
  own body — see §"Platform staff handling" — so the caller does not need
  it surfaced separately for a single permission check).
- Not a PII-bearing object of any kind — no Workforce data, no `core.users`
  columns, no `employees.name_encrypted`.
- Not a write path — read/check only.
- Not a decision to modify `packages/core` — that question (§"Relationship
  to resolveTenantContext") is answered as "leave it for a later, separate
  decision," not resolved here.
- Not the SQL migration itself — illustrative only, per Status/scope.

## Option A: api view

A view analogous to the existing three, e.g. `api.my_permissions` (or
`api.my_tenant_permissions`) projecting rows of `(tenant_id, location_id,
permission_key)` for the caller's own active role assignments, self-scoped
via `core.current_user_id()`.

- **Pros**: matches existing precedent exactly (view + `security_invoker`);
  simple to reason about; reusable for more than one permission check per
  request (the caller could fetch the whole set once).
- **Cons**: exposes **raw permission-key rows**, which is a broader surface
  than the spike needs — the caller's full permission list becomes readable
  Data API content (still self-scoped and non-PII, but wider than "does the
  caller have permission X," and closer to what `resolveTenantContext`
  builds in TypeScript, which reintroduces some of the array-shaped
  complexity this design is trying to avoid). Requires the client (`apps/api`)
  to fetch a set and then do the presence check in TypeScript rather than
  asking the database a yes/no question directly — a small amount of
  permission-adjacent logic ends up back in application code, in tension
  with "prefer least surface."

## Option B: api RPC function

A single function, `api.has_permission(p_tenant_id uuid, p_permission
text, p_location_id uuid default null) returns boolean`, whose entire body
is a call to `core.has_permission(p_tenant_id, p_permission, p_location_id)`.

- **Pros**: smallest possible surface — a boolean, not a row set; directly
  answers the one question the spike needs; zero duplicated logic (pure
  delegation to the existing, already-hardened function); matches this
  task's decision guidance ("prefer a small RPC if it avoids exposing raw
  permission rows broadly") exactly; callable from `apps/api` via
  `supabase-js`'s `.rpc('has_permission', { p_tenant_id, p_permission,
  p_location_id })` against the `api` schema, or an equivalent PostgREST
  RPC call.
- **Cons**: a second round trip is needed if a caller ever needs more than
  one permission checked (not a concern for the single-permission spike);
  introduces the first-ever `api`-schema function, so it is new precedent
  (mitigated by ADR 0008 already anticipating and endorsing exactly this
  extension shape, per §"Verified repository findings").

## Option C: hybrid view + RPC

Both: a view for "list my permissions in tenant X" and the RPC for "do I
have permission Y in tenant X." Provides maximum flexibility for future
callers.

- **Cons**: doubles the review/migration/test surface for a spike that only
  needs one boolean answer; the view half carries Option A's "exposes raw
  permission rows" downside for no immediate consumer. Not justified by the
  current, narrow need.

## Recommended design

**Option B — the single `api.has_permission` RPC function**, and nothing
else, for this phase. It is the smallest change that unblocks the spike,
introduces no new row-set exposure, delegates entirely to an
already-reviewed, already-hardened function, and is explicitly anticipated
by ADR 0008's own stated extension mechanism ("invoker RPCs... added only
through new, reviewed forward migrations"). Option A (a permissions-listing
view) is not ruled out for a *future* need — e.g. if `apps/api` later wants
to fetch a full permission set once per request rather than call-per-check
— but should be proposed separately, only when an actual consumer needs it,
consistent with this repo's "no speculative surface" posture.

## Proposed facade contract *(illustrative design sketch — not executable SQL, not approved)*

```sql
-- ILLUSTRATIVE ONLY. Not proposed for execution by this document.
create function api.has_permission(
  p_tenant_id uuid,
  p_permission text,
  p_location_id uuid default null
)
returns boolean
language sql
stable
as $$
  select core.has_permission(p_tenant_id, p_permission, p_location_id);
$$;

grant execute on function api.has_permission(uuid, text, uuid) to authenticated;
-- anon: no grant (fail-closed, matching every other api object).
```

Deliberately **no** `security definer`, **no** `set search_path` (the
function body only references `core.has_permission`, which the caller
already has `EXECUTE` on per `0014` — schema-qualified reference, so no
search_path ambiguity exists to harden against, mirroring `0016`'s
reasoning for why `core.current_user_id()` itself needs no `set
search_path`). This keeps the wrapper's privilege story identical to the
underlying function it forwards to — it adds no privilege, it only makes an
already-internally-callable check externally callable via PostgREST RPC.

## Data exposure rules

- **Exposed**: exactly one boolean per call — whether the caller holds a
  specific, caller-specified permission in a specific tenant (and
  optionally location). No other data leaves the function.
- **Never exposed**: any `core.users` column, any `core.role_assignments`/
  `role_permissions`/`roles` row content (role names, permission-key lists,
  assignment ids, `created_at`/`updated_at`), any Workforce/Booking/AI
  table content, any encrypted or hashed PII column, any internal UUID
  beyond the `tenant_id`/`location_id` the caller already supplied as
  input (the function does not need to, and must not, echo back
  `core.current_user_id()`'s resolved value or any `role_assignments.id`).

## Tenant/location verification rules

- `tenant_id` is supplied by the caller as an RPC argument (there is no
  session-side "active tenant" concept at the database layer), but it is
  **never trusted as authorization on its own** — `core.has_permission`
  only returns `true` if an active `core.role_assignments` row exists for
  `core.current_user_id()` (the JWT-verified caller) in that exact
  `tenant_id`. A caller supplying a `tenant_id` they have no role in simply
  gets `false` — consistent with `.cursor/rules/01-security.mdc`'s "never
  trust tenant_id from the request body" rule, because the *value* is
  accepted but never *believed* without the underlying row check.
- `location_id` is optional (default `null`), matching `core.has_permission`'s
  existing signature and semantics exactly: a `null` location on the
  caller's role assignment always grants tenant-wide; a non-null assignment
  location must match the supplied `p_location_id`. No new location logic
  is introduced — this design reuses the existing, already-tested semantics
  verbatim.

## Permission resolution rules

The permission key itself (`p_permission`) is also caller-supplied, and
also unconditionally verified against `core.role_permissions`/
`core.role_assignments` inside `core.has_permission` — the RPC does not
pre-validate that the string is a "real" permission key against
`core.permissions`; an unrecognized key simply never matches any
`role_permissions.permission_key` row and returns `false`. This mirrors how
RLS policies already call `core.has_permission` with hardcoded permission
strings — there is no existing pattern of validating the key shape
separately, and adding one here would be new, unreviewed behavior beyond
what this design needs.

## Platform staff handling

No extra design needed: `core.has_permission`'s existing body already opens
with `core.is_platform_staff() or exists (...)` (`0006_helpers.sql:54-63`)
— a platform-staff caller gets `true` regardless of `role_assignments`,
automatically, because the RPC delegates entirely to this function. No
additional bypass logic is proposed or required in the new wrapper.

## Which permission for the first safe auth-boundary test

`core.audit.read` (`'core.audit.read'`), consistent with the earlier
Phase 1J-1C spike plan's recommendation and reconfirmed here: it is a
`core`-module permission (not Workforce-shaped, so it cannot be mistaken
for partial Workforce implementation), it already exists in the seeded
catalog (`0008_rbac_seed.sql:14`), and it is held by `tenant_owner`/
`tenant_admin`/`manager` but deliberately **not** by `employee` or
`client` (`0008_rbac_seed.sql:67` vs. `73-78`) — giving the test matrix a
real positive case and a real negative case without inventing new seed
data or a new permission key.

## Grants and RLS/security model

- `grant execute on function api.has_permission(uuid, text, uuid) to
  authenticated;` — the only grant needed. No table grant, no schema
  change beyond what `0015` already established (`api` schema `USAGE` is
  already granted to `authenticated`).
- **No grant to `anon`** — matches every existing `api` object; an
  unauthenticated caller gets no RPC at all (PostgREST itself will refuse
  the call for a role with no `EXECUTE`).
- **No `SECURITY DEFINER`** — the function is a plain (invoker) SQL
  function. It needs no elevated privilege because it does not query any
  table directly; it only calls another function the invoking role
  (`authenticated`) already has `EXECUTE` on. This satisfies ADR 0008's
  "no `SECURITY DEFINER` object in `api`" invariant by construction, not by
  exception.
- RLS itself is unaffected — no RLS policy needs to change; the design adds
  a new callable entry point to logic RLS policies already trust, it does
  not change what any policy evaluates.

## apps/api consumption plan *(recommendation, no code proposed/written here)*

`apps/api`'s auth-boundary guard/route (as scoped in the Phase 1J-1C plan)
would, after verifying the JWT via `createUserClient(token).auth.getUser()`,
call the same `createUserClient(token)` instance's `.schema('api').rpc('has_permission',
{ p_tenant_id, p_permission, p_location_id })` (or the `supabase-js`
equivalent) instead of importing and calling `resolveTenantContext`/
`requirePermission` from `@line-os/core`. A `false`/error result maps to
`403`; a PostgREST-level rejection (e.g. malformed UUID) maps to a generic
`400`/`403` per the existing "no raw DB error" discipline from Phase 1J-1B/
1J-1C. This consumption detail is a recommendation for a future
implementation task, not code produced by this document.

## Relationship to resolveTenantContext

`resolveTenantContext` and this proposed RPC answer related but different
questions: `resolveTenantContext` builds a reusable, in-memory
`TenantContext` (membership validity + full permission array +
platform-staff flag) intended to be checked multiple times against
different permission keys within one request/handler, via `can`/
`requirePermission`. `api.has_permission` answers one yes/no question per
call, with no client-side caching of a permission set. For the
single-permission auth-boundary spike, the RPC is sufficient and simpler.
For a future handler that needs to check several permissions or branch on
`isPlatformStaff` explicitly, `resolveTenantContext`'s richer shape would
still be the more natural fit — but it cannot run via PostgREST today
regardless (§"Current blocker recap"), so that need is not addressed by
this document.

## Should resolveTenantContext be replaced, wrapped, or left for a later direct-Postgres path?

**Recommendation: leave `resolveTenantContext` untouched for now.**
Three options exist and none is decided here:

- **Replace** its `.schema('core')` calls with calls to new `api.*`
  RPCs/views (this one, plus a future permissions-listing view/RPC if a
  richer shape is ever needed) — would make it PostgREST-compatible without
  needing direct Postgres, but changes a shared `packages/core` function
  used conceptually across the whole backend, which is out of scope for
  this design-only document (`packages/**` modification is forbidden by
  this task) and deserves its own review given how central the function is.
- **Wrap** it — leave `resolveTenantContext` as-is (still broken via
  PostgREST) and add a parallel, `apps/api`-local helper that calls the new
  RPC directly for the narrow cases that need it, migrating callers over
  gradually. This is what the "apps/api consumption plan" above implicitly
  proposes for the spike specifically, without formally deciding to
  deprecate or change `resolveTenantContext` itself.
- **Leave for direct-Postgres** — per Phase 1J-1D §7/§10, reserve
  `resolveTenantContext`'s eventual fix for a later, separately-designed
  direct-`pg`-connection path, used only where a narrow `api` facade
  genuinely cannot suffice (PII decrypt, cross-row manager writes).

This document does not choose between these — it only establishes that the
new RPC does not require choosing, because the spike can consume the RPC
directly without touching `resolveTenantContext` at all.

## Migration proposal for later approval *(recommendation, not authorized by this document)*

A new migration (e.g. `0019_api_has_permission_facade.sql`) containing:
1. `create function api.has_permission(...) ...` exactly as sketched in
   §"Proposed facade contract".
2. `grant execute on function api.has_permission(uuid, text, uuid) to
   authenticated;` — no other grant.
3. A migration header comment following the existing style (`0015`/`0017`/
   `0018`) explaining the Phase 1J-1D blocker this resolves and citing this
   design document.
This remains unwritten and unapproved; it is scoped here only so a future
approval can point at a concrete, small diff rather than an open-ended
task.

## Test strategy for later approval *(recommendation, not authorized by this document)*

Extend `supabase/tests/0005_api_facade.sql` (or add a new
`0006_api_has_permission.sql`, mirroring its structure) with, reusing the
existing `pg_temp.as_auth_*` helper pattern (a new `pg_temp.as_auth_bool`
variant returning the RPC's boolean would be a natural, minimal addition):

- Structural: `api.has_permission` exists as a function, is not
  `prosecdef` (not `SECURITY DEFINER`) — extending the existing "`api`
  schema contains no `SECURITY DEFINER` function" assertion
  (`0005_api_facade.sql:293-302`) to also cover functions, not just views.
- Grants: `authenticated` has `EXECUTE`; `anon` does not (mirroring lines
  305-350's pattern, using `has_function_privilege` instead of
  `has_table_privilege`).
- Behavioral, using the `core.audit.read` seeded role grants
  (`0008_rbac_seed.sql`) plus this suite's existing tenant/user fixtures
  (or new minimal ones): a `tenant_owner`/`tenant_admin`/`manager`-equivalent
  caller with an active role assignment holding `core.audit.read` in
  Tenant A gets `true`; the same caller queried against Tenant B (no
  assignment there) gets `false`; a caller with an active assignment in
  Tenant A but without `core.audit.read` (e.g. an `employee`-equivalent)
  gets `false`; a caller with a location-scoped assignment gets `true`
  only for the matching `location_id` and `false` for a different one;
  platform-staff caller gets `true` regardless of assignment (mirroring
  the existing `core.is_platform_staff()` bypass, already covered
  conceptually elsewhere but not yet for this new entry point); no-JWT-sub
  caller gets `false` (fail-closed, matching lines 618-642's existing
  pattern for the views).

## Security risks

- **New public entry point, however narrow**: any new `api`-schema object
  is new attack surface by definition, even at zero added privilege — a
  bug in argument handling (e.g. accidentally accepting a `null`
  `p_tenant_id` and having `core.has_permission` behave unexpectedly for
  it) would need to be ruled out by the test matrix above before merge.
- **Enumeration risk (low)**: a caller could probe arbitrary
  `(tenant_id, permission, location_id)` combinations to learn which
  return `true`/`false` for themselves — this is not a cross-tenant or
  cross-user leak (the check is always scoped to the caller's own
  `core.current_user_id()`), but it is marginally more probing surface
  than zero RPCs. This is an accepted, minor tradeoff already implicit in
  RLS existing at all (a user can already infer a lot about their own
  access by trying reads and observing empty-vs-nonempty results); this
  design does not meaningfully change that.
- **Scope-creep risk**: the temptation to widen this RPC later (e.g. add an
  optional "return the permission list too" parameter) would erode the
  "boolean only, minimal surface" property this design is built on — any
  such widening should be its own separately-reviewed proposal, not a
  quiet edit to this function.

## Do-not-do-yet list

- Do not write or run the migration sketched in §"Migration proposal for
  later approval" — it requires its own separate approval.
- Do not modify `packages/core`'s `resolveTenantContext`/`requirePermission`
  — the "replace/wrap/leave" question (§"Should resolveTenantContext be
  replaced...") is left open, not decided, by this document.
- Do not implement the `apps/api` consumption code sketched in §"apps/api
  consumption plan" — that is a future, separately-approved implementation
  task (resuming where Phase 1J-1C/1J-1D left off).
- Do not add a permissions-listing view (Option A) or the hybrid (Option C)
  — not justified by any current consumer; propose separately if one
  emerges.
- Do not expose `core`, `audit`, or `workforce` to the Data API.
- Do not use `service_role`/`createServiceClient()` for this or any related
  work in this phase.
- Do not proceed to Workforce implementation — unaffected and unchanged by
  this design.

## Final recommendation

Adopt the design in this document (Option B: a single, invoker-only,
zero-logic-duplication `api.has_permission` RPC wrapping the existing
`core.has_permission`) as the target for the migration proposal named in
§"Migration proposal for later approval." It is the smallest change
consistent with every constraint established across Phase 1J-1B through
1J-1D: no `service_role`, no internal-schema exposure, no `SECURITY
DEFINER` in `api`, no duplicated permission logic, and no PII. Do not
proceed to writing that migration, to any `apps/api`/`apps/web` code, or to
Workforce implementation without a separate, explicit approval for each.

## Next practical step

Get explicit human approval to write the small migration sketched in
§"Migration proposal for later approval" (function + grant + comment) as
its own scoped task, with the pgTAP coverage from §"Test strategy for
later approval" included in the same task. Only after that migration is
reviewed, merged, and locally verified should the Phase 1J-1C auth-boundary
spike's `apps/api` implementation resume, consuming the new RPC as
sketched in §"apps/api consumption plan" instead of
`resolveTenantContext`.
