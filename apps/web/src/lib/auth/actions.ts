'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveTenantContext } from '@/lib/tenant/context';
import { SIGN_IN_PATH } from './require-user';
import { parseCredentials } from './credentials';
import { buildSignInErrorPath, sanitizePreviewReturnTo } from '@/lib/preview/return-to';
import { DASHBOARD_PATH, resolvePostLoginPath } from './post-login-redirect';
import { MIN_PASSWORD_LENGTH, hasRecentRecoverySession, looksLikeEmail, passwordResetRedirectUrl } from './password-reset';

/**
 * Server Actions for the minimal email/password auth flow.
 *
 * SECURITY:
 * - Uses ONLY the request-scoped anon-key server client (`lib/supabase/server`).
 *   The service-role key is never imported or used here (RLS stays the boundary).
 * - In a Server Action the cookie store is mutable, so `signInWithPassword` /
 *   `signOut` persist/clear the session cookies through the server client; the
 *   middleware keeps the session fresh on subsequent requests.
 * - Auth outcomes are intentionally generic: we never log credentials and never
 *   surface raw Supabase auth error detail to the user (no account enumeration).
 *
 * UX NOTE:
 * - `revalidatePath('/', 'layout')` runs before each post-mutation `redirect()`.
 *   Without it, the client Router Cache can still hold the pre-mutation RSC
 *   output for the destination route (e.g. sign-in's own "if authenticated,
 *   redirect to /dashboard" check, or the protected layout's "if not
 *   authenticated, redirect to /sign-in" check), so the redirect appears to do
 *   nothing until a manual reload forces a fresh fetch.
 */

export async function signIn(formData: FormData): Promise<void> {
  // Re-sanitize server-side rather than trusting the hidden form field as-is -
  // a malicious client could submit `returnTo` without ever rendering the page.
  const safeReturnTo = sanitizePreviewReturnTo(formData.get('returnTo')?.toString());

  const credentials = parseCredentials(formData);
  if (!credentials) {
    // Same Router Cache staleness reasoning as the success path below applies
    // here too: the destination is the same `/sign-in` route re-rendered with
    // `?error=1`, which can otherwise serve a stale cached RSC payload.
    revalidatePath('/', 'layout');
    redirect(buildSignInErrorPath(safeReturnTo));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  // Fail closed with a generic redirect; do not log or echo the auth error.
  if (error) {
    revalidatePath('/', 'layout');
    redirect(buildSignInErrorPath(safeReturnTo));
  }

  revalidatePath('/', 'layout');
  if (safeReturnTo) redirect(safeReturnTo);

  // No explicit destination (e.g. an invite deep link) was requested: land
  // on the caller's role-appropriate workspace instead of the generic
  // `/dashboard` shell every sign-in previously used regardless of role.
  let destination: string = DASHBOARD_PATH;
  const tenantContext = await getActiveTenantContext();
  if (tenantContext.status === 'success') {
    destination = await resolvePostLoginPath(supabase, tenantContext.data.activeTenant.tenantId);
  }
  redirect(destination);
}

export type PasswordResetRequestResult = { status: 'sent' | 'invalid_email' | 'retry_later' };

/**
 * "パスワードをお忘れですか？" request. Always answers `sent` for a
 * well-formed address -- registered or not, rate-limited or not -- so the
 * response never reveals whether an account exists. Only an Auth outage
 * (5xx / network) asks the user to retry.
 */
export async function requestPasswordReset(formData: FormData): Promise<PasswordResetRequestResult> {
  const email = String(formData.get('email') ?? '').trim();
  if (!looksLikeEmail(email)) return { status: 'invalid_email' };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await passwordResetRedirectUrl(),
  });
  if (error && (error.status === undefined || error.status >= 500)) {
    return { status: 'retry_later' };
  }
  return { status: 'sent' };
}

export type PasswordResetCompleteResult =
  | { status: 'success'; destination: string }
  | { status: 'link_invalid' | 'too_short' | 'same_password' | 'weak_password' | 'error' };

/**
 * Sets a new password for a session that was opened by a recovery link in
 * the last 15 minutes (re-checked here, not only on page render). Never
 * echoes the Auth error text.
 */
export async function completePasswordReset(formData: FormData): Promise<PasswordResetCompleteResult> {
  const password = String(formData.get('password') ?? '');
  const supabase = await createClient();
  if (!(await hasRecentRecoverySession(supabase))) return { status: 'link_invalid' };
  if (password.length < MIN_PASSWORD_LENGTH) return { status: 'too_short' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === 'same_password') return { status: 'same_password' };
    if (error.code === 'weak_password') return { status: 'weak_password' };
    return { status: 'error' };
  }

  revalidatePath('/', 'layout');
  let destination: string = DASHBOARD_PATH;
  const tenantContext = await getActiveTenantContext();
  if (tenantContext.status === 'success') {
    destination = await resolvePostLoginPath(supabase, tenantContext.data.activeTenant.tenantId);
  }
  return { status: 'success', destination };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // See previewSignOut's comment (lib/preview/actions/session-actions.ts):
  // a failed remote token-revoke must not block the local sign-out redirect.
  try {
    await supabase.auth.signOut();
  } catch {
    // Fall through to redirect regardless of the remote revoke outcome.
  }
  revalidatePath('/', 'layout');
  redirect(SIGN_IN_PATH);
}
