-- ============================================================================
-- 0064  Workforce Cafe v2.1: Staff invitation/binding domain model
-- ----------------------------------------------------------------------------
-- STAFF_AUTH_IDENTITY_ARCHITECTURE_AUDIT, phase 3/4/5/7. Smallest DB state
-- needed to represent NOT INVITED / PENDING / ACCEPTED / EXPIRED / REVOKED
-- (section 6) plus an atomic, transaction-safe bind (section 7), without
-- reimplementing any of Supabase Auth's own token/crypto/expiry machinery
-- (section 1) -- the actual invite email, token, and password-setup flow are
-- 100% Supabase Auth Admin API (`inviteUserByEmail`/`listUsers`), issued only
-- from a new service_role-holding Supabase Edge Function (never apps/web,
-- never a base-table-level service_role grant here). This migration is the
-- audit-trail + binding-target row PLUS the one function that performs the
-- actual identity bind, atomically, once Supabase has already verified the
-- invited person's session.
--
-- Row lifecycle (workforce.employee_invitations.status):
--   pending  -- created when the Edge Function successfully issues (or
--              resends) a Supabase Auth invite/lookup for this employee.
--              `target_user_id` is ALWAYS a concrete, already-resolved
--              Supabase Auth user id at this point (never null) -- resolved
--              server-side by the Edge Function via inviteUserByEmail's own
--              response (new user) or an existing-user email lookup
--              (STAFF_AUTH_IDENTITY_ARCHITECTURE_AUDIT decision 8's
--              confirmed no-new-email in-app-banner path) -- never trusted
--              from browser input.
--   accepted -- set by api.accept_employee_invitation() (this migration),
--              the ONLY thing that ever sets workforce.employees.user_id via
--              this flow.
--   revoked  -- set directly by a Manager (workforce.staff.manage), plain
--              RLS UPDATE, no Edge Function / service_role involved -- this
--              is a local status change, not a Supabase Auth operation
--              (Supabase Auth has no "cancel a pending invite" primitive; the
--              underlying unconfirmed Auth user is simply left alone and can
--              no longer complete THIS invitation once revoked, since
--              acceptance re-checks status = 'pending').
--   (EXPIRED is a DERIVED state, not a stored one: `status = 'pending' and
--   expires_at < now()`. No background job marks rows expired -- the accept
--   RPC and every read path compute it live, so there is nothing to drift or
--   forget to run.)
--
-- expires_at: an independent, ORUWA-owned 7-day acceptance window, checked by
-- api.accept_employee_invitation() IN ADDITION to (not instead of) whatever
-- Supabase's own invite-link/OTP validity window is -- this repo's
-- supabase/config.toml sets no [auth] OTP/invite expiry override, so
-- Supabase's own token TTL is left at its platform default rather than
-- guessed at here; ORUWA's 7-day business-rule window is the one the Manager
-- UI displays and the one this migration can actually guarantee.
--
-- One 'pending' invitation per employee at a time (partial unique index):
-- "Resend" (Edge Function) reuses/refreshes the existing pending row instead
-- of inserting a second one; a fresh "Invite" is only offered by the Manager
-- UI once the prior row is accepted/revoked/(displayed as expired).
-- ============================================================================

create table workforce.employee_invitations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenants(id) on delete cascade,
  employee_id     uuid not null,
  target_user_id  uuid not null references core.users(id) on delete cascade,
  status          text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  invited_by      uuid references core.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '7 days'),
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  foreign key (tenant_id, employee_id)
    references workforce.employees(tenant_id, id) on delete cascade,
  check ((status = 'accepted') = (accepted_at is not null)),
  check ((status = 'revoked') = (revoked_at is not null))
);

create index workforce_employee_invitations_tenant_idx
  on workforce.employee_invitations (tenant_id, employee_id);
create index workforce_employee_invitations_target_user_idx
  on workforce.employee_invitations (target_user_id, status);

-- At most one PENDING invitation per employee at a time.
create unique index workforce_employee_invitations_one_pending_per_employee
  on workforce.employee_invitations (tenant_id, employee_id)
  where status = 'pending';

comment on table workforce.employee_invitations is
  'Audit-trail + binding-target row for Staff app access provisioning. Every actual Supabase Auth operation (invite email, token, expiry, password) happens in the invite-employee Edge Function via the Admin API -- this table never stores a token or password. target_user_id is always resolved server-side (never client-trusted) before a row is inserted.';
comment on column workforce.employee_invitations.target_user_id is
  'The Supabase Auth user id this invitation is FOR -- resolved server-side by the Edge Function (new user created by inviteUserByEmail, or an existing user found by email lookup). The accept RPC requires the caller''s own verified session (core.current_user_id()) to equal this value; it is never taken from client input.';
comment on column workforce.employee_invitations.expires_at is
  'ORUWA-owned 7-day acceptance window, independent of (in addition to) Supabase''s own invite-link/session validity. EXPIRED is a derived read-time state (pending AND expires_at < now()), never a stored status.';

drop trigger if exists set_updated_at on workforce.employee_invitations;
create trigger set_updated_at
  before update on workforce.employee_invitations
  for each row execute function core.set_updated_at();

alter table workforce.employee_invitations enable row level security;

-- SELECT: a Manager (workforce.staff.manage, tenant-wide check -- this table
-- has no location_id column, matching workforce.employee_line_links'
-- existing precedent, 0029) sees every invitation in their tenant; the
-- invited person sees their OWN rows (any status) regardless of tenant --
-- this is exactly what powers the no-new-email in-app "you have a pending
-- invitation" banner (decision 8) for an existing ORUWA user invited by a
-- second tenant.
create policy wf_employee_invitations_manager_read on workforce.employee_invitations
  for select
  using (core.has_permission_in_tenant(tenant_id, 'workforce.staff.manage'));

create policy wf_employee_invitations_self_read on workforce.employee_invitations
  for select
  using (target_user_id = core.current_user_id());

-- UPDATE: the ONLY direct-client write this table allows at all is a Manager
-- revoking their own tenant's still-pending invitation -- a plain local
-- status change, not a Supabase Auth operation, so it needs no
-- service_role/Edge Function involvement. Every other write (insert on
-- invite/resend, the accept transition) is performed by a service_role
-- caller (Edge Function) or by api.accept_employee_invitation() below
-- (SECURITY DEFINER) -- both bypass RLS by design, so there is deliberately
-- no INSERT policy and no 'accepted' UPDATE policy for `authenticated` here.
create policy wf_employee_invitations_manager_revoke on workforce.employee_invitations
  for update
  using (
    status = 'pending'
    and core.has_permission_in_tenant(tenant_id, 'workforce.staff.manage')
  )
  with check (
    status = 'revoked'
    and revoked_at is not null
  );

grant select, update on workforce.employee_invitations to authenticated;

-- --- api.accept_employee_invitation ------------------------------------------
-- The ONLY thing that ever sets workforce.employees.user_id via this flow.
-- SECURITY DEFINER (unlike this schema's other self-scope RPCs, which are
-- deliberately SECURITY INVOKER, e.g. workforce.is_own_employee, 0027): the
-- caller, at the moment they accept, holds NO role_assignment / tenant
-- membership / staff.manage permission in the target tenant yet -- that is
-- exactly what this function is establishing -- so it cannot rely on the
-- caller's own RLS the way is_own_employee does. Every value it trusts comes
-- from either core.current_user_id() (server-verified JWT claim, never
-- client input) or the invitation row itself (looked up by id + that same
-- verified user id + status/expiry, never by a client-supplied employee_id
-- or tenant_id). Runs as ONE implicit transaction: any failure partway
-- (row not found/wrong status/expired/already bound) raises and nothing
-- partial is left behind.
create or replace function workforce.accept_employee_invitation(
  p_invitation_id uuid
)
returns table (
  out_tenant_id uuid,
  out_employee_id uuid
)
language plpgsql
security definer
set search_path = core, workforce, public
as $$
declare
  v_uid uuid := core.current_user_id();
  v_inv workforce.employee_invitations%rowtype;
  v_employee_role_id uuid;
  v_location_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_inv
    from workforce.employee_invitations
   where id = p_invitation_id
     and target_user_id = v_uid
     and status = 'pending'
     and expires_at > now()
   for update;

  if not found then
    raise exception 'invitation_not_acceptable' using errcode = 'P0001';
  end if;

  -- Never silently rebind an employee already bound to a (possibly
  -- different) user_id -- covers the race where two invitations somehow
  -- targeted the same employee, and simple defense-in-depth generally.
  if exists (
    select 1 from workforce.employees e
     where e.tenant_id = v_inv.tenant_id and e.id = v_inv.employee_id and e.user_id is not null
  ) then
    raise exception 'employee_already_bound' using errcode = 'P0001';
  end if;

  -- 1. ensure core.users mirror row (id-only; no PII written here -- the
  --    employee's own encrypted contact fields already live on
  --    workforce.employees, and any core.users PII backfill is a separate,
  --    unrelated concern, same as onboard-write.ts's existing pattern).
  insert into core.users (id) values (v_uid)
  on conflict (id) do nothing;

  -- 2. ensure tenant membership (create active, or activate an 'invited' row
  --    -- mirrors onboard-write.ts's ONBOARD_WRITE_SQL.insertMembership /
  --    activateMembership pattern exactly).
  insert into core.tenant_memberships (tenant_id, user_id, status, invited_by)
    values (v_inv.tenant_id, v_uid, 'active', v_inv.invited_by)
  on conflict (tenant_id, user_id) do nothing;

  update core.tenant_memberships
     set status = 'active'
   where tenant_id = v_inv.tenant_id
     and user_id = v_uid
     and status = 'invited';

  -- 3. ensure the system `employee` role assignment, scoped to the
  --    employee's own location_id (NULL location_id is a distinct value for
  --    the unique index, so INSERT...WHERE NOT EXISTS is used, same reason
  --    onboard-write.ts's insertRoleAssignment does for the owner role).
  select id into v_employee_role_id
    from core.roles where tenant_id is null and key = 'employee';
  if v_employee_role_id is null then
    raise exception 'employee_role_missing' using errcode = 'P0001';
  end if;

  select location_id into v_location_id
    from workforce.employees where tenant_id = v_inv.tenant_id and id = v_inv.employee_id;

  insert into core.role_assignments (tenant_id, user_id, role_id, location_id)
  select v_inv.tenant_id, v_uid, v_employee_role_id, v_location_id
  where not exists (
    select 1 from core.role_assignments
     where tenant_id = v_inv.tenant_id and user_id = v_uid
       and role_id = v_employee_role_id
       and location_id is not distinct from v_location_id
  );

  -- 4. bind. The 0063 partial unique index (tenant_id, user_id) is the last
  --    line of defense if this same user_id is somehow already bound to a
  --    DIFFERENT employee in this tenant -- that raises a unique_violation
  --    here, which aborts this entire function (nothing partial persists).
  update workforce.employees
     set user_id = v_uid
   where tenant_id = v_inv.tenant_id
     and id = v_inv.employee_id
     and user_id is null;
  if not found then
    raise exception 'employee_already_bound' using errcode = 'P0001';
  end if;

  -- 5. mark accepted.
  update workforce.employee_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv.id;

  return query select v_inv.tenant_id, v_inv.employee_id;
end;
$$;

comment on function workforce.accept_employee_invitation(uuid) is
  'Atomically binds the caller''s own verified Auth identity (core.current_user_id()) to the employee named by a PENDING, non-expired invitation they are the target of: ensures core.users + active tenant membership + employee role assignment, then sets workforce.employees.user_id (only if still null) and marks the invitation accepted. SECURITY DEFINER because the caller holds no relevant permission yet -- that is exactly what this function is establishing -- so it cannot rely on invoker-side RLS the way this schema''s other self-scope functions do (workforce.is_own_employee, 0027); every trusted value instead comes from core.current_user_id() or the invitation row looked up by (id, that same user id, pending, unexpired), never from client-supplied tenant_id/employee_id. Lives outside the api schema per ADR 0008 (no SECURITY DEFINER object in api, reaffirmed by 0002/0005/0006/0009/0012''s own grant-surface tests) -- same shape as workforce.permanently_delete_employee (0056); api.accept_employee_invitation is its invoker-only passthrough. One statement-level transaction: any failure leaves nothing partial. Returns (out_tenant_id, out_employee_id) -- named to avoid a PL/pgSQL OUT-parameter/column ambiguity with tenant_id/employee_id used throughout the function body (e.g. ON CONFLICT (tenant_id, user_id)).';

revoke all on function workforce.accept_employee_invitation(uuid) from public;
grant execute on function workforce.accept_employee_invitation(uuid) to authenticated;

create or replace function api.accept_employee_invitation(
  p_invitation_id uuid
)
returns table (
  out_tenant_id uuid,
  out_employee_id uuid
)
language sql
security invoker
set search_path = workforce, public
as $$
  select * from workforce.accept_employee_invitation(p_invitation_id);
$$;

comment on function api.accept_employee_invitation(uuid) is
  'Invoker-only passthrough to workforce.accept_employee_invitation -- satisfies ADR 0008''s no-SECURITY-DEFINER-in-api invariant by construction (same shape as api.has_permission, 0019, and api.permanently_delete_employee, 0056). All identity-binding logic lives in the workforce-schema DEFINER function.';

revoke all on function api.accept_employee_invitation(uuid) from public;
grant execute on function api.accept_employee_invitation(uuid) to authenticated;
