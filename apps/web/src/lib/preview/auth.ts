import 'server-only';
import { requireUser } from '@/lib/auth/require-user';
import { buildPreviewSignInRedirect } from './return-to';

/**
 * Require an authenticated session for a preview route, redirecting an
 * unauthenticated request to sign-in with a `returnTo` carrying the exact,
 * statically-known public preview path for this route - so a signed-out
 * visitor following a `preview.oruwa.jp/mame-to-cha/...` link lands back on
 * the preview page they came from after signing in (architecture plan
 * Section I), instead of the dashboard.
 *
 * `publicPath` is always a compile-time-known literal per call site (never
 * derived from request state), so no pathname-sniffing or middleware header
 * is needed.
 */
export async function requirePreviewUser(publicPath: string) {
  return requireUser(buildPreviewSignInRedirect(publicPath));
}
