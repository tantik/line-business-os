-- ============================================================================
-- 0140 — Admin appointment (4B-4b) + staff self-guards (DEBT-123 b) +
--        friendly rehire refusal (DEBT-123 c)
-- ----------------------------------------------------------------------------
-- Plan: docs/architecture/tenant-provisioning-plan-2026-10-18.md §5 (4B-4b).
--
-- 1. core.set_employee_admin_role(tenant, employee, is_admin) + invoker api
--    wrapper (ADR 0008). Mirrors 0138's set_employee_manager_role, but the
--    caller must HOLD the system `tenant_owner` role assignment in that tenant
--    (core.caller_is_tenant_owner). Deliberately a role-assignment check and
--    NOT a permission check: tenant_admin holds every permission except
--    core.billing.manage (0008), so any permission an Owner has an Admin also
--    has, and a permission check would let an Admin appoint Admins. No
--    platform-staff bypass either (core.has_permission has one; this does
--    not). Promote adds ONE tenant-wide `tenant_admin` role assignment
--    (location NULL); demote deletes every `tenant_admin` assignment of that
--    user in that tenant. tenant_owner / manager / employee assignments are
--    never touched. Idempotent. Refuses (same codes / shape as 0138): not
--    signed in (28000), null argument (22004), caller is not an Owner (42501
--    permission_denied), Workforce OFF (P0001 workforce_module_disabled),
--    system role missing (P0001 role_missing), employee not in this tenant
--    (P0002 employee_not_found), inactive (P0001 employee_inactive — like
--    0138 for BOTH appoint and revoke; an inactive employee holds no admin
--    role anyway, the deactivation trigger below removed it), no bound
--    account (P0001 employee_has_no_account), the caller's own employee row
--    (P0001 cannot_change_own_role). One audit.audit_logs row per real change
--    (module core, entity role_assignment, action appoint_admin /
--    revoke_admin, before/after {is_admin} only — ids, no PII).
-- 2. api.is_tenant_owner(tenant) — invoker wrapper over the narrow SECURITY
--    DEFINER core.caller_is_tenant_owner(tenant): true iff the CALLER holds
--    tenant_owner there. Answers only about the caller. UI gate only; the
--    RPC above stays the enforcement point.
-- 3. Read: api.workforce_staff_manage gets one appended column `is_admin`
--    (CREATE OR REPLACE VIEW may only append; 0138 columns / order
--    unchanged), computed by core.employee_user_is_admin(tenant, user_id),
--    built exactly like 0138's core.employee_user_is_manager (answers only
--    for a workforce.staff.manage holder in that tenant, else false).
-- 4. workforce.on_employee_deactivated() (live body 0139, statements
--    verbatim) additionally deletes the user's `tenant_admin` assignments in
--    that tenant (audit action revoke_admin, reason employee_deactivated /
--    employee_deleted). It runs BEFORE 0139's step b ("no role left ->
--    suspend the membership"), so a deactivated admin-only employee is
--    suspended too. tenant_owner is NEVER touched. Reactivation does not
--    restore the Admin role (same as Manager: the Owner re-appoints).
--    Backfill core.revoke_inactive_employee_admins() (owner-only, like 0138's
--    manager backfill; audit actor NULL / system, reason backfill_inactive),
--    then 0139's core.revoke_inactive_employee_access() is re-run so a
--    backfilled user left with no role is suspended like the trigger would.
-- 5. DEBT-123 (b): BEFORE triggers on workforce.employees
--    (workforce.guard_employee_self_offboarding): a signed-in user cannot
--    deactivate (is_active true -> false; P0001 cannot_deactivate_self) or
--    delete (P0001 cannot_delete_self) the employee row bound to their own
--    account. Never fires without a signed-in identity
--    (core.current_user_id() NULL: system / service / migrations), is
--    skipped during a tenant cascade, and exempts a caller holding
--    tenant_owner in that tenant (core.caller_is_tenant_owner): the Owner
--    keeps access through tenant_owner, so the guard would only get in the
--    way.
-- 5b. (review P2) workforce.upsert_employee_invitation additionally requires
--    workforce.staff.manage at the employee row's location (42501
--    permission_denied) — the wf_employees_staff_manage RLS boundary; before,
--    staff.manage anywhere in the tenant was enough. The invite-employee Edge
--    Function maps it to 403 not_authorized.
-- 6. DEBT-123 (c): re-hire on a NEW employee row while the old (usually
--    inactive) row is still bound to the same account failed at accept with a
--    raw 23505 on wf_employees_one_per_tenant_per_user (0063) — reproduced
--    locally 2026-10-24 before this migration. Now:
--    a. workforce.upsert_employee_invitation (live body 0097, statements
--       verbatim) refuses up front with P0001 user_has_other_employee_record
--       when p_target_user_id is already bound to ANOTHER workforce.employees
--       row in that tenant (active or not); nothing written. The
--       invite-employee Edge Function maps it to 409
--       {error: 'user_has_other_employee_record'}; apps/web shows "reactivate
--       the earlier record" copy.
--    b. workforce.accept_employee_invitation (live body 0139, statements
--       verbatim) refuses the same situation BEFORE any write with the
--       existing generic invitation_not_acceptable (covers invitations
--       created before this migration; no new error surface for the
--       callback).
--
-- Security: every SECURITY DEFINER function lives in core / workforce with a
-- pinned search_path; identity is core.current_user_id() (never an argument);
-- revoke from public/anon; api.* stays SECURITY INVOKER (ADR 0008). No new
-- table, no new grant on core.role_assignments.
--
-- ACCEPTED BEHAVIOUR: as in 0138 for Managers, anyone allowed to deactivate
-- (or delete) an Admin's employee row (workforce.staff.manage at its location)
-- thereby removes that person's Admin role tenant-wide. Audited; the Owner
-- re-appoints. An Admin who is not bound to an employee row cannot be revoked
-- through this RPC (employee_not_found) — Admins without an employee row are
-- platform-issued and handled by support.
--
-- Cost: no new table, no polling, no Realtime. One RPC per appoint/revoke
-- (rare, Owner-only); the staff list read gains one more indexed EXISTS per
-- row (role_assignments_user_idx) — tens of rows per tenant, negligible at
-- 300+ tenants. Two trivial BEFORE triggers on a rarely written table.
--
-- Rollback: commented block at the end of this file.
-- ============================================================================

-- --- 2. caller is Owner (needed by 1) ---------------------------------------------
create or replace function core.caller_is_tenant_owner(p_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = core, public, pg_temp as $$
  select core.current_user_id() is not null
     and exists (
       select 1 from core.role_assignments ra
        where ra.tenant_id = p_tenant_id
          and ra.user_id = core.current_user_id()
          and ra.role_id = '00000000-0000-0000-0000-000000000003');
$$;
comment on function core.caller_is_tenant_owner(uuid) is
  '0140: true iff the CALLER (core.current_user_id()) holds the system tenant_owner role assignment (any location) in p_tenant_id. Role-assignment check, not a permission check (tenant_admin holds every permission except billing), and no platform-staff bypass. Reveals nothing about anyone else. Used by core.set_employee_admin_role and api.is_tenant_owner.';
revoke all on function core.caller_is_tenant_owner(uuid) from public, anon;
grant execute on function core.caller_is_tenant_owner(uuid) to authenticated;

create or replace function api.is_tenant_owner(p_tenant_id uuid)
returns boolean language sql stable security invoker set search_path = core, public as $$
  select core.caller_is_tenant_owner(p_tenant_id);
$$;
comment on function api.is_tenant_owner(uuid) is
  'Invoker-only passthrough to core.caller_is_tenant_owner (0140, ADR 0008). UI gate only (show the Admin appoint/revoke controls); core.set_employee_admin_role re-checks.';
revoke all on function api.is_tenant_owner(uuid) from public, anon;
grant execute on function api.is_tenant_owner(uuid) to authenticated;

-- --- 1. appoint / revoke an Admin -------------------------------------------------
create or replace function core.set_employee_admin_role(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_is_admin boolean
)
returns jsonb
language plpgsql security definer set search_path = core, workforce, audit, public, pg_temp as $$
declare
  v_uid uuid := core.current_user_id();
  v_emp record;
  v_admin_role uuid := '00000000-0000-0000-0000-000000000004';
  v_was boolean;
  v_ids uuid[];
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_tenant_id is null or p_employee_id is null or p_is_admin is null then
    raise exception 'invalid_argument: tenant_id, employee_id and is_admin are required' using errcode = '22004';
  end if;
  -- Owner role assignment, NOT a permission: an Admin holds every permission
  -- an Owner uses here, so a permission check would let Admins appoint Admins.
  if not core.caller_is_tenant_owner(p_tenant_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not core.has_module_access(p_tenant_id, 'workforce') then
    raise exception 'workforce_module_disabled' using errcode = 'P0001';
  end if;
  -- the system role must exist (fail closed instead of inserting a dangling id)
  if not exists (select 1 from core.roles where id = v_admin_role and tenant_id is null and key = 'tenant_admin') then
    raise exception 'role_missing' using errcode = 'P0001';
  end if;

  select e.id, e.user_id, e.is_active into v_emp
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

  -- serialize concurrent appoint/revoke for the same person (NULL location is
  -- distinct in the unique index, so the index alone cannot stop a duplicate)
  perform pg_advisory_xact_lock(hashtextextended('core.role_assignments:tenant_admin:' || p_tenant_id::text || ':' || v_emp.user_id::text, 0));

  select coalesce(array_agg(id), '{}') into v_ids
    from core.role_assignments
   where tenant_id = p_tenant_id and user_id = v_emp.user_id and role_id = v_admin_role;
  v_was := cardinality(v_ids) > 0;

  if p_is_admin = v_was then
    return jsonb_build_object('employee_id', p_employee_id, 'is_admin', v_was, 'changed', false);
  end if;

  if p_is_admin then
    insert into core.role_assignments (tenant_id, user_id, role_id, location_id)
    values (p_tenant_id, v_emp.user_id, v_admin_role, null)
    returning id into v_new_id;

    insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
    values (p_tenant_id, v_uid, 'user', 'core', 'role_assignment', v_new_id::text, 'appoint_admin',
            jsonb_build_object('is_admin', false), jsonb_build_object('is_admin', true),
            jsonb_build_object('employee_id', p_employee_id, 'user_id', v_emp.user_id, 'role_key', 'tenant_admin', 'location_id', null));
  else
    delete from core.role_assignments where id = any(v_ids);

    insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
    values (p_tenant_id, v_uid, 'user', 'core', 'role_assignment', v_ids[1]::text, 'revoke_admin',
            jsonb_build_object('is_admin', true), jsonb_build_object('is_admin', false),
            jsonb_build_object('employee_id', p_employee_id, 'user_id', v_emp.user_id, 'role_key', 'tenant_admin',
                               'role_assignment_ids', to_jsonb(v_ids), 'reason', 'owner_revoked'));
  end if;

  return jsonb_build_object('employee_id', p_employee_id, 'is_admin', p_is_admin, 'changed', true);
end;
$$;
comment on function core.set_employee_admin_role(uuid, uuid, boolean) is
  '4B-4b (0140): the Owner (holder of the system tenant_owner role assignment in that tenant — not a permission check) appoints (one tenant-wide tenant_admin role_assignment) or revokes (every tenant_admin assignment of that user in that tenant) an Admin for an active employee with a bound account. Never touches owner/manager/employee assignments; never the caller''s own row. Idempotent; one audit row per real change. Identity = core.current_user_id().';

revoke all on function core.set_employee_admin_role(uuid, uuid, boolean) from public, anon;
grant execute on function core.set_employee_admin_role(uuid, uuid, boolean) to authenticated;

create or replace function api.set_employee_admin_role(p_tenant_id uuid, p_employee_id uuid, p_is_admin boolean)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.set_employee_admin_role(p_tenant_id, p_employee_id, p_is_admin);
$$;
comment on function api.set_employee_admin_role(uuid, uuid, boolean) is
  'Invoker-only passthrough to core.set_employee_admin_role (0140, ADR 0008).';
revoke all on function api.set_employee_admin_role(uuid, uuid, boolean) from public, anon;
grant execute on function api.set_employee_admin_role(uuid, uuid, boolean) to authenticated;

-- --- 3. read: is_admin on the Manager staff list ----------------------------------
create or replace function core.employee_user_is_admin(p_tenant_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = core, public, pg_temp as $$
  select p_user_id is not null
     and core.has_permission_in_tenant(p_tenant_id, 'workforce.staff.manage')
     and exists (
       select 1 from core.role_assignments ra
        where ra.tenant_id = p_tenant_id
          and ra.user_id = p_user_id
          and ra.role_id = '00000000-0000-0000-0000-000000000004');
$$;
comment on function core.employee_user_is_admin(uuid, uuid) is
  '0140: true when p_user_id holds the system tenant_admin role (any location) in p_tenant_id. Answers only for a caller holding workforce.staff.manage in that tenant (else false), so it reveals nothing to anyone else. Used by api.workforce_staff_manage.is_admin.';
revoke all on function core.employee_user_is_admin(uuid, uuid) from public, anon;
grant execute on function core.employee_user_is_admin(uuid, uuid) to authenticated;

-- Same columns, same order as 0138; only `is_admin` is appended.
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
  core.employee_user_is_admin(e.tenant_id, e.user_id) as is_admin
from workforce.employees e
where core.has_permission(e.tenant_id, 'workforce.staff.manage', e.location_id);

comment on view api.workforce_staff_manage is
  'Manager-only staff read/write facade. Includes advisory hourly wage, contact PII (encrypted), has_account_access (derived boolean, never the raw user_id itself), since 0138 is_manager and since 0140 is_admin (derived booleans, read-only). security_invoker/RLS, and since 0122 the view itself only returns rows where the caller holds workforce.staff.manage at the row''s location.';

grant select, insert, update on api.workforce_staff_manage to authenticated;
revoke all on api.workforce_staff_manage from anon, public;

-- --- 4. deactivation / deletion also removes the Admin role ------------------------
-- Live body from 0139: statements verbatim, plus the "0140" block (before
-- 0139's step b so an admin-only employee is suspended too).
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
  v_admin_ra_ids uuid[];
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

    -- 0140 (4B-4b): the tenant_admin role goes too (tenant_owner is never touched)
    with gone as (
      delete from core.role_assignments
       where tenant_id = v_tenant and user_id = v_user
         and role_id = '00000000-0000-0000-0000-000000000004'
      returning id
    )
    select coalesce(array_agg(id), '{}') into v_admin_ra_ids from gone;

    if cardinality(v_admin_ra_ids) > 0 then
      insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
      values (v_tenant, v_actor, v_kind, 'core',
              'role_assignment', v_admin_ra_ids[1]::text, 'revoke_admin',
              jsonb_build_object('is_admin', true), jsonb_build_object('is_admin', false),
              jsonb_build_object('employee_id', v_employee, 'user_id', v_user, 'role_key', 'tenant_admin',
                                 'role_assignment_ids', to_jsonb(v_admin_ra_ids), 'reason', v_reason));
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
  '0138 (DEBT-094) + 0139 (DEBT-121) + 0140 (4B-4b): AFTER trigger body for workforce.employees. UPDATE: fires only on is_active true -> false (reason employee_deactivated). DELETE: fires only when the deleted row had a bound account (reason employee_deleted; skipped during a tenant cascade). Revokes pending invitations, deletes the user''s manager, tenant_admin (0140) AND employee role assignments in that tenant (tenant_owner / other roles kept), and when the user then holds no role in that tenant suspends their membership (active/invited -> suspended); one audit row per kind of change. SECURITY DEFINER because the deactivating / deleting Manager has no write access to core.role_assignments / core.tenant_memberships; it acts only on the row being changed (already authorised by wf_employees_staff_manage RLS or workforce.permanently_delete_employee). Reactivation: workforce.on_employee_reactivated (never restores manager / admin).';
revoke all on function workforce.on_employee_deactivated() from public, anon, authenticated;
-- (triggers employees_on_deactivated / employees_on_deleted from 0138 keep pointing at this function)

-- --- 4b. backfill: no inactive Admin survives this migration ------------------------
create or replace function core.revoke_inactive_employee_admins()
returns integer
language plpgsql security definer set search_path = core, workforce, audit, public, pg_temp as $$
declare
  v_count integer;
begin
  with gone as (
    delete from core.role_assignments ra
     using workforce.employees e
     where e.tenant_id = ra.tenant_id
       and e.user_id = ra.user_id
       and not e.is_active
       and ra.role_id = '00000000-0000-0000-0000-000000000004'
    returning ra.id, ra.tenant_id, ra.user_id, ra.location_id, e.id as employee_id
  ), logged as (
    insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
    select g.tenant_id, null, 'system', 'core', 'role_assignment', g.id::text, 'revoke_admin',
           jsonb_build_object('is_admin', true), jsonb_build_object('is_admin', false),
           jsonb_build_object('employee_id', g.employee_id, 'user_id', g.user_id, 'role_key', 'tenant_admin',
                              'location_id', g.location_id, 'reason', 'backfill_inactive')
      from gone g
    returning 1
  )
  select count(*)::int into v_count from logged;
  return v_count;
end;
$$;
comment on function core.revoke_inactive_employee_admins() is
  '0140 backfill: deletes every tenant_admin role assignment whose user''s employee row in that tenant is inactive (legacy data from before the deactivation trigger removed admins), one audit row each (actor NULL / system, reason backfill_inactive). Returns the number removed. Idempotent. Not granted to any app role.';
revoke all on function core.revoke_inactive_employee_admins() from public, anon, authenticated, service_role;

-- The notice makes the count visible in the apply output ("check whether any
-- exist"); then 0139's backfill suspends anyone left with no role.
do $$
begin
  raise notice '0140 backfill: % inactive tenant_admin assignment(s) removed', core.revoke_inactive_employee_admins();
  raise notice '0140 backfill: % inactive employee(s) whose access changed (0139 re-run)', core.revoke_inactive_employee_access();
end $$;

-- --- 5. DEBT-123 (b): nobody deactivates / deletes their own employee row -----------
create or replace function workforce.guard_employee_self_offboarding()
returns trigger
language plpgsql set search_path = core, workforce, public, pg_temp as $$
declare
  v_uid uuid := core.current_user_id();
begin
  if tg_op = 'DELETE' then
    -- system / service / migration contexts have no identity: never blocked;
    -- tenant cascade (the tenant row is already gone): never blocked;
    -- an Owner keeps access through tenant_owner (0139 never touches it): exempt
    if v_uid is not null and old.user_id = v_uid
       and exists (select 1 from core.tenants where id = old.tenant_id)
       and not core.caller_is_tenant_owner(old.tenant_id) then
      raise exception 'cannot_delete_self' using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- UPDATE (trigger WHEN: is_active true -> false on a bound row)
  if v_uid is not null and old.user_id = v_uid
     and not core.caller_is_tenant_owner(old.tenant_id) then
    raise exception 'cannot_deactivate_self' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
comment on function workforce.guard_employee_self_offboarding() is
  '0140 (DEBT-123 b): BEFORE trigger body for workforce.employees. A signed-in user cannot deactivate (is_active true -> false: cannot_deactivate_self) or delete (cannot_delete_self) the employee row bound to their own account — they would lock themselves out (0139). No-op without an identity (core.current_user_id() NULL), during a tenant cascade, and for a caller holding tenant_owner in that tenant (core.caller_is_tenant_owner: the Owner keeps access through that role). Ask the Owner instead.';
revoke all on function workforce.guard_employee_self_offboarding() from public, anon, authenticated;

drop trigger if exists employees_guard_self_deactivate on workforce.employees;
create trigger employees_guard_self_deactivate
  before update of is_active on workforce.employees
  for each row
  when (old.is_active and not new.is_active and old.user_id is not null)
  execute function workforce.guard_employee_self_offboarding();

drop trigger if exists employees_guard_self_delete on workforce.employees;
create trigger employees_guard_self_delete
  before delete on workforce.employees
  for each row
  when (old.user_id is not null)
  execute function workforce.guard_employee_self_offboarding();

-- --- 6a. DEBT-123 (c): invite refuses an account bound to another employee row ------
-- Live body from 0097: statements verbatim, plus the two "0140" checks
-- (location boundary; account bound to another row) and location_id in the
-- employee read.
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
  v_employee_location_id uuid;
  v_existing_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if not core.has_module_access(p_tenant_id, 'workforce') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not core.has_permission_in_tenant(p_tenant_id, 'workforce.staff.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- (0140: location_id is read too, for the location check below)
  select user_id, location_id into v_employee_user_id, v_employee_location_id
    from workforce.employees
   where tenant_id = p_tenant_id and id = p_employee_id;

  if not found then
    raise exception 'employee_not_found' using errcode = 'P0001';
  end if;
  -- 0140 (review P2): staff.manage must cover the employee row's location --
  -- the same boundary as the wf_employees_staff_manage RLS (a Manager of L2
  -- cannot invite an L1 employee). Tenant-wide holders pass everywhere.
  if not core.has_permission(p_tenant_id, 'workforce.staff.manage', v_employee_location_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if v_employee_user_id is not null then
    raise exception 'employee_already_bound' using errcode = 'P0001';
  end if;

  -- 0140 (DEBT-123 c): the account is already bound to another employee row
  -- in this tenant (0063 allows one) -- accept would fail with a raw 23505.
  -- Reactivate the earlier row instead. Nothing written.
  if exists (
    select 1 from workforce.employees e
     where e.tenant_id = p_tenant_id and e.user_id = p_target_user_id and e.id <> p_employee_id
  ) then
    raise exception 'user_has_other_employee_record' using errcode = 'P0001';
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
  'The only path that creates/refreshes an employee_invitations row (invite AND resend). Now also requires core.has_module_access(p_tenant_id, ''workforce'') (WP-S5) -- a Manager should not be able to invite new staff into, or resend an invitation for, a tenant whose Workforce module is OFF. SECURITY DEFINER because there is deliberately no INSERT policy and no target_user_id/expires_at UPDATE policy for authenticated (0064); re-verifies core.has_permission_in_tenant(workforce.staff.manage) itself rather than trusting the caller already checked. Since 0140 also requires workforce.staff.manage at the employee row''s location (42501 permission_denied; same boundary as wf_employees_staff_manage RLS) and (DEBT-123 c) refuses with user_has_other_employee_record when the target account is already bound to another employee row in the tenant (active or not).';
-- (create or replace keeps the 0065 grants: execute to authenticated)

-- --- 6b. DEBT-123 (c): accept refuses the same situation before any write -----------
-- Live body from 0139: statements verbatim, plus step 0c.
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

  -- 0c. (0140, DEBT-123 c) the caller is already bound to another employee
  --     row in this tenant (0063: one per tenant) -- the bind below would
  --     fail with a raw 23505. Same generic error, nothing written.
  if exists (
    select 1 from workforce.employees e
     where e.tenant_id = v_inv.tenant_id and e.user_id = v_uid and e.id <> v_inv.employee_id
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
-- Rollback (Admin assignments created by appointments stay; drop them by hand
-- if wanted: delete from core.role_assignments where role_id = tenant_admin
-- and the audit log shows appoint_admin. Admin roles removed by the trigger
-- or the backfill, and memberships suspended by the 0139 re-run, are NOT
-- restored; every change is in audit.audit_logs with action revoke_admin /
-- suspend and reason employee_deactivated / employee_deleted /
-- backfill_inactive):
--   -- previous workforce.accept_employee_invitation body: 0139 section 4
--   -- verbatim, i.e. this file's section 6b body WITHOUT the "0c. (0140)" block.
--   -- previous workforce.upsert_employee_invitation body + comment: 0097
--   -- lines 827-893 verbatim, i.e. this file's section 6a WITHOUT the "0140" check.
--   drop trigger if exists employees_guard_self_delete on workforce.employees;
--   drop trigger if exists employees_guard_self_deactivate on workforce.employees;
--   drop function if exists workforce.guard_employee_self_offboarding();
--   drop function if exists core.revoke_inactive_employee_admins();
--   -- previous workforce.on_employee_deactivated body + comment: 0139 section 1
--   -- verbatim, i.e. this file's section 4 body WITHOUT the "0140 (4B-4b)" block
--   -- (and without v_admin_ra_ids); then
--   --   revoke all on function workforce.on_employee_deactivated() from public, anon, authenticated;
--   -- re-apply api.workforce_staff_manage from 0138 requires DROP VIEW + CREATE
--   -- (a column cannot be removed by CREATE OR REPLACE), then its grants:
--   --   drop view api.workforce_staff_manage; <0138 create view + comment>;
--   --   grant select, insert, update on api.workforce_staff_manage to authenticated;
--   drop function if exists core.employee_user_is_admin(uuid, uuid);
--   drop function if exists api.set_employee_admin_role(uuid, uuid, boolean);
--   drop function if exists core.set_employee_admin_role(uuid, uuid, boolean);
--   drop function if exists api.is_tenant_owner(uuid);
--   drop function if exists core.caller_is_tenant_owner(uuid);
-- ============================================================================
