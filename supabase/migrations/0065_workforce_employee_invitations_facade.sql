-- ============================================================================
-- 0065  Staff invitation domain model: app-reachable API facade (Phase 4
--       completion for 0064_workforce_employee_invitations.sql)
-- ----------------------------------------------------------------------------
-- 0064 built workforce.employee_invitations + its RLS policies on the
-- assumption that a Manager can SELECT/revoke it and an invited person can
-- SELECT their own rows directly from application code. That assumption does
-- not hold as-is: `workforce` is NOT in supabase/config.toml's PostgREST
-- exposed-schemas list (`schemas = ["public", "api"]`, unchanged by this
-- migration and never touched by any Workforce migration -- see 0023's own
-- dependency-note precedent). A base-table grant on a non-exposed schema is
-- unreachable by any `.schema('workforce')` call from supabase-js; only an
-- `api`-schema view/function is actually callable over the Data API. This
-- migration adds exactly that, following 0023's `security_invoker` view
-- pattern precisely (same shape as api.workforce_staff_directory).
--
-- Two additions:
--
--   1. api.workforce_employee_invitations -- security_invoker view, SELECT +
--      UPDATE, over workforce.employee_invitations. No extra WHERE clause
--      (mirrors 0023's recipe-view precedent): wf_employee_invitations_
--      manager_read / _self_read / _manager_revoke RLS already encode the
--      full visibility/write rule, so restating it here would risk drifting
--      out of sync. target_user_id and invited_by are deliberately NOT
--      selected (no raw user id exposed to a client, matching 0023's "zero
--      user-identity" precedent set by api.my_tenant_admin_members, 0018) --
--      neither the Manager UI nor the accept/banner flow needs them: the
--      accept RPC (0064) re-derives the caller's identity from
--      core.current_user_id() itself, never from a client-supplied value.
--      UPDATE works with zero new grant: 0064 already granted
--      `select, update on workforce.employee_invitations to authenticated`
--      in anticipation of exactly this view (its own comment says "plain RLS
--      UPDATE, no service_role needed") -- a plain single-table view with no
--      join/aggregate is automatically updatable by Postgres, so no INSTEAD
--      OF trigger is needed, same as api.workforce_staff_manage's precedent.
--
--   2. workforce.upsert_employee_invitation(...) -- SECURITY DEFINER (lives
--      in `workforce`, never `api`, per ADR 0008 -- same reasoning and same
--      shape as workforce.accept_employee_invitation, 0064) + its thin
--      api.upsert_employee_invitation SECURITY INVOKER passthrough. This is
--      the ONLY way an "invite" or "resend" ever creates/refreshes a row:
--      there is still deliberately no INSERT policy for `authenticated` on
--      the base table, and the UPDATE policy still only permits the
--      Manager-revoke transition -- so a plain client UPDATE cannot ever set
--      target_user_id/expires_at. p_target_user_id is trusted as a plain
--      argument here because the ONLY caller of this RPC is the
--      invite-employee Edge Function, immediately after it has ALREADY
--      resolved that id itself via the Supabase Auth Admin API
--      (inviteUserByEmail's own response for a new user, or an existing-user
--      email lookup) -- never taken from arbitrary browser input. The
--      Edge Function calls this RPC with the CALLER'S OWN JWT (a
--      user-scoped client, not service_role) specifically so this
--      function's own core.has_permission check re-verifies the caller is
--      actually a Manager in p_tenant_id -- defense in depth against a
--      misused or compromised Edge Function, not merely trusting that the
--      Edge Function already checked once. service_role is used ONLY for the
--      two Supabase Auth Admin API calls (inviteUserByEmail/listUsers)
--      inside the Edge Function -- never for this DB write, which stays on
--      the ordinary authenticated-JWT + SECURITY DEFINER-RPC path used
--      everywhere else in this schema.
--
--      Upsert semantics, atomic, one function call:
--        * employee not found in p_tenant_id -> 'employee_not_found'.
--        * employee already bound (user_id is not null) -> raises
--          'employee_already_bound' (mirrors accept_employee_invitation's
--          own guard; an Edge Function bug or a stale Manager UI screen
--          cannot re-invite an already-accepted employee).
--        * an existing PENDING row for (tenant_id, employee_id) is refreshed
--          in place (target_user_id + expires_at reset to now()+7 days) --
--          this IS the resend path; Invite and Resend are the same RPC call,
--          distinguished only by which one the Manager UI happened to be
--          showing (no pending row -> "Invite" button; a pending row ->
--          "Resend"). Reusing the row keeps one continuous audit trail
--          instead of a second row per resend.
--        * otherwise a new row is inserted with the given p_invitation_id
--          (generated caller-side, BEFORE this call, so the Edge Function
--          can embed the same id in the Supabase invite email's redirectTo
--          query string for the new-user callback route to read back).
--      Returns (out_invitation_id, out_expires_at, out_was_resend) so the
--      Edge Function's HTTP response can distinguish "invited" vs "resent"
--      without a second read.
-- ============================================================================

create view api.workforce_employee_invitations
  with (security_invoker = true) as
select
  i.id as invitation_id,
  i.tenant_id,
  i.employee_id,
  i.status,
  i.created_at,
  i.updated_at,
  i.expires_at,
  i.accepted_at,
  i.revoked_at
from workforce.employee_invitations i;

comment on view api.workforce_employee_invitations is
  'Staff invitation rows, relying entirely on wf_employee_invitations_manager_read / _self_read / _manager_revoke RLS (0064) for visibility and the revoke write (no additional predicate). security_invoker view. No target_user_id/invited_by (no raw user id exposed). Invite/resend writes do NOT go through this view -- see api.upsert_employee_invitation.';

grant select, update on api.workforce_employee_invitations to authenticated;
revoke all on api.workforce_employee_invitations from anon, public;

create or replace function workforce.upsert_employee_invitation(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_target_user_id uuid,
  p_invitation_id uuid
)
returns table (
  out_invitation_id uuid,
  out_expires_at timestamptz,
  out_was_resend boolean
)
language plpgsql
security definer
set search_path = core, workforce, public
as $$
declare
  v_employee_user_id uuid;
  v_existing_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if not core.has_permission_in_tenant(p_tenant_id, 'workforce.staff.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select user_id into v_employee_user_id
    from workforce.employees
   where tenant_id = p_tenant_id and id = p_employee_id;

  if not found then
    raise exception 'employee_not_found' using errcode = 'P0001';
  end if;
  if v_employee_user_id is not null then
    raise exception 'employee_already_bound' using errcode = 'P0001';
  end if;

  -- p_target_user_id is a resolved auth.users id (the Edge Function's own
  -- inviteUserByEmail/listUsers resolution), but core.users is a MANUAL
  -- mirror of auth.users (0002) with no auto-sync trigger -- a brand-new
  -- invited user has no core.users row yet, and target_user_id references
  -- core.users(id), so the insert below would otherwise fail its FK. Same
  -- id-only, no-PII, idempotent ensure as workforce.accept_employee_invitation
  -- (0064) uses for the same reason.
  insert into core.users (id) values (p_target_user_id)
  on conflict (id) do nothing;

  select id into v_existing_id
    from workforce.employee_invitations
   where tenant_id = p_tenant_id and employee_id = p_employee_id and status = 'pending'
   for update;

  if found then
    update workforce.employee_invitations
       set target_user_id = p_target_user_id,
           expires_at = v_expires_at
     where id = v_existing_id;
    -- `return query` appends rows but does NOT exit the function on its own
    -- (a PL/pgSQL gotcha) -- the explicit `return;` is required here, or
    -- execution would fall through into the insert below and violate the
    -- one-pending-per-employee unique index.
    return query select v_existing_id, v_expires_at, true;
    return;
  end if;

  insert into workforce.employee_invitations
    (id, tenant_id, employee_id, target_user_id, invited_by, expires_at)
  values
    (p_invitation_id, p_tenant_id, p_employee_id, p_target_user_id, core.current_user_id(), v_expires_at);

  return query select p_invitation_id, v_expires_at, false;
end;
$$;

comment on function workforce.upsert_employee_invitation(uuid, uuid, uuid, uuid) is
  'The only path that creates/refreshes an employee_invitations row (invite AND resend -- same call, upsert semantics on the one-pending-per-employee partial unique index). SECURITY DEFINER because there is deliberately no INSERT policy and no target_user_id/expires_at UPDATE policy for authenticated (0064); re-verifies core.has_permission(workforce.staff.manage) itself rather than trusting the caller already checked. p_target_user_id is trusted only because the sole caller (the invite-employee Edge Function) resolves it itself via the Supabase Auth Admin API immediately before calling this, using the CALLER''S OWN JWT (never service_role) so this function''s own permission check is a real, re-verified boundary. Lives outside api per ADR 0008, same shape as workforce.accept_employee_invitation; api.upsert_employee_invitation is its invoker-only passthrough.';

revoke all on function workforce.upsert_employee_invitation(uuid, uuid, uuid, uuid) from public;
grant execute on function workforce.upsert_employee_invitation(uuid, uuid, uuid, uuid) to authenticated;

create or replace function api.upsert_employee_invitation(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_target_user_id uuid,
  p_invitation_id uuid
)
returns table (
  out_invitation_id uuid,
  out_expires_at timestamptz,
  out_was_resend boolean
)
language sql
security invoker
set search_path = workforce, public
as $$
  select * from workforce.upsert_employee_invitation(p_tenant_id, p_employee_id, p_target_user_id, p_invitation_id);
$$;

comment on function api.upsert_employee_invitation(uuid, uuid, uuid, uuid) is
  'Invoker-only passthrough to workforce.upsert_employee_invitation -- satisfies ADR 0008 by construction (same shape as api.accept_employee_invitation, 0064). Called only by the invite-employee Edge Function, with the calling Manager''s own JWT, never service_role.';

revoke all on function api.upsert_employee_invitation(uuid, uuid, uuid, uuid) from public;
grant execute on function api.upsert_employee_invitation(uuid, uuid, uuid, uuid) to authenticated;
