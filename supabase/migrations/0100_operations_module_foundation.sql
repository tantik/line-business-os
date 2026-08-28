-- ============================================================================
-- 0100  Operations module — foundation slice (Cafe v2.2 WP1-A)
-- ----------------------------------------------------------------------------
-- FIRST implementation slice of WP1 Operations, per:
--   * product scope  docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md
--     (D1..D5, §9 module-access requirement, §14 "first PR is foundation-oriented")
--   * technical design docs/ai/CAFE_V2_2_WP1_A_OPERATIONS_TECHNICAL_DESIGN_2026-08-28.md
--     (independent-review PASS WITH REQUIRED FIXES, 2026-08-28 — fixes folded in)
--
-- SCOPE OF THIS MIGRATION (deliberately minimal — design §"First implementation slice"):
--   * `operations` schema + the 4 domain enums (only `response_type` is used
--     by this slice's tables; the other 3 are created now so slice 2 does not
--     have to ALTER anything).
--   * `operations.checklist_templates` + `operations.checklist_items` ONLY.
--     No task_schedules / task_instances / item_responses / task_exceptions,
--     no recurrence view, no write RPCs — those are slice 2 (design §Q, 0101).
--   * The three-layer security contract from the Module Access Security
--     Remediation mission, applied from day one:
--         core.has_module_access(tenant_id, 'operations')
--       AND core.has_permission[_in_tenant](tenant_id, '<key>'[, location_id])
--       AND <domain rule>
--   * 4 generic permission keys + role seed (owner/admin/manager/employee).
--   * 2 `api.*` security_invoker read views. `operations` stays OUT of the
--     PostgREST exposed schemas (supabase/config.toml unchanged) — tenant-
--     facing reads go only through `api.*`.
--
-- GENERIC vs CAFE (D3/D5): nothing in this migration mentions HACCP, hygiene,
-- opening, closing, or temperature. `category` is free `text`. Cafe HACCP
-- preset rows are a SEPARATE, later, deferred migration (design §P), never
-- part of the generic `operations` schema.
--
-- NO WORKFORCE DEPENDENCY (scope §8): every actor column references
-- core.users(id), never workforce.employees. Operations works with the
-- Workforce module OFF.
--
-- HISTORY IS NOT DESTRUCTIBLE BY CONFIG (design P1-1): checklist_items ->
-- checklist_templates FK is ON DELETE RESTRICT, not CASCADE. Retire a
-- template/item via is_active = false. The only cascade path is
-- core.tenants ON DELETE CASCADE (whole-tenant offboarding).
--
-- Rollback:
--   drop view if exists api.operations_template_items;
--   drop view if exists api.operations_templates;
--   drop table if exists operations.checklist_items;
--   drop table if exists operations.checklist_templates;
--   drop type if exists operations.recurrence_kind;
--   drop type if exists operations.exception_status;
--   drop type if exists operations.instance_status;
--   drop type if exists operations.response_type;
--   drop schema if exists operations;
--   delete from core.role_permissions where permission_key like 'operations.%';
--   delete from core.permissions where key like 'operations.%';
--   (0099's enum value cannot be dropped — harmless if left.)
-- Purely additive; no existing object is modified; no data is deleted.
-- ============================================================================

create schema if not exists operations;
comment on schema operations is
  'Generic, reusable operational-execution module: what must be done at a location, was it done, what was the result, does it need a Manager. Vertical-agnostic (Cafe HACCP is presets on top, not in this schema).';

-- --- Enums -----------------------------------------------------------------
-- Closed vocabularies, not a form builder (design §F/§12). All 4 created now
-- so slice 2 (0101) adds tables without touching a type.
do $$ begin
  create type operations.response_type as enum ('boolean', 'numeric', 'text');
exception when duplicate_object then null; end $$;

do $$ begin
  create type operations.instance_status as enum ('pending', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type operations.exception_status as enum ('open', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type operations.recurrence_kind as enum ('daily', 'weekdays');
exception when duplicate_object then null; end $$;

comment on type operations.response_type is
  'Structured response vocabulary for a checklist item. Fixed 3-value set — numeric is stored as numeric, never free text (scope §6). Adding ''photo'' later (D2) is an additive ALTER TYPE + a child table, not blocked by this design.';

-- --- operations.checklist_templates ---------------------------------------
-- Reusable operational template / checklist. location_id NULL = tenant-wide
-- (visible to every location, like workforce.recipes). `category` is a
-- free-text organising label supplied by the Manager or by preset content —
-- never an enum, never a code branch.
create table if not exists operations.checklist_templates (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  location_id  uuid references core.locations(id) on delete cascade,
  name         text not null,
  category     text,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- FK target for checklist_items' composite (tenant_id, template_id) FK.
  constraint operations_checklist_templates_tenant_id_id_key unique (tenant_id, id),
  -- location, when set, must belong to the same tenant.
  constraint operations_checklist_templates_location_fkey
    foreign key (tenant_id, location_id) references core.locations(tenant_id, id)
);
create index if not exists operations_checklist_templates_tenant_idx
  on operations.checklist_templates(tenant_id, location_id);
comment on table operations.checklist_templates is
  'Reusable operational template/checklist. location_id NULL = tenant-wide. `category` is free text (e.g. Opening/Closing/Cleaning) — DATA, not an enum. Retire via is_active = false; never hard-deleted while history references it (design P1-1).';

-- --- operations.checklist_items -----------------------------------------
-- The individual checks inside a template. response_type selects which
-- response column a future response row (slice 2) may use. numeric_min/max
-- define the acceptable range for a numeric check (scope §6). is_critical
-- drives D4 severity when a future exception is derived. ON DELETE RESTRICT
-- to the template — see header (design P1-1).
create table if not exists operations.checklist_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  template_id   uuid not null,
  label         text not null,
  response_type operations.response_type not null,
  is_critical   boolean not null default false,
  is_required   boolean not null default true,
  is_active     boolean not null default true,
  numeric_min   numeric,
  numeric_max   numeric,
  numeric_unit  text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint operations_checklist_items_tenant_id_id_key unique (tenant_id, id),
  constraint operations_checklist_items_template_fkey
    foreign key (tenant_id, template_id)
    references operations.checklist_templates(tenant_id, id) on delete restrict,
  constraint operations_checklist_items_numeric_range_chk
    check (
      response_type <> 'numeric'
      or numeric_min is null
      or numeric_max is null
      or numeric_min <= numeric_max
    ),
  -- numeric bounds only make sense for a numeric item.
  constraint operations_checklist_items_numeric_only_chk
    check (
      response_type = 'numeric'
      or (numeric_min is null and numeric_max is null and numeric_unit is null)
    )
);
create index if not exists operations_checklist_items_template_idx
  on operations.checklist_items(tenant_id, template_id, sort_order);
comment on table operations.checklist_items is
  'Checks inside a checklist_template. response_type in (boolean,numeric,text) — a closed vocabulary, not a form builder. numeric_min/max = acceptable range (scope §6). is_critical drives D4 severity. Retire via is_active = false.';

-- --- updated_at triggers -------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'operations.checklist_templates', 'operations.checklist_items'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on %s; '
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t, t);
  end loop;
end $$;

-- --- Permission catalog ------------------------------------------------
-- 4 generic keys, module = 'operations'. Manager/Staff split (scope §4/§5):
--   template.manage    -> configure templates/items/schedules (Manager)
--   task.read          -> see expected tasks / instances / responses (all)
--   task.execute       -> record responses / complete a task / report a problem (Staff)
--   exception.resolve  -> resolve exceptions / record verification (Manager)
insert into core.permissions (key, module, description) values
  ('operations.template.manage',  'operations', 'Create and edit operational templates, checklist items, and schedules'),
  ('operations.task.read',        'operations', 'View operational tasks, checklists, and recorded results'),
  ('operations.task.execute',     'operations', 'Record checklist responses, complete an operational task, report a problem'),
  ('operations.exception.resolve','operations', 'Resolve operational exceptions and record Manager verification')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Role -> permission seed. owner/admin/manager get everything; employee gets
-- read + execute only (no config, no exception resolution).
do $$
declare
  r_owner   uuid := '00000000-0000-0000-0000-000000000003';
  r_admin   uuid := '00000000-0000-0000-0000-000000000004';
  r_manager uuid := '00000000-0000-0000-0000-000000000005';
  r_emp     uuid := '00000000-0000-0000-0000-000000000006';
begin
  insert into core.role_permissions (role_id, permission_key) values
    (r_owner,   'operations.template.manage'),
    (r_owner,   'operations.task.read'),
    (r_owner,   'operations.task.execute'),
    (r_owner,   'operations.exception.resolve'),
    (r_admin,   'operations.template.manage'),
    (r_admin,   'operations.task.read'),
    (r_admin,   'operations.task.execute'),
    (r_admin,   'operations.exception.resolve'),
    (r_manager, 'operations.template.manage'),
    (r_manager, 'operations.task.read'),
    (r_manager, 'operations.task.execute'),
    (r_manager, 'operations.exception.resolve'),
    (r_emp,     'operations.task.read'),
    (r_emp,     'operations.task.execute')
  on conflict do nothing;
end $$;

-- ============================================================================
-- RLS  — module access AND permission AND domain rule (never one without the
--        others). tenant_id in every predicate comes from the row being
--        checked, never a session GUC or client value.
-- ============================================================================
alter table operations.checklist_templates enable row level security;
alter table operations.checklist_items     enable row level security;

-- checklist_templates location model (design §D, hardened per review P2-3):
--   * tenant-wide template (location_id IS NULL): visible to / writable by a
--     holder of the permission anywhere in the tenant (has_permission_in_tenant).
--   * location-scoped template (location_id NOT NULL): visible to / writable
--     by a holder of the permission AT THAT LOCATION only — a tenant-wide
--     assignment (role_assignments.location_id IS NULL) matches every
--     location via core.has_permission's own semantics; a location-scoped
--     assignment matches only its own location. This is a REAL location
--     boundary, not soft visibility.
-- Read: task.read OR template.manage. Write: template.manage.
drop policy if exists operations_templates_select on operations.checklist_templates;
create policy operations_templates_select on operations.checklist_templates
  for select using (
    core.has_module_access(tenant_id, 'operations')
    and (
      (location_id is null and (
        core.has_permission_in_tenant(tenant_id, 'operations.task.read')
        or core.has_permission_in_tenant(tenant_id, 'operations.template.manage')
      ))
      or (location_id is not null and (
        core.has_permission(tenant_id, 'operations.task.read', location_id)
        or core.has_permission(tenant_id, 'operations.template.manage', location_id)
      ))
    )
  );

drop policy if exists operations_templates_write on operations.checklist_templates;
create policy operations_templates_write on operations.checklist_templates
  for all using (
    core.has_module_access(tenant_id, 'operations')
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'operations.template.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'operations.template.manage', location_id))
    )
  ) with check (
    core.has_module_access(tenant_id, 'operations')
    and (
      (location_id is null and core.has_permission_in_tenant(tenant_id, 'operations.template.manage'))
      or (location_id is not null and core.has_permission(tenant_id, 'operations.template.manage', location_id))
    )
  );

-- checklist_items: visibility/manage mirrors the parent template exactly, by
-- looking the parent up by the composite (tenant_id, template_id). A forged
-- template_id from another tenant cannot resolve (composite FK + this join
-- both key on the item's own tenant_id).
create or replace function operations.can_read_template(p_tenant_id uuid, p_template_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from operations.checklist_templates t
    where t.tenant_id = p_tenant_id
      and t.id = p_template_id
      and (
        (t.location_id is null and (
          core.has_permission_in_tenant(t.tenant_id, 'operations.task.read')
          or core.has_permission_in_tenant(t.tenant_id, 'operations.template.manage')
        ))
        or (t.location_id is not null and (
          core.has_permission(t.tenant_id, 'operations.task.read', t.location_id)
          or core.has_permission(t.tenant_id, 'operations.template.manage', t.location_id)
        ))
      )
  );
$$;
comment on function operations.can_read_template(uuid, uuid) is
  'Mirrors operations_templates_select for a parent template looked up by (tenant_id, id). Plain STABLE SQL — performs explicit core.has_permission* checks keyed off the looked-up template''s own tenant_id/location_id, so it needs no elevated privilege (same posture as workforce.can_manage_recipe, 0022).';

create or replace function operations.can_manage_template(p_tenant_id uuid, p_template_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from operations.checklist_templates t
    where t.tenant_id = p_tenant_id
      and t.id = p_template_id
      and (
        (t.location_id is null and core.has_permission_in_tenant(t.tenant_id, 'operations.template.manage'))
        or (t.location_id is not null and core.has_permission(t.tenant_id, 'operations.template.manage', t.location_id))
      )
  );
$$;
comment on function operations.can_manage_template(uuid, uuid) is
  'Mirrors operations_templates_write for a parent template looked up by (tenant_id, id). Plain STABLE SQL, no elevated privilege.';

revoke all on function operations.can_read_template(uuid, uuid) from public;
revoke all on function operations.can_manage_template(uuid, uuid) from public;
grant execute on function operations.can_read_template(uuid, uuid) to authenticated;
grant execute on function operations.can_manage_template(uuid, uuid) to authenticated;

-- checklist_items: visibility/manage mirrors the parent template exactly, by
-- looking the parent up by the composite (tenant_id, template_id). A forged
-- template_id from another tenant cannot resolve (the composite FK rejects
-- the write, and the helper keys on the item's own tenant_id).
drop policy if exists operations_items_select on operations.checklist_items;
create policy operations_items_select on operations.checklist_items
  for select using (
    core.has_module_access(tenant_id, 'operations')
    and operations.can_read_template(tenant_id, template_id)
  );

drop policy if exists operations_items_write on operations.checklist_items;
create policy operations_items_write on operations.checklist_items
  for all using (
    core.has_module_access(tenant_id, 'operations')
    and operations.can_manage_template(tenant_id, template_id)
  ) with check (
    core.has_module_access(tenant_id, 'operations')
    and operations.can_manage_template(tenant_id, template_id)
  );

-- ============================================================================
-- api.* read facade — security_invoker views. `operations` stays unexposed
-- to PostgREST; these are the only tenant-facing read surface for this slice.
-- ============================================================================
create or replace view api.operations_templates
  with (security_invoker = true) as
select
  t.id as template_id,
  t.tenant_id,
  t.location_id,
  t.name,
  t.category,
  t.description,
  t.is_active,
  t.created_at,
  t.updated_at
from operations.checklist_templates t;

comment on view api.operations_templates is
  'Operational checklist templates the caller may see (operations module ON + operations.task.read/template.manage via RLS). security_invoker view; no created_by/updated_by, no raw user ids.';

create or replace view api.operations_template_items
  with (security_invoker = true) as
select
  i.id as item_id,
  i.tenant_id,
  i.template_id,
  i.label,
  i.response_type,
  i.is_critical,
  i.is_required,
  i.is_active,
  i.numeric_min,
  i.numeric_max,
  i.numeric_unit,
  i.sort_order,
  i.created_at,
  i.updated_at
from operations.checklist_items i;

comment on view api.operations_template_items is
  'Checklist items for templates the caller may see (visibility mirrors api.operations_templates via RLS). security_invoker view.';

-- ============================================================================
-- Grants
--   * USAGE on schema operations + SELECT on the 2 base tables: required for
--     the security_invoker views' RLS to engage as the caller (mirrors
--     0017/0023). SELECT only — Operations writes go through the apps/api
--     service-role path (slice 2 may add api.* RPCs); RLS write policies
--     above are defense-in-depth.
--   * anon/public: explicit fail-closed revoke.
-- ============================================================================
grant usage on schema operations to authenticated;
grant select on operations.checklist_templates to authenticated;
grant select on operations.checklist_items to authenticated;

grant select on api.operations_templates to authenticated;
grant select on api.operations_template_items to authenticated;

revoke all on api.operations_templates from anon, public;
revoke all on api.operations_template_items from anon, public;
