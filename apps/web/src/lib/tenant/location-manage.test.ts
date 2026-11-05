import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocation,
  hasLocationManageAccess,
  LOCATION_MANAGE_ERROR_CODES,
  mapLocationManageError,
  moveEmployeeLocation,
  moveTargets,
  parseCreateLocationInput,
  parseLocationName,
  parseMoveEmployeeInput,
  parseRenameLocationInput,
  parseSetLocationActiveInput,
  renameLocation,
  setLocationActive,
  tenantStoreGroups,
} from './location-manage.js';
import type { MyLocation } from './active-location.js';
import { recordingClient } from '../workforce/test-helpers.js';
import { managerScopeCopy, moveStoreCopy, storesCopy } from '../../app/(protected)/manager/stores-i18n.js';

const T = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const E = '0f8fad5b-d9cb-469f-a165-70867728950e';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

test('parseLocationName trims ASCII and full-width spaces and enforces 1-60 code points', () => {
  assert.equal(parseLocationName('  駅前店　'), '駅前店');
  assert.equal(parseLocationName('a'.repeat(60)), 'a'.repeat(60));
  assert.equal(parseLocationName('𠮷'.repeat(60)), '𠮷'.repeat(60), 'astral characters count once (char_length)');
  for (const bad of ['', '   ', '　　', 'a'.repeat(61), '店\n舗', 'x\u0000', null, undefined, 42, 'a'.repeat(500)]) {
    assert.equal(parseLocationName(bad), null, String(bad).slice(0, 20));
  }
});

test('form parsers: ids are canonical UUIDs, flags are exact, nothing is defaulted', () => {
  assert.deepEqual(parseCreateLocationInput(form({ name: ' 本店 ' })), { name: '本店' });
  assert.equal(parseCreateLocationInput(form({})), null);
  assert.deepEqual(parseRenameLocationInput(form({ locationId: A.toUpperCase(), name: '新店' })), { locationId: A, name: '新店' });
  assert.equal(parseRenameLocationInput(form({ locationId: 'x', name: '新店' })), null);
  assert.equal(parseRenameLocationInput(form({ locationId: A, name: '' })), null);
  assert.deepEqual(parseSetLocationActiveInput(form({ locationId: A, isActive: 'false' })), { locationId: A, isActive: false });
  assert.deepEqual(parseSetLocationActiveInput(form({ locationId: A, isActive: 'true' })), { locationId: A, isActive: true });
  for (const flag of ['', '0', 'FALSE', 'off']) assert.equal(parseSetLocationActiveInput(form({ locationId: A, isActive: flag })), null);
  assert.equal(parseSetLocationActiveInput(form({ locationId: A })), null, 'a missing flag must never archive');
  assert.deepEqual(parseMoveEmployeeInput(form({ staffId: E, locationId: B })), { employeeId: E, locationId: B });
  assert.equal(parseMoveEmployeeInput(form({ staffId: E })), null);
  assert.equal(parseMoveEmployeeInput(form({ staffId: 'nope', locationId: B })), null);
});

test('mapLocationManageError maps every RPC refusal to its own code', () => {
  const cases: [string, string, string][] = [
    ['28000', 'not_authenticated', 'not_authenticated'],
    ['42501', 'permission_denied', 'permission_denied'],
    ['P0001', 'invalid_location_name', 'invalid_name'],
    ['P0001', 'location_name_taken', 'name_taken'],
    ['P0001', 'location_limit_reached', 'limit_reached'],
    ['P0001', 'invalid_timezone', 'invalid_timezone'],
    ['P0001', 'tenant_not_active', 'tenant_not_active'],
    ['P0001', 'location_not_found', 'location_not_found'],
    ['P0001', 'last_active_location', 'last_active_location'],
    ['P0001', 'location_has_active_staff', 'has_active_staff'],
    ['P0001', 'employee_has_future_shifts', 'has_future_shifts'],
    ['P0001', 'employee_inactive', 'employee_inactive'],
    ['P0001', 'employee_has_no_location', 'employee_has_no_location'],
    ['P0001', 'workforce_module_disabled', 'module_disabled'],
    ['22004', 'invalid_argument: ...', 'invalid_input'],
    ['22023', 'invalid_argument: ...', 'invalid_input'],
    ['XX000', 'boom', 'unexpected'],
  ];
  for (const [code, message, expected] of cases) assert.equal(mapLocationManageError({ code, message }), expected, message);
  assert.equal(mapLocationManageError(null), 'unexpected');
  // 42501 always reads as permission_denied (also the no-existence-oracle "unknown id" case)
  assert.equal(mapLocationManageError({ code: '42501', message: 'employee_location_change_requires_move' }), 'permission_denied');
});

test('every error code has non-empty, different JA and EN copy; the agreed meanings are present', () => {
  for (const code of LOCATION_MANAGE_ERROR_CODES) {
    const ja = storesCopy.ja.errors[code];
    const en = storesCopy.en.errors[code];
    assert.ok(ja && ja.length > 0, `ja ${code}`);
    assert.ok(en && en.length > 0, `en ${code}`);
    assert.notEqual(ja, en, code);
  }
  assert.equal(Object.keys(storesCopy.ja.errors).length, LOCATION_MANAGE_ERROR_CODES.length, 'no stray / missing ja codes');
  assert.equal(Object.keys(storesCopy.en.errors).length, LOCATION_MANAGE_ERROR_CODES.length, 'no stray / missing en codes');
  assert.match(storesCopy.ja.errors.limit_reached, /ORUWAサポート/);
  assert.match(storesCopy.en.errors.limit_reached, /ORUWA support/);
  assert.match(storesCopy.ja.errors.has_active_staff, /移動するか、無効に/);
  assert.match(storesCopy.ja.errors.last_active_location, /少なくとも1つ/);
  assert.match(storesCopy.ja.errors.has_future_shifts, /シフト/);
  assert.equal(storesCopy.ja.heading, '店舗');
  assert.equal(storesCopy.ja.archivedHeading, 'アーカイブ済み');
  assert.equal(managerScopeCopy.ja.location, 'この店舗のみ');
  assert.equal(managerScopeCopy.ja.tenant, '全店舗');
  assert.equal(moveStoreCopy.ja.button, '別の店舗へ移動');
});

test('every copy string is filled in both languages (no empty value)', () => {
  for (const table of [storesCopy, managerScopeCopy, moveStoreCopy] as const) {
    for (const lang of ['ja', 'en'] as const) {
      const entries = Object.entries(table[lang] as unknown as Record<string, unknown>);
      assert.deepEqual(Object.keys(table.ja).sort(), Object.keys(table.en).sort());
      for (const [key, value] of entries) {
        if (typeof value === 'string') assert.ok(value.length > 0, `${lang}.${key}`);
        else if (typeof value === 'function') assert.ok(String((value as (...a: unknown[]) => string)('X', 2)).length > 0, `${lang}.${key}()`);
      }
    }
  }
});

test('move success copy mentions the cancelled count only when > 0', () => {
  assert.equal(moveStoreCopy.ja.moved('駅前店', 0), '「駅前店」へ移動しました。');
  assert.match(moveStoreCopy.ja.moved('駅前店', 3), /3件/);
  assert.equal(moveStoreCopy.en.moved('Ekimae', 0), 'Moved to “Ekimae”.');
  assert.match(moveStoreCopy.en.moved('Ekimae', 1), /1 pending request was cancelled/);
  assert.match(moveStoreCopy.en.moved('Ekimae', 2), /2 pending requests were cancelled/);
});

function loc(tenantId: string, locationId: string, locationName: string, isActive: boolean, createdAt: string | null): MyLocation {
  return { tenantId, locationId, locationName, timezone: 'Asia/Tokyo', isActive, access: 'all', createdAt };
}

test('tenantStoreGroups: one tenant only, main store (oldest) first, archived in their own group', () => {
  const groups = tenantStoreGroups(
    [
      loc(T, B, '駅前店', true, '2026-11-04T00:00:00Z'),
      loc(T2, C, 'Other cafe', true, '2020-01-01T00:00:00Z'),
      loc(T, C, '旧店', false, '2024-01-01T00:00:00Z'),
      loc(T, A, '本店', true, '2025-04-01T00:00:00Z'),
    ],
    T,
  );
  assert.deepEqual(groups.active.map((s) => s.locationName), ['本店', '駅前店']);
  assert.deepEqual(groups.archived.map((s) => s.locationName), ['旧店']);
});

test('moveTargets: other open stores only', () => {
  const stores = [
    { locationId: A, locationName: '本店', isActive: true, createdAt: null },
    { locationId: B, locationName: '駅前店', isActive: true, createdAt: null },
    { locationId: C, locationName: '旧店', isActive: false, createdAt: null },
  ];
  assert.deepEqual(moveTargets(stores, A).map((s) => s.locationId), [B]);
  assert.deepEqual(moveTargets(stores, null).map((s) => s.locationId), [A, B]);
});

test('RPC calls: right function, named args, tolerant result parsing', async () => {
  const created = recordingClient({ data: { location_id: A, counts: {} }, error: null });
  assert.deepEqual(await createLocation(created.client, T, '駅前店'), { status: 'success', data: { locationId: A } });
  assert.deepEqual(created.calls[1], { method: 'rpc', args: ['create_location', { p_tenant_id: T, p_name: '駅前店' }] });

  const renamed = recordingClient({ data: { location_id: A, changed: true }, error: null });
  assert.deepEqual(await renameLocation(renamed.client, A, '新店'), { status: 'success', data: { changed: true } });
  assert.deepEqual(renamed.calls[1], { method: 'rpc', args: ['rename_location', { p_location_id: A, p_name: '新店' }] });

  const archived = recordingClient({ data: { location_id: A, is_active: false, changed: true }, error: null });
  assert.deepEqual(await setLocationActive(archived.client, A, false), { status: 'success', data: { isActive: false, changed: true } });
  assert.deepEqual(archived.calls[1], { method: 'rpc', args: ['set_location_active', { p_location_id: A, p_is_active: false }] });

  const moved = recordingClient({ data: { employee_id: E, from_location_id: A, to_location_id: B, changed: true, cancelled_requests: 2 }, error: null });
  assert.deepEqual(await moveEmployeeLocation(moved.client, E, B), { status: 'success', data: { changed: true, cancelledRequests: 2 } });
  assert.deepEqual(moved.calls[1], { method: 'rpc', args: ['move_employee_location', { p_employee_id: E, p_location_id: B }] });

  const oldPayload = recordingClient({ data: { employee_id: E, changed: true }, error: null });
  assert.deepEqual(await moveEmployeeLocation(oldPayload.client, E, B), { status: 'success', data: { changed: true, cancelledRequests: 0 } }, 'no count (pre-0156) -> 0');
  const badCount = recordingClient({ data: { changed: true, cancelled_requests: -1 }, error: null });
  assert.deepEqual(await moveEmployeeLocation(badCount.client, E, B), { status: 'success', data: { changed: true, cancelledRequests: 0 } }, 'a bad count reads as 0');
});

test('RPC calls map errors and an empty / malformed result', async () => {
  const limit = recordingClient({ data: null, error: { code: 'P0001', message: 'location_limit_reached' } });
  assert.deepEqual(await createLocation(limit.client, T, 'x'), { status: 'error', code: 'limit_reached' });
  const staff = recordingClient({ data: null, error: { code: 'P0001', message: 'location_has_active_staff' } });
  assert.deepEqual(await setLocationActive(staff.client, A, false), { status: 'error', code: 'has_active_staff' });
  const shifts = recordingClient({ data: null, error: { code: 'P0001', message: 'employee_has_future_shifts' } });
  assert.deepEqual(await moveEmployeeLocation(shifts.client, E, B), { status: 'error', code: 'has_future_shifts' });
  for (const data of [null, [], 'x']) {
    const empty = recordingClient({ data, error: null });
    assert.deepEqual(await renameLocation(empty.client, A, 'x'), { status: 'error', code: 'unexpected' });
  }
});

test('hasLocationManageAccess checks core.location.manage tenant-wide and fails closed', async () => {
  const yes = recordingClient({ data: true, error: null });
  assert.equal(await hasLocationManageAccess(yes.client, T), true);
  assert.deepEqual(yes.calls[1], { method: 'rpc', args: ['has_permission', { p_tenant_id: T, p_permission: 'core.location.manage', p_location_id: null }] });
  assert.equal(await hasLocationManageAccess(recordingClient({ data: true, error: { code: 'XX000', message: 'boom' } }).client, T), false);
  assert.equal(await hasLocationManageAccess(recordingClient({ data: 'true', error: null }).client, T), false);
});
