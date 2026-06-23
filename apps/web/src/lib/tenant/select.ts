import type { TenantMembership } from './types';

export type SelectActiveTenantResult =
  | { ok: true; tenant: TenantMembership }
  | { ok: false; reason: 'no_membership' | 'unauthorized' };

/**
 * Pure selection of the active tenant from a user's memberships.
 *
 * - No memberships → `no_membership`.
 * - A `requestedTenantId` that the user is NOT a member of → `unauthorized`
 *   (never silently fall back to another tenant; that would cross tenants).
 * - Otherwise pick the requested tenant, or the first membership as default.
 *
 * Framework-agnostic and side-effect free, so it is fully unit-testable.
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

  return { ok: true, tenant: memberships[0]! };
}
