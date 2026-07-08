# Phase 1L-4 Completion Report — Cloud Dev Sync

## 1. Title

Phase 1L-4 — Supabase Cloud Dev Sync Completion Report

## 2. Summary

Phase 1L-4 synced the Supabase Cloud dev project (`line-business-os-dev`) to
the Workforce staff-profile/recipe migration state already merged and
verified locally through PR #84 (migrations `0019`–`0023`). The sync was
dry-run reviewed before being applied, applied successfully, and verified
afterward both via `supabase migration list --linked` and via anonymous REST
requests against the Data API. The `workforce` schema and the new
`api.workforce_*` facade views remain unreachable by anonymous requests, and
production was not touched at any point. The Cloud sync execution itself did
not include any repo code, migration, test, app, or config changes: no
migrations, tests, app/frontend/API code, or `supabase/config.toml` were
modified. This report is the docs-only closeout artifact for that execution.

## 3. Scope

In scope:

- Verifying the local baseline (clean working tree, migrations through
  `0023`, local `db reset` + pgTAP + typecheck all passing) before touching
  Cloud.
- Confirming the linked Cloud project identity.
- Running a dry-run `db push` against Cloud dev and reviewing its output.
- Running a real `db push --linked` against Cloud dev after dry-run review.
- Verifying the post-push migration state matches local.
- Verifying anonymous REST/Data API behavior against the `workforce` schema
  and the new `api.workforce_*` facade views.
- Manually checking the Dashboard's exposed-schema configuration for
  `line-business-os-dev`.

Out of scope (see also [Section 12](#12-out-of-scope)): any migration
authoring, any test changes, any app/frontend/API code changes, any
`supabase/config.toml` changes, any production Supabase project, and any
git commit or push.

## 4. Cloud project identity

- The linked Supabase project was confirmed via the CLI project list to be
  **`line-business-os-dev`**.
- The project ref observed in HTTP responses during REST verification was
  **`pehcoenozjtsjdvjietj`**.
- Other projects existed on the account, including
  **`line-app-prod-salon01`**, but the linked marker in the CLI project list
  was on `line-business-os-dev`. Production was not touched at any point in
  this phase.

## 5. Pre-sync migration state

Local baseline before starting the Cloud sync:

- Local dev was synced to the PR #84 merge commit:
  `443647c` — Merge pull request #84 from
  `tantik/feature/phase-1l-3-workforce-api-facade`.
- Cloud sync planning was done on branch `plan/phase-1l-4-cloud-dev-sync`.
- The working tree was clean before the sync began.
- Local migrations existed through `0023`.
- Local verification performed before touching Cloud:
  - `pnpm exec supabase db reset` — passed.
  - `pnpm exec supabase test db --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres`
    — passed.
  - pgTAP result: **Files=9, Tests=354, PASS**.
  - `pnpm typecheck` — passed, 11/11 packages.

Remote (Cloud dev) state before the sync, per
`supabase migration list --linked`: remote applied through `0018`. The
following five local migrations were missing on remote:

- `0019_api_has_permission_facade.sql`
- `0020_workforce_staff_profile_extension.sql`
- `0021_workforce_recipes.sql`
- `0022_workforce_staff_recipes_rls_policies.sql`
- `0023_workforce_api_facade.sql`

## 6. Dry-run result

`pnpm exec supabase db push --dry-run` was run before any real push.

The dry-run showed exactly these 5 migrations would be pushed, in this
order:

- `0019_api_has_permission_facade.sql`
- `0020_workforce_staff_profile_extension.sql`
- `0021_workforce_recipes.sql`
- `0022_workforce_staff_recipes_rls_policies.sql`
- `0023_workforce_api_facade.sql`

No unexpected or additional migrations were shown in the dry-run output.

## 7. Real push result

`pnpm exec supabase db push --linked` was run after the dry-run output was
reviewed and matched expectations.

- Applied migrations (same five, same order as the dry-run):
  - `0019_api_has_permission_facade.sql`
  - `0020_workforce_staff_profile_extension.sql`
  - `0021_workforce_recipes.sql`
  - `0022_workforce_staff_recipes_rls_policies.sql`
  - `0023_workforce_api_facade.sql`
- The command finished successfully.
- During `0021_workforce_recipes.sql`, NOTICE messages appeared for missing
  `set_updated_at` triggers on the following recipe tables (i.e.
  `DROP TRIGGER IF EXISTS` on triggers that did not yet exist on remote):
  - `workforce.recipe_categories`
  - `workforce.recipes`
  - `workforce.recipe_ingredients`
  - `workforce.recipe_steps`
  - `workforce.recipe_notes`
- These NOTICE messages were non-fatal and did not block the migration
  apply; the push completed successfully.

## 8. Post-push migration verification

`pnpm exec supabase migration list --linked` was run again after the push.

- Result: **Local = Remote through `0023`.**

## 9. REST/Data API verification

All checks below were anonymous (anon key), no `service_role` key was used
or printed at any point.

**Internal `workforce` schema check** (`Accept-Profile: workforce`):

- Result: `EXPECTED_DENIED_OR_NOT_EXPOSED`.
- HTTP status: `406`.
- Error code: `PGRST106`.
- Message: `Invalid schema: workforce`.
- The response indicated the only schemas exposed via the Data API were
  `public`, `graphql_public`, and `api`.

**`api.workforce_recipes` check** (`Accept-Profile: api`):

- Result: `EXPECTED_DENIED`.
- HTTP status: `401`.
- Error code: `42501`.
- Message: `permission denied for schema api`.

**All 7 new Workforce API facade views**, looped anonymously:

- `api.workforce_my_staff_profile`
- `api.workforce_staff_directory`
- `api.workforce_recipe_categories`
- `api.workforce_recipes`
- `api.workforce_recipe_ingredients`
- `api.workforce_recipe_steps`
- `api.workforce_recipe_notes`

Every one of the 7 views returned `HTTP_401` for the anonymous request.

## 10. Dashboard exposed-schema verification

A manual check was performed in the Supabase Dashboard, under
`line-business-os-dev` → **Integrations** → **Data API** → **Settings** →
**Exposed schemas**.

- The exact selected exposed schemas were: **`public`, `graphql_public`,
  `api`**.
- This is acceptable for this phase because `workforce`, `core`, `audit`,
  `booking`, and `ai` were not exposed.
- The Dashboard also showed:
  - Exposed tables: **0 of 41** tables exposed.
  - Exposed functions: **34 of 45** functions exposed.
  - **Automatically expose new tables: ON.**
- "Automatically expose new tables" was observed but **not changed** during
  this phase.
- Future hardening follow-up: consider turning "Automatically expose new
  tables" **OFF**, after reviewing Supabase's behavior and app requirements
  (see [Section 13](#13-remaining-follow-ups)).

## 11. Security conclusions

- Cloud dev (`line-business-os-dev`) is synced through migration `0023`.
- The `workforce` schema remains unavailable via REST (not an exposed
  schema).
- The new `api.workforce_*` facade views are not readable by anonymous
  requests.
- Production (`line-app-prod-salon01` or any other production project) was
  not touched.
- No `service_role` key was used or printed at any point in this phase.
- No Cloud `db reset`, `db pull`, or migration repair was run.
- No app/frontend/API integration happened in this phase.
- No changes were made to `supabase/config.toml` in this phase.

## 12. Out of scope

- Any migration authoring, editing, or repair.
- Any test changes.
- Any app/frontend/API code changes.
- Any change to `supabase/config.toml`.
- Any production Supabase project or production deploy.
- Any authenticated-user (JWT) REST verification — all REST verification in
  this phase was anonymous only.
- Any non-docs code, migration, test, app, config, or production change
  committed or pushed as part of this phase — the only commit/push activity
  in this phase is this docs-only closeout report itself.

## 13. Remaining follow-ups

- Optional authenticated-user RLS smoke test through the `api.workforce_*`
  views, once a suitable Cloud dev test user/JWT is available.
- Optional metadata verification of `security_invoker` and the absence of
  write grants on the facade views, via the Dashboard SQL editor, if
  needed.
- Phase 1L-5 app/API integration planning.
- No production sync until a separate production readiness review.

## 14. Next recommended phase

**Phase 1L-5 — app/API integration planning** for the Workforce staff
profile and recipe facade views now available in Cloud dev, building on the
verified `0019`–`0023` migration state and the confirmed anonymous-denied
REST posture documented above. Production sync remains gated behind a
separate production readiness review and is not part of this recommendation.
