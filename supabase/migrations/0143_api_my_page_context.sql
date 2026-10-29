-- ============================================================================
-- 0143: api.my_page_context -- the per-request "who am I / where am I" reads
-- of every protected page, in one RPC (DEBT-135).
--
-- WHY: before any page data, every protected page view made six separate
-- PostgREST requests: my_tenant_memberships (tenant context),
-- my_tenant_navigation + my_tenant_locations + my_tenant_packages (page
-- shell), and my_pending_employee_invitations + my_pending_tenant_invitations
-- (the two invitation banners in the (protected) layout).
--
-- WHAT: one invoker-only function that returns the rows of exactly those
-- sources as jsonb arrays. It reads the SAME api views / calls the SAME api
-- functions as the single requests, as the same caller, so RLS and the
-- self-scoping inside them apply unchanged -- nothing is widened:
--   memberships          <- api.my_tenant_memberships
--   navigation           <- api.my_tenant_navigation
--   locations            <- api.my_tenant_locations
--   packages             <- api.my_tenant_packages (status = 'active')
--   employeeInvitations  <- api.my_pending_employee_invitations()
--   tenantInvitations    <- api.my_pending_tenant_invitations()
-- Ordering and per-page filtering stay in the app (same mappers/comparators
-- as before).
--
-- SECURITY MODEL: NOT SECURITY DEFINER (ADR 0008). `anon` gets no grant.
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
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tenant_id', p.tenant_id, 'package_code', p.package_code, 'status', p.status, 'sort_order', p.sort_order))
        from api.my_tenant_packages p
       where p.status = 'active'), '[]'::jsonb),
    'employeeInvitations', coalesce((
      select jsonb_agg(to_jsonb(e)) from api.my_pending_employee_invitations() e), '[]'::jsonb),
    'tenantInvitations', coalesce((
      select jsonb_agg(to_jsonb(t)) from api.my_pending_tenant_invitations() t), '[]'::jsonb)
  );
$$;

comment on function api.my_page_context() is
  '0143 (DEBT-135): one RPC for the per-request page context -- rows of api.my_tenant_memberships, my_tenant_navigation, my_tenant_locations, my_tenant_packages (active) and api.my_pending_employee_invitations() / my_pending_tenant_invitations(), read as the caller (invoker, ADR 0008), so RLS and self-scoping are unchanged.';

revoke all on function api.my_page_context() from public, anon;
grant execute on function api.my_page_context() to authenticated;

-- ROLLBACK (manual, if ever needed; revert the app first -- it depends on this function):
--   drop function api.my_page_context();
