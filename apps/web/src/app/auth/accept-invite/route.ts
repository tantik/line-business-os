import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Staff invitation email callback (new-user path only -- the existing-user
 * path never sends an email; see the in-app pending-invitation banner
 * instead). Supabase's invite link redirects here as
 * `?invitation_id=<id>&code=<pkce_code>` (`invitation_id` is the query
 * param the invite-employee Edge Function embedded in `redirectTo`; `code`
 * is appended by Supabase itself).
 *
 * KNOWN SUPABASE GAP (documented in docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md
 * §3 Phase 3, GitHub #45210, unresolved upstream): `exchangeCodeForSession`
 * establishes a REAL session before any password has been set. The only
 * available mitigation is UX-only -- route straight to the password-setup
 * screen and nowhere else, which is exactly what this handler does. It must
 * never redirect to `/dashboard` or any other authenticated page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const invitationId = url.searchParams.get('invitation_id');

  if (!code || !invitationId) {
    return NextResponse.redirect(new URL('/sign-in?error=1', url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=1', url.origin));
  }

  return NextResponse.redirect(
    new URL(`/auth/accept-invite/set-password?invitation_id=${encodeURIComponent(invitationId)}`, url.origin),
  );
}
