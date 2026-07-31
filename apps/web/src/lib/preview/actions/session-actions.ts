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
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect(buildPreviewSignInRedirect(PREVIEW_BASE_PATH));
}
