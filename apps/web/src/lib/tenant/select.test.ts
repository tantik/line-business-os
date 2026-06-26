import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTenantMemberships, selectActiveTenant } from './select.js';
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

/** Membership builder with explicit sort keys for ordering/tie-break tests. */
function tenant(overrides: Partial<TenantMembership>): TenantMembership {
  return {
    tenantId: 'id',
    tenantSlug: 'slug',
    tenantName: 'name',
    tenantKind: 'client',
    locationId: null,
    status: 'active',
    ...overrides,
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

// ---------------------------------------------------------------------------
// Phase 1G Stage 1 - deterministic default active tenant.
//
// The default (no requestedTenantId) must be stable regardless of the input
// order, ordered by tenantName -> tenantSlug -> locationId (nulls last) ->
// tenantId. The explicit-request path (override + fail-closed) is unchanged.
// ---------------------------------------------------------------------------

test('selectActiveTenant default is deterministic for out-of-order input', () => {
  const result = selectActiveTenant([membership('c'), membership('a'), membership('b')]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.tenant.tenantId, 'a');
});

test('selectActiveTenant default is identical for reversed input', () => {
  const ascending = [membership('a'), membership('b'), membership('c')];
  const reversed = [...ascending].reverse();
  const r1 = selectActiveTenant(ascending);
  const r2 = selectActiveTenant(reversed);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  if (r1.ok && r2.ok) assert.equal(r1.tenant.tenantId, r2.tenant.tenantId);
});

test('selectActiveTenant does not mutate the input array', () => {
  const input = [membership('c'), membership('a'), membership('b')];
  const snapshot = input.map((m) => m.tenantId);
  selectActiveTenant(input);
  assert.deepEqual(
    input.map((m) => m.tenantId),
    snapshot,
    'input array order must be preserved',
  );
});

test('selectActiveTenant tie-break: equal name -> tenantSlug decides', () => {
  const result = selectActiveTenant([
    tenant({ tenantId: 'x', tenantName: 'Acme', tenantSlug: 'b' }),
    tenant({ tenantId: 'y', tenantName: 'Acme', tenantSlug: 'a' }),
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.tenant.tenantId, 'y');
});

test('selectActiveTenant tie-break: equal name + slug -> locationId decides', () => {
  const result = selectActiveTenant([
    tenant({ tenantId: 'x', tenantName: 'Acme', tenantSlug: 's', locationId: 'loc-b' }),
    tenant({ tenantId: 'y', tenantName: 'Acme', tenantSlug: 's', locationId: 'loc-a' }),
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.tenant.tenantId, 'y');
});

test('selectActiveTenant tie-break: null locationId sorts last', () => {
  const result = selectActiveTenant([
    tenant({ tenantId: 'x', tenantName: 'Acme', tenantSlug: 's', locationId: null }),
    tenant({ tenantId: 'y', tenantName: 'Acme', tenantSlug: 's', locationId: 'loc-a' }),
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.tenant.tenantId, 'y');
});

test('selectActiveTenant tie-break: equal name + slug + location -> tenantId decides', () => {
  const result = selectActiveTenant([
    tenant({ tenantId: 'id-b', tenantName: 'Acme', tenantSlug: 's', locationId: 'loc' }),
    tenant({ tenantId: 'id-a', tenantName: 'Acme', tenantSlug: 's', locationId: 'loc' }),
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.tenant.tenantId, 'id-a');
});

test('selectActiveTenant requestedTenantId overrides the deterministic default', () => {
  // Default would be 'a'; an explicit valid member id must win.
  const result = selectActiveTenant([membership('a'), membership('b'), membership('c')], 'c');
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.tenant.tenantId, 'c');
});

test('selectActiveTenant invalid requestedTenantId is unauthorized, never a fallback', () => {
  const result = selectActiveTenant([membership('a'), membership('b')], 'zzz');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'unauthorized');
});

// ---------------------------------------------------------------------------
// compareTenantMemberships - pure comparator contract.
// ---------------------------------------------------------------------------

test('compareTenantMemberships produces a stable total order', () => {
  const items = [
    tenant({ tenantId: 'id-2', tenantName: 'Beta', tenantSlug: 's', locationId: null }),
    tenant({ tenantId: 'id-1', tenantName: 'Alpha', tenantSlug: 'b', locationId: 'loc-2' }),
    tenant({ tenantId: 'id-3', tenantName: 'Alpha', tenantSlug: 'b', locationId: 'loc-1' }),
    tenant({ tenantId: 'id-4', tenantName: 'Alpha', tenantSlug: 'a', locationId: null }),
  ];
  const sorted = [...items].sort(compareTenantMemberships).map((m) => m.tenantId);
  // Alpha/a/null, Alpha/b/loc-1, Alpha/b/loc-2, Beta/...
  assert.deepEqual(sorted, ['id-4', 'id-3', 'id-1', 'id-2']);
});

test('compareTenantMemberships returns 0 for equal sort keys', () => {
  const a = tenant({ tenantId: 'same', tenantName: 'N', tenantSlug: 's', locationId: 'l' });
  const b = tenant({ tenantId: 'same', tenantName: 'N', tenantSlug: 's', locationId: 'l' });
  assert.equal(compareTenantMemberships(a, b), 0);
});
