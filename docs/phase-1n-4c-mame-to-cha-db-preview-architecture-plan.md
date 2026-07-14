# Phase 1N-4C — Mame To Cha DB-Backed Client Preview Architecture Plan (Slice A: Documentation Only)

## A. Scope

This document is **Slice A** of Phase 1N-4C: architecture, onboarding,
promotion, and go/no-go documentation for a DB-backed client acceptance
environment for the "Mame To Cha" cafe client. It plans, but does not
implement, host routing, preview routes, tenant resolution, or Server
Action changes, and does not touch Supabase Cloud.

This is documentation only:

- No application runtime code, middleware, `next.config`, route wrappers,
  or Server Actions are added or edited.
- No migrations are added. No SQL — destructive or otherwise — is executed.
- No Supabase Cloud command (`db push`, `db pull`, `link`, migration
  repair) is run.
- No Auth users are created. No Cloud/Vercel/DNS settings are changed.
- No secrets, credentials, or service-role keys appear anywhere below.
- No environment-specific tenant UUID is hardcoded; all examples use
  placeholder values or logical slugs.
- Every schema/table/column/route referenced below is taken directly from
  the current repository state (cited by path) — nothing is invented.

Everything in this document is a **proposal** for later, separately
approved implementation slices (Section P). Nothing here authorizes
writing to Supabase Cloud, creating Auth users, editing `next.config`,
editing middleware, or editing runtime code.

**Governance note:** classification of future Mame To Cha (and other
client) requests into tenant configuration, capability, or module is
governed project-wide by
[ADR 0010](docs/adr/0010-modular-product-governance-and-client-request-classification.md).
Section W below states only what is specific to this phase; it does not
restate ADR 0010's general model.

## B. Current-state inventory (cited)

### B1. Protected Workforce routes

`(protected)` layout enforces auth for the whole group:
[layout.tsx](apps/web/src/app/(protected)/layout.tsx) calls `requireUser()`
and sets `export const dynamic = 'force-dynamic'` because the group depends
on per-request session cookies.

Existing route tree under `apps/web/src/app/(protected)/dashboard/workforce/`:

- `page.tsx` — root/landing (gates on `workforce` module entitlement, shows
  "my staff profile" card, links to manager/staff/recipes)
- `manager/page.tsx` (+ `manager-dashboard-client.tsx`, `line-link-form.tsx`,
  `shift-cell-editor.tsx`, `staff-form.tsx`, `error-copy.ts`)
- `staff/page.tsx` (+ `staff-dashboard-client.tsx`,
  `correction-request-form.tsx`, `shift-preference-form.tsx`,
  `work-report-form.tsx`, `error-copy.ts`)
- `recipes/page.tsx` — recipe list
- `recipes/[recipeId]/page.tsx` — recipe detail

**This existing `/dashboard/workforce/*` tree is the internal, session
tenant-owner-facing product surface. It must not be recommended, aliased,
or exposed as the final client acceptance URL** (Correction 1). It is a
reuse *source* for shared UI/domain/data-loader code, not a URL clients are
sent to.

A distinct, unrelated top-level route `apps/web/src/app/workforce/page.tsx`
(outside `(protected)`, at `/workforce` not `/dashboard/workforce`) also
exists and must not be confused with the protected route tree above.

### B2. Tenant context and the active-tenant cookie

Cookie name: `ACTIVE_TENANT_COOKIE = 'lbo_active_tenant_id'`
([active-tenant-cookie.ts](apps/web/src/lib/tenant/active-tenant-cookie.ts)),
`httpOnly`, `sameSite: 'lax'`, `secure` in production, `path: '/'`.
Fail-closed UUID parsing (`parseActiveTenantCookieValue`) rejects any
non-canonical-UUID value.

Resolution logic
([context.ts](apps/web/src/lib/tenant/context.ts)) has two explicit trust
levels:

- **Strict**: caller passes `opts.tenantId` explicitly → the cookie is
  never read; the tenant ID must resolve to a live, active membership via
  `selectActiveTenant(memberships.data, { requestedTenantId })` or the
  result is `unauthorized`.
- **Lenient**: no `opts.tenantId` → the active-tenant cookie is read only
  as a *hint* and is always revalidated against live memberships.

`requireTenantContext(opts)` wraps this and redirects unauthenticated
requests to `/sign-in`.

### B3. Workforce Server Actions — read/write mismatch risk

Pattern (e.g.
[staff-actions.ts](apps/web/src/lib/workforce/staff-actions.ts)):
parse/validate `FormData` → `requireTenantContext()` **with no
`tenantId` argument** (the lenient, cookie-hinted path) → pass
`tenantContext.data.activeTenant.tenantId` into a service-layer helper →
RLS enforces the actual boundary in Postgres.

**This is a load-bearing fact for Phase 1N-4C, not an implementation
detail (Correction 8):** both the existing Workforce *pages* and the
existing Workforce *Server Actions* independently call the cookie/default
form of `requireTenantContext()`. Confirmed action call sites, all
`FormData`-based, none accepting an explicit tenant argument today:

| File | Actions |
| --- | --- |
| `apps/web/src/lib/workforce/staff-actions.ts` | `upsertEmployee`, `setEmployeeActive`, `bindEmployeeLineUser`, `unbindEmployeeLineUser` |
| `apps/web/src/lib/workforce/schedule-actions.ts` | `submitShiftPreference`, `runAutoDistribution`, `updateShiftAssignment`, `createShiftAssignment`, `publishSchedule` |
| `apps/web/src/lib/workforce/attendance-actions.ts` | `submitWorkReport`, `submitCorrectionRequest`, `decideCorrectionRequest` |

**Consequence:** a route-level fix alone (a new page shell under
`/_client-preview/mame-to-cha/*` that resolves tenant context strictly for
*reads*) is insufficient, because if that shell's forms still post to the
*existing* actions above unchanged, those actions will independently fall
back to the cookie-hinted lenient path for the *write* — silently
re-introducing exactly the cross-context risk the strict read path was
meant to close. Section G's shared action tenant resolver exists
specifically to close this gap.

### B4. Sign-in and redirect behavior

[sign-in/page.tsx](apps/web/src/app/sign-in/page.tsx): already-authenticated
users are redirected to the hardcoded literal `/dashboard`
(`redirect('/dashboard')`, line 28). The form (lines 46–72) posts directly
to the `signIn` Server Action with only `email`/`password` fields — no
hidden `returnTo`/`next` field exists today.
[auth/actions.ts](apps/web/src/lib/auth/actions.ts): `signIn` redirects to
a hardcoded `SIGN_IN_ERROR_PATH` on failure or the hardcoded
`DASHBOARD_PATH` (`/dashboard`) on success. **There is no
`next`/`return`/`redirectTo` query-param handling anywhere in the current
sign-in path.**

**Confirmed: sign-in is not fully reusable as-is (Correction 12)** — a
manager or staff member who is signed out and follows a
`preview.oruwa.jp/mame-to-cha/...` link will always land on `/dashboard`
after signing in, not back on the preview page they came from. Any
"return to preview after sign-in" mechanism is new surface (Section I).

### B5. Tenant membership facade

[membership.ts](apps/web/src/lib/tenant/membership.ts):
`listTenantMemberships(supabase, userId)` reads
`api.my_tenant_memberships`, a `security_invoker` view already self-scoped
to `core.current_user_id()` and `status = 'active'`
(`supabase/migrations/0015_api_facade.sql`,
`0017_api_tenant_dashboard_facade.sql`), backed by RLS on
`core.tenant_memberships` (`0007_rls_policies.sql`). Raw `core` schema is
never exposed to the Data API (ADR 0008). The view returns `tenant_slug`
per row, which is exactly what the strict slug-to-UUID resolution
(Section F) reads.

### B6. Locations and modules

`core.locations` and `core.tenant_modules`
(`supabase/migrations/0002_core_tables.sql`), RLS in
`0007_rls_policies.sql`. App reads go through `api.my_tenant_locations` and
`api.my_tenant_modules`
([locations.ts](apps/web/src/lib/tenant/locations.ts),
[modules.ts](apps/web/src/lib/tenant/modules.ts)). The workforce landing
page gates its UI on `tenant_modules.module = 'workforce' AND is_enabled`
— an app-level entitlement check, not the RLS isolation boundary itself.

### B7. Employee/auth-user binding

`workforce.employees.user_id` is a nullable FK to `core.users`
(`supabase/migrations/0009_workforce.sql`,
`0020_workforce_staff_profile_extension.sql`). Self-read RLS policy
`wf_employees_self_read` (`0022_workforce_staff_recipes_rls_policies.sql`):

```sql
create policy wf_employees_self_read on workforce.employees
  for select
  using (user_id = core.current_user_id());
```

This is intentionally SELECT-only. The app-facing restatement is
`api.workforce_my_staff_profile`
(`0023_workforce_api_facade.sql`), read via
[staff-profile.ts](apps/web/src/lib/workforce/staff-profile.ts)
`getMyWorkforceStaffProfile(supabase, tenantId)`. A `null` result means "no
employee row bound to this auth user" — not an error.

### B8. Existing local-only onboarding tooling (`db:onboard-tenant`)

Root script `db:onboard-tenant` → `packages/db/scripts/onboard-tenant.ts`.
Hard Cloud-safety guard, `assertLocalDatabaseUrl()`: rejects any
`*.supabase.co` / `*.pooler.supabase.com` host, requires host in
`{127.0.0.1, localhost, ::1}` and port `54322` (the local Supabase Postgres
port). `RESERVED_TENANT_SLUGS` blocks reuse of `demo`, `admin`, `api`,
`client-template`, `mame-to-cha-tokyo`, `mirawi-demo-salon`. Commit mode
requires `--commit --yes --i-understand-this-writes-local-db --target
local --backup-artifact <path>`; `--target` only accepts the literal string
`local`.

**This guard is not to be weakened (Correction 15).** This plan does not
recommend removing, relaxing, or bypassing the localhost restriction in
`db:onboard-tenant`, and does not recommend adding a Cloud target to its
`--target` flag. Cloud onboarding for the acceptance tenant is a distinct,
manifest-driven, human-approved runbook (Section K), not an extension of
the local CLI's write path.

### B9. Migrations and RLS

Relevant chain: `0002` (core tables), `0006` (helpers incl.
`core.current_user_id()`), `0007` (core RLS), `0008` (RBAC seed), `0009`
(workforce tables + RLS), `0013`–`0019` (authenticated access + `api`
facade), `0020`–`0023` (staff profile, recipes, staff/recipe RLS, staff/
recipe API facade), `0024`–`0031` (cafe write grants/extensions,
employee↔LINE-user links, read/write API facade). Tenant isolation is
layered: `core.tenant_memberships` is the source of truth; RLS
(`core.has_permission`, `core.is_member_of`) is the DB-enforced boundary;
`api.*` views restate (never replace) that boundary. This layering is the
existing, working mechanism later slices must reuse — not a new mechanism
to invent. **No schema gap has been proven, so no migration is planned**
(Correction 14, Decision C13).

### B10. Existing public `/mame-to-cha` and `/demo/cafe`, and the corrected tenant-slug decision

Both `/mame-to-cha` and `/demo/cafe`
(`apps/web/src/app/mame-to-cha/*`, `apps/web/src/app/demo/cafe/*`) are
static, unauthenticated, client-side-only pathnames that render the shared
`HubView` component over **in-memory mock data only** — confirmed no
`supabase`/`createClient` import anywhere under `apps/web/src/lib/demo/`.
The in-UI copy states explicitly: "本デモはブラウザ上で確認できる公開サンプルです。
実データの書き込みは行われません。"

There is also a seeded **DB** tenant with slug `mame-to-cha-tokyo`
(`supabase/seed/seed.sql`, `kind = 'demo'`) used for internal sales/smoke
demos (see
[phase-1n-2-cafe-demo-data-prep-plan.md](docs/phase-1n-2-cafe-demo-data-prep-plan.md)).
It is already in `RESERVED_TENANT_SLUGS` (Section B8) and **must be kept
untouched** — nothing in this plan reads, writes, renames, or reuses
`mame-to-cha-tokyo`.

**Tenant-slug decision (Correction 7):**

- The **pathname** `/mame-to-cha` (used by the public static demo, and by
  the internal preview route shell's public-facing path) is a **URL
  segment only — it is not itself a `core.tenants` row and has no slug
  identity of its own.** A pathname and a DB tenant slug are different
  namespaces; they are allowed to use the same literal text without being
  the same thing.
- The **acceptance tenant slug is `mame-to-cha`** — the plain client
  slug, not a manufactured variant. No verified schema/tooling
  restriction requires a different slug: `mame-to-cha` is not in
  `RESERVED_TENANT_SLUGS` (only `mame-to-cha-tokyo` is), and the static
  demo pathname and the DB tenant slug live in genuinely separate systems
  (Next.js routing vs. `core.tenants.slug`), so there is no actual naming
  conflict to engineer around.
- **The seeded sales-demo tenant is `mame-to-cha-tokyo`.** It is a
  separate, pre-existing DB tenant (`kind = 'demo'`, Section B10 above)
  used for internal sales/smoke demos. `mame-to-cha` (acceptance) and
  `mame-to-cha-tokyo` (sales demo) are two distinct `core.tenants` rows
  and remain separate — this plan never reads, writes, renames, or reuses
  `mame-to-cha-tokyo`.
- Net result: three distinct "Mame To Cha" artifacts coexist by design —
  (a) the public demo pathname `/mame-to-cha` (no DB tenant), (b) the
  seeded internal sales-demo DB tenant `mame-to-cha-tokyo` (untouched),
  and (c) the acceptance DB tenant `mame-to-cha` (this plan). Section M
  documents this explicitly so it is never re-litigated as a bug.

### B11. Governing conventions

- [ADR 0010](docs/adr/0010-modular-product-governance-and-client-request-classification.md)
  (modular product governance and client-request classification): the
  durable, project-wide decision governing how every future client
  request — from Mame To Cha or any other tenant — is classified into
  tenant/location configuration, module configuration, capability, module,
  temporary experiment, or rejected fork, before implementation starts.
  Section W of this plan states only what is specific to Phase 1N-4C /
  Workforce and defers everything general to this ADR.
- ADR 0009 (safe growth/module rollout): new tenants/modules ship
  disabled-by-default and per-tenant; `core.tenant_modules` is entitlement
  source of truth; migrations are additive-only; every business table has
  `tenant_id` + RLS in its creating migration; internal schemas are never
  exposed via the Data API.
- `.cursor/rules/01-security.mdc`: `service_role` is server-only, never in
  `apps/web`; `tenant_id` is always derived from membership, never from
  request body/query/headers.
- `.cursor/rules/02-database-rls.mdc`: every business table needs
  `tenant_id` + RLS in the same migration; a table without RLS is a bug.
- [phase-1h-stage-5a-real-customer-onboarding-design.md](docs/phase-1h-stage-5a-real-customer-onboarding-design.md):
  Cloud/production onboarding is its own approval-gated track; local
  onboarding stays local-only; approval for one environment never implies
  approval for another.

### B12. Middleware / session refresh (routing-mechanism input)

The existing Supabase auth middleware is responsible for session-cookie
refresh on the request/response cycle. **This plan does not add routing
responsibility to that middleware** (Correction 5) — see Section E for
why a `next.config.ts` `beforeFiles` rewrite is the correct mechanism
instead, and why editing middleware is out of scope for this slice
regardless.

## C. Accepted domain architecture

This plan adopts the following three-host architecture as given
(Correction 2), superseding any single-host framing in the prior revision:

| Host | Path | Role | DB-backed? |
| --- | --- | --- | --- |
| `demo.oruwa.jp` | `/cafe/*` | Public, frontend-only sales demo | No — mock data only |
| `preview.oruwa.jp` | `/mame-to-cha/*` | Authenticated, DB-backed client **acceptance** environment | Yes |
| `app.oruwa.jp` | `/mame-to-cha/*` | Future **production** environment (Phase 1N-4D) | Yes |

Today, the repository serves both public demo pathnames
(`/mame-to-cha`, `/demo/cafe`) from a single host/deployment with no host
separation (Section B10). Assigning `demo.oruwa.jp` and `preview.oruwa.jp`
to distinct hosts is a DNS/Vercel-domain change and is explicitly **not**
performed by this plan (Open Decision O1) — this section documents the
target architecture and how host-based rewrites make it reachable, not
that the DNS work has happened.

## D. Architecture decisions

1. **`/dashboard/workforce/*` is never the client acceptance URL.** It
   remains the internal, tenant-owner dashboard. Client acceptance always
   happens at `preview.oruwa.jp/mame-to-cha/*` (Section C).

2. **Reuse at the shared UI/domain/data-loader level only — not page
   re-exports.** Existing Workforce React components, service-layer
   helpers (`apps/web/src/lib/workforce/*`), and data loaders are reusable
   building blocks for the preview shell. The preview shell is a **new,
   thin route tree** (Section F) that calls into that shared code with its
   own strict tenant-resolution wrapper — it does not import or re-export
   the existing `(protected)/dashboard/workforce/*` page modules unchanged
   (Correction 3).

3. **Host-based `beforeFiles` rewrite, not a middleware change.**
   `next.config.ts` gets a `beforeFiles` rewrite (planned, not
   implemented in this slice — see Slice B1, Section P) matching on the
   `preview.oruwa.jp` host:

   ```ts
   // Illustrative only — not implemented in this slice.
   {
     source: '/mame-to-cha/:path*',
     has: [{ type: 'host', value: 'preview.oruwa.jp' }],
     destination: '/_client-preview/mame-to-cha/:path*',
   }
   ```

   `beforeFiles` is required specifically because Next.js matches
   `beforeFiles` rewrites *before* checking the physical filesystem/page
   tree. The physical public pages at `apps/web/src/app/mame-to-cha/*`
   already exist and must keep serving unchanged on every host that is
   *not* `preview.oruwa.jp` (Section C's `demo`/main-host row and any other
   host). An `afterFiles` or `fallback` rewrite would only apply once the
   filesystem router failed to match — but `/mame-to-cha/*` **does** match
   an existing physical page, so it would never reach the rewrite at all
   on any host. `beforeFiles` with a `host` matcher is the only rewrite
   phase that can override the physical route conditionally, host-by-host,
   without touching the physical page files or middleware (Correction 5).
   Editing middleware for this purpose is explicitly rejected: middleware
   in this repo is scoped to Supabase session-cookie refresh (Section
   B12), and folding host-based routing into it would mix an unrelated
   concern into a security-sensitive file.

4. **Preview route shell — thin, protected, internal.** New pages under
   `apps/web/src/app/_client-preview/mame-to-cha/*` (planned, not created
   in this slice):

   - `/_client-preview/mame-to-cha` (root)
   - `/_client-preview/mame-to-cha/manager`
   - `/_client-preview/mame-to-cha/staff`
   - `/_client-preview/mame-to-cha/recipes`
   - `/_client-preview/mame-to-cha/recipes/[recipeId]`

   Each page: requires an authenticated session (reuses `requireUser()`),
   then resolves tenant context **strictly** (Section E), then renders the
   shared Workforce UI/data-loader components (Decision 2) with the
   resolved tenant/location. "Thin" means the page component itself
   contains only auth + tenant/location resolution + composition of shared
   components — no duplicated business logic.

5. **Tenant slug resolution is membership-driven and cookie-independent
   for preview reads** (Correction 6). Required flow, to be implemented in
   the shared preview tenant resolver (Section F):

   1. Authenticate (`requireUser()`).
   2. Read the current user's memberships (`listTenantMemberships`,
      Section B5).
   3. Find the active membership where `tenant_slug = 'mame-to-cha'`
      (Section B10's corrected slug).
   4. If found, take its `tenant_id` (a UUID) and call
      `requireTenantContext({ tenantId })` — the **strict** path (Section
      B2) — never reading `lbo_active_tenant_id`.
   5. If no matching active membership exists, **fail closed**: render a
      neutral "no access" state, not a redirect to another tenant and not
      a generic error that reveals whether the slug exists.

6. **`mame-to-cha` is the acceptance tenant's real slug — no invented
   variant** (Section B10). The pathname `/mame-to-cha` and the tenant slug
   `mame-to-cha` are two different things that happen to share text; this
   is accepted, not a defect to design around.

## E. Preview route/domain matrix

| Public path | Host | Internal rewrite target | Auth required | Tenant resolution |
| --- | --- | --- | --- | --- |
| `preview.oruwa.jp/mame-to-cha` | `preview.oruwa.jp` | `/_client-preview/mame-to-cha` | Yes | Strict, via membership (Section D.5) |
| `preview.oruwa.jp/mame-to-cha/manager` | `preview.oruwa.jp` | `/_client-preview/mame-to-cha/manager` | Yes | Strict |
| `preview.oruwa.jp/mame-to-cha/staff` | `preview.oruwa.jp` | `/_client-preview/mame-to-cha/staff` | Yes | Strict |
| `preview.oruwa.jp/mame-to-cha/recipes` | `preview.oruwa.jp` | `/_client-preview/mame-to-cha/recipes` | Yes | Strict |
| `preview.oruwa.jp/mame-to-cha/recipes/[recipeId]` | `preview.oruwa.jp` | `/_client-preview/mame-to-cha/recipes/[recipeId]` | Yes | Strict |
| `demo.oruwa.jp/cafe/*` | `demo.oruwa.jp` | (future — likely `/demo/cafe/*`, unchanged content) | No | N/A — public, no DB |
| `app.oruwa.jp/mame-to-cha/*` | `app.oruwa.jp` | Future production shell (Phase 1N-4D) | Yes | Strict (production tenant, separate UUID) |

Any host other than `preview.oruwa.jp` (including whatever host currently
serves the physical `/mame-to-cha/*` pages during development, and the
eventual `demo.oruwa.jp`/`app.oruwa.jp`) must continue to serve the
existing physical pages/production shell unchanged — this is the specific
behavior the `beforeFiles` + `host` matcher (Decision D.3) exists to
guarantee.

Explicitly out of matrix scope (unchanged by this plan): `/dashboard/workforce/*`
(existing protected dashboard, Decision D.1).

## F. Tenant and location resolution contract

### F1. Tenant slug → UUID (reads)

1. Input: authenticated Supabase session + the constant slug
   `'mame-to-cha'` (not read from the URL or any client input — it is a
   fixed constant for this preview shell, since the shell is
   single-tenant by construction).
2. Resolve memberships via `listTenantMemberships` (Section B5).
3. Filter for the membership whose `tenant_slug === 'mame-to-cha'` and
   whose `status` is active. No match, or the caller has no session →
   fail closed, neutral response (Section D.5, step 5).
4. Take that membership's `tenant_id` as the resolved UUID. Used **only**
   as the strict `tenantId` argument (Section B2) — never written to
   `lbo_active_tenant_id` or any other cookie, and never influenced by its
   current value.
5. Every page render for this tenant reuses the same resolved `tenant_id`,
   always via `requireTenantContext({ tenantId })`.

### F2. Location resolution (Correction 11)

**Manager:**

- Zero active `core.locations` rows for the resolved tenant → fail (block
  the page with an explicit "no active location configured" state).
- Exactly one active location → use it automatically.
- More than one active location → fail closed with an explicit "select a
  location" state; do not guess (e.g. never "first row returned"). A
  location selector UI is out of scope for this slice's documentation and
  is deferred until multi-location acceptance is actually needed.

**Staff:**

Before rendering any staff data, the following must all agree, or the
page fails closed to a neutral "no profile" state:

- the staff Auth user's active membership's `tenant_id` (from F1);
- the `workforce.employees` row's `tenant_id` (must equal the above);
- the `workforce.employees` row's `location_id` (must be an active
  location under the same tenant);
- the `workforce.employees` row's `user_id` (must equal the signed-in
  Auth user's id — this is exactly the `wf_employees_self_read` predicate,
  Section B7).

If any of these four do not match, the staff preview shows "no employee
profile for this account" — never another employee's or another tenant's
data, and never a silent partial match.

## G. Server Action tenant-pinning contract

### G1. The mismatch this section closes

Section B3 established that existing Workforce Server Actions
independently call the lenient, cookie-hinted `requireTenantContext()`.
Section D.5/F1 gives preview *pages* a strict, cookie-independent read
path. Without a corresponding change on the *write* side, a preview page
could correctly show Mame To Cha data while a form on that same page
submits through an action that resolves tenant context from whatever
`lbo_active_tenant_id` happens to be set to in that browser session (e.g.
the operator's own dashboard tenant) — a real correctness/isolation gap,
not a hypothetical one.

### G2. Shared action tenant resolver (Correction 9)

Plan (not implemented in this slice): a shared helper, e.g.
`resolvePreviewTenantContext(tenantSlug?: string)`, used by every preview
Server Action:

```ts
// Illustrative only — not implemented in this slice.
async function resolvePreviewTenantContext(tenantSlug?: string) {
  if (!tenantSlug) {
    // No slug supplied: existing dashboard behavior, unchanged.
    return requireTenantContext();
  }
  const memberships = await listTenantMemberships(supabase, user.id);
  const membership = memberships.data?.find(
    (m) => m.tenantSlug === tenantSlug && m.status === 'active',
  );
  if (!membership) return { status: 'unauthorized' as const };
  return requireTenantContext({ tenantId: membership.tenantId });
}
```

Contract:

- Preview form submissions/action calls include an explicit
  `tenantSlug: 'mame-to-cha'` argument (not a UUID, not a cookie value —
  a slug, consistent with F1's "slug is the fixed input" model).
- The resolver re-derives the UUID from the authenticated user's *current*
  memberships on every call — it never trusts a UUID or slug value that
  was merely rendered into the page earlier, closing any staleness/tamper
  window.
- If `tenantSlug` is omitted (all existing dashboard call sites), behavior
  is **byte-for-byte unchanged**: the existing lenient
  `requireTenantContext()` path runs exactly as it does today (Correction
  9, "dashboard callers without tenantSlug preserve existing behavior").
  This is what makes the change additive rather than a rewrite of
  `apps/web/src/lib/workforce/*`.

### G3. Mutations requiring explicit tenant pinning (Correction 10)

Every one of these existing Server Actions needs a preview-safe wrapper
(or an additive `tenantSlug` parameter) applying Section G2's resolver
before delegating to the existing service-layer call:

| Capability | Existing action | File |
| --- | --- | --- |
| Employee create/edit | `upsertEmployee` | `staff-actions.ts` |
| Employee activate/deactivate | `setEmployeeActive` | `staff-actions.ts` |
| Shift create | `createShiftAssignment` | `schedule-actions.ts` |
| Shift update | `updateShiftAssignment` | `schedule-actions.ts` |
| Auto-distribution | `runAutoDistribution` | `schedule-actions.ts` |
| Publish schedule | `publishSchedule` | `schedule-actions.ts` |
| Shift preference | `submitShiftPreference` | `schedule-actions.ts` |
| Work report | `submitWorkReport` | `attendance-actions.ts` |
| Correction request (submit) | `submitCorrectionRequest` | `attendance-actions.ts` |
| Correction request (approve/reject) | `decideCorrectionRequest` | `attendance-actions.ts` |

(`bindEmployeeLineUser`/`unbindEmployeeLineUser` are out of scope — LINE/LIFF
integration is explicitly excluded from Phase 1N-4C by the hard
restrictions.)

Every wrapper: parse input → `resolvePreviewTenantContext('mame-to-cha')`
→ if not `success`, return the failure result → call the existing
service-layer function (`upsertWorkforceEmployee`, etc.) with the
resolved `tenant_id`, exactly as the dashboard action already does.
RLS remains the final enforcement layer regardless of any app-level bug
in this chain.

## H. Read/write consistency requirement

Combining Sections F and G: a preview page must never render using a
tenant context resolved one way (strict, slug-driven) while its own forms
mutate using a tenant context resolved a different way (lenient,
cookie-driven). Slice B2 (Section P) is specifically the slice that closes
the write side once Slice B1 has proven the read side — the two are
tracked separately because they are different risks (a wrong read shows
wrong data; a wrong write corrupts or leaks data), but neither is
considered "done" without the other.

## I. Sign-in `returnTo` contract (Correction 12)

Section B4 confirms today's sign-in always lands on `/dashboard` and has
no return-path handling. Plan for a preview-aware addition (not
implemented in this slice):

- A `returnTo` value may be supplied (e.g. as a query param on
  `/sign-in?returnTo=%2Fmame-to-cha%2Fmanager` when redirected from an
  unauthenticated preview request).
- Validation, all of which must pass or the value is discarded in favor of
  the existing hardcoded `/dashboard` fallback:
  - Must be a **relative path** starting with a single `/` (reject
    absolute URLs, e.g. `https://evil.example`).
  - Must reject protocol-relative values (`//host/...` — a classic
    open-redirect bypass).
  - Must match an **allowlist** pattern scoped to preview paths only,
    e.g. `/^\/mame-to-cha(?:\/[a-z0-9-]+)*$/` — not an arbitrary relative
    path, so `returnTo` cannot be used to bounce a session into an
    unrelated internal route.
- No one-click login, no magic link, no pre-filled credential, no
  credential embedded in the `returnTo` URL or anywhere else (Correction
  12/13 boundary) — the user still authenticates normally with
  email/password through the existing `signIn` action.

## J. Auth users (Correction 13)

Manager and staff preview users are **separate Supabase Auth users**, each
with their own `core.tenant_memberships` row for the `mame-to-cha` tenant
and, for staff, a bound `workforce.employees.user_id` (Section F2). No
shared/generic login, no impersonation shortcut, in Phase 1N-4C.

## K. Acceptance data classification

| Class | Examples | Handling |
| --- | --- | --- |
| **Non-sensitive structural** | Tenant name, slug (`mame-to-cha`), location name, module list, shift type labels | May appear in the manifest (Section L) in plaintext. |
| **Client-provided operational (acceptance-only)** | Real staff names/positions the client wants to see in the preview, real-ish shift schedules for the review period | Employee PII (name) is entered through the **existing** encryption path (`name_encrypted`/`name_hash` via `@line-os/db/crypto`, Section B7) exactly as production data would be — never plaintext, never a new storage path. Not copied into production automatically (Section N). |
| **Credentials/identity** | Manager/staff email addresses, passwords, Auth user IDs | Never placed in the manifest or any committed doc; created and communicated out-of-band by a human per the runbook (Section M); manifest references people by role/label only (e.g. "manager-1"), not by real email. |

No class in this table is billing data, LINE broadcast content, or mass
messaging content — those remain explicitly out of scope for Phase 1N-4C
per the hard restrictions.

## L. Onboarding manifest specification

**Manifest convention (resolved):** committed manifests are **YAML**,
stored under **`docs/onboarding/`**. The first real manifest for this
phase is proposed as `docs/onboarding/mame-to-cha-acceptance.manifest.yaml`
(created at Slice C, not by this Slice A document). A manifest is a
version-controlled, non-secret file that declares desired state without
executing anything:

```yaml
# NON-SECRET. No emails, no passwords, no UUIDs. Slugs/codes only.
manifest_version: 1
tenant:
  slug: mame-to-cha
  display_name: "Mame To Cha"
  kind: client            # not "demo" — see core.tenants.kind values
locations:
  - logical_id: main-cafe
    name: "Mame To Cha — <location name TBD>"
    timezone: Asia/Tokyo
modules:
  - workforce
roles:
  - logical_id: manager-1
    role: manager   # core.roles.key, supabase/migrations/0008_rbac_seed.sql
  - logical_id: staff-1
    role: employee  # core.roles.key, supabase/migrations/0008_rbac_seed.sql
    requires_employee_binding: true   # see Section F2 (staff) / B7
notes:
  - "Real email addresses and passwords are never stored in this file."
  - "Tenant/location/employee UUIDs are assigned at onboarding time and recorded only in the (out-of-band) runbook execution log, not in this manifest."
```

Rules:

- No real UUID, email, password, or service-role value ever appears in a
  manifest.
- The manifest is the input to the runbook (Section M); it is not itself
  executable.
- `tenant.slug` is `mame-to-cha` (Section B10/D.6) — not a manufactured
  variant — and must not collide with `RESERVED_TENANT_SLUGS` (it does
  not; only `mame-to-cha-tokyo` is reserved).
- `role` values are the exact `core.roles.key` strings seeded by
  `supabase/migrations/0008_rbac_seed.sql`: **`manager`** and
  **`employee`** (not `owner_or_manager`, not `staff`) — see Section T,
  Open Decision O2 (resolved).

## M. Cloud onboarding runbook (with approval gates)

This is a **procedure description**, not executable SQL or a script.
Local rehearsal happens first (Slice C, Section P), then Cloud execution
(Slice D) — each step below requires the explicit human approval gate
already established by
[phase-1h-stage-5a-real-customer-onboarding-design.md](docs/phase-1h-stage-5a-real-customer-onboarding-design.md)
§5.

| Step | Action | Approval gate |
| --- | --- | --- |
| 0 | Rehearse the full sequence below against **local** Postgres via the existing `db:onboard-tenant` local-only tool (Section B8), using a locally-scoped equivalent manifest. | Local rehearsal only — no Cloud approval needed for this step, but it must complete cleanly before step 1. |
| 1 | Confirm manifest (Section L) is reviewed and merged. | Human review of the manifest PR. |
| 2 | Create/verify `core.tenants` row (`slug = 'mame-to-cha'`, `kind` per manifest) in Supabase Cloud. | Explicit approval before any Cloud DB write. |
| 3 | Create/verify `core.locations` row(s) per manifest. | Same Cloud-write approval as step 2 (or one combined approval covering steps 2–3). |
| 4 | Enable `core.tenant_modules` row(s) for `workforce` (disabled-by-default per ADR 0009 — this is the explicit per-tenant opt-in). | Explicit approval. |
| 5 | Create manager and staff Supabase Auth users (out-of-band, credentials never committed). | Explicit approval; privacy/legal handling of email per Section K. |
| 6 | Create `core.tenant_memberships` rows binding each Auth user to the `mame-to-cha` tenant with the correct role. | Explicit approval (role/permission changes are a listed approval-gate category). |
| 7 | **Narrow, separately documented step**: create the `workforce.employees` row for the staff user with `user_id` bound to the staff Auth user (Section F2/B7). This is a privileged employee↔Auth-user binding write and is treated as its own approval item, distinct from step 6's membership write, because it links PII (an employee record) to an identity. | Explicit, separate approval. |
| 8 | Enter employee PII (name) through the existing app/encryption path (`name_encrypted`/`name_hash`) — never a raw SQL insert of plaintext. | Covered by step 7's approval. |
| 9 | Record audit rows for all of the above per existing `writeAudit` conventions. | N/A — expected side effect of steps 2–8, not a separate approval. |
| 10 | Read-only verification pass (Section O). | N/A — verification, not a write. |

Every step that writes to Cloud requires its own explicit, recorded
approval, scoped to that operation — approval for step 2 does not imply
approval for step 5, consistent with the existing approval-gates rule.
This runbook does not itself perform any of these writes; execution is a
separate, later, human-run activity.

## N. Preview-to-production promotion: allowlist and denylist (Correction 19)

**Allowlist** (may be considered for promotion into the eventual
production tenant, subject to per-item human approval at promotion time):

- Tenant slug (`mame-to-cha`) and logical location code(s).
- Module configuration (which modules/entitlements are enabled).
- Shift-type codes/definitions (labels, times).
- Approved recipes/manuals, if the client wants them carried over.
- An approved future schedule, **only if explicitly requested** by the
  client — not copied by default.

**Denylist** (must never be promoted/copied wholesale):

- Synthetic/test attendance rows created only to demonstrate the product.
- Test correction requests created for acceptance walkthroughs.
- Draft test shifts.
- Fake/preview Auth users.
- Passwords.
- Sessions.
- Audit logs from the preview tenant.
- Dev/preview UUIDs (the preview tenant's `core.tenants.id`, location IDs,
  employee IDs — production gets its own new rows, Section D "acceptance
  and production tenant UUIDs may differ").
- Any full-schema or full-database clone/dump of the preview tenant into
  production.

Promotion is a manifest-to-manifest, allowlist-scoped operation (a new,
separately approved production manifest referencing the same logical
slug/codes), not a copy of preview's live rows (Correction 18/19). The
Cloud-dev acceptance tenant is never turned into the production tenant;
production is re-provisioned from an approved logical manifest, and UUIDs,
Auth users, sessions, and secrets are expected to differ.

## O. Verification matrix

| Check | Method |
| --- | --- |
| Host rewrite overrides public `/mame-to-cha` only on `preview.oruwa.jp` | Manual/E2E: request `preview.oruwa.jp/mame-to-cha` → internal preview shell; request the same path on any other host → unchanged public demo page. |
| Public demo remains unchanged on other hosts | Regression check on `/mame-to-cha` and `/demo/cafe` content/behavior after the rewrite ships — no diff expected. |
| Tenant slug resolves only through current-user memberships | Unit/integration test on the resolver (Section F1/G2): a user with no `mame-to-cha` membership never receives a `mame-to-cha` tenant context, regardless of any cookie value. |
| Unknown/foreign slug is denied neutrally | Call the resolver with a slug the user has no membership for → neutral "no access", not an error that reveals whether the tenant exists. |
| Active-tenant cookie cannot change preview reads | Set `lbo_active_tenant_id` to a different (valid, own) tenant's UUID, then load a preview page → still resolves to `mame-to-cha` via membership lookup, cookie ignored. |
| Active-tenant cookie cannot change preview writes | Same cookie manipulation, then submit a preview form → the action still pins to `mame-to-cha` via `resolvePreviewTenantContext`, not the cookie. |
| Dashboard behavior remains unchanged | Existing `/dashboard/workforce/*` pages and actions (no `tenantSlug` argument) behave identically before/after this change — regression suite over existing Workforce dashboard flows. |
| Unsafe `returnTo` is rejected | Attempt `returnTo=https://evil.example`, `returnTo=//evil.example`, `returnTo=/some/unrelated/path` → all rejected, falls back to `/dashboard`. |
| Manager/staff role-negative cases | A staff Auth user cannot reach manager-only actions/pages; a manager Auth user without a `workforce.employees` binding sees "no profile" on the staff view, not another employee's data. |
| Ambiguous location fails closed | Tenant with zero or 2+ active locations → manager preview shows an explicit blocked/selection-needed state, never a silently-picked location (Section F2). |
| Tenant exists, correct `kind` | Read-only query against `core.tenants`, scoped by manifest slug. |
| Module enabled | Read-only query against `core.tenant_modules` / `api.my_tenant_modules`. |
| Staff membership + employee binding | `api.workforce_my_staff_profile` returns exactly one row for the staff Auth user; confirms the F2 four-way match. |
| Internal schemas remain unexposed | Confirm no new Data-API-exposed schema was added (ADR 0009 rule 8) — migration-diff review, not applicable until a later slice adds any facade objects. |
| No `service_role` in `apps/web` | Code-review grep for `createServiceClient`/`SUPABASE_SERVICE_ROLE_KEY` under `apps/web` — expected: zero matches, unchanged by this plan. |
| Audit rows recorded | Confirm `writeAudit` rows exist for each onboarding step (Section M, steps 2–8). |

## P. Implementation slices (Correction 20)

| Slice | Content |
| --- | --- |
| **A** | Architecture/runbook documentation (this document). No code, no Cloud. |
| **B1** | Host routing (`next.config.ts` `beforeFiles` rewrite, Decision D.3) + preview **read** shell (Section D.4/E/F1/F2). Pages render; no new/changed Server Actions yet. |
| **B2** | Explicit tenant pinning for **writes** (Section G/H) — shared action resolver, preview-safe wrappers for the mutation list in Section G3. |
| **C** | Local onboarding rehearsal (Section M, step 0) using the existing local-only `db:onboard-tenant` tool, unmodified. |
| **D** | Cloud acceptance onboarding + Auth user creation (Section M, steps 1–10), each step separately approved. |
| **E** | Browser/RLS smoke testing against the live acceptance environment (Section O's manual/E2E checks). |
| **F** | Production pre-staging and Phase 1N-4D planning (Section Q). |

Each slice is separately scoped and separately approved; this document
does not pre-approve B1 through F.

## Q. Environment recommendation (Correction 17)

**Acceptance:**

- Same repository, same Vercel project where practical (no per-client
  fork/repo, consistent with `.cursor/rules/00-project-architecture.mdc`).
- `preview.oruwa.jp` is assigned to the long-lived `dev` **Preview**
  deployment (a Vercel Preview deployment tracking the `dev` branch, not a
  one-off PR preview).
- That Preview deployment's environment variables point at the existing
  Supabase Cloud dev/acceptance project — the same project already used
  for `dev`-branch Preview verification (see
  [phase-1m-cafe-workforce-smoke-closeout.md](docs/phase-1m-cafe-workforce-smoke-closeout.md)'s
  "Vercel dev Preview + Supabase Cloud dev" precedent).

**Production:**

- `app.oruwa.jp` is assigned to the Vercel **Production** deployment.
- A **separate** Supabase production project (not the Cloud dev/acceptance
  project used above) — this is what makes Correction 18's "production is
  re-provisioned, not promoted from acceptance" concrete at the
  infrastructure level, not just the data level.
- Production infrastructure (Supabase project, env vars, domain) is
  pre-staged ahead of client approval (Section R), so that once approval
  is granted, launch can plausibly land in a 1–2 hour window.

**Noted, not adopted as the default:**

- Vercel **Custom Environments** could model acceptance/production as
  first-class distinct environments beyond the built-in
  Preview/Production split, but this may require a paid Vercel plan tier
  — flagged as optional, not assumed available.
- A **separate Vercel project** dedicated to acceptance is a **fallback**
  if the single-project/host-based-rewrite approach (Section D.3) proves
  insufficient — it is not the default plan and is not pursued unless the
  default approach hits a concrete blocker.

## R. Production readiness prerequisites for Phase 1N-4D

To support a 1–2 hour launch target after client approval, the following
should exist in a *ready* (not necessarily wired-live) state before
go/no-go:

- A documented, reviewed production onboarding runbook analogous to
  Section M, adapted for `kind = 'client'` tenants in the **separate**
  production Supabase project (Section Q), per
  [phase-1h-stage-5a-real-customer-onboarding-design.md](docs/phase-1h-stage-5a-real-customer-onboarding-design.md)
  §9's verification checklist.
- Confirmed production Supabase project provisioned (or a concrete plan
  and owner for provisioning it) — separate from the Cloud dev/acceptance
  project.
- A backup/restore procedure specifically confirmed for the production
  target, per 1H Stage 5A §8.
- A privacy/legal review path for real customer PII (owner email, staff
  names) completed or scheduled, per 1H Stage 5A §6.
- A named approver for each production approval-gate category (Section
  M's step-by-step gates, scaled to production).
- `app.oruwa.jp` DNS ownership and Vercel domain binding, confirmed
  separately from `preview.oruwa.jp` (Open Decision O1).

None of these prerequisites are created or executed by this Slice A
document — they are listed so Phase 1N-4D has a concrete starting punch
list.

## S. Client go/no-go checklist

- [ ] Manifest (Section L) reviewed and approved.
- [ ] Local onboarding rehearsal (Section M, step 0) completed cleanly.
- [ ] Cloud onboarding runbook (Section M, steps 1–10) executed by a
      human, every write step approved individually.
- [ ] Verification matrix (Section O) passed in full.
- [ ] Manager can sign in and reach `preview.oruwa.jp/mame-to-cha/manager`,
      seeing only Mame To Cha data.
- [ ] Staff can sign in and reach
      `preview.oruwa.jp/mame-to-cha/staff`, seeing only their own data.
- [ ] Recipes/recipe detail render correctly for the acceptance tenant.
- [ ] No unexplained cross-tenant data appears anywhere in the preview.
- [ ] Read and write tenant resolution both verified independent of the
      `lbo_active_tenant_id` cookie (Section O).
- [ ] Client has reviewed and explicitly signed off on the acceptance data
      (Section K) shown during the walkthrough.
- [ ] Promotion allowlist (Section N) has been discussed and agreed with
      the client (what carries over vs. what is preview-only).
- [ ] Production pre-staging (Section R) is on track or complete.
- [ ] Open decisions (Section T) below are resolved or explicitly deferred
      with owner sign-off.

## T. Open decisions requiring owner approval

- **O1. Domain/DNS.** `demo.oruwa.jp`, `preview.oruwa.jp`, `app.oruwa.jp`
  — confirm these domains are owned and available for DNS/Vercel-domain
  binding. Not performed by this plan. Narrowed by Section V: resolved for
  `demo.oruwa.jp`; still open for `preview.oruwa.jp` and `app.oruwa.jp`.
- ~~**O2. Exact role naming.**~~ **Resolved.** The `core` RBAC role keys
  are `manager` and `employee`, confirmed directly from
  `supabase/migrations/0008_rbac_seed.sql` (`core.roles.key` values). The
  manifest (Section L) uses these exact strings.
- **O3. Acceptance data source.** Whether acceptance data (Section K,
  middle row) is client-provided real data or synthetic/placeholder data
  for the initial review — affects what needs client sign-off before
  display.
- **O4. Auth user creation mechanics.** Exact process for creating the two
  acceptance Auth users (Supabase dashboard vs. Admin API vs. other) —
  intentionally not chosen here, since Auth user creation is forbidden in
  this slice.
- **O5. Production infrastructure ownership/timeline.** Who owns
  provisioning the separate production Supabase project and `app.oruwa.jp`
  binding (Section R), and by when.
- ~~**O6. Manifest file location/format.**~~ **Resolved.** Committed
  manifests are YAML under `docs/onboarding/`; the first manifest for this
  phase is `docs/onboarding/mame-to-cha-acceptance.manifest.yaml` (Section
  L), created at Slice C, not by this Slice A document.
- **O7. Vercel environment model.** Whether to adopt Vercel Custom
  Environments (if plan tier allows) versus the default long-lived
  Preview-deployment approach (Section Q) — a cost/complexity tradeoff for
  the account owner, not an architecture question this document can
  resolve.

## V. Domain status (confirmed, not an open decision)

`demo.oruwa.jp` is resolved and is no longer tracked as an open decision.
This section supersedes any framing elsewhere in this document that treats
`demo.oruwa.jp` as pending DNS/Vercel work.

- **`demo.oruwa.jp/cafe/*` is already configured and working.** It serves
  the existing public, unauthenticated, client-side-only demo (Section
  B10/C) — mock data only, no DB access. No further DNS/Vercel work is
  required for this host.
- **`preview.oruwa.jp` still requires its own later DNS/Vercel
  configuration** — unchanged from Section C/T (Open Decision O1 remains
  open for `preview.oruwa.jp` and `app.oruwa.jp` specifically, not for
  `demo.oruwa.jp`).
- **`app.oruwa.jp` remains Phase 1N-4D production work** — unchanged from
  Section C/Q/R.

Open Decision O1 (Section T) is narrowed accordingly: it now covers only
`preview.oruwa.jp` and `app.oruwa.jp` DNS/Vercel-domain binding.

## W. Modular product architecture — Phase 1N-4C implications

Mame To Cha has already approved the current product. This section exists
because the client may request additional capabilities after reviewing
this DB-backed preview. The **general** decision — the three-level
module/capability/configuration model, the mandatory request-classification
taxonomy, the prohibition on tenant-slug-literal branching, module safety
rules, and the module rollout lifecycle — is governed project-wide by
[ADR 0010](docs/adr/0010-modular-product-governance-and-client-request-classification.md)
and is **not** restated here. This section documents only what is specific
to Phase 1N-4C and the current Workforce implementation: the concrete
module matrix, verified current schema facts, a confirmed security gap,
and this phase's enforcement plan.

### W1. Mame To Cha module matrix for Phase 1N-4C

**Enabled:**

- `core`
- `workforce`

**Workforce capabilities in scope for this preview:**

- staff
- scheduling
- attendance
- correction requests
- recipes/manuals

**Disabled/out of scope for this preview:**

- `booking`
- `crm`
- `logistics`
- `inventory`
- `ai`
- billing (module writes, Section W3 — not applicable to a preview
  tenant)
- LINE/LIFF (Section G3 already excludes `bindEmployeeLineUser`/
  `unbindEmployeeLineUser` from this phase's Server Action list)

This matrix is what Section M step 4 (`core.tenant_modules` enable) and
Section O's "module enabled" check verify against.

### W2. Existing module architecture (verified current state)

Confirmed directly from migrations, not proposed:

- `core.tenant_modules` (`0002_core_tables.sql`) has `tenant_id`,
  `module` (`core.module_code`), `is_enabled`, `config` (`jsonb`), and a
  `unique (tenant_id, module)` constraint (Section B6).
- `api.my_tenant_modules` (`0017_api_tenant_dashboard_facade.sql`) is
  `security_invoker`, filters to the caller's active memberships only,
  and is read-only — no `insert`/`update`/`delete` grant exists on the
  view, only `select` to `authenticated` (`grant select on
  api.my_tenant_modules to authenticated`), revoked from `anon`/`public`.
- Module `config` is **not** exposed through `api.my_tenant_modules` — the
  view returns only `tenant_id, module, is_enabled` (confirmed above),
  never `config`. No other current-app-facing facade exposes it either.
- Tenant module writes require `core.billing.manage`
  (`tenant_modules_write` RLS policy, `0007_rls_policies.sql`: `for all
  using (core.has_permission(tenant_id, 'core.billing.manage')) with
  check (...)`).
- Per the RBAC seed (`0008_rbac_seed.sql`), `manager` and `employee`
  system roles are **not** granted `core.billing.manage` — only
  `tenant_owner` (all permissions) and, implicitly, platform staff via
  `core.is_platform_staff()` inside `core.has_permission` can write
  `core.tenant_modules`. **Manager and employee roles must not be able to
  enable product modules, and today's RLS already enforces this** — this
  is a confirmed existing guarantee, not a gap.

### W3. Important current security gap — module gating is not yet a DB kill switch

This is a confirmed finding from reading `core.has_permission`
(`0006_helpers.sql`), documented here so it is never silently assumed
fixed:

```sql
create or replace function core.has_permission(
  p_tenant_id uuid,
  p_permission text,
  p_location_id uuid default null
)
returns boolean
language sql stable security definer set search_path = core, public as $$
  select core.is_platform_staff()
      or exists (
        select 1
        from core.role_assignments ra
        join core.role_permissions rp on rp.role_id = ra.role_id
        where ra.tenant_id = p_tenant_id
          and ra.user_id = core.current_user_id()
          and rp.permission_key = p_permission
          and (ra.location_id is null or ra.location_id = p_location_id)
      );
$$;
```

- `core.has_permission()` checks RBAC tenant/location permission only
  (role assignment → role permission → matching tenant/location).
- **It does not currently require `core.tenant_modules.is_enabled =
  true`.** A user holding, say, `workforce.shift.write` via role
  assignment would pass this check regardless of whether the `workforce`
  row in `core.tenant_modules` for that tenant is enabled.
- **Current module gating is therefore an entitlement/UI/application
  gate, not yet a complete DB-level module kill switch.** The Workforce
  landing page's `tenant_modules.module = 'workforce' AND is_enabled`
  check (Section B6) is real and correct as an app-level gate, but RLS
  itself does not re-derive it.
- **This does not block Phase 1N-4C**, because Workforce will be
  explicitly enabled for the `mame-to-cha` tenant (Section W1/M step 4) —
  there is no disabled-module state to bypass in this phase's scope.
- **It must be addressed before introducing self-service module
  management or launching another top-level product module** (i.e. before
  any tenant-facing or operator-facing UI lets someone toggle
  `core.tenant_modules.is_enabled` outside the current human-run runbook,
  and before `booking`/`crm`/`logistics`/`inventory`/`ai` go live for any
  tenant). Section W5 tracks the future hardening design; **no migration
  is added by this document** to close this gap now.

### W4. Phase 1N-4C module enforcement (preview-scoped, additive to Section G)

Section G already establishes strict, membership-driven tenant resolution
for preview reads and writes. This subsection adds the module-entitlement
recheck on top of that, for the same preview paths, without altering
Section G's tenant-pinning contract:

- Every preview page/route first resolves tenant context **strictly**
  (Section F1) — unchanged.
- Only then does the page verify `workforce` is enabled for the resolved
  tenant, via `api.my_tenant_modules` (Section W2), before loading any
  Workforce data. A disabled-or-missing `workforce` row is treated as "no
  access" (Section D.5 step 5's fail-closed pattern), not skipped.
- Every preview Server Action (Section G3's mutation list) rechecks
  Workforce entitlement, via the same `api.my_tenant_modules` read, **in
  addition to** `resolvePreviewTenantContext` (Section G2) — before
  delegating to the existing service-layer call. Tenant pinning and module
  entitlement are two independent checks; neither substitutes for the
  other.
- No client-supplied flag (form field, query param, header, cookie) can
  enable a module — the entitlement check always reads
  `api.my_tenant_modules` fresh from the resolved tenant, never a value
  passed in from the request.
- RLS remains the tenant/role/location boundary (Section B9); this
  module-entitlement recheck is an additional application-level gate
  layered on top of RLS, not a replacement for it, consistent with
  Section W3's finding that RLS does not yet enforce module state itself.

**Negative tests to add (extends Section O's verification matrix):**

- A tenant member with `workforce` disabled cannot load any preview
  Workforce page (manager, staff, or recipes) — fails closed to "no
  access", not a partial/empty render.
- A tenant member with `workforce` disabled cannot invoke any preview
  Workforce Server Action (Section G3's list) — the action returns a
  failure result before calling the service layer.
- Changing the active-tenant cookie (`lbo_active_tenant_id`) cannot bypass
  module entitlement — same cookie-manipulation test pattern as Section
  O's existing tenant-pinning rows, applied to the module check.
- Enabling another module (e.g. `booking`) for a different tenant does not
  expose that module to Mame To Cha — the entitlement check is scoped to
  the resolved `mame-to-cha` tenant's own `core.tenant_modules` rows only.

### W5. Future module-hardening phase (not part of this implementation)

Module configuration rules, module disable semantics (`disable != delete`),
and the module rollout lifecycle are general, project-wide rules and are
governed by [ADR 0010](docs/adr/0010-modular-product-governance-and-client-request-classification.md)
Parts F and G — not restated here. This subsection keeps only the
concrete, code-level candidate design tied to the Section W3 gap finding,
since that is specific to this codebase's `core.has_permission()`
implementation rather than general governance.

This is a separate, later architecture track — explicitly not scoped,
designed in detail, or authorized for implementation by this document.
Listed here only so Section W3's gap has a named follow-up.

**Candidate design:**

- A new helper, e.g. `core.is_module_enabled(tenant_id, module)`, reading
  `core.tenant_modules.is_enabled` for the given tenant/module.
- DB-level module enforcement, via one of two shapes:
  - **Option A:** call `core.is_module_enabled()` explicitly inside every
    module-scoped RLS policy (Workforce, and any future Booking/CRM/
    Logistics/Inventory/AI policies), alongside the existing
    `core.has_permission()` check.
  - **Option B:** fold the module check centrally into a module-aware
    permission helper (e.g. `core.has_permission()` itself gains an
    implicit module-enabled check derived from the permission's `module`
    column in `core.permissions`), so every existing call site inherits
    the check without being individually edited.
- **The central helper option (B) is likely preferable** — it avoids
  having to audit and edit every existing and future RLS policy
  individually — **but requires a dedicated design/review because it
  affects all current policies and permissions platform-wide**, not just
  Workforce. This is a meaningfully larger blast radius than anything in
  Phase 1N-4C and must not be bundled into this phase's slices.

**Required verification for that future phase** (once designed): own
tenant, cross tenant, enabled module, disabled module, wrong role, wrong
location, anon, no JWT, platform staff, and a full regression pass for
Workforce, Booking, and AI (Booking/AI chosen because they are the
nearest-term candidate modules after Workforce, per current product
direction — regression scope to be reconfirmed at design time).

### W6. Module administration for Phase 1N-4C

For the first client (Mame To Cha), Phase 1N-4C, and its near-term
follow-ons — the general module-administration rules (approval gates,
audit, no self-service enablement, `disable != delete`) are governed by
[ADR 0010](docs/adr/0010-modular-product-governance-and-client-request-classification.md)
Part F/H; this is the phase-specific application:

- Modules are enabled by an ORUWA operator through the approval-gated
  runbook (Section M) — there is no other enable path today.
- No client-facing self-service module enablement.
- No billing automation.
- Module enable/disable is security- and commercial-impacting (Section
  W2's `core.billing.manage` requirement) and requires audit, consistent
  with Section M step 9's existing `writeAudit` convention.
