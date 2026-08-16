import 'server-only';
import { getCurrentSession } from '@/lib/auth/session';
import {
  evaluateAuthBoundarySmoke,
  type AuthBoundarySmokeInput,
  type AuthBoundarySmokeResult,
} from './auth-boundary-smoke.service';

export type { AuthBoundarySmokeInput, AuthBoundarySmokeResult };
export { AUTH_BOUNDARY_SMOKE_PERMISSION } from './auth-boundary-smoke.service';

/**
 * LOCAL/DEV-ONLY SMOKE HELPER (Phase 1J-1H). Not a permanent API surface.
 *
 * The only server-side caller of apps/api from apps/web. Resolves the current
 * user's Supabase access token and forwards it as `Authorization: Bearer
 * <token>` to `GET {LINE_OS_API_INTERNAL_URL}/auth-boundary/test`
 * (apps/api/src/auth-boundary), mapping the response to a safe, discriminated
 * result via the pure `evaluateAuthBoundarySmoke` core
 * (`./auth-boundary-smoke.service.ts`). Never returns a token, email, user
 * id, role internals, permission array, raw API error body, or stack trace -
 * only a status plus the tenant/location ids and permission key the caller
 * already supplied/knows.
 *
 * MUST only run server-side (`import 'server-only'` enforces this at build
 * time) and must never be imported from a Client Component. `apiBaseUrl` is
 * read from `LINE_OS_API_INTERNAL_URL` - deliberately NOT `NEXT_PUBLIC_*` -
 * so it is never inlined into the browser bundle.
 */
export async function runAuthBoundarySmoke(
  input: AuthBoundarySmokeInput,
): Promise<AuthBoundarySmokeResult> {
  return evaluateAuthBoundarySmoke(input, {
    getAccessToken: async () => {
      const session = await getCurrentSession();
      return session?.access_token ?? null;
    },
    fetchImpl: fetch,
    apiBaseUrl: process.env.LINE_OS_API_INTERNAL_URL,
  });
}
