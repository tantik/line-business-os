-- ============================================================================
-- 0157 — Platform-staff read of tenant locations (DEBT-139 L3c, admin console)
-- ----------------------------------------------------------------------------
-- Design: docs/architecture/multi-location-design-2026-11-02.md (console store
-- management); same read pattern as 0135 (core.platform_tenant_provisioning_list).
--
-- The ORUWA admin console (/admin/tenants) shows every tenant's stores
-- (locations) so platform staff can add / rename / archive / restore them
-- through the platform-location Edge Function (writes: 0151
-- api.platform_create_location / platform_rename_location /
-- platform_set_location_active, service_role only). Platform staff are not
-- members of those tenants and, since 0146, have no RLS bypass, so the read
-- needs one narrow function through the signed-in staff user's own JWT:
--
-- 1. core.platform_tenant_locations(p_tenant_id uuid default null):
--    SECURITY DEFINER (it must read locations / employees of tenants the
--    caller is not a member of) with a pinned search_path; its FIRST statement
--    checks the CALLER with core.is_platform_staff() (core.current_user_id()
--    from the JWT, never an argument) -> 42501 not_platform_staff for everyone
--    else. Read-only. One row per location of that tenant, or of every tenant
--    when p_tenant_id is null; inactive (archived) locations included.
--    Columns: tenant_id, location_id, location_name, timezone, is_active,
--    created_at, active_staff_count (active workforce.employees whose home
--    location it is). NO PII: no address, no metadata, no person name, no
--    user id. Order: tenant_id, is_active desc, created_at, location_name, id.
-- 2. api.platform_tenant_locations: SECURITY INVOKER wrapper (ADR 0008).
--
-- Grants: authenticated (the staff check is inside); anon / public revoked.
--
-- Cost: one call per console page view (staff only, no Realtime, no timers).
-- Rows = tenants x stores (max_locations 3 by default, 0151); the staff count
-- is one grouped scan of active employees joined on (tenant_id, location_id).
--
-- Rollback: explicit statements at the end of this file.
-- ============================================================================

create or replace function core.platform_tenant_locations(p_tenant_id uuid default null)
returns table (
  tenant_id           uuid,
  location_id         uuid,
  location_name       text,
  timezone            text,
  is_active           boolean,
  created_at          timestamptz,
  active_staff_count  integer
)
language plpgsql stable security definer set search_path = core, workforce, public, pg_temp as $$
begin
  -- The caller's own flag (JWT sub), before any read.
  if not core.is_platform_staff() then
    raise exception 'not_platform_staff' using errcode = '42501';
  end if;

  return query
  select
    l.tenant_id,
    l.id,
    l.name,
    l.timezone,
    l.is_active,
    l.created_at,
    coalesce(s.n, 0)::integer
  from core.locations l
  left join (
    select e.tenant_id, e.location_id, count(*) as n
      from workforce.employees e
     where e.is_active
       and e.location_id is not null
       and (p_tenant_id is null or e.tenant_id = p_tenant_id)
     group by e.tenant_id, e.location_id
  ) s on s.tenant_id = l.tenant_id and s.location_id = l.id
  where p_tenant_id is null or l.tenant_id = p_tenant_id
  order by l.tenant_id, l.is_active desc, l.created_at, l.name, l.id;
end;
$$;
comment on function core.platform_tenant_locations(uuid) is
  'DEBT-139 L3c (0157): platform-staff-only read for the admin console -- every location of one tenant (p_tenant_id) or of all tenants (NULL), archived ones included, with the count of active employees whose home location it is. Caller checked with core.is_platform_staff() (JWT) first, 42501 otherwise. No PII: ids, store name, timezone, is_active, created_at, count. Read-only.';

revoke all on function core.platform_tenant_locations(uuid) from public, anon;
grant execute on function core.platform_tenant_locations(uuid) to authenticated;

-- --- api facade (ADR 0008: invoker only) ----------------------------------------------
create or replace function api.platform_tenant_locations(p_tenant_id uuid default null)
returns table (
  tenant_id           uuid,
  location_id         uuid,
  location_name       text,
  timezone            text,
  is_active           boolean,
  created_at          timestamptz,
  active_staff_count  integer
)
language sql stable security invoker set search_path = core, public as $$
  select * from core.platform_tenant_locations(p_tenant_id);
$$;
comment on function api.platform_tenant_locations(uuid) is
  'Admin console read (0157), SECURITY INVOKER wrapper of core.platform_tenant_locations: platform staff only (checked inside, from the JWT), no PII.';

revoke all on function api.platform_tenant_locations(uuid) from public, anon;
grant execute on function api.platform_tenant_locations(uuid) to authenticated;

-- ============================================================================
-- Rollback:
--   drop function if exists api.platform_tenant_locations(uuid);
--   drop function if exists core.platform_tenant_locations(uuid);
-- ============================================================================
