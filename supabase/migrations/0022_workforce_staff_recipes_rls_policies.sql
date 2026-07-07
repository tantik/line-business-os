-- ============================================================================
-- 0022  Workforce: staff + recipes RLS policies (Phase 1L-2)
-- ----------------------------------------------------------------------------
-- Rewires workforce.employees off the legacy workforce.shift.* permissions
-- and onto the staff.* permissions added by 0020, and adds the first real RLS
-- policies for the recipe tables that 0021 created with RLS enabled but zero
-- policies (fully closed). No table grants are added anywhere in this
-- migration -- authenticated/anon still have zero direct table privileges on
-- `workforce` (see 0013's "no grants to workforce" posture); these policies
-- define the access shape for whenever a future facade opens read/write
-- access, and are exercised directly in pgTAP via role-hop + in-transaction
-- grants that never persist past rollback.
--
-- New helper: core.has_permission_in_tenant(tenant_id, permission). Unlike
-- core.has_permission(tenant_id, permission, location_id), this ignores the
-- assignment's location_id entirely -- it answers "does this user hold this
-- permission ANYWHERE in the tenant". It exists because some rows in this
-- migration have no location of their own (recipe_categories) or are
-- explicitly tenant-wide (recipes.location_id is null): a location-scoped
-- role assignment must still see/manage that shared, tenant-wide content, which
-- core.has_permission's location match would otherwise exclude.
--
-- New helper: workforce.can_manage_recipe(recipe_id). Used only by the recipe
-- child tables (recipe_ingredients/recipe_steps/recipe_notes) to answer "can
-- the current user manage the parent recipe this child row belongs to" by
-- looking the parent up by id. Deliberately NOT security definer: it is a
-- plain stable SQL function that performs an explicit
-- core.has_permission_in_tenant / core.has_permission check keyed off the
-- looked-up recipe's own tenant_id/location_id, so it needs no elevated
-- privilege to be correct -- see the function comment for the full argument.
-- ============================================================================

-- --- core.has_permission_in_tenant ------------------------------------------
-- Same shape/posture as core.has_permission (0006_helpers.sql, not edited
-- here): SECURITY DEFINER, STABLE, fixed search_path, is_platform_staff
-- short-circuit. The only difference is there is no location_id parameter and
-- no location predicate on the role_assignments row -- any assignment in the
-- tenant holding the permission counts, regardless of its own location_id.
-- p_tenant_id must always come from the row being checked by the calling
-- policy, never from a client-supplied "active tenant" session/GUC value.
create or replace function core.has_permission_in_tenant(
  p_tenant_id uuid,
  p_permission text
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
      );
$$;

comment on function core.has_permission_in_tenant(uuid, text) is
  'True when the current user holds p_permission anywhere in p_tenant_id, '
  'regardless of the role_assignment''s location_id (tenant-wide OR any '
  'single location). Use core.has_permission(...) instead when a specific '
  'row location must match the assignment''s location.';

revoke all on function core.has_permission_in_tenant(uuid, text) from public;
grant execute on function core.has_permission_in_tenant(uuid, text) to authenticated;

-- ============================================================================
-- workforce.employees -- replace the shift.*-keyed policies from 0009 with
-- staff.*-keyed policies (0020 added the permission keys; this is the
-- rewiring 0020's header note deferred to Phase 1L-2).
-- ============================================================================

drop policy if exists wf_employees_read on workforce.employees;
drop policy if exists wf_employees_write on workforce.employees;

-- Privileged staff-directory read: same location semantics as the policy it
-- replaces (core.has_permission's location match), just keyed to staff.read
-- instead of shift.read.
create policy wf_employees_staff_read on workforce.employees
  for select
  using (core.has_permission(tenant_id, 'workforce.staff.read', location_id));

-- Self-read: an employee (or any user) whose own profile this row is can
-- always read it, independent of any permission grant. This is intentionally
-- SELECT-only -- there is no matching self-update policy, so a user with no
-- staff.manage permission can never modify their own (or anyone else's) row.
create policy wf_employees_self_read on workforce.employees
  for select
  using (user_id = core.current_user_id());

-- Full staff management (create/edit/deactivate/delete profiles), keyed to
-- staff.manage instead of shift.write. Same location semantics as the write
-- policy it replaces.
create policy wf_employees_staff_manage on workforce.employees
  for all
  using (core.has_permission(tenant_id, 'workforce.staff.manage', location_id))
  with check (core.has_permission(tenant_id, 'workforce.staff.manage', location_id));

-- ============================================================================
-- workforce.recipe_categories -- tenant-wide (no location_id column), so
-- visibility/management use core.has_permission_in_tenant, not
-- core.has_permission. No DELETE policy: retirement is via is_active = false
-- (an UPDATE), never a hard delete.
-- ============================================================================

create policy wf_recipe_categories_select on workforce.recipe_categories
  for select
  using (
    core.has_permission_in_tenant(tenant_id, 'workforce.recipe.read')
    or core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage')
  );

create policy wf_recipe_categories_insert on workforce.recipe_categories
  for insert
  with check (core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'));

create policy wf_recipe_categories_update on workforce.recipe_categories
  for update
  using (core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'))
  with check (core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'));

-- ============================================================================
-- workforce.recipes -- location_id null means tenant-wide (shared across all
-- of the tenant's locations); non-null means specific to that one location.
-- A tenant-wide row must stay visible to a location-scoped holder of the
-- permission (core.has_permission_in_tenant), while a location-specific row
-- must still respect location scoping (core.has_permission). No DELETE
-- policy: archival is via status = 'archived' (an UPDATE), never a hard
-- delete.
--
-- Publish gate: any INSERT/UPDATE that would leave the row with
-- status = 'published' additionally requires workforce.recipe.publish (on
-- top of recipe.manage) -- holding recipe.manage alone is not enough to put a
-- recipe in front of the published-only read audience.
-- ============================================================================

-- Read audience: only published rows, and only if the reader can reach this
-- row's location (or the row is tenant-wide).
create policy wf_recipes_select_published on workforce.recipes
  for select
  using (
    status = 'published'
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.read'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.read', location_id))
    )
  );

-- Manage audience: every status (draft/published/archived), same
-- tenant-wide-vs-location reachability rule, keyed to recipe.manage.
create policy wf_recipes_select_manage on workforce.recipes
  for select
  using (
    (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'))
    or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
  );

create policy wf_recipes_insert on workforce.recipes
  for insert
  with check (
    (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
    )
    and (
      status <> 'published'
      or (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.publish'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.publish', location_id))
    )
  );

create policy wf_recipes_update on workforce.recipes
  for update
  using (
    (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'))
    or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
  )
  with check (
    (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
    )
    and (
      status <> 'published'
      or (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.publish'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.publish', location_id))
    )
  );

-- --- workforce.can_manage_recipe --------------------------------------------
-- Looks the parent recipe up by id and applies the exact same
-- tenant-wide-vs-location recipe.manage rule as wf_recipes_select_manage /
-- wf_recipes_update above, keyed off the PARENT row's own tenant_id/
-- location_id (never a client-supplied value). Deliberately plain SQL,
-- SECURITY INVOKER (the default -- no `security definer` clause): the
-- `from workforce.recipes r` lookup runs under the calling role's own
-- privileges, so it is automatically filtered by workforce.recipes' own
-- SELECT RLS policies first. That is safe and correct here (not a bug to
-- route around with SECURITY DEFINER): a row this function cannot even see
-- can never resolve to manage = true, and a row it CAN see still must pass
-- the explicit recipe.manage permission check below -- so a read-only
-- (recipe.read-holding) caller who can see a published recipe still gets
-- false, because the WHERE clause requires recipe.manage, not mere
-- visibility. No elevated privilege is needed for a correct answer, so none
-- is granted.
create or replace function workforce.can_manage_recipe(p_recipe_id uuid)
returns boolean
language sql stable
set search_path = core, workforce, public
as $$
  select exists (
    select 1
    from workforce.recipes r
    where r.id = p_recipe_id
      and (
        (r.location_id is null and core.has_permission_in_tenant(r.tenant_id, 'workforce.recipe.manage'))
        or (r.location_id is not null and core.has_permission(r.tenant_id, 'workforce.recipe.manage', r.location_id))
      )
  );
$$;

comment on function workforce.can_manage_recipe(uuid) is
  'True when the current user holds workforce.recipe.manage applicable to '
  'the parent recipe p_recipe_id (tenant-wide or location-matched). Used by '
  'the recipe child-table (ingredients/steps/notes) write policies. Plain '
  'SECURITY INVOKER: correctness relies on workforce.recipes'' own SELECT RLS '
  'plus an explicit permission check, not on bypassing RLS.';

revoke all on function workforce.can_manage_recipe(uuid) from public;
grant execute on function workforce.can_manage_recipe(uuid) to authenticated;

-- ============================================================================
-- Recipe child tables: recipe_ingredients, recipe_steps, recipe_notes.
-- SELECT mirrors the parent recipe's own visibility by querying
-- workforce.recipes directly -- that subquery is itself subject to the
-- parent's SELECT RLS policies above, so a child row is visible exactly when
-- its parent recipe is. Writes require workforce.can_manage_recipe on the
-- parent, so a read-only (recipe.read-only) caller can see child rows of
-- published recipes but can never insert/update/delete one.
-- ============================================================================

-- --- recipe_ingredients ------------------------------------------------------
create policy wf_recipe_ingredients_select on workforce.recipe_ingredients
  for select
  using (
    exists (
      select 1 from workforce.recipes r
      where r.tenant_id = recipe_ingredients.tenant_id
        and r.id = recipe_ingredients.recipe_id
    )
  );

create policy wf_recipe_ingredients_insert on workforce.recipe_ingredients
  for insert
  with check (workforce.can_manage_recipe(recipe_id));

create policy wf_recipe_ingredients_update on workforce.recipe_ingredients
  for update
  using (workforce.can_manage_recipe(recipe_id))
  with check (workforce.can_manage_recipe(recipe_id));

create policy wf_recipe_ingredients_delete on workforce.recipe_ingredients
  for delete
  using (workforce.can_manage_recipe(recipe_id));

-- --- recipe_steps -------------------------------------------------------------
create policy wf_recipe_steps_select on workforce.recipe_steps
  for select
  using (
    exists (
      select 1 from workforce.recipes r
      where r.tenant_id = recipe_steps.tenant_id
        and r.id = recipe_steps.recipe_id
    )
  );

create policy wf_recipe_steps_insert on workforce.recipe_steps
  for insert
  with check (workforce.can_manage_recipe(recipe_id));

create policy wf_recipe_steps_update on workforce.recipe_steps
  for update
  using (workforce.can_manage_recipe(recipe_id))
  with check (workforce.can_manage_recipe(recipe_id));

create policy wf_recipe_steps_delete on workforce.recipe_steps
  for delete
  using (workforce.can_manage_recipe(recipe_id));

-- --- recipe_notes ---------------------------------------------------------
create policy wf_recipe_notes_select on workforce.recipe_notes
  for select
  using (
    exists (
      select 1 from workforce.recipes r
      where r.tenant_id = recipe_notes.tenant_id
        and r.id = recipe_notes.recipe_id
    )
  );

create policy wf_recipe_notes_insert on workforce.recipe_notes
  for insert
  with check (workforce.can_manage_recipe(recipe_id));

create policy wf_recipe_notes_update on workforce.recipe_notes
  for update
  using (workforce.can_manage_recipe(recipe_id))
  with check (workforce.can_manage_recipe(recipe_id));

create policy wf_recipe_notes_delete on workforce.recipe_notes
  for delete
  using (workforce.can_manage_recipe(recipe_id));
