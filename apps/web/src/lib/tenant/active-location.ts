/**
 * Active location (store) of the current request -- pure, framework-agnostic
 * (DEBT-139 L2). Same shape and trust rules as `selectActiveTenant`:
 *
 *   - `requestedLocationId` is STRICT (an explicit choice, e.g. the switcher
 *     form or a future `?loc=`): not one of the caller's active locations ->
 *     `unauthorized`, never a fallback.
 *   - `candidateLocationId` is LENIENT (the `oruwa_location` cookie): ignored
 *     when it is not one of the caller's active locations.
 *   - Otherwise the default: the membership's default location when it is one
 *     of the choices, else the "main store" among the locations with the
 *     strongest access (all > manage > staff): the OLDEST one (`created_at`,
 *     0156; unknown dates last), then by name (DEBT-139 m, L3).
 *
 * Every store list (switcher, cabinet 「店舗」 section) uses the same order
 * (`compareLocationsByMainStore`), so the main store is always first.
 *
 * Input rows come from `api.my_locations` (0151, via the page context 0154):
 * only locations the caller relates to, each with its access. That list only
 * decides what the UI offers; RLS / RPC permission checks on the data stay
 * the boundary, so a wrong choice here can never widen access.
 */

export type LocationAccess = 'all' | 'manage' | 'staff';

/** Flat row of `api.my_locations` (as carried in `api.my_page_context().myLocations`). */
export interface ApiMyLocationRow {
  tenant_id: string;
  location_id: string;
  location_name: string;
  timezone: string;
  is_active: boolean;
  access: string;
  /** 0156; absent on older payloads (-> `createdAt: null`). */
  created_at?: string | null;
}

export interface MyLocation {
  tenantId: string;
  locationId: string;
  locationName: string;
  timezone: string;
  isActive: boolean;
  access: LocationAccess;
  /** When the store was created (ISO timestamp) -- the oldest is the main store. `null` when unknown. */
  createdAt: string | null;
}

const ACCESS_RANK: Record<LocationAccess, number> = { all: 0, manage: 1, staff: 2 };

function isAccess(value: string): value is LocationAccess {
  return value === 'all' || value === 'manage' || value === 'staff';
}

/** Rows -> locations; rows with an unknown access value are dropped (fail closed). */
export function mapMyLocationRows(rows: ApiMyLocationRow[]): MyLocation[] {
  const out: MyLocation[] = [];
  for (const row of rows) {
    if (!isAccess(row.access)) continue;
    out.push({
      tenantId: row.tenant_id,
      locationId: row.location_id,
      locationName: row.location_name,
      timezone: row.timezone,
      isActive: row.is_active,
      access: row.access,
      createdAt: typeof row.created_at === 'string' && row.created_at.length > 0 ? row.created_at : null,
    });
  }
  return out;
}

/** Name, then id. */
export function compareLocationsByName(a: MyLocation, b: MyLocation): number {
  return a.locationName.localeCompare(b.locationName, 'ja') || a.locationId.localeCompare(b.locationId);
}

function createdAtMillis(location: Pick<MyLocation, 'createdAt'>): number | null {
  if (!location.createdAt) return null;
  const ms = Date.parse(location.createdAt);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Main store first: oldest `createdAt` (unknown / unparsable dates last),
 * then name (ja), then id -- the order of the switcher and every store list.
 */
export function compareLocationsByMainStore(a: MyLocation, b: MyLocation): number {
  const ta = createdAtMillis(a);
  const tb = createdAtMillis(b);
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb;
  }
  return compareLocationsByName(a, b);
}

/**
 * A client-sent `locationId` (server action input) checked against the
 * request's choices: the matching choice, else `null` (caller -> unauthorized).
 * Narrows only what a Manager action may target; RLS / RPC checks stay the boundary.
 */
export function findLocationChoice(choices: MyLocation[], locationId: string): MyLocation | null {
  return choices.find((l) => l.locationId === locationId) ?? null;
}

/** Choices -> the account-menu store switcher's options (it shows only with two or more). */
export function toLocationSwitchOptions(choices: MyLocation[]): { locationId: string; locationName: string }[] {
  return choices.map(({ locationId, locationName }) => ({ locationId, locationName }));
}

export interface ResolveActiveLocationOptions {
  /** Strict explicit choice: not an active location of the caller -> `unauthorized`. */
  requestedLocationId?: string | null;
  /** Lenient hint (cookie): ignored when not an active location of the caller. */
  candidateLocationId?: string | null;
  /** The membership's default location (`core.tenant_memberships.location_id`), preferred as the default. */
  defaultLocationId?: string | null;
}

export type ResolveActiveLocationResult =
  | {
      ok: true;
      location: MyLocation;
      /** Active locations of this tenant the caller may switch between, main store first. */
      choices: MyLocation[];
    }
  | { ok: false; reason: 'no_location' | 'unauthorized' };

/**
 * `locations` must already be narrowed to ONE tenant (the active one). Only
 * active locations are ever selected (archived ones stay readable as history
 * elsewhere, never as the working store).
 */
export function resolveActiveLocation(
  locations: MyLocation[],
  options: ResolveActiveLocationOptions = {},
): ResolveActiveLocationResult {
  const choices = locations.filter((l) => l.isActive).sort(compareLocationsByMainStore);
  const { requestedLocationId, candidateLocationId, defaultLocationId } = options;

  if (requestedLocationId) {
    const match = choices.find((l) => l.locationId === requestedLocationId);
    return match ? { ok: true, location: match, choices } : { ok: false, reason: 'unauthorized' };
  }
  if (choices.length === 0) return { ok: false, reason: 'no_location' };

  if (candidateLocationId) {
    const match = choices.find((l) => l.locationId === candidateLocationId);
    if (match) return { ok: true, location: match, choices };
  }
  if (defaultLocationId) {
    const match = choices.find((l) => l.locationId === defaultLocationId);
    if (match) return { ok: true, location: match, choices };
  }

  const strongest = Math.min(...choices.map((l) => ACCESS_RANK[l.access]));
  const location = choices.find((l) => ACCESS_RANK[l.access] === strongest)!;
  return { ok: true, location, choices };
}
