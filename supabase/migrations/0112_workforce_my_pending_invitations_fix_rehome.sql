-- ============================================================================
-- 0112  Re-home the "my pending employee invitations" self-scoping fix
-- ----------------------------------------------------------------------------
-- WHY THIS DUPLICATES 0069's INTENT (and is not an edit to 0069):
--   `dev`'s historical `0069_workforce_my_pending_invitations_fix.sql` created
--   `workforce.my_pending_employee_invitations()` + its `api.*` passthrough to
--   fix an identity leak: `wf_employee_invitations_manager_read` and
--   `wf_employee_invitations_self_read` (0064) are OR'd permissive policies,
--   so a Manager reading `api.workforce_employee_invitations` filtered only by
--   `status = 'pending'` saw EVERY pending invitation in the tenant, not just
--   their own. The banner's read was moved to an unconditionally
--   `core.current_user_id()`-scoped SECURITY DEFINER RPC.
--
--   That fix IS in the `dev` lineage — BUT it never reached Supabase Cloud
--   dev. On 2026-08-16 `main`'s (unmerged) `0069_core_entitlements_engine.sql`
--   was pushed to Cloud dev, consuming migration ledger slot `0069`. Every
--   later `db push` from `dev` therefore SKIPS `dev`'s own `0069` file (the
--   ledger already has `0069`). Verified 2026-08-29 against a fresh Cloud dev
--   schema dump: `workforce.my_pending_employee_invitations` and
--   `api.my_pending_employee_invitations` are ABSENT on Cloud dev, and
--   `apps/web/src/lib/workforce/invitations.ts` calls the missing RPC.
--
--   Founder decision (2026-08-29): re-home under a NEW migration number
--   rather than `migration repair`. This migration re-issues the exact 0069
--   function definitions:
--     * fresh local `supabase db reset` — `create or replace` is a harmless
--       identical redefinition (0069 already ran);
--     * Cloud dev — creates the two missing functions.
--
-- The bug reproduces on current `dev` (verified 2026-08-29): a Manager
-- querying `api.workforce_employee_invitations WHERE status='pending'` sees a
-- pending invitation addressed to a different user; the RPC returns only the
-- caller's own. 0069's exact solution is still correct against current `dev`
-- architecture (checked: no later migration altered
-- `workforce.employee_invitations`, its policies, or this RPC).
--
-- The historical `dev` file 0069_workforce_my_pending_invitations_fix.sql is
-- NOT renamed or edited.
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
  'Powers the "you have a pending invitation" banner -- unconditionally scoped to core.current_user_id(), never trusting RLS alone (wf_employee_invitations_manager_read/_self_read are OR''d, so a Manager caller would otherwise see every pending invitation in their tenant through this same read). SECURITY DEFINER so the explicit target_user_id filter is the only thing that determines visibility here. Read-only, STABLE. api.my_pending_employee_invitations is its invoker-only passthrough (ADR 0008). Re-homed from historical dev 0069 by 0112.';

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
  'Invoker-only passthrough to workforce.my_pending_employee_invitations -- satisfies ADR 0008''s no-SECURITY-DEFINER-in-api invariant by construction. All self-scoping logic lives in the workforce-schema DEFINER function. Re-homed from historical dev 0069 by 0112.';

revoke all on function api.my_pending_employee_invitations() from public;
grant execute on function api.my_pending_employee_invitations() to authenticated;

-- ============================================================================
-- Rollback: drop function if exists api.my_pending_employee_invitations();
--           drop function if exists workforce.my_pending_employee_invitations();
--   (only on a DB where 0069 did not already create them — i.e. never Cloud
--    dev once this has run; on `dev` local they also come from 0069.)
-- ============================================================================
