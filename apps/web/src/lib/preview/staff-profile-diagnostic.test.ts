import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';
import type { TenantLocation } from '@/lib/tenant/locations';
import { diagnoseStaffProfileFailure } from './staff-profile-diagnostic.js';

const profile: WorkforceMyStaffProfile = {
  staffId: 'staff-redacted',
  tenantId: 'tenant-redacted',
  locationId: 'location-redacted',
  positionLabel: null,
  employmentType: 'part_time',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const location: TenantLocation = {
  tenantId: 'tenant-redacted',
  locationId: 'location-redacted',
  locationName: 'Main Cafe',
  timezone: 'Asia/Tokyo',
  isActive: true,
};

test('diagnoses a signed-in account without an employee binding', () => {
  assert.deepEqual(diagnoseStaffProfileFailure({ status: 'success', data: null }), {
    stage: 'profile',
    reason: 'profile_not_bound',
  });
});

test('distinguishes RLS denial from an unexpected profile loader failure', () => {
  assert.deepEqual(diagnoseStaffProfileFailure({ status: 'unauthorized', message: 'redacted' }), {
    stage: 'profile',
    reason: 'profile_read_unauthorized',
  });
  assert.deepEqual(diagnoseStaffProfileFailure({ status: 'unexpected_error', message: 'redacted' }), {
    stage: 'profile',
    reason: 'profile_read_failed',
  });
});

test('diagnoses inactive, missing, mismatched, and inactive-location bindings', () => {
  assert.equal(
    diagnoseStaffProfileFailure({ status: 'success', data: { ...profile, isActive: false } })?.reason,
    'profile_inactive',
  );
  assert.equal(
    diagnoseStaffProfileFailure({ status: 'success', data: { ...profile, locationId: null } })?.reason,
    'profile_location_missing',
  );
  assert.equal(
    diagnoseStaffProfileFailure({ status: 'success', data: profile }, [{ ...location, locationId: 'other' }])
      ?.reason,
    'profile_location_mismatch',
  );
  assert.equal(
    diagnoseStaffProfileFailure({ status: 'success', data: profile }, [{ ...location, isActive: false }])
      ?.reason,
    'profile_location_inactive',
  );
  assert.equal(diagnoseStaffProfileFailure({ status: 'success', data: profile }, [location]), null);
});
