-- ============================================================================
-- 0129 — Packages: platform / modules / packages model, task P1
-- ----------------------------------------------------------------------------
-- Design: docs/architecture/platform-packages-model.md (Founder-approved
-- 2026-10-19). A package (product) is a list of modules plus industry
-- configuration; a tenant may hold several packages and add or opt out of
-- single modules (add-ons at an extra price, decided by billing later).
--
-- The runtime gate does NOT change: core.tenant_modules stays the single
-- table every RLS policy reads through core.has_module_access (0093). The
-- new tables only decide what tenant_modules must contain:
--
--   desired = modules of the tenant's ACTIVE packages
--             + override is_enabled = true   (add-on)
--             - override is_enabled = false  (opted out)
--
-- core.sync_tenant_modules(tenant) writes that set into tenant_modules
-- (enable / disable rows, never delete: a switched-off module keeps its data
-- and its config). Every change goes through core.set_tenant_package /
-- core.set_tenant_module_override, which sync and write one audit row each.
-- Callable by service_role only (provisioning Edge Function, admin console
-- server code) -- never by a browser session.
--
-- Back-fill: every existing tenant with module rows is adopted into the 'cafe'
-- package with compensating overrides (core.adopt_tenant_into_package), which
-- asserts per tenant that nothing changes: zero access change.
--
-- Rollback: explicit statements at the end of this file.
-- ============================================================================

-- --- catalog -------------------------------------------------------------------
create table core.packages (
  code              text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name_ja           text not null,
  name_en           text not null,
  description       text,
  version           integer not null default 1 check (version >= 1),
  lifecycle_status  core.module_lifecycle_status not null default 'planned',
  sort_order        integer not null default 100,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table core.packages is
  'Package (product) catalog: Cafe, future Salon / Cleaning / mini packages. A package is a list of modules (core.package_modules) plus industry configuration kept in code (templates, vocabulary). version = the package template version a tenant was provisioned with.';

create table core.package_modules (
  package_code  text not null references core.packages(code) on delete cascade,
  module        core.module_code not null references core.module_registry(module),
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now(),
  primary key (package_code, module)
);
comment on table core.package_modules is
  'Modules included in a package. sort_order = navigation order inside the package (task P4).';

-- --- per tenant ----------------------------------------------------------------
create table core.tenant_packages (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenants(id) on delete cascade,
  package_code     text not null references core.packages(code),
  package_version  integer not null check (package_version >= 1),
  status           text not null default 'active' check (status in ('active', 'removed')),
  added_at         timestamptz not null default now(),
  removed_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, package_code),
  check ((status = 'removed') = (removed_at is not null))
);
create index tenant_packages_tenant_idx on core.tenant_packages(tenant_id);
comment on table core.tenant_packages is
  'Packages a tenant holds (several allowed). status removed keeps the row for history; the modules leave tenant_modules unless another package or an add-on still includes them.';

create table core.tenant_module_overrides (
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  module      core.module_code not null references core.module_registry(module),
  is_enabled  boolean not null,
  reason      text check (reason is null or length(reason) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, module)
);
comment on table core.tenant_module_overrides is
  'Per-tenant module decisions on top of packages: is_enabled true = add-on module outside the packages, false = opted out of a package module. No row = follow the packages.';

do $$
declare t text;
begin
  foreach t in array array['core.packages', 'core.tenant_packages', 'core.tenant_module_overrides'] loop
    execute format(
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t);
  end loop;
end $$;

-- --- RLS: catalogs readable by signed-in users, tenant rows by members; writes platform staff only
alter table core.packages                enable row level security;
alter table core.package_modules         enable row level security;
alter table core.tenant_packages         enable row level security;
alter table core.tenant_module_overrides enable row level security;

create policy packages_select on core.packages
  for select using (core.current_user_id() is not null);
create policy packages_write on core.packages
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());
create policy package_modules_select on core.package_modules
  for select using (core.current_user_id() is not null);
create policy package_modules_write on core.package_modules
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());
create policy tenant_packages_select on core.tenant_packages
  for select using (core.is_member_of(tenant_id));
create policy tenant_packages_write on core.tenant_packages
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());
create policy tenant_module_overrides_select on core.tenant_module_overrides
  for select using (core.is_member_of(tenant_id));
create policy tenant_module_overrides_write on core.tenant_module_overrides
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());

grant select on core.packages, core.package_modules, core.tenant_packages, core.tenant_module_overrides to authenticated;
revoke all on core.packages, core.package_modules, core.tenant_packages, core.tenant_module_overrides from anon;

-- --- desired module set ----------------------------------------------------------
-- Internal helper (SECURITY DEFINER, no caller check): never granted to app
-- roles, so a member cannot read another tenant's module set (DB review #600).
create or replace function core.desired_tenant_modules(p_tenant_id uuid)
returns setof core.module_code
language sql stable security definer set search_path = core, public as $$
  (
    select pm.module
      from core.tenant_packages tp
      join core.package_modules pm on pm.package_code = tp.package_code
     where tp.tenant_id = p_tenant_id and tp.status = 'active'
    union
    select o.module from core.tenant_module_overrides o
     where o.tenant_id = p_tenant_id and o.is_enabled
  )
  except
  select o.module from core.tenant_module_overrides o
   where o.tenant_id = p_tenant_id and not o.is_enabled;
$$;
comment on function core.desired_tenant_modules(uuid) is
  'Modules a tenant should have enabled: active packages + add-on overrides - opted-out overrides (0129). Internal: service_role / definer callers only.';

-- A tenant is package-managed once it has a tenant_packages or override row.
-- Tenants written the old way (seed, local onboarding CLI, smoke scripts:
-- direct tenant_modules rows) are not, and sync refuses them instead of
-- switching all their modules off; core.adopt_tenant_into_package converts one.
create or replace function core.is_package_managed(p_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = core, public as $$
  select exists (select 1 from core.tenant_packages where tenant_id = p_tenant_id)
      or exists (select 1 from core.tenant_module_overrides where tenant_id = p_tenant_id);
$$;

-- One writer per tenant at a time (DB review #600: two concurrent package
-- changes could otherwise compute the desired set from stale snapshots).
create or replace function core.lock_tenant_modules(p_tenant_id uuid)
returns void
language sql security definer set search_path = core, public as $$
  select pg_advisory_xact_lock(hashtextextended('core.tenant_modules:' || p_tenant_id::text, 0));
$$;

-- Audit actor: an explicit platform-staff user (server code passes it), else
-- the JWT user when it is a known core.users row, else 'system'.
create or replace function core.package_audit_actor(p_actor_id uuid)
returns uuid
language plpgsql stable security definer set search_path = core, public as $$
declare v_actor uuid;
begin
  if p_actor_id is not null then
    if not exists (select 1 from core.users where id = p_actor_id and is_platform_staff) then
      raise exception 'actor_not_platform_staff' using errcode = '42501';
    end if;
    return p_actor_id;
  end if;
  v_actor := core.current_user_id();
  if v_actor is not null and exists (select 1 from core.users where id = v_actor) then
    return v_actor;
  end if;
  return null;
end;
$$;

-- --- sync into the runtime gate ---------------------------------------------------
create or replace function core.sync_tenant_modules(p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path = core, public as $$
declare
  v_enabled text[];
  v_disabled text[];
  v_missing text;
begin
  perform core.lock_tenant_modules(p_tenant_id);  -- re-entrant; also serialises a direct call
  if not core.is_package_managed(p_tenant_id)
     and exists (select 1 from core.tenant_modules where tenant_id = p_tenant_id and is_enabled) then
    raise exception 'tenant_not_package_managed: adopt the tenant first (core.adopt_tenant_into_package)' using errcode = 'P0001';
  end if;

  -- dependencies (core.module_dependencies, direct edges) must be inside the desired set
  select string_agg(md.module || ' requires ' || md.depends_on, ', ')
    into v_missing
    from core.module_dependencies md
   where md.module in (select core.desired_tenant_modules(p_tenant_id))
     and md.depends_on not in (select core.desired_tenant_modules(p_tenant_id));
  if v_missing is not null then
    raise exception 'module_dependency_missing: %', v_missing using errcode = 'P0001';
  end if;

  with desired as (select m from core.desired_tenant_modules(p_tenant_id) as m),
  ins as (
    insert into core.tenant_modules (tenant_id, module, is_enabled)
    select p_tenant_id, d.m, true from desired d
    on conflict (tenant_id, module) do update set is_enabled = true
      where core.tenant_modules.is_enabled = false
    returning module
  )
  select coalesce(array_agg(module::text order by module::text), '{}') into v_enabled from ins;

  with off as (
    update core.tenant_modules tm set is_enabled = false
     where tm.tenant_id = p_tenant_id and tm.is_enabled
       and tm.module not in (select core.desired_tenant_modules(p_tenant_id))
    returning tm.module
  )
  select coalesce(array_agg(module::text order by module::text), '{}') into v_disabled from off;

  return jsonb_build_object('enabled', to_jsonb(v_enabled), 'disabled', to_jsonb(v_disabled));
end;
$$;
comment on function core.sync_tenant_modules(uuid) is
  'Writes core.desired_tenant_modules into core.tenant_modules (enable/disable, never delete; data and config of a switched-off module stay). Refuses a tenant that is not package-managed but has enabled modules, and a missing dependency. Callers hold core.lock_tenant_modules. Returns {enabled, disabled}. service_role only (0129).';

-- A module may be switched ON only when it is shipped (beta/ga) and, if it
-- names a min_plan_code, the tenant is on that plan. Switching OFF is always
-- allowed, so retiring a package or module never locks tenants in.
create or replace function core.assert_module_enableable(p_tenant_id uuid, p_module core.module_code)
returns void
language plpgsql stable security definer set search_path = core, public as $$
begin
  if not exists (
    select 1 from core.module_registry mr
     where mr.module = p_module
       and mr.lifecycle_status in ('beta', 'ga')
       and (mr.min_plan_code is null
            or exists (select 1 from core.tenant_plans tp where tp.tenant_id = p_tenant_id and tp.plan_code = mr.min_plan_code))
  ) then
    raise exception 'module_not_available: %', p_module using errcode = 'P0002';
  end if;
end;
$$;

-- --- the mutations -------------------------------------------------------------------
create or replace function core.set_tenant_package(p_tenant_id uuid, p_package_code text, p_active boolean, p_actor_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = core, audit, public as $$
declare
  v_version int;
  v_before text;
  v_result jsonb;
  v_actor uuid;
  m core.module_code;
begin
  if p_tenant_id is null or p_package_code is null or p_active is null then
    raise exception 'invalid_argument: tenant, package and active are required' using errcode = '22004';
  end if;
  if not exists (select 1 from core.tenants where id = p_tenant_id) then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;
  v_actor := core.package_audit_actor(p_actor_id);
  perform core.lock_tenant_modules(p_tenant_id);
  if not core.is_package_managed(p_tenant_id)
     and exists (select 1 from core.tenant_modules where tenant_id = p_tenant_id and is_enabled) then
    raise exception 'tenant_not_package_managed: adopt the tenant first (core.adopt_tenant_into_package)' using errcode = 'P0001';
  end if;
  select status into v_before from core.tenant_packages where tenant_id = p_tenant_id and package_code = p_package_code;

  if p_active then
    select version into v_version from core.packages
     where code = p_package_code and lifecycle_status in ('beta', 'ga');
    if v_version is null then
      raise exception 'package_not_available: %', p_package_code using errcode = 'P0002';
    end if;
    for m in select pm.module from core.package_modules pm
              where pm.package_code = p_package_code
                and not exists (select 1 from core.tenant_module_overrides o
                                 where o.tenant_id = p_tenant_id and o.module = pm.module and not o.is_enabled) loop
      perform core.assert_module_enableable(p_tenant_id, m);
    end loop;
    -- a new or re-activated package records the current version; an already active one keeps its own
    insert into core.tenant_packages (tenant_id, package_code, package_version)
    values (p_tenant_id, p_package_code, v_version)
    on conflict (tenant_id, package_code) do update
      set status = 'active', removed_at = null,
          package_version = case when core.tenant_packages.status = 'removed' then excluded.package_version else core.tenant_packages.package_version end,
          added_at = case when core.tenant_packages.status = 'removed' then now() else core.tenant_packages.added_at end;
  else
    if v_before is distinct from 'active' then
      raise exception 'package_not_active: %', p_package_code using errcode = 'P0002';
    end if;
    update core.tenant_packages set status = 'removed', removed_at = now()
     where tenant_id = p_tenant_id and package_code = p_package_code;
  end if;

  v_result := core.sync_tenant_modules(p_tenant_id);

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (p_tenant_id, v_actor, case when v_actor is null then 'system' else 'user' end,
          'core', 'tenant_package', p_package_code, case when p_active then 'add' else 'remove' end,
          jsonb_build_object('status', v_before), jsonb_build_object('status', case when p_active then 'active' else 'removed' end),
          jsonb_build_object('sync', v_result));
  return v_result;
end;
$$;

create or replace function core.set_tenant_module_override(p_tenant_id uuid, p_module core.module_code, p_enabled boolean, p_reason text default null, p_actor_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = core, audit, public as $$
declare
  v_before boolean;
  v_result jsonb;
  v_actor uuid;
begin
  if p_tenant_id is null or p_module is null then
    raise exception 'invalid_argument: tenant and module are required' using errcode = '22004';
  end if;
  if not exists (select 1 from core.tenants where id = p_tenant_id) then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;
  v_actor := core.package_audit_actor(p_actor_id);
  if p_enabled then
    perform core.assert_module_enableable(p_tenant_id, p_module);
  end if;
  perform core.lock_tenant_modules(p_tenant_id);
  if not core.is_package_managed(p_tenant_id)
     and exists (select 1 from core.tenant_modules where tenant_id = p_tenant_id and is_enabled) then
    raise exception 'tenant_not_package_managed: adopt the tenant first (core.adopt_tenant_into_package)' using errcode = 'P0001';
  end if;
  select is_enabled into v_before from core.tenant_module_overrides where tenant_id = p_tenant_id and module = p_module;

  if p_enabled is null then
    -- clearing an override (row removal; the module then follows the packages)
    delete from core.tenant_module_overrides where tenant_id = p_tenant_id and module = p_module;
  else
    insert into core.tenant_module_overrides (tenant_id, module, is_enabled, reason)
    values (p_tenant_id, p_module, p_enabled, p_reason)
    on conflict (tenant_id, module) do update set is_enabled = excluded.is_enabled, reason = excluded.reason;
  end if;

  v_result := core.sync_tenant_modules(p_tenant_id);

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (p_tenant_id, v_actor, case when v_actor is null then 'system' else 'user' end,
          'core', 'tenant_module_override', p_module::text, case when p_enabled is null then 'clear' else 'set' end,
          jsonb_build_object('is_enabled', v_before), jsonb_build_object('is_enabled', p_enabled),
          jsonb_build_object('sync', v_result, 'reason', p_reason));
  return v_result;
end;
$$;

-- Converts a tenant written the old way into a package-managed one with ZERO
-- access change: the package plus compensating overrides (add-ons for modules
-- enabled outside it, opt-outs for package modules not enabled today). Used by
-- this migration's back-fill and for tenants created later by seed / legacy
-- scripts. Idempotent: an already-managed tenant is refused.
create or replace function core.adopt_tenant_into_package(p_tenant_id uuid, p_package_code text, p_actor_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = core, audit, public as $$
declare
  v_version int;
  v_result jsonb;
  v_actor uuid;
begin
  if p_tenant_id is null or p_package_code is null then
    raise exception 'invalid_argument: tenant and package are required' using errcode = '22004';
  end if;
  v_actor := core.package_audit_actor(p_actor_id);
  perform core.lock_tenant_modules(p_tenant_id);
  if core.is_package_managed(p_tenant_id) then
    raise exception 'tenant_already_package_managed' using errcode = 'P0001';
  end if;
  select version into v_version from core.packages where code = p_package_code and lifecycle_status in ('beta', 'ga');
  if v_version is null then
    raise exception 'package_not_available: %', p_package_code using errcode = 'P0002';
  end if;

  insert into core.tenant_packages (tenant_id, package_code, package_version)
  values (p_tenant_id, p_package_code, v_version);

  insert into core.tenant_module_overrides (tenant_id, module, is_enabled, reason)
  select tm.tenant_id, tm.module, true, 'adopted: enabled before packages'
    from core.tenant_modules tm
   where tm.tenant_id = p_tenant_id and tm.is_enabled
     and tm.module not in (select module from core.package_modules where package_code = p_package_code);

  insert into core.tenant_module_overrides (tenant_id, module, is_enabled, reason)
  select p_tenant_id, pm.module, false, 'adopted: not enabled before packages'
    from core.package_modules pm
   where pm.package_code = p_package_code
     and not exists (select 1 from core.tenant_modules tm
                      where tm.tenant_id = p_tenant_id and tm.module = pm.module and tm.is_enabled);

  v_result := core.sync_tenant_modules(p_tenant_id);
  if v_result <> '{"enabled": [], "disabled": []}'::jsonb then
    raise exception 'adopt would change module access: %', v_result using errcode = 'P0001';
  end if;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, after, metadata)
  values (p_tenant_id, v_actor, case when v_actor is null then 'system' else 'user' end,
          'core', 'tenant_package', p_package_code, 'adopt',
          jsonb_build_object('status', 'active'), jsonb_build_object('sync', v_result));
  return v_result;
end;
$$;

revoke all on function core.desired_tenant_modules(uuid) from public, anon, authenticated;
revoke all on function core.is_package_managed(uuid) from public, anon, authenticated;
revoke all on function core.lock_tenant_modules(uuid) from public, anon, authenticated;
revoke all on function core.package_audit_actor(uuid) from public, anon, authenticated;
revoke all on function core.assert_module_enableable(uuid, core.module_code) from public, anon, authenticated;
revoke all on function core.sync_tenant_modules(uuid) from public, anon, authenticated;
revoke all on function core.set_tenant_package(uuid, text, boolean, uuid) from public, anon, authenticated;
revoke all on function core.set_tenant_module_override(uuid, core.module_code, boolean, text, uuid) from public, anon, authenticated;
revoke all on function core.adopt_tenant_into_package(uuid, text, uuid) from public, anon, authenticated;
grant execute on function core.desired_tenant_modules(uuid) to service_role;
grant execute on function core.sync_tenant_modules(uuid) to service_role;
grant execute on function core.set_tenant_package(uuid, text, boolean, uuid) to service_role;
grant execute on function core.set_tenant_module_override(uuid, core.module_code, boolean, text, uuid) to service_role;
grant execute on function core.adopt_tenant_into_package(uuid, text, uuid) to service_role;

-- --- api facade -------------------------------------------------------------------
create view api.my_tenant_packages with (security_invoker = true) as
select tp.tenant_id, tp.package_code, p.name_ja, p.name_en, tp.package_version, tp.status, tp.added_at, p.sort_order
  from core.tenant_packages tp
  join core.packages p on p.code = tp.package_code;
comment on view api.my_tenant_packages is
  'Packages of the tenants the caller is a member of (RLS on core.tenant_packages). For navigation (task P4) and the account screen. security_invoker.';
grant select on api.my_tenant_packages to authenticated;
revoke all on api.my_tenant_packages from anon, public;

-- service-role wrappers for the provisioning Edge Function (ADR 0008: no SECURITY DEFINER in api)
create or replace function api.set_tenant_package(p_tenant_id uuid, p_package_code text, p_active boolean, p_actor_id uuid default null)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.set_tenant_package(p_tenant_id, p_package_code, p_active, p_actor_id);
$$;
create or replace function api.set_tenant_module_override(p_tenant_id uuid, p_module core.module_code, p_enabled boolean, p_reason text default null, p_actor_id uuid default null)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.set_tenant_module_override(p_tenant_id, p_module, p_enabled, p_reason, p_actor_id);
$$;
revoke all on function api.set_tenant_package(uuid, text, boolean, uuid) from public, anon, authenticated;
revoke all on function api.set_tenant_module_override(uuid, core.module_code, boolean, text, uuid) from public, anon, authenticated;
grant execute on function api.set_tenant_package(uuid, text, boolean, uuid) to service_role;
grant execute on function api.set_tenant_module_override(uuid, core.module_code, boolean, text, uuid) to service_role;

-- --- seed: the Cafe package (template v3) ---------------------------------------
insert into core.packages (code, name_ja, name_en, description, version, lifecycle_status, sort_order) values
  ('cafe', 'ORUWA Cafe', 'ORUWA Cafe', 'Cafe and restaurant operations: shifts, inventory and purchasing, recipes, HACCP checks, issues & handover, weekly review.', 3, 'ga', 10);
insert into core.package_modules (package_code, module, sort_order) values
  ('cafe', 'core', 0), ('cafe', 'workforce', 10), ('cafe', 'inventory', 20),
  ('cafe', 'operations', 30), ('cafe', 'issues', 40);

-- --- back-fill existing tenants, with zero access change (adopt asserts it per tenant) ---
do $$
declare t uuid;
begin
  for t in select distinct tm.tenant_id from core.tenant_modules tm order by 1 loop
    perform core.adopt_tenant_into_package(t, 'cafe');
  end loop;
end $$;

-- ============================================================================
-- Rollback (Cloud DEV safe: tenant_modules keeps its last synced state):
--   drop view if exists api.my_tenant_packages;
--   drop function if exists api.set_tenant_package(uuid, text, boolean, uuid);
--   drop function if exists api.set_tenant_module_override(uuid, core.module_code, boolean, text, uuid);
--   drop function if exists core.adopt_tenant_into_package(uuid, text, uuid);
--   drop function if exists core.set_tenant_module_override(uuid, core.module_code, boolean, text, uuid);
--   drop function if exists core.set_tenant_package(uuid, text, boolean, uuid);
--   drop function if exists core.assert_module_enableable(uuid, core.module_code);
--   drop function if exists core.sync_tenant_modules(uuid);
--   drop function if exists core.package_audit_actor(uuid);
--   drop function if exists core.lock_tenant_modules(uuid);
--   drop function if exists core.is_package_managed(uuid);
--   drop function if exists core.desired_tenant_modules(uuid);
--   drop table if exists core.tenant_module_overrides;
--   drop table if exists core.tenant_packages;
--   drop table if exists core.package_modules;
--   drop table if exists core.packages;
-- ============================================================================
