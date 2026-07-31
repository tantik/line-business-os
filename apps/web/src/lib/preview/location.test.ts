import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveManagerLocation, resolveStaffLocation } from './location.js';
import type { TenantLocation } from '@/lib/tenant/locations';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';

function location(overrides: Partial<TenantLocation> = {}): TenantLocation {
  return {
    tenantId: 't-1',
    locationId: 'loc-1',
    locationName: 'Main Cafe',
    timezone: 'Asia/Tokyo',
    isActive: true,
    ...overrides,
  };
}

function profile(overrides: Partial<WorkforceMyStaffProfile> = {}): WorkforceMyStaffProfile {
  return {
    staffId: 's-1',
    tenantId: 't-1',
    locationId: 'loc-1',
    positionLabel: null,
    employmentType: 'full_time',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    hourlyWageYen: null,
    ...overrides,
  };
}

test('resolveManagerLocation fails closed for zero active locations', () => {
  const result = resolveManagerLocation([location({ isActive: false })]);
  assert.deepEqual(result, { kind: 'none' });
});

test('resolveManagerLocation fails closed (never silently picks the first) for multiple active locations', () => {
  const result = resolveManagerLocation([
    location({ locationId: 'loc-1' }),
    location({ locationId: 'loc-2' }),
  ]);
  assert.equal(result.kind, 'ambiguous');
  if (result.kind === 'ambiguous') assert.equal(result.count, 2);
});

test('resolveManagerLocation selects the single active location', () => {
  const result = resolveManagerLocation([location({ isActive: false, locationId: 'inactive' }), location({ locationId: 'loc-1' })]);
  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') assert.equal(result.location.locationId, 'loc-1');
});

test('resolveStaffLocation fails closed when the profile has no locationId', () => {
  assert.equal(resolveStaffLocation(profile({ locationId: null }), [location()]), null);
});

test('resolveStaffLocation fails closed when the employee\'s location does not exist in the tenant\'s location list', () => {
  assert.equal(resolveStaffLocation(profile({ locationId: 'missing' }), [location({ locationId: 'loc-1' })]), null);
});

test('resolveStaffLocation fails closed when the matching location is inactive', () => {
  assert.equal(resolveStaffLocation(profile(), [location({ isActive: false })]), null);
});

test('resolveStaffLocation resolves when the employee location matches and is active', () => {
  const result = resolveStaffLocation(profile(), [location()]);
  assert.ok(result);
  assert.equal(result!.locationId, 'loc-1');
});

test('resolveStaffLocation never falls back to another tenant location on mismatch (unlike the lenient dashboard page)', () => {
  const result = resolveStaffLocation(profile({ locationId: 'loc-1' }), [location({ locationId: 'loc-2', isActive: true })]);
  assert.equal(result, null);
});
