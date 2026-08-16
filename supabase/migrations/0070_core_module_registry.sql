-- ============================================================================
-- 0070  Module Registry: metadata + dependency graph over core.module_code
-- ----------------------------------------------------------------------------
-- Platform Foundation critical path, step 2 of 5
-- (docs/foundation/platform-foundation-roadmap.md S7/S10): Entitlements
-- engine (0069) -> Module Registry (this migration) -> Shared
-- Navigation/Settings -> Notifications -> Event Bus.
--
-- `core.module_code` (0001) is a static 7-value enum with zero metadata: no
-- version, no lifecycle status, no dependency list, no minimum-plan
-- requirement. The roadmap calls this "an on/off switch, not a registry" and
-- says a 3rd+ vertical cannot be added safely without it (manual
-- coordination would otherwise be the only guard against enabling a module
-- whose dependency isn't enabled, or that a tenant's plan doesn't cover).
--
-- WHY THE MODULE IDENTIFIER STAYS THE EXISTING ENUM, NOT A NEW TEXT CATALOG:
-- unlike 0069's plan catalog (a genuinely new concept), `core.module_code`
-- is already referenced across permissions, tenant_modules, AI proposal
-- typing, and onboarding scaffolding (packages/db/src/types.ts,
-- packages/ai/src/proposals.ts). Replacing it with a text catalog would be a
-- large cross-cutting migration for no present need -- confirmed by
-- research that `logistics`/`crm` are pure placeholders (enum values only,
-- zero schema/routes/code beyond mirroring the enum) and the other 5 values
-- are stable. This migration adds a METADATA table keyed by the existing
-- enum, not a replacement for it.
--
-- WHY min_plan_code IS AN EXACT-MATCH, NOT A TIERED MINIMUM: `core
-- .entitlement_plans` (0069) has no rank/tier ordering column -- which plan
-- is "higher" than another is a pricing decision not yet made (Billing,
-- a later critical-path step). Modeling min_plan_code as a true minimum
-- would require inventing that ordering now. Left as an exact-required-plan
-- match instead; revisit if/when Billing introduces real tiering.
--
-- SCOPE: schema + a pre-check function only. No UI consumer wired up
-- (Shared Navigation/Settings, the next critical-path step, is what will
-- actually use this to render/gate a module list), no admin surface for
-- editing registry rows.
-- ============================================================================

do $$ begin
  create type core.module_lifecycle_status as enum (
    'planned', 'beta', 'ga', 'deprecated', 'retired'
  );
exception when duplicate_object then null; end $$;

create table if not exists core.module_registry (
  module           core.module_code primary key,
  name             text not null,
  description      text,
  version          text not null default '0.1.0',
  lifecycle_status core.module_lifecycle_status not null default 'planned',
  min_plan_code    text references core.entitlement_plans(code),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table core.module_registry is
  'Module metadata: version, lifecycle status, and (optional) required plan. Keyed by the existing core.module_code enum, not a replacement for it. min_plan_code is an exact-match requirement, not a tiered minimum -- core.entitlement_plans has no rank/ordering yet.';

-- Lifecycle status reflects actual shipped state (docs/product/modules.md's
-- informal shipped-vs-"Planned" language, formalized here; that doc is
-- currently stale about inventory and should be reconciled separately, not
-- as a side effect of this migration).
insert into core.module_registry (module, name, description, lifecycle_status) values
  ('core',      'Core',      'Platform identity, auth, tenant, location, RBAC, audit.', 'ga'),
  ('workforce', 'Workforce', 'Staff scheduling, attendance, shift exchange, recipes.', 'ga'),
  ('booking',   'Booking',   'Customer bookings and business hours.',                   'ga'),
  ('inventory', 'Inventory', 'Daily stock check for catalog items.',                    'beta'),
  ('ai',        'AI',        'AI proposal/approval workflow (ai.proposals).',           'beta'),
  ('logistics', 'Logistics', 'Not yet built -- placeholder enum value only.',           'planned'),
  ('crm',       'CRM',       'Not yet built -- placeholder enum value only.',           'planned')
on conflict (module) do nothing;

-- --- dependency graph (empty: no module depends on another today) ----------
create table if not exists core.module_dependencies (
  module      core.module_code not null references core.module_registry(module) on delete cascade,
  depends_on  core.module_code not null references core.module_registry(module) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (module, depends_on),
  check (module <> depends_on)
);
comment on table core.module_dependencies is
  'Direct module dependency edges: a row (A, B) means module A requires module B to be enabled first. Empty today -- no real dependency exists between any shipped module. core.can_enable_module checks only direct edges (no chain exists yet to require transitive resolution).';

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

-- --- pre-check function ------------------------------------------------------
create or replace function core.can_enable_module(
  p_tenant_id uuid,
  p_module core.module_code
)
returns boolean
language sql stable security definer set search_path = core, public as $$
  select
    -- not retired/deprecated
    exists (
      select 1 from core.module_registry mr
      where mr.module = p_module
        and mr.lifecycle_status not in ('deprecated', 'retired')
    )
    -- plan requirement (if any) is met
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
    -- every direct dependency is already enabled for this tenant
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
  'Pre-check for whether a tenant COULD enable a module: lifecycle status is not deprecated/retired, the tenant''s plan matches min_plan_code (if set), and every direct dependency (core.module_dependencies) is already enabled for the tenant. Does not check whether the module IS currently enabled -- see core.has_module_access (0069) for that.';

-- --- RLS ---------------------------------------------------------------------
alter table core.module_registry     enable row level security;
alter table core.module_dependencies enable row level security;

-- Global catalogs: readable by any authenticated user (same as
-- core.entitlement_plans, 0069); writable only by platform staff (no admin
-- surface for editing these exists yet).
drop policy if exists module_registry_select on core.module_registry;
create policy module_registry_select on core.module_registry
  for select using (core.current_user_id() is not null);

drop policy if exists module_registry_write on core.module_registry;
create policy module_registry_write on core.module_registry
  for all using (core.is_platform_staff())
  with check (core.is_platform_staff());

drop policy if exists module_dependencies_select on core.module_dependencies;
create policy module_dependencies_select on core.module_dependencies
  for select using (core.current_user_id() is not null);

drop policy if exists module_dependencies_write on core.module_dependencies;
create policy module_dependencies_write on core.module_dependencies
  for all using (core.is_platform_staff())
  with check (core.is_platform_staff());

grant select on core.module_registry to authenticated;
grant select on core.module_dependencies to authenticated;
revoke all on core.module_registry from anon;
revoke all on core.module_dependencies from anon;
