import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWorkforceShiftTypeById, listWorkforceShiftTypes, shiftTypeDisplayLabel } from './shift-types.js';
import { recordingClient } from './test-helpers.js';

const TENANT_ID = 'tenant-a';

// F05 regression: an auto-generated custom shift type's `code` is an
// internal `CUSTOM_<timestamp>` identifier, never a customer-facing label -
// every Staff/Manager shift selector must resolve through this helper
// instead of rendering `code` directly.
test('shiftTypeDisplayLabel prefers labelJa, then labelEn, then falls back to code', () => {
  assert.equal(shiftTypeDisplayLabel({ labelJa: '早番', labelEn: 'Early', code: 'AM' }), '早番');
  assert.equal(shiftTypeDisplayLabel({ labelJa: '', labelEn: 'Early', code: 'AM' }), 'Early');
  assert.equal(shiftTypeDisplayLabel({ labelJa: '', labelEn: null, code: 'CUSTOM_1786154377761' }), 'CUSTOM_1786154377761');
});

test('listWorkforceShiftTypes maps rows and sorts by sortOrder then code', async () => {
  const { client } = recordingClient({
    data: [
      { shift_type_id: 't2', tenant_id: TENANT_ID, location_id: 'loc-1', code: '2', label_ja: '遅番', label_en: null, starts_at_local: '13:00:00', ends_at_local: '17:00:00', break_minutes: 0, is_custom: false, sort_order: 2, is_active: true },
      { shift_type_id: 't1', tenant_id: TENANT_ID, location_id: 'loc-1', code: '1', label_ja: '早番', label_en: null, starts_at_local: '09:00:00', ends_at_local: '13:00:00', break_minutes: 0, is_custom: false, sort_order: 1, is_active: true },
    ],
    error: null,
  });

  const result = await listWorkforceShiftTypes(client, TENANT_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data.map((t) => t.shiftTypeId), ['t1', 't2']);
    assert.deepEqual(result.data.map((t) => [t.startsAtLocal, t.endsAtLocal]), [['09:00', '13:00'], ['13:00', '17:00']]);
  }
});

test('listWorkforceShiftTypes maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({ data: null, error: { code: '42501', message: 'permission denied' } });
  const result = await listWorkforceShiftTypes(client, TENANT_ID);
  assert.equal(result.status, 'unauthorized');
});

test('getWorkforceShiftTypeById narrows by tenant and shift type id', async () => {
  const { client, calls } = recordingClient({ data: {
    shift_type_id: 'shift-1', tenant_id: TENANT_ID, location_id: 'loc-1', code: 'AM', label_ja: '午前', label_en: 'AM',
    starts_at_local: '07:00:00', ends_at_local: '15:00:00', break_minutes: 60, is_custom: false, sort_order: 1, is_active: true,
  }, error: null });
  const result = await getWorkforceShiftTypeById(client, TENANT_ID, 'shift-1');
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data?.startsAtLocal, '07:00');
  assert.ok(calls.some((call) => call.method === 'eq' && call.args[0] === 'tenant_id' && call.args[1] === TENANT_ID));
  assert.ok(calls.some((call) => call.method === 'eq' && call.args[0] === 'shift_type_id' && call.args[1] === 'shift-1'));
  assert.ok(calls.some((call) => call.method === 'maybeSingle'));
});
