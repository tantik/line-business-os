import type { TenantAccessResult } from '@/lib/tenant/types';
import type { TenantLocation } from '@/lib/tenant/locations';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';

export type StaffProfileFailureReason =
  | 'profile_not_bound'
  | 'profile_read_unauthorized'
  | 'profile_read_failed'
  | 'profile_inactive'
  | 'profile_location_missing'
  | 'profile_location_mismatch'
  | 'profile_location_inactive';

export interface StaffProfileDiagnostic {
  stage: 'profile' | 'location';
  reason: StaffProfileFailureReason;
}

/**
 * Produces a log-safe failure category only. It deliberately carries no
 * tenant, user, employee, or location identifier and no upstream error text.
 */
export function diagnoseStaffProfileFailure(
  profileResult: TenantAccessResult<WorkforceMyStaffProfile | null>,
  tenantLocations?: TenantLocation[],
): StaffProfileDiagnostic | null {
  if (profileResult.status === 'unauthorized') {
    return { stage: 'profile', reason: 'profile_read_unauthorized' };
  }
  if (profileResult.status !== 'success') {
    return { stage: 'profile', reason: 'profile_read_failed' };
  }
  if (!profileResult.data) {
    return { stage: 'profile', reason: 'profile_not_bound' };
  }
  if (!profileResult.data.isActive) {
    return { stage: 'profile', reason: 'profile_inactive' };
  }
  if (!profileResult.data.locationId) {
    return { stage: 'location', reason: 'profile_location_missing' };
  }
  if (!tenantLocations) return null;

  const location = tenantLocations.find((candidate) => candidate.locationId === profileResult.data!.locationId);
  if (!location) {
    return { stage: 'location', reason: 'profile_location_mismatch' };
  }
  if (!location.isActive) {
    return { stage: 'location', reason: 'profile_location_inactive' };
  }
  return null;
}

export function logStaffProfileFailure(diagnostic: StaffProfileDiagnostic): void {
  console.warn('[mame-to-cha staff]', diagnostic);
}
