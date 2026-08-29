-- ============================================================================
-- 0108  Platform Foundation reconciliation (3/5) — Shared Settings contract
-- ----------------------------------------------------------------------------
-- Forward-only reconciliation of the non-registry parts of the Platform
-- Foundation "Shared Navigation + Shared Settings" step (critical path 3/5,
-- historically `main`'s 0071). The nav METADATA (nav_route/icon_key/
-- nav_sort_order columns + the workforce/inventory nav seed) is folded into
-- 0107 so `core.module_registry` is built in one place; this file adds only:
--   * `core.tenant_settings` — generic per-tenant/module key-value store
--   * `core.settings.manage` permission + its owner/admin role grants
--
-- See 0106's header and docs/ai/PLATFORM_FOUNDATION_RECONCILIATION_HANDOFF_2026-08-29.md.
--
-- MODULE-OFF + tenant_settings — DELIBERATE, SURFACED, NOT CHANGED:
--   `tenant_settings_write` gates on `core.has_permission(tenant_id,
--   'core.settings.manage')` only — it does NOT call `core.has_module_access`
--   for the row's `module` value. So a tenant admin can write a
--   `tenant_settings` row tagged `module = 'workforce'` even while Workforce
--   is toggled OFF for that tenant. This matches `main`'s historical 0071
--   exactly and is retained as-is because: (a) `core.tenant_settings` is a
--   CORE platform table, not a product-data schema — `core` is never "off",
--   and the `module` column is a namespace tag, not an access boundary;
--   (b) the row holds tenant CONFIGURATION (staged for when the module is
--   on), not operational data; (c) the Module Access Security Remediation
--   (0093-0098) scoped module-OFF gating to the product schemas
--   (workforce/inventory/booking/ai/purchases), not to `core.*`. If the
--   Founder wants settings writes for an OFF module blocked, that is an
--   explicit follow-on decision — see the handoff §"Deferred decisions".
--   0052's pgTAP asserts the CURRENT behavior so any future change is visible.
--
-- DUAL-TARGET: create-if-not-exists / on-conflict / drop-and-recreate policy.
-- Converges on Cloud dev (present, byte-exact) and creates on fresh local.
-- ============================================================================

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
  'Generic per-tenant, per-module settings store (key/value). Fallback path for a module that needs simple settings without its own migration -- a module with heavily structured/queried settings (e.g. workforce.schedule_settings, 0034) keeps its own dedicated table instead.';

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

-- --- permission: tenant-config, its own key (not core.billing.manage) ---
-- ON CONFLICT DO UPDATE mirrors 0100's operations-permission upsert style and
-- is safe on both targets (Cloud already has this exact row from `main`'s
-- 0071; a fresh reset creates it).
insert into core.permissions (key, module, description) values
  ('core.settings.manage', 'core', 'Manage tenant-level settings (core.tenant_settings)')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Role mapping: Tenant Owner + Tenant Admin (mirrors 0008's intent; the 0008
-- backfill only ran once at seed time and does not cover later-added keys).
insert into core.role_permissions (role_id, permission_key) values
  ('00000000-0000-0000-0000-000000000003', 'core.settings.manage'),  -- tenant_owner
  ('00000000-0000-0000-0000-000000000004', 'core.settings.manage')   -- tenant_admin
on conflict do nothing;

-- --- RLS ---------------------------------------------------------------
alter table core.tenant_settings enable row level security;

drop policy if exists tenant_settings_select on core.tenant_settings;
create policy tenant_settings_select on core.tenant_settings
  for select using (core.is_member_of(tenant_id));

drop policy if exists tenant_settings_write on core.tenant_settings;
create policy tenant_settings_write on core.tenant_settings
  for all using (core.has_permission(tenant_id, 'core.settings.manage'))
  with check (core.has_permission(tenant_id, 'core.settings.manage'));

-- Unlike the 0106 entitlement tables (platform-staff-only, no authenticated
-- write grant), core.tenant_settings IS meant to be written by a tenant admin
-- under RLS -- that is the point of the table.
grant select, insert, update, delete on core.tenant_settings to authenticated;
revoke all on core.tenant_settings from anon;

-- ============================================================================
-- Rollback (fresh-DB only, NOT Cloud dev):
--   drop table if exists core.tenant_settings;
--   delete from core.role_permissions where permission_key = 'core.settings.manage';
--   delete from core.permissions where key = 'core.settings.manage';
-- ============================================================================
