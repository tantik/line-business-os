'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { buildPreviewSignInRedirect, PREVIEW_BASE_PATH } from '@/lib/preview/return-to';

/**
 * Preview-scoped sign-out wrapper. Same underlying `supabase.auth.signOut()`
 * as the dashboard's `signOut` (`lib/auth/actions.ts`), but redirects back to
 * the Preview sign-in screen (`returnTo=/mame-to-cha`) instead of the
 * dashboard's `/sign-in` with no `returnTo` - a Preview user who logs out and
 * logs back in as a different Preview user lands back in Preview, not the
 * internal dashboard.
 *
 * A distinct `previewXxx`-named action (rather than reusing `signOut`
 * directly as a preview route's form action) so it satisfies the closed
 * per-route Server Action allowlist enforced by
 * `scripts/verify-preview-server-actions.mjs`.
 */
export async function previewSignOut(): Promise<void> {
  const supabase = await createClient();
  // `signOut()` defaults to scope 'global', which round-trips to the Supabase
  // Auth server to revoke the refresh token before local cookies are cleared.
  // If that call fails or times out (e.g. an already-stale access token), the
  // unguarded await used to throw here and skip the redirect below, leaving
  // the user stuck on the page with no error UI (no error.tsx under this
  // route tree) and no way to leave except retrying. A failed remote revoke
  // must never block the local session from being cleared and the user from
  // navigating away.
  try {
    await supabase.auth.signOut();
  } catch {
    // Local cookies are cleared by the client regardless of the remote
    // revoke outcome; fall through to redirect either way.
  }
  revalidatePath('/', 'layout');
  redirect(buildPreviewSignInRedirect(PREVIEW_BASE_PATH));
}
