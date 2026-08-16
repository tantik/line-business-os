import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isModuleEnabled } from './module-guard.js';
import type { TenantModule } from '@/lib/tenant/modules';

const TENANT_ID = 't-1';

test('isModuleEnabled fails closed when the workforce row is missing entirely', () => {
  assert.equal(isModuleEnabled([], TENANT_ID), false);
});

test('isModuleEnabled fails closed when the workforce row exists but is disabled', () => {
  const modules: TenantModule[] = [{ tenantId: TENANT_ID, module: 'workforce', isEnabled: false }];
  assert.equal(isModuleEnabled(modules, TENANT_ID), false);
});

test('isModuleEnabled succeeds when the workforce row exists and is enabled', () => {
  const modules: TenantModule[] = [{ tenantId: TENANT_ID, module: 'workforce', isEnabled: true }];
  assert.equal(isModuleEnabled(modules, TENANT_ID), true);
});

test('isModuleEnabled does not leak another tenant\'s enabled workforce module', () => {
  const modules: TenantModule[] = [{ tenantId: 'other-tenant', module: 'workforce', isEnabled: true }];
  assert.equal(isModuleEnabled(modules, TENANT_ID), false);
});

test('isModuleEnabled does not leak a different enabled module (e.g. booking) for the same tenant', () => {
  const modules: TenantModule[] = [{ tenantId: TENANT_ID, module: 'booking', isEnabled: true }];
  assert.equal(isModuleEnabled(modules, TENANT_ID), false);
});
