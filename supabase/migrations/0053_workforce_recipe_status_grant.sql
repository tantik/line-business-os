-- ============================================================================
-- 0053 Workforce: fix missing status-column grant on api.workforce_recipes
-- ============================================================================
-- Bug: Manager "archive/restore recipe" (setWorkforceRecipeArchived in
-- apps/web/src/lib/workforce/recipes.ts) writes
-- `update({ status: ... })` directly against `api.workforce_recipes`
-- (not through the `api.upsert_workforce_recipe` RPC). 0051 granted
-- `insert, update` on the underlying `workforce.recipes` table (required by
-- that RPC) but never granted any `update` on the `api.workforce_recipes`
-- view itself beyond the narrow `content_kind` column added by 0033 -- so
-- this direct view update always failed at the Postgres privilege check
-- (42501 insufficient_privilege) before RLS was even evaluated, surfacing to
-- the manager as "You do not have permission to do this." on every archive
-- or restore attempt. RLS (wf_recipes_update, 0022) already correctly
-- authorizes this write and remains the actual authorization boundary; this
-- migration only adds the missing column grant, no data or policy change.

grant update (status) on api.workforce_recipes to authenticated;
