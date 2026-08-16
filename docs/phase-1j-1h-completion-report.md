# Phase 1J-1H Completion Report — Auth-Boundary Local E2E Smoke

## Executive summary

Phase 1J-1H closed out the apps/api auth-boundary spike (1J-1C through 1J-1G)
with an end-to-end local smoke test: a real local Supabase instance, a real
local auth user, a gated local onboarding commit, and a browser walkthrough of
`/dashboard` and a new `/dashboard/auth-boundary-smoke` page that calls
`apps/api` server-side. Two PRs landed: the web-side smoke page (PR #70) and a
local-runtime fix for `apps/api` needed to actually run it (PR #71). No
migrations, no Cloud writes, no auth-boundary/RLS/permission logic changes.

## Status summary

- Phase 1J-1H: **complete**.
- Branch: `dev`.
- Latest local `dev` commit: `f501e47` — merge of PR #71
  (`fix/apps-api-express-runtime-dependency`).
- Working tree: clean at completion (`git status --short` empty).

Recent history (newest first):

- `f501e47` Merge PR #71 (`fix(api): make local runtime resolve workspace
  TypeScript`)
- `64f0b4c` fix(api): make local runtime resolve workspace TypeScript
- `817806a` Merge PR #70 (`feat(web): add auth-boundary smoke page`)
- `b962529` feat(web): add auth-boundary smoke page
- `bd7e07c` Merge PR #69 (`feat(api): add auth-boundary test endpoint`)

## What Phase 1J-1H delivered

- **PR #70 — web auth-boundary smoke page.** Added a protected page at
  `/dashboard/auth-boundary-smoke` and a server-side `apps/web` caller into
  `apps/api`. No migrations. No `apps/api` changes in this PR. No
  `service_role` on the frontend. No `NEXT_PUBLIC` API internal URL — the
  server-side caller does not expose the internal API address to the browser.
- **PR #71 — apps/api local runtime fix.** Fixed local execution of
  `apps/api` so the smoke test above could actually run:
  - `start` now runs `tsx dist/main.js` instead of plain `node dist/main.js`.
  - `express` aligned to the Express 4 line that `@nestjs/platform-express`
    10.x actually bundles (was drifting toward an incompatible Express 5 pin).
  - `tsx` added as the local runtime loader that resolves workspace package
    `.ts` exports (`packages/core`, `packages/config`, etc.), which Node's
    built-in TypeScript stripping cannot handle for all syntax.
  - `apps/api/tsconfig.build.json` sets `incremental: false` to prevent stale
    `tsconfig.build.tsbuildinfo` from causing `dist/main.js` to be missing after
    `nest build` deletes `dist/`.
  - No auth-boundary logic changes. No Supabase migrations. No Cloud changes.

## What was verified locally

Local Supabase only. No Cloud Supabase involved at any step.

1. A local Supabase instance was started and a local auth user was created.
2. A gated local onboarding commit was produced:
   - tenant: Local Smoke Tenant
   - slug: `local-smoke-tenant`
   - location: Main Store
   - modules: `core`, `workforce`
   - membership count: 1
   - commit result: 7 change(s), 8 audit row(s)
   - Cloud was not touched.
3. `/dashboard` rendered:
   - Active tenant: Local Smoke Tenant
   - slug: `local-smoke-tenant`
   - location: Main Store
   - `core`/`workforce` enabled
4. `/dashboard/auth-boundary-smoke` rendered:
   - status: `ok`
   - permission checked: `core.audit.read`
   - tenant: `local-smoke-tenant`

This confirms the full local path — local Supabase auth → tenant/module
context → `apps/web` server-side call into `apps/api` → apps/api auth-boundary
check via the `api.has_permission` facade — works end-to-end for a real local
tenant, with `apps/api` actually runnable after the PR #71 fix.

## Runtime fix note (PR #71)

Before PR #71, `apps/api` could not run locally at all:

- `pnpm --filter @line-os/api start` failed with `Cannot find module
  'express'` (added as a direct dependency to fix).
- After adding `express`, a clean build was sometimes producing no
  `dist/main.js` because a stale `tsconfig.build.tsbuildinfo` outside `dist/`
  survived `nest build`'s `deleteOutDir` clean and made `tsc` skip emitting
  files it believed were already up to date.
- After a clean build, `node dist/main.js` failed with
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` the moment it imported a workspace
  package (e.g. `@line-os/core/permissions`), because those packages export
  raw `.ts` source and Node's native type-stripping cannot transform
  TypeScript parameter properties.

The fix keeps `nest build` (real `tsc`) as the compiler for `apps/api`'s own
source — so Nest's decorator metadata stays on the officially-supported path —
and only uses `tsx` as the runtime loader for the residual workspace-package
`.ts` imports, matching the convention already used by `packages/db`,
`packages/line`, and `packages/config` for their own scripts/tests. No
`packages/*` export was touched.

## Security confirmations

- No `service_role` usage on the `apps/web` frontend at any point in this
  phase.
- No `NEXT_PUBLIC` exposure of the internal `apps/api` address.
- The `apps/api` auth-boundary check continues to derive tenant context from
  membership and enforce permission via `api.has_permission`; this phase did
  not change that logic.
- No migrations were created, edited, or applied. No Supabase Cloud settings
  were changed. No Cloud writes occurred — all smoke verification used a
  local Supabase instance and a local onboarding commit.
- No secrets, credentials, project URLs, JWTs, DB URLs, passwords, or user
  UUIDs are recorded in this report.

## Dashboard ownership clarification

This phase's smoke test surfaced an architecture point worth recording
explicitly before more screens are added under `/dashboard`:

- **`/dashboard` is the tenant-scoped customer/client admin dashboard.** It is
  what a tenant's own members (owners, staff) see for their own tenant,
  location, and enabled modules. It is **not** an internal SaaS
  owner/operator admin panel.
- Future internal platform/operator tooling (cross-tenant visibility,
  platform-wide operations, support/ops workflows) should live in a
  **separate area** — for example `/platform` or `/ops` — not under
  `/dashboard`.
- Client/tenant users must only ever see their own tenant/location/module
  data. Internal platform/operator features must stay architecturally
  separate from tenant-facing dashboard features, including route namespace,
  auth checks, and any future RBAC distinction between "tenant member" and
  "platform operator."
- This is a naming/placement clarification for future work, not a change to
  any existing route, permission, or RLS behavior in this phase.

See also the note added to
[`architecture/overview.md`](./architecture/overview.md).

## Out of scope / not built

- Any Cloud Supabase deployment or Cloud E2E test — this phase used local
  Supabase only.
- Any production deployment.
- Any database migration or schema change.
- Any refactor of `packages/*` build/exports.
- Any internal platform/operator admin surface (`/platform` or `/ops`) — this
  phase only documents that it should be separate from `/dashboard`, it does
  not build it.
- Any change to auth-boundary, RLS, permission, tenant isolation, billing, or
  LINE logic.

## Recommended next steps

1. **Optional cleanup PR** — a hidden/bidirectional Unicode character scan and
   cleanup pass, if the project's standard scan finds anything, before further
   phases build on this branch.
2. **Start the next Workforce MVP vertical slice** — build on the now-working
   local `apps/api` runtime and the confirmed auth-boundary path to implement
   the first real Workforce feature behind the existing permission facade.
3. **Design the internal platform admin area separately**, later — a
   plan-only design (in the style of the 1J-1C/1J-1D/1J-1E spike docs) for
   `/platform` or `/ops`, kept architecturally distinct from the tenant
   `/dashboard`, before any implementation.

## What was intentionally not done by this report

- Documentation only: no app code, tests, `package.json`, `pnpm-lock.yaml`, or
  migrations were modified in producing this report.
- No Cloud writes, Cloud setting changes, Supabase CLI commands against
  Cloud, or production deploy actions were performed.
- No auth-boundary, RLS, permission, tenant isolation, billing, or LINE logic
  was changed.
- No secrets, passwords, tokens, project URLs, JWTs, DB URLs, or user/auth
  IDs are included here.
