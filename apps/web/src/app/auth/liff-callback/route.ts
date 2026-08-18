import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getActiveTenantContext } from '@/lib/tenant/context';
import { DASHBOARD_PATH, resolvePostLoginPath } from '@/lib/auth/post-login-redirect';

const SIGN_IN_ERROR_URL = '/sign-in?error=1';

/**
 * Only `'magiclink'` is ever legitimate here -- `supabase/functions/liff-entry`
 * is the only issuer of a token_hash this route accepts, and it always
 * requests `type: 'magiclink'` from `auth.admin.generateLink`. Never trust an
 * arbitrary client-supplied `type` query param verbatim (same discipline as
 * `apps/web/src/app/auth/accept-invite/route.ts`'s `ALLOWED_TOKEN_HASH_TYPES`).
 */
const ALLOWED_TYPE = 'magiclink';

function errorRedirect(origin: string): NextResponse {
  return NextResponse.redirect(new URL(SIGN_IN_ERROR_URL, origin));
}

/**
 * LIFF login callback (Track B, B4). The LIFF entry page
 * (`apps/web/src/app/liff-entry/page.tsx`) already exchanged a verified LINE
 * ID token for a single-use magic-link `token_hash` via the `liff-entry` Edge
 * Function; this route's only job is to redeem that token_hash server-side
 * for a real session -- the exact same `verifyOtp({ token_hash, type })`
 * pattern `accept-invite/route.ts` already uses for the invite/recovery
 * flows, not a new session-establishment mechanism.
 *
 * This route never accepts an `access_token`/`refresh_token` directly and
 * never runs client-side `setSession()`, for the same reason
 * `accept-invite/route.ts` doesn't: the server-side `verifyOtp` call is what
 * persists the session to cookies safely.
 *
 * After a successful session, this reuses the identical role-aware
 * destination logic `sign-in/page.tsx` already uses for an ordinary
 * email/password login (`getActiveTenantContext` + `resolvePostLoginPath`) --
 * LIFF is an alternate entry method into the same authenticated app, not a
 * separate surface with its own routing rules.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  if (!tokenHash || type !== ALLOWED_TYPE) {
    return errorRedirect(url.origin);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: ALLOWED_TYPE });
  if (error) {
    return errorRedirect(url.origin);
  }

  const user = await getCurrentUser();
  if (!user) {
    return errorRedirect(url.origin);
  }

  let destination: string = DASHBOARD_PATH;
  const tenantContext = await getActiveTenantContext({ user });
  if (tenantContext.status === 'success') {
    destination = await resolvePostLoginPath(supabase, tenantContext.data.activeTenant.tenantId);
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
