-- ============================================================================
-- 0031  Workforce Cafe v0.1: Server Action write facade (Slice 1C)
-- ----------------------------------------------------------------------------
-- 0030's read facade only granted SELECT on the 4 new `api` views, and
-- `workforce` itself is (deliberately, per supabase/config.toml) not in
-- PostgREST's exposed-schemas list (`schemas = ["public", "api"]`). That means
-- 0024-0029's direct INSERT/UPDATE grants on `workforce.*` base tables --
-- opened specifically so a later slice's Server Actions could write "directly
-- as authenticated" -- are structurally unreachable from apps/web's
-- supabase-js client: PostgREST only ever proxies `public`/`api`. This
-- migration is that later slice's write path. Purely additive: no RLS policy
-- (`using`/`with check`) predicate anywhere is changed, no existing migration
-- file is edited, no base-table grant from 0024-0029 is touched.
--
-- Four additions:
--   1. INSERT/UPDATE grants on the 4 existing 0030 views (they are already
--      simple, single-table, key-preserving views, so they were structurally
--      auto-updatable in Postgres from the start -- they just never had a
--      grant beyond SELECT). Table-level privilege on the VIEW is what
--      Postgres checks for DML through an auto-updatable view; the RLS
--      policies on the underlying base tables (0026/0027/0028, unchanged)
--      remain the actual authorization boundary once that grant exists.
--   2. `api.workforce_employee_line_links`: a new READ-ONLY view. Deliberately
--      excludes `line_user_id_encrypted`/`line_user_id_hash` (same "no PII in
--      views" rule 0023 established for `name_encrypted`/`name_hash`) --
--      writes to this table go exclusively through the two SECURITY INVOKER
--      functions below, never through this view or any other DML surface.
--   3. `api.bind_workforce_employee_line_user` / `..._unbind...`: SECURITY
--      INVOKER (NOT DEFINER) functions in `api` -- the one schema PostgREST
--      exposes RPCs from. Being SECURITY INVOKER means they run with the
--      calling role's own privileges and the calling user's RLS context,
--      exactly like ad hoc SQL from that role (same reasoning already used
--      for workforce.is_own_employee, 0027) -- `wf_employee_line_links_manage`
--      (workforce.staff.manage, unchanged) is what actually decides whether
--      the write succeeds, not the function. The functions exist only because
--      an updatable view cannot accept `line_user_id_encrypted`/`_hash` without
--      exposing those PII columns for SELECT too; a function lets the Server
--      Action pass already-encrypted/hashed bytes in without ever exposing
--      them for read. bind atomically deactivates any existing active
--      binding for the employee, then inserts the new one, inside the
--      function's single implicit transaction (fixes the non-atomic
--      two-request race a plain two-step client-side rebind would have).
--   4. `api.workforce_staff_manage`: a new READ+WRITE view over
--      `workforce.employees`, gated entirely by the existing
--      `wf_employees_staff_read` / `wf_employees_staff_manage` RLS (manager/
--      owner/admin only -- no `employee` system role holds either
--      permission, per 0020). Exposes `name_encrypted`/`name_hash` as opaque
--      bytes/text (never decrypted in SQL) so a manager-only Server Action
--      helper can decrypt server-side (`@line-os/db/crypto` + PII env) and a
--      manager can write a new encrypted name -- but this view itself never
--      returns a plaintext name, matching 0023's "no PII in views" rule.
--      Deliberately excludes `user_id`/`created_by`/`updated_by` (no raw user
--      ids in any view, per 0023/0030's precedent); linking an employee row
--      to a `core.users` login is out of scope for this slice.
--   Plus: `workforce.shift_requests.decided_at` (new nullable column) and a
--   plain (non-DEFINER) BEFORE UPDATE trigger that stamps `decided_by`/
--   `decided_at` server-side whenever `status` transitions away from
--   'pending'. This is what lets `decideCorrectionRequest` record who decided
--   without the client ever supplying `decided_by` directly (never trusted
--   from the client) and without `api.workforce_shift_requests` (0030,
--   unedited) exposing that column at all.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Write grants on the 4 existing 0030 views
-- ----------------------------------------------------------------------------
grant insert, update on api.workforce_shift_types to authenticated;
grant insert, update on api.workforce_shift_assignments to authenticated;
grant insert, update on api.workforce_shift_requests to authenticated;
grant insert, update on api.workforce_attendance to authenticated;

-- ----------------------------------------------------------------------------
-- 2. api.workforce_employee_line_links -- read-only, no PII columns
-- ----------------------------------------------------------------------------
create view api.workforce_employee_line_links
  with (security_invoker = true) as
select
  l.id as link_id,
  l.tenant_id,
  l.employee_id,
  l.is_active,
  l.linked_at,
  l.created_at,
  l.updated_at
from workforce.employee_line_links l;

comment on view api.workforce_employee_line_links is
  'LINE binding status per employee, relying entirely on wf_employee_line_links_manage RLS (workforce.staff.manage) for visibility. No line_user_id_encrypted/line_user_id_hash exposed -- writes go through api.bind_workforce_employee_line_user / api.unbind_workforce_employee_line_user only. security_invoker view.';

grant select on api.workforce_employee_line_links to authenticated;
revoke all on api.workforce_employee_line_links from anon, public;

-- ----------------------------------------------------------------------------
-- 3. Bind/unbind RPCs -- SECURITY INVOKER, RLS is still the real boundary
-- ----------------------------------------------------------------------------
create or replace function api.bind_workforce_employee_line_user(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_line_user_id_encrypted bytea,
  p_line_user_id_hash text
)
returns table (
  link_id uuid,
  employee_id uuid,
  is_active boolean,
  linked_at timestamptz
)
language plpgsql
security invoker
set search_path = core, workforce, public
as $$
begin
  -- Deactivate any existing active binding for this employee first, inside
  -- this function's single implicit transaction (atomic -- no client-visible
  -- window where the employee has zero or two active bindings).
  update workforce.employee_line_links l
     set is_active = false
   where l.tenant_id = p_tenant_id
     and l.employee_id = p_employee_id
     and l.is_active = true;

  -- wf_employee_line_links_manage's WITH CHECK (workforce.staff.manage) is
  -- what actually authorizes this insert; a caller lacking that permission
  -- gets a real "row violates row-level security policy" error here (SECURITY
  -- INVOKER, not DEFINER), mapped by the app layer the same way as any other
  -- RLS denial.
  return query
  insert into workforce.employee_line_links as l (
    tenant_id, employee_id, line_user_id_encrypted, line_user_id_hash, is_active
  ) values (
    p_tenant_id, p_employee_id, p_line_user_id_encrypted, p_line_user_id_hash, true
  )
  returning l.id, l.employee_id, l.is_active, l.linked_at;
end;
$$;

comment on function api.bind_workforce_employee_line_user(uuid, uuid, bytea, text) is
  'Atomically deactivates any existing active LINE binding for p_employee_id and inserts a new active one from already-encrypted/hashed values prepared by the caller (never raw). SECURITY INVOKER: runs as the calling authenticated user, so wf_employee_line_links_manage RLS (workforce.staff.manage) is the real authorization boundary, not this function.';

revoke all on function api.bind_workforce_employee_line_user(uuid, uuid, bytea, text) from public;
grant execute on function api.bind_workforce_employee_line_user(uuid, uuid, bytea, text) to authenticated;

create or replace function api.unbind_workforce_employee_line_user(
  p_tenant_id uuid,
  p_employee_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = core, workforce, public
as $$
declare
  v_updated integer;
begin
  update workforce.employee_line_links l
     set is_active = false
   where l.tenant_id = p_tenant_id
     and l.employee_id = p_employee_id
     and l.is_active = true;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function api.unbind_workforce_employee_line_user(uuid, uuid) is
  'Deactivates the active LINE binding (if any) for p_employee_id; returns the number of rows updated (0 or 1). SECURITY INVOKER: wf_employee_line_links_manage RLS is the real authorization boundary.';

revoke all on function api.unbind_workforce_employee_line_user(uuid, uuid) from public;
grant execute on function api.unbind_workforce_employee_line_user(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. api.workforce_staff_manage -- manager-only read+write, PII stays opaque
-- ----------------------------------------------------------------------------
create view api.workforce_staff_manage
  with (security_invoker = true) as
select
  e.id as staff_id,
  e.tenant_id,
  e.location_id,
  e.name_encrypted,
  e.name_hash,
  e.position_label,
  e.employment_type,
  e.is_active,
  e.created_at,
  e.updated_at
from workforce.employees e;

comment on view api.workforce_staff_manage is
  'Manager-only (wf_employees_staff_read / wf_employees_staff_manage RLS) read+write staff surface. name_encrypted/name_hash are opaque bytes/text here -- never decrypted in SQL; a manager-only Server Action helper decrypts server-side (@line-os/db/crypto). No user_id/created_by/updated_by (no raw user ids in any view). security_invoker view.';

grant select, insert, update on api.workforce_staff_manage to authenticated;
revoke all on api.workforce_staff_manage from anon, public;

-- ----------------------------------------------------------------------------
-- 5. workforce.shift_requests.decided_at + server-stamped decision trigger
-- ----------------------------------------------------------------------------
alter table workforce.shift_requests
  add column if not exists decided_at timestamptz;

comment on column workforce.shift_requests.decided_at is
  'Server-stamped (workforce.stamp_shift_request_decision trigger) when status transitions away from pending. Never client-writable.';

-- Plain trigger function (no SECURITY DEFINER, matches core.set_updated_at's
-- convention): runs as whichever role performs the UPDATE, so
-- core.current_user_id() resolves to that same session's caller. Fires
-- through api.workforce_shift_requests too, since simple/auto-updatable-view
-- DML rewrites to a real UPDATE on the base table.
create or replace function workforce.stamp_shift_request_decision()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' then
    new.decided_by := core.current_user_id();
    new.decided_at := now();
  end if;
  return new;
end;
$$;

comment on function workforce.stamp_shift_request_decision() is
  'BEFORE UPDATE trigger: stamps decided_by/decided_at with the calling user/now() the moment status first leaves pending. Plain (invoker) trigger function, not SECURITY DEFINER -- decided_by is never accepted from the client directly.';

drop trigger if exists stamp_shift_request_decision on workforce.shift_requests;
create trigger stamp_shift_request_decision
  before update on workforce.shift_requests
  for each row execute function workforce.stamp_shift_request_decision();
