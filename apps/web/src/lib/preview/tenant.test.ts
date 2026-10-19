import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectPreviewMembership } from './tenant-select.js';
import type { TenantMembership } from '@/lib/tenant/types';

const TARGET_SLUG = 'target-tenant';

function membership(overrides: Partial<TenantMembership> = {}): TenantMembership {
  return {
    tenantId: 't-1',
    tenantSlug: TARGET_SLUG,
    tenantName: 'Target Tenant',
    tenantKind: 'client',
    locationId: null,
    status: 'active',
    ...overrides,
  };
}

test('selectPreviewMembership finds the target-slug membership among several', () => {
  const memberships = [
    membership({ tenantId: 'other', tenantSlug: 'some-other-tenant' }),
    membership({ tenantId: 't-1' }),
  ];
  const result = selectPreviewMembership(memberships, TARGET_SLUG);
  assert.ok(result);
  assert.equal(result!.tenantId, 't-1');
});

test('selectPreviewMembership fails closed when there is no membership at all', () => {
  assert.equal(selectPreviewMembership([], TARGET_SLUG), null);
});

test('selectPreviewMembership fails closed for a foreign-tenant-only membership set', () => {
  const memberships = [membership({ tenantId: 'other', tenantSlug: 'target-tenant-tokyo' })];
  assert.equal(selectPreviewMembership(memberships, TARGET_SLUG), null);
});

test('selectPreviewMembership ignores a non-active target-slug membership', () => {
  const memberships = [membership({ status: 'invited' })];
  assert.equal(selectPreviewMembership(memberships, TARGET_SLUG), null);
});
