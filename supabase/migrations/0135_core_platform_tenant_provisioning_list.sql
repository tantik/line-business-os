-- ============================================================================
-- 0135 — Platform-staff read of provisioning requests + tenants (Stage 4B-3)
-- ----------------------------------------------------------------------------
-- Plan: docs/architecture/tenant-provisioning-plan-2026-10-18.md §4, §7 (4B-3).
--
-- The ORUWA admin console (/admin/tenants) lists provisioning requests and
-- tenants for platform staff. core.tenant_provisioning (0133) is closed to
-- every app role (RLS on, no policy), and apps/web holds no privileged key, so
-- the console needs one narrow read through the signed-in staff user's own
-- JWT:
--
-- 1. core.platform_tenant_provisioning_list(p_request_id uuid default null):
--    SECURITY DEFINER (it must read the closed status table and tenants the
--    caller is not a member of), with an explicit core.is_platform_staff()
--    check of the CALLER (core.current_user_id() from the JWT, never an
--    argument) before any row is read -> 42501 for everyone else. Read-only.
--    One row per provisioning request (with its tenant when it exists) plus
--    one row per tenant that was never provisioned through 4B (seed / demo /
--    legacy onboarding), newest first, capped at 1000 rows.
--    Columns are business data and machine codes only -- NO PII: no email,
--    no person name, no user id (created_by / target_user_id / invited_by
--    are not returned). The owner invitation contributes only its status
--    (pending / accepted / revoked, or 'expired' derived like 0064/0134) and
--    expiry.
-- 2. api.platform_tenant_provisioning_list: SECURITY INVOKER wrapper (ADR 0008).
--
-- Grants: authenticated (the staff check is inside); anon / public revoked.
--
-- Not in this migration (DEBT-109 a, stays open): an operator path to release
-- a failed_db slug. A failed_db row has no tenant, and audit.audit_logs
-- requires a tenant_id, so a release (delete / rename of the reservation)
-- would be an unaudited staff mutation -- needs a tenant-less audit sink or a
-- different design first.
--
-- Rollback: explicit statements at the end of this file.
-- ============================================================================

create or replace function core.platform_tenant_provisioning_list(p_request_id uuid default null)
returns table (
  request_id                   uuid,
  tenant_id                    uuid,
  slug                         text,
  business_name                text,
  tenant_kind                  text,
  tenant_status                text,
  location_name                text,
  location_timezone            text,
  status                       text,
  step                         text,
  error_code                   text,
  template_code                text,
  template_version             integer,
  owner_invitation_status      text,
  owner_invitation_expires_at  timestamptz,
  created_at                   timestamptz,
  updated_at                   timestamptz
)
language plpgsql stable security definer set search_path = core, public, pg_temp as $$
begin
  -- The caller's own flag (JWT sub), before any read.
  if not core.is_platform_staff() then
    raise exception 'not_platform_staff' using errcode = '42501';
  end if;

  return query
  select
    p.request_id,
    coalesce(p.tenant_id, t.id),
    coalesce(p.slug, t.slug::text),
    t.name,
    t.kind::text,
    t.status::text,
    l.name,
    l.timezone,
    p.status,
    p.step,
    p.error_code,
    p.template_code,
    p.template_version,
    i.inv_status,
    i.expires_at,
    coalesce(p.created_at, t.created_at),
    coalesce(p.updated_at, t.updated_at)
  from core.tenant_provisioning p
  full join core.tenants t on t.id = p.tenant_id
  left join lateral (
    select loc.name, loc.timezone
      from core.locations loc
     where loc.tenant_id = t.id
     order by loc.created_at, loc.id
     limit 1
  ) l on true
  left join lateral (
    select case when inv.status = 'pending' and inv.expires_at <= now() then 'expired' else inv.status end as inv_status,
           inv.expires_at
      from core.tenant_invitations inv
     where inv.tenant_id = t.id and inv.role_key = 'tenant_owner'
     order by inv.created_at desc, inv.id
     limit 1
  ) i on true
  where p_request_id is null or p.request_id = p_request_id
  order by coalesce(p.created_at, t.created_at) desc, coalesce(p.slug, t.slug::text)
  limit 1000;
end;
$$;
comment on function core.platform_tenant_provisioning_list(uuid) is
  'Stage 4B-3 (0135): platform-staff-only read for the admin console -- provisioning requests (0133) with their tenant, plus tenants never provisioned through 4B. Caller checked with core.is_platform_staff() (JWT) first, 42501 otherwise. No PII: slug, business / location name, statuses, machine error codes, template version, owner-invitation status + expiry, timestamps. Optional p_request_id filter for the detail view. Read-only, max 1000 rows.';

revoke all on function core.platform_tenant_provisioning_list(uuid) from public, anon;
grant execute on function core.platform_tenant_provisioning_list(uuid) to authenticated;

-- --- api facade (ADR 0008: invoker only) ----------------------------------------------
create or replace function api.platform_tenant_provisioning_list(p_request_id uuid default null)
returns table (
  request_id                   uuid,
  tenant_id                    uuid,
  slug                         text,
  business_name                text,
  tenant_kind                  text,
  tenant_status                text,
  location_name                text,
  location_timezone            text,
  status                       text,
  step                         text,
  error_code                   text,
  template_code                text,
  template_version             integer,
  owner_invitation_status      text,
  owner_invitation_expires_at  timestamptz,
  created_at                   timestamptz,
  updated_at                   timestamptz
)
language sql stable security invoker set search_path = core, public as $$
  select * from core.platform_tenant_provisioning_list(p_request_id);
$$;
comment on function api.platform_tenant_provisioning_list(uuid) is
  'Admin console read (0135), SECURITY INVOKER wrapper of core.platform_tenant_provisioning_list: platform staff only (checked inside, from the JWT), no PII.';

revoke all on function api.platform_tenant_provisioning_list(uuid) from public, anon;
grant execute on function api.platform_tenant_provisioning_list(uuid) to authenticated;

-- ============================================================================
-- Rollback:
--   drop function if exists api.platform_tenant_provisioning_list(uuid);
--   drop function if exists core.platform_tenant_provisioning_list(uuid);
-- ============================================================================
