'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveTenantContext } from '@/lib/tenant/context';
import { SIGN_IN_PATH } from './require-user';
import { parseCredentials } from './credentials';
import { buildSignInErrorPath, sanitizePreviewReturnTo } from '@/lib/preview/return-to';
import { DASHBOARD_PATH, resolvePostLoginPath } from './post-login-redirect';

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
