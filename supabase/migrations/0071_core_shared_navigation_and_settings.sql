-- ============================================================================
-- 0071  Shared Navigation + Shared Settings platform contract
-- ----------------------------------------------------------------------------
-- Platform Foundation critical path, step 3 of 5
-- (docs/foundation/platform-foundation-roadmap.md S7/S10): Entitlements
-- engine (0069) -> Module Registry (0070) -> Shared Navigation/Settings
-- (this migration) -> Notifications -> Event Bus.
--
-- CURRENT STATE (confirmed by research before writing this migration):
--   * Navigation is NOT a registry today: apps/web/src/app/(protected)/
--     dashboard/page.tsx hard-codes one bespoke React block per module
--     (WorkforcePreview, InventoryPreview, ...), each manually gated by
--     re-fetching core.tenant_modules per page. Adding a module means
--     editing this page, not registering data. Booking has no dashboard
--     entry point at all despite being shipped.
--   * There is no Settings route anywhere in apps/web.
--   * `core.tenants.settings` (jsonb, 0002) exists but has ZERO runtime
--     readers/writers in apps/web or apps/api -- it is seed-only, dead
--     weight, not an active "tenant settings" mechanism to build on.
--   * The one REAL settings table, `workforce.schedule_settings` (0034),
--     proves settings CAN be a proper per-tenant(+location) table with its
--     own RLS -- but that pattern isn't available to any other module
--     without hand-rolling the same migration again.
--
-- SCOPE OF THIS MIGRATION: the DATA CONTRACT only -- nav metadata on
-- core.module_registry (0070) + a generic core.tenant_settings table, plus
-- an app-level read/write wrapper. It deliberately does NOT refactor
-- apps/web's dashboard page to consume this registry, and does NOT add a
-- /dashboard/settings route. Reasoning: that is a live production-UI change
-- (must not regress the already Founder-accepted Cafe dashboard) that
-- needs its own focused session with live Preview QA -- the same
-- risk-scoping already applied to Entitlements/Module Registry (schema +
-- engine now, UI adoption as a separate, later, live-QA'd step). A module
-- with `nav_route` still null (booking, ai, core, logistics, crm) means "no
-- dashboard entry point exists yet," which is simply true today, not a bug
-- in this migration.
--
-- WHY A GENERIC key/value SETTINGS TABLE, NOT PER-FEATURE COLUMNS: mirrors
-- 0069's core.tenant_entitlement_limits pattern. workforce.schedule_settings
-- remains the right choice for a module whose settings are heavily
-- structured/queried (it is NOT being migrated into this table); this table
-- is the fallback path so a module doesn't have to write its own migration
-- for a simple settings need.
-- ============================================================================

-- --- Shared Navigation: nav metadata on the existing module registry -------
alter table core.module_registry
  add column if not exists nav_route text,
  add column if not exists icon_key text,
  add column if not exists nav_sort_order integer not null default 100;

comment on column core.module_registry.nav_route is
  'Dashboard route for this module, e.g. /dashboard/workforce. NULL means no dashboard entry point exists yet (true for booking/ai/core/logistics/crm as of 0071 -- not an oversight, see migration header).';
comment on column core.module_registry.icon_key is
  'Opaque icon identifier for a future shared nav shell to resolve (e.g. a lucide-react icon name). NULL until an icon set is actually chosen -- not this migration''s decision to make.';
comment on column core.module_registry.nav_sort_order is
  'Display order for a future shared nav shell. Lower sorts first. Default 100 for anything not explicitly ordered below.';

update core.module_registry set nav_route = '/dashboard/workforce', nav_sort_order = 10 where module = 'workforce';
update core.module_registry set nav_route = '/dashboard/inventory', nav_sort_order = 20 where module = 'inventory';
-- booking/ai/core/logistics/crm: nav_route stays NULL (no dashboard route exists today).

-- --- Shared Settings: generic per-tenant/module key-value store -------------
create table if not exists core.tenant_settings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  module        core.module_code not null,
  setting_key   text not null,
  setting_value jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, module, setting_key)
);
create index if not exists tenant_settings_tenant_idx on core.tenant_settings(tenant_id);
comment on table core.tenant_settings is
  'Generic per-tenant, per-module settings store (key/value). Fallback path for a module that needs simple settings without its own migration -- a module with heavily structured/queried settings (e.g. workforce.schedule_settings, 0034) should keep its own dedicated table instead of forcing everything through here.';

do $$
declare t text;
begin
  foreach t in array array['core.tenant_settings'] loop
    execute format(
      'drop trigger if exists set_updated_at on %s; '
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t, t);
  end loop;
end $$;

-- New permission: settings are tenant-configuration, not billing/entitlement
-- (core.billing.manage), so they get their own key rather than overloading
-- billing.manage. Unlike 0069's platform-staff-only entitlement writes,
-- tenant settings ARE ordinary tenant-admin territory (no Commercial
-- Honesty risk -- this is config, not plan/pricing).
insert into core.permissions (key, module, description) values
  ('core.settings.manage', 'core', 'Manage tenant-level settings (core.tenant_settings)')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Role mapping: mirrors 0008's own intent (Tenant Owner gets everything;
-- Tenant Admin gets everything except billing) for this ONE new key, since
-- 0008's `select key from core.permissions` backfill only ran once at seed
-- time and does not retroactively cover permissions added by later
-- migrations.
insert into core.role_permissions (role_id, permission_key) values
  ('00000000-0000-0000-0000-000000000003', 'core.settings.manage'), -- tenant_owner
  ('00000000-0000-0000-0000-000000000004', 'core.settings.manage')  -- tenant_admin
on conflict do nothing;

alter table core.tenant_settings enable row level security;

drop policy if exists tenant_settings_select on core.tenant_settings;
create policy tenant_settings_select on core.tenant_settings
  for select using (core.is_member_of(tenant_id));

drop policy if exists tenant_settings_write on core.tenant_settings;
create policy tenant_settings_write on core.tenant_settings
  for all using (core.has_permission(tenant_id, 'core.settings.manage'))
  with check (core.has_permission(tenant_id, 'core.settings.manage'));

-- Unlike 0069's entitlement tables (platform-staff-only writes, no grant to
-- `authenticated` yet since no client write path is intended before
-- Billing/Customer Portal exist), core.tenant_settings IS meant to be
-- directly writable by an ordinary tenant admin under RLS -- that's the
-- actual point of this table (a self-serve settings contract, not a
-- platform-controlled one). So the grant here is real, not latent.
grant select, insert, update, delete on core.tenant_settings to authenticated;
revoke all on core.tenant_settings from anon;
