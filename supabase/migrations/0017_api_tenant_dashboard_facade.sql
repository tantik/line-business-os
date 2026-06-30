-- ============================================================================
-- 0017  Tenant dashboard read facade: locations + modules
-- ----------------------------------------------------------------------------
-- Adds the next narrow app-facing read surface for the protected tenant
-- dashboard data layer. The web app reads `api.*` only; internal schemas remain
-- outside the Data API exposure list.
--
-- SECURITY MODEL:
--   * Both views are `security_invoker = true`, so the caller's privileges and
--     the existing core RLS policies are enforced. The views do not bypass RLS.
--   * The views are self-scoped with an explicit ACTIVE membership EXISTS using
--     core.current_user_id(); no caller-supplied tenant id is trusted.
--   * No SECURITY DEFINER objects, RPC functions, or write paths are added.
--   * No PII or sensitive configuration is exposed: locations omit
--     address_encrypted/metadata/timestamps; modules omit config/id/timestamps.
--   * `anon` receives no grants. `authenticated` receives SELECT only.
--
-- DEPENDENCY NOTE:
-- Security-invoker views require the calling role to have privileges on the
-- underlying base tables so RLS can engage. These grants are read-only, limited
-- to the two RLS-protected core tables used by this facade, and core remains
-- internal because it is not exposed through the Supabase Data API schemas.
-- ============================================================================

create or replace view api.my_tenant_locations
  with (security_invoker = true) as
select
  l.tenant_id,
  l.id as location_id,
  l.name as location_name,
  l.timezone,
  l.is_active
from core.locations l
where exists (
  select 1
  from core.tenant_memberships tm
  where tm.tenant_id = l.tenant_id
    and tm.user_id = core.current_user_id()
    and tm.status = 'active'
);

comment on view api.my_tenant_locations is
  'Current user tenant locations for active memberships only. security_invoker view; core RLS is enforced as caller. No address, metadata, timestamps, user ids, or emails.';

create or replace view api.my_tenant_modules
  with (security_invoker = true) as
select
  tm.tenant_id,
  tm.module,
  tm.is_enabled
from core.tenant_modules tm
where exists (
  select 1
  from core.tenant_memberships membership
  where membership.tenant_id = tm.tenant_id
    and membership.user_id = core.current_user_id()
    and membership.status = 'active'
);

comment on view api.my_tenant_modules is
  'Current user tenant modules for active memberships only. security_invoker view; core RLS is enforced as caller. No config, module row ids, timestamps, user ids, or emails.';

grant select on core.locations to authenticated;
grant select on core.tenant_modules to authenticated;

grant select on api.my_tenant_locations to authenticated;
grant select on api.my_tenant_modules to authenticated;

revoke all on api.my_tenant_locations from anon;
revoke all on api.my_tenant_modules from anon;
revoke all on api.my_tenant_locations from public;
revoke all on api.my_tenant_modules from public;
