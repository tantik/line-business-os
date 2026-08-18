import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterStaffEntries } from './staff-filter.js';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees.js';

function entry(overrides: Partial<WorkforceStaffManageEntry>): WorkforceStaffManageEntry {
  return {
    staffId: 'staff-1',
    tenantId: 'tenant-1',
    locationId: 'location-1',
    name: 'Sato Yosuke',
    familyName: 'Sato',
    givenName: 'Yosuke',
    email: 'sato@example.com',
    notes: null,
    positionLabel: 'Barista',
    employmentType: 'part_time',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    hourlyWageYen: null,
    hasAccountAccess: false,
    hasProtectedHistory: false,
    ...overrides,
  } as WorkforceStaffManageEntry;
}

test('filterStaffEntries status=active keeps only active staff', () => {
  const staff = [entry({ staffId: 'a', isActive: true }), entry({ staffId: 'b', isActive: false })];
  const result = filterStaffEntries(staff, { status: 'active', query: '' });
  assert.deepEqual(result.map((s) => s.staffId), ['a']);
});

test('filterStaffEntries status=inactive keeps only deactivated staff', () => {
  const staff = [entry({ staffId: 'a', isActive: true }), entry({ staffId: 'b', isActive: false })];
  const result = filterStaffEntries(staff, { status: 'inactive', query: '' });
  assert.deepEqual(result.map((s) => s.staffId), ['b']);
});

test('filterStaffEntries status=all keeps both active and deactivated staff', () => {
  const staff = [entry({ staffId: 'a', isActive: true }), entry({ staffId: 'b', isActive: false })];
  const result = filterStaffEntries(staff, { status: 'all', query: '' });
  assert.deepEqual(result.map((s) => s.staffId).sort(), ['a', 'b']);
});

test('filterStaffEntries query matches name, position, or employment type case-insensitively', () => {
  const staff = [
    entry({ staffId: 'a', name: 'Tanaka Misaki', positionLabel: 'Barista', employmentType: 'part_time' }),
    entry({ staffId: 'b', name: 'Suzuki Kenta', positionLabel: 'Manager', employmentType: 'full_time' }),
  ];
  assert.deepEqual(filterStaffEntries(staff, { status: 'all', query: 'tanaka' }).map((s) => s.staffId), ['a']);
  assert.deepEqual(filterStaffEntries(staff, { status: 'all', query: 'MANAGER' }).map((s) => s.staffId), ['b']);
  assert.deepEqual(filterStaffEntries(staff, { status: 'all', query: 'full_time' }).map((s) => s.staffId), ['b']);
});

test('filterStaffEntries combines status and query filters (both must match)', () => {
  const staff = [
    entry({ staffId: 'a', name: 'Tanaka Misaki', isActive: true }),
    entry({ staffId: 'b', name: 'Tanaka Ken', isActive: false }),
  ];
  assert.deepEqual(filterStaffEntries(staff, { status: 'active', query: 'tanaka' }).map((s) => s.staffId), ['a']);
});

test('filterStaffEntries treats a whitespace-only query as no query', () => {
  const staff = [entry({ staffId: 'a' })];
  assert.deepEqual(filterStaffEntries(staff, { status: 'all', query: '   ' }).map((s) => s.staffId), ['a']);
});

test('filterStaffEntries tolerates a null positionLabel/employmentType when matching a query', () => {
  const staff = [entry({ staffId: 'a', positionLabel: null, employmentType: null, name: 'No Metadata' })];
  assert.deepEqual(filterStaffEntries(staff, { status: 'all', query: 'no metadata' }).map((s) => s.staffId), ['a']);
});
