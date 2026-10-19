import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderByModule, popupIfModuleEnabled, tenantNavigation } from './module-nav.js';

const T = 'tenant-a';

test('tenantNavigation keeps only the active tenant and sorts by navOrder', () => {
  const nav = tenantNavigation(
    [
      { tenantId: T, module: 'issues', navOrder: 10050 },
      { tenantId: 'other', module: 'booking', navOrder: 1 },
      { tenantId: T, module: 'recipes', navOrder: 10010 },
      { tenantId: T, module: 'ai', navOrder: 1000100 },
    ],
    T,
  );
  assert.deepEqual(nav.order, ['recipes', 'issues', 'ai']);
  assert.equal(nav.enabled.has('booking'), false);
  assert.equal(nav.enabled.has('recipes'), true);
});

test('tenantNavigation with no rows enables nothing', () => {
  const nav = tenantNavigation([], T);
  assert.deepEqual(nav.order, []);
  assert.equal(nav.enabled.size, 0);
});

test('orderByModule follows the module order; items without a module go last, stable', () => {
  const items = [
    { key: 'mail' },
    { key: 'issues', module: 'issues' },
    { key: 'recipes', module: 'recipes' },
    { key: 'review' },
    { key: 'inventory', module: 'inventory' },
  ];
  const keys = orderByModule(items, ['recipes', 'inventory', 'issues']).map((item) => item.key);
  assert.deepEqual(keys, ['recipes', 'inventory', 'issues', 'mail', 'review']);
});

test('orderByModule puts a module missing from the order after the known ones', () => {
  const keys = orderByModule([{ key: 'x', module: 'crm' }, { key: 'y', module: 'recipes' }], ['recipes']).map((i) => i.key);
  assert.deepEqual(keys, ['y', 'x']);
});

test('popupIfModuleEnabled drops a deep link to a switched-off module and keeps the rest', () => {
  const enabled = new Set(['workforce', 'inventory']);
  assert.equal(popupIfModuleEnabled('purchases', enabled), null);
  assert.equal(popupIfModuleEnabled('recipes', enabled), null);
  assert.equal(popupIfModuleEnabled('inventory', enabled), 'inventory');
  assert.equal(popupIfModuleEnabled('weekly-review', enabled), 'weekly-review');
  assert.equal(popupIfModuleEnabled(null, enabled), null);
});
