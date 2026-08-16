'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  acceptWorkforceEmployeeInvitation,
  inviteOrResendWorkforceEmployee,
  revokeWorkforceEmployeeInvitation,
  type InviteEmployeeResult,
} from './invitations';
import type { WorkforceWriteResult } from './result-types';

/**
 * Server Actions for the Staff invitation flow. Manager-facing actions
 * resolve tenant context first (same pattern as staff-actions.ts); the
 * invite/resend action additionally forwards the CALLER'S OWN Supabase
 * access token to the invite-employee Edge Function -- apps/web never
 * holds or forwards a service-role key (Founder decision 9).
 */

export async function inviteOrResendEmployee(formData: FormData): Promise<WorkforceWriteResult<InviteEmployeeResult>> {
  const employeeId = formData.get('employeeId');
  if (typeof employeeId !== 'string' || employeeId.length === 0) {
    return { status: 'unexpected_error', message: 'Invalid input.' };
  }

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session) {
    return { status: 'unauthorized', message: 'Your session has expired. Please sign in again.' };
  }

  return inviteOrResendWorkforceEmployee(sessionData.session.access_token, tenantContext.data.activeTenant.tenantId, employeeId);
}

/**
 * Defect C, Manager-triggered recovery (Founder-approved 2026-08-16): send
 * a password-recovery email to a first-time hire whose Auth identity
 * already exists but who never finished password setup. Same call shape as
 * `inviteOrResendEmployee`, only the `action: 'recover'` flag differs --
 * see `inviteOrResendWorkforceEmployee`'s own doc comment for why the
 * normal resend path cannot recover this specific state.
 */
export async function recoverEmployeeAccess(formData: FormData): Promise<WorkforceWriteResult<InviteEmployeeResult>> {
  const employeeId = formData.get('employeeId');
  if (typeof employeeId !== 'string' || employeeId.length === 0) {
    return { status: 'unexpected_error', message: 'Invalid input.' };
  }

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session) {
    return { status: 'unauthorized', message: 'Your session has expired. Please sign in again.' };
  }

  return inviteOrResendWorkforceEmployee(
    sessionData.session.access_token,
    tenantContext.data.activeTenant.tenantId,
    employeeId,
    'recover',
  );
}

export async function revokeEmployeeInvitation(formData: FormData): Promise<WorkforceWriteResult<{ invitationId: string }>> {
  const invitationId = formData.get('invitationId');
  if (typeof invitationId !== 'string' || invitationId.length === 0) {
    return { status: 'unexpected_error', message: 'Invalid input.' };
  }

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return revokeWorkforceEmployeeInvitation(supabase, invitationId);
}

/**
 * Accepts a pending invitation targeting the CALLER'S OWN verified identity
 * -- used both by the new-user password-setup step and the existing-user
 * in-app banner. No tenant context is required/possible yet: accepting is
 * exactly what establishes the caller's tenant membership.
 */
export async function acceptEmployeeInvitation(formData: FormData): Promise<WorkforceWriteResult<{ tenantId: string; employeeId: string }>> {
  const invitationId = formData.get('invitationId');
  if (typeof invitationId !== 'string' || invitationId.length === 0) {
    return { status: 'unexpected_error', message: 'Invalid input.' };
  }

  const supabase = await createClient();
  return acceptWorkforceEmployeeInvitation(supabase, invitationId);
}

const MIN_PASSWORD_LENGTH = 8;

/**
 * New-user path only: sets the password on the caller's OWN just-established
 * session (a plain self-service `auth.updateUser`, not an admin call -- no
 * service_role involved), then accepts the invitation in the same action.
 * Password-first, by design: the known Supabase gap (a real session exists
 * right after the invite-link callback, before any password is set) means
 * this screen must be reached directly from the callback and nothing else
 * must be offered first -- see docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md §3 Phase 3.
 */
export async function setPasswordAndAcceptInvitation(
  formData: FormData,
): Promise<WorkforceWriteResult<{ tenantId: string; employeeId: string }>> {
  const invitationId = formData.get('invitationId');
  const password = formData.get('password');
  if (typeof invitationId !== 'string' || invitationId.length === 0) {
    return { status: 'unexpected_error', message: 'Invalid input.' };
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { status: 'unexpected_error', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const supabase = await createClient();
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session) {
    return { status: 'unauthorized', message: 'Your invitation link has expired. Ask your manager to resend it.' };
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password });
  if (updateErr) {
    return { status: 'unexpected_error', message: 'Could not set your password. Please try again.' };
  }

  return acceptWorkforceEmployeeInvitation(supabase, invitationId);
}
