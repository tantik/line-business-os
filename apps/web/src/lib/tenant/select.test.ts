import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectActiveTenant } from './select.js';
import type { TenantMembership } from './types.js';

function membership(tenantId: string): TenantMembership {
  return {
    tenantId,
    tenantSlug: `slug-${tenantId}`,
    tenantName: `Tenant ${tenantId}`,
    tenantKind: 'client',
    locationId: null,
    status: 'active',
  };
}

test('selectActiveTenant returns no_membership for an empty list', () => {
  const result = selectActiveTenant([]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'no_membership');
});

test('selectActiveTenant defaults to the first membership', () => {
  const result = selectActiveTenant([membership('a'), membership('b')]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.tenant.tenantId, 'a');
});

test('selectActiveTenant honors a requested tenant the user belongs to', () => {
  const result = selectActiveTenant([membership('a'), membership('b')], 'b');
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.tenant.tenantId, 'b');
});

test('selectActiveTenant returns unauthorized for a non-member tenant', () => {
  const result = selectActiveTenant([membership('a')], 'zzz');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'unauthorized');
});
