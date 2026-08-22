import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWorkforceShiftTypeById, listWorkforceShiftTypes, shiftTypeDisplayLabel, shiftTypesForWeekLegend, upsertWorkforceShiftType } from './shift-types.js';
import type { WorkforceShiftType } from './shift-types.js';
import { recordingClient } from './test-helpers.js';

const TENANT_ID = 'tenant-a';
const LOCATION_ID = 'loc-1';

function makeType(overrides: Partial<WorkforceShiftType>): WorkforceShiftType {
  return {
    shiftTypeId: 'st-1',
    tenantId: TENANT_ID,
    locationId: 'loc-1',
    code: 'AM',
    labelJa: '早番',
    labelEn: null,
    startsAtLocal: '09:00',
    endsAtLocal: '13:00',
    breakMinutes: 0,
    isCustom: false,
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

// F05 regression, extended Weekly Schedule Founder Review Round 2
// (2026-08-22): an auto-generated custom shift type's `code` is an internal
// `CUSTOM_<timestamp>` identifier, never a customer-facing label -- every
// Staff/Manager shift selector must resolve through this helper instead of
// rendering `code` directly. The last-resort fallback (both labels blank,
// e.g. seed/fixture data with no name) is now the shift's own time range,
// never `code` -- `code` must never reach the screen under any input.
test('shiftTypeDisplayLabel prefers labelJa, then labelEn, then falls back to the time range -- never code', () => {
  assert.equal(shiftTypeDisplayLabel({ labelJa: '早番', labelEn: 'Early', code: 'AM', startsAtLocal: '07:00', endsAtLocal: '11:00' }), '早番');
  assert.equal(shiftTypeDisplayLabel({ labelJa: '', labelEn: 'Early', code: 'AM', startsAtLocal: '07:00', endsAtLocal: '11:00' }), 'Early');
  assert.equal(
    shiftTypeDisplayLabel({ labelJa: '', labelEn: null, code: 'CUSTOM_1786154377761', startsAtLocal: '10:00', endsAtLocal: '14:00' }),
    '10:00-14:00',
  );
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

test('shiftTypesForWeekLegend returns active types plus any inactive type still referenced in the week', () => {
  const active = makeType({ shiftTypeId: 'am', code: 'AM', sortOrder: 1 });
  const inactiveButUsed = makeType({ shiftTypeId: 'old', code: 'OLD', isActive: false, sortOrder: 2 });
  const inactiveUnused = makeType({ shiftTypeId: 'unused', code: 'UNUSED', isActive: false, sortOrder: 3 });
  const allTypesById = new Map([
    ['am', active],
    ['old', inactiveButUsed],
    ['unused', inactiveUnused],
  ]);

  const result = shiftTypesForWeekLegend([active], [{ shiftTypeId: 'am' }, { shiftTypeId: 'old' }], allTypesById);

  assert.deepEqual(result.map((t) => t.shiftTypeId), ['am', 'old']);
});

test('shiftTypesForWeekLegend drops an inactive type not referenced in the displayed week', () => {
  const active = makeType({ shiftTypeId: 'am' });
  const allTypesById = new Map([['am', active]]);

  const result = shiftTypesForWeekLegend([active], [{ shiftTypeId: null }], allTypesById);

  assert.deepEqual(result.map((t) => t.shiftTypeId), ['am']);
});

test('shiftTypesForWeekLegend sorts by sortOrder then code and never duplicates an already-active type', () => {
  const b = makeType({ shiftTypeId: 'b', code: 'B', sortOrder: 2 });
  const a = makeType({ shiftTypeId: 'a', code: 'A', sortOrder: 1 });
  const allTypesById = new Map([
    ['a', a],
    ['b', b],
  ]);

  const result = shiftTypesForWeekLegend([b, a], [{ shiftTypeId: 'a' }, { shiftTypeId: 'a' }], allTypesById);

  assert.deepEqual(result.map((t) => t.shiftTypeId), ['a', 'b']);
});

const SAVED_ROW = {
  shift_type_id: 'new-id', tenant_id: TENANT_ID, location_id: LOCATION_ID, code: 'CUSTOM_1', label_ja: '早番', label_en: null,
  starts_at_local: '09:00:00', ends_at_local: '13:00:00', break_minutes: 0, is_custom: true, sort_order: 1, is_active: true,
};

test('upsertWorkforceShiftType (A8) rejects a duplicate active label, case/whitespace-insensitive', async () => {
  const { client } = recordingClient({
    data: [{ shift_type_id: 'existing-id', label_ja: ' 早番 ' }],
    error: null,
  });
  const result = await upsertWorkforceShiftType(client, { tenantId: TENANT_ID, locationId: LOCATION_ID, labelJa: '早番', startsAtLocal: '09:00', endsAtLocal: '13:00' });
  assert.equal(result.status, 'duplicate');
});

test('upsertWorkforceShiftType (A8) allows re-saving a type\'s own unchanged label (excluded from the collision check)', async () => {
  const { client } = recordingClient([
    { data: [{ shift_type_id: 'shift-1', label_ja: '早番' }], error: null },
    { data: SAVED_ROW, error: null },
  ]);
  const result = await upsertWorkforceShiftType(client, {
    shiftTypeId: 'shift-1', tenantId: TENANT_ID, locationId: LOCATION_ID, labelJa: '早番', startsAtLocal: '09:00', endsAtLocal: '13:00',
  });
  assert.equal(result.status, 'success');
});

test('upsertWorkforceShiftType (A8) proceeds when no active type shares the label', async () => {
  const { client } = recordingClient([
    { data: [{ shift_type_id: 'other-id', label_ja: '遅番' }], error: null },
    { data: SAVED_ROW, error: null },
  ]);
  const result = await upsertWorkforceShiftType(client, { tenantId: TENANT_ID, locationId: LOCATION_ID, labelJa: '早番', startsAtLocal: '09:00', endsAtLocal: '13:00' });
  assert.equal(result.status, 'success');
});
