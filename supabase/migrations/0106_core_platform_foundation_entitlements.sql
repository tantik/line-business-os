-- ============================================================================
-- 0106  Platform Foundation reconciliation (1/5) — Entitlements / Plans engine
-- ----------------------------------------------------------------------------
-- FORWARD-ONLY reconciliation of the Platform Foundation "Entitlements engine"
-- (Platform Foundation critical path step 1/5) into the `dev` lineage.
--
-- WHY THIS EXISTS — the short version (full history: docs/ai/
-- PLATFORM_FOUNDATION_RECONCILIATION_HANDOFF_2026-08-29.md):
--   * The Platform Foundation critical path (5 migrations, historically
--     numbered 0069-0073 on `main`, PRs #254/256/258/260/262) was merged to
--     `main` and pushed to Supabase Cloud dev on 2026-08-16, then `main` and
--     `dev` silently diverged. `dev` never received it.
--   * On 2026-08-20 (PR #329) `supabase migration repair --status reverted
--     0060 0070 0071 0072 0073` was run against Cloud dev so a `dev`-branch
--     migration could `db push` past the drift — this edited only the
--     migration LEDGER; every Foundation schema object stayed physically
--     present on Cloud dev (verified 2026-08-29 against a fresh logical dump:
--     every object is byte-exact to `main`'s migrations).
--   * Founder decision (2026-08-29): `dev` is the authoritative lineage;
--     re-express the retained Foundation as NEW forward-only migrations (no
--     `migration repair`, no restoring old files under historical numbers,
--     no edits to applied historical migrations). `main` reconciliation is a
--     separate future task.
--
-- DUAL-TARGET CONTRACT (mission §4):
--   * Fresh local `supabase db reset`: these statements CREATE the full
--     Entitlements engine correctly.
--   * Cloud dev (objects already physically present): the same statements
--     CONVERGE without dropping data, duplicating seed rows, overwriting
--     tenant plan state, weakening policies, or failing on existing objects.
--   Every idempotency decision below is explicit — no `EXCEPTION WHEN others`.
--
-- ADAPTED FROM `main`'s historical 0069 (reviewed source material, not
-- copied blind):
--   * `main`'s 0069 also REDEFINED `core.has_module_access` to join
--     `core.tenant_plans` and add an `is_platform_staff()` bypass. That is
--     DELIBERATELY OMITTED here. `dev`'s canonical `core.has_module_access`
--     (migration 0093, "Module Access Security Remediation") is the
--     Founder-approved runtime Module-OFF gate: pure `tenant_modules.is_enabled`
--     lookup, fail-closed, NO platform-staff bypass. Every RLS call site
--     (0094-0105, incl. all of Operations) and its pgTAP coverage is built
--     against that contract. 0093's own header already anticipates "a future
--     Entitlement layer can be added inside this function body without
--     changing any RLS call site" — wiring plan-suspension into module
--     access is that separate, later, explicit decision, NOT this
--     reconciliation. `core.has_module_access` is UNTOUCHED here.
--   * Everything else (plan catalog, per-tenant plan row + default trigger,
--     limit tables, get/check_entitlement_limit, RLS, api.my_tenant_plan) is
--     reconciled faithfully.
--
-- SCOPE: schema + enforcement functions + read facade only. No admin UI, no
-- billing, no consumer wiring. Platform-staff-only writes on every table
-- (Commercial Honesty: no tenant-visible plan change path before a Billing/
-- Customer-Portal stage exists).
--
-- Rollback: see the end of this file.
-- ============================================================================

-- --- lifecycle enum (explicit existence guard, not exception-swallowing) ----
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'core' and t.typname = 'tenant_plan_status'
  ) then
    create type core.tenant_plan_status as enum
      ('trial', 'active', 'past_due', 'suspended', 'canceled');
  end if;
end $$;

-- --- plan catalog ----------------------------------------------------------
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

-- ON CONFLICT DO NOTHING: on Cloud these 3 rows already exist (never
-- overwrite), on a fresh DB they are created.
insert into core.entitlement_plans (code, name, description) values
  ('trial',    'Trial',    'Time-limited evaluation access.'),
  ('standard', 'Standard', 'Default paid plan for onboarded tenants.'),
  ('custom',   'Custom',   'Hand-negotiated terms outside the standard catalog.')
on conflict (code) do nothing;

-- --- plan default limits (no row = unlimited) -----------------------------
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

-- --- tenant plan assignment (current state, one row per tenant) ----------
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

-- Backfill: every existing tenant gets a plan row so nothing fails closed
-- later. ON CONFLICT (tenant_id) DO NOTHING => never overwrites an existing
-- tenant's plan/status on Cloud (all 4 Cloud dev tenants already have a row);
-- on a fresh local DB there are no tenants yet at migration time, so this
-- inserts 0 rows and the trigger below covers seed-created tenants.
insert into core.tenant_plans (tenant_id, plan_code, status)
select id, 'standard', 'active' from core.tenants
on conflict (tenant_id) do nothing;

-- New tenants must not slip through without a plan row.
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

-- --- per-tenant limit overrides ------------------------------------------
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

-- --- updated_at maintenance (reuse core.set_updated_at, 0006) ------------
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

-- --- entitlement-limit helper functions ---------------------------------
-- (core.has_module_access is NOT redefined here — see header.)
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

revoke all on function core.get_entitlement_limit(uuid, core.module_code, text) from public, anon;
revoke all on function core.check_entitlement_limit(uuid, core.module_code, text, bigint) from public, anon;
grant execute on function core.get_entitlement_limit(uuid, core.module_code, text) to authenticated, service_role;
grant execute on function core.check_entitlement_limit(uuid, core.module_code, text, bigint) to authenticated, service_role;

-- --- RLS: global catalogs readable by any authenticated user; every write
--         is platform-staff-only (deliberately stricter than
--         tenant_modules_write's core.billing.manage gate — no Customer
--         Portal / self-service plan change exists). ------------------------
alter table core.entitlement_plans          enable row level security;
alter table core.plan_default_limits        enable row level security;
alter table core.tenant_plans               enable row level security;
alter table core.tenant_entitlement_limits  enable row level security;

drop policy if exists entitlement_plans_select on core.entitlement_plans;
create policy entitlement_plans_select on core.entitlement_plans
  for select using (core.current_user_id() is not null);
drop policy if exists entitlement_plans_write on core.entitlement_plans;
create policy entitlement_plans_write on core.entitlement_plans
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());

drop policy if exists plan_default_limits_select on core.plan_default_limits;
create policy plan_default_limits_select on core.plan_default_limits
  for select using (core.current_user_id() is not null);
drop policy if exists plan_default_limits_write on core.plan_default_limits;
create policy plan_default_limits_write on core.plan_default_limits
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());

drop policy if exists tenant_plans_select on core.tenant_plans;
create policy tenant_plans_select on core.tenant_plans
  for select using (core.is_member_of(tenant_id));
drop policy if exists tenant_plans_write on core.tenant_plans;
create policy tenant_plans_write on core.tenant_plans
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());

drop policy if exists tenant_entitlement_limits_select on core.tenant_entitlement_limits;
create policy tenant_entitlement_limits_select on core.tenant_entitlement_limits
  for select using (core.is_member_of(tenant_id));
drop policy if exists tenant_entitlement_limits_write on core.tenant_entitlement_limits;
create policy tenant_entitlement_limits_write on core.tenant_entitlement_limits
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());

-- --- api facade (mirrors api.my_tenant_modules, 0017) -------------------
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
grant select on core.entitlement_plans to authenticated;
grant select on api.my_tenant_plan to authenticated;
revoke all on api.my_tenant_plan from anon, public;
revoke all on core.entitlement_plans from anon;

-- ============================================================================
-- Rollback (only meaningful on a DB where this migration actually created the
-- objects — NOT to be run against Cloud dev, where they predate this file):
--   drop view if exists api.my_tenant_plan;
--   drop function if exists core.check_entitlement_limit(uuid, core.module_code, text, bigint);
--   drop function if exists core.get_entitlement_limit(uuid, core.module_code, text);
--   drop trigger if exists tenant_plans_default on core.tenants;
--   drop function if exists core.tenant_plans_default_on_tenant_insert();
--   drop table if exists core.tenant_entitlement_limits;
--   drop table if exists core.tenant_plans;
--   drop table if exists core.plan_default_limits;
--   drop table if exists core.entitlement_plans;
--   drop type if exists core.tenant_plan_status;
-- ============================================================================
