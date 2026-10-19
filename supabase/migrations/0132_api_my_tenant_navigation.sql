-- ============================================================================
-- 0132 — navigation order from packages (packages model, task P4)
-- ----------------------------------------------------------------------------
-- The Manager / Staff home builds its module buttons from the tenant's enabled
-- modules in package order (docs/architecture/platform-packages-model.md §4,
-- P4), instead of a hand-written Cafe list.
--
-- 1. api.my_tenant_navigation: one row per ENABLED module of the caller's
--    active-membership tenants, with nav_order:
--      package module   -> packages.sort_order * 1000 + package_modules.sort_order
--                          (lowest over the tenant's active packages)
--      add-on (override) -> 1000000 + module_registry.nav_sort_order
--    Same membership filter as api.my_tenant_modules (0017). security_invoker,
--    so core RLS applies as the caller. Read only, no ids beyond tenant_id.
-- 2. Cafe package order = today's Cafe home order, so the existing tenant sees
--    no change: recipes, inventory, staff (workforce), purchasing, HACCP
--    checks (operations), issues & handover.
--
-- Navigation only: core.tenant_modules + core.has_module_access stay the
-- security boundary (RLS / RPCs), unchanged here.
--
-- Rollback: drop view api.my_tenant_navigation; restore the cafe sort_order
-- values (core 0, workforce 10, inventory 20, purchases 25, operations 30,
-- recipes 35, issues 40).
-- ============================================================================

update core.package_modules set sort_order = v.sort_order
  from (values ('core', 0), ('recipes', 10), ('inventory', 20), ('workforce', 25),
               ('purchases', 30), ('operations', 40), ('issues', 50)) as v(module, sort_order)
 where package_modules.package_code = 'cafe'
   and package_modules.module = v.module::core.module_code;

create view api.my_tenant_navigation with (security_invoker = true) as
select tm.tenant_id,
       tm.module,
       coalesce(
         (select min(p.sort_order * 1000 + pm.sort_order)
            from core.tenant_packages tp
            join core.packages p on p.code = tp.package_code
            join core.package_modules pm on pm.package_code = tp.package_code and pm.module = tm.module
           where tp.tenant_id = tm.tenant_id and tp.status = 'active'),
         1000000 + coalesce(mr.nav_sort_order, 999)
       ) as nav_order
  from core.tenant_modules tm
  left join core.module_registry mr on mr.module = tm.module
 where tm.is_enabled
   and exists (
     select 1
       from core.tenant_memberships membership
      where membership.tenant_id = tm.tenant_id
        and membership.user_id = core.current_user_id()
        and membership.status = 'active'
   );

comment on view api.my_tenant_navigation is
  'Enabled modules of the caller''s active-membership tenants with their navigation order (package order, then add-ons by registry order). Navigation only; core.has_module_access stays the gate. security_invoker (0132, task P4).';

grant select on api.my_tenant_navigation to authenticated;
revoke all on api.my_tenant_navigation from anon, public;
