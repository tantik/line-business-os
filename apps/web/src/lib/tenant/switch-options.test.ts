import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTenantSwitchOptions } from './switch-options.js';
import type { TenantMembership } from './types.js';

function membership(tenantId: string, tenantName: string): TenantMembership {
  return { tenantId, tenantSlug: `slug-${tenantId}`, tenantName, tenantKind: 'client', locationId: 'loc', status: 'active' } as TenantMembership;
}

test('toTenantSwitchOptions keeps only id and name, sorted by name', () => {
  const options = toTenantSwitchOptions([membership('b', 'ORUWA Cafe'), membership('a', 'Cafe Aoi')]);
  assert.deepEqual(options, [
    { tenantId: 'a', tenantName: 'Cafe Aoi' },
    { tenantId: 'b', tenantName: 'ORUWA Cafe' },
  ]);
});

test('toTenantSwitchOptions lists a cafe once even with several location memberships', () => {
  const options = toTenantSwitchOptions([membership('a', 'Cafe Aoi'), membership('a', 'Cafe Aoi'), membership('b', 'ORUWA Cafe')]);
  assert.deepEqual(options, [
    { tenantId: 'a', tenantName: 'Cafe Aoi' },
    { tenantId: 'b', tenantName: 'ORUWA Cafe' },
  ]);
});

test('toTenantSwitchOptions returns an empty list for no memberships', () => {
  assert.deepEqual(toTenantSwitchOptions([]), []);
});
