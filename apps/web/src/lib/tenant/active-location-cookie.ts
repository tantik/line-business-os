/**
 * Active-location cookie (DEBT-139 L2): pure helpers, no `next/headers`.
 *
 * Value: `<tenantId>:<locationId>` (two canonical UUIDs). The tenant id makes
 * the hint per tenant: after a tenant switch a location of the other tenant
 * is never even considered. The parsed value is a HINT only --
 * `resolveActiveLocation` revalidates it against the caller's live
 * `api.my_locations` rows. Flags: same as the active-tenant cookie.
 */
import { buildActiveTenantCookieOptions } from './active-tenant-cookie';

export const ACTIVE_LOCATION_COOKIE = 'oruwa_location';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const VALUE_RE = new RegExp(`^(${UUID}):(${UUID})$`, 'i');
const MAX_RAW_LENGTH = 100;

export interface ActiveLocationCookieValue {
  tenantId: string;
  locationId: string;
}

export function parseActiveLocationCookieValue(raw: string | null | undefined): ActiveLocationCookieValue | null {
  if (raw === null || raw === undefined || raw.length > MAX_RAW_LENGTH) return null;
  const match = VALUE_RE.exec(raw.trim());
  if (!match) return null;
  return { tenantId: match[1]!.toLowerCase(), locationId: match[2]!.toLowerCase() };
}

/** The candidate location for `tenantId`, or null (other tenant / absent / malformed). */
export function candidateLocationFor(raw: string | null | undefined, tenantId: string): string | null {
  const parsed = parseActiveLocationCookieValue(raw);
  return parsed && parsed.tenantId === tenantId.toLowerCase() ? parsed.locationId : null;
}

export function formatActiveLocationCookieValue(tenantId: string, locationId: string): string {
  return `${tenantId.toLowerCase()}:${locationId.toLowerCase()}`;
}

/** Same flags as the active-tenant cookie, plus one year so the choice survives restarts. */
export function buildActiveLocationCookieOptions(isProduction: boolean) {
  return { ...buildActiveTenantCookieOptions(isProduction), maxAge: 60 * 60 * 24 * 365 };
}
