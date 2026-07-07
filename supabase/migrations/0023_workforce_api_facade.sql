-- ============================================================================
-- 0023  Workforce read-only API facade: staff profiles + recipes (Phase 1L-3)
-- ----------------------------------------------------------------------------
-- Adds the first app-facing `api` schema surface for Workforce staff profiles
-- and recipes, following the exact `security_invoker` pattern established by
-- 0015/0017/0018/0019. `workforce` itself stays out of the Data API
-- exposed-schemas list (supabase/config.toml is unchanged); only the 7 new
-- `api` views below become reachable via PostgREST, and only for the caller's
-- own RLS-permitted rows.
--
-- SCOPE: read-only. No RPC/function is added for staff or recipe writes, and
-- none is planned later in this schema -- Workforce mutations go exclusively
-- through the `apps/api` service-role path (see
-- docs/architecture/workforce-rls-security-plan.md §9 and
-- docs/phase-1l-0-workforce-mvp-slice-plan.md §7), so RLS remains
-- defense-in-depth rather than the primary write gate. This migration adds
-- zero INSERT/UPDATE/DELETE grants anywhere, on tables or views.
--
-- SECURITY MODEL:
--   * Every view is `security_invoker = true` -- no SECURITY DEFINER object
--     is added. The caller's own privileges + the existing 0022 RLS policies
--     on workforce.employees/recipe_categories/recipes/recipe_ingredients/
--     recipe_steps/recipe_notes remain the single source of truth; these
--     views neither widen nor bypass RLS.
--   * Staff views restate their scoping predicate explicitly in SQL (a single
--     `core.current_user_id()` or `core.has_permission(...)` call each --
--     cheap and safe to restate, matching `api.my_tenant_memberships`'s
--     style). Recipe views intentionally do NOT restate the two-way
--     tenant-wide-vs-location, published-vs-all-status branching logic that
--     0022's `wf_recipes_select_published`/`wf_recipes_select_manage`
--     policies already encode -- duplicating that non-trivial OR'd predicate
--     in the view would risk silently drifting out of sync with the RLS
--     policies over time; a plain pass-through relying purely on RLS is
--     safer here.
--   * No PII: `name_encrypted`/`name_hash` (workforce.employees) are never
--     selected by any view. No raw user ids (`user_id`, `created_by`,
--     `updated_by`) are exposed anywhere, matching the zero-user-identity
--     precedent set by `api.my_tenant_admin_members` (0018). Every row id is
--     exposed under a semantic alias (`staff_id`, `category_id`, `recipe_id`,
--     `ingredient_id`, `step_id`, `note_id`), never as a column literally
--     named `id`.
--   * `anon` is granted nothing anywhere in this migration: no `USAGE` on
--     `workforce`, no `SELECT` on any of the 6 named base tables, no `SELECT`
--     on any of the 7 new views. Explicit `revoke all ... from anon, public`
--     is added per view for defense-in-depth, matching 0017/0018's style
--     even though anon was never granted anything.
--   * `authenticated` receives exactly: `USAGE` on schema `workforce`;
--     `SELECT` only (no writes) on the 6 named base tables (nothing else in
--     `workforce` -- not `shifts`/`shift_requests`/`leave_requests`/
--     `attendance`); `SELECT` only (no writes) on the 7 new `api` views.
--
-- DEPENDENCY NOTE: because every view below is security_invoker,
-- `authenticated` needs `SELECT` on the exact underlying workforce base
-- tables for RLS to engage, mirroring 0017's grant of `core.locations`/
-- `core.tenant_modules` to `authenticated`. This is the first `authenticated`
-- grant of any kind on `workforce` -- previously asserted at zero by
-- supabase/tests/0002_security_rls.sql and
-- supabase/tests/0008_workforce_staff_recipes_rls.sql, both narrowed by this
-- phase's companion test changes to allow exactly this new grant set.
-- ============================================================================

-- ============================================================================
-- Staff views
-- ============================================================================

-- api.workforce_my_staff_profile -- caller's own employees row only. Restates
-- wf_employees_self_read's predicate explicitly so the view's contract
-- ("exactly my own row, if one exists") is self-evident from its definition,
-- matching api.my_tenant_memberships's style. Zero rows if the caller has no
-- matching employees row (e.g. an Owner/Admin with no staff record) -- not an
-- error.
create view api.workforce_my_staff_profile
  with (security_invoker = true) as
select
  e.id as staff_id,
  e.tenant_id,
  e.location_id,
  e.position_label,
  e.employment_type,
  e.is_active,
  e.created_at
from workforce.employees e
where e.user_id = core.current_user_id();

comment on view api.workforce_my_staff_profile is
  'Caller''s own workforce.employees row (self-scoped by user_id = core.current_user_id()). security_invoker view; core/workforce RLS is enforced as caller. No name_encrypted/name_hash, no user_id, no created_by/updated_by.';

-- api.workforce_staff_directory -- privileged staff list (managers/owners).
-- Restates wf_employees_staff_read/_staff_manage's predicate explicitly: a
-- single has_permission call per branch, cheap and safe to restate.
create view api.workforce_staff_directory
  with (security_invoker = true) as
select
  e.id as staff_id,
  e.tenant_id,
  e.location_id,
  e.position_label,
  e.employment_type,
  e.is_active,
  e.created_at
from workforce.employees e
where core.has_permission(e.tenant_id, 'workforce.staff.read', e.location_id)
   or core.has_permission(e.tenant_id, 'workforce.staff.manage', e.location_id);

comment on view api.workforce_staff_directory is
  'Staff directory for workforce.staff.read/workforce.staff.manage holders, location-matched via core.has_permission. security_invoker view; core/workforce RLS is enforced as caller. No name_encrypted/name_hash, no user_id, no created_by/updated_by.';

-- ============================================================================
-- Recipe views
-- ============================================================================

-- api.workforce_recipe_categories -- no extra WHERE: relies purely on
-- wf_recipe_categories_select RLS, which itself does not filter by
-- is_active for either recipe.read or recipe.manage holders, so this view
-- must not invent a stricter rule than the table's own RLS already applies.
create view api.workforce_recipe_categories
  with (security_invoker = true) as
select
  c.id as category_id,
  c.tenant_id,
  c.label_ja,
  c.label_en,
  c.sort_order,
  c.is_active
from workforce.recipe_categories c;

comment on view api.workforce_recipe_categories is
  'Workforce recipe categories, relying entirely on wf_recipe_categories_select RLS for visibility (no additional predicate). security_invoker view.';

-- api.workforce_recipes -- no extra WHERE: wf_recipes_select_published /
-- wf_recipes_select_manage already encode the exact tenant-wide-vs-location,
-- published-vs-all-status business rule; restating that OR'd, two-way
-- branching predicate here would duplicate non-trivial logic that could
-- silently drift out of sync with the RLS policies. status is exposed
-- deliberately: RLS already decides row visibility (a recipe.read-only
-- holder's query never returns a draft/archived row at all), so exposing the
-- column only lets a manager's own richer result set distinguish
-- draft/published/archived in the UI.
create view api.workforce_recipes
  with (security_invoker = true) as
select
  r.id as recipe_id,
  r.tenant_id,
  r.location_id,
  r.recipe_category_id,
  r.title_ja,
  r.title_en,
  r.description_ja,
  r.description_en,
  r.is_popular,
  r.status,
  r.created_at,
  r.updated_at
from workforce.recipes r;

comment on view api.workforce_recipes is
  'Workforce recipes, relying entirely on wf_recipes_select_published / wf_recipes_select_manage RLS for visibility (no additional predicate). security_invoker view. No created_by/updated_by.';

-- api.workforce_recipe_ingredients / _steps / _notes -- no extra WHERE: each
-- child table's own RLS SELECT policy already mirrors parent-recipe
-- visibility exactly via an `exists` subquery against workforce.recipes
-- (itself RLS-filtered), so a plain pass-through is correct and simplest.
create view api.workforce_recipe_ingredients
  with (security_invoker = true) as
select
  i.id as ingredient_id,
  i.tenant_id,
  i.recipe_id,
  i.label_ja,
  i.label_en,
  i.sort_order
from workforce.recipe_ingredients i;

comment on view api.workforce_recipe_ingredients is
  'Workforce recipe ingredients, relying entirely on wf_recipe_ingredients_select RLS (mirrors parent recipe visibility). security_invoker view.';

create view api.workforce_recipe_steps
  with (security_invoker = true) as
select
  s.id as step_id,
  s.tenant_id,
  s.recipe_id,
  s.step_number,
  s.instruction_ja,
  s.instruction_en
from workforce.recipe_steps s;

comment on view api.workforce_recipe_steps is
  'Workforce recipe steps, relying entirely on wf_recipe_steps_select RLS (mirrors parent recipe visibility). security_invoker view.';

create view api.workforce_recipe_notes
  with (security_invoker = true) as
select
  n.id as note_id,
  n.tenant_id,
  n.recipe_id,
  n.title_ja,
  n.title_en,
  n.body_ja,
  n.body_en
from workforce.recipe_notes n;

comment on view api.workforce_recipe_notes is
  'Workforce recipe notes, relying entirely on wf_recipe_notes_select RLS (mirrors parent recipe visibility). security_invoker view.';

-- ============================================================================
-- Grants
-- ============================================================================

-- Dependency grants: security_invoker views need authenticated to hold
-- ordinary SELECT on the exact underlying base tables for RLS to engage.
-- SELECT only -- no INSERT/UPDATE/DELETE. Nothing else in workforce (shifts,
-- shift_requests, leave_requests, attendance) is granted.
grant usage on schema workforce to authenticated;

grant select on
  workforce.employees,
  workforce.recipe_categories,
  workforce.recipes,
  workforce.recipe_ingredients,
  workforce.recipe_steps,
  workforce.recipe_notes
to authenticated;

-- View grants: SELECT only, authenticated only.
grant select on api.workforce_my_staff_profile to authenticated;
grant select on api.workforce_staff_directory to authenticated;
grant select on api.workforce_recipe_categories to authenticated;
grant select on api.workforce_recipes to authenticated;
grant select on api.workforce_recipe_ingredients to authenticated;
grant select on api.workforce_recipe_steps to authenticated;
grant select on api.workforce_recipe_notes to authenticated;

-- anon/public: explicit fail-closed revoke, matching 0017/0018's style even
-- though anon was never granted anything on these new objects.
revoke all on api.workforce_my_staff_profile from anon, public;
revoke all on api.workforce_staff_directory from anon, public;
revoke all on api.workforce_recipe_categories from anon, public;
revoke all on api.workforce_recipes from anon, public;
revoke all on api.workforce_recipe_ingredients from anon, public;
revoke all on api.workforce_recipe_steps from anon, public;
revoke all on api.workforce_recipe_notes from anon, public;
