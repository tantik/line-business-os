-- ============================================================================
-- 0097  Workforce: enforce module-OFF gating (Module Access Security
--       Remediation, WP-S5)
-- ----------------------------------------------------------------------------
-- Workforce is the largest-blast-radius domain in this mission: 15 base
-- tables with RLS, 6 SECURITY DEFINER functions that bypass RLS entirely,
-- and a Storage bucket (recipe-media). Prior state: none of it ever checked
-- core.tenant_modules.is_enabled -- a tenant with Workforce turned OFF still
-- had the exact same tenant-facing access as one with Workforce ON, gated
-- only by core.has_permission(...)/self-scope predicates.
--
-- This migration adds core.has_module_access(tenant_id, 'workforce') to:
--   * every RLS policy on workforce.employees, shifts, shift_types,
--     shift_requests, leave_requests (dead/unreachable, gated anyway for
--     consistency -- see 0056's header confirming no live code path reaches
--     it), attendance, shift_exchanges, recipe_categories, recipes,
--     recipe_ingredients/steps/notes, employee_line_links,
--     schedule_settings, employee_invitations (manager-facing policies
--     only -- see the invitations note below), staff_messages;
--   * the recipe-media Storage bucket's 3 policies (current live version is
--     0074, which fully superseded 0052 -- this migration extends 0074's
--     bodies, not 0052's);
--   * api.workforce_staff_directory's own WHERE clause (it restates its
--     has_permission predicate directly rather than purely relying on base-
--     table RLS -- 0023's own header note contrasts this against the
--     recipe views, which rely purely on RLS and therefore need no view-
--     level change);
--   * 6 SECURITY DEFINER functions that bypass RLS and must carry their own
--     explicit pre-check: workforce.is_caller_employee_in_scope (0061),
--     workforce.is_employee_active_for_schedule (0059),
--     workforce.shift_request_location_timezone (0050),
--     workforce.upsert_employee_invitation (0065),
--     workforce.permanently_delete_employee (0091, current body),
--     workforce.permanently_delete_recipe (0057).
--
-- Employee invitations -- deliberate split (see the read-only impact
-- inventory this WP began with; recorded here for the PR record):
--   * wf_employee_invitations_manager_read / _manager_revoke and
--     workforce.upsert_employee_invitation (Invite/Resend) ARE gated -- a
--     Manager should not be able to invite new staff into, or manage
--     existing invitations for, a module that is OFF.
--   * wf_employee_invitations_self_read and workforce.accept_employee_
--     invitation / workforce.my_pending_employee_invitations are
--     deliberately NOT gated. The invited person controls nothing about
--     whether Workforce is toggled off after their invite was issued;
--     accepting only creates a core.role_assignments/tenant_memberships
--     row and reveals no Workforce operational data (no shifts/attendance/
--     recipes/messages), so blocking it would only strand a legitimate
--     pending invite in a confusing state for no security benefit. This is
--     a product-policy judgment call, not a pure security gap -- flagged
--     explicitly in the completion report for Founder awareness, not
--     unilaterally hidden.
--
-- Triggers left unchanged (class D -- plain invoker triggers, downstream of
-- an already-RLS-gated INSERT/UPDATE, never independently authorizing
-- anything): workforce.stamp_shift_request_decision,
-- workforce.guard_staff_message_update, workforce.stamp_staff_message_read,
-- workforce.stamp_staff_message_sender. workforce.guard_shift_exchange_
-- update() is a BEFORE UPDATE trigger that re-derives its own authorization
-- decisions independently of the calling RLS policy -- true defense-in-depth
-- would add a check there too, but every UPDATE policy on shift_exchanges is
-- gated by this same migration, so the trigger can never fire for an OFF
-- tenant via any normal PostgREST access path; left unchanged to avoid
-- duplicating the same guarantee three times with no reachable gap it closes
-- (documented judgment call, not an oversight).
--
-- Invoker RPCs relying on now-gated table RLS (api.accept_workforce_
-- shift_exchange, api.cancel_workforce_shift_exchange,
-- api.decide_workforce_shift_exchange, api.upsert_workforce_recipe,
-- api.bind_workforce_employee_line_user, api.unbind_workforce_employee_
-- line_user) are not given their own pre-check, matching WP-S3's own
-- precedent for Inventory's invoker RPCs ("RPC calls fail the same way a
-- direct insert/update would, no separate pre-check needed").
--
-- content.* translation functions (0039/0042) read workforce.recipes via
-- SECURITY INVOKER and so are automatically covered once workforce.recipes'
-- own SELECT policies are gated -- they belong to a different module/schema
-- and are out of this migration's scope to touch directly.
--
-- Behavior:
--   Workforce ON  -> unchanged.
--   Workforce OFF -> SELECT/INSERT/UPDATE on every table above blocked
--                     tenant-facing; every SECURITY DEFINER function above
--                     returns its existing not-found/unauthorized-shaped
--                     empty result; recipe-media Storage read/write/delete
--                     blocked; existing rows and Storage objects preserved
--                     (nothing here deletes anything).
--   Workforce ON again -> prior access restored, unchanged.
--
-- Rollback: re-apply the pre-0097 policy/function bodies (drop the
-- module-access conjunct/pre-check) for each object listed above. Purely
-- additive/no data change either direction.
-- ============================================================================

-- ============================================================================
-- workforce.employees
-- ============================================================================
drop policy if exists wf_employees_staff_read on workforce.employees;
create policy wf_employees_staff_read on workforce.employees
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.staff.read', location_id)
  );

drop policy if exists wf_employees_self_read on workforce.employees;
create policy wf_employees_self_read on workforce.employees
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and user_id = core.current_user_id()
  );

drop policy if exists wf_employees_staff_manage on workforce.employees;
create policy wf_employees_staff_manage on workforce.employees
  for all
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.staff.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.staff.manage', location_id)
  );

drop policy if exists wf_employees_coworker_roster_read on workforce.employees;
create policy wf_employees_coworker_roster_read on workforce.employees
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and is_active = true
    and workforce.is_caller_employee_in_scope(tenant_id, location_id)
  );

-- ============================================================================
-- workforce.shifts / workforce.shift_types
-- ============================================================================
drop policy if exists wf_shifts_select_published on workforce.shifts;
create policy wf_shifts_select_published on workforce.shifts
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and published = true
    and core.has_permission(tenant_id, 'workforce.shift.read', location_id)
  );

drop policy if exists wf_shifts_manage on workforce.shifts;
create policy wf_shifts_manage on workforce.shifts
  for all
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.shift.write', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.shift.write', location_id)
  );

drop policy if exists wf_shift_types_read on workforce.shift_types;
create policy wf_shift_types_read on workforce.shift_types
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.shift.read', location_id)
  );

drop policy if exists wf_shift_types_write on workforce.shift_types;
create policy wf_shift_types_write on workforce.shift_types
  for all
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.shift.write', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.shift.write', location_id)
  );

-- ============================================================================
-- workforce.shift_requests / workforce.leave_requests (dead, gated anyway)
-- ============================================================================
drop policy if exists wf_shift_requests_self_select on workforce.shift_requests;
create policy wf_shift_requests_self_select on workforce.shift_requests
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_employee(employee_id)
  );

drop policy if exists wf_shift_requests_self_insert on workforce.shift_requests;
create policy wf_shift_requests_self_insert on workforce.shift_requests
  for insert
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_active_employee(employee_id)
    and status = 'pending'
    and decided_by is null
  );

drop policy if exists wf_shift_requests_write on workforce.shift_requests;
create policy wf_shift_requests_write on workforce.shift_requests
  for all
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.request.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.request.manage', location_id)
  );

drop policy if exists wf_leave_requests_read on workforce.leave_requests;
create policy wf_leave_requests_read on workforce.leave_requests
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.shift.read', location_id)
  );

drop policy if exists wf_leave_requests_write on workforce.leave_requests;
create policy wf_leave_requests_write on workforce.leave_requests
  for all
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.request.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.request.manage', location_id)
  );

-- ============================================================================
-- workforce.attendance
-- ============================================================================
drop policy if exists wf_attendance_manage on workforce.attendance;
create policy wf_attendance_manage on workforce.attendance
  for all
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.attendance.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.attendance.manage', location_id)
  );

drop policy if exists wf_attendance_self_select on workforce.attendance;
create policy wf_attendance_self_select on workforce.attendance
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_employee(employee_id)
  );

drop policy if exists wf_attendance_self_insert on workforce.attendance;
create policy wf_attendance_self_insert on workforce.attendance
  for insert
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_active_employee(employee_id)
  );

drop policy if exists wf_attendance_self_update on workforce.attendance;
create policy wf_attendance_self_update on workforce.attendance
  for update
  using (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_active_employee(employee_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_active_employee(employee_id)
  );

-- ============================================================================
-- workforce.shift_exchanges
-- ============================================================================
drop policy if exists wf_shift_exchanges_read on workforce.shift_exchanges;
create policy wf_shift_exchanges_read on workforce.shift_exchanges
  for select using (
    core.has_module_access(tenant_id, 'workforce')
    and (
      workforce.is_own_employee(requester_employee_id)
      or (
        replacement_employee_id is not null
        and workforce.is_own_employee(replacement_employee_id)
      )
      or core.has_permission(tenant_id, 'workforce.request.manage', location_id)
      or (
        status = 'open'
        and core.has_permission(tenant_id, 'workforce.shift.read', location_id)
      )
    )
  );

drop policy if exists wf_shift_exchanges_manage on workforce.shift_exchanges;
create policy wf_shift_exchanges_manage on workforce.shift_exchanges
  for update
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.request.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.request.manage', location_id)
  );

drop policy if exists wf_shift_exchanges_request on workforce.shift_exchanges;
create policy wf_shift_exchanges_request on workforce.shift_exchanges
  for insert with check (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_active_employee(requester_employee_id)
    and replacement_employee_id is null
    and status = 'open'
    and length(btrim(reason)) between 1 and 500
    and exists (
      select 1 from workforce.shifts s
      where s.tenant_id = shift_exchanges.tenant_id
        and s.location_id = shift_exchanges.location_id
        and s.id = shift_exchanges.shift_id
        and s.employee_id = shift_exchanges.requester_employee_id
        and s.published = true
        and s.starts_at > clock_timestamp()
    )
    and (
      (request_kind in ('exchange', 'cancel') and requested_shift_type_id is null)
      or (
        request_kind = 'change'
        and exists (
          select 1 from workforce.shift_types st
          where st.tenant_id = shift_exchanges.tenant_id
            and st.id = shift_exchanges.requested_shift_type_id
            and st.is_active = true
            and (st.location_id is null or st.location_id = shift_exchanges.location_id)
        )
      )
    )
  );

drop policy if exists wf_shift_exchanges_accept on workforce.shift_exchanges;
create policy wf_shift_exchanges_accept on workforce.shift_exchanges
  for update
  using (
    core.has_module_access(tenant_id, 'workforce')
    and status = 'open'
    and core.has_permission(tenant_id, 'workforce.shift.read', location_id)
  )
  with check (
    status = 'accepted'
    and replacement_employee_id is not null
    and workforce.is_own_active_employee(replacement_employee_id)
    and not workforce.is_own_employee(requester_employee_id)
  );

drop policy if exists wf_shift_exchanges_cancel_own on workforce.shift_exchanges;
create policy wf_shift_exchanges_cancel_own on workforce.shift_exchanges
  for update
  using (
    core.has_module_access(tenant_id, 'workforce')
    and status in ('open', 'accepted')
    and workforce.is_own_active_employee(requester_employee_id)
  )
  with check (
    status = 'cancelled'
    and workforce.is_own_active_employee(requester_employee_id)
  );

-- ============================================================================
-- workforce.recipe_categories / recipes / recipe_ingredients / steps / notes
-- ============================================================================
drop policy if exists wf_recipe_categories_select on workforce.recipe_categories;
create policy wf_recipe_categories_select on workforce.recipe_categories
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and (
      core.has_permission_in_tenant(tenant_id, 'workforce.recipe.read')
      or core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage')
    )
  );

drop policy if exists wf_recipe_categories_insert on workforce.recipe_categories;
create policy wf_recipe_categories_insert on workforce.recipe_categories
  for insert
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage')
  );

drop policy if exists wf_recipe_categories_update on workforce.recipe_categories;
create policy wf_recipe_categories_update on workforce.recipe_categories
  for update
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage')
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage')
  );

drop policy if exists wf_recipes_select_published on workforce.recipes;
create policy wf_recipes_select_published on workforce.recipes
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and status = 'published'
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.read'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.read', location_id))
    )
  );

drop policy if exists wf_recipes_select_manage on workforce.recipes;
create policy wf_recipes_select_manage on workforce.recipes
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
    )
  );

drop policy if exists wf_recipes_insert on workforce.recipes;
create policy wf_recipes_insert on workforce.recipes
  for insert
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
    )
    and (
      status <> 'published'
      or (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.publish'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.publish', location_id))
    )
  );

drop policy if exists wf_recipes_update on workforce.recipes;
create policy wf_recipes_update on workforce.recipes
  for update
  using (
    core.has_module_access(tenant_id, 'workforce')
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
    )
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
    )
    and (
      status <> 'published'
      or (location_id is null and core.has_permission_in_tenant(tenant_id, 'workforce.recipe.publish'))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.publish', location_id))
    )
  );

-- recipe_ingredients / recipe_steps / recipe_notes: the SELECT policies never
-- called core.has_permission at all (visibility mirrors the parent recipe's
-- existence, evaluated as the caller under RLS -- workforce.recipes' own now-
-- gated SELECT policies already apply inside this EXISTS), but the module
-- check is added directly too since each of these tables carries its own
-- tenant_id column and doing so is cheap, explicit, and independently
-- testable rather than relying solely on the nested-RLS interaction.
drop policy if exists wf_recipe_ingredients_select on workforce.recipe_ingredients;
create policy wf_recipe_ingredients_select on workforce.recipe_ingredients
  for select
  using (
    core.has_module_access(recipe_ingredients.tenant_id, 'workforce')
    and exists (
      select 1 from workforce.recipes r
      where r.tenant_id = recipe_ingredients.tenant_id
        and r.id = recipe_ingredients.recipe_id
    )
  );

drop policy if exists wf_recipe_ingredients_insert on workforce.recipe_ingredients;
create policy wf_recipe_ingredients_insert on workforce.recipe_ingredients
  for insert
  with check (
    core.has_module_access(recipe_ingredients.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  );

drop policy if exists wf_recipe_ingredients_update on workforce.recipe_ingredients;
create policy wf_recipe_ingredients_update on workforce.recipe_ingredients
  for update
  using (
    core.has_module_access(recipe_ingredients.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  )
  with check (
    core.has_module_access(recipe_ingredients.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  );

drop policy if exists wf_recipe_ingredients_delete on workforce.recipe_ingredients;
create policy wf_recipe_ingredients_delete on workforce.recipe_ingredients
  for delete
  using (
    core.has_module_access(recipe_ingredients.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  );

drop policy if exists wf_recipe_steps_select on workforce.recipe_steps;
create policy wf_recipe_steps_select on workforce.recipe_steps
  for select
  using (
    core.has_module_access(recipe_steps.tenant_id, 'workforce')
    and exists (
      select 1 from workforce.recipes r
      where r.tenant_id = recipe_steps.tenant_id
        and r.id = recipe_steps.recipe_id
    )
  );

drop policy if exists wf_recipe_steps_insert on workforce.recipe_steps;
create policy wf_recipe_steps_insert on workforce.recipe_steps
  for insert
  with check (
    core.has_module_access(recipe_steps.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  );

drop policy if exists wf_recipe_steps_update on workforce.recipe_steps;
create policy wf_recipe_steps_update on workforce.recipe_steps
  for update
  using (
    core.has_module_access(recipe_steps.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  )
  with check (
    core.has_module_access(recipe_steps.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  );

drop policy if exists wf_recipe_steps_delete on workforce.recipe_steps;
create policy wf_recipe_steps_delete on workforce.recipe_steps
  for delete
  using (
    core.has_module_access(recipe_steps.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  );

drop policy if exists wf_recipe_notes_select on workforce.recipe_notes;
create policy wf_recipe_notes_select on workforce.recipe_notes
  for select
  using (
    core.has_module_access(recipe_notes.tenant_id, 'workforce')
    and exists (
      select 1 from workforce.recipes r
      where r.tenant_id = recipe_notes.tenant_id
        and r.id = recipe_notes.recipe_id
    )
  );

drop policy if exists wf_recipe_notes_insert on workforce.recipe_notes;
create policy wf_recipe_notes_insert on workforce.recipe_notes
  for insert
  with check (
    core.has_module_access(recipe_notes.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  );

drop policy if exists wf_recipe_notes_update on workforce.recipe_notes;
create policy wf_recipe_notes_update on workforce.recipe_notes
  for update
  using (
    core.has_module_access(recipe_notes.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  )
  with check (
    core.has_module_access(recipe_notes.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  );

drop policy if exists wf_recipe_notes_delete on workforce.recipe_notes;
create policy wf_recipe_notes_delete on workforce.recipe_notes
  for delete
  using (
    core.has_module_access(recipe_notes.tenant_id, 'workforce')
    and workforce.can_manage_recipe(recipe_id)
  );

-- ============================================================================
-- workforce.employee_line_links / schedule_settings
-- ============================================================================
drop policy if exists wf_employee_line_links_manage on workforce.employee_line_links;
create policy wf_employee_line_links_manage on workforce.employee_line_links
  for all
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission_in_tenant(tenant_id, 'workforce.staff.manage')
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission_in_tenant(tenant_id, 'workforce.staff.manage')
  );

drop policy if exists wf_schedule_settings_read on workforce.schedule_settings;
create policy wf_schedule_settings_read on workforce.schedule_settings
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.shift.read', location_id)
  );

drop policy if exists wf_schedule_settings_write on workforce.schedule_settings;
create policy wf_schedule_settings_write on workforce.schedule_settings
  for all
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.shift.write', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.shift.write', location_id)
  );

-- ============================================================================
-- workforce.employee_invitations -- manager-facing policies only. See this
-- migration's header for why wf_employee_invitations_self_read is
-- deliberately left ungated.
-- ============================================================================
drop policy if exists wf_employee_invitations_manager_read on workforce.employee_invitations;
create policy wf_employee_invitations_manager_read on workforce.employee_invitations
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission_in_tenant(tenant_id, 'workforce.staff.manage')
  );

drop policy if exists wf_employee_invitations_manager_revoke on workforce.employee_invitations;
create policy wf_employee_invitations_manager_revoke on workforce.employee_invitations
  for update
  using (
    core.has_module_access(tenant_id, 'workforce')
    and status = 'pending'
    and core.has_permission_in_tenant(tenant_id, 'workforce.staff.manage')
  )
  with check (
    status = 'revoked'
    and revoked_at is not null
  );

-- ============================================================================
-- workforce.staff_messages
-- ============================================================================
drop policy if exists wf_staff_messages_self_select on workforce.staff_messages;
create policy wf_staff_messages_self_select on workforce.staff_messages
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_employee(employee_id)
  );

drop policy if exists wf_staff_messages_self_insert on workforce.staff_messages;
create policy wf_staff_messages_self_insert on workforce.staff_messages
  for insert
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_employee(employee_id)
    and sender_role = 'staff'
    and sender_user_id = core.current_user_id()
    and is_read = false
    and read_at is null
    and read_by is null
    and archived_at is null
    and deleted_at is null
  );

drop policy if exists wf_staff_messages_self_update on workforce.staff_messages;
create policy wf_staff_messages_self_update on workforce.staff_messages
  for update
  using (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_employee(employee_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.is_own_employee(employee_id)
  );

drop policy if exists wf_staff_messages_manage_select on workforce.staff_messages;
create policy wf_staff_messages_manage_select on workforce.staff_messages
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.attendance.manage', location_id)
  );

drop policy if exists wf_staff_messages_manage_insert on workforce.staff_messages;
create policy wf_staff_messages_manage_insert on workforce.staff_messages
  for insert
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.attendance.manage', location_id)
    and sender_role = 'manager'
    and sender_user_id = core.current_user_id()
    and is_read = false
    and read_at is null
    and read_by is null
    and archived_at is null
    and deleted_at is null
    and exists (
      select 1
      from workforce.employees e
      where e.tenant_id = staff_messages.tenant_id
        and e.id = staff_messages.employee_id
        and e.location_id = staff_messages.location_id
    )
  );

drop policy if exists wf_staff_messages_manage_update on workforce.staff_messages;
create policy wf_staff_messages_manage_update on workforce.staff_messages
  for update
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.attendance.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.attendance.manage', location_id)
  );

-- ============================================================================
-- api.workforce_staff_directory -- restates its own predicate (0023), so the
-- module check is added directly here too, not left to base-table RLS alone.
-- ============================================================================
create or replace view api.workforce_staff_directory
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
where core.has_module_access(e.tenant_id, 'workforce')
  and (
    core.has_permission(e.tenant_id, 'workforce.staff.read', e.location_id)
    or core.has_permission(e.tenant_id, 'workforce.staff.manage', e.location_id)
  );

comment on view api.workforce_staff_directory is
  'Staff directory for workforce.staff.read/workforce.staff.manage holders, location-matched via core.has_permission, plus an explicit core.has_module_access(tenant_id, ''workforce'') check (WP-S5) since this view restates its predicate directly rather than purely relying on base-table RLS. security_invoker view; core/workforce RLS is enforced as caller. No name_encrypted/name_hash, no user_id, no created_by/updated_by.';

-- ============================================================================
-- SECURITY DEFINER functions -- bypass RLS entirely, need an explicit
-- pre-check inside the function body.
-- ============================================================================

-- workforce.is_caller_employee_in_scope (0061)
create or replace function workforce.is_caller_employee_in_scope(
  p_tenant_id uuid,
  p_location_id uuid
)
returns boolean
language sql stable security definer set search_path = workforce, core, public as $$
  select
    core.has_module_access(p_tenant_id, 'workforce')
    and exists (
      select 1
      from workforce.employees caller
      where caller.user_id = core.current_user_id()
        and caller.tenant_id = p_tenant_id
        and caller.is_active = true
        and (
          caller.location_id = p_location_id
          or caller.location_id is null
          or p_location_id is null
        )
    );
$$;

comment on function workforce.is_caller_employee_in_scope(uuid, uuid) is
  'Non-PII helper for the Staff-safe coworker roster: true when core.has_module_access(p_tenant_id, ''workforce'') (WP-S5) and the calling user is themselves an ACTIVE workforce.employees row in p_tenant_id, scoped to p_location_id with the same location_id IS NULL = tenant-wide convention used elsewhere. SECURITY DEFINER because a plain shift.read (Staff) caller cannot otherwise read even their own row in the context of evaluating another row''s RLS policy. Returns a boolean only -- never a name or other PII.';

-- workforce.is_employee_active_for_schedule (0059)
create or replace function workforce.is_employee_active_for_schedule(
  p_employee_id uuid,
  p_tenant_id uuid,
  p_location_id uuid
)
returns boolean
language sql stable security definer set search_path = workforce, core, public as $$
  select
    core.has_module_access(p_tenant_id, 'workforce')
    and coalesce(
      (
        select e.is_active
        from workforce.employees e
        where e.id = p_employee_id
          and e.tenant_id = p_tenant_id
          and (e.location_id is null or e.location_id = p_location_id)
      ),
      false
    );
$$;

comment on function workforce.is_employee_active_for_schedule(uuid, uuid, uuid) is
  'Non-PII boolean used by api.workforce_shift_assignments to exclude a deactivated coworker''s shifts for a plain Staff caller. Now also requires core.has_module_access(p_tenant_id, ''workforce'') (WP-S5) since this is SECURITY DEFINER and bypasses RLS. Always scoped to the assignment''s own tenant_id/location_id, defense in depth against cross-tenant/location probing via a crafted employee_id.';

-- workforce.shift_request_location_timezone (0050)
create or replace function workforce.shift_request_location_timezone(p_tenant_id uuid, p_location_id uuid)
returns text
language sql stable security definer
set search_path = core, workforce, public
as $$
  select l.timezone
    from core.locations l
   where l.tenant_id = p_tenant_id
     and l.id = p_location_id
     and core.has_module_access(p_tenant_id, 'workforce')
     and core.has_permission(p_tenant_id, 'workforce.request.manage', p_location_id)
$$;

-- workforce.upsert_employee_invitation (0065) -- manager Invite/Resend write.
create or replace function workforce.upsert_employee_invitation(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_target_user_id uuid,
  p_invitation_id uuid
)
returns table (
  out_invitation_id uuid,
  out_expires_at timestamptz,
  out_was_resend boolean
)
language plpgsql
security definer
set search_path = core, workforce, public
as $$
declare
  v_employee_user_id uuid;
  v_existing_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if not core.has_module_access(p_tenant_id, 'workforce') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not core.has_permission_in_tenant(p_tenant_id, 'workforce.staff.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select user_id into v_employee_user_id
    from workforce.employees
   where tenant_id = p_tenant_id and id = p_employee_id;

  if not found then
    raise exception 'employee_not_found' using errcode = 'P0001';
  end if;
  if v_employee_user_id is not null then
    raise exception 'employee_already_bound' using errcode = 'P0001';
  end if;

  insert into core.users (id) values (p_target_user_id)
  on conflict (id) do nothing;

  select id into v_existing_id
    from workforce.employee_invitations
   where tenant_id = p_tenant_id and employee_id = p_employee_id and status = 'pending'
   for update;

  if found then
    update workforce.employee_invitations
       set target_user_id = p_target_user_id,
           expires_at = v_expires_at
     where id = v_existing_id;
    return query select v_existing_id, v_expires_at, true;
    return;
  end if;

  insert into workforce.employee_invitations
    (id, tenant_id, employee_id, target_user_id, invited_by, expires_at)
  values
    (p_invitation_id, p_tenant_id, p_employee_id, p_target_user_id, core.current_user_id(), v_expires_at);

  return query select p_invitation_id, v_expires_at, false;
end;
$$;

comment on function workforce.upsert_employee_invitation(uuid, uuid, uuid, uuid) is
  'The only path that creates/refreshes an employee_invitations row (invite AND resend). Now also requires core.has_module_access(p_tenant_id, ''workforce'') (WP-S5) -- a Manager should not be able to invite new staff into, or resend an invitation for, a tenant whose Workforce module is OFF. SECURITY DEFINER because there is deliberately no INSERT policy and no target_user_id/expires_at UPDATE policy for authenticated (0064); re-verifies core.has_permission_in_tenant(workforce.staff.manage) itself rather than trusting the caller already checked.';

-- workforce.permanently_delete_employee (0091, current body)
create or replace function workforce.permanently_delete_employee(
  p_tenant_id uuid,
  p_employee_id uuid
)
returns table (
  deleted boolean,
  blocked_by_history boolean
)
language plpgsql
security definer
set search_path = core, workforce, public
as $$
declare
  v_location_id uuid;
  v_has_history boolean;
begin
  if not core.has_module_access(p_tenant_id, 'workforce') then
    -- Zero rows -- same not-found-shaped result as every other guard below.
    return;
  end if;

  select e.location_id into v_location_id
  from workforce.employees e
  where e.tenant_id = p_tenant_id
    and e.id = p_employee_id;

  if v_location_id is null then
    return;
  end if;

  if not core.has_permission(p_tenant_id, 'workforce.staff.manage', v_location_id) then
    return;
  end if;

  select exists (
    select 1 from workforce.shifts s
    where s.tenant_id = p_tenant_id and s.employee_id = p_employee_id
    union all
    select 1 from workforce.attendance a
    where a.tenant_id = p_tenant_id and a.employee_id = p_employee_id
    union all
    select 1 from workforce.shift_requests r
    where r.tenant_id = p_tenant_id and r.employee_id = p_employee_id
    union all
    select 1 from workforce.shift_exchanges x
    where x.tenant_id = p_tenant_id
      and (x.requester_employee_id = p_employee_id or x.replacement_employee_id = p_employee_id)
    union all
    select 1 from workforce.staff_messages m
    where m.tenant_id = p_tenant_id and m.employee_id = p_employee_id
  ) into v_has_history;

  if v_has_history then
    return query select false, true;
    return;
  end if;

  delete from workforce.employees
  where tenant_id = p_tenant_id and id = p_employee_id;

  return query select true, false;
end;
$$;

comment on function workforce.permanently_delete_employee(uuid, uuid) is
  'Hard-deletes a workforce.employees row only when the tenant''s Workforce module is ON (WP-S5), the caller holds workforce.staff.manage for its location, and it has zero history across shifts/attendance/shift_requests/shift_exchanges/staff_messages (workforce.leave_requests excluded -- dead, unreachable legacy table, see 0056''s header). SECURITY DEFINER because authenticated has no DELETE grant on workforce.employees -- this function is the sole, guarded exception, and re-implements the module-access and manage-permission checks inline since it cannot rely on RLS for either. Returns zero rows for module-off/not-found/unauthorized (indistinguishable to the caller); returns (false, true) when blocked by history; returns (true, false) on success.';

-- workforce.permanently_delete_recipe (0057)
create or replace function workforce.permanently_delete_recipe(
  p_tenant_id uuid,
  p_recipe_id uuid
)
returns table (
  deleted boolean,
  blocked_not_archived boolean,
  media_path text
)
language plpgsql
security definer
set search_path = core, workforce, content, public
as $$
declare
  v_location_id uuid;
  v_status text;
  v_media_path text;
begin
  if not core.has_module_access(p_tenant_id, 'workforce') then
    return;
  end if;

  select r.location_id, r.status, r.media_path
    into v_location_id, v_status, v_media_path
  from workforce.recipes r
  where r.tenant_id = p_tenant_id
    and r.id = p_recipe_id;

  if v_status is null then
    return;
  end if;

  if not core.has_permission(p_tenant_id, 'workforce.recipe.manage', v_location_id) then
    return;
  end if;

  if v_status <> 'archived' then
    return query select false, true, null::text;
    return;
  end if;

  delete from content.translations
  where tenant_id = p_tenant_id
    and (
      (source_entity_type = 'workforce_recipe' and source_entity_id = p_recipe_id)
      or (source_entity_type = 'workforce_recipe_ingredient' and source_entity_id in (
            select id from workforce.recipe_ingredients where tenant_id = p_tenant_id and recipe_id = p_recipe_id))
      or (source_entity_type = 'workforce_recipe_step' and source_entity_id in (
            select id from workforce.recipe_steps where tenant_id = p_tenant_id and recipe_id = p_recipe_id))
      or (source_entity_type = 'workforce_recipe_note' and source_entity_id in (
            select id from workforce.recipe_notes where tenant_id = p_tenant_id and recipe_id = p_recipe_id))
    );

  delete from workforce.recipes
  where tenant_id = p_tenant_id and id = p_recipe_id;

  return query select true, false, v_media_path;
end;
$$;

comment on function workforce.permanently_delete_recipe(uuid, uuid) is
  'Hard-deletes a workforce.recipes row (cascading to its ingredients/steps/notes) only when the tenant''s Workforce module is ON (WP-S5), the caller holds workforce.recipe.manage for its location, and the recipe is currently Archived. Also explicitly deletes every content.translations row keyed to the recipe or any of its ingredients/steps/notes. SECURITY DEFINER because authenticated has no DELETE grant on workforce.recipes -- this function is the sole, guarded exception, and re-implements the module-access and manage-permission checks inline since it cannot rely on RLS for either. Returns zero rows for module-off/not-found/unauthorized (indistinguishable to the caller); returns (false, true, null) when the recipe is not Archived; returns (true, false, media_path) on success so the caller can remove the Storage object.';

-- ============================================================================
-- recipe-media Storage bucket (current live version is 0074, not 0052)
-- ============================================================================
drop policy if exists recipe_media_select on storage.objects;
create policy recipe_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'recipe-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_module_access((storage.foldername(name))[1]::uuid, 'workforce')
  and exists (
    select 1 from workforce.recipes r
    where r.tenant_id = (storage.foldername(name))[1]::uuid
      and r.id = (storage.foldername(name))[3]::uuid
      and (
        (r.location_id is null and (storage.foldername(name))[2]::uuid is not null
          and (
            core.has_permission_in_tenant(r.tenant_id, 'workforce.recipe.read')
            or core.has_permission_in_tenant(r.tenant_id, 'workforce.recipe.manage')
          ))
        or (r.location_id is not null and r.location_id = (storage.foldername(name))[2]::uuid
          and (
            core.has_permission(r.tenant_id, 'workforce.recipe.read', r.location_id)
            or core.has_permission(r.tenant_id, 'workforce.recipe.manage', r.location_id)
          ))
      )
  )
);

drop policy if exists recipe_media_insert on storage.objects;
create policy recipe_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'recipe-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_module_access((storage.foldername(name))[1]::uuid, 'workforce')
  and exists (
    select 1 from workforce.recipes r
    where r.tenant_id = (storage.foldername(name))[1]::uuid
      and r.id = (storage.foldername(name))[3]::uuid
      and (
        (r.location_id is null and (storage.foldername(name))[2]::uuid is not null
          and core.has_permission_in_tenant(r.tenant_id, 'workforce.recipe.manage'))
        or (r.location_id is not null and r.location_id = (storage.foldername(name))[2]::uuid
          and core.has_permission(r.tenant_id, 'workforce.recipe.manage', r.location_id))
      )
  )
);

drop policy if exists recipe_media_delete on storage.objects;
create policy recipe_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'recipe-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_module_access((storage.foldername(name))[1]::uuid, 'workforce')
  and exists (
    select 1 from workforce.recipes r
    where r.tenant_id = (storage.foldername(name))[1]::uuid
      and r.id = (storage.foldername(name))[3]::uuid
      and (
        (r.location_id is null and (storage.foldername(name))[2]::uuid is not null
          and core.has_permission_in_tenant(r.tenant_id, 'workforce.recipe.manage'))
        or (r.location_id is not null and r.location_id = (storage.foldername(name))[2]::uuid
          and core.has_permission(r.tenant_id, 'workforce.recipe.manage', r.location_id))
      )
  )
);
