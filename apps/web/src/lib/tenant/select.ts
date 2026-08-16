import type { TenantMembership } from './types';

export type SelectActiveTenantResult =
  | { ok: true; tenant: TenantMembership }
  | { ok: false; reason: 'no_membership' | 'unauthorized' };

/**
 * Pure, total-order comparator for tenant memberships.
 *
 * Ordering keys, in priority:
 *   1. `tenantName` ASC
 *   2. `tenantSlug` ASC
 *   3. `locationId` ASC, with `null` sorted LAST
 *   4. `tenantId` ASC - final tie-breaker
 *
 * Because `tenantId` is unique, key 4 guarantees a fully deterministic total
 * order regardless of locale quirks in the name/slug comparison. Side-effect
 * free, so it is safe to use with `[...arr].sort(...)` (never mutate input).
 */
export function compareTenantMemberships(a: TenantMembership, b: TenantMembership): number {
  const byName = a.tenantName.localeCompare(b.tenantName);
  if (byName !== 0) return byName;

  const bySlug = a.tenantSlug.localeCompare(b.tenantSlug);
  if (bySlug !== 0) return bySlug;

  // `null` location sorts after any concrete location id.
  if (a.locationId !== b.locationId) {
    if (a.locationId === null) return 1;
    if (b.locationId === null) return -1;
    const byLocation = a.locationId.localeCompare(b.locationId);
    if (byLocation !== 0) return byLocation;
  }

  return a.tenantId.localeCompare(b.tenantId);
}

/**
 * Options for {@link selectActiveTenant}.
 *
 * Two tenant inputs with DELIBERATELY different trust levels are kept separate
 * (an options object, not positional args) so they can never be confused:
 *
 *   - `requestedTenantId` is STRICT. It models an explicit, intentional request
 *     (e.g. a future URL/route param). A non-member request fails closed with
 *     `unauthorized` - it never falls back to anything.
 *   - `candidateTenantId` is LENIENT. It models a soft hint (e.g. the active
 *     tenant cookie). A non-member or absent candidate is silently ignored and
 *     the deterministic default is used instead - it never escalates to
 *     `unauthorized`.
 */
export type SelectActiveTenantOptions = {
  /** Strict explicit request: non-member -> `unauthorized` (no fallback). */
  requestedTenantId?: string;
  /** Lenient hint (e.g. cookie): non-member -> ignored, use default. */
  candidateTenantId?: string | null;
};

/**
 * Pure selection of the active tenant from a user's memberships.
 *
 * Resolution order (fail-closed):
 *   A. No memberships -> `no_membership`.
 *   B. `requestedTenantId` provided (STRICT): exact member match -> ok;
 *      otherwise -> `unauthorized` (never fall back to candidate or default;
 *      that would cross tenants).
 *   C. No `requestedTenantId` but `candidateTenantId` provided (LENIENT):
 *      exact member match -> ok; otherwise ignore it and use the deterministic
 *      default.
 *   D. Neither provided (or candidate is not a member) -> deterministic default
 *      (lowest by `compareTenantMemberships`).
 *
 * Framework-agnostic and side-effect free (the input array is never mutated),
 * so it is fully unit-testable.
 */
export function selectActiveTenant(
  memberships: TenantMembership[],
  options: SelectActiveTenantOptions = {},
): SelectActiveTenantResult {
  if (memberships.length === 0) return { ok: false, reason: 'no_membership' };

  const { requestedTenantId, candidateTenantId } = options;

  // STRICT path: an explicit request must match a membership or fail closed.
  if (requestedTenantId) {
    const match = memberships.find((m) => m.tenantId === requestedTenantId);
    if (!match) return { ok: false, reason: 'unauthorized' };
    return { ok: true, tenant: match };
  }

  // LENIENT path: honor a candidate only if it is a real membership; a stale or
  // unknown candidate is silently ignored in favor of the deterministic default.
  if (candidateTenantId) {
    const match = memberships.find((m) => m.tenantId === candidateTenantId);
    if (match) return { ok: true, tenant: match };
  }

  const [first] = [...memberships].sort(compareTenantMemberships);
  return { ok: true, tenant: first! };
}
