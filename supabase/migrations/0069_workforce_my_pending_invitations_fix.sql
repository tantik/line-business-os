-- ============================================================================
-- 0069  Fix: "you have a pending invitation" banner leaking OTHER people's
--       invitations to a Manager
-- ----------------------------------------------------------------------------
-- Bug (found live, Cafe Manager parity mission Gate 1 re-investigation,
-- 2026-08-18): `listMyPendingWorkforceInvitations` (invitations.ts) reads
-- `api.workforce_employee_invitations` filtered only by `status = 'pending'`,
-- relying entirely on RLS to scope "mine". But 0064 put TWO permissive SELECT
-- policies on `workforce.employee_invitations`:
--   wf_employee_invitations_manager_read  -- tenant-wide, if caller holds
--                                             workforce.staff.manage
--   wf_employee_invitations_self_read     -- target_user_id = caller
-- Postgres combines multiple permissive policies for the same command with
-- OR, not AND. So any Manager (who by definition holds workforce.staff.manage
-- in their own tenant) sees EVERY pending invitation in that tenant through
-- this "self" read -- not just their own. Confirmed live: `manager@oruwa-
-- cafe.test` saw a real pending invitation addressed to a different identity
-- (a staff member's own invited email) rendered by their own "invited as
-- staff" banner.
--
-- Both existing policies are correct and stay as-is (the Manager UI's own
-- staff table genuinely needs manager_read; self_read is correct in
-- isolation) -- the bug is `listMyPendingWorkforceInvitations`'s own query
-- never adding a redundant, explicit self-filter, wrongly assuming RLS alone
-- would produce "mine" for every caller. Since `api.workforce_employee_
-- invitations` deliberately never exposes `target_user_id` to the client
-- (0065's own comment: "no raw user id exposed"), the client-side query
-- cannot add that filter itself -- this needs a small SECURITY DEFINER RPC
-- that filters by `core.current_user_id()` unconditionally, the same
-- self-scoping mechanism `workforce.accept_employee_invitation` (0064)
-- already uses, so the banner's OWN read can never see another identity's
-- invitation regardless of what other permissions the caller holds.
-- ============================================================================

create or replace function workforce.my_pending_employee_invitations()
returns table (
  invitation_id uuid,
  tenant_id uuid,
  employee_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language sql
security definer
set search_path = core, workforce, public
stable
as $$
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
  from workforce.employee_invitations i
  where i.target_user_id = core.current_user_id()
    and i.status = 'pending';
$$;

comment on function workforce.my_pending_employee_invitations() is
  'Powers the "you have a pending invitation" banner -- unconditionally scoped to core.current_user_id(), never trusting RLS alone (see this migration''s own header for the bug this fixes: wf_employee_invitations_manager_read/_self_read are OR''d, so a Manager caller previously saw every pending invitation in their tenant through this same read). SECURITY DEFINER so the explicit target_user_id filter is the only thing that determines visibility here, regardless of what other permissions the caller holds -- same self-scoping shape as workforce.accept_employee_invitation (0064). Read-only, STABLE; no write, no bypass of accept_employee_invitation''s own re-verification. api.my_pending_employee_invitations is its invoker-only passthrough (ADR 0008: no SECURITY DEFINER object in api).';

revoke all on function workforce.my_pending_employee_invitations() from public;
grant execute on function workforce.my_pending_employee_invitations() to authenticated;

create or replace function api.my_pending_employee_invitations()
returns table (
  invitation_id uuid,
  tenant_id uuid,
  employee_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language sql
security invoker
set search_path = workforce, public
stable
as $$
  select * from workforce.my_pending_employee_invitations();
$$;

comment on function api.my_pending_employee_invitations() is
  'Invoker-only passthrough to workforce.my_pending_employee_invitations -- satisfies ADR 0008''s no-SECURITY-DEFINER-in-api invariant by construction (same shape as api.accept_employee_invitation, 0064). All self-scoping logic lives in the workforce-schema DEFINER function.';

revoke all on function api.my_pending_employee_invitations() from public;
grant execute on function api.my_pending_employee_invitations() to authenticated;
