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
 * Pure selection of the active tenant from a user's memberships.
 *
 * - No memberships -> `no_membership`.
 * - A `requestedTenantId` that the user is NOT a member of -> `unauthorized`
 *   (never silently fall back to another tenant; that would cross tenants).
 * - Otherwise pick the requested tenant, or the deterministic default
 *   (lowest by `compareTenantMemberships`) when none is requested.
 *
 * Framework-agnostic and side-effect free (the input array is never mutated),
 * so it is fully unit-testable.
 */
export function selectActiveTenant(
  memberships: TenantMembership[],
  requestedTenantId?: string,
): SelectActiveTenantResult {
  if (memberships.length === 0) return { ok: false, reason: 'no_membership' };

  if (requestedTenantId) {
    const match = memberships.find((m) => m.tenantId === requestedTenantId);
    if (!match) return { ok: false, reason: 'unauthorized' };
    return { ok: true, tenant: match };
  }

  const [first] = [...memberships].sort(compareTenantMemberships);
  return { ok: true, tenant: first! };
}
