-- ============================================================================
-- 0138 — Manager appointment (DEBT-091 a) + deactivation closes access (DEBT-094)
-- ----------------------------------------------------------------------------
-- Plan: docs/architecture/tenant-provisioning-plan-2026-10-18.md §5 (4B-4a).
--
-- 1. core.set_employee_manager_role(tenant, employee, is_manager) + invoker
--    api wrapper (ADR 0008). The Owner / Admin (core.role.manage, tenant-wide;
--    the Manager role does not hold it, 0008) appoints or revokes a Manager
--    from the staff list. Promote adds ONE tenant-wide `manager` role
--    assignment (location NULL) next to the employee's existing `employee`
--    role; demote deletes every `manager` assignment of that user in that
--    tenant. tenant_owner / tenant_admin / employee assignments are never
--    touched. Idempotent (promote twice / demote a non-manager = no change, no
--    audit row). Refuses: not signed in (28000), no core.role.manage (42501),
--    Workforce module OFF (P0001 workforce_module_disabled), employee not in
--    this tenant (P0002 employee_not_found), inactive (P0001
--    employee_inactive), no bound account (P0001 employee_has_no_account),
--    the caller's own employee row (P0001 cannot_change_own_role). One
--    audit.audit_logs row per real change (module core, entity
--    role_assignment, action appoint_manager / revoke_manager, before/after
--    {is_manager} only — ids, no PII).
-- 2. Read: api.workforce_staff_manage gets one appended column `is_manager`
--    (CREATE OR REPLACE VIEW may only append; column order unchanged). It is
--    computed by core.employee_user_is_manager(tenant, user_id), a narrow
--    SECURITY DEFINER boolean (authenticated has no SELECT on
--    core.role_assignments and this migration does not add one) that answers
--    only for a caller holding workforce.staff.manage in that tenant, else
--    false. The view already returns rows only to staff.manage holders (0122),
--    so nobody learns more than before except "who is a Manager".
-- 3. DEBT-094: an AFTER UPDATE OF is_active trigger on workforce.employees
--    (true -> false): revokes the employee's pending
--    workforce.employee_invitations and deletes their `manager` role
--    assignments (a deactivated person must not keep Manager rights; the
--    `employee` role stays as before — every Staff write already requires an
--    active employee, 0062). Audit rows: one per revoked invitation set, one
--    per manager revoke. Reactivation does NOT restore the Manager role (the
--    Owner re-appoints). workforce.accept_employee_invitation (live body:
--    0064, never redefined since) additionally refuses an inactive employee
--    with the same generic invitation_not_acceptable (no new error surface
--    for the callback).
--
-- Security: every SECURITY DEFINER function lives in core / workforce with a
-- pinned search_path; identity is core.current_user_id() (never an argument);
-- revoke from public/anon; api.* stays SECURITY INVOKER (ADR 0008).
-- Note: a Manager (workforce.staff.manage) who deactivates a co-Manager's
-- employee row thereby removes that person's Manager role — deactivation means
-- the person has left; this is intended and audited (reason
-- employee_deactivated).
--
-- Cost: no new table, no polling, no Realtime. One RPC per appoint/revoke
-- (rare, Owner-only); the staff list read gains one indexed EXISTS per row
-- (role_assignments_user_idx) — tens of rows per tenant, negligible at 300+
-- tenants. Existing pending invitations of already-inactive employees are not
-- backfilled (the accept check refuses them).
--
-- Rollback: commented block at the end of this file.
-- ============================================================================

-- --- 1. appoint / revoke ------------------------------------------------------
create or replace function core.set_employee_manager_role(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_is_manager boolean
)
returns jsonb
language plpgsql security definer set search_path = core, workforce, audit, public, pg_temp as $$
declare
  v_uid uuid := core.current_user_id();
  v_emp record;
  v_manager_role uuid := '00000000-0000-0000-0000-000000000005';
  v_was boolean;
  v_ids uuid[];
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_tenant_id is null or p_employee_id is null or p_is_manager is null then
    raise exception 'invalid_argument: tenant_id, employee_id and is_manager are required' using errcode = '22004';
  end if;
  if not core.has_permission(p_tenant_id, 'core.role.manage', null) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not core.has_module_access(p_tenant_id, 'workforce') then
    raise exception 'workforce_module_disabled' using errcode = 'P0001';
  end if;
  -- the system role must exist (fail closed instead of inserting a dangling id)
  if not exists (select 1 from core.roles where id = v_manager_role and tenant_id is null and key = 'manager') then
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
  perform pg_advisory_xact_lock(hashtextextended('core.role_assignments:manager:' || p_tenant_id::text || ':' || v_emp.user_id::text, 0));

  select coalesce(array_agg(id), '{}') into v_ids
    from core.role_assignments
   where tenant_id = p_tenant_id and user_id = v_emp.user_id and role_id = v_manager_role;
  v_was := cardinality(v_ids) > 0;

  if p_is_manager = v_was then
    return jsonb_build_object('employee_id', p_employee_id, 'is_manager', v_was, 'changed', false);
  end if;

  if p_is_manager then
    insert into core.role_assignments (tenant_id, user_id, role_id, location_id)
    values (p_tenant_id, v_emp.user_id, v_manager_role, null)
    returning id into v_new_id;

    insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
    values (p_tenant_id, v_uid, 'user', 'core', 'role_assignment', v_new_id::text, 'appoint_manager',
            jsonb_build_object('is_manager', false), jsonb_build_object('is_manager', true),
            jsonb_build_object('employee_id', p_employee_id, 'user_id', v_emp.user_id, 'role_key', 'manager', 'location_id', null));
  else
    delete from core.role_assignments where id = any(v_ids);

    insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
    values (p_tenant_id, v_uid, 'user', 'core', 'role_assignment', v_ids[1]::text, 'revoke_manager',
            jsonb_build_object('is_manager', true), jsonb_build_object('is_manager', false),
            jsonb_build_object('employee_id', p_employee_id, 'user_id', v_emp.user_id, 'role_key', 'manager',
                               'role_assignment_ids', to_jsonb(v_ids), 'reason', 'owner_revoked'));
  end if;

  return jsonb_build_object('employee_id', p_employee_id, 'is_manager', p_is_manager, 'changed', true);
end;
$$;
comment on function core.set_employee_manager_role(uuid, uuid, boolean) is
  '4B-4a (0138, DEBT-091 a): Owner/Admin (core.role.manage, tenant-wide) appoints (tenant-wide manager role_assignment, employee role kept) or revokes (every manager assignment of that user in that tenant) a Manager for an active employee with a bound account. Never touches owner/admin/employee assignments; never the caller''s own row. Idempotent; one audit row per real change. Identity = core.current_user_id().';

revoke all on function core.set_employee_manager_role(uuid, uuid, boolean) from public, anon;
grant execute on function core.set_employee_manager_role(uuid, uuid, boolean) to authenticated;

create or replace function api.set_employee_manager_role(p_tenant_id uuid, p_employee_id uuid, p_is_manager boolean)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.set_employee_manager_role(p_tenant_id, p_employee_id, p_is_manager);
$$;
comment on function api.set_employee_manager_role(uuid, uuid, boolean) is
  'Invoker-only passthrough to core.set_employee_manager_role (0138, ADR 0008).';
revoke all on function api.set_employee_manager_role(uuid, uuid, boolean) from public, anon;
grant execute on function api.set_employee_manager_role(uuid, uuid, boolean) to authenticated;

-- --- 2. read: is_manager on the Manager staff list ------------------------------
create or replace function core.employee_user_is_manager(p_tenant_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = core, public, pg_temp as $$
  select p_user_id is not null
     and core.has_permission_in_tenant(p_tenant_id, 'workforce.staff.manage')
     and exists (
       select 1 from core.role_assignments ra
        where ra.tenant_id = p_tenant_id
          and ra.user_id = p_user_id
          and ra.role_id = '00000000-0000-0000-0000-000000000005');
$$;
comment on function core.employee_user_is_manager(uuid, uuid) is
  '0138: true when p_user_id holds the system manager role (any location) in p_tenant_id. Answers only for a caller holding workforce.staff.manage in that tenant (else false), so it reveals nothing to anyone else. Used by api.workforce_staff_manage.is_manager.';
revoke all on function core.employee_user_is_manager(uuid, uuid) from public, anon;
grant execute on function core.employee_user_is_manager(uuid, uuid) to authenticated;

-- Same columns, same order as 0122; only `is_manager` is appended.
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
  core.employee_user_is_manager(e.tenant_id, e.user_id) as is_manager
from workforce.employees e
where core.has_permission(e.tenant_id, 'workforce.staff.manage', e.location_id);

comment on view api.workforce_staff_manage is
  'Manager-only staff read/write facade. Includes advisory hourly wage, contact PII (encrypted), has_account_access (derived boolean, never the raw user_id itself) and, since 0138, is_manager (derived boolean, read-only). security_invoker/RLS, and since 0122 the view itself only returns rows where the caller holds workforce.staff.manage at the row''s location.';

grant select, insert, update on api.workforce_staff_manage to authenticated;
revoke all on api.workforce_staff_manage from anon, public;

-- --- 3a. DEBT-094: deactivation closes invitations and the Manager role ----------
create or replace function workforce.on_employee_deactivated()
returns trigger
language plpgsql security definer set search_path = core, workforce, audit, public, pg_temp as $$
declare
  v_actor uuid := core.current_user_id();
  v_inv_ids uuid[];
  v_ra_ids uuid[];
begin
  with revoked as (
    update workforce.employee_invitations
       set status = 'revoked', revoked_at = now()
     where tenant_id = new.tenant_id and employee_id = new.id and status = 'pending'
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_inv_ids from revoked;

  if cardinality(v_inv_ids) > 0 then
    insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
    values (new.tenant_id, v_actor, case when v_actor is null then 'system' else 'user' end, 'workforce',
            'employee_invitation', v_inv_ids[1]::text, 'revoke',
            jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'revoked'),
            jsonb_build_object('employee_id', new.id, 'invitation_ids', to_jsonb(v_inv_ids), 'reason', 'employee_deactivated'));
  end if;

  if new.user_id is not null then
    with gone as (
      delete from core.role_assignments
       where tenant_id = new.tenant_id and user_id = new.user_id
         and role_id = '00000000-0000-0000-0000-000000000005'
      returning id
    )
    select coalesce(array_agg(id), '{}') into v_ra_ids from gone;

    if cardinality(v_ra_ids) > 0 then
      insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
      values (new.tenant_id, v_actor, case when v_actor is null then 'system' else 'user' end, 'core',
              'role_assignment', v_ra_ids[1]::text, 'revoke_manager',
              jsonb_build_object('is_manager', true), jsonb_build_object('is_manager', false),
              jsonb_build_object('employee_id', new.id, 'user_id', new.user_id, 'role_key', 'manager',
                                 'role_assignment_ids', to_jsonb(v_ra_ids), 'reason', 'employee_deactivated'));
    end if;
  end if;

  return null;
end;
$$;
comment on function workforce.on_employee_deactivated() is
  '0138 (DEBT-094): AFTER UPDATE trigger body, fires only on is_active true -> false. Revokes the employee''s pending invitations and deletes their manager role assignments (employee role kept), with audit rows. SECURITY DEFINER because the deactivating Manager has no write access to core.role_assignments; it acts only on the row being deactivated (already authorised by wf_employees_staff_manage RLS).';
revoke all on function workforce.on_employee_deactivated() from public, anon, authenticated;

drop trigger if exists employees_on_deactivated on workforce.employees;
create trigger employees_on_deactivated
  after update of is_active on workforce.employees
  for each row
  when (old.is_active and not new.is_active)
  execute function workforce.on_employee_deactivated();

-- --- 3b. DEBT-094: accept refuses an inactive employee -----------------------------
-- Live body from 0064: statements verbatim (long comments shortened), plus the
-- "employee is active" check (step 0).
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

  -- 1. ensure core.users mirror row (id-only; no PII written here).
  insert into core.users (id) values (v_uid)
  on conflict (id) do nothing;

  -- 2. ensure tenant membership (create active, or activate an 'invited' row).
  insert into core.tenant_memberships (tenant_id, user_id, status, invited_by)
    values (v_inv.tenant_id, v_uid, 'active', v_inv.invited_by)
  on conflict (tenant_id, user_id) do nothing;

  update core.tenant_memberships
     set status = 'active'
   where tenant_id = v_inv.tenant_id
     and user_id = v_uid
     and status = 'invited';

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
-- Rollback (role assignments created by appointments stay; drop them by hand
-- if wanted: delete from core.role_assignments where role_id = manager and
-- the audit log shows appoint_manager):
--   drop trigger if exists employees_on_deactivated on workforce.employees;
--   drop function if exists workforce.on_employee_deactivated();
--   -- re-apply api.workforce_staff_manage from 0122 requires DROP VIEW + CREATE
--   -- (a column cannot be removed by CREATE OR REPLACE), then its grants:
--   --   drop view api.workforce_staff_manage; <0122 create view>;
--   --   grant select, insert, update on api.workforce_staff_manage to authenticated;
--   drop function if exists core.employee_user_is_manager(uuid, uuid);
--   drop function if exists api.set_employee_manager_role(uuid, uuid, boolean);
--   drop function if exists core.set_employee_manager_role(uuid, uuid, boolean);
--   -- previous workforce.accept_employee_invitation body: 0064 lines 148-253
--   -- verbatim, i.e. this file's body WITHOUT the "0. (0138, DEBT-094)" block.
-- ============================================================================
