import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptPII, bufferToBytea } from '@line-os/db/crypto';
import { loadStaffDashboard, STAFF_DASHBOARD_PARTS } from './dashboard';
import { recordingClient } from '../workforce/test-helpers';
import { listWorkforceStaffRoster } from '../workforce/employees';
import { listWorkforceShiftTypes } from '../workforce/shift-types';
import { listMyShiftRequests } from '../workforce/shift-requests';
import { listMyAttendance } from '../workforce/attendance';
import { listMyStaffMessages } from '../workforce/staff-messages';
import { listInventoryItemStatus } from '../inventory/items';
import { listItemResponsesForInstances } from '../operations/tasks';
import { listOpenIssues } from '../issues/issues';

const T = 'tenant-1';
const L = 'loc-1';
const E = 's1';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PII_ENCRYPTION_KEY = ENCRYPTION_KEY;
process.env.PII_HASH_PEPPER = 'p'.repeat(16);

function rpcClient(result: { data?: unknown; error?: unknown } | (() => never), calls: unknown[] = []): SupabaseClient {
  return {
    schema: (schema: string) => ({
      rpc: async (fn: string, args: unknown) => {
        calls.push({ schema, fn, args });
        if (typeof result === 'function') return result();
        return { data: result.data ?? null, error: result.error ?? null };
      },
    }),
  } as unknown as SupabaseClient;
}

const enc = (text: string) => bufferToBytea(encryptPII(text, ENCRYPTION_KEY));
const ts = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00+00:00`;

// ---- realistic raw rows per staff-only part (deliberately out of display order) ----
const requestRows = (kind: string) => [
  { request_id: 'r2', tenant_id: T, location_id: L, employee_id: E, shift_id: null, shift_type_id: 'st1', work_date: '2026-01-09', kind, is_unavailable: false, status: 'pending', details: { note: 'x' }, attendance_id: null, created_at: ts(1), updated_at: ts(1) },
  { request_id: 'r1', tenant_id: T, location_id: L, employee_id: E, shift_id: null, shift_type_id: null, work_date: '2026-01-08', kind, is_unavailable: true, status: 'approved', details: null, attendance_id: 'att1', created_at: ts(1), updated_at: ts(2) },
];
const attendanceRows = [
  { attendance_id: 'att2', tenant_id: T, location_id: L, employee_id: E, shift_id: null, work_date: '2026-01-07', clock_in: ts(7), clock_out: null, actual_break_minutes: 0, status: 'present', transportation_cost: 300, daily_message: null, created_at: ts(7), updated_at: ts(7) },
  { attendance_id: 'att1', tenant_id: T, location_id: L, employee_id: E, shift_id: 'a2', work_date: '2026-01-06', clock_in: null, clock_out: null, actual_break_minutes: 30, status: 'absent', transportation_cost: null, daily_message: 'hi', created_at: ts(6), updated_at: ts(6) },
];
const messageRows = [
  { message_id: 'm2', tenant_id: T, location_id: L, employee_id: E, sender_role: 'manager', sender_user_id: 'u1', body: 'later', is_read: false, read_at: null, read_by: null, archived_at: null, deleted_at: null, created_at: ts(3), updated_at: ts(3) },
  { message_id: 'm1', tenant_id: T, location_id: L, employee_id: E, sender_role: 'weird', sender_user_id: 'u2', body: 'first', is_read: true, read_at: ts(2), read_by: 'u1', archived_at: null, deleted_at: null, created_at: ts(2), updated_at: ts(2) },
];
const rosterRows = [
  { employee_id: 's2', tenant_id: T, location_id: L, name_encrypted: enc('Yamada'), is_active: true },
  { employee_id: E, tenant_id: T, location_id: L, name_encrypted: enc('Aoki'), is_active: true },
];
const inventoryRows = [
  { item_id: 'it2', tenant_id: T, location_id: L, name: 'Milk', unit: 'L', required_quantity: '10.000', reorder_point: 3, sort_order: 1, is_active: false, actual_quantity: null, counted_at: null, counted_by_staff_id: null, shortage_quantity: '0', status: 'unknown', media_path: null },
  { item_id: 'it1', tenant_id: T, location_id: L, name: 'Beans', unit: 'kg', required_quantity: 5, reorder_point: 2, sort_order: 1, is_active: true, actual_quantity: '1.500', counted_at: ts(2), counted_by_staff_id: E, shortage_quantity: 3.5, status: 'shortage', media_path: 'p/1.jpg' },
];
const shiftTypeRows = [
  { shift_type_id: 'st2', tenant_id: T, location_id: L, code: 'LATE', label_ja: '遅番', label_en: null, starts_at_local: '13:00:00', ends_at_local: '21:00:00', break_minutes: 60, is_custom: false, sort_order: 2, is_active: true },
  { shift_type_id: 'st1', tenant_id: T, location_id: L, code: 'DAY', label_ja: '日勤', label_en: 'Day', starts_at_local: '09:00:00', ends_at_local: '17:00:00', break_minutes: 60, is_custom: false, sort_order: 1, is_active: true },
];
const issueRows = [
  { issue_id: 'is1', tenant_id: T, location_id: L, kind: 'issue', category: 'equipment', severity: 'normal', status: 'open', note: 'a', business_date: '2026-01-05', reported_by: 'u1', reported_by_role: 'staff', acknowledged_by: null, acknowledged_at: null, source: 'manual', operations_exception_id: null, created_at: ts(5), updated_at: ts(5), reporter_employee_id: E },
];
const responseRows = [
  { response_id: 'rs1', tenant_id: T, location_id: L, instance_id: 'in1', item_id: 'oi1', response_bool: true, response_numeric: null, response_text: null, recorded_at: ts(10), updated_at: ts(10) },
  { response_id: 'rs2', tenant_id: T, location_id: L, instance_id: 'in2', item_id: 'oi2', response_bool: null, response_numeric: 4.5, response_text: null, recorded_at: ts(10), updated_at: ts(10) },
  { response_id: 'rs3', tenant_id: T, location_id: L, instance_id: 'in1', item_id: 'oi2', response_bool: null, response_numeric: null, response_text: 'ok', recorded_at: ts(10), updated_at: ts(10) },
];

const PARAMS = { fromIso: ts(5), toIsoExclusive: ts(12), today: '2026-01-10', employeeId: E };

function bundle(): Record<string, unknown> {
  return {
    shiftTypes: { rows: shiftTypeRows },
    myPreferenceRequests: { rows: requestRows('preference') },
    myCorrectionRequests: { rows: requestRows('correction') },
    myAttendance: { rows: attendanceRows },
    myStaffMessages: { rows: messageRows },
    staffRoster: { rows: rosterRows },
    inventoryItems: { rows: inventoryRows },
    issuesOpen: { rows: issueRows },
    operationsResponses: { rows: responseRows },
  };
}

test('loadStaffDashboard sends ONE api.staff_dashboard call with the requested parts and inputs', async () => {
  const calls: unknown[] = [];
  await loadStaffDashboard(rpcClient({ data: {} }, calls), T, L, { parts: ['staffRoster', 'myStaffMessages', 'staffRoster'], ...PARAMS });
  assert.deepEqual(calls, [
    { schema: 'api', fn: 'staff_dashboard', args: { p_tenant_id: T, p_location_id: L, p_params: { ...PARAMS, parts: ['staffRoster', 'myStaffMessages'] } } },
  ]);
});

test('staff-only and shared parts map to exactly what their lib function returns for the same rows', async () => {
  const result = await loadStaffDashboard(rpcClient({ data: bundle() }), T, L, { parts: STAFF_DASHBOARD_PARTS, ...PARAMS });
  const cases: [keyof typeof result, unknown][] = [
    ['myPreferenceRequests', await listMyShiftRequests(recordingClient({ data: requestRows('preference'), error: null }).client, T, { kind: 'preference' })],
    ['myCorrectionRequests', await listMyShiftRequests(recordingClient({ data: requestRows('correction'), error: null }).client, T, { kind: 'correction' })],
    ['myAttendance', await listMyAttendance(recordingClient({ data: attendanceRows, error: null }).client, T)],
    ['myStaffMessages', await listMyStaffMessages(recordingClient({ data: messageRows, error: null }).client, T, E)],
    ['staffRoster', await listWorkforceStaffRoster(recordingClient({ data: rosterRows, error: null }).client, T)],
    ['shiftTypes', await listWorkforceShiftTypes(recordingClient({ data: shiftTypeRows, error: null }).client, T)],
    ['issuesOpen', await listOpenIssues(recordingClient({ data: issueRows, error: null }).client, T)],
  ];
  for (const [part, expected] of cases) {
    assert.equal((expected as { status: string }).status, 'success', `${part}: the lib function succeeds on these rows`);
    assert.deepEqual(result[part], expected, `${part} equals the lib function's result`);
  }
  if (result.staffRoster.status === 'success') assert.deepEqual(result.staffRoster.data.map((r) => r.name), ['Yamada', 'Aoki']);
  if (result.myAttendance.status === 'success') assert.deepEqual(result.myAttendance.data.map((r) => r.attendanceId), ['att1', 'att2']);
});

test('inventoryItems keeps only active items, as the Staff view\'s listInventoryItemStatus read', async () => {
  const result = await loadStaffDashboard(rpcClient({ data: bundle() }), T, L, { parts: ['inventoryItems'], ...PARAMS });
  const activeOnly = inventoryRows.filter((row) => row.is_active);
  assert.deepEqual(result.inventoryItems, await listInventoryItemStatus(recordingClient({ data: activeOnly, error: null }).client, T, L));
  if (result.inventoryItems.status === 'success') assert.deepEqual(result.inventoryItems.data.map((i) => i.itemId), ['it1']);
});

test('operationsResponses groups rows by instance, as listItemResponsesForInstances', async () => {
  const result = await loadStaffDashboard(rpcClient({ data: bundle() }), T, L, { parts: ['operationsTodayTasks', 'operationsResponses'], ...PARAMS });
  const expected = await listItemResponsesForInstances(recordingClient({ data: responseRows, error: null }).client, T, ['in1', 'in2']);
  assert.deepEqual(result.operationsResponses, expected);
  if (result.operationsResponses.status === 'success') {
    assert.deepEqual(result.operationsResponses.data.in1?.map((r) => r.responseId), ['rs1', 'rs3']);
  }
});

test('a part error becomes that part\'s own error result; the other parts still succeed', async () => {
  const data = bundle();
  data.myAttendance = { error: { code: '42501', message: 'permission denied for view workforce_attendance' } };
  data.myStaffMessages = { error: { code: 'LBO_ROW_CAP', message: 'List read exceeds 20000 rows; refusing to return a partial list (DEBT-114).' } };
  const result = await loadStaffDashboard(rpcClient({ data }), T, L, { parts: STAFF_DASHBOARD_PARTS, ...PARAMS });
  assert.deepEqual(
    result.myAttendance,
    await listMyAttendance(recordingClient({ data: null, error: { code: '42501', message: 'permission denied for view workforce_attendance' } }).client, T),
  );
  assert.equal(result.myAttendance.status, 'unauthorized');
  assert.deepEqual(result.myStaffMessages, {
    status: 'unexpected_error',
    message: 'List read exceeds 20000 rows; refusing to return a partial list (DEBT-114).',
  });
  assert.equal(result.staffRoster.status, 'success');
});

test('a whole-RPC error or a throw fails every requested part closed; unrequested parts are never a success', async () => {
  const denied = await loadStaffDashboard(rpcClient({ error: { code: '42501', message: 'permission denied for function staff_dashboard' } }), T, L, {
    parts: ['myAttendance', 'staffRoster'],
    ...PARAMS,
  });
  assert.equal(denied.myAttendance.status, 'unauthorized');
  assert.equal(denied.staffRoster.status, 'unauthorized');

  const thrown = await loadStaffDashboard(
    rpcClient(() => {
      throw new Error('network down');
    }),
    T,
    L,
    { parts: ['myStaffMessages'], ...PARAMS },
  );
  assert.deepEqual(thrown.myStaffMessages, { status: 'unexpected_error', message: 'network down' });

  const partial = await loadStaffDashboard(rpcClient({ data: bundle() }), T, L, { parts: ['shiftTypes'], ...PARAMS });
  assert.equal(partial.shiftTypes.status, 'success');
  assert.deepEqual(partial.staffRoster, { status: 'unexpected_error', message: 'Not requested in this staff dashboard load.' });
});

test('missing PII env -> staffRoster is config_error (as listWorkforceStaffRoster), other parts unaffected', async () => {
  const saved = process.env.PII_ENCRYPTION_KEY;
  delete process.env.PII_ENCRYPTION_KEY;
  try {
    const result = await loadStaffDashboard(rpcClient({ data: bundle() }), T, L, { parts: ['staffRoster', 'myAttendance'], ...PARAMS });
    assert.deepEqual(result.staffRoster, await listWorkforceStaffRoster(recordingClient({ data: [], error: null }).client, T));
    assert.equal(result.staffRoster.status, 'config_error');
    assert.equal(result.myAttendance.status, 'success');
  } finally {
    process.env.PII_ENCRYPTION_KEY = saved;
  }
});
