-- ============================================================================
-- 0146: remove the platform-staff bypass from tenant access (DEBT-128, plan
-- docs/architecture/site-cabinet-console-plan.md §6.2 / §9 Phase B-0).
--
-- WHY: core.is_member_of, core.has_permission and core.has_permission_in_tenant
-- started with `core.is_platform_staff() or ...` (0006, 0014). Every tenant RLS
-- policy and permission check goes through them, so any session of a user with
-- core.users.is_platform_staff = true -- aal1, no MFA, from the normal app --
-- read and wrote every tenant's data, PII included. 12 core policies and the
-- core.users select policy gave the same staff session every tenant's plans,
-- packages, module overrides, entitlement limits, notifications and events and
-- every user row. The console model (§6.2) is the opposite: staff reach tenant
-- data only through explicit, narrow, audited platform RPCs, never through RLS.
-- 0093 already said so for module access ("a future, separately-designed,
-- explicit/audited capability, not an automatic bypass").
--
-- WHAT:
--   1. core.is_member_of / core.has_permission / core.has_permission_in_tenant:
--      the same bodies without the short-circuit. A platform-staff user is now
--      a member / has a permission only through their own memberships and role
--      assignments, like any user.
--   2. core.users `users_self_select`: own row only (was own row or staff).
--   3. Drop the 12 staff-only policies on core config tables. They granted
--      nothing to anyone else (each is `using/with check (core.is_platform_staff())`
--      alone); `authenticated` holds only SELECT on these tables, so in practice
--      they opened cross-tenant READS of tenant plans/packages/overrides/limits/
--      notifications/events to a staff session. Writes to these tables happen in
--      migrations, service_role (provision-tenant) and SECURITY DEFINER functions
--      owned by postgres (no FORCE RLS), none of which use these policies.
--
-- KEPT (explicit staff-only capabilities, not a bypass; each checks staff itself
-- and returns no tenant PII): core.is_platform_staff() / api.is_platform_staff()
-- (console gate), core.platform_tenant_provisioning_list (0135, the console list),
-- core.assert_platform_staff_actor / core.package_audit_actor (actor checks of
-- service_role provisioning RPCs), core.purge_tenant (0141, service_role only),
-- core.enforce_platform_staff_immutable (0012 trigger).
--
-- NOT IN THIS MIGRATION (DEBT-128 part b, with console Phase B): MFA (aal2) on
-- the staff RPCs and provision-tenant, core.platform_staff roles, and
-- audit.platform_audit_logs. They need the console's MFA enrolment first; until
-- then no platform-staff account may exist in production (DEBT-128 trigger).
--
-- ROLLBACK (manual): re-create the three functions with `core.is_platform_staff() or`
-- in front, the users_self_select policy with `or core.is_platform_staff()`, and
-- the 12 policies `for all using (core.is_platform_staff()) with check
-- (core.is_platform_staff())` (events: `for insert with check (...)`):
-- entitlement_plans_write, plan_default_limits_write, tenant_plans_write,
-- tenant_entitlement_limits_write (0106), module_registry_write,
-- module_dependencies_write (0107), notifications_write (0109), events_write
-- (0110), packages_write, package_modules_write, tenant_packages_write,
-- tenant_module_overrides_write (0129).
-- ============================================================================

create or replace function core.is_member_of(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists (
    select 1
    from core.tenant_memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = core.current_user_id()
      and m.status = 'active'
  );
$$;

create or replace function core.has_permission(p_tenant_id uuid, p_permission text, p_location_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists (
    select 1
    from core.role_assignments ra
    join core.role_permissions rp on rp.role_id = ra.role_id
    where ra.tenant_id = p_tenant_id
      and ra.user_id = core.current_user_id()
      and rp.permission_key = p_permission
      and (ra.location_id is null or ra.location_id = p_location_id)
  );
$$;

create or replace function core.has_permission_in_tenant(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists (
    select 1
    from core.role_assignments ra
    join core.role_permissions rp on rp.role_id = ra.role_id
    where ra.tenant_id = p_tenant_id
      and ra.user_id = core.current_user_id()
      and rp.permission_key = p_permission
  );
$$;

drop policy if exists users_self_select on core.users;
create policy users_self_select on core.users
  for select
  using (id = core.current_user_id());

drop policy if exists entitlement_plans_write on core.entitlement_plans;
drop policy if exists events_write on core.events;
drop policy if exists module_dependencies_write on core.module_dependencies;
drop policy if exists module_registry_write on core.module_registry;
drop policy if exists notifications_write on core.notifications;
drop policy if exists package_modules_write on core.package_modules;
drop policy if exists packages_write on core.packages;
drop policy if exists plan_default_limits_write on core.plan_default_limits;
drop policy if exists tenant_entitlement_limits_write on core.tenant_entitlement_limits;
drop policy if exists tenant_module_overrides_write on core.tenant_module_overrides;
drop policy if exists tenant_packages_write on core.tenant_packages;
drop policy if exists tenant_plans_write on core.tenant_plans;
