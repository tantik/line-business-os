# Phase 1L-5A Closeout — Workforce Recipes UI

## Summary

PR #87 merged into `dev` (merge commit `dfad872`, implementation commit
`cc9106e`), adding a read-only Workforce Recipes UI per
[`phase-1l-5-workforce-app-api-integration-plan.md`](phase-1l-5-workforce-app-api-integration-plan.md).

## What shipped

- Routes: `/dashboard/workforce`, `/dashboard/workforce/recipes`,
  `/dashboard/workforce/recipes/[recipeId]`.
- Workforce recipe data loaders and tests, reading `api.workforce_*` facade
  views.
- Dashboard Workforce nav card, gated by the workforce module.
- Shared `ModuleUnavailableState` and `NotFoundState` components.

## Out of scope (confirmed not touched)

- No `service_role` usage in `apps/web`.
- No `apps/api` endpoints.
- No writes, forms, or mutating Server Actions.
- No schema/RLS/migration changes.
- No Supabase Cloud commands.
- No production actions.

## PR verification

- `typecheck` — passed.
- `lint` — passed.
- `test` — 143/143 passed.
- `build` — passed.

## Local cleanup

- `dev` synced to `dfad872`.
- Feature branch deleted locally; remote feature branch pruned.
- Hidden Unicode checks clean.

## Manual browser smoke

- Local app connected to Cloud dev Supabase via `apps/web/.env.local`.
- `/dashboard` opened correctly; active tenant was Smoke Tenant B
  (Modules total 0 / enabled 0), so the Workforce card showed not enabled.
- `/dashboard/workforce`, `/dashboard/workforce/recipes`, and
  `/dashboard/workforce/recipes/non-existent-recipe-id` all rendered
  `Feature unavailable` / `ModuleUnavailableState` — confirming the module
  entitlement guard works.
- Full recipe-data smoke was **not** performed: the active Cloud dev tenant
  did not have the workforce module enabled, and no Cloud data changes were
  made to enable it.

## Next recommended step

**Phase 1L-5B — my staff profile card**, or a separate controlled Cloud-dev
smoke seed first if full recipe-data smoke is required before 1L-5B.
