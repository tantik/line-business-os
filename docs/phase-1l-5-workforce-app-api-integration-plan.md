# Phase 1L-5 — Workforce App/API Integration Plan

Status: **Planning only.** No app code, routes, components, tests, migrations, or Supabase
config were created or changed as part of producing this document. Nothing described below
has been implemented yet.

Read with:

- [`phase-1l-0-workforce-mvp-slice-plan.md`](./phase-1l-0-workforce-mvp-slice-plan.md)
- [`phase-1l-4-cloud-dev-sync-completion-report.md`](./phase-1l-4-cloud-dev-sync-completion-report.md)
- [`product/mvp-roadmap.md`](./product/mvp-roadmap.md)
- [`architecture/workforce-rls-security-plan.md`](./architecture/workforce-rls-security-plan.md)
- [`architecture/workforce-data-model.md`](./architecture/workforce-data-model.md)

## 1. Summary

This document plans the first application/API integration for the Workforce staff-profile
and recipe facade views delivered in Phases 1L-1 through 1L-4. It defines an approved first
implementation PR, **1L-5A — read-only Recipes UI**, plus an approved follow-up (**1L-5B —
My staff profile card**) and an explicitly deferred item (staff directory). Reads use Next.js
Server Components against the existing `api.workforce_*` facade views through the Supabase
server client; there are no writes, no new `apps/api` endpoints, and no schema/RLS/migration
changes in this phase. Route placement is under the existing protected dashboard
(`/dashboard/workforce/*`), reusing the current auth boundary without modifying it.

## 2. Current baseline

- Local and Cloud dev (`line-business-os-dev`) are both synced through migration `0023`, per
  [`phase-1l-4-cloud-dev-sync-completion-report.md`](./phase-1l-4-cloud-dev-sync-completion-report.md).
  Anonymous REST access to the `workforce` schema and to all 7 `api.workforce_*` facade views
  is confirmed denied in Cloud dev. Authenticated (JWT) REST verification was **not**
  performed in 1L-4 — only anonymous.
- Migration history relevant to this phase: `0009_workforce.sql` (base schema) →
  `0020_workforce_staff_profile_extension.sql` (Phase 1L-1, staff profile columns + `staff.*`
  permissions) → `0021_workforce_recipes.sql` (Phase 1L-1, recipe tables + `recipe.*`
  permissions, RLS enabled but no policies) → `0022_workforce_staff_recipes_rls_policies.sql`
  (Phase 1L-2, RLS policies) → `0023_workforce_api_facade.sql` (Phase 1L-3, the 7
  `api.workforce_*` views).
- No app/frontend/API code has touched Workforce staff profiles or recipes yet.
  `apps/web/src/app/workforce/page.tsx` is a pre-existing, unrelated placeholder route: it
  sits outside the `(protected)` auth boundary (no auth enforced on it today) and corresponds
  to `WORKFORCE_ROUTES` in `packages/workforce` (`/workforce`, `/workforce/manager`,
  `/workforce/shifts`), which is the older shift-scheduling vertical from the Phase 1J
  cafe-shift-demo lineage. It is a different feature from the staff-profile/recipe slice
  built in 1L-1 through 1L-4 and is not reused, extended, or modified by this plan.

## 3. Approved route placement

Routes for this feature live under the existing protected dashboard boundary:
`apps/web/src/app/(protected)/dashboard/workforce/**`, resolving to `/dashboard/workforce/*`
URLs — **not** the top-level `/workforce/*` path.

This reuses `apps/web/src/app/(protected)/layout.tsx`'s existing `requireUser()` auth check
by nesting inside it; the layout itself is not modified. It also avoids any collision with
the unrelated legacy `/workforce` placeholder described in Section 2.

## 4. Approved first slice: 1L-5A — read-only Recipes UI

1L-5A is the first implementation PR for this phase. Scope:

- `/dashboard/workforce` — landing page for the Workforce area.
- `/dashboard/workforce/recipes` — recipe list, grouped by category.
- `/dashboard/workforce/recipes/[recipeId]` — recipe detail (ingredients, steps, notes).
- `lib/workforce` data loaders for recipe categories, recipes, and recipe detail, reading
  `api.workforce_recipe_categories`, `api.workforce_recipes`, `api.workforce_recipe_ingredients`,
  `api.workforce_recipe_steps`, `api.workforce_recipe_notes`.
- A nav link into `/dashboard/workforce`, gated by the tenant's existing `workforce` module
  status.
- Tests for the new data loaders.

Recipes were chosen as the first slice because `workforce.recipe.read` is granted to the
**employee** role by default (owner/admin/manager additionally get `recipe.manage` and
`recipe.publish`), per the role/permission seed in `0021_workforce_recipes.sql`. Published
recipes are therefore visible to essentially any staff member, not only managers, making this
the broadest-audience, lowest-friction slice to ship first, with no PII or display-name
dependency.

## 5. Follow-up slice: 1L-5B — My staff profile card

Approved as a follow-up implementation PR after 1L-5A, not part of it. Scope: a small card
(likely on `/dashboard/workforce`) reading `api.workforce_my_staff_profile` — the caller's own
staff row, available via a self-read RLS policy independent of any `staff.*` permission grant
— showing `position_label`, `location_id`, `employment_type`, and `is_active`. No name is
shown (see Section 6).

## 6. Deferred: staff directory

`/dashboard/workforce/staff` (a directory of other staff members, via
`api.workforce_staff_directory`) is **not scheduled** as part of 1L-5A or 1L-5B, and is not
assigned a sub-phase letter. It remains deferred until staff display-name resolution is
separately designed and approved. Two independent facts motivate deferring it rather than
shipping it now:

- `workforce.staff.read` (required to see the directory view's rows at all) is granted only
  to the owner/admin/manager roles — the employee role gets neither `staff.read` nor
  `staff.manage`, per `0020_workforce_staff_profile_extension.sql`. The directory would only
  ever be reachable by managers and above.
- Neither `api.workforce_my_staff_profile` nor `api.workforce_staff_directory` exposes any
  display-name column — confirmed directly in `0023_workforce_api_facade.sql`, whose header
  comment states PII is never selected by any view. Columns exposed by both views are limited
  to `staff_id, tenant_id, location_id, position_label, employment_type, is_active,
  created_at`. A directory of otherwise-anonymous rows has low practical value and risks
  being mistaken for a bug. No decrypt-on-read or alternate name source is designed or
  invented by this plan.

## 7. Data access architecture

- Reads use **Next.js Server Components** and the existing Supabase **server** client
  (`apps/web/src/lib/supabase/server.ts`, anon key, cookie-based session) queried against
  `.schema('api')` — the same mechanism already used by `apps/web/src/lib/tenant/locations.ts`,
  `admin-members.ts`, and `modules.ts`. No client components, no Server Actions, no new route
  handlers, and no `apps/api` (NestJS) endpoints are added in 1L-5A. `apps/api` remains
  reserved for Workforce **writes** (service-role mutation + audit), consistent with
  [`phase-1l-0-workforce-mvp-slice-plan.md`](./phase-1l-0-workforce-mvp-slice-plan.md); there
  are no writes in this phase.
- `service_role` is not introduced into `apps/web` at any point in this phase.
- Each data loader follows the existing `lib/tenant/*` convention: an explicit column
  `select(...)` list (never `select('*')`), a private snake_case row interface mapped to a
  camelCase domain interface, and tenant context resolved via `requireTenantContext()` before
  querying.
- No Zod schemas, no Supabase-generated `database.types.ts`, and no changes to
  `packages/workforce` (which currently covers the unrelated shift/schedule domain) are
  introduced in this phase.

## 8. Tenant/location behavior

- **Tenant**: `requireTenantContext()` is called first to resolve `activeTenant.tenantId`.
  Queries use `activeTenant.tenantId` to narrow results by a `tenant_id` filter where
  practical (either as a Postgrest `.eq('tenant_id', ...)` predicate or an in-memory filter on
  the returned rows, matching the existing pattern in `dashboard/page.tsx`). This is a display
  narrowing, not the security boundary — **RLS on the underlying `api.workforce_*` views
  remains the actual tenant-isolation mechanism**, and the defensive filter does not replace
  it.
- **Location**: no location filter UI in this phase. Visibility across locations is left
  entirely to the existing RLS policies from `0022_workforce_staff_recipes_rls_policies.sql`
  (tenant-wide vs. location-scoped recipe visibility already implemented at the database
  layer).

## 9. Empty/error states

`api.workforce_*` views are RLS-**filtering**, not permission-**rejecting**: Postgres returns
an empty result set, not an error, when a caller lacks the relevant permission or when nothing
matches (e.g. no published recipes yet). The application layer cannot distinguish "no
permission" from "nothing to show" at the query layer, and this plan does not attempt to.

- Empty recipe categories/recipes: a neutral empty-state message per list (e.g. "No recipes
  available yet"), reusing the existing safe-state component conventions in
  `apps/web/src/components/states.tsx` (`NoTenantState`, `UnauthorizedState`, etc.) as a
  pattern to follow, without asserting a specific reason.
- Missing staff profile row (relevant to 1L-5B): a neutral "no staff profile" state, same
  treatment.
- Query/network errors: the existing generic `ErrorState` convention (no raw internal error
  text surfaced to users).
- Tenant-context failures (`no_membership`/`unauthorized`/`config_error`): handled the same
  way the existing dashboard pages already handle them, via the existing
  `requireTenantContext()` result union.

## 10. Files likely to change in 1L-5A

Listed for future implementation reference; none of these have been created or modified by
this planning document.

- `apps/web/src/app/(protected)/dashboard/workforce/page.tsx`
- `apps/web/src/app/(protected)/dashboard/workforce/recipes/page.tsx`
- `apps/web/src/app/(protected)/dashboard/workforce/recipes/[recipeId]/page.tsx`
- `apps/web/src/lib/workforce/recipe-categories.ts`
- `apps/web/src/lib/workforce/recipes.ts`
- `apps/web/src/lib/workforce/recipe-categories.test.ts`
- `apps/web/src/lib/workforce/recipes.test.ts`
- `apps/web/src/app/(protected)/dashboard/page.tsx` — nav link addition, gated on existing
  tenant module status
- `apps/web/package.json` — new test files appended to the explicit `test` script string
- `apps/web/src/components/states.tsx` — only if a new empty-state variant is needed beyond
  the existing set

## 11. Tests and verification

Planned for the 1L-5A implementation PR, not run as part of this planning document:

- `pnpm --filter @line-os/web typecheck`
- `pnpm --filter @line-os/web lint`
- `pnpm --filter @line-os/web test` (after the new loader test files are added to the
  explicit test script string in `apps/web/package.json`)
- `pnpm --filter @line-os/web build`
- No new pgTAP tests are needed — no schema or RLS changes in this phase; existing
  `supabase/tests/0007`–`0009_workforce_*.sql` remain the source of truth for RLS behavior.
- Manual local smoke test against local Supabase (`pnpm db:reset` with seed data,
  `pnpm --filter @line-os/web dev`).
- Manual smoke test on a **Vercel Preview deployment** (Supabase Cloud dev backing it) after
  the implementation PR is opened, following the same style of manual verification already
  used for prior phases (e.g. the Phase 1I Stage 3D auth smoke test).
- No Supabase Cloud `db push`, `db pull`, migration repair, or production action is planned
  or required for this phase.

## 12. Out of scope

- Any write path: no forms, no mutating Server Actions, no `apps/api` endpoints.
- Staff directory UI (Section 6).
- Location filter UI.
- LINE/LIFF integration.
- Billing integration.
- Any change to `(protected)/layout.tsx`, `requireUser`, or `requireTenantContext` logic.
- Any change to the legacy `/workforce/*` placeholder route or `packages/workforce`'s
  shift/schedule domain types.
- Supabase-generated `database.types.ts` / codegen.
- Any Supabase Cloud command (`db push`, `db pull`, `link`, migration repair) or production
  deploy.
- Any schema, RLS, or migration change.

## 13. Risks

- **Empty-state ambiguity is inherent, not a defect to fix**: because RLS filters rather than
  rejects, an empty recipe list can mean no permission, nothing published, or the wrong
  tenant. Acceptable for a read-only MVP; distinguishing these would require additional
  `has_permission`-style checks in a later phase.
- **Defensive tenant filter must not be mistaken for the security boundary.** RLS on the
  underlying views is what actually prevents cross-tenant reads; the in-memory/query
  `tenant_id` narrowing in Section 8 is a display convenience only.
- **Module-gating dependency**: the nav link's gating on the tenant's `workforce` module
  status assumes that status is already seeded/enabled for relevant dev tenants; if not, the
  feature would be reachable only by direct URL, not via nav, until confirmed during
  implementation.
- **No authenticated (JWT) RLS smoke test has been run against Cloud dev for these views**
  (1L-4 verified anonymous-denied only) — the Vercel Preview smoke test in Section 11 is the
  first point at which authenticated behavior against Cloud dev is actually observed for this
  feature.

## 14. Next implementation branch recommendation

Implement 1L-5A on a new branch off `dev`, following the existing one-sub-phase-per-PR
convention used by Phases 1L-1 through 1L-4 (e.g. `feature/phase-1l-3-workforce-api-facade`):

`feature/phase-1l-5a-workforce-recipes-ui`

1L-5B (My staff profile card) is a separate follow-up branch/PR opened after 1L-5A merges,
not part of the same PR.
