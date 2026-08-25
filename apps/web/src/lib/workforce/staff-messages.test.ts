import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveStaffMessage,
  listMyStaffMessages,
  listStaffMessagesForManager,
  markStaffMessageRead,
  sendManagerMessage,
  sendStaffMessage,
} from './staff-messages.js';
import { recordingClient } from './test-helpers.js';

const TENANT_ID = 'tenant-a';
const EMPLOYEE_ID = 'emp-1';
const LOCATION_ID = 'loc-1';

const messageRow = {
  message_id: 'msg-1',
  tenant_id: TENANT_ID,
  location_id: LOCATION_ID,
  employee_id: EMPLOYEE_ID,
  sender_role: 'staff',
  sender_user_id: 'user-1',
  body: 'Running 10 minutes late.',
  is_read: false,
  read_at: null,
  read_by: null,
  archived_at: null,
  deleted_at: null,
  created_at: '2026-08-25T00:00:00.000Z',
  updated_at: '2026-08-25T00:00:00.000Z',
};

test('listMyStaffMessages maps rows and sorts oldest-first', async () => {
  const older = { ...messageRow, message_id: 'msg-older', created_at: '2026-08-24T00:00:00.000Z' };
  const { client, calls } = recordingClient({ data: [messageRow, older], error: null });
  const result = await listMyStaffMessages(client, TENANT_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data.map((m) => m.messageId), ['msg-older', 'msg-1']);
  }
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === TENANT_ID));
});

test('listStaffMessagesForManager maps senderRole and every status field', async () => {
  const managerRow = { ...messageRow, sender_role: 'manager', is_read: true, read_at: '2026-08-25T01:00:00.000Z', read_by: 'mgr-1', archived_at: '2026-08-25T02:00:00.000Z' };
  const { client } = recordingClient({ data: [managerRow], error: null });
  const result = await listStaffMessagesForManager(client, TENANT_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    const m = result.data[0]!;
    assert.equal(m.senderRole, 'manager');
    assert.equal(m.isRead, true);
    assert.equal(m.readAt, '2026-08-25T01:00:00.000Z');
    assert.equal(m.readBy, 'mgr-1');
    assert.equal(m.archivedAt, '2026-08-25T02:00:00.000Z');
  }
});

test('an unrecognized sender_role value falls back to "staff", never crashes', async () => {
  const { client } = recordingClient({ data: [{ ...messageRow, sender_role: 'something-unexpected' }], error: null });
  const result = await listMyStaffMessages(client, TENANT_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data[0]!.senderRole, 'staff');
});

test('sendStaffMessage inserts sender_role=staff and never sends a client-chosen sender_user_id or status column', async () => {
  const { client, calls } = recordingClient({ data: messageRow, error: null });
  const result = await sendStaffMessage(client, TENANT_ID, { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, body: 'hi' });
  assert.equal(result.status, 'success');
  const insertCall = calls.find((c) => c.method === 'insert');
  const payload = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.sender_role, 'staff');
  assert.equal(payload.employee_id, EMPLOYEE_ID);
  assert.equal(payload.location_id, LOCATION_ID);
  assert.ok(!('sender_user_id' in payload), 'sender_user_id must be server/RLS-resolved, never client-supplied');
  assert.ok(!('is_read' in payload) && !('archived_at' in payload) && !('deleted_at' in payload), 'status columns must never be client-supplied on insert');
});

test('sendManagerMessage inserts sender_role=manager into the target employee thread', async () => {
  const { client, calls } = recordingClient({ data: { ...messageRow, sender_role: 'manager' }, error: null });
  const result = await sendManagerMessage(client, TENANT_ID, { employeeId: EMPLOYEE_ID, locationId: LOCATION_ID, body: 'On my way, thanks for the heads up.' });
  assert.equal(result.status, 'success');
  const insertCall = calls.find((c) => c.method === 'insert');
  const payload = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.sender_role, 'manager');
  assert.equal(payload.employee_id, EMPLOYEE_ID);
});

test('markStaffMessageRead only ever writes is_read -- read_at/read_by are DB-trigger-stamped, never sent by the client', async () => {
  const { client, calls } = recordingClient({ data: { ...messageRow, is_read: true }, error: null });
  const result = await markStaffMessageRead(client, TENANT_ID, 'msg-1');
  assert.equal(result.status, 'success');
  const updateCall = calls.find((c) => c.method === 'update');
  assert.deepEqual(updateCall!.args[0], { is_read: true });
});

test('archiveStaffMessage only ever writes archived_at, never body/sender fields', async () => {
  const { client, calls } = recordingClient({ data: { ...messageRow, archived_at: '2026-08-25T03:00:00.000Z' }, error: null });
  const result = await archiveStaffMessage(client, TENANT_ID, 'msg-1');
  assert.equal(result.status, 'success');
  const updateCall = calls.find((c) => c.method === 'update');
  const payload = updateCall!.args[0] as Record<string, unknown>;
  assert.ok('archived_at' in payload);
  assert.ok(!('body' in payload) && !('sender_role' in payload));
});

test('markStaffMessageRead returns not_found when RLS/the row hides the update from the caller (maybeSingle -> null)', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await markStaffMessageRead(client, TENANT_ID, 'someone-elses-thread-message');
  assert.equal(result.status, 'not_found');
});
