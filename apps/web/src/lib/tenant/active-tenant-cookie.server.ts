import 'server-only';
import { cookies } from 'next/headers';
import {
  ACTIVE_TENANT_COOKIE,
  buildActiveTenantCookieOptions,
  parseActiveTenantCookieValue,
} from './active-tenant-cookie';

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

/**
 * Write the active-tenant cookie with an ALREADY-VALIDATED canonical tenant id.
 *
 * This helper is deliberately dumb: it does NOT parse raw form input and does
 * NOT decide authority. The caller (the `setActiveTenant` Server Action) must
 * have already confirmed, via a live membership check (`selectActiveTenant`'s
 * STRICT `requestedTenantId` path), that the authenticated user is a member of
 * `validatedTenantId` before calling this. The stored value is the canonical
 * tenant UUID only — never raw input and never any sensitive data.
 *
 * Cookie flags come from the pure `buildActiveTenantCookieOptions` factory
 * (`httpOnly`, `sameSite: 'lax'`, `secure` in production, `path: '/'`). Must be
 * invoked from a mutable cookie context (Server Action / Route Handler). Never
 * uses the service-role key.
 */
export async function setActiveTenantCookie(validatedTenantId: string): Promise<void> {
  const cookieStore = await cookies();
  const options = buildActiveTenantCookieOptions(process.env.NODE_ENV === 'production');
  cookieStore.set(ACTIVE_TENANT_COOKIE, validatedTenantId, options);
}
