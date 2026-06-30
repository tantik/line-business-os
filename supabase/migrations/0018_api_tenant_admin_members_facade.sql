-- ============================================================================
-- 0018  Tenant admin members read facade
-- ----------------------------------------------------------------------------
-- Adds a conservative, read-only app-facing facade for tenant member-management
-- foundation. The web app reads `api.*` only; internal schemas remain outside
-- the Data API exposure list.
--
-- SECURITY MODEL:
--   * The view is `security_invoker = true`, so caller privileges and existing
--     core RLS are enforced. It does not bypass RLS.
--   * The view is manager/admin scoped in SQL: the caller must have an ACTIVE
--     membership in the same tenant and hold `core.member.invite`.
--   * No SECURITY DEFINER objects, RPC functions, or write paths are added.
--   * No member PII or identity fields are exposed: no core.users join, no
--     user_id/auth id/email/phone/display_name, no role joins, no role fields.
--   * `anon` and `public` receive no grants. `authenticated` receives SELECT
--     only.
-- ============================================================================

create or replace view api.my_tenant_admin_members
  with (security_invoker = true) as
select
  tm.tenant_id as tenant_id,
  t.slug as tenant_slug,
  t.name as tenant_name,
  t.kind as tenant_kind,
  tm.location_id as location_id,
  tm.status as membership_status
from core.tenant_memberships tm
join core.tenants t on t.id = tm.tenant_id
where exists (
  select 1
  from core.tenant_memberships caller_membership
  where caller_membership.tenant_id = tm.tenant_id
    and caller_membership.user_id = core.current_user_id()
    and caller_membership.status = 'active'
)
and core.has_permission(tm.tenant_id, 'core.member.invite');

comment on view api.my_tenant_admin_members is
  'Manager/admin read-only tenant membership facade. security_invoker view; requires active caller membership and core.member.invite. Exposes no PII, user ids, auth ids, roles, metadata, config, or timestamps.';

grant select on api.my_tenant_admin_members to authenticated;

revoke all on api.my_tenant_admin_members from anon;
revoke all on api.my_tenant_admin_members from public;
