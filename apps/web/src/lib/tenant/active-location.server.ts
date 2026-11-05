import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { loadPageContext } from './page-context';
import { resolveActiveLocation, type MyLocation } from './active-location';
import {
  ACTIVE_LOCATION_COOKIE,
  buildActiveLocationCookieOptions,
  candidateLocationFor,
  formatActiveLocationCookieValue,
} from './active-location-cookie';

/**
 * The ONE place that answers "which store is this request about" for pages
 * and server actions (DEBT-139 L2). Reads the caller's `api.my_locations`
 * rows from the request-scoped page context (no extra request) and the
 * `oruwa_location` cookie hint, and applies `resolveActiveLocation`.
 *
 * Request-scoped (React `cache`, keyed by the primitive args) -- a page, its
 * layout and its components get the same answer. Server actions call it too
 * (their own request), so an action works on the same store the page shows;
 * they still re-check the permission at that location and RLS stays the
 * boundary.
 */
export type ActiveLocationResult =
  | { status: 'success'; data: { location: MyLocation; choices: MyLocation[] } }
  | { status: 'no_location' }
  | { status: 'unexpected_error'; message: string };

export const getActiveLocation = cache(
  async (tenantId: string, defaultLocationId: string | null): Promise<ActiveLocationResult> => {
    const { myLocations } = await loadPageContext();
    if (myLocations.status !== 'success') {
      return { status: 'unexpected_error', message: 'message' in myLocations ? myLocations.message : 'Locations unavailable.' };
    }
    const cookieStore = await cookies();
    const resolved = resolveActiveLocation(
      myLocations.data.filter((l) => l.tenantId === tenantId),
      {
        candidateLocationId: candidateLocationFor(cookieStore.get(ACTIVE_LOCATION_COOKIE)?.value, tenantId),
        defaultLocationId,
      },
    );
    if (!resolved.ok) return { status: 'no_location' };
    return { status: 'success', data: { location: resolved.location, choices: resolved.choices } };
  },
);

/** Write the cookie for an ALREADY-VALIDATED (strict `resolveActiveLocation`) tenant + location. Server Action only. */
export async function setActiveLocationCookie(tenantId: string, locationId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_LOCATION_COOKIE,
    formatActiveLocationCookieValue(tenantId, locationId),
    buildActiveLocationCookieOptions(process.env.NODE_ENV === 'production'),
  );
}
