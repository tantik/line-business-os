-- ============================================================================
-- 0154: api.my_page_context also returns api.my_locations (DEBT-139 L2).
--
-- WHY: L2 resolves ONE active location per request for every page and server
-- action (`resolveActiveLocation`, web). It needs, per tenant, the locations
-- the caller relates to and how (0151 api.my_locations: access all / manage /
-- staff). Reading that view separately would add one PostgREST request to
-- every protected page view (budget: DEBT-124/135); the page context already
-- loads once per request, so it carries the rows instead.
--
-- WHAT: the 0143 body unchanged plus one key:
--   myLocations  <- api.my_locations (tenant_id, location_id, location_name,
--                   timezone, is_active, access)
-- `locations` (api.my_tenant_locations, every location of the caller's
-- tenants) stays as is: existing callers use it for timezone lookups of the
-- employee's own store.
--
-- SECURITY MODEL: unchanged -- SECURITY INVOKER (ADR 0008), reads the same
-- invoker view as the caller, so its self-scoping applies; api.my_locations
-- is a UI source only, RLS on the data tables stays the boundary. Same
-- signature and return type, so create or replace keeps owner and grants;
-- grants re-stated below for clarity. `anon` gets nothing.
--
-- Rollback: re-run the 0143 body (drops the key; revert the app first).
-- ============================================================================

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
        'timezone', ml.timezone, 'is_active', ml.is_active, 'access', ml.access))
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
  '0143 (DEBT-135) + 0154 (DEBT-139 L2): one RPC for the per-request page context -- rows of api.my_tenant_memberships, my_tenant_navigation, my_tenant_locations, my_locations (myLocations, with access), my_tenant_packages (active) and api.my_pending_employee_invitations() / my_pending_tenant_invitations(), read as the caller (invoker, ADR 0008), so RLS and self-scoping are unchanged.';

revoke all on function api.my_page_context() from public, anon;
grant execute on function api.my_page_context() to authenticated;
