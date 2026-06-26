import 'server-only';
import { cookies } from 'next/headers';
import { ACTIVE_TENANT_COOKIE, parseActiveTenantCookieValue } from './active-tenant-cookie';

/**
 * Read the active-tenant cookie server-side and return a validated CANDIDATE
 * tenant id, or `null`.
 *
 * This is read-only: it never writes or deletes cookies. All validation is
 * delegated to `parseActiveTenantCookieValue`, so a present-but-malformed or
 * non-UUID value resolves to `null`. The returned id is only a HINT - callers
 * must still revalidate it against the authenticated user's live memberships
 * (`selectActiveTenant`'s `candidateTenantId`) before honoring it.
 */
export async function getActiveTenantCookieValue(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
  return parseActiveTenantCookieValue(raw);
}
