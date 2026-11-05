-- ============================================================================
-- 0156 — Several locations per client, L3 DB part (DEBT-139 step L3a)
-- ----------------------------------------------------------------------------
-- Design: docs/architecture/multi-location-design-2026-11-02.md; carried items
-- DEBT-139 (a), (b) / (c), (m) in docs/operations/deferred-debt-register.md.
--
-- 1. Move cancels the open requests at the old store (DEBT-139 a).
--    core.move_employee_location = the 0151 body, plus, in the same
--    transaction and after every existing check, status 'cancelled' (and
--    updated_at = now()) on the still-open requests OF THIS EMPLOYEE at the OLD
--    location:
--      workforce.shift_requests  status 'pending' (every kind: preference,
--                                correction, swap / pickup / drop),
--      workforce.leave_requests  status 'pending',
--      workforce.shift_exchanges status 'open' / 'accepted' where the employee
--                                is the requester OR the replacement.
--    Approved / rejected / already cancelled rows and rows at any other
--    location are untouched. These are the only request tables with an
--    employee + location + open status (attendance corrections and shift
--    preferences are shift_requests kinds; booking.staff is not a workforce
--    employee). Trigger behaviour on this UPDATE (checked):
--      * workforce.stamp_shift_request_decision (0031) stamps decided_by =
--        the mover (core.current_user_id()) and decided_at = now() when a
--        shift request leaves 'pending' — the cancel is recorded as the
--        Owner / Admin's decision.
--      * workforce.guard_shift_exchange_update (0062) lets the update through
--        on its first branch: the mover holds core.location.manage
--        tenant-wide, i.e. is an Owner / Admin, and both roles hold
--        workforce.request.manage (0008 bulk mapping) — checked at the
--        exchange's location like every manager decision. Without that
--        permission the trigger raises and the whole move rolls back
--        (fail closed). set_updated_at (0044) restamps updated_at.
--      * the 0127 change-signal triggers emit their usual "changed" signal.
--    The 0028 partial unique index "one preference per employee per day" is
--    narrowed to rows that are not cancelled: otherwise a preference the move
--    cancelled at the old store would block the moved employee from
--    submitting a preference for the same day at the new store (inserts only;
--    there is no Staff UPDATE path). No web caller uses ON CONFLICT on it
--    (checked); approved / rejected / pending rows still block duplicates
--    exactly as before.
--    Return JSON gains "cancelled_requests": <total> (always present; 0 on the
--    changed = false no-op path and when nothing was open). The audit row's
--    metadata gains cancelled_requests {shift_requests, leave_requests,
--    shift_exchanges} (counts only, no ids of other people, no PII).
-- 2. Manager scope in the staff view (DEBT-139 b / c UI).
--    core.employee_user_manager_scope(tenant, user) returns 'tenant' (a
--    manager role assignment with location_id NULL in the tenant), else
--    'location' (one with a location_id), else NULL — with the SAME caller gate
--    as core.employee_user_is_manager (0152): NULL unless the caller holds
--    workforce.staff.manage at that user's employee home location. So
--    (manager_scope is not null) = is_manager for every caller and row.
--    api.workforce_staff_manage = the 0140 definition (same columns, same
--    order) plus manager_scope appended as the LAST column.
-- 3. Main store = creation order (DEBT-139 m). api.my_locations = the 0151
--    definition plus created_at (core.locations.created_at) appended as the
--    LAST column; api.my_page_context = the 0154 body with 'created_at' added
--    to each myLocations element. Nothing else in the page context changes.
--
-- Security: the only new SECURITY DEFINER function lives in core with a
-- pinned search_path, revoked from public / anon, granted to authenticated
-- like core.employee_user_is_manager; it answers only about rows the caller
-- already manages. api.* stays SECURITY INVOKER (ADR 0008); both views stay
-- security_invoker; no new grant to anon; no new table; no service_role use.
--
-- Cost: the move adds three indexed UPDATEs on one employee's open requests
-- (rare Owner action). manager_scope adds one definer call per staff row (same
-- shape as is_manager; a store has a handful of staff). created_at is a column
-- of a row already read.
--
-- Rollback: commented block at the end of this file.
-- ============================================================================

-- --- 1a. one preference per day: cancelled rows no longer count ------------------
drop index if exists workforce.wf_shift_requests_one_preference_per_day;
create unique index wf_shift_requests_one_preference_per_day
  on workforce.shift_requests (tenant_id, employee_id, work_date)
  where kind = 'preference' and status <> 'cancelled';
comment on index workforce.wf_shift_requests_one_preference_per_day is
  '0028, 0156: at most one non-cancelled preference per employee per work_date. Cancelled rows (e.g. cancelled by core.move_employee_location at the old store) do not block a new submission.';

-- --- 1b. move an employee: also cancels their open requests at the old store -------
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
  v_n_sr int := 0;
  v_n_lr int := 0;
  v_n_sx int := 0;
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
  if not core.has_module_access(v_tenant, 'workforce') then
    raise exception 'workforce_module_disabled' using errcode = 'P0001';
  end if;

  -- FOR UPDATE conflicts with the FOR KEY SHARE lock a concurrent shift insert
  -- takes on this row through its employee FK: a shift committed first is seen
  -- by the future-shift check below.
  select e.id, e.tenant_id, e.location_id, e.user_id, e.is_active into v_emp
    from workforce.employees e where e.id = p_employee_id for update;

  if not exists (select 1 from core.locations l
                  where l.tenant_id = v_emp.tenant_id and l.id = p_location_id and l.is_active) then
    raise exception 'location_not_found' using errcode = 'P0001';
  end if;
  if v_emp.location_id is not distinct from p_location_id then
    return jsonb_build_object('employee_id', p_employee_id, 'from_location_id', v_emp.location_id,
                              'to_location_id', p_location_id, 'changed', false,
                              'cancelled_requests', 0);
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

  -- 0156: the employee's still-open requests at the old store are cancelled
  -- (nobody there manages them any more; history keeps the rows)
  if v_emp.location_id is not null then
    update workforce.shift_requests
       set status = 'cancelled', updated_at = now()
     where tenant_id = v_emp.tenant_id and employee_id = p_employee_id
       and location_id = v_emp.location_id and status = 'pending';
    get diagnostics v_n_sr = row_count;

    update workforce.leave_requests
       set status = 'cancelled', updated_at = now()
     where tenant_id = v_emp.tenant_id and employee_id = p_employee_id
       and location_id = v_emp.location_id and status = 'pending';
    get diagnostics v_n_lr = row_count;

    update workforce.shift_exchanges
       set status = 'cancelled', updated_at = now()
     where tenant_id = v_emp.tenant_id and location_id = v_emp.location_id
       and status in ('open', 'accepted')
       and (requester_employee_id = p_employee_id or replacement_employee_id = p_employee_id);
    get diagnostics v_n_sx = row_count;
  end if;

  if v_emp.user_id is not null and v_emp.location_id is not null then
    -- same lock key as the Manager appointment (0138 / 0151)
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
                             'membership_location_updated', v_membership,
                             'cancelled_requests', jsonb_build_object(
                               'shift_requests', v_n_sr,
                               'leave_requests', v_n_lr,
                               'shift_exchanges', v_n_sx)));

  return jsonb_build_object('employee_id', p_employee_id, 'from_location_id', v_emp.location_id,
                            'to_location_id', p_location_id, 'changed', true,
                            'role_assignments_moved', cardinality(v_moved) + cardinality(v_dropped),
                            'cancelled_requests', v_n_sr + v_n_lr + v_n_sx);
end;
$$;
comment on function core.move_employee_location(uuid, uuid) is
  'DEBT-139 L1 (0151, F3) + L3 (0156): the Owner / Admin (core.location.manage tenant-wide; 42501 also for an unknown employee) moves an employee''s home location to another ACTIVE location of the same tenant (location_not_found). Refuses employee_has_future_shifts (shifts at the old location starting today or later in its calendar). Cancels the employee''s still-open requests at the old location (shift_requests / leave_requests pending; shift_exchanges open / accepted where they are requester or replacement); returns cancelled_requests (total, 0 on the no-op path). Moves the user''s location-scoped employee / manager role assignments from the old to the new location (a duplicate at the target is dropped instead) and the membership''s default location when it was the old one. Past rows keep their own location. One audit row (workforce / employee / move_location; per-table cancel counts). Identity = core.current_user_id().';

-- grants unchanged by create or replace; re-stated for clarity
revoke all on function core.move_employee_location(uuid, uuid) from public, anon;
grant execute on function core.move_employee_location(uuid, uuid) to authenticated;

-- --- 2. manager scope ------------------------------------------------------------------
create or replace function core.employee_user_manager_scope(p_tenant_id uuid, p_user_id uuid)
returns text
language sql stable security definer set search_path = core, public, pg_temp as $$
  select case
           when p_user_id is null then null
           -- same caller gate as core.employee_user_is_manager (0152)
           when not exists (
             select 1 from workforce.employees e
              where e.tenant_id = p_tenant_id
                and e.user_id = p_user_id
                and core.has_permission(p_tenant_id, 'workforce.staff.manage', e.location_id)) then null
           when exists (
             select 1 from core.role_assignments ra
              where ra.tenant_id = p_tenant_id
                and ra.user_id = p_user_id
                and ra.role_id = '00000000-0000-0000-0000-000000000005'
                and ra.location_id is null) then 'tenant'
           when exists (
             select 1 from core.role_assignments ra
              where ra.tenant_id = p_tenant_id
                and ra.user_id = p_user_id
                and ra.role_id = '00000000-0000-0000-0000-000000000005'
                and ra.location_id is not null) then 'location'
         end;
$$;
comment on function core.employee_user_manager_scope(uuid, uuid) is
  '0156 (DEBT-139 L3): the manager scope of p_user_id in the tenant: tenant (a manager role assignment with location NULL), else location (one at a location), else NULL. Same caller gate as core.employee_user_is_manager (0152): NULL unless the caller holds workforce.staff.manage at that user''s employee home location, so it is non-NULL exactly when is_manager is true. Feeds api.workforce_staff_manage.manager_scope.';
revoke all on function core.employee_user_manager_scope(uuid, uuid) from public, anon;
grant execute on function core.employee_user_manager_scope(uuid, uuid) to authenticated;

-- Same columns, same order as 0140; only `manager_scope` is appended.
create or replace view api.workforce_staff_manage
  with (security_invoker = true) as
select
  e.id as staff_id,
  e.tenant_id,
  e.location_id,
  e.name_encrypted,
  e.name_hash,
  e.position_label,
  e.employment_type,
  e.is_active,
  e.created_at,
  e.updated_at,
  e.hourly_wage_yen,
  e.family_name_encrypted,
  e.given_name_encrypted,
  e.email_encrypted,
  e.email_hash,
  e.notes_encrypted,
  (e.user_id is not null) as has_account_access,
  core.employee_user_is_manager(e.tenant_id, e.user_id) as is_manager,
  core.employee_user_is_admin(e.tenant_id, e.user_id) as is_admin,
  core.employee_user_manager_scope(e.tenant_id, e.user_id) as manager_scope
from workforce.employees e
where core.has_permission(e.tenant_id, 'workforce.staff.manage', e.location_id);

comment on view api.workforce_staff_manage is
  'Manager-only staff read/write facade. Includes advisory hourly wage, contact PII (encrypted), has_account_access (derived boolean, never the raw user_id itself), since 0138 is_manager, since 0140 is_admin (derived booleans, read-only) and since 0156 manager_scope (tenant | location | NULL, read-only; non-NULL exactly when is_manager). security_invoker/RLS, and since 0122 the view itself only returns rows where the caller holds workforce.staff.manage at the row''s location.';

grant select, insert, update on api.workforce_staff_manage to authenticated;
revoke all on api.workforce_staff_manage from anon, public;

-- --- 3a. api.my_locations + created_at -------------------------------------------------
-- Same columns, same order as 0151; only `created_at` is appended.
create or replace view api.my_locations
  with (security_invoker = true) as
select
  l.tenant_id,
  l.id as location_id,
  l.name as location_name,
  l.timezone,
  l.is_active,
  a.access,
  l.created_at
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
  'DEBT-139 L1 (0151) + L3 (0156): the caller''s locations per tenant with an ACTIVE membership, with access = all (tenant-wide role holding workforce.staff.manage: Owner / Admin / tenant-wide Manager; inactive locations included), manage (that role at this location) or staff (own active employee row with this home location). Strongest access wins; unrelated locations are not listed; inactive ones only for all. created_at (0156) = the location''s creation time: the oldest is the main store (default choice). security_invoker; no address, metadata or user ids. UI source only: RLS stays the boundary. api.my_tenant_locations (0017) is unchanged.';

revoke all on api.my_locations from public, anon;
grant select on api.my_locations to authenticated;

-- --- 3b. api.my_page_context: myLocations[].created_at ----------------------------------
create or replace function api.my_page_context()
returns jsonb
language sql
stable
security invoker
set search_path = api, public, pg_temp
as $$
  select jsonb_build_object(
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tenant_id', m.tenant_id, 'tenant_slug', m.tenant_slug, 'tenant_name', m.tenant_name,
        'tenant_kind', m.tenant_kind, 'location_id', m.location_id, 'status', m.status))
        from api.my_tenant_memberships m), '[]'::jsonb),
    'navigation', coalesce((
      select jsonb_agg(jsonb_build_object('tenant_id', n.tenant_id, 'module', n.module, 'nav_order', n.nav_order))
        from api.my_tenant_navigation n), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tenant_id', l.tenant_id, 'location_id', l.location_id, 'location_name', l.location_name,
        'timezone', l.timezone, 'is_active', l.is_active))
        from api.my_tenant_locations l), '[]'::jsonb),
    'myLocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tenant_id', ml.tenant_id, 'location_id', ml.location_id, 'location_name', ml.location_name,
        'timezone', ml.timezone, 'is_active', ml.is_active, 'access', ml.access,
        'created_at', ml.created_at))
        from api.my_locations ml), '[]'::jsonb),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tenant_id', p.tenant_id, 'package_code', p.package_code, 'status', p.status, 'sort_order', p.sort_order))
        from api.my_tenant_packages p
       where p.status = 'active'), '[]'::jsonb),
    'employeeInvitations', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.invitation_id)
        from api.my_pending_employee_invitations() e), '[]'::jsonb),
    'tenantInvitations', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at, t.invitation_id)
        from api.my_pending_tenant_invitations() t), '[]'::jsonb)
  );
$$;

comment on function api.my_page_context() is
  '0143 (DEBT-135) + 0154 (DEBT-139 L2) + 0156 (L3, myLocations[].created_at): one RPC for the per-request page context -- rows of api.my_tenant_memberships, my_tenant_navigation, my_tenant_locations, my_locations (myLocations, with access and created_at), my_tenant_packages (active) and api.my_pending_employee_invitations() / my_pending_tenant_invitations(), read as the caller (invoker, ADR 0008), so RLS and self-scoping are unchanged.';

revoke all on function api.my_page_context() from public, anon;
grant execute on function api.my_page_context() to authenticated;

-- ============================================================================
-- Rollback (requests already cancelled by a move stay cancelled; each move's
-- counts are in audit.audit_logs, module workforce action move_location):
--   1. re-run the 0154 api.my_page_context body (drops myLocations[].created_at;
--      revert the app first);
--   2. drop view api.my_locations; re-create it with the 0151 definition
--      (create or replace cannot drop a column) + its 0151 comment and grants;
--   3. drop view api.workforce_staff_manage; re-create it with the 0140
--      definition + comment + grants; then
--      drop function if exists core.employee_user_manager_scope(uuid, uuid);
--   4. re-run the 0151 core.move_employee_location body + comment;
--   5. drop index workforce.wf_shift_requests_one_preference_per_day;
--      create unique index wf_shift_requests_one_preference_per_day
--        on workforce.shift_requests (tenant_id, employee_id, work_date)
--        where kind = 'preference';
--      (fails if a cancelled and a live preference exist for the same day —
--      delete or keep the cancelled one first).
-- ============================================================================
