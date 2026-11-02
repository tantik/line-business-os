-- ============================================================================
-- 0150 — Several locations per client, DB layer (DEBT-139 step L1)
-- ----------------------------------------------------------------------------
-- Design: docs/architecture/multi-location-design-2026-11-02.md §3.1, §3.2,
-- §3.4, §3.6 and Founder decisions F1-F5 (§5).
--
-- 1. Permission core.location.manage (already in the 0008 catalog and given
--    to tenant_owner + tenant_admin by 0008's bulk role mapping; manager /
--    employee / client never had it). Re-seeded idempotently here and removed
--    from manager / employee / client should any environment have drifted.
--    Tenant-wide: every check below is core.has_permission(tenant, key, NULL),
--    i.e. a role assignment with location_id NULL.
-- 2. Entitlement: core.plan_default_limits row (module core, limit_key
--    max_locations, value 3) for every existing plan code (F4: up to 3 stores
--    self-service; more = a per-tenant core.tenant_entitlement_limits row set
--    by ORUWA). ON CONFLICT DO NOTHING: an existing value is never overwritten.
--    Checked with core.check_entitlement_limit(tenant, 'core', 'max_locations',
--    <active location count>) before a location is created or reactivated.
-- 3. Location lifecycle. One internal SECURITY DEFINER writer per operation
--    (no grant to any role), each with two entry points (same split as 0133):
--      cabinet  core.caller_*  (authenticated; actor = core.current_user_id(),
--               needs core.location.manage tenant-wide, else 42501)
--      console  core.platform_* (service_role only; p_actor_id checked by
--               core.assert_platform_staff_actor, 42501 actor_not_platform_staff)
--    and SECURITY INVOKER api.* passthroughs (ADR 0008):
--      api.create_location(tenant, name, timezone = 'Asia/Tokyo', source = NULL)
--      api.rename_location(location, name)
--      api.set_location_active(location, is_active)
--      api.platform_create_location / platform_rename_location /
--      platform_set_location_active (same arguments + p_actor_id last).
--    core.create_location: the tenant must exist with status active
--    (tenant_not_active); name trimmed 1-60 characters (invalid_location_name),
--    unique among the tenant's ACTIVE locations case-insensitively
--    (location_name_taken); timezone in pg_timezone_names (invalid_timezone);
--    serialized per tenant (pg_advisory_xact_lock), then the max_locations
--    limit (location_limit_reached). The per-location defaults are COPIED from
--    a source location: p_source_location_id (an active location of the same
--    tenant, else location_not_found) or the tenant's oldest active location:
--      workforce.schedule_settings (auto_create_enabled forced false, last
--        generated month cleared), workforce.shift_types (active ones),
--      operations checklist templates bound to the source (active) with their
--        active items, and the active task schedules at the source (of those
--        templates or of active tenant-wide templates); effective_from = the
--        later of the source version's start and today in the NEW location's
--        timezone, never before current_date (the 0133 rule); one new
--        schedule_group_id per source group; versions already ended before
--        that day are skipped,
--      purchases.receipt_settings, only when the source has a row.
--    NOT copied: inventory, purchases, recipes, employees, shifts, issues,
--    attendance, messages (the store's own data).
--    rename: same name rules (uniqueness only while active); identical name =
--    no-op. set_location_active(false) = archive (no physical delete; history
--    stays readable): refused for the last active location
--    (last_active_location) or while an active employee has it as home
--    (location_has_active_staff). set_location_active(true) re-checks the
--    limit and name uniqueness. Same state = no-op. One audit.audit_logs row
--    per real change (module core, entity location, actions create / rename /
--    deactivate / reactivate; ids, timezone, counts only — no names, no PII).
--    Error codes: P0001 + stable message (22004 for NULL arguments, 42501 for
--    permission, 28000 when not signed in), like 0133 / 0138 / 0141. The
--    cabinet rename / set_active answer 42501 also for an unknown location id
--    (no existence oracle across tenants).
-- 4. api.my_locations (security_invoker view, like api.my_tenant_locations
--    which stays unchanged — the web still uses it): for the caller, per
--    tenant with an ACTIVE membership, the locations they relate to, with
--    access = 'all'    (tenant-wide role granting workforce.staff.manage:
--                       Owner / Admin / tenant-wide Manager; every location,
--                       inactive ones included),
--             'manage' (such a role assigned at that location),
--             'staff'  (an active workforce.employees row of the caller with
--                       that home location; core.caller_is_employee_at, a
--                       narrow definer boolean about the caller only, so the
--                       answer does not depend on the Workforce module RLS).
--    Strongest access wins; inactive locations only for 'all'. Unrelated
--    locations are not listed.
-- 5. Manager scope (DEBT-091): new overload core/api.set_employee_manager_role
--    (tenant, employee, is_manager, p_scope) with p_scope 'tenant' |
--    'location'. 'location' writes the manager role assignment at the
--    employee's home location (workforce.employees.location_id). The 0138
--    3-argument functions are NOT touched (existing callers and 0077 keep the
--    exact behaviour); revoke through either removes every manager
--    assignment of that user in the tenant (both scopes). Appoint with a
--    different scope replaces the existing manager assignment(s) (one audit
--    row, the replaced ids in metadata); same scope = no-op.
-- 6. api.move_employee_location(employee, location) (core.location.manage):
--    target = an active location of the employee's tenant (location_not_found);
--    refused while the employee has shifts at the old location starting today
--    or later in the old location's calendar (employee_has_future_shifts).
--    Updates workforce.employees.location_id, moves the user's employee and
--    manager role assignments in this tenant from the old location to the new
--    one (tenant-wide ones untouched; a duplicate at the target is dropped
--    instead), and the membership's default location when it pointed at the
--    old one. One audit row (module workforce, entity employee, action
--    move_location). Rows that carry their own location_id (shifts history,
--    attendance, requests, exchanges, staff messages) stay at the location
--    where they happened; no table has a composite (employee, location) FK.
--
-- Security: every SECURITY DEFINER function lives in core with a pinned
-- search_path and is revoked from public / anon; internal writers are granted
-- to nobody; api.* is SECURITY INVOKER (ADR 0008). authenticated still has
-- only SELECT on core.locations (0017), so the RPCs are the only write path.
-- No new table, no Realtime, no polling.
--
-- Cost: all rare Owner / console actions; api.my_locations evaluates up to
-- three indexed EXISTS per location of the caller's tenants (a handful).
--
-- Rollback: commented block at the end of this file.
-- ============================================================================

-- --- 1. permission ---------------------------------------------------------------
insert into core.permissions (key, module, description) values
  ('core.location.manage', 'core', 'Manage tenant locations')
on conflict (key) do update set description = excluded.description, module = excluded.module;

insert into core.role_permissions (role_id, permission_key) values
  ('00000000-0000-0000-0000-000000000003', 'core.location.manage'),  -- tenant_owner
  ('00000000-0000-0000-0000-000000000004', 'core.location.manage')   -- tenant_admin
on conflict do nothing;

-- Owner / Admin only (design 3.1): never a Manager, Employee or Client.
delete from core.role_permissions
 where permission_key = 'core.location.manage'
   and role_id in ('00000000-0000-0000-0000-000000000005',   -- manager
                   '00000000-0000-0000-0000-000000000006',   -- employee
                   '00000000-0000-0000-0000-000000000007');  -- client

-- --- 2. entitlement: max_locations = 3 per plan (F4) -------------------------------
insert into core.plan_default_limits (plan_code, module, limit_key, limit_value)
select p.code, 'core', 'max_locations', 3
  from core.entitlement_plans p
on conflict (plan_code, module, limit_key) do nothing;

-- --- 3a. shared checks (internal) -------------------------------------------------
create or replace function core.assert_location_name(p_name text)
returns text
language plpgsql immutable set search_path = core, public, pg_temp as $$
declare
  v_name text := btrim(p_name);
begin
  if v_name is null or char_length(v_name) not between 1 and 60 then
    raise exception 'invalid_location_name' using errcode = 'P0001';
  end if;
  return v_name;
end;
$$;
comment on function core.assert_location_name(text) is
  '0150: trims a location name and raises invalid_location_name (P0001) unless it is 1-60 characters. Internal.';

create or replace function core.assert_tenant_active(p_tenant_id uuid)
returns void
language plpgsql stable security definer set search_path = core, public, pg_temp as $$
begin
  if not exists (select 1 from core.tenants t where t.id = p_tenant_id and t.status = 'active') then
    raise exception 'tenant_not_active' using errcode = 'P0001';
  end if;
end;
$$;
comment on function core.assert_tenant_active(uuid) is
  '0150: raises tenant_not_active (P0001) unless the tenant exists with status active. Internal.';

create or replace function core.assert_location_name_free(p_tenant_id uuid, p_name text, p_except_location_id uuid)
returns void
language plpgsql stable security definer set search_path = core, public, pg_temp as $$
begin
  if exists (
    select 1 from core.locations l
     where l.tenant_id = p_tenant_id and l.is_active
       and l.id is distinct from p_except_location_id
       and lower(btrim(l.name)) = lower(p_name)
  ) then
    raise exception 'location_name_taken' using errcode = 'P0001';
  end if;
end;
$$;
comment on function core.assert_location_name_free(uuid, text, uuid) is
  '0150: raises location_name_taken (P0001) when another ACTIVE location of the tenant has the same trimmed name, case-insensitively. Internal; callers hold the per-tenant location lock.';

create or replace function core.assert_location_limit(p_tenant_id uuid)
returns void
language plpgsql stable security definer set search_path = core, public, pg_temp as $$
declare
  v_active bigint;
begin
  select count(*) into v_active from core.locations l where l.tenant_id = p_tenant_id and l.is_active;
  if not core.check_entitlement_limit(p_tenant_id, 'core', 'max_locations', v_active) then
    raise exception 'location_limit_reached' using errcode = 'P0001';
  end if;
end;
$$;
comment on function core.assert_location_limit(uuid) is
  '0150: raises location_limit_reached (P0001) when one more ACTIVE location would exceed the tenant''s max_locations entitlement (tenant override, else plan default; no row = unlimited). Internal; callers hold the per-tenant location lock.';

-- one writer per tenant for every location change (name uniqueness + limit)
create or replace function core.lock_tenant_locations(p_tenant_id uuid)
returns void
language sql volatile set search_path = core, public, pg_temp as $$
  select pg_advisory_xact_lock(hashtextextended('core.locations:tenant:' || p_tenant_id::text, 0));
$$;

-- --- 3b. create (internal writer) --------------------------------------------------
create or replace function core.create_location(
  p_tenant_id uuid,
  p_name text,
  p_timezone text,
  p_source_location_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql security definer set search_path = core, workforce, operations, purchases, audit, public, pg_temp as $$
declare
  v_name text;
  v_source uuid;
  v_location uuid;
  v_from date;
  v_tpl record;
  v_new_tpl uuid;
  v_n int;
  v_n_ss int := 0;
  v_n_shift int := 0;
  v_n_tpl int := 0;
  v_n_item int := 0;
  v_n_sched int := 0;
  v_n_rs int := 0;
begin
  if p_tenant_id is null or p_name is null or p_timezone is null or p_actor_id is null then
    raise exception 'invalid_argument: tenant_id, name, timezone and actor are required' using errcode = '22004';
  end if;
  perform core.assert_tenant_active(p_tenant_id);
  v_name := core.assert_location_name(p_name);
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone' using errcode = 'P0001';
  end if;

  perform core.lock_tenant_locations(p_tenant_id);
  perform core.assert_location_limit(p_tenant_id);
  perform core.assert_location_name_free(p_tenant_id, v_name, null);

  if p_source_location_id is not null then
    select l.id into v_source from core.locations l
     where l.tenant_id = p_tenant_id and l.id = p_source_location_id and l.is_active;
    if v_source is null then
      raise exception 'location_not_found' using errcode = 'P0001';
    end if;
  else
    select l.id into v_source from core.locations l
     where l.tenant_id = p_tenant_id and l.is_active
     order by l.created_at, l.id
     limit 1;
  end if;

  insert into core.locations (tenant_id, name, timezone)
  values (p_tenant_id, v_name, p_timezone)
  returning id into v_location;

  if v_source is not null then
    -- schedule settings (auto-create stays OFF until the Owner turns it on)
    insert into workforce.schedule_settings
      (tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours,
       max_weekly_hours, max_days_per_week, auto_create_day_of_month, auto_create_enabled)
    select s.tenant_id, v_location, s.required_headcount_by_weekday, s.max_monthly_hours,
           s.max_weekly_hours, s.max_days_per_week, s.auto_create_day_of_month, false
      from workforce.schedule_settings s
     where s.tenant_id = p_tenant_id and s.location_id = v_source;
    get diagnostics v_n_ss = row_count;

    -- shift types (active ones; retired types stay with the source's history)
    insert into workforce.shift_types
      (tenant_id, location_id, code, label_ja, label_en, starts_at_local, ends_at_local,
       break_minutes, is_custom, sort_order)
    select st.tenant_id, v_location, st.code, st.label_ja, st.label_en, st.starts_at_local,
           st.ends_at_local, st.break_minutes, st.is_custom, st.sort_order
      from workforce.shift_types st
     where st.tenant_id = p_tenant_id and st.location_id = v_source and st.is_active;
    get diagnostics v_n_shift = row_count;

    -- Operations: schedules start today in the NEW location's calendar, never
    -- before the server date (no backdated obligation; 0133 rule)
    v_from := greatest(current_date, (now() at time zone p_timezone)::date);

    for v_tpl in
      select t.id from operations.checklist_templates t
       where t.tenant_id = p_tenant_id and t.location_id = v_source and t.is_active
       order by t.created_at, t.id
    loop
      insert into operations.checklist_templates (tenant_id, location_id, name, category, description)
      select t.tenant_id, v_location, t.name, t.category, t.description
        from operations.checklist_templates t where t.id = v_tpl.id
      returning id into v_new_tpl;
      v_n_tpl := v_n_tpl + 1;

      insert into operations.checklist_items
        (tenant_id, template_id, label, response_type, is_critical, is_required,
         numeric_min, numeric_max, numeric_unit, sort_order)
      select i.tenant_id, v_new_tpl, i.label, i.response_type, i.is_critical, i.is_required,
             i.numeric_min, i.numeric_max, i.numeric_unit, i.sort_order
        from operations.checklist_items i
       where i.tenant_id = p_tenant_id and i.template_id = v_tpl.id and i.is_active;
      get diagnostics v_n = row_count;
      v_n_item := v_n_item + v_n;

      insert into operations.task_schedules
        (tenant_id, location_id, template_id, recurrence_kind, weekdays, due_time,
         window_end_time, effective_from, effective_to, is_active, schedule_group_id)
      select s.tenant_id, v_location, v_new_tpl, s.recurrence_kind, s.weekdays, s.due_time,
             s.window_end_time, greatest(s.effective_from, v_from), s.effective_to, true,
             md5(v_location::text || ':' || s.schedule_group_id::text)::uuid
        from operations.task_schedules s
       where s.tenant_id = p_tenant_id and s.location_id = v_source and s.template_id = v_tpl.id
         and s.is_active and (s.effective_to is null or s.effective_to >= v_from);
      get diagnostics v_n = row_count;
      v_n_sched := v_n_sched + v_n;
    end loop;

    -- schedules of active tenant-wide templates (the template itself is shared)
    insert into operations.task_schedules
      (tenant_id, location_id, template_id, recurrence_kind, weekdays, due_time,
       window_end_time, effective_from, effective_to, is_active, schedule_group_id)
    select s.tenant_id, v_location, s.template_id, s.recurrence_kind, s.weekdays, s.due_time,
           s.window_end_time, greatest(s.effective_from, v_from), s.effective_to, true,
           md5(v_location::text || ':' || s.schedule_group_id::text)::uuid
      from operations.task_schedules s
      join operations.checklist_templates t on t.tenant_id = s.tenant_id and t.id = s.template_id
     where s.tenant_id = p_tenant_id and s.location_id = v_source
       and t.location_id is null and t.is_active
       and s.is_active and (s.effective_to is null or s.effective_to >= v_from);
    get diagnostics v_n = row_count;
    v_n_sched := v_n_sched + v_n;

    -- receipt settings: only when the source has its own row (no row = defaults)
    insert into purchases.receipt_settings (tenant_id, location_id, receipts_enabled, photo_mode, updated_by)
    select r.tenant_id, v_location, r.receipts_enabled, r.photo_mode, p_actor_id
      from purchases.receipt_settings r
     where r.tenant_id = p_tenant_id and r.location_id = v_source;
    get diagnostics v_n_rs = row_count;
  end if;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (p_tenant_id, p_actor_id, 'user', 'core', 'location', v_location::text, 'create', null,
          jsonb_build_object('is_active', true, 'timezone', p_timezone),
          jsonb_build_object(
            'source_location_id', v_source,
            'counts', jsonb_build_object(
              'schedule_settings', v_n_ss,
              'shift_types', v_n_shift,
              'operations_templates', v_n_tpl,
              'operations_items', v_n_item,
              'operations_schedules', v_n_sched,
              'receipt_settings', v_n_rs)));

  return jsonb_build_object(
    'location_id', v_location,
    'tenant_id', p_tenant_id,
    'source_location_id', v_source,
    'counts', jsonb_build_object(
      'schedule_settings', v_n_ss,
      'shift_types', v_n_shift,
      'operations_templates', v_n_tpl,
      'operations_items', v_n_item,
      'operations_schedules', v_n_sched,
      'receipt_settings', v_n_rs));
end;
$$;
comment on function core.create_location(uuid, text, text, uuid, uuid) is
  'DEBT-139 L1 (0150): creates an active location for an active tenant and copies the per-location defaults from the source (given active location, else the oldest active one): schedule settings (auto-create off), active shift types, active location-bound Operations templates + active items, active schedules (effective_from = max(source start, today in the new timezone, current_date)), receipt settings when the source has a row. Serialized per tenant; refuses tenant_not_active, invalid_location_name, invalid_timezone, location_limit_reached (max_locations), location_name_taken, location_not_found. One audit row (counts, no names). Internal: called only by core.caller_create_location / core.platform_create_location.';

-- --- 3c. rename / activate (internal writers) ----------------------------------------
create or replace function core.rename_location(p_location_id uuid, p_name text, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = core, audit, public, pg_temp as $$
declare
  v_tenant uuid;
  v_loc record;
  v_name text;
begin
  if p_location_id is null or p_name is null or p_actor_id is null then
    raise exception 'invalid_argument: location_id, name and actor are required' using errcode = '22004';
  end if;
  select l.tenant_id into v_tenant from core.locations l where l.id = p_location_id;
  if v_tenant is null then
    raise exception 'location_not_found' using errcode = 'P0001';
  end if;
  perform core.assert_tenant_active(v_tenant);
  v_name := core.assert_location_name(p_name);

  perform core.lock_tenant_locations(v_tenant);
  select l.id, l.name, l.is_active into v_loc from core.locations l where l.id = p_location_id for update;

  if v_loc.name = v_name then
    return jsonb_build_object('location_id', p_location_id, 'changed', false);
  end if;
  if v_loc.is_active then
    perform core.assert_location_name_free(v_tenant, v_name, p_location_id);
  end if;

  update core.locations set name = v_name where id = p_location_id;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (v_tenant, p_actor_id, 'user', 'core', 'location', p_location_id::text, 'rename',
          jsonb_build_object('name_changed', false), jsonb_build_object('name_changed', true),
          jsonb_build_object('is_active', v_loc.is_active));

  return jsonb_build_object('location_id', p_location_id, 'changed', true);
end;
$$;
comment on function core.rename_location(uuid, text, uuid) is
  'DEBT-139 L1 (0150): renames a location (trimmed 1-60, unique among ACTIVE locations of the tenant while it is active). Same name = no-op. Refuses location_not_found, tenant_not_active, invalid_location_name, location_name_taken. One audit row (no names). Internal.';

create or replace function core.set_location_active(p_location_id uuid, p_is_active boolean, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = core, workforce, audit, public, pg_temp as $$
declare
  v_tenant uuid;
  v_loc record;
begin
  if p_location_id is null or p_is_active is null or p_actor_id is null then
    raise exception 'invalid_argument: location_id, is_active and actor are required' using errcode = '22004';
  end if;
  select l.tenant_id into v_tenant from core.locations l where l.id = p_location_id;
  if v_tenant is null then
    raise exception 'location_not_found' using errcode = 'P0001';
  end if;
  perform core.assert_tenant_active(v_tenant);

  perform core.lock_tenant_locations(v_tenant);
  select l.id, l.name, l.is_active into v_loc from core.locations l where l.id = p_location_id for update;

  if v_loc.is_active = p_is_active then
    return jsonb_build_object('location_id', p_location_id, 'is_active', p_is_active, 'changed', false);
  end if;

  if not p_is_active then
    if not exists (select 1 from core.locations l
                    where l.tenant_id = v_tenant and l.is_active and l.id <> p_location_id) then
      raise exception 'last_active_location' using errcode = 'P0001';
    end if;
    if exists (select 1 from workforce.employees e
                where e.tenant_id = v_tenant and e.location_id = p_location_id and e.is_active) then
      raise exception 'location_has_active_staff' using errcode = 'P0001';
    end if;
  else
    perform core.assert_location_limit(v_tenant);
    perform core.assert_location_name_free(v_tenant, btrim(v_loc.name), p_location_id);
  end if;

  update core.locations set is_active = p_is_active where id = p_location_id;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (v_tenant, p_actor_id, 'user', 'core', 'location', p_location_id::text,
          case when p_is_active then 'reactivate' else 'deactivate' end,
          jsonb_build_object('is_active', not p_is_active), jsonb_build_object('is_active', p_is_active),
          '{}'::jsonb);

  return jsonb_build_object('location_id', p_location_id, 'is_active', p_is_active, 'changed', true);
end;
$$;
comment on function core.set_location_active(uuid, boolean, uuid) is
  'DEBT-139 L1 (0150): archive (false) or reactivate (true) a location; never deletes. Archive refuses last_active_location and location_has_active_staff (an active employee has it as home); reactivate re-checks location_limit_reached and location_name_taken. Same state = no-op. One audit row (deactivate / reactivate). Internal.';

-- --- 3d. cabinet entry points (authenticated) ------------------------------------------
create or replace function core.caller_create_location(
  p_tenant_id uuid, p_name text, p_timezone text, p_source_location_id uuid
)
returns jsonb
language plpgsql security definer set search_path = core, public, pg_temp as $$
declare
  v_uid uuid := core.current_user_id();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_tenant_id is null then
    raise exception 'invalid_argument: tenant_id is required' using errcode = '22004';
  end if;
  if not core.has_permission(p_tenant_id, 'core.location.manage', null) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return core.create_location(p_tenant_id, p_name, p_timezone, p_source_location_id, v_uid);
end;
$$;

-- the tenant of a location, only when the caller manages locations there
-- (42501 otherwise, also for an unknown id: no existence oracle)
create or replace function core.caller_location_tenant(p_location_id uuid)
returns uuid
language plpgsql stable security definer set search_path = core, public, pg_temp as $$
declare
  v_uid uuid := core.current_user_id();
  v_tenant uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_location_id is null then
    raise exception 'invalid_argument: location_id is required' using errcode = '22004';
  end if;
  select l.tenant_id into v_tenant from core.locations l where l.id = p_location_id;
  if v_tenant is null or not core.has_permission(v_tenant, 'core.location.manage', null) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return v_tenant;
end;
$$;

create or replace function core.caller_rename_location(p_location_id uuid, p_name text)
returns jsonb
language plpgsql security definer set search_path = core, public, pg_temp as $$
begin
  perform core.caller_location_tenant(p_location_id);
  return core.rename_location(p_location_id, p_name, core.current_user_id());
end;
$$;

create or replace function core.caller_set_location_active(p_location_id uuid, p_is_active boolean)
returns jsonb
language plpgsql security definer set search_path = core, public, pg_temp as $$
begin
  perform core.caller_location_tenant(p_location_id);
  return core.set_location_active(p_location_id, p_is_active, core.current_user_id());
end;
$$;

comment on function core.caller_create_location(uuid, text, text, uuid) is
  '0150: cabinet entry to core.create_location. Actor = core.current_user_id() (28000 when not signed in); requires core.location.manage tenant-wide (42501).';
comment on function core.caller_location_tenant(uuid) is
  '0150: tenant of a location when the caller holds core.location.manage there tenant-wide; else 42501 (also for an unknown id). Internal.';
comment on function core.caller_rename_location(uuid, text) is
  '0150: cabinet entry to core.rename_location (core.location.manage tenant-wide, else 42501).';
comment on function core.caller_set_location_active(uuid, boolean) is
  '0150: cabinet entry to core.set_location_active (core.location.manage tenant-wide, else 42501).';

-- --- 3e. console entry points (service_role; actor re-checked) ---------------------------
create or replace function core.platform_create_location(
  p_tenant_id uuid, p_name text, p_timezone text, p_source_location_id uuid, p_actor_id uuid
)
returns jsonb
language plpgsql security definer set search_path = core, public, pg_temp as $$
begin
  perform core.assert_platform_staff_actor(p_actor_id);
  return core.create_location(p_tenant_id, p_name, p_timezone, p_source_location_id, p_actor_id);
end;
$$;

create or replace function core.platform_rename_location(p_location_id uuid, p_name text, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = core, public, pg_temp as $$
begin
  perform core.assert_platform_staff_actor(p_actor_id);
  return core.rename_location(p_location_id, p_name, p_actor_id);
end;
$$;

create or replace function core.platform_set_location_active(p_location_id uuid, p_is_active boolean, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = core, public, pg_temp as $$
begin
  perform core.assert_platform_staff_actor(p_actor_id);
  return core.set_location_active(p_location_id, p_is_active, p_actor_id);
end;
$$;

comment on function core.platform_create_location(uuid, text, text, uuid, uuid) is
  '0150: ORUWA console entry to core.create_location (service_role only; p_actor_id must be a platform-staff core.users row, else 42501 actor_not_platform_staff).';
comment on function core.platform_rename_location(uuid, text, uuid) is
  '0150: ORUWA console entry to core.rename_location (service_role only; platform-staff actor).';
comment on function core.platform_set_location_active(uuid, boolean, uuid) is
  '0150: ORUWA console entry to core.set_location_active (service_role only; platform-staff actor).';

-- --- 5. scoped Manager appointment (new overload; the 0138 3-arg stays as is) -----------
create or replace function core.set_employee_manager_role(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_is_manager boolean,
  p_scope text
)
returns jsonb
language plpgsql security definer set search_path = core, workforce, audit, public, pg_temp as $$
declare
  v_uid uuid := core.current_user_id();
  v_emp record;
  v_manager_role uuid := '00000000-0000-0000-0000-000000000005';
  v_target uuid;
  v_was boolean;
  v_ids uuid[];
  v_locs uuid[];
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_tenant_id is null or p_employee_id is null or p_is_manager is null or p_scope is null then
    raise exception 'invalid_argument: tenant_id, employee_id, is_manager and scope are required' using errcode = '22004';
  end if;
  if p_scope not in ('tenant', 'location') then
    raise exception 'invalid_argument: scope must be tenant or location' using errcode = '22023';
  end if;
  if not core.has_permission(p_tenant_id, 'core.role.manage', null) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not core.has_module_access(p_tenant_id, 'workforce') then
    raise exception 'workforce_module_disabled' using errcode = 'P0001';
  end if;
  if not exists (select 1 from core.roles where id = v_manager_role and tenant_id is null and key = 'manager') then
    raise exception 'role_missing' using errcode = 'P0001';
  end if;

  select e.id, e.user_id, e.is_active, e.location_id into v_emp
    from workforce.employees e
   where e.tenant_id = p_tenant_id and e.id = p_employee_id
   for update;
  if not found then
    raise exception 'employee_not_found' using errcode = 'P0002';
  end if;
  if not v_emp.is_active then
    raise exception 'employee_inactive' using errcode = 'P0001';
  end if;
  if v_emp.user_id is null then
    raise exception 'employee_has_no_account' using errcode = 'P0001';
  end if;
  if v_emp.user_id = v_uid then
    raise exception 'cannot_change_own_role' using errcode = 'P0001';
  end if;
  if p_is_manager and p_scope = 'location' and v_emp.location_id is null then
    raise exception 'employee_has_no_location' using errcode = 'P0001';
  end if;
  v_target := case when p_scope = 'location' then v_emp.location_id end;

  -- same lock key as 0138, so both overloads serialize with each other
  perform pg_advisory_xact_lock(hashtextextended('core.role_assignments:manager:' || p_tenant_id::text || ':' || v_emp.user_id::text, 0));

  select coalesce(array_agg(id order by id), '{}'), coalesce(array_agg(location_id order by id), '{}')
    into v_ids, v_locs
    from core.role_assignments
   where tenant_id = p_tenant_id and user_id = v_emp.user_id and role_id = v_manager_role;
  v_was := cardinality(v_ids) > 0;

  if not p_is_manager then
    if not v_was then
      return jsonb_build_object('employee_id', p_employee_id, 'is_manager', false, 'scope', null, 'changed', false);
    end if;
    delete from core.role_assignments where id = any(v_ids);
    insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
    values (p_tenant_id, v_uid, 'user', 'core', 'role_assignment', v_ids[1]::text, 'revoke_manager',
            jsonb_build_object('is_manager', true), jsonb_build_object('is_manager', false),
            jsonb_build_object('employee_id', p_employee_id, 'user_id', v_emp.user_id, 'role_key', 'manager',
                               'role_assignment_ids', to_jsonb(v_ids), 'reason', 'owner_revoked'));
    return jsonb_build_object('employee_id', p_employee_id, 'is_manager', false, 'scope', null, 'changed', true);
  end if;

  -- already exactly this scope: no-op
  if cardinality(v_ids) = 1 and v_locs[1] is not distinct from v_target then
    return jsonb_build_object('employee_id', p_employee_id, 'is_manager', true, 'scope', p_scope, 'changed', false);
  end if;

  if v_was then
    delete from core.role_assignments where id = any(v_ids);
  end if;
  insert into core.role_assignments (tenant_id, user_id, role_id, location_id)
  values (p_tenant_id, v_emp.user_id, v_manager_role, v_target)
  returning id into v_new_id;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (p_tenant_id, v_uid, 'user', 'core', 'role_assignment', v_new_id::text, 'appoint_manager',
          jsonb_build_object('is_manager', v_was), jsonb_build_object('is_manager', true),
          jsonb_build_object('employee_id', p_employee_id, 'user_id', v_emp.user_id, 'role_key', 'manager',
                             'scope', p_scope, 'location_id', v_target,
                             'replaced_role_assignment_ids', to_jsonb(v_ids)));

  return jsonb_build_object('employee_id', p_employee_id, 'is_manager', true, 'scope', p_scope, 'changed', true);
end;
$$;
comment on function core.set_employee_manager_role(uuid, uuid, boolean, text) is
  'DEBT-139 L1 (0150): 0138 appointment with a scope. p_scope tenant = manager role_assignment with location NULL; location = at the employee''s home location (employee_has_no_location when it has none). Same checks and codes as the 3-argument 0138 function (which is unchanged). Appoint with another scope replaces the existing manager assignment(s); same scope = no-op; revoke (p_is_manager false) removes every manager assignment of that user in the tenant, whatever the scope. One audit row per real change. Identity = core.current_user_id().';

-- --- 6. move an employee to another location -----------------------------------------
create or replace function core.move_employee_location(p_employee_id uuid, p_location_id uuid)
returns jsonb
language plpgsql security definer set search_path = core, workforce, audit, public, pg_temp as $$
declare
  v_uid uuid := core.current_user_id();
  c_employee_role constant uuid := '00000000-0000-0000-0000-000000000006';
  c_manager_role constant uuid := '00000000-0000-0000-0000-000000000005';
  v_tenant uuid;
  v_emp record;
  v_old_tz text;
  v_role uuid;
  v_ids uuid[];
  v_moved uuid[] := '{}';
  v_dropped uuid[] := '{}';
  v_membership boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_employee_id is null or p_location_id is null then
    raise exception 'invalid_argument: employee_id and location_id are required' using errcode = '22004';
  end if;

  -- rights before the row lock; unknown employee = 42501 (no existence oracle)
  select e.tenant_id into v_tenant from workforce.employees e where e.id = p_employee_id;
  if v_tenant is null or not core.has_permission(v_tenant, 'core.location.manage', null) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select e.id, e.tenant_id, e.location_id, e.user_id, e.is_active into v_emp
    from workforce.employees e where e.id = p_employee_id for update;

  if not exists (select 1 from core.locations l
                  where l.tenant_id = v_emp.tenant_id and l.id = p_location_id and l.is_active) then
    raise exception 'location_not_found' using errcode = 'P0001';
  end if;
  if v_emp.location_id is not distinct from p_location_id then
    return jsonb_build_object('employee_id', p_employee_id, 'from_location_id', v_emp.location_id,
                              'to_location_id', p_location_id, 'changed', false);
  end if;

  if v_emp.location_id is not null then
    select l.timezone into v_old_tz from core.locations l where l.id = v_emp.location_id;
    if exists (
      select 1 from workforce.shifts s
       where s.tenant_id = v_emp.tenant_id and s.employee_id = p_employee_id
         and s.location_id = v_emp.location_id
         and (s.starts_at at time zone v_old_tz)::date >= (now() at time zone v_old_tz)::date
    ) then
      raise exception 'employee_has_future_shifts' using errcode = 'P0001';
    end if;
  end if;

  update workforce.employees set location_id = p_location_id where id = p_employee_id;

  if v_emp.user_id is not null and v_emp.location_id is not null then
    -- same lock key as the Manager appointment (0138 / 0150)
    perform pg_advisory_xact_lock(hashtextextended('core.role_assignments:manager:' || v_emp.tenant_id::text || ':' || v_emp.user_id::text, 0));
    foreach v_role in array array[c_employee_role, c_manager_role] loop
      if exists (select 1 from core.role_assignments
                  where tenant_id = v_emp.tenant_id and user_id = v_emp.user_id
                    and role_id = v_role and location_id = p_location_id) then
        with gone as (
          delete from core.role_assignments
           where tenant_id = v_emp.tenant_id and user_id = v_emp.user_id
             and role_id = v_role and location_id = v_emp.location_id
          returning id)
        select coalesce(array_agg(id), '{}') into v_ids from gone;
        v_dropped := v_dropped || v_ids;
      else
        with moved as (
          update core.role_assignments set location_id = p_location_id
           where tenant_id = v_emp.tenant_id and user_id = v_emp.user_id
             and role_id = v_role and location_id = v_emp.location_id
          returning id)
        select coalesce(array_agg(id), '{}') into v_ids from moved;
        v_moved := v_moved || v_ids;
      end if;
    end loop;

    update core.tenant_memberships set location_id = p_location_id
     where tenant_id = v_emp.tenant_id and user_id = v_emp.user_id and location_id = v_emp.location_id;
    v_membership := found;
  end if;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (v_emp.tenant_id, v_uid, 'user', 'workforce', 'employee', p_employee_id::text, 'move_location',
          jsonb_build_object('location_id', v_emp.location_id), jsonb_build_object('location_id', p_location_id),
          jsonb_build_object('user_id', v_emp.user_id,
                             'moved_role_assignment_ids', to_jsonb(v_moved),
                             'dropped_duplicate_role_assignment_ids', to_jsonb(v_dropped),
                             'membership_location_updated', v_membership));

  return jsonb_build_object('employee_id', p_employee_id, 'from_location_id', v_emp.location_id,
                            'to_location_id', p_location_id, 'changed', true,
                            'role_assignments_moved', cardinality(v_moved) + cardinality(v_dropped));
end;
$$;
comment on function core.move_employee_location(uuid, uuid) is
  'DEBT-139 L1 (0150, F3): the Owner / Admin (core.location.manage tenant-wide; 42501 also for an unknown employee) moves an employee''s home location to another ACTIVE location of the same tenant (location_not_found). Refuses employee_has_future_shifts (shifts at the old location starting today or later in its calendar). Moves the user''s location-scoped employee / manager role assignments from the old to the new location (a duplicate at the target is dropped instead) and the membership''s default location when it was the old one. Past rows keep their own location. One audit row (workforce / employee / move_location). Identity = core.current_user_id().';

-- --- 4. api.my_locations ---------------------------------------------------------------
create or replace function core.caller_is_employee_at(p_tenant_id uuid, p_location_id uuid)
returns boolean
language sql stable security definer set search_path = core, workforce, public, pg_temp as $$
  select core.current_user_id() is not null
     and exists (
       select 1 from workforce.employees e
        where e.tenant_id = p_tenant_id
          and e.location_id = p_location_id
          and e.user_id = core.current_user_id()
          and e.is_active);
$$;
comment on function core.caller_is_employee_at(uuid, uuid) is
  '0150: true iff the CALLER has an active workforce.employees row with that home location in that tenant. Answers only about the caller. Used by api.my_locations (access staff).';

create or replace view api.my_locations
  with (security_invoker = true) as
select
  l.tenant_id,
  l.id as location_id,
  l.name as location_name,
  l.timezone,
  l.is_active,
  a.access
from core.locations l
cross join lateral (
  select case
           when core.has_permission(l.tenant_id, 'workforce.staff.manage', null) then 'all'
           when core.has_permission(l.tenant_id, 'workforce.staff.manage', l.id) then 'manage'
           when core.caller_is_employee_at(l.tenant_id, l.id) then 'staff'
         end as access
) a
where exists (
    select 1 from core.tenant_memberships tm
     where tm.tenant_id = l.tenant_id
       and tm.user_id = core.current_user_id()
       and tm.status = 'active')
  and a.access is not null
  and (l.is_active or a.access = 'all');

comment on view api.my_locations is
  'DEBT-139 L1 (0150): the caller''s locations per tenant with an ACTIVE membership, with access = all (tenant-wide role holding workforce.staff.manage: Owner / Admin / tenant-wide Manager; inactive locations included), manage (that role at this location) or staff (own active employee row with this home location). Strongest access wins; unrelated locations are not listed; inactive ones only for all. security_invoker; no address, metadata, timestamps or user ids. UI source only: RLS stays the boundary. api.my_tenant_locations (0017) is unchanged.';

-- --- grants ----------------------------------------------------------------------------
revoke all on function core.assert_location_name(text) from public, anon, authenticated, service_role;
revoke all on function core.assert_tenant_active(uuid) from public, anon, authenticated, service_role;
revoke all on function core.assert_location_name_free(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function core.assert_location_limit(uuid) from public, anon, authenticated, service_role;
revoke all on function core.lock_tenant_locations(uuid) from public, anon, authenticated, service_role;
revoke all on function core.create_location(uuid, text, text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function core.rename_location(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function core.set_location_active(uuid, boolean, uuid) from public, anon, authenticated, service_role;
revoke all on function core.caller_location_tenant(uuid) from public, anon, authenticated, service_role;

revoke all on function core.caller_create_location(uuid, text, text, uuid) from public, anon;
revoke all on function core.caller_rename_location(uuid, text) from public, anon;
revoke all on function core.caller_set_location_active(uuid, boolean) from public, anon;
revoke all on function core.set_employee_manager_role(uuid, uuid, boolean, text) from public, anon;
revoke all on function core.move_employee_location(uuid, uuid) from public, anon;
revoke all on function core.caller_is_employee_at(uuid, uuid) from public, anon;
grant execute on function core.caller_create_location(uuid, text, text, uuid) to authenticated;
grant execute on function core.caller_rename_location(uuid, text) to authenticated;
grant execute on function core.caller_set_location_active(uuid, boolean) to authenticated;
grant execute on function core.set_employee_manager_role(uuid, uuid, boolean, text) to authenticated;
grant execute on function core.move_employee_location(uuid, uuid) to authenticated;
grant execute on function core.caller_is_employee_at(uuid, uuid) to authenticated;

revoke all on function core.platform_create_location(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function core.platform_rename_location(uuid, text, uuid) from public, anon, authenticated;
revoke all on function core.platform_set_location_active(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function core.platform_create_location(uuid, text, text, uuid, uuid) to service_role;
grant execute on function core.platform_rename_location(uuid, text, uuid) to service_role;
grant execute on function core.platform_set_location_active(uuid, boolean, uuid) to service_role;

-- --- api facade (ADR 0008: invoker only) --------------------------------------------------
create or replace function api.create_location(
  p_tenant_id uuid, p_name text, p_timezone text default 'Asia/Tokyo', p_source_location_id uuid default null
)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.caller_create_location(p_tenant_id, p_name, p_timezone, p_source_location_id);
$$;
create or replace function api.rename_location(p_location_id uuid, p_name text)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.caller_rename_location(p_location_id, p_name);
$$;
create or replace function api.set_location_active(p_location_id uuid, p_is_active boolean)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.caller_set_location_active(p_location_id, p_is_active);
$$;
create or replace function api.set_employee_manager_role(p_tenant_id uuid, p_employee_id uuid, p_is_manager boolean, p_scope text)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.set_employee_manager_role(p_tenant_id, p_employee_id, p_is_manager, p_scope);
$$;
create or replace function api.move_employee_location(p_employee_id uuid, p_location_id uuid)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.move_employee_location(p_employee_id, p_location_id);
$$;
create or replace function api.platform_create_location(
  p_tenant_id uuid, p_name text, p_timezone text, p_source_location_id uuid, p_actor_id uuid
)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.platform_create_location(p_tenant_id, p_name, p_timezone, p_source_location_id, p_actor_id);
$$;
create or replace function api.platform_rename_location(p_location_id uuid, p_name text, p_actor_id uuid)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.platform_rename_location(p_location_id, p_name, p_actor_id);
$$;
create or replace function api.platform_set_location_active(p_location_id uuid, p_is_active boolean, p_actor_id uuid)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.platform_set_location_active(p_location_id, p_is_active, p_actor_id);
$$;

comment on function api.create_location(uuid, text, text, uuid) is 'Invoker-only passthrough to core.caller_create_location (0150, ADR 0008).';
comment on function api.rename_location(uuid, text) is 'Invoker-only passthrough to core.caller_rename_location (0150, ADR 0008).';
comment on function api.set_location_active(uuid, boolean) is 'Invoker-only passthrough to core.caller_set_location_active (0150, ADR 0008).';
comment on function api.set_employee_manager_role(uuid, uuid, boolean, text) is 'Invoker-only passthrough to the scoped core.set_employee_manager_role (0150, ADR 0008). The 0138 3-argument overload is unchanged.';
comment on function api.move_employee_location(uuid, uuid) is 'Invoker-only passthrough to core.move_employee_location (0150, ADR 0008).';
comment on function api.platform_create_location(uuid, text, text, uuid, uuid) is 'Invoker-only passthrough to core.platform_create_location for the console Edge Function (0150, ADR 0008). service_role only.';
comment on function api.platform_rename_location(uuid, text, uuid) is 'Invoker-only passthrough to core.platform_rename_location (0150, ADR 0008). service_role only.';
comment on function api.platform_set_location_active(uuid, boolean, uuid) is 'Invoker-only passthrough to core.platform_set_location_active (0150, ADR 0008). service_role only.';

revoke all on function api.create_location(uuid, text, text, uuid) from public, anon;
revoke all on function api.rename_location(uuid, text) from public, anon;
revoke all on function api.set_location_active(uuid, boolean) from public, anon;
revoke all on function api.set_employee_manager_role(uuid, uuid, boolean, text) from public, anon;
revoke all on function api.move_employee_location(uuid, uuid) from public, anon;
grant execute on function api.create_location(uuid, text, text, uuid) to authenticated;
grant execute on function api.rename_location(uuid, text) to authenticated;
grant execute on function api.set_location_active(uuid, boolean) to authenticated;
grant execute on function api.set_employee_manager_role(uuid, uuid, boolean, text) to authenticated;
grant execute on function api.move_employee_location(uuid, uuid) to authenticated;

revoke all on function api.platform_create_location(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function api.platform_rename_location(uuid, text, uuid) from public, anon, authenticated;
revoke all on function api.platform_set_location_active(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function api.platform_create_location(uuid, text, text, uuid, uuid) to service_role;
grant execute on function api.platform_rename_location(uuid, text, uuid) to service_role;
grant execute on function api.platform_set_location_active(uuid, boolean, uuid) to service_role;

revoke all on api.my_locations from public, anon;
grant select on api.my_locations to authenticated;

-- ============================================================================
-- Rollback (locations created, renamed, archived or employees moved stay as
-- they are; every change is in audit.audit_logs, module core entity location
-- / module workforce action move_location; scoped manager assignments stay —
-- revoke them with the 0138 function if wanted):
--   drop view if exists api.my_locations;
--   drop function if exists api.platform_set_location_active(uuid, boolean, uuid);
--   drop function if exists api.platform_rename_location(uuid, text, uuid);
--   drop function if exists api.platform_create_location(uuid, text, text, uuid, uuid);
--   drop function if exists api.move_employee_location(uuid, uuid);
--   drop function if exists api.set_employee_manager_role(uuid, uuid, boolean, text);
--   drop function if exists api.set_location_active(uuid, boolean);
--   drop function if exists api.rename_location(uuid, text);
--   drop function if exists api.create_location(uuid, text, text, uuid);
--   drop function if exists core.caller_is_employee_at(uuid, uuid);
--   drop function if exists core.move_employee_location(uuid, uuid);
--   drop function if exists core.set_employee_manager_role(uuid, uuid, boolean, text);
--   drop function if exists core.platform_set_location_active(uuid, boolean, uuid);
--   drop function if exists core.platform_rename_location(uuid, text, uuid);
--   drop function if exists core.platform_create_location(uuid, text, text, uuid, uuid);
--   drop function if exists core.caller_set_location_active(uuid, boolean);
--   drop function if exists core.caller_rename_location(uuid, text);
--   drop function if exists core.caller_location_tenant(uuid);
--   drop function if exists core.caller_create_location(uuid, text, text, uuid);
--   drop function if exists core.set_location_active(uuid, boolean, uuid);
--   drop function if exists core.rename_location(uuid, text, uuid);
--   drop function if exists core.create_location(uuid, text, text, uuid, uuid);
--   drop function if exists core.lock_tenant_locations(uuid);
--   drop function if exists core.assert_location_limit(uuid);
--   drop function if exists core.assert_location_name_free(uuid, text, uuid);
--   drop function if exists core.assert_tenant_active(uuid);
--   drop function if exists core.assert_location_name(text);
--   delete from core.plan_default_limits where module = 'core' and limit_key = 'max_locations';
--   (core.location.manage stays: it predates this migration, 0008)
-- ============================================================================
