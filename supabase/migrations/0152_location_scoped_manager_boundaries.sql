-- ============================================================================
-- 0152 — Store-scoped Manager boundaries (DEBT-139 L1, DB review P1)
-- ----------------------------------------------------------------------------
-- WHY: 0151 adds a Manager role assigned at ONE location. Older checks used
-- core.has_permission_in_tenant(tenant, perm) = "the permission at ANY
-- location". That was right while every Manager was tenant-wide (Cloud DEV
-- 2026-11-03: all manager / owner / admin assignments have location NULL), but
-- with a store Manager it lets the Manager of store A
--   * read and change LINE links and invitations of store B employees
--     (workforce.employee_line_links FOR ALL, employee_invitations
--     manager_read / manager_revoke),
--   * create / edit / publish tenant-wide (location NULL) recipes, recipe
--     categories, recipe media and Operations checklist templates + items,
--   * read the target-user Manager / Admin flags of any employee.
--
-- RULES (Lead decision, design §3.4):
--   1. Rows that belong to an employee are checked at the employee's home
--      location: core.has_permission(tenant, 'workforce.staff.manage',
--      employees.location_id) — a tenant-wide holder passes everywhere, a
--      store Manager only for staff of their store. Helper
--      workforce.caller_can_manage_employee (definer, answers about the caller).
--   2. Writing a tenant-wide row (location_id NULL) needs a TENANT-WIDE grant:
--      core.has_permission(tenant, perm, NULL). Store-bound rows keep
--      core.has_permission(tenant, perm, location_id).
--   3. Reading tenant-wide rows is unchanged: staff and store Managers of any
--      store still read shared published recipes, categories and templates
--      (has_permission_in_tenant on *.read). Only the manage-gated read of
--      tenant-wide recipe drafts (wf_recipes_select_manage) follows rule 2.
--
-- NOT CHANGED (reviewed, no tenant data in the answer): api.my_access
-- 'anyLocation' (UI hints only; RLS stays the boundary), core.realtime_topic_
-- allowed (0127: topics carry only a "changed" signal, every refetch goes
-- through RLS; per-location topics come with L2), api.operations_flag_missed_
-- critical (fast fail only; the per-location boundary is inside
-- operations.flag_missed_critical), workforce.upsert_employee_invitation
-- (already re-checks the employee's location, 0140).
--
-- Every policy is re-created with the exact 0097 / 0105 / 0074 / 0113 body
-- except the changed predicate. Roles unchanged (public; recipe media
-- authenticated). No new table, no grant to anon.
--
-- Rollback: commented block at the end.
-- ============================================================================

-- --- helper ------------------------------------------------------------------------
create or replace function workforce.caller_can_manage_employee(p_tenant_id uuid, p_employee_id uuid)
returns boolean
language sql stable security definer set search_path = core, workforce, public, pg_temp as $$
  select exists (
    select 1 from workforce.employees e
     where e.tenant_id = p_tenant_id
       and e.id = p_employee_id
       and core.has_permission(p_tenant_id, 'workforce.staff.manage', e.location_id));
$$;
comment on function workforce.caller_can_manage_employee(uuid, uuid) is
  '0152: true iff the CALLER holds workforce.staff.manage at the employee''s home location (tenant-wide holders: every employee; store Manager: staff of that store; employee without location: tenant-wide only). Definer so the answer does not depend on employees RLS; returns only a boolean about the caller''s own rights.';
revoke all on function workforce.caller_can_manage_employee(uuid, uuid) from public, anon;
grant execute on function workforce.caller_can_manage_employee(uuid, uuid) to authenticated;

-- --- 1. employee-owned rows ----------------------------------------------------------
drop policy if exists wf_employee_line_links_manage on workforce.employee_line_links;
create policy wf_employee_line_links_manage on workforce.employee_line_links
  for all
  using (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.caller_can_manage_employee(tenant_id, employee_id)
  )
  with check (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.caller_can_manage_employee(tenant_id, employee_id)
  );

drop policy if exists wf_employee_invitations_manager_read on workforce.employee_invitations;
create policy wf_employee_invitations_manager_read on workforce.employee_invitations
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and workforce.caller_can_manage_employee(tenant_id, employee_id)
  );

drop policy if exists wf_employee_invitations_manager_revoke on workforce.employee_invitations;
create policy wf_employee_invitations_manager_revoke on workforce.employee_invitations
  for update
  using (
    core.has_module_access(tenant_id, 'workforce')
    and status = 'pending'
    and workforce.caller_can_manage_employee(tenant_id, employee_id)
  )
  with check (
    status = 'revoked'
    and revoked_at is not null
  );

-- target-user role flags (0138 / 0140): only for an employee the caller manages
create or replace function core.employee_user_is_manager(p_tenant_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = core, public, pg_temp as $$
  select p_user_id is not null
     and exists (
       select 1 from workforce.employees e
        where e.tenant_id = p_tenant_id
          and e.user_id = p_user_id
          and core.has_permission(p_tenant_id, 'workforce.staff.manage', e.location_id))
     and exists (
       select 1 from core.role_assignments ra
        where ra.tenant_id = p_tenant_id
          and ra.user_id = p_user_id
          and ra.role_id = '00000000-0000-0000-0000-000000000005');
$$;

create or replace function core.employee_user_is_admin(p_tenant_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = core, public, pg_temp as $$
  select p_user_id is not null
     and exists (
       select 1 from workforce.employees e
        where e.tenant_id = p_tenant_id
          and e.user_id = p_user_id
          and core.has_permission(p_tenant_id, 'workforce.staff.manage', e.location_id))
     and exists (
       select 1 from core.role_assignments ra
        where ra.tenant_id = p_tenant_id
          and ra.user_id = p_user_id
          and ra.role_id = '00000000-0000-0000-0000-000000000004');
$$;

-- --- 2. tenant-wide recipes / categories / media -----------------------------------
drop policy if exists wf_recipe_categories_insert on workforce.recipe_categories;
create policy wf_recipe_categories_insert on workforce.recipe_categories
  for insert
  with check (
    core.has_module_access(tenant_id, 'recipes')
    and core.has_permission(tenant_id, 'workforce.recipe.manage', null)
  );

drop policy if exists wf_recipe_categories_update on workforce.recipe_categories;
create policy wf_recipe_categories_update on workforce.recipe_categories
  for update
  using (
    core.has_module_access(tenant_id, 'recipes')
    and core.has_permission(tenant_id, 'workforce.recipe.manage', null)
  )
  with check (
    core.has_module_access(tenant_id, 'recipes')
    and core.has_permission(tenant_id, 'workforce.recipe.manage', null)
  );

drop policy if exists wf_recipes_select_manage on workforce.recipes;
create policy wf_recipes_select_manage on workforce.recipes
  for select
  using (
    core.has_module_access(tenant_id, 'recipes')
    and (
      (location_id is null and core.has_permission(tenant_id, 'workforce.recipe.manage', null))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
    )
  );

drop policy if exists wf_recipes_insert on workforce.recipes;
create policy wf_recipes_insert on workforce.recipes
  for insert
  with check (
    core.has_module_access(tenant_id, 'recipes')
    and (
      (location_id is null and core.has_permission(tenant_id, 'workforce.recipe.manage', null))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
    )
    and (
      status <> 'published'
      or (location_id is null and core.has_permission(tenant_id, 'workforce.recipe.publish', null))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.publish', location_id))
    )
  );

drop policy if exists wf_recipes_update on workforce.recipes;
create policy wf_recipes_update on workforce.recipes
  for update
  using (
    core.has_module_access(tenant_id, 'recipes')
    and (
      (location_id is null and core.has_permission(tenant_id, 'workforce.recipe.manage', null))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
    )
  )
  with check (
    core.has_module_access(tenant_id, 'recipes')
    and (
      (location_id is null and core.has_permission(tenant_id, 'workforce.recipe.manage', null))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.manage', location_id))
    )
    and (
      status <> 'published'
      or (location_id is null and core.has_permission(tenant_id, 'workforce.recipe.publish', null))
      or (location_id is not null and core.has_permission(tenant_id, 'workforce.recipe.publish', location_id))
    )
  );

-- ingredients / steps / notes write through this (0097 policies unchanged)
create or replace function workforce.can_manage_recipe(p_recipe_id uuid)
returns boolean
language sql stable set search_path = core, workforce, public as $$
  select exists (
    select 1
    from workforce.recipes r
    where r.id = p_recipe_id
      and (
        (r.location_id is null and core.has_permission(r.tenant_id, 'workforce.recipe.manage', null))
        or (r.location_id is not null and core.has_permission(r.tenant_id, 'workforce.recipe.manage', r.location_id))
      )
  );
$$;

drop policy if exists recipe_media_insert on storage.objects;
create policy recipe_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-media'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and core.has_module_access(((storage.foldername(name))[1])::uuid, 'recipes')
    and exists (
      select 1 from workforce.recipes r
       where r.tenant_id = ((storage.foldername(objects.name))[1])::uuid
         and r.id = ((storage.foldername(objects.name))[3])::uuid
         and (
           (r.location_id is null
             and ((storage.foldername(objects.name))[2])::uuid is not null
             and core.has_permission(r.tenant_id, 'workforce.recipe.manage', null))
           or (r.location_id is not null
             and r.location_id = ((storage.foldername(objects.name))[2])::uuid
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
    and core.has_module_access(((storage.foldername(name))[1])::uuid, 'recipes')
    and exists (
      select 1 from workforce.recipes r
       where r.tenant_id = ((storage.foldername(objects.name))[1])::uuid
         and r.id = ((storage.foldername(objects.name))[3])::uuid
         and (
           (r.location_id is null
             and ((storage.foldername(objects.name))[2])::uuid is not null
             and core.has_permission(r.tenant_id, 'workforce.recipe.manage', null))
           or (r.location_id is not null
             and r.location_id = ((storage.foldername(objects.name))[2])::uuid
             and core.has_permission(r.tenant_id, 'workforce.recipe.manage', r.location_id))
         )
    )
  );

-- --- 3. tenant-wide Operations templates ----------------------------------------------
drop policy if exists operations_templates_insert on operations.checklist_templates;
create policy operations_templates_insert on operations.checklist_templates
  for insert
  with check (
    core.has_module_access(tenant_id, 'operations')
    and (
      (location_id is null and core.has_permission(tenant_id, 'operations.template.manage', null))
      or (location_id is not null and core.has_permission(tenant_id, 'operations.template.manage', location_id))
    )
    and is_active
    and retired_on is null
  );

drop policy if exists operations_templates_update on operations.checklist_templates;
create policy operations_templates_update on operations.checklist_templates
  for update
  using (
    core.has_module_access(tenant_id, 'operations')
    and (
      (location_id is null and core.has_permission(tenant_id, 'operations.template.manage', null))
      or (location_id is not null and core.has_permission(tenant_id, 'operations.template.manage', location_id))
    )
  )
  with check (
    core.has_module_access(tenant_id, 'operations')
    and (
      (location_id is null and core.has_permission(tenant_id, 'operations.template.manage', null))
      or (location_id is not null and core.has_permission(tenant_id, 'operations.template.manage', location_id))
    )
  );

-- items / schedules write through this
create or replace function operations.can_manage_template(p_tenant_id uuid, p_template_id uuid)
returns boolean
language sql stable as $$
  select exists (
    select 1 from operations.checklist_templates t
    where t.tenant_id = p_tenant_id
      and t.id = p_template_id
      and (
        (t.location_id is null and core.has_permission(t.tenant_id, 'operations.template.manage', null))
        or (t.location_id is not null and core.has_permission(t.tenant_id, 'operations.template.manage', t.location_id))
      )
  );
$$;

create or replace function api.operations_create_template(
  p_tenant_id uuid,
  p_name text,
  p_location_id uuid default null,
  p_category text default null,
  p_description text default null
)
returns uuid
language plpgsql
set search_path = api, operations, core, public
as $$
#variable_conflict use_column
declare
  v_user uuid := core.current_user_id();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'operations_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'operations') then
    raise exception 'operations_module_disabled' using errcode = 'P0001';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'operations_template_name_required' using errcode = 'P0001';
  end if;
  if p_location_id is null then
    -- 0152: a tenant-wide template needs a tenant-wide grant
    if not core.has_permission(p_tenant_id, 'operations.template.manage', null) then
      raise exception 'operations_permission_denied' using errcode = 'P0001';
    end if;
  else
    if operations.location_timezone(p_tenant_id, p_location_id) is null then
      raise exception 'operations_location_not_found' using errcode = 'P0002';
    end if;
    if not core.has_permission(p_tenant_id, 'operations.template.manage', p_location_id) then
      raise exception 'operations_permission_denied' using errcode = 'P0001';
    end if;
  end if;

  insert into operations.checklist_templates (tenant_id, location_id, name, category, description)
  values (p_tenant_id, p_location_id, btrim(p_name), p_category, p_description)
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================================
-- Rollback: re-create the policies / functions above with
-- core.has_permission_in_tenant(tenant, perm) in place of
-- core.has_permission(tenant, perm, null) (bodies: 0097 line links /
-- invitations / recipes, 0105 templates, 0074 recipe media, 0113 recipes
-- update, 0138 / 0140 flags) and
--   drop function if exists workforce.caller_can_manage_employee(uuid, uuid);
-- ============================================================================
