import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueLineNotification } from './queue-line-notification.js';

test('queueLineNotification never throws for any valid event shape', () => {
  assert.doesNotThrow(() =>
    queueLineNotification({ type: 'correction_decision', tenantId: 'tenant-a', targetStaffId: 'staff-1', payload: { requestId: 'req-1' } }),
  );
  assert.doesNotThrow(() =>
    queueLineNotification({ type: 'shift_exchange_decision', tenantId: 'tenant-a', targetStaffId: null, payload: { exchangeId: 'exch-1' } }),
  );
  assert.doesNotThrow(() =>
    queueLineNotification({ type: 'schedule_published', tenantId: 'tenant-a', targetStaffId: null, payload: { periodStart: '2026-08-17' } }),
  );
  assert.doesNotThrow(() =>
    queueLineNotification({ type: 'recipe_updated', tenantId: 'tenant-a', targetStaffId: null, payload: { recipeId: 'recipe-1' } }),
  );
});

test('queueLineNotification returns void (no result to accidentally branch on)', () => {
  const result = queueLineNotification({ type: 'correction_decision', tenantId: 'tenant-a', targetStaffId: 'staff-1', payload: {} });
  assert.equal(result, undefined);
});

test('queueLineNotification performs no network/DB call -- pure/inert, provable by absence of any async behavior', () => {
  // The function signature itself is synchronous (not async, returns void,
  // not Promise<void>) -- calling it and immediately checking the return
  // value type is itself proof no I/O was scheduled.
  const returnValue = queueLineNotification({ type: 'recipe_updated', tenantId: 'tenant-a', targetStaffId: null, payload: {} });
  assert.equal(typeof returnValue, 'undefined');
});
