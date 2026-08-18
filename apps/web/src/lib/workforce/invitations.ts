import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { WorkforceWriteResult } from './result-types';
import { mapWorkforceReadError, mapWorkforceWriteError } from './pg-error';
import { requirePublicSupabaseEnv } from '@/lib/supabase/env';

/** Flat row shape returned by `api.workforce_employee_invitations` (0065). No target_user_id/invited_by -- no raw user id reaches the client. */
interface ApiWorkforceEmployeeInvitationRow {
  invitation_id: string;
  tenant_id: string;
  employee_id: string;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
  updated_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export interface WorkforceEmployeeInvitation {
  invitationId: string;
  tenantId: string;
  employeeId: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  /** Derived, never a stored status (0064/0065's own convention -- EXPIRED is computed at read time). */
  isExpired: boolean;
}

const SELECT = 'invitation_id, tenant_id, employee_id, status, created_at, updated_at, expires_at, accepted_at, revoked_at';

function mapRow(row: ApiWorkforceEmployeeInvitationRow): WorkforceEmployeeInvitation {
  return {
    invitationId: row.invitation_id,
    tenantId: row.tenant_id,
    employeeId: row.employee_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    isExpired: row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now(),
  };
}

/** Manager-only: every invitation in the tenant (RLS: wf_employee_invitations_manager_read). */
export async function listWorkforceEmployeeInvitations(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceEmployeeInvitation[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_employee_invitations')
      .select(SELECT)
      .eq('tenant_id', tenantId);
    if (error) return mapWorkforceReadError(error, 'read staff invitations');
    const rows = (data ?? []) as ApiWorkforceEmployeeInvitationRow[];
    return { status: 'success', data: rows.map(mapRow) };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading staff invitations.' };
  }
}

/**
 * Single invitation by id, scoped by whatever RLS already grants the caller
 * (`wf_employee_invitations_self_read`: their own `target_user_id`, or
 * `wf_employee_invitations_manager_read`: their tenant, if a manager).
 * Read-only pre-check for the invite-email callback (`auth/accept-invite`)
 * -- confirms the invitation is still `pending` before routing to
 * password setup. Never mutates; never itself accepts an invitation.
 * `null` covers both "no such invitation" and "exists but not visible to
 * this caller" identically -- RLS already collapses those two cases, and
 * the callback deliberately doesn't distinguish them further to avoid
 * leaking which invitation ids exist.
 */
export async function getWorkforceEmployeeInvitationById(
  supabase: SupabaseClient,
  invitationId: string,
): Promise<TenantAccessResult<WorkforceEmployeeInvitation | null>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_employee_invitations')
      .select(SELECT)
      .eq('invitation_id', invitationId)
      .maybeSingle();
    if (error) return mapWorkforceReadError(error, 'read this invitation');
    return { status: 'success', data: data ? mapRow(data as ApiWorkforceEmployeeInvitationRow) : null };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading this invitation.' };
  }
}

/**
 * Self-scoped, any tenant: powers the "you have a pending invitation"
 * banner. Calls `api.my_pending_employee_invitations()` (0069) rather than
 * selecting `api.workforce_employee_invitations` filtered only by
 * `status = 'pending'` -- that used to rely entirely on RLS to scope "mine",
 * but `wf_employee_invitations_manager_read`/`_self_read` (0064) are two
 * permissive SELECT policies on the same table, which Postgres combines
 * with OR, not AND -- so any Manager (who by definition holds
 * `workforce.staff.manage` in their own tenant) saw EVERY pending
 * invitation in that tenant, not just their own (found live, Cafe Manager
 * parity mission Gate 1 re-investigation, 2026-08-18: `manager@oruwa-
 * cafe.test`'s banner rendered a different identity's own pending
 * invitation). The RPC filters by `core.current_user_id()`
 * unconditionally, so this can never leak another identity's invitation
 * again regardless of what other permissions the caller holds.
 */
export async function listMyPendingWorkforceInvitations(
  supabase: SupabaseClient,
): Promise<TenantAccessResult<WorkforceEmployeeInvitation[]>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('my_pending_employee_invitations');
    if (error) return mapWorkforceReadError(error, 'read your pending invitations');
    const rows = (data ?? []) as ApiWorkforceEmployeeInvitationRow[];
    return {
      status: 'success',
      data: rows.map(mapRow).filter((inv) => !inv.isExpired),
    };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading your pending invitations.' };
  }
}

/** Manager-only revoke: plain RLS UPDATE through the view (wf_employee_invitations_manager_revoke), no service_role. */
export async function revokeWorkforceEmployeeInvitation(
  supabase: SupabaseClient,
  invitationId: string,
): Promise<WorkforceWriteResult<{ invitationId: string }>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_employee_invitations')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('invitation_id', invitationId)
      .select('invitation_id')
      .maybeSingle();
    if (error) return mapWorkforceWriteError(error, 'revoke this invitation');
    if (!data) return { status: 'not_found' };
    return { status: 'success', data: { invitationId: data.invitation_id as string } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error revoking this invitation.' };
  }
}

export type InviteEmployeeOutcome =
  | 'invited_new_user'
  | 'invited_existing_user_no_email'
  | 'resent_new_user_email'
  | 'resent_existing_user_no_email'
  | 'recovery_email_sent';

export interface InviteEmployeeResult {
  outcome: InviteEmployeeOutcome;
  invitationId: string;
  expiresAt: string;
}

/**
 * Invite or resend (same call -- the Edge Function/RPC decide which, see
 * 0065's upsert semantics). Calls the invite-employee Supabase Edge Function
 * with the CALLER'S OWN access token forwarded as the Authorization header --
 * this is the only place apps/web talks to that function, and it never holds
 * or forwards a service-role key (that lives exclusively inside the Edge
 * Function itself, per Founder decision 9).
 *
 * `action: 'recover'` (Defect C, Founder-approved 2026-08-16) sends a
 * password-recovery email instead of the normal invite/resend, for a
 * first-time hire whose Auth identity already exists (they consumed their
 * original invite email) but who never finished password setup -- the
 * normal resend path sends nothing once the target is an existing Auth
 * user (Founder decision 8), which is correct for an existing ORUWA user
 * but a dead end for someone who has never had a session.
 */
export async function inviteOrResendWorkforceEmployee(
  accessToken: string,
  tenantId: string,
  employeeId: string,
  action?: 'recover',
): Promise<WorkforceWriteResult<InviteEmployeeResult>> {
  const { url, anonKey } = requirePublicSupabaseEnv();
  const endpoint = `${url.replace(/\/$/, '')}/functions/v1/invite-employee`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action ? { tenantId, employeeId, action } : { tenantId, employeeId }),
    });
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unable to reach the invitation service.' };
  }

  let body: Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    return { status: 'unexpected_error', message: 'The invitation service returned an unreadable response.' };
  }

  if (response.ok) {
    return {
      status: 'success',
      data: { outcome: body.outcome as InviteEmployeeOutcome, invitationId: body.invitationId as string, expiresAt: body.expiresAt as string },
    };
  }

  const code = typeof body.error === 'string' ? body.error : 'unknown_error';
  if (response.status === 401 || response.status === 403 || code === 'not_authorized') {
    return { status: 'unauthorized', message: 'Not permitted to invite this employee.' };
  }
  if (response.status === 404 || code === 'employee_not_found') return { status: 'not_found' };
  if (code === 'employee_already_bound') return { status: 'duplicate', message: 'This employee is already bound to an account.' };
  if (code === 'employee_inactive') return { status: 'unexpected_error', message: 'This employee is deactivated and cannot be invited.' };
  if (code === 'employee_missing_email') return { status: 'unexpected_error', message: 'This employee has no contact email on file.' };
  if (code === 'employee_not_yet_invited') {
    return { status: 'unexpected_error', message: 'This employee has never been invited yet -- use Invite, not Recover access.' };
  }
  if (code === 'auth_recovery_email_failed') {
    return { status: 'unexpected_error', message: 'Could not send the recovery email. Please try again.' };
  }
  return { status: 'unexpected_error', message: `The invitation service reported an error (${code}).` };
}

/** Accept a pending invitation targeting the caller's own verified identity (api.accept_employee_invitation, 0064). */
export async function acceptWorkforceEmployeeInvitation(
  supabase: SupabaseClient,
  invitationId: string,
): Promise<WorkforceWriteResult<{ tenantId: string; employeeId: string }>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('accept_employee_invitation', { p_invitation_id: invitationId })
      .maybeSingle();
    if (error) return mapWorkforceWriteError(error, 'accept this invitation');
    if (!data) return { status: 'not_found' };
    const row = data as { out_tenant_id: string; out_employee_id: string };
    return { status: 'success', data: { tenantId: row.out_tenant_id, employeeId: row.out_employee_id } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error accepting this invitation.' };
  }
}
