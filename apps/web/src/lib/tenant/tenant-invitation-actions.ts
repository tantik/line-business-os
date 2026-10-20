'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { DASHBOARD_PATH, resolvePostLoginPath } from '@/lib/auth/post-login-redirect';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-rules';
import { getActiveTenantContext } from './context';
import { setActiveTenantCookie } from './active-tenant-cookie.server';
import { acceptTenantInvitation, listMyPendingTenantInvitations } from './tenant-invitations';
import { pickAcceptableInvitation } from './tenant-invite-decision';

/**
 * Server Actions for the tenant (Owner) invitation (Stage 4B-3, DEBT-110 a/b).
 *
 * SECURITY: request-scoped anon-key client only (RLS + the caller's JWT). The
 * invitation is accepted by `api.accept_tenant_invitation`, which takes the
 * identity from the JWT and re-checks pending / unexpired / active tenant; an
 * id from the form is only a choice among the caller's own invitations, never
 * an authority. No privileged key anywhere on this path.
 */

export type TenantInviteActionResult =
  | { status: 'success'; destination: string }
  | {
      status:
        | 'not_acceptable'
        | 'none_pending'
        | 'expired'
        | 'unauthorized'
        | 'too_short'
        | 'same_password'
        | 'weak_password'
        | 'password_failed'
        | 'error';
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner landing after acceptance: the role workspace of the accepted tenant (`/manager` for an Owner). */
async function landingFor(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const context = await getActiveTenantContext({ tenantId });
  if (context.status !== 'success') return DASHBOARD_PATH;
  // Membership just re-validated (strict tenantId path) -> safe to make it the active tenant.
  await setActiveTenantCookie(context.data.activeTenant.tenantId);
  return resolvePostLoginPath(supabase, context.data.activeTenant.tenantId);
}

async function acceptAndLand(supabase: SupabaseClient, invitationId: string): Promise<TenantInviteActionResult> {
  const accepted = await acceptTenantInvitation(supabase, invitationId);
  if (accepted.status !== 'success') return { status: accepted.status };
  revalidatePath('/', 'layout');
  return { status: 'success', destination: await landingFor(supabase, accepted.tenantId) };
}

/**
 * New Owner (came from the invite email; the callback already verified the
 * token, so a session exists without a password -- same known Supabase gap as
 * the employee flow). Password first, then accept, same order as
 * `setPasswordAndAcceptInvitation`.
 */
export async function setPasswordAndAcceptTenantInvitation(formData: FormData): Promise<TenantInviteActionResult> {
  const password = formData.get('password');
  const rawId = formData.get('invitationId');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return { status: 'too_short' };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { status: 'unauthorized' };

  const { error: updateErr } = await supabase.auth.updateUser({ password });
  if (updateErr) {
    if (updateErr.code === 'same_password') return { status: 'same_password' };
    if (updateErr.code === 'weak_password') return { status: 'weak_password' };
    return { status: 'password_failed' };
  }

  let invitationId = typeof rawId === 'string' && UUID_RE.test(rawId) ? rawId : null;
  if (!invitationId) {
    // The callback could not read the invitations (transient): re-read now.
    const pending = await listMyPendingTenantInvitations(supabase);
    if (pending.status !== 'success') return { status: 'error' };
    const pick = pickAcceptableInvitation(pending.data);
    if (!pick) return { status: pending.data.length > 0 ? 'expired' : 'none_pending' };
    invitationId = pick.invitationId;
  }
  return acceptAndLand(supabase, invitationId);
}

/**
 * Already-registered user (the provision-tenant function sends NO email to an
 * existing account): accept from the in-app banner.
 */
export async function acceptPendingTenantInvitation(formData: FormData): Promise<TenantInviteActionResult> {
  const rawId = formData.get('invitationId');
  if (typeof rawId !== 'string' || !UUID_RE.test(rawId)) return { status: 'not_acceptable' };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { status: 'unauthorized' };
  return acceptAndLand(supabase, rawId);
}
