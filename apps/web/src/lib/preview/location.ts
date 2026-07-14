import type { TenantLocation } from '@/lib/tenant/locations';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';

/**
 * Deterministic manager location resolution (architecture plan Section F2).
 * Pure, no I/O - the caller pre-filters `locations` to the resolved tenant.
 *
 * Never silently picks the first row: zero or multiple active locations both
 * fail closed to an explicit blocked state instead of guessing.
 */
export type ManagerLocationResult =
  | { kind: 'none' }
  | { kind: 'ambiguous'; count: number }
  | { kind: 'ok'; location: TenantLocation };

export function resolveManagerLocation(locations: TenantLocation[]): ManagerLocationResult {
  const active = locations.filter((l) => l.isActive);
  if (active.length === 0) return { kind: 'none' };
  if (active.length > 1) return { kind: 'ambiguous', count: active.length };
  return { kind: 'ok', location: active[0]! };
}

/**
 * Strict staff location resolution (architecture plan Section F2).
 *
 * `getMyWorkforceStaffProfile` already reads through
 * `api.workforce_my_staff_profile`, which is backed by the self-scoped
 * `wf_employees_self_read` RLS policy (`user_id = core.current_user_id()`)
 * and an explicit `tenant_id` filter - so "employee `user_id` matches the
 * signed-in user" and "employee tenant matches the resolved tenant" are
 * already guaranteed by the query itself, not something this helper needs to
 * re-derive. What remains for this helper: the employee's `location_id` must
 * resolve to an *active* location within the already-tenant-scoped location
 * list, or the caller fails closed to a neutral "no profile" state - it must
 * never fall back to any other location (unlike the lenient dashboard staff
 * page, which falls back to the tenant's active/first location on mismatch).
 */
export function resolveStaffLocation(
  profile: WorkforceMyStaffProfile,
  tenantLocations: TenantLocation[],
): TenantLocation | null {
  if (!profile.locationId) return null;
  const location = tenantLocations.find((l) => l.locationId === profile.locationId);
  if (!location || !location.isActive) return null;
  return location;
}
