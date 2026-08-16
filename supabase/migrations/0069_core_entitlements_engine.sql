-- ============================================================================
-- 0069  Entitlements engine: plan/limit/lifecycle model over tenant_modules
-- ----------------------------------------------------------------------------
-- Platform Foundation critical path, step 1 of 5
-- (docs/foundation/platform-foundation-roadmap.md S7/S10): Entitlements
-- engine -> Module Registry -> Shared Navigation/Settings -> Notifications ->
-- Event Bus. A third vertical cannot be added safely until this path closes
-- (Core Law 10 / Law 11.4).
--
-- `core.tenant_modules` (0002) has been a pure boolean on/off toggle since
-- day one, with no concept of a plan/tariff, a limit, or a lifecycle status
-- (trial/active/suspended). This migration adds that model ALONGSIDE the
-- existing toggle, not instead of it:
--   * `core.tenant_modules.is_enabled` keeps its exact current meaning and
--     RLS policy (0007) -- nothing that reads it today
--     (apps/web/src/lib/tenant/modules.ts,
--     apps/web/src/lib/preview/module-guard.ts) needs to change.
--   * `core.has_module_access()` layers subscription lifecycle on top of that
--     boolean: a module can be `is_enabled = true` and still be inaccessible
--     if the tenant's plan is suspended/canceled.
--
-- SCOPE: schema + enforcement engineering only. No admin UI, no consumer
-- wiring (Module Registry, the next critical-path step, is what will
-- actually gate navigation with this), no real pricing/billing (Billing is a
-- separate, later, critical-path step).
--
-- WHY PLAN/LIMIT WRITES ARE PLATFORM-STAFF-ONLY, NOT `core.billing.manage`:
-- tenant_modules_write (0007) already lets any role holding
-- `core.billing.manage` toggle modules. Plan assignment and limits are
-- deliberately MORE restrictive (core.is_platform_staff() only) because
-- there is no Billing/Customer Portal yet to make a tenant-visible plan
-- change commercially honest (roadmap S9 risk table: Customer Portal before
-- Billing/Entitlements risks Law 14, Commercial Honesty). Module on/off
-- toggling is unaffected.
--
-- WHY A TABLE-BASED PLAN CATALOG, NOT AN ENUM: `core.module_code` (0001)
-- already shows the friction of a static enum for anything that needs
-- metadata or growth. A table lets plans be added/deprecated without
-- `ALTER TYPE` and carry descriptive fields.
--
-- WHY CURRENT-STATE TABLES, NOT HISTORY TABLES: mirrors the existing
-- `audit.audit_logs` precedent the roadmap itself calls out (S6) as the
-- pattern for platform services -- history lives in the audit trail, not
-- duplicated here.
-- ============================================================================

-- --- lifecycle enum ---------------------------------------------------------
do $$ begin
  create type core.tenant_plan_status as enum (
    'trial', 'active', 'past_due', 'suspended', 'canceled'
  );
exception when duplicate_object then null; end $$;

-- --- plan catalog ------------------------------------------------------------
create table if not exists core.entitlement_plans (
  code         text primary key,
  name         text not null,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table core.entitlement_plans is
  'Platform plan/tariff catalog. Engineering scaffolding for the Entitlements engine -- actual pricing/commercial plan definitions are a Billing-stage business decision, not made here.';

insert into core.entitlement_plans (code, name, description) values
  ('trial',    'Trial',    'Time-limited evaluation access.'),
  ('standard', 'Standard', 'Default paid plan for onboarded tenants.'),
  ('custom',   'Custom',   'Hand-negotiated terms outside the standard catalog.')
on conflict (code) do nothing;

-- --- plan default limits (empty = unlimited) --------------------------------
create table if not exists core.plan_default_limits (
  id           uuid primary key default gen_random_uuid(),
  plan_code    text not null references core.entitlement_plans(code) on delete cascade,
  module       core.module_code not null,
  limit_key    text not null,
  limit_value  bigint,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (plan_code, module, limit_key)
);
comment on table core.plan_default_limits is
  'Default numeric limits per plan/module/key. No row = unlimited. Overridden per-tenant by core.tenant_entitlement_limits.';

-- --- tenant plan assignment (current state, one row per tenant) -------------
create table if not exists core.tenant_plans (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null unique references core.tenants(id) on delete cascade,
  plan_code      text not null default 'standard' references core.entitlement_plans(code),
  status         core.tenant_plan_status not null default 'active',
  trial_ends_at  timestamptz,
  suspended_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists tenant_plans_plan_code_idx on core.tenant_plans(plan_code);
comment on table core.tenant_plans is
  'Current plan + lifecycle status per tenant. History lives in audit.audit_logs, not here (same pattern as core.tenant_modules).';

-- Backfill every existing tenant so no currently-working tenant regresses:
-- absent this, core.has_module_access() below would fail closed for every
-- tenant that predates this migration.
insert into core.tenant_plans (tenant_id, plan_code, status)
select id, 'standard', 'active' from core.tenants
on conflict (tenant_id) do nothing;

-- New tenants created after this migration must not be able to slip through
-- without a plan row (which would silently fail closed on every module).
-- A DB trigger is the Law-7 guarantee here, not app-code discipline: the only
-- current tenant-creation path (packages/db/scripts/onboard-write.ts) is a
-- Phase 1H dry-run that never commits, so there is no single trusted app
-- write-path to rely on instead.
create or replace function core.tenant_plans_default_on_tenant_insert()
returns trigger
language plpgsql security definer set search_path = core, public as $$
begin
  insert into core.tenant_plans (tenant_id, plan_code, status)
  values (new.id, 'standard', 'active')
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tenant_plans_default on core.tenants;
create trigger tenant_plans_default
  after insert on core.tenants
  for each row execute function core.tenant_plans_default_on_tenant_insert();

-- --- per-tenant limit overrides ----------------------------------------------
create table if not exists core.tenant_entitlement_limits (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  module       core.module_code not null,
  limit_key    text not null,
  limit_value  bigint,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, module, limit_key)
);
create index if not exists tenant_entitlement_limits_tenant_idx
  on core.tenant_entitlement_limits(tenant_id);
comment on table core.tenant_entitlement_limits is
  'Per-tenant numeric limit overrides. Takes precedence over core.plan_default_limits for the same (module, limit_key). No row here or in the plan default = unlimited.';

-- --- updated_at maintenance (reuse core.set_updated_at from 0006) -----------
do $$
declare t text;
begin
  foreach t in array array[
    'core.entitlement_plans', 'core.plan_default_limits',
    'core.tenant_plans', 'core.tenant_entitlement_limits'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on %s; '
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t, t);
  end loop;
end $$;

-- --- enforcement functions (mirror core.has_permission's shape) ------------
create or replace function core.has_module_access(
  p_tenant_id uuid,
  p_module core.module_code
)
returns boolean
language sql stable security definer set search_path = core, public as $$
  select core.is_platform_staff()
      or exists (
        select 1
        from core.tenant_modules tm
        join core.tenant_plans tp on tp.tenant_id = tm.tenant_id
        where tm.tenant_id = p_tenant_id
          and tm.module = p_module
          and tm.is_enabled = true
          and tp.status not in ('suspended', 'canceled')
      );
$$;
comment on function core.has_module_access(uuid, core.module_code) is
  'Whether the tenant may currently use a module: is_enabled (0002/core.tenant_modules) AND the tenant''s plan is not suspended/canceled. Fails closed when no core.tenant_plans row exists (should not happen post-migration/trigger). Platform staff always pass.';

create or replace function core.get_entitlement_limit(
  p_tenant_id uuid,
  p_module core.module_code,
  p_limit_key text
)
returns bigint
language sql stable security definer set search_path = core, public as $$
  select coalesce(
    (select tel.limit_value
       from core.tenant_entitlement_limits tel
      where tel.tenant_id = p_tenant_id
        and tel.module = p_module
        and tel.limit_key = p_limit_key),
    (select pdl.limit_value
       from core.tenant_plans tp
       join core.plan_default_limits pdl
         on pdl.plan_code = tp.plan_code
        and pdl.module = p_module
        and pdl.limit_key = p_limit_key
      where tp.tenant_id = p_tenant_id)
  );
$$;
comment on function core.get_entitlement_limit(uuid, core.module_code, text) is
  'Effective limit value for a tenant/module/key: tenant override first, then plan default, else NULL (unlimited).';

create or replace function core.check_entitlement_limit(
  p_tenant_id uuid,
  p_module core.module_code,
  p_limit_key text,
  p_current_usage bigint
)
returns boolean
language sql stable security definer set search_path = core, public as $$
  select core.get_entitlement_limit(p_tenant_id, p_module, p_limit_key) is null
      or p_current_usage < core.get_entitlement_limit(p_tenant_id, p_module, p_limit_key);
$$;
comment on function core.check_entitlement_limit(uuid, core.module_code, text, bigint) is
  'True when p_current_usage is still within the effective limit (or the limit is unlimited/NULL).';

-- --- RLS ---------------------------------------------------------------------
alter table core.entitlement_plans          enable row level security;
alter table core.plan_default_limits        enable row level security;
alter table core.tenant_plans               enable row level security;
alter table core.tenant_entitlement_limits  enable row level security;

-- Global catalogs: readable by any authenticated user (same as core.permissions,
-- 0007); writable only by platform staff (no Customer Portal / self-service yet).
drop policy if exists entitlement_plans_select on core.entitlement_plans;
create policy entitlement_plans_select on core.entitlement_plans
  for select using (core.current_user_id() is not null);

drop policy if exists entitlement_plans_write on core.entitlement_plans;
create policy entitlement_plans_write on core.entitlement_plans
  for all using (core.is_platform_staff())
  with check (core.is_platform_staff());

drop policy if exists plan_default_limits_select on core.plan_default_limits;
create policy plan_default_limits_select on core.plan_default_limits
  for select using (core.current_user_id() is not null);

drop policy if exists plan_default_limits_write on core.plan_default_limits;
create policy plan_default_limits_write on core.plan_default_limits
  for all using (core.is_platform_staff())
  with check (core.is_platform_staff());

-- Tenant-scoped: members can read their own tenant's plan/limits; only
-- platform staff can write (see header rationale -- deliberately stricter
-- than tenant_modules_write's core.billing.manage gate).
drop policy if exists tenant_plans_select on core.tenant_plans;
create policy tenant_plans_select on core.tenant_plans
  for select using (core.is_member_of(tenant_id));

drop policy if exists tenant_plans_write on core.tenant_plans;
create policy tenant_plans_write on core.tenant_plans
  for all using (core.is_platform_staff())
  with check (core.is_platform_staff());

drop policy if exists tenant_entitlement_limits_select on core.tenant_entitlement_limits;
create policy tenant_entitlement_limits_select on core.tenant_entitlement_limits
  for select using (core.is_member_of(tenant_id));

drop policy if exists tenant_entitlement_limits_write on core.tenant_entitlement_limits;
create policy tenant_entitlement_limits_write on core.tenant_entitlement_limits
  for all using (core.is_platform_staff())
  with check (core.is_platform_staff());

-- --- api facade (mirrors api.my_tenant_modules, 0017) -----------------------
create or replace view api.my_tenant_plan
  with (security_invoker = true) as
select
  tp.tenant_id,
  tp.plan_code,
  tp.status,
  tp.trial_ends_at
from core.tenant_plans tp
where exists (
  select 1
  from core.tenant_memberships membership
  where membership.tenant_id = tp.tenant_id
    and membership.user_id = core.current_user_id()
    and membership.status = 'active'
);

comment on view api.my_tenant_plan is
  'Current user tenant plan/status for active memberships only. security_invoker view; core RLS is enforced as caller. No row id, timestamps beyond trial_ends_at, user ids, or emails.';

grant select on core.tenant_plans to authenticated;
grant select on api.my_tenant_plan to authenticated;
revoke all on api.my_tenant_plan from anon;
revoke all on api.my_tenant_plan from public;

grant select on core.entitlement_plans to authenticated;
revoke all on core.entitlement_plans from anon;
