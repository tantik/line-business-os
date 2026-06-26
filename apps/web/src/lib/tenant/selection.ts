/**
 * Pure, framework-agnostic parsing for the tenant-switcher form payload.
 *
 * Kept out of the `'use server'` actions module (which may only export async
 * server actions) so the validation logic stays synchronous and unit-testable
 * with a plain stubbed `FormData`. No `next/headers`, no `server-only`, no
 * Supabase, no side effects.
 *
 * The returned id is a CANDIDATE shape only — a syntactically valid UUID does
 * NOT imply the user may access that tenant. The Server Action must always
 * revalidate it against the authenticated user's live memberships (via the
 * STRICT `requestedTenantId` path of `selectActiveTenant`) before honoring it.
 */
import { parseActiveTenantCookieValue } from './active-tenant-cookie';

/** Form field name carrying the selected tenant id in the switcher form. */
export const TENANT_SELECT_FIELD = 'tenantId';

/**
 * Extract a canonical tenant id from a submitted switcher form, or `null`.
 *
 * Behavior (fail-closed), delegating UUID shape validation to the shared
 * `parseActiveTenantCookieValue`:
 *   - missing field -> `null`
 *   - non-string value (e.g. a File) -> `null`
 *   - empty / whitespace-only -> `null`
 *   - over-length / malformed UUID -> `null`
 *   - surrounding whitespace trimmed; accepted ids normalized to lowercase
 *
 * The result is still only a candidate; revalidate against live memberships.
 */
export function parseSelectedTenantId(formData: FormData): string | null {
  const raw = formData.get(TENANT_SELECT_FIELD);
  if (typeof raw !== 'string') return null;
  return parseActiveTenantCookieValue(raw);
}
