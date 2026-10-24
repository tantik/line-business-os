-- ============================================================================
-- 0139 — Deactivating staff closes their access to that tenant (DEBT-121)
-- ----------------------------------------------------------------------------
-- Problem (live-reproduced 2026-10-24 on Cloud DEV): 0138's deactivation
-- trigger revoked pending invitations and the `manager` role only. The user's
-- `employee` role assignment and their core.tenant_memberships row (status
-- 'active') stayed, so a retired employee still signed in to that cafe's
-- /staff (recipes, inventory, schedule) and kept it in the F13 switcher.
--
-- 1. workforce.on_employee_deactivated() (0138 body verbatim) additionally,
--    when the row had a bound account:
--    a. deletes the user's system `employee` role assignment(s) in that tenant
--       (role looked up by key, core.roles.tenant_id IS NULL). ALL of them,
--       not only the one at the employee row's current location_id: 0063
--       allows at most one workforce.employees row per (tenant, user) and the
--       only writer of `employee` assignments is
--       workforce.accept_employee_invitation (0064 / 0138), so every such
--       assignment belongs to this row; and nothing re-scopes the assignment
--       when a Manager later moves the employee to another location, so a
--       location-exact match would leave the old one behind. One audit row
--       (module core, entity role_assignment, action revoke_employee).
--    b. then, only if the user holds NO core.role_assignments row in that
--       tenant any more (tenant_owner / tenant_admin / anything else keeps
--       the membership as is), sets the membership status 'suspended' (only
--       from 'active' or 'invited'). One audit row (module core, entity
--       tenant_membership, action suspend, before/after status).
--       core.has_permission is role-based (0006), so (a) alone removes every
--       permission; (b) removes the tenant from core.is_member_of and
--       api.my_tenant_memberships (status = 'active' only) -> /staff and the
--       switcher.
--    Same on DELETE (reason employee_deleted); still skipped during a tenant
--    cascade exactly as 0138.
-- 2. New AFTER UPDATE OF is_active trigger employees_on_reactivated
--    (false -> true, bound rows only) -> workforce.on_employee_reactivated():
--    if the user's membership in that tenant is 'suspended' it becomes
--    'active' (audit action reactivate); then, if the membership is 'active',
--    the `employee` role at the employee row's CURRENT location_id is
--    re-inserted when missing (audit action restore_employee). A 'revoked' /
--    'invited' / missing membership is never touched and the role is then NOT
--    restored either: has_permission does not look at the membership, so
--    restoring the role next to a revoked membership would hand permissions
--    back to someone support deliberately cut off. The Manager role is NOT
--    restored (0138 accepted behaviour: the Owner re-appoints). Invariant
--    after reactivation: an active, bound employee row with an active
--    membership holds the `employee` role at its location (also for an
--    Owner whose own employee row is reactivated — harmless, the Owner's
--    rights are a superset).
-- 3. Backfill core.revoke_inactive_employee_access() applies 1a + 1b to every
--    existing inactive employee with a bound account (actor NULL / system,
--    reason backfill_inactive); returns the number of employees whose access
--    changed. Idempotent. Owner-only (no grant to any app role, incl.
--    service_role). Called once below.
-- 4. Re-hire gap: workforce.accept_employee_invitation (live body 0138,
--    statements verbatim) now activates the membership from 'invited' OR
--    'suspended' (step 2). A fresh, valid, addressed invitation (pending,
--    unexpired, target_user_id = the caller) created by a
--    workforce.staff.manage holder for an active employee row is an explicit
--    re-grant of access, so a suspended ex-employee re-hired on a NEW employee
--    row (e.g. after a permanent delete) gets the tenant back. A 'revoked'
--    membership is never re-activated: accept then refuses with the same
--    generic invitation_not_acceptable (no new error surface; nothing is
--    written), so support's cut-off stays final. Grants / comment of 0064
--    unchanged (CREATE OR REPLACE keeps them).
--
-- Security: SECURITY DEFINER functions live in core / workforce with a pinned
-- search_path; identity is core.current_user_id() (never an argument); the
-- trigger bodies act only on the row being changed (already authorised by
-- wf_employees_staff_manage RLS or workforce.permanently_delete_employee);
-- revoke from public/anon/authenticated. No new grant, no new table.
--
-- ACCEPTED BEHAVIOUR / known edges (not fixed here):
-- * Anyone allowed to deactivate the row (workforce.staff.manage at its
--   location, also a fellow Manager) thereby suspends that person's access
--   to the tenant unless they hold another role there. Audited; reactivation
--   restores it.
-- * Owner invite accept (0134) still only activates an 'invited' membership.
--   A suspended ex-employee who is later invited as Owner would get the role
--   but keep a suspended membership -> needs support (set status 'active').
--   Accepted: rare, and Owner invitations are platform-issued. (Re-hire as
--   staff is covered by 4; re-hire on the SAME row works via reactivation.)
-- * The "no remaining role" check and the suspend run in one statement-level
--   transaction without an advisory lock; a role granted concurrently in the
--   same instant could leave a suspended membership next to a role. Owner
--   role grants are rare and audited; support reactivates.
--
-- Cost: no new table, no polling, no Realtime. Two indexed statements extra
-- per deactivation / reactivation (rare, human-initiated). Backfill is one
-- pass over inactive bound employees.
--
-- Rollback: commented block at the end of this file.
-- ============================================================================

-- --- 1. deactivation / deletion closes the tenant ---------------------------------
create or replace function workforce.on_employee_deactivated()
returns trigger
language plpgsql security definer set search_path = core, workforce, audit, public, pg_temp as $$
declare
  v_actor uuid := core.current_user_id();
  v_kind text := case when core.current_user_id() is null then 'system' else 'user' end;
  v_tenant uuid;
  v_employee uuid;
  v_user uuid;
  v_reason text;
  v_inv_ids uuid[];
  v_ra_ids uuid[];
  v_emp_ra_ids uuid[];
  v_mem record;
begin
  if tg_op = 'DELETE' then
    v_tenant := old.tenant_id; v_employee := old.id; v_user := old.user_id; v_reason := 'employee_deleted';
    -- tenant cascade: the tenant row is already gone, everything of it goes
    -- with it (an audit row could not even reference it)
    if not exists (select 1 from core.tenants where id = v_tenant) then
      return null;
    end if;
  else
    v_tenant := new.tenant_id; v_employee := new.id; v_user := new.user_id; v_reason := 'employee_deactivated';
  end if;

  -- (on DELETE the FK cascade has usually removed them already; harmless no-op then)
  with revoked as (
    update workforce.employee_invitations
       set status = 'revoked', revoked_at = now()
     where tenant_id = v_tenant and employee_id = v_employee and status = 'pending'
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_inv_ids from revoked;

  if cardinality(v_inv_ids) > 0 then
    insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
    values (v_tenant, v_actor, v_kind, 'workforce',
            'employee_invitation', v_inv_ids[1]::text, 'revoke',
            jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'revoked'),
            jsonb_build_object('employee_id', v_employee, 'invitation_ids', to_jsonb(v_inv_ids), 'reason', v_reason));
  end if;

  if v_user is not null then
    with gone as (
      delete from core.role_assignments
       where tenant_id = v_tenant and user_id = v_user
         and role_id = '00000000-0000-0000-0000-000000000005'
      returning id
    )
    select coalesce(array_agg(id), '{}') into v_ra_ids from gone;

    if cardinality(v_ra_ids) > 0 then
      insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
      values (v_tenant, v_actor, v_kind, 'core',
              'role_assignment', v_ra_ids[1]::text, 'revoke_manager',
              jsonb_build_object('is_manager', true), jsonb_build_object('is_manager', false),
              jsonb_build_object('employee_id', v_employee, 'user_id', v_user, 'role_key', 'manager',
                                 'role_assignment_ids', to_jsonb(v_ra_ids), 'reason', v_reason));
    end if;

    -- 0139 (DEBT-121) a: the employee role goes too
    with gone as (
      delete from core.role_assignments
       where tenant_id = v_tenant and user_id = v_user
         and role_id in (select r.id from core.roles r where r.tenant_id is null and r.key = 'employee')
      returning id
    )
    select coalesce(array_agg(id), '{}') into v_emp_ra_ids from gone;

    if cardinality(v_emp_ra_ids) > 0 then
      insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
      values (v_tenant, v_actor, v_kind, 'core',
              'role_assignment', v_emp_ra_ids[1]::text, 'revoke_employee',
              jsonb_build_object('is_employee', true), jsonb_build_object('is_employee', false),
              jsonb_build_object('employee_id', v_employee, 'user_id', v_user, 'role_key', 'employee',
                                 'role_assignment_ids', to_jsonb(v_emp_ra_ids), 'reason', v_reason));
    end if;

    -- 0139 (DEBT-121) b: no role left in this tenant -> suspend the membership
    if not exists (select 1 from core.role_assignments where tenant_id = v_tenant and user_id = v_user) then
      select m.id, m.status into v_mem
        from core.tenant_memberships m
       where m.tenant_id = v_tenant and m.user_id = v_user and m.status in ('active', 'invited')
       for update;
      if found then
        update core.tenant_memberships set status = 'suspended' where id = v_mem.id;

        insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
        values (v_tenant, v_actor, v_kind, 'core',
                'tenant_membership', v_mem.id::text, 'suspend',
                jsonb_build_object('status', v_mem.status::text), jsonb_build_object('status', 'suspended'),
                jsonb_build_object('employee_id', v_employee, 'user_id', v_user, 'reason', v_reason));
      end if;
    end if;
  end if;

  return null;
end;
$$;
comment on function workforce.on_employee_deactivated() is
  '0138 (DEBT-094) + 0139 (DEBT-121): AFTER trigger body for workforce.employees. UPDATE: fires only on is_active true -> false (reason employee_deactivated). DELETE: fires only when the deleted row had a bound account (reason employee_deleted; skipped during a tenant cascade). Revokes pending invitations, deletes the user''s manager AND employee role assignments in that tenant (owner / admin / other roles kept), and when the user then holds no role in that tenant suspends their membership (active/invited -> suspended); one audit row per kind of change. SECURITY DEFINER because the deactivating / deleting Manager has no write access to core.role_assignments / core.tenant_memberships; it acts only on the row being changed (already authorised by wf_employees_staff_manage RLS or workforce.permanently_delete_employee). Reactivation: workforce.on_employee_reactivated.';
revoke all on function workforce.on_employee_deactivated() from public, anon, authenticated;
-- (triggers employees_on_deactivated / employees_on_deleted from 0138 keep pointing at this function)

-- --- 2. reactivation restores the employee access -----------------------------------
create or replace function workforce.on_employee_reactivated()
returns trigger
language plpgsql security definer set search_path = core, workforce, audit, public, pg_temp as $$
declare
  v_actor uuid := core.current_user_id();
  v_kind text := case when core.current_user_id() is null then 'system' else 'user' end;
  v_mem record;
  v_role uuid;
  v_new_id uuid;
begin
  if new.user_id is null then
    return null;
  end if;

  select m.id, m.status into v_mem
    from core.tenant_memberships m
   where m.tenant_id = new.tenant_id and m.user_id = new.user_id
   for update;
  -- missing / revoked / invited membership: never touched, role not restored
  if not found or v_mem.status not in ('active', 'suspended') then
    return null;
  end if;

  if v_mem.status = 'suspended' then
    update core.tenant_memberships set status = 'active' where id = v_mem.id;

    insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
    values (new.tenant_id, v_actor, v_kind, 'core',
            'tenant_membership', v_mem.id::text, 'reactivate',
            jsonb_build_object('status', 'suspended'), jsonb_build_object('status', 'active'),
            jsonb_build_object('employee_id', new.id, 'user_id', new.user_id, 'reason', 'employee_reactivated'));
  end if;

  select r.id into v_role from core.roles r where r.tenant_id is null and r.key = 'employee';
  if v_role is null then
    return null;  -- fail closed: no role to restore
  end if;

  insert into core.role_assignments (tenant_id, user_id, role_id, location_id)
  select new.tenant_id, new.user_id, v_role, new.location_id
   where not exists (
     select 1 from core.role_assignments
      where tenant_id = new.tenant_id and user_id = new.user_id
        and role_id = v_role
        and location_id is not distinct from new.location_id)
  returning id into v_new_id;

  if v_new_id is not null then
    insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
    values (new.tenant_id, v_actor, v_kind, 'core',
            'role_assignment', v_new_id::text, 'restore_employee',
            jsonb_build_object('is_employee', false), jsonb_build_object('is_employee', true),
            jsonb_build_object('employee_id', new.id, 'user_id', new.user_id, 'role_key', 'employee',
                               'location_id', new.location_id, 'reason', 'employee_reactivated'));
  end if;

  return null;
end;
$$;
comment on function workforce.on_employee_reactivated() is
  '0139 (DEBT-121): AFTER UPDATE OF is_active trigger body for workforce.employees (false -> true, bound rows only). Suspended membership -> active (audit reactivate); then, when the membership is active, re-inserts the system employee role at the row''s current location if missing (audit restore_employee). A revoked / invited / missing membership is never touched and the role is then not restored. The manager role is never restored (the Owner re-appoints). SECURITY DEFINER for the same reason as workforce.on_employee_deactivated; acts only on the row being changed.';
revoke all on function workforce.on_employee_reactivated() from public, anon, authenticated;

drop trigger if exists employees_on_reactivated on workforce.employees;
create trigger employees_on_reactivated
  after update of is_active on workforce.employees
  for each row
  when (not old.is_active and new.is_active and new.user_id is not null)
  execute function workforce.on_employee_reactivated();

-- --- 3. backfill: no inactive employee keeps access ------------------------------------
create or replace function core.revoke_inactive_employee_access()
returns integer
language plpgsql security definer set search_path = core, workforce, audit, public, pg_temp as $$
declare
  v_emp record;
  v_ids uuid[];
  v_mem record;
  v_changed boolean;
  v_count integer := 0;
begin
  for v_emp in
    select e.id, e.tenant_id, e.user_id
      from workforce.employees e
     where not e.is_active and e.user_id is not null
     order by e.tenant_id, e.id
  loop
    v_changed := false;

    with gone as (
      delete from core.role_assignments
       where tenant_id = v_emp.tenant_id and user_id = v_emp.user_id
         and role_id in (select r.id from core.roles r where r.tenant_id is null and r.key = 'employee')
      returning id
    )
    select coalesce(array_agg(id), '{}') into v_ids from gone;

    if cardinality(v_ids) > 0 then
      v_changed := true;
      insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
      values (v_emp.tenant_id, null, 'system', 'core',
              'role_assignment', v_ids[1]::text, 'revoke_employee',
              jsonb_build_object('is_employee', true), jsonb_build_object('is_employee', false),
              jsonb_build_object('employee_id', v_emp.id, 'user_id', v_emp.user_id, 'role_key', 'employee',
                                 'role_assignment_ids', to_jsonb(v_ids), 'reason', 'backfill_inactive'));
    end if;

    if not exists (select 1 from core.role_assignments where tenant_id = v_emp.tenant_id and user_id = v_emp.user_id) then
      select m.id, m.status into v_mem
        from core.tenant_memberships m
       where m.tenant_id = v_emp.tenant_id and m.user_id = v_emp.user_id and m.status in ('active', 'invited')
       for update;
      if found then
        v_changed := true;
        update core.tenant_memberships set status = 'suspended' where id = v_mem.id;

        insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
        values (v_emp.tenant_id, null, 'system', 'core',
                'tenant_membership', v_mem.id::text, 'suspend',
                jsonb_build_object('status', v_mem.status::text), jsonb_build_object('status', 'suspended'),
                jsonb_build_object('employee_id', v_emp.id, 'user_id', v_emp.user_id, 'reason', 'backfill_inactive'));
      end if;
    end if;

    if v_changed then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;
comment on function core.revoke_inactive_employee_access() is
  '0139 backfill (DEBT-121): for every inactive workforce.employees row with a bound account, deletes the user''s employee role assignments in that tenant and, when the user then holds no role there, suspends the membership (active/invited -> suspended); audit rows actor NULL / system, reason backfill_inactive. Returns the number of employees whose access changed. Idempotent. Not granted to any app role.';
revoke all on function core.revoke_inactive_employee_access() from public, anon, authenticated, service_role;

select core.revoke_inactive_employee_access();

-- --- 4. re-hire: accept re-activates a suspended (never a revoked) membership -------
-- Live body from 0138: statements verbatim (long comments shortened), plus
-- step 0b (revoked membership -> refuse) and 'suspended' in step 2.
create or replace function workforce.accept_employee_invitation(
  p_invitation_id uuid
)
returns table (
  out_tenant_id uuid,
  out_employee_id uuid
)
language plpgsql
security definer
set search_path = core, workforce, public
as $$
declare
  v_uid uuid := core.current_user_id();
  v_inv workforce.employee_invitations%rowtype;
  v_employee_role_id uuid;
  v_location_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_inv
    from workforce.employee_invitations
   where id = p_invitation_id
     and target_user_id = v_uid
     and status = 'pending'
     and expires_at > now()
   for update;

  if not found then
    raise exception 'invitation_not_acceptable' using errcode = 'P0001';
  end if;

  -- 0. (0138, DEBT-094) a deactivated employee cannot accept: same generic
  --    error as any other non-acceptable invitation.
  if not exists (
    select 1 from workforce.employees e
     where e.tenant_id = v_inv.tenant_id and e.id = v_inv.employee_id and e.is_active
  ) then
    raise exception 'invitation_not_acceptable' using errcode = 'P0001';
  end if;

  -- Never silently rebind an employee already bound to a (possibly
  -- different) user_id -- covers the race where two invitations somehow
  -- targeted the same employee, and simple defense-in-depth generally.
  if exists (
    select 1 from workforce.employees e
     where e.tenant_id = v_inv.tenant_id and e.id = v_inv.employee_id and e.user_id is not null
  ) then
    raise exception 'employee_already_bound' using errcode = 'P0001';
  end if;

  -- 0b. (0139, DEBT-121) a revoked membership is final: same generic error,
  --     nothing written.
  if exists (
    select 1 from core.tenant_memberships m
     where m.tenant_id = v_inv.tenant_id and m.user_id = v_uid and m.status = 'revoked'
  ) then
    raise exception 'invitation_not_acceptable' using errcode = 'P0001';
  end if;

  -- 1. ensure core.users mirror row (id-only; no PII written here).
  insert into core.users (id) values (v_uid)
  on conflict (id) do nothing;

  -- 2. ensure tenant membership (create active, or activate an 'invited' row;
  --    since 0139 also a 'suspended' one: this invitation is an explicit re-grant).
  insert into core.tenant_memberships (tenant_id, user_id, status, invited_by)
    values (v_inv.tenant_id, v_uid, 'active', v_inv.invited_by)
  on conflict (tenant_id, user_id) do nothing;

  update core.tenant_memberships
     set status = 'active'
   where tenant_id = v_inv.tenant_id
     and user_id = v_uid
     and status in ('invited', 'suspended');

  -- 3. ensure the system `employee` role assignment, scoped to the
  --    employee's own location_id.
  select id into v_employee_role_id
    from core.roles where tenant_id is null and key = 'employee';
  if v_employee_role_id is null then
    raise exception 'employee_role_missing' using errcode = 'P0001';
  end if;

  select location_id into v_location_id
    from workforce.employees where tenant_id = v_inv.tenant_id and id = v_inv.employee_id;

  insert into core.role_assignments (tenant_id, user_id, role_id, location_id)
  select v_inv.tenant_id, v_uid, v_employee_role_id, v_location_id
  where not exists (
    select 1 from core.role_assignments
     where tenant_id = v_inv.tenant_id and user_id = v_uid
       and role_id = v_employee_role_id
       and location_id is not distinct from v_location_id
  );

  -- 4. bind.
  update workforce.employees
     set user_id = v_uid
   where tenant_id = v_inv.tenant_id
     and id = v_inv.employee_id
     and user_id is null;
  if not found then
    raise exception 'employee_already_bound' using errcode = 'P0001';
  end if;

  -- 5. mark accepted.
  update workforce.employee_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv.id;

  return query select v_inv.tenant_id, v_inv.employee_id;
end;
$$;
-- (create or replace keeps the 0064 comment and grants: execute to authenticated only)

-- ============================================================================
-- Rollback (suspended memberships and removed employee roles are NOT
-- restored automatically; every change is in audit.audit_logs with action
-- revoke_employee / suspend and reason employee_deactivated / employee_deleted
-- / backfill_inactive — restore by hand from there if wanted):
--   -- previous workforce.accept_employee_invitation body: 0138 section "3b"
--   -- verbatim, i.e. this file's section 4 body WITHOUT the "0b. (0139)" block
--   -- and with step 2's update back to `and status = 'invited'`.
--   drop function if exists core.revoke_inactive_employee_access();
--   drop trigger if exists employees_on_reactivated on workforce.employees;
--   drop function if exists workforce.on_employee_reactivated();
--   -- previous workforce.on_employee_deactivated body + comment: 0138 section
--   -- "3a" verbatim, i.e. this file's body WITHOUT the two "0139 (DEBT-121)"
--   -- blocks (and without v_emp_ra_ids / v_mem); then
--   --   revoke all on function workforce.on_employee_deactivated() from public, anon, authenticated;
-- ============================================================================
