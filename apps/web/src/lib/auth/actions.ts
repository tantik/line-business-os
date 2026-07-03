'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { SIGN_IN_PATH } from './require-user';
import { parseCredentials } from './credentials';

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

/** Sign-in landing with a generic error flag; the value carries no detail. */
const SIGN_IN_ERROR_PATH = `${SIGN_IN_PATH}?error=1`;

/** Where a successful sign-in lands. The protected layout re-checks auth. */
const DASHBOARD_PATH = '/dashboard';

export async function signIn(formData: FormData): Promise<void> {
  const credentials = parseCredentials(formData);
  if (!credentials) redirect(SIGN_IN_ERROR_PATH);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  // Fail closed with a generic redirect; do not log or echo the auth error.
  if (error) redirect(SIGN_IN_ERROR_PATH);

  revalidatePath('/', 'layout');
  redirect(DASHBOARD_PATH);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect(SIGN_IN_PATH);
}
