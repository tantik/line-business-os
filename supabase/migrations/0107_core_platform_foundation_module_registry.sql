-- ============================================================================
-- 0107  Platform Foundation reconciliation (2/5) — Module Registry + deps
-- ----------------------------------------------------------------------------
-- Forward-only reconciliation of the Platform Foundation "Module Registry"
-- (critical path step 2/5, historically `main`'s 0070). See 0106's header and
-- docs/ai/PLATFORM_FOUNDATION_RECONCILIATION_HANDOFF_2026-08-29.md for why.
--
-- Metadata (version, lifecycle status, min plan, dependency edges) keyed by
-- the EXISTING `core.module_code` enum — a registry over the enum, not a
-- replacement for it.
--
-- CANONICAL RUNTIME GATE IS UNCHANGED: `core.can_enable_module` added here is
-- an ENABLEMENT PRE-CHECK (may a tenant turn this module on?), NOT the
-- runtime data-access gate. `core.has_module_access` (0093) remains the sole
-- tenant-facing Module-OFF security boundary and is not touched.
--
-- DUAL-TARGET: `create table if not exists` / explicit type guard / `on
-- conflict do nothing` seed / `drop policy if exists` + recreate — converges
-- on Cloud dev (objects byte-exact already present) and creates on a fresh
-- local reset. No `EXCEPTION WHEN others`.
--
-- The `operations` module row is registered separately in 0111 (after this
-- table exists and after 0099's enum value) — NOT here, to keep this file a
-- faithful reconciliation of `main`'s 0070 content.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'core' and t.typname = 'module_lifecycle_status'
  ) then
    create type core.module_lifecycle_status as enum
      ('planned', 'beta', 'ga', 'deprecated', 'retired');
  end if;
end $$;

create table if not exists core.module_registry (
  module           core.module_code primary key,
  name             text not null,
  description      text,
  version          text not null default '0.1.0',
  lifecycle_status core.module_lifecycle_status not null default 'planned',
  min_plan_code    text references core.entitlement_plans(code),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- nav metadata (historically added by `main`'s 0071; folded in here so a
  -- fresh reset builds the full column set in one place — the 0108
  -- reconciliation only seeds nav_route values and does not re-add columns).
  nav_route        text,
  icon_key         text,
  nav_sort_order   integer not null default 100
);
comment on table core.module_registry is
  'Module metadata: version, lifecycle status, and (optional) required plan. Keyed by the existing core.module_code enum, not a replacement for it. min_plan_code is an exact-match requirement, not a tiered minimum -- core.entitlement_plans has no rank/ordering yet.';
comment on column core.module_registry.nav_route is
  'Dashboard route for this module, e.g. /dashboard/workforce. NULL means no dashboard entry point exists yet.';
comment on column core.module_registry.icon_key is
  'Opaque icon identifier for a future shared nav shell to resolve. NULL until an icon set is actually chosen.';
comment on column core.module_registry.nav_sort_order is
  'Display order for a future shared nav shell. Lower sorts first. Default 100.';

-- For a DB where the table already existed WITHOUT the nav columns (defensive
-- — not expected on either target, but makes this file safe to re-run against
-- a partially-migrated DB).
alter table core.module_registry add column if not exists nav_route text;
alter table core.module_registry add column if not exists icon_key text;
alter table core.module_registry add column if not exists nav_sort_order integer not null default 100;

-- Lifecycle status reflects actual shipped state. ON CONFLICT DO NOTHING:
-- Cloud dev already has these 7 rows; a fresh reset creates them.
insert into core.module_registry (module, name, description, lifecycle_status) values
  ('core',      'Core',      'Platform identity, auth, tenant, location, RBAC, audit.', 'ga'),
  ('workforce', 'Workforce', 'Staff scheduling, attendance, shift exchange, recipes.', 'ga'),
  ('booking',   'Booking',   'Customer bookings and business hours.',                   'ga'),
  ('inventory', 'Inventory', 'Daily stock check for catalog items.',                    'beta'),
  ('ai',        'AI',        'AI proposal/approval workflow (ai.proposals).',           'beta'),
  ('logistics', 'Logistics', 'Not yet built -- placeholder enum value only.',           'planned'),
  ('crm',       'CRM',       'Not yet built -- placeholder enum value only.',           'planned')
on conflict (module) do nothing;

-- Nav seed (historically `main`'s 0071). UPDATE, not insert — safe to re-run;
-- only sets nav metadata, never touches lifecycle/version.
update core.module_registry set nav_route = '/dashboard/workforce', nav_sort_order = 10 where module = 'workforce';
update core.module_registry set nav_route = '/dashboard/inventory',  nav_sort_order = 20 where module = 'inventory';

-- --- dependency graph (empty: no module depends on another today) --------
create table if not exists core.module_dependencies (
  module      core.module_code not null references core.module_registry(module) on delete cascade,
  depends_on  core.module_code not null references core.module_registry(module) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (module, depends_on),
  check (module <> depends_on)
);
comment on table core.module_dependencies is
  'Direct module dependency edges: a row (A, B) means module A requires module B to be enabled first. Empty today. core.can_enable_module checks only direct edges (no chain exists yet to require transitive resolution).';

do $$
declare t text;
begin
  foreach t in array array['core.module_registry'] loop
    execute format(
      'drop trigger if exists set_updated_at on %s; '
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t, t);
  end loop;
end $$;

-- --- enablement pre-check (NOT the runtime gate) ------------------------
create or replace function core.can_enable_module(
  p_tenant_id uuid,
  p_module core.module_code
)
returns boolean
language sql stable security definer set search_path = core, public as $$
  select
    exists (
      select 1 from core.module_registry mr
      where mr.module = p_module
        and mr.lifecycle_status not in ('deprecated', 'retired')
    )
    and (
      (select mr.min_plan_code from core.module_registry mr where mr.module = p_module) is null
      or exists (
        select 1
        from core.module_registry mr
        join core.tenant_plans tp on tp.tenant_id = p_tenant_id
        where mr.module = p_module
          and tp.plan_code = mr.min_plan_code
      )
    )
    and not exists (
      select 1
      from core.module_dependencies md
      where md.module = p_module
        and not exists (
          select 1 from core.tenant_modules tm
          where tm.tenant_id = p_tenant_id
            and tm.module = md.depends_on
            and tm.is_enabled = true
        )
    );
$$;
comment on function core.can_enable_module(uuid, core.module_code) is
  'Pre-check for whether a tenant COULD enable a module: lifecycle not deprecated/retired, plan matches min_plan_code (if set), every direct dependency already enabled. Does NOT check whether the module IS currently enabled, and is NOT the runtime authorization gate -- see core.has_module_access (0093) for that. An absent module_registry row => false (fail closed).';

revoke all on function core.can_enable_module(uuid, core.module_code) from public, anon;
grant execute on function core.can_enable_module(uuid, core.module_code) to authenticated, service_role;

-- --- RLS: global catalogs; platform-staff-only writes ------------------
alter table core.module_registry     enable row level security;
alter table core.module_dependencies enable row level security;

drop policy if exists module_registry_select on core.module_registry;
create policy module_registry_select on core.module_registry
  for select using (core.current_user_id() is not null);
drop policy if exists module_registry_write on core.module_registry;
create policy module_registry_write on core.module_registry
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());

drop policy if exists module_dependencies_select on core.module_dependencies;
create policy module_dependencies_select on core.module_dependencies
  for select using (core.current_user_id() is not null);
drop policy if exists module_dependencies_write on core.module_dependencies;
create policy module_dependencies_write on core.module_dependencies
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());

grant select on core.module_registry     to authenticated;
grant select on core.module_dependencies to authenticated;
revoke all on core.module_registry     from anon;
revoke all on core.module_dependencies from anon;

-- ============================================================================
-- Rollback (fresh-DB only, NOT Cloud dev):
--   drop function if exists core.can_enable_module(uuid, core.module_code);
--   drop table if exists core.module_dependencies;
--   drop table if exists core.module_registry;
--   drop type if exists core.module_lifecycle_status;
-- ============================================================================
