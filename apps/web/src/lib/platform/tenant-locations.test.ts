import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listPlatformTenantLocations, mapTenantLocationRow, tenantLocationGroups, type PlatformLocationRow } from './tenant-locations.js';
import { recordingClient } from '../workforce/test-helpers.js';

const T1 = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const D = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function apiRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    tenant_id: T1,
    location_id: A,
    location_name: '本店',
    timezone: 'Asia/Tokyo',
    is_active: true,
    created_at: '2026-01-01T00:00:00+00:00',
    active_staff_count: 2,
    ...over,
  };
}

test('mapTenantLocationRow: camelCase, safe defaults, rows without ids dropped', () => {
  assert.deepEqual(mapTenantLocationRow(apiRow()), {
    tenantId: T1,
    locationId: A,
    locationName: '本店',
    timezone: 'Asia/Tokyo',
    isActive: true,
    createdAt: '2026-01-01T00:00:00+00:00',
    activeStaffCount: 2,
  });
  const gaps = mapTenantLocationRow(apiRow({ location_name: null, timezone: null, is_active: null, active_staff_count: -1 }));
  assert.equal(gaps?.locationName, '');
  assert.equal(gaps?.isActive, false, 'unknown state is never shown as open');
  assert.equal(gaps?.activeStaffCount, 0);
  assert.equal(mapTenantLocationRow(apiRow({ active_staff_count: 1.5 }))?.activeStaffCount, 0);
  assert.equal(mapTenantLocationRow(apiRow({ tenant_id: null })), null);
  assert.equal(mapTenantLocationRow(apiRow({ location_id: null })), null);
});

test('tenantLocationGroups: one tenant, open stores oldest first (main), archived apart', () => {
  const rows: PlatformLocationRow[] = [
    { tenantId: T1, locationId: B, locationName: '駅前店', timezone: 'Asia/Tokyo', isActive: true, createdAt: '2026-02-01T00:00:00Z', activeStaffCount: 0 },
    { tenantId: T1, locationId: C, locationName: '旧店', timezone: 'Asia/Tokyo', isActive: false, createdAt: '2025-01-01T00:00:00Z', activeStaffCount: 0 },
    { tenantId: T2, locationId: D, locationName: 'Other', timezone: 'UTC', isActive: true, createdAt: '2020-01-01T00:00:00Z', activeStaffCount: 1 },
    { tenantId: T1, locationId: A, locationName: '本店', timezone: 'Asia/Tokyo', isActive: true, createdAt: '2026-01-01T00:00:00Z', activeStaffCount: 2 },
  ];
  const groups = tenantLocationGroups(rows, T1);
  assert.deepEqual(groups.active.map((r) => r.locationId), [A, B]);
  assert.deepEqual(groups.archived.map((r) => r.locationId), [C]);
  assert.deepEqual(tenantLocationGroups(rows, T2).active.map((r) => r.locationId), [D]);
  assert.deepEqual(tenantLocationGroups(rows, '33333333-3333-3333-3333-333333333333'), { active: [], archived: [] });
});

test('tenantLocationGroups: an unknown created_at sorts last', () => {
  const rows: PlatformLocationRow[] = [
    { tenantId: T1, locationId: A, locationName: 'A', timezone: 'Asia/Tokyo', isActive: true, createdAt: null, activeStaffCount: 0 },
    { tenantId: T1, locationId: B, locationName: 'B', timezone: 'Asia/Tokyo', isActive: true, createdAt: '2026-01-01T00:00:00Z', activeStaffCount: 0 },
  ];
  assert.deepEqual(tenantLocationGroups(rows, T1).active.map((r) => r.locationId), [B, A]);
});

test('listPlatformTenantLocations: one api RPC for every tenant (p_tenant_id null)', async () => {
  const { client, calls } = recordingClient({ data: [apiRow(), apiRow({ location_id: null })], error: null });
  const result = await listPlatformTenantLocations(client);
  assert.equal(result.status, 'success');
  assert.equal(result.status === 'success' && result.data.length, 1);
  assert.deepEqual(calls, [
    { method: 'schema', args: ['api'] },
    { method: 'rpc', args: ['platform_tenant_locations', { p_tenant_id: null }] },
  ]);
});

test('listPlatformTenantLocations: 42501 -> unauthorized, any other error -> error (no raw text)', async () => {
  assert.deepEqual(await listPlatformTenantLocations(recordingClient({ data: null, error: { code: '42501', message: 'not_platform_staff' } }).client), {
    status: 'unauthorized',
  });
  assert.deepEqual(await listPlatformTenantLocations(recordingClient({ data: null, error: { code: 'XX000', message: 'boom' } }).client), { status: 'error' });
  assert.deepEqual(await listPlatformTenantLocations(recordingClient({ data: null, error: null }).client), { status: 'success', data: [] });
});
