-- ============================================================================
-- 0118  Issues & Handover module — domain foundation (Cafe v2.2 WP2, Slice A)
-- ----------------------------------------------------------------------------
-- FIRST implementation slice of WP2 Issues & Handover. Builds on 0117 (enum
-- value). Follows the `operations` module's conventions closely (0099-0101,
-- 0107, 0111, 0116): SECURITY INVOKER app-facing RPCs in the `api` schema,
-- core.has_module_access + core.has_permission[_in_tenant] two/three-layer
-- RLS gating, composite (tenant_id, id) unique + composite FKs, a guard
-- trigger enforcing field immutability post-insert, ON DELETE RESTRICT on
-- history-bearing FKs, no hard delete.
--
-- GENERIC, REUSABLE CAPABILITY (not Cafe-only, D3/D5 posture — mirrors
-- operations): models a structured operational problem ('issue') and
-- shift/team handover information ('handover') in ONE flat table, not a
-- chat/thread and not a polymorphic mega-table. `category` is a small closed
-- vocabulary (equipment/inventory/cleaning/facility/customer/operations/
-- other) generic enough for other future verticals (Salon/Clinic/Retail).
-- Cafe-specific presentation (labels/icons/ordering) is a future UI concern,
-- not schema.
--
-- NO WORKFORCE / OPERATIONS DEPENDENCY: every actor column references
-- core.users(id), never workforce.employees. `issues` has NO
-- core.module_dependencies row on operations or workforce and works with
-- either OFF. The optional `operations_exception_id` cross-link column
-- exists for a FUTURE integration slice — nothing in this migration writes
-- it; it is nullable and RESTRICT-FK'd so a linked operations exception can
-- never be silently orphaned.
--
-- HISTORY IS NOT DESTRUCTIBLE BY CONFIG: no hard delete, no DELETE RLS
-- policy at all. A row moves open -> acknowledged -> resolved; every prior
-- state transition is provenance, not deleted.
--
-- MODULE REGISTRATION folded into this same migration (unlike operations,
-- which needed the split 0099/0100 then a later 0111 registration because
-- `core.module_registry` did not exist yet in that lineage) — the registry
-- table already exists in `dev` (0107, applied), so there is no ordering
-- reason to defer it to a separate file here.
--
-- JUDGEMENT CALL — acknowledge/resolve both Manager-only in this MVP slice:
-- Staff self-acknowledge would be a plausible nice-to-have but adds a second
-- write-actor branch to RLS/RPCs for a UI affordance that does not yet
-- exist (no dashboard integration in this slice) — keeping both
-- acknowledge and resolve behind `issues.manage` (Manager-only) is the
-- simpler, still-correct choice per the mission brief's explicit default.
--
-- Rollback:
--   drop view if exists api.issues;
--   drop view if exists api.issues_open;
--   drop function if exists api.issues_resolve(uuid, uuid, text);
--   drop function if exists api.issues_acknowledge(uuid, uuid);
--   drop function if exists api.issues_create(uuid, uuid, text, text, text, text);
--   drop table if exists issues.issues;
--   drop schema if exists issues;
--   delete from core.module_registry where module = 'issues';
--   delete from core.role_permissions where permission_key like 'issues.%';
--   delete from core.permissions where key like 'issues.%';
--   (0117's enum value cannot be dropped — harmless if left.)
-- Purely additive; no existing object is modified; no data is deleted.
-- ============================================================================

create schema if not exists issues;
comment on schema issues is
  'Generic, reusable Issue & Handover capability: a structured operational problem (issue) or shift/team information (handover) that may need Manager attention. Vertical-agnostic, same posture as the operations schema.';

-- --- issues.issues ----------------------------------------------------------
create table if not exists issues.issues (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references core.tenants(id) on delete cascade,
  location_id             uuid not null,
  kind                    text not null check (kind in ('issue', 'handover')),
  category                text check (category in ('equipment', 'inventory', 'cleaning', 'facility', 'customer', 'operations', 'other')),
  severity                text check (severity in ('normal', 'important')),
  status                  text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  note                    text not null check (length(note) between 1 and 1000),
  business_date           date not null default current_date,
  reported_by             uuid not null references core.users(id),
  reported_by_role        text not null check (reported_by_role in ('staff', 'manager')),
  acknowledged_by         uuid references core.users(id),
  acknowledged_at         timestamptz,
  resolved_by             uuid references core.users(id),
  resolved_at             timestamptz,
  resolution_note         text,
  source                  text not null default 'manual' check (source in ('manual', 'operations')),
  operations_exception_id uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint issues_issues_tenant_id_id_key unique (tenant_id, id),
  constraint issues_issues_location_fkey
    foreign key (tenant_id, location_id) references core.locations(tenant_id, id),
  constraint issues_issues_operations_exception_fkey
    foreign key (tenant_id, operations_exception_id)
    references operations.task_exceptions(tenant_id, id) on delete restrict,
  -- severity is meaningful mainly for kind='issue'; a handover never carries one.
  constraint issues_issues_severity_kind_chk
    check (kind = 'issue' or severity is null),
  -- status transition coherence (mirrors task_exceptions/task_instances/staff_messages).
  constraint issues_issues_resolved_chk
    check ((status = 'resolved') = (resolved_at is not null)),
  constraint issues_issues_resolved_by_chk
    check (resolved_by is null or resolved_at is not null),
  constraint issues_issues_acknowledged_chk
    check ((status in ('acknowledged', 'resolved')) = (acknowledged_at is not null)),
  constraint issues_issues_acknowledged_by_chk
    check (acknowledged_by is null or acknowledged_at is not null)
);
create index if not exists issues_issues_tenant_location_idx
  on issues.issues (tenant_id, location_id, status);
create index if not exists issues_issues_business_date_idx
  on issues.issues (tenant_id, location_id, business_date);
create index if not exists issues_issues_operations_exception_idx
  on issues.issues (tenant_id, operations_exception_id) where operations_exception_id is not null;
comment on table issues.issues is
  'A structured operational problem (kind=issue) or shift/team handover note (kind=handover). Single flat table, no thread/chat, no polymorphic mega-table. Lifecycle open -> acknowledged -> resolved. Immutable after insert except status/acknowledged_*/resolved_*/resolution_note/updated_at (guard trigger). No hard delete.';
comment on column issues.issues.category is
  'Free but closed vocabulary, generic enough for any future vertical -- data, not a vertical-specific table.';
comment on column issues.issues.operations_exception_id is
  'Optional cross-link to operations.task_exceptions for a FUTURE integration slice. Nothing in this migration (or any RPC in it) writes this column. RESTRICT: a linked exception may not be silently orphaned.';
comment on column issues.issues.source is
  '''manual'' (default, Staff/Manager-authored) or ''operations'' (reserved for a future write path from an operations exception). Nothing in this slice writes ''operations''.';

create trigger set_updated_at
  before update on issues.issues
  for each row execute function core.set_updated_at();

-- --- Guard trigger: only status/acknowledge/resolve columns are mutable -----
create or replace function issues.guard_issue_update()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id <> old.tenant_id
     or new.location_id <> old.location_id
     or new.kind <> old.kind
     or new.category is distinct from old.category
     or new.severity is distinct from old.severity
     or new.note <> old.note
     or new.business_date <> old.business_date
     or new.reported_by <> old.reported_by
     or new.reported_by_role <> old.reported_by_role
     or new.source <> old.source
     or new.operations_exception_id is distinct from old.operations_exception_id
     or new.created_at <> old.created_at then
    raise exception 'issue_immutable_fields' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
comment on function issues.guard_issue_update() is
  'BEFORE UPDATE trigger: only status/acknowledged_by/acknowledged_at/resolved_by/resolved_at/resolution_note/updated_at may ever change after insert -- every other column is immutable. Mirrors workforce.guard_staff_message_update() (0090).';

create trigger guard_issue_update
  before update on issues.issues
  for each row execute function issues.guard_issue_update();

-- --- Permission catalog ------------------------------------------------------
insert into core.permissions (key, module, description) values
  ('issues.report', 'issues', 'Create an issue or handover note, and see the ones visible at the caller''s locations'),
  ('issues.manage', 'issues', 'Acknowledge and resolve issues/handovers')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Role -> permission seed. owner/admin/manager get both; employee gets
-- report only (matches operations' template.manage vs task.execute split).
do $$
declare
  r_owner   uuid := '00000000-0000-0000-0000-000000000003';
  r_admin   uuid := '00000000-0000-0000-0000-000000000004';
  r_manager uuid := '00000000-0000-0000-0000-000000000005';
  r_emp     uuid := '00000000-0000-0000-0000-000000000006';
begin
  insert into core.role_permissions (role_id, permission_key) values
    (r_owner,   'issues.report'),
    (r_owner,   'issues.manage'),
    (r_admin,   'issues.report'),
    (r_admin,   'issues.manage'),
    (r_manager, 'issues.report'),
    (r_manager, 'issues.manage'),
    (r_emp,     'issues.report')
  on conflict do nothing;
end $$;

-- ============================================================================
-- RLS — module access AND permission AND domain rule.
-- ============================================================================
alter table issues.issues enable row level security;

-- SELECT: anyone holding issues.report OR issues.manage at that location can
-- read -- both Staff and Manager need visibility (the whole point of the
-- feature). Location-scoping mirrors operations.task_exceptions_select
-- exactly via core.has_permission's own tenant-wide-vs-location-scoped
-- role-assignment semantics.
drop policy if exists issues_select on issues.issues;
create policy issues_select on issues.issues
  for select using (
    core.has_module_access(tenant_id, 'issues')
    and (
      core.has_permission(tenant_id, 'issues.report', location_id)
      or core.has_permission(tenant_id, 'issues.manage', location_id)
    )
  );

-- INSERT: requires issues.report at the target location_id; reported_by must
-- equal the caller; reported_by_role must match the actor's ACTUAL role,
-- derived the same way the role seed splits Manager (report + manage) from
-- Staff (report only) -- a caller holding issues.manage at this location must
-- report as 'manager', a caller who does not must report as 'staff'. This
-- blocks both directions of spoofing (Staff claiming 'manager', and equally a
-- Manager claiming 'staff').
drop policy if exists issues_insert on issues.issues;
create policy issues_insert on issues.issues
  for insert with check (
    core.has_module_access(tenant_id, 'issues')
    and core.has_permission(tenant_id, 'issues.report', location_id)
    and reported_by = core.current_user_id()
    and (
      (reported_by_role = 'manager' and core.has_permission(tenant_id, 'issues.manage', location_id))
      or (reported_by_role = 'staff' and not core.has_permission(tenant_id, 'issues.manage', location_id))
    )
  );

-- UPDATE (acknowledge/resolve): Manager-only in this MVP slice (judgement
-- call, see header) -- issues.manage at the row's location for both
-- transitions. Status-transition-specific validation (e.g. "not already
-- resolved") lives in the api.issues_acknowledge/issues_resolve RPCs, same
-- posture as api.operations_resolve_exception.
drop policy if exists issues_update on issues.issues;
create policy issues_update on issues.issues
  for update using (
    core.has_module_access(tenant_id, 'issues')
    and core.has_permission(tenant_id, 'issues.manage', location_id)
  ) with check (
    core.has_module_access(tenant_id, 'issues')
    and core.has_permission(tenant_id, 'issues.manage', location_id)
  );

-- No DELETE policy — no hard delete in the normal product workflow.

-- ============================================================================
-- Grants — base-table privileges the SECURITY INVOKER RPCs need to act as the
-- calling role. RLS remains the real authorization boundary.
-- ============================================================================
grant usage on schema issues to authenticated;
grant select, insert, update on issues.issues to authenticated;
revoke all on issues.issues from anon, public;

-- ============================================================================
-- api.* read facade — security_invoker views.
-- ============================================================================
create or replace view api.issues_open
  with (security_invoker = true) as
select
  i.id as issue_id,
  i.tenant_id,
  i.location_id,
  i.kind,
  i.category,
  i.severity,
  i.status,
  i.note,
  i.business_date,
  i.reported_by,
  i.reported_by_role,
  i.acknowledged_by,
  i.acknowledged_at,
  i.source,
  i.operations_exception_id,
  i.created_at,
  i.updated_at
from issues.issues i
where i.status in ('open', 'acknowledged');
comment on view api.issues_open is
  'Open + acknowledged issues/handovers -- the "current" feed (not yet resolved), the conceptual Manager Attention equivalent for this module. security_invoker; RLS on issues.issues is the real access gate.';

create or replace view api.issues
  with (security_invoker = true) as
select
  i.id as issue_id,
  i.tenant_id,
  i.location_id,
  i.kind,
  i.category,
  i.severity,
  i.status,
  i.note,
  i.business_date,
  i.reported_by,
  i.reported_by_role,
  i.acknowledged_by,
  i.acknowledged_at,
  i.resolved_by,
  i.resolved_at,
  i.resolution_note,
  i.source,
  i.operations_exception_id,
  i.created_at,
  i.updated_at
from issues.issues i;
comment on view api.issues is
  'Full issue/handover history including resolved rows, for history/list screens. Plain passthrough -- issues.issues RLS already scopes visibility correctly (mirrors api.workforce_staff_messages). security_invoker.';

grant select on api.issues_open to authenticated;
grant select on api.issues to authenticated;
revoke all on api.issues_open from anon, public;
revoke all on api.issues from anon, public;

-- ============================================================================
-- Write RPCs — SECURITY INVOKER. RLS is the real boundary; each RPC raises a
-- distinguishable error early on module-OFF / permission / input-shape
-- violations (same posture as the operations.* RPCs, e.g.
-- api.operations_report_problem / api.operations_resolve_exception).
-- ============================================================================

-- --- api.issues_create -------------------------------------------------------
create or replace function api.issues_create(
  p_tenant_id   uuid,
  p_location_id uuid,
  p_kind        text,
  p_note        text,
  p_category    text default null,
  p_severity    text default null
)
returns uuid
language plpgsql
security invoker
set search_path = api, issues, core, public
as $$
declare
  v_user uuid := core.current_user_id();
  v_role text;
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'issues_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'issues') then
    raise exception 'issues_module_disabled' using errcode = 'P0001';
  end if;

  if p_kind not in ('issue', 'handover') then
    raise exception 'issues_invalid_kind' using errcode = 'P0001';
  end if;
  if p_category is not null and p_category not in
      ('equipment', 'inventory', 'cleaning', 'facility', 'customer', 'operations', 'other') then
    raise exception 'issues_invalid_category' using errcode = 'P0001';
  end if;
  if p_severity is not null and p_severity not in ('normal', 'important') then
    raise exception 'issues_invalid_severity' using errcode = 'P0001';
  end if;
  if p_kind = 'handover' and p_severity is not null then
    raise exception 'issues_severity_not_applicable_to_handover' using errcode = 'P0001';
  end if;
  if p_note is null or length(p_note) < 1 or length(p_note) > 1000 then
    raise exception 'issues_invalid_note' using errcode = 'P0001';
  end if;

  if not core.has_permission(p_tenant_id, 'issues.report', p_location_id) then
    raise exception 'issues_permission_denied' using errcode = 'P0001';
  end if;

  -- Resolve the actor's role server-side -- never trust client-supplied
  -- identity/role (mirrors every operations.* write RPC).
  v_role := case
    when core.has_permission(p_tenant_id, 'issues.manage', p_location_id) then 'manager'
    else 'staff'
  end;

  insert into issues.issues
    (tenant_id, location_id, kind, category, severity, note, reported_by, reported_by_role, source)
  values
    (p_tenant_id, p_location_id, p_kind, p_category, p_severity, p_note, v_user, v_role, 'manual')
  returning id into v_id;

  return v_id;
end;
$$;
comment on function api.issues_create(uuid, uuid, text, text, text, text) is
  'Create an issue or handover note. Resolves reported_by/reported_by_role server-side from the authenticated actor (never client-supplied). Validates kind/category/severity against their allowed value sets with a clear error, ahead of the CHECK constraints. SECURITY INVOKER -- RLS on issues.issues is the real gate.';

revoke all on function api.issues_create(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function api.issues_create(uuid, uuid, text, text, text, text) to authenticated;

-- --- api.issues_acknowledge --------------------------------------------------
create or replace function api.issues_acknowledge(
  p_tenant_id uuid,
  p_issue_id  uuid
)
returns void
language plpgsql
security invoker
set search_path = api, issues, core, public
as $$
declare
  v_user        uuid := core.current_user_id();
  v_location_id uuid;
  v_status      text;
begin
  if v_user is null then
    raise exception 'issues_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'issues') then
    raise exception 'issues_module_disabled' using errcode = 'P0001';
  end if;

  select i.location_id, i.status into v_location_id, v_status
  from issues.issues i
  where i.tenant_id = p_tenant_id and i.id = p_issue_id;

  if v_location_id is null then
    raise exception 'issues_not_found' using errcode = 'P0002';
  end if;
  if not core.has_permission(p_tenant_id, 'issues.manage', v_location_id) then
    raise exception 'issues_permission_denied' using errcode = 'P0001';
  end if;
  if v_status <> 'open' then
    raise exception 'issues_not_open' using errcode = 'P0001';
  end if;

  update issues.issues i
    set status = 'acknowledged', acknowledged_by = v_user, acknowledged_at = now()
  where i.tenant_id = p_tenant_id and i.id = p_issue_id;
end;
$$;
comment on function api.issues_acknowledge(uuid, uuid) is
  'Acknowledge an open issue/handover. Manager-only in this MVP slice (requires issues.manage at the row''s location). SECURITY INVOKER.';

revoke all on function api.issues_acknowledge(uuid, uuid) from public, anon;
grant execute on function api.issues_acknowledge(uuid, uuid) to authenticated;

-- --- api.issues_resolve -------------------------------------------------------
create or replace function api.issues_resolve(
  p_tenant_id       uuid,
  p_issue_id        uuid,
  p_resolution_note text default null
)
returns void
language plpgsql
security invoker
set search_path = api, issues, core, public
as $$
declare
  v_user            uuid := core.current_user_id();
  v_location_id     uuid;
  v_status          text;
  v_acknowledged_at timestamptz;
begin
  if v_user is null then
    raise exception 'issues_no_auth_context' using errcode = 'P0001';
  end if;
  if not core.has_module_access(p_tenant_id, 'issues') then
    raise exception 'issues_module_disabled' using errcode = 'P0001';
  end if;

  select i.location_id, i.status, i.acknowledged_at
    into v_location_id, v_status, v_acknowledged_at
  from issues.issues i
  where i.tenant_id = p_tenant_id and i.id = p_issue_id;

  if v_location_id is null then
    raise exception 'issues_not_found' using errcode = 'P0002';
  end if;
  if not core.has_permission(p_tenant_id, 'issues.manage', v_location_id) then
    raise exception 'issues_permission_denied' using errcode = 'P0001';
  end if;
  if v_status = 'resolved' then
    raise exception 'issues_already_resolved' using errcode = 'P0001';
  end if;

  -- Resolving directly from 'open' auto-stamps acknowledged_* if it was never
  -- separately acknowledged (acknowledge is an optional nice-to-have, not a
  -- required step -- see header). Satisfies the acknowledged_chk coherence
  -- constraint (acknowledged_at set iff status in ('acknowledged','resolved')).
  update issues.issues i
    set status = 'resolved',
        resolved_by = v_user,
        resolved_at = now(),
        resolution_note = p_resolution_note,
        acknowledged_by = coalesce(i.acknowledged_by, v_user),
        acknowledged_at = coalesce(i.acknowledged_at, now())
  where i.tenant_id = p_tenant_id and i.id = p_issue_id;
end;
$$;
comment on function api.issues_resolve(uuid, uuid, text) is
  'Resolve an issue/handover. Requires issues.manage at the row''s location. Auto-stamps acknowledged_by/acknowledged_at if the row skipped an explicit acknowledge step. SECURITY INVOKER.';

revoke all on function api.issues_resolve(uuid, uuid, text) from public, anon;
grant execute on function api.issues_resolve(uuid, uuid, text) to authenticated;

-- ============================================================================
-- Module registration — core.module_registry (mirrors 0111; folded into this
-- migration, see header). Does NOT enable the module for any tenant: no
-- core.tenant_modules row is inserted. core.has_module_access (0093) remains
-- the canonical runtime Module-OFF gate.
-- ============================================================================
insert into core.module_registry (module, name, description, lifecycle_status, nav_route, nav_sort_order)
values (
  'issues',
  'Issues & Handover',
  'Structured operational problem reporting (issue) and shift/team handover notes (handover), vertical-agnostic. No dedicated page route yet -- lives inside a dashboard popup.',
  'beta',
  null,
  35
)
on conflict (module) do nothing;

-- No core.module_dependencies rows for 'issues' -- intentionally none (no
-- Workforce or Operations dependency, same posture as operations itself).
