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
--                                correction, swap / pickup / drop), plus
--                                kind 'preference' status 'approved' with
--                                work_date today or later in the old
--                                store's time zone (it would still occupy
--                                the day at the new store; past approved
--                                preferences stay as history),
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
  v_n int := 0;
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

    -- a preference already approved for today or later at the old store would
    -- still occupy that day (auto-distribute, the one-per-day index) after the
    -- move: cancel it too; past approved preferences stay as history
    update workforce.shift_requests
       set status = 'cancelled', updated_at = now()
     where tenant_id = v_emp.tenant_id and employee_id = p_employee_id
       and location_id = v_emp.location_id
       and kind = 'preference' and status = 'approved'
       and work_date >= (now() at time zone v_old_tz)::date;
    get diagnostics v_n = row_count;
    v_n_sr := v_n_sr + v_n;

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
  'DEBT-139 L1 (0151, F3) + L3 (0156): the Owner / Admin (core.location.manage tenant-wide; 42501 also for an unknown employee) moves an employee''s home location to another ACTIVE location of the same tenant (location_not_found). Refuses employee_has_future_shifts (shifts at the old location starting today or later in its calendar). Cancels the employee''s still-open requests at the old location (shift_requests / leave_requests pending; approved preferences for today or later in the old location''s calendar; shift_exchanges open / accepted where they are requester or replacement — cancelling an accepted exchange where they are the replacement cancels the whole exchange, the requester is not notified); returns cancelled_requests (total, 0 on the no-op path). Moves the user''s location-scoped employee / manager role assignments from the old to the new location (a duplicate at the target is dropped instead) and the membership''s default location when it was the old one. Past rows keep their own location. One audit row (workforce / employee / move_location; per-table cancel counts). Identity = core.current_user_id().';

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

-- --- 4. api.manager_dashboard: staff rows carry manager_scope ------------------------
-- The 0155 body verbatim; the only change is s.manager_scope appended to the
-- explicit column list of the staff part (0155 selects columns one by one, so
-- the new view column would otherwise never reach the web). The comment line
-- is updated; grants are re-stated unchanged.
create or replace function api.manager_dashboard(
  p_tenant_id uuid,
  p_location_id uuid,
  p_params jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = api, public, pg_temp
as $$
declare
  c_known_parts constant text[] := array[
    'staff', 'lineLinks', 'shiftTypes', 'preferenceRequests', 'assignments', 'correctionRequests',
    'attendance', 'invitations', 'shiftExchanges', 'exchangeAssignments', 'staffMessages',
    'inventoryItems', 'purchasesNeeded', 'purchaseHistory', 'purchasesAwaiting', 'recipeCategories',
    'recipes', 'scheduleSettings', 'recipeTitleTranslations', 'myProfile', 'operationsTemplates',
    'operationsItems', 'operationsSchedules', 'operationsTodayTasks', 'operationsOpenExceptions',
    'issuesOpen', 'issuesAll', 'autoScheduleRuns'];
  -- app: FETCH_ALL_PAGE_SIZE (1000) x FETCH_ALL_MAX_PAGES (20), PostgREST max_rows (1000)
  c_paged_cap constant int := 20000;
  c_max_rows constant int := 1000;
  c_cap_error constant jsonb := jsonb_build_object('error', jsonb_build_object(
    'code', 'LBO_ROW_CAP',
    'message', 'List read exceeds 20000 rows; refusing to return a partial list (DEBT-114).'));
  v_parts text[];
  v_unknown text;
  v_pref_from date;
  v_from timestamptz;
  v_to timestamptz;
  v_ex_from timestamptz;
  v_ex_to timestamptz;
  v_att_from date;
  v_att_to date;
  v_today date;
  v_rows jsonb;
  v_ids jsonb;
  v_extra_staff uuid[] := '{}';
  v_out jsonb := '{}'::jsonb;
begin
  -- ---- input validation (whole call) -------------------------------------------------------
  if p_tenant_id is null or p_location_id is null then
    raise exception 'invalid_argument: tenant and location are required' using errcode = '22023';
  end if;
  if p_params is null or jsonb_typeof(p_params) <> 'object'
     or jsonb_typeof(p_params -> 'parts') is distinct from 'array' then
    raise exception 'invalid_argument: p_params.parts must be an array' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_params -> 'parts') e where jsonb_typeof(e) <> 'string') then
    raise exception 'invalid_argument: part names must be strings' using errcode = '22023';
  end if;
  select array_agg(distinct e) into v_parts from jsonb_array_elements_text(p_params -> 'parts') e;
  v_parts := coalesce(v_parts, '{}');
  select p into v_unknown from unnest(v_parts) p where not (p = any (c_known_parts)) limit 1;
  if v_unknown is not null then
    raise exception 'invalid_argument: unknown part %', v_unknown using errcode = '22023';
  end if;

  begin
    if 'preferenceRequests' = any (v_parts) then
      v_pref_from := (p_params ->> 'preferenceFromDate')::date;
      if v_pref_from is null then raise exception 'preferenceFromDate'; end if;
    end if;
    if 'assignments' = any (v_parts) then
      v_from := (p_params ->> 'fromIso')::timestamptz;
      v_to := (p_params ->> 'toIsoExclusive')::timestamptz;
      if v_from is null or v_to is null then raise exception 'fromIso/toIsoExclusive'; end if;
    end if;
    if 'exchangeAssignments' = any (v_parts) then
      v_ex_from := (p_params ->> 'exchangeFromIso')::timestamptz;
      v_ex_to := (p_params ->> 'exchangeToIsoExclusive')::timestamptz;
      if v_ex_from is null or v_ex_to is null then raise exception 'exchangeFromIso/exchangeToIsoExclusive'; end if;
    end if;
    if 'attendance' = any (v_parts) then
      v_att_from := (p_params ->> 'attendanceFromDate')::date;
      v_att_to := (p_params ->> 'attendanceToDate')::date;
      if v_att_from is null or v_att_to is null then raise exception 'attendanceFromDate/attendanceToDate'; end if;
    end if;
    if 'operationsTodayTasks' = any (v_parts) then
      v_today := (p_params ->> 'today')::date;
      if v_today is null then raise exception 'today'; end if;
    end if;
  exception when others then
    raise exception 'invalid_argument: missing or invalid date input (%)', sqlerrm using errcode = '22023';
  end;

  -- ---- staff (+ protected-history ids) -----------------------------------------------------
  if 'staff' = any (v_parts) then
    if v_from is not null then
      begin
        v_extra_staff := v_extra_staff || coalesce((select array_agg(distinct sa.employee_id)
          from api.workforce_shift_assignments sa
         where sa.tenant_id = p_tenant_id and sa.location_id = p_location_id and sa.employee_id is not null
           and sa.starts_at >= v_from and sa.starts_at < v_to), '{}');
      exception when others then null;
      end;
    end if;
    if v_att_from is not null then
      begin
        v_extra_staff := v_extra_staff || coalesce((select array_agg(distinct aa.employee_id)
          from api.workforce_attendance aa
         where aa.tenant_id = p_tenant_id and aa.location_id = p_location_id and aa.employee_id is not null
           and aa.work_date >= v_att_from and aa.work_date <= v_att_to), '{}');
      exception when others then null;
      end;
    end if;
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select s.staff_id, s.tenant_id, s.location_id, s.name_encrypted, s.name_hash, s.family_name_encrypted,
               s.given_name_encrypted, s.email_encrypted, s.email_hash, s.notes_encrypted, s.position_label,
               s.employment_type, s.is_active, s.created_at, s.updated_at, s.hourly_wage_yen,
               s.has_account_access, s.is_manager, s.is_admin, s.manager_scope
          from api.workforce_staff_manage s
         where s.tenant_id = p_tenant_id
           -- this store's staff (or without a store), plus anyone with a shift /
           -- attendance at this store in the loaded window (moved staff's history,
           -- a shift at another store), so no row of this store loses its person
           and (s.location_id = p_location_id or s.location_id is null or s.staff_id = any (v_extra_staff))
         limit c_max_rows) x);
      v_ids := '[]'::jsonb;
      begin
        v_ids := v_ids || coalesce((select jsonb_agg(x.employee_id) from (
          select a.employee_id from api.workforce_shift_assignments a where a.tenant_id = p_tenant_id limit c_max_rows) x
          where x.employee_id is not null), '[]'::jsonb);
      exception when others then null;
      end;
      begin
        v_ids := v_ids || coalesce((select jsonb_agg(x.employee_id) from (
          select a.employee_id from api.workforce_attendance a where a.tenant_id = p_tenant_id limit c_max_rows) x
          where x.employee_id is not null), '[]'::jsonb);
      exception when others then null;
      end;
      begin
        v_ids := v_ids || coalesce((select jsonb_agg(x.employee_id) from (
          select r.employee_id from api.workforce_shift_requests r where r.tenant_id = p_tenant_id limit c_max_rows) x
          where x.employee_id is not null), '[]'::jsonb);
      exception when others then null;
      end;
      begin
        v_ids := v_ids || coalesce((select jsonb_agg(i.id) from (
          select e.requester_employee_id, e.replacement_employee_id
            from api.workforce_shift_exchanges e where e.tenant_id = p_tenant_id limit c_max_rows) x
          cross join lateral (values (x.requester_employee_id), (x.replacement_employee_id)) as i(id)
          where i.id is not null), '[]'::jsonb);
      exception when others then null;
      end;
      v_ids := coalesce((select jsonb_agg(distinct i) from jsonb_array_elements(v_ids) i), '[]'::jsonb);
      v_out := v_out || jsonb_build_object('staff', jsonb_build_object('rows', v_rows, 'protectedHistoryIds', v_ids));
    exception when others then
      v_out := v_out || jsonb_build_object('staff', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- lineLinks ---------------------------------------------------------------------------
  if 'lineLinks' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select l.link_id, l.tenant_id, l.employee_id, l.is_active, l.linked_at, l.created_at, l.updated_at
          from api.workforce_employee_line_links l
         where l.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('lineLinks', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('lineLinks', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- shiftTypes --------------------------------------------------------------------------
  if 'shiftTypes' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select t.shift_type_id, t.tenant_id, t.location_id, t.code, t.label_ja, t.label_en, t.starts_at_local,
               t.ends_at_local, t.break_minutes, t.is_custom, t.sort_order, t.is_active
          from api.workforce_shift_types t
         where t.tenant_id = p_tenant_id and t.location_id = p_location_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('shiftTypes', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('shiftTypes', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- preferenceRequests ------------------------------------------------------------------
  if 'preferenceRequests' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.work_date, x.request_id), '[]'::jsonb) from (
        select r.request_id, r.tenant_id, r.location_id, r.employee_id, r.shift_id, r.shift_type_id, r.work_date,
               r.kind, r.is_unavailable, r.status, r.details, r.attendance_id, r.created_at, r.updated_at
          from api.workforce_shift_requests r
         where r.tenant_id = p_tenant_id and (r.location_id = p_location_id or r.location_id is null) and r.kind = 'preference' and r.work_date >= v_pref_from
         order by r.work_date, r.request_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('preferenceRequests',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('preferenceRequests', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- assignments -------------------------------------------------------------------------
  if 'assignments' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at, x.assignment_id), '[]'::jsonb) from (
        select a.assignment_id, a.tenant_id, a.location_id, a.employee_id, a.shift_type_id, a.starts_at, a.ends_at,
               a.break_minutes, a.role, a.notes, a.published, a.created_at, a.updated_at
          from api.workforce_shift_assignments a
         where a.tenant_id = p_tenant_id and a.location_id = p_location_id and a.starts_at >= v_from and a.starts_at < v_to
         order by a.starts_at, a.assignment_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('assignments',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('assignments', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- correctionRequests ------------------------------------------------------------------
  if 'correctionRequests' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.work_date, x.request_id), '[]'::jsonb) from (
        select r.request_id, r.tenant_id, r.location_id, r.employee_id, r.shift_id, r.shift_type_id, r.work_date,
               r.kind, r.is_unavailable, r.status, r.details, r.attendance_id, r.created_at, r.updated_at
          from api.workforce_shift_requests r
         where r.tenant_id = p_tenant_id and (r.location_id = p_location_id or r.location_id is null) and r.kind = 'correction'
         order by r.work_date, r.request_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('correctionRequests',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('correctionRequests', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- attendance --------------------------------------------------------------------------
  if 'attendance' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.work_date desc, x.attendance_id), '[]'::jsonb) from (
        select a.attendance_id, a.tenant_id, a.location_id, a.employee_id, a.shift_id, a.work_date, a.clock_in,
               a.clock_out, a.actual_break_minutes, a.status, a.transportation_cost, a.daily_message, a.created_at,
               a.updated_at
          from api.workforce_attendance a
         where a.tenant_id = p_tenant_id and a.location_id = p_location_id and a.work_date >= v_att_from and a.work_date <= v_att_to
         order by a.work_date desc, a.attendance_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('attendance',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('attendance', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- invitations -------------------------------------------------------------------------
  if 'invitations' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select i.invitation_id, i.tenant_id, i.employee_id, i.status, i.created_at, i.updated_at, i.expires_at,
               i.accepted_at, i.revoked_at
          from api.workforce_employee_invitations i
         where i.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('invitations', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('invitations', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- shiftExchanges ----------------------------------------------------------------------
  if 'shiftExchanges' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.exchange_id), '[]'::jsonb) from (
        select e.exchange_id, e.tenant_id, e.location_id, e.shift_id, e.requester_employee_id,
               e.replacement_employee_id, e.reason, e.status, e.accepted_at, e.decided_at, e.created_at,
               e.updated_at, e.request_kind, e.requested_shift_type_id
          from api.workforce_shift_exchanges e
         where e.tenant_id = p_tenant_id and e.location_id = p_location_id
         order by e.created_at desc, e.exchange_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('shiftExchanges',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('shiftExchanges', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- exchangeAssignments -----------------------------------------------------------------
  if 'exchangeAssignments' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at, x.assignment_id), '[]'::jsonb) from (
        select a.assignment_id, a.tenant_id, a.location_id, a.employee_id, a.shift_type_id, a.starts_at, a.ends_at,
               a.break_minutes, a.role, a.notes, a.published, a.created_at, a.updated_at
          from api.workforce_shift_assignments a
         where a.tenant_id = p_tenant_id and a.location_id = p_location_id and a.starts_at >= v_ex_from and a.starts_at < v_ex_to
         order by a.starts_at, a.assignment_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('exchangeAssignments',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('exchangeAssignments', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- staffMessages -----------------------------------------------------------------------
  if 'staffMessages' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.message_id), '[]'::jsonb) from (
        select m.message_id, m.tenant_id, m.location_id, m.employee_id, m.sender_role, m.sender_user_id, m.body,
               m.is_read, m.read_at, m.read_by, m.archived_at, m.deleted_at, m.created_at, m.updated_at
          from api.workforce_staff_messages m
         where m.tenant_id = p_tenant_id and m.location_id = p_location_id
         order by m.created_at, m.message_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('staffMessages',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('staffMessages', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- inventoryItems (includeInactive: true) ----------------------------------------------
  if 'inventoryItems' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select i.item_id, i.tenant_id, i.location_id, i.name, i.unit, i.required_quantity, i.reorder_point,
               i.sort_order, i.is_active, i.actual_quantity, i.counted_at, i.counted_by_staff_id,
               i.shortage_quantity, i.status, i.media_path
          from api.inventory_item_status i
         where i.tenant_id = p_tenant_id and i.location_id = p_location_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('inventoryItems', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('inventoryItems', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- purchasesNeeded ---------------------------------------------------------------------
  if 'purchasesNeeded' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select n.item_id, n.tenant_id, n.location_id, n.name, n.unit, n.required_quantity, n.reorder_point,
               n.actual_quantity, n.shortage_quantity, n.latest_stock_count_id, n.purchase_status, n.actioned_at,
               n.actioned_by_staff_id, n.ordered_quantity, n.received_quantity
          from api.purchases_needed n
         where n.tenant_id = p_tenant_id and n.location_id = p_location_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('purchasesNeeded', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('purchasesNeeded', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- purchaseHistory ---------------------------------------------------------------------
  if 'purchaseHistory' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.actioned_at desc, x.action_id), '[]'::jsonb) from (
        select h.action_id, h.tenant_id, h.location_id, h.item_id, h.item_name, h.unit, h.action_type,
               h.ordered_quantity, h.received_quantity, h.actioned_at, h.actioned_by_staff_id
          from api.purchase_history h
         where h.tenant_id = p_tenant_id and h.location_id = p_location_id
         order by h.actioned_at desc, h.action_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('purchaseHistory',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('purchaseHistory', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- purchasesAwaiting -------------------------------------------------------------------
  if 'purchasesAwaiting' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select w.item_id, w.tenant_id, w.location_id, w.name, w.unit, w.required_quantity, w.reorder_point,
               w.actual_quantity, w.shortage_quantity, w.is_short, w.latest_stock_count_id, w.order_action_id,
               w.ordered_quantity, w.received_since_order_quantity, w.open_order_quantity, w.ordered_at,
               w.ordered_by_staff_id
          from api.purchases_awaiting_delivery w
         where w.tenant_id = p_tenant_id and w.location_id = p_location_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('purchasesAwaiting', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('purchasesAwaiting', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- recipeCategories --------------------------------------------------------------------
  if 'recipeCategories' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select c.category_id, c.tenant_id, c.label_ja, c.label_en, c.sort_order, c.is_active
          from api.workforce_recipe_categories c
         where c.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('recipeCategories', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('recipeCategories', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- recipes -----------------------------------------------------------------------------
  if 'recipes' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select r.recipe_id, r.tenant_id, r.location_id, r.recipe_category_id, r.title_ja, r.title_en,
               r.description_ja, r.description_en, r.content_kind, r.is_popular, r.status, r.created_at,
               r.updated_at, r.media_path, r.original_language
          from api.workforce_recipes r
         where r.tenant_id = p_tenant_id and (r.location_id = p_location_id or r.location_id is null)
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('recipes', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('recipes', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- scheduleSettings (app: maybeSingle -> 2 rows are enough to detect "more than one") --
  if 'scheduleSettings' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select s.tenant_id, s.location_id, s.required_headcount_by_weekday, s.max_monthly_hours, s.max_weekly_hours,
               s.max_days_per_week, s.auto_create_day_of_month, s.auto_create_enabled,
               s.auto_create_last_generated_month
          from api.workforce_schedule_settings s
         where s.tenant_id = p_tenant_id and s.location_id = p_location_id
         limit 2) x);
      v_out := v_out || jsonb_build_object('scheduleSettings', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('scheduleSettings', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- recipeTitleTranslations -------------------------------------------------------------
  if 'recipeTitleTranslations' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.translation_id), '[]'::jsonb) from (
        select t.translation_id, t.tenant_id, t.source_entity_type, t.source_entity_id, t.source_field,
               t.source_language, t.target_language, t.translated_text, t.translation_status,
               t.translation_provider, t.source_content_hash, t.machine_generated, t.reviewed_at, t.translated_at,
               t.updated_at
          from api.content_translations t
         where t.tenant_id = p_tenant_id and t.source_entity_type = 'workforce_recipe' and t.source_field = 'title'
         order by t.translation_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('recipeTitleTranslations',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('recipeTitleTranslations', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- myProfile (app: maybeSingle) --------------------------------------------------------
  if 'myProfile' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select p.staff_id, p.tenant_id, p.location_id, p.position_label, p.employment_type, p.is_active,
               p.created_at, p.hourly_wage_yen
          from api.workforce_my_staff_profile p
         where p.tenant_id = p_tenant_id
         limit 2) x);
      v_out := v_out || jsonb_build_object('myProfile', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('myProfile', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsTemplates -----------------------------------------------------------------
  if 'operationsTemplates' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select t.template_id, t.tenant_id, t.location_id, t.name, t.category, t.description, t.is_active,
               t.created_at, t.updated_at
          from api.operations_templates t
         where t.tenant_id = p_tenant_id and (t.location_id = p_location_id or t.location_id is null)
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('operationsTemplates', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('operationsTemplates', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsItems ---------------------------------------------------------------------
  if 'operationsItems' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select i.item_id, i.tenant_id, i.template_id, i.label, i.response_type, i.is_critical, i.is_required,
               i.is_active, i.numeric_min, i.numeric_max, i.numeric_unit, i.sort_order, i.created_at, i.updated_at
          from api.operations_template_items i
         where i.tenant_id = p_tenant_id
           and exists (select 1 from api.operations_templates ot
                        where ot.template_id = i.template_id
                          and (ot.location_id = p_location_id or ot.location_id is null))
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('operationsItems', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('operationsItems', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsSchedules -----------------------------------------------------------------
  if 'operationsSchedules' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select s.schedule_id, s.tenant_id, s.location_id, s.template_id, s.schedule_group_id, s.recurrence_kind,
               s.weekdays, s.due_time, s.window_end_time, s.effective_from, s.effective_to, s.is_active,
               s.created_at, s.updated_at
          from api.operations_schedules s
         where s.tenant_id = p_tenant_id and s.location_id = p_location_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('operationsSchedules', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('operationsSchedules', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsTodayTasks ----------------------------------------------------------------
  if 'operationsTodayTasks' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select t.*
          from api.operations_expected_tasks(v_today, v_today) t
         where t.tenant_id = p_tenant_id and t.location_id = p_location_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('operationsTodayTasks', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('operationsTodayTasks', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsOpenExceptions ------------------------------------------------------------
  if 'operationsOpenExceptions' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.exception_id), '[]'::jsonb) from (
        select e.exception_id, e.tenant_id, e.location_id, e.instance_id, e.schedule_id, e.business_date,
               e.item_id, e.severity, e.source, e.note, e.created_at, e.template_name
          from api.operations_open_exceptions e
         where e.tenant_id = p_tenant_id and e.location_id = p_location_id
         order by e.created_at desc, e.exception_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('operationsOpenExceptions',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('operationsOpenExceptions', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- issuesOpen --------------------------------------------------------------------------
  if 'issuesOpen' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.issue_id), '[]'::jsonb) from (
        select i.issue_id, i.tenant_id, i.location_id, i.kind, i.category, i.severity, i.status, i.note,
               i.business_date, i.reported_by, i.reported_by_role, i.acknowledged_by, i.acknowledged_at, i.source,
               i.operations_exception_id, i.created_at, i.updated_at, i.reporter_employee_id
          from api.issues_open i
         where i.tenant_id = p_tenant_id and i.location_id = p_location_id
         order by i.created_at desc, i.issue_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('issuesOpen',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('issuesOpen', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- issuesAll ---------------------------------------------------------------------------
  if 'issuesAll' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.issue_id), '[]'::jsonb) from (
        select i.issue_id, i.tenant_id, i.location_id, i.kind, i.category, i.severity, i.status, i.note,
               i.business_date, i.reported_by, i.reported_by_role, i.acknowledged_by, i.acknowledged_at,
               i.resolved_by, i.resolved_at, i.resolution_note, i.source, i.operations_exception_id, i.created_at,
               i.updated_at, i.reporter_employee_id
          from api.issues i
         where i.tenant_id = p_tenant_id and i.location_id = p_location_id
         order by i.created_at desc, i.issue_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('issuesAll',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('issuesAll', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- autoScheduleRuns (newest 6) ---------------------------------------------------------
  if 'autoScheduleRuns' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.last_seen_at desc), '[]'::jsonb) from (
        select r.run_id, r.target_month, r.outcome, r.created_count, r.shortage_count, r.error_code,
               r.attempt_count, r.last_seen_at
          from api.workforce_auto_schedule_runs r
         where r.tenant_id = p_tenant_id and r.location_id = p_location_id
         order by r.last_seen_at desc
         limit 6) x);
      v_out := v_out || jsonb_build_object('autoScheduleRuns', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('autoScheduleRuns', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  return v_out;
end;
$$;

comment on function api.manager_dashboard(uuid, uuid, jsonb) is
  '0144 (DEBT-135) + 0155 (one store) + 0156 (staff rows carry manager_scope): the Manager page''s read-only data batch in one RPC. Each requested part reads the same api view / api function as the single read it replaces, as the caller (invoker, ADR 0008), with the same filters, order and row cap; per-part {"rows": [...]} or {"error": {code, message}}. Unknown part / bad input -> 22023.';

revoke all on function api.manager_dashboard(uuid, uuid, jsonb) from public, anon;
grant execute on function api.manager_dashboard(uuid, uuid, jsonb) to authenticated;

-- ============================================================================
-- Rollback (requests already cancelled by a move stay cancelled; each move's
-- counts are in audit.audit_logs, module workforce action move_location):
--   0. re-run the 0155 api.manager_dashboard body (drops manager_scope from
--      the staff part; revert the app first);
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
