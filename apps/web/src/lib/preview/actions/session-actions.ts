'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { buildPreviewSignInRedirect, PREVIEW_BASE_PATH, sanitizePreviewReturnTo } from '@/lib/preview/return-to';

/**
 * Preview-scoped sign-out wrapper. Same underlying `supabase.auth.signOut()`
 * as the dashboard's `signOut` (`lib/auth/actions.ts`), but redirects back to
 * the Preview sign-in screen instead of the dashboard's `/sign-in` with no
 * `returnTo` - a Preview user who logs out and logs back in as a different
 * Preview user lands back in Preview, not the internal dashboard.
 *
 * The `returnTo` field (a hidden form input the caller sets to its own
 * canonical preview path - see `PreviewLogoutButton`) carries the page the
 * user was actually on back through sign-in (FA-01 fix): a Manager who logs
 * out from `/mame-to-cha/manager` must sign back in to the Manager
 * dashboard, not the generic Staff route the previously-hardcoded
 * `PREVIEW_BASE_PATH` sent every role to (which then failed with "No staff
 * profile found" for a Manager account). Re-runs it through the same
 * `sanitizePreviewReturnTo` allowlist used for every other `returnTo` in this
 * app - a value is only ever trusted after allowlist validation, never
 * because it came from this action's own caller - and falls back to the
 * generic Staff base path when absent/invalid, preserving prior behavior for
 * any caller that does not supply one.
 *
 * A distinct `previewXxx`-named action (rather than reusing `signOut`
 * directly as a preview route's form action) so it satisfies the closed
 * per-route Server Action allowlist enforced by
 * `scripts/verify-preview-server-actions.mjs`.
 */
export async function previewSignOut(formData: FormData): Promise<void> {
  const safeReturnTo = sanitizePreviewReturnTo(formData.get('returnTo')?.toString());
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
  redirect(buildPreviewSignInRedirect(safeReturnTo ?? PREVIEW_BASE_PATH));
}
