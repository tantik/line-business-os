import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createShiftAssignment,
  getShiftAssignmentById,
  insertDraftShiftAssignments,
  listShiftAssignments,
  mapDraftAssignmentToInsertRow,
  publishShiftAssignments,
  toAutoDistributeExistingAssignment,
  unassignDraftShiftAssignments,
  updateShiftAssignment,
  type WorkforceShiftAssignment,
} from './shift-assignments.js';
import { recordingClient } from './test-helpers.js';
import type { DraftAssignment } from './auto-distribute.js';

const TENANT_ID = 'tenant-a';

const draft: DraftAssignment = {
  employeeId: 'emp-1',
  workDate: '2026-08-03',
  shiftTypeId: 'st-1',
  startsAtLocal: '09:00',
  endsAtLocal: '13:00',
  breakMinutes: 15,
  published: false,
  source: 'auto',
};

test('mapDraftAssignmentToInsertRow converts local wall-clock to a UTC instant via the tenant time zone', () => {
  const row = mapDraftAssignmentToInsertRow(draft, TENANT_ID, 'loc-1', 'Asia/Tokyo');
  assert.equal(row.tenant_id, TENANT_ID);
  assert.equal(row.location_id, 'loc-1');
  assert.equal(row.employee_id, 'emp-1');
  assert.equal(row.starts_at, '2026-08-03T00:00:00.000Z');
  assert.equal(row.ends_at, '2026-08-03T04:00:00.000Z');
  assert.equal(row.published, false);
});

test('toAutoDistributeExistingAssignment converts a read row back to local wall-clock, locked always false', () => {
  const entry: WorkforceShiftAssignment = {
    assignmentId: 'a1',
    tenantId: TENANT_ID,
    locationId: 'loc-1',
    employeeId: 'emp-1',
    shiftTypeId: 'st-1',
    startsAt: '2026-08-03T00:00:00.000Z',
    endsAt: '2026-08-03T04:00:00.000Z',
    breakMinutes: 15,
    role: null,
    notes: null,
    published: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
  const result = toAutoDistributeExistingAssignment(entry, 'Asia/Tokyo');
  assert.deepEqual(result, {
    employeeId: 'emp-1',
    workDate: '2026-08-03',
    shiftTypeId: 'st-1',
    startsAtLocal: '09:00',
    endsAtLocal: '13:00',
    breakMinutes: 15,
    published: true,
    locked: false,
  });
});

test('toAutoDistributeExistingAssignment returns null for an unassigned shift (no employeeId)', () => {
  const entry: WorkforceShiftAssignment = {
    assignmentId: 'a2',
    tenantId: TENANT_ID,
    locationId: 'loc-1',
    employeeId: null,
    shiftTypeId: null,
    startsAt: '2026-08-03T00:00:00.000Z',
    endsAt: '2026-08-03T04:00:00.000Z',
    breakMinutes: 0,
    role: null,
    notes: null,
    published: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
  assert.equal(toAutoDistributeExistingAssignment(entry, 'Asia/Tokyo'), null);
});

test('listShiftAssignments applies fromIso/toIsoExclusive bounds when provided', async () => {
  const { client, calls } = recordingClient({ data: [], error: null });
  await listShiftAssignments(client, TENANT_ID, { fromIso: '2026-08-01T00:00:00.000Z', toIsoExclusive: '2026-08-08T00:00:00.000Z' });
  assert.ok(calls.some((c) => c.method === 'gte' && c.args[0] === 'starts_at'));
  assert.ok(calls.some((c) => c.method === 'lt' && c.args[0] === 'starts_at'));
});

test('getShiftAssignmentById narrows by tenant and assignment id', async () => {
  const { client, calls } = recordingClient({ data: null, error: null });
  const result = await getShiftAssignmentById(client, TENANT_ID, 'assignment-a');
  assert.deepEqual(result, { status: 'success', data: null });
  assert.ok(calls.some((call) => call.method === 'eq' && call.args[0] === 'tenant_id' && call.args[1] === TENANT_ID));
  assert.ok(calls.some((call) => call.method === 'eq' && call.args[0] === 'assignment_id' && call.args[1] === 'assignment-a'));
});

test('insertDraftShiftAssignments skips the network call for an empty draft set', async () => {
  const { client, calls } = recordingClient({ data: [], error: null });
  const result = await insertDraftShiftAssignments(client, []);
  assert.deepEqual(result, { status: 'success', data: { inserted: 0, assignmentIds: [] } });
  assert.equal(calls.length, 0);
});

test('insertDraftShiftAssignments reports the inserted count and the new rows\' ids', async () => {
  const { client } = recordingClient({ data: [{ assignment_id: 'a1' }, { assignment_id: 'a2' }], error: null });
  const rows = [mapDraftAssignmentToInsertRow(draft, TENANT_ID, 'loc-1', 'Asia/Tokyo')];
  const result = await insertDraftShiftAssignments(client, rows);
  assert.deepEqual(result, { status: 'success', data: { inserted: 2, assignmentIds: ['a1', 'a2'] } });
});

test('createShiftAssignment inserts a single published:false row for a specific employee/date/shift-type', async () => {
  const { client, calls } = recordingClient({
    data: {
      assignment_id: 'a3',
      tenant_id: TENANT_ID,
      location_id: 'loc-1',
      employee_id: 'emp-1',
      shift_type_id: 'st-1',
      starts_at: '2026-08-03T00:00:00.000Z',
      ends_at: '2026-08-03T04:00:00.000Z',
      break_minutes: 15,
      role: null,
      notes: null,
      published: false,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    },
    error: null,
  });

  const result = await createShiftAssignment(client, TENANT_ID, 'loc-1', {
    employeeId: 'emp-1',
    shiftTypeId: 'st-1',
    startsAt: '2026-08-03T00:00:00.000Z',
    endsAt: '2026-08-03T04:00:00.000Z',
    breakMinutes: 15,
    role: null,
    notes: null,
  });

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data.assignmentId, 'a3');
    assert.equal(result.data.published, false);
  }
  const insertCall = calls.find((c) => c.method === 'insert');
  assert.ok(insertCall);
  const row = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(row.tenant_id, TENANT_ID);
  assert.equal(row.location_id, 'loc-1');
  assert.equal(row.employee_id, 'emp-1');
  assert.equal(row.published, false);
});

test('createShiftAssignment maps a foreign-key violation (23503) to not_found', async () => {
  const { client } = recordingClient({ data: null, error: { code: '23503', message: 'fk violation' } });
  const result = await createShiftAssignment(client, TENANT_ID, 'loc-1', {
    employeeId: 'nonexistent-employee',
    shiftTypeId: null,
    startsAt: '2026-08-03T00:00:00.000Z',
    endsAt: '2026-08-03T04:00:00.000Z',
    breakMinutes: 0,
    role: null,
    notes: null,
  });
  assert.equal(result.status, 'not_found');
});

test('createShiftAssignment maps an RLS denial to unauthorized', async () => {
  const { client } = recordingClient({ data: null, error: { code: '42501', message: 'row-level security' } });
  const result = await createShiftAssignment(client, TENANT_ID, 'loc-1', {
    employeeId: 'emp-1',
    shiftTypeId: null,
    startsAt: '2026-08-03T00:00:00.000Z',
    endsAt: '2026-08-03T04:00:00.000Z',
    breakMinutes: 0,
    role: null,
    notes: null,
  });
  assert.equal(result.status, 'unauthorized');
});

test('updateShiftAssignment returns not_found when the row is not visible/does not exist', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await updateShiftAssignment(client, TENANT_ID, 'missing', { published: true });
  assert.equal(result.status, 'not_found');
});

test('updateShiftAssignment(employeeId: null) actually writes employee_id: null (Unassign) and the returned row reflects it -- regression for "Unassign appears to confirm but the assignment stays employee-attached"', async () => {
  const unassignedRow = {
    assignment_id: 'a-1',
    tenant_id: TENANT_ID,
    location_id: 'loc-1',
    employee_id: null,
    shift_type_id: 'st-1',
    starts_at: '2026-08-03T00:00:00.000Z',
    ends_at: '2026-08-03T04:00:00.000Z',
    break_minutes: 15,
    role: null,
    notes: null,
    published: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
  const { client, calls } = recordingClient({ data: unassignedRow, error: null });
  const result = await updateShiftAssignment(client, TENANT_ID, 'a-1', { employeeId: null, published: true });
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data.employeeId, null);

  const updateCall = calls.find((c) => c.method === 'update');
  // `employeeId: null !== undefined` so it must be included in the payload
  // as `employee_id: null` -- omitting it here would leave the DB row's
  // existing employee_id untouched, i.e. Unassign silently doing nothing.
  assert.deepEqual(updateCall?.args[0], { employee_id: null, published: true });
});

test('publishShiftAssignments reports the published count and filters published=false within bounds', async () => {
  const { client, calls } = recordingClient({ data: [{ assignment_id: 'a1' }], error: null });
  const result = await publishShiftAssignments(client, TENANT_ID, 'loc-1', '2026-08-01T00:00:00.000Z', '2026-08-08T00:00:00.000Z');
  assert.deepEqual(result, { status: 'success', data: { published: 1 } });
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'published' && c.args[1] === false));
});

test('unassignDraftShiftAssignments skips the network call for an empty id list', async () => {
  const { client, calls } = recordingClient({ data: [], error: null });
  const result = await unassignDraftShiftAssignments(client, TENANT_ID, []);
  assert.deepEqual(result, { status: 'success', data: { unassigned: 0 } });
  assert.equal(calls.length, 0);
});

test('unassignDraftShiftAssignments reports the count, filters published=false, and scopes to the given ids', async () => {
  const { client, calls } = recordingClient({ data: [{ assignment_id: 'a1' }, { assignment_id: 'a2' }], error: null });
  const result = await unassignDraftShiftAssignments(client, TENANT_ID, ['a1', 'a2']);
  assert.deepEqual(result, { status: 'success', data: { unassigned: 2 } });
  assert.ok(calls.some((c) => c.method === 'update' && (c.args[0] as { employee_id: unknown }).employee_id === null));
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'published' && c.args[1] === false));
  assert.ok(calls.some((c) => c.method === 'in' && c.args[0] === 'assignment_id' && (c.args[1] as unknown[]).length === 2));
});
