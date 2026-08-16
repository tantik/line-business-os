-- ============================================================================
-- DB test: Shared Navigation + Shared Settings
--          (migration 0071_core_shared_navigation_and_settings.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * core.module_registry gained nav_route/icon_key/nav_sort_order; only
--     workforce/inventory have a non-null nav_route today (matching the
--     migration's own claim that booking/ai/core/logistics/crm have no
--     dashboard entry point yet).
--   * RLS is enabled on core.tenant_settings.
--   * A member can read their own tenant's settings; not another tenant's.
--   * core.settings.manage is required to write (a tenant_owner CAN write;
--     an employee without it CANNOT) -- unlike 0069's entitlement tables,
--     this is ordinary tenant-admin territory, not platform-staff-only.
--   * Upsert semantics: unique(tenant_id, module, setting_key) lets a second
--     write to the same key update in place rather than duplicate.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core;
select no_plan();

create function pg_temp.as_auth_exec(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(p_sub, ''))::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return true;
exception when others then
  raise notice 'as_auth_exec failed: %', sqlerrm;
  reset role;
  return false;
end;
$$;

create function pg_temp.as_auth_bool(p_sub text, p_sql text)
returns boolean language plpgsql as $$
declare b boolean;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(p_sub, ''))::text, true);
  set local role authenticated;
  execute p_sql into b;
  reset role;
  return b;
end;
$$;

-- --- Shared Navigation: nav metadata sanity ----------------------------------
select is(
  (select nav_route from core.module_registry where module = 'workforce'),
  '/dashboard/workforce', 'workforce has its real dashboard route registered'
);
select is(
  (select nav_route from core.module_registry where module = 'inventory'),
  '/dashboard/inventory', 'inventory has its real dashboard route registered'
);
select is(
  (select count(*)::int from core.module_registry where nav_route is not null),
  2, 'exactly 2 modules have a nav_route today (booking/ai/core/logistics/crm have none yet)'
);

-- --- RLS enabled --------------------------------------------------------------
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and c.relname = 'tenant_settings'),
  'RLS is enabled on core.tenant_settings'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('eb600000-0000-0000-0000-000000000001', 'pgtap-settings-tenant-a', 'pgTAP Settings A'),
  ('eb600000-0000-0000-0000-000000000002', 'pgtap-settings-tenant-b', 'pgTAP Settings B');
insert into core.users (id, display_name, is_platform_staff) values
  ('eb620000-0000-0000-0000-000000000001', 'Tenant A Owner', false),
  ('eb620000-0000-0000-0000-000000000002', 'Tenant A Employee', false);
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('eb600000-0000-0000-0000-000000000001', 'eb620000-0000-0000-0000-000000000001', 'active'),
  ('eb600000-0000-0000-0000-000000000001', 'eb620000-0000-0000-0000-000000000002', 'active');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('eb600000-0000-0000-0000-000000000001', 'eb620000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003', null), -- tenant_owner: holds core.settings.manage
  ('eb600000-0000-0000-0000-000000000001', 'eb620000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000006', null); -- employee: does not

insert into core.tenant_settings (tenant_id, module, setting_key, setting_value) values
  ('eb600000-0000-0000-0000-000000000001', 'workforce', 'welcome_message', '"Hello A"'::jsonb),
  ('eb600000-0000-0000-0000-000000000002', 'workforce', 'welcome_message', '"Hello B"'::jsonb);

-- --- select --------------------------------------------------------------------
select ok(
  pg_temp.as_auth_bool('eb620000-0000-0000-0000-000000000001',
    $q$ select exists (select 1 from core.tenant_settings where tenant_id = 'eb600000-0000-0000-0000-000000000001') $q$),
  'a tenant A member can select their own tenant_settings row'
);
select ok(
  not pg_temp.as_auth_bool('eb620000-0000-0000-0000-000000000001',
    $q$ select exists (select 1 from core.tenant_settings where tenant_id = 'eb600000-0000-0000-0000-000000000002') $q$),
  'a tenant A member cannot select tenant B''s tenant_settings row'
);

-- --- write: core.settings.manage required --------------------------------------
-- RLS filters an UPDATE's target rows via its USING clause; a row the
-- policy hides simply isn't matched (0 rows affected, no error) -- so the
-- meaningful assertion is that the value is unchanged afterward, not that
-- the statement itself throws.
select pg_temp.as_auth_exec('eb620000-0000-0000-0000-000000000002',
  $q$ update core.tenant_settings set setting_value = '"tampered"'::jsonb
      where tenant_id = 'eb600000-0000-0000-0000-000000000001' and setting_key = 'welcome_message' $q$);
select is(
  (select setting_value from core.tenant_settings
    where tenant_id = 'eb600000-0000-0000-0000-000000000001' and setting_key = 'welcome_message'),
  '"Hello A"'::jsonb,
  'an Employee (no core.settings.manage) cannot actually change the value (RLS hides the row from UPDATE, 0 rows affected)'
);
select ok(
  pg_temp.as_auth_exec('eb620000-0000-0000-0000-000000000001',
    $q$ update core.tenant_settings set setting_value = '"Hello A, updated"'::jsonb
        where tenant_id = 'eb600000-0000-0000-0000-000000000001' and setting_key = 'welcome_message' $q$),
  'a tenant_owner (holds core.settings.manage) CAN update a tenant_settings row'
);
select is(
  (select setting_value from core.tenant_settings
    where tenant_id = 'eb600000-0000-0000-0000-000000000001' and setting_key = 'welcome_message'),
  '"Hello A, updated"'::jsonb,
  'the update actually persisted'
);

-- --- unique constraint / upsert shape -------------------------------------------
select throws_like(
  $$ insert into core.tenant_settings (tenant_id, module, setting_key, setting_value)
     values ('eb600000-0000-0000-0000-000000000001', 'workforce', 'welcome_message', '"dup"'::jsonb) $$,
  'duplicate key value violates unique constraint%',
  'a second row for the same (tenant, module, key) violates the unique constraint (upsert must target it)'
);

select * from finish();
rollback;
