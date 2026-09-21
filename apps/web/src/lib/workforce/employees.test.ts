import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPII, blindIndex, bufferToBytea } from '@line-os/db/crypto';
import { getWorkforceStaffDirectoryEntryById, listWorkforceStaffDirectory, listWorkforceStaffForManager, permanentlyDeleteEmployee, setWorkforceEmployeeActive, upsertWorkforceEmployee } from './employees.js';
import { recordingClient } from './test-helpers.js';

const TENANT_ID = 'tenant-a';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const HASH_PEPPER = 'a'.repeat(16);

process.env.PII_ENCRYPTION_KEY = ENCRYPTION_KEY;
process.env.PII_HASH_PEPPER = HASH_PEPPER;

test('listWorkforceStaffDirectory maps rows and sorts by staffId', async () => {
  const { client, calls } = recordingClient({
    data: [
      { staff_id: 'b', tenant_id: TENANT_ID, location_id: 'loc-1', position_label: 'Barista', employment_type: 'part_time', is_active: true, created_at: '2026-01-01' },
      { staff_id: 'a', tenant_id: TENANT_ID, location_id: null, position_label: null, employment_type: null, is_active: false, created_at: '2026-01-02' },
    ],
    error: null,
  });

  const result = await listWorkforceStaffDirectory(client, TENANT_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data.map((e) => e.staffId), ['a', 'b']);
  }
  assert.deepEqual(calls[0], { method: 'schema', args: ['api'] });
  assert.deepEqual(calls[1], { method: 'from', args: ['workforce_staff_directory'] });
});

test('listWorkforceStaffDirectory maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({ data: null, error: { code: '42501', message: 'permission denied' } });
  const result = await listWorkforceStaffDirectory(client, TENANT_ID);
  assert.equal(result.status, 'unauthorized');
});

test('getWorkforceStaffDirectoryEntryById narrows by tenant and staff id', async () => {
  const { client, calls } = recordingClient({
    data: { staff_id: 'staff-1', tenant_id: TENANT_ID, location_id: 'loc-1', position_label: 'Barista', employment_type: null, is_active: true, created_at: '2026-01-01' },
    error: null,
  });
  const result = await getWorkforceStaffDirectoryEntryById(client, TENANT_ID, 'staff-1');
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data?.staffId, 'staff-1');
  assert.ok(calls.some((call) => call.method === 'eq' && call.args[0] === 'tenant_id' && call.args[1] === TENANT_ID));
  assert.ok(calls.some((call) => call.method === 'eq' && call.args[0] === 'staff_id' && call.args[1] === 'staff-1'));
  assert.ok(calls.some((call) => call.method === 'maybeSingle'));
});

test('listWorkforceStaffForManager decrypts name_encrypted server-side', async () => {
  const encrypted = bufferToBytea(encryptPII('Aiko Tanaka', ENCRYPTION_KEY));
  const familyEncrypted = bufferToBytea(encryptPII('Tanaka', ENCRYPTION_KEY));
  const givenEncrypted = bufferToBytea(encryptPII('Aiko', ENCRYPTION_KEY));
  const emailEncrypted = bufferToBytea(encryptPII('aiko@example.com', ENCRYPTION_KEY));
  const { client } = recordingClient({
    data: [
      {
        staff_id: 's1',
        tenant_id: TENANT_ID,
        location_id: 'loc-1',
        name_encrypted: encrypted,
        name_hash: blindIndex('Aiko Tanaka', HASH_PEPPER),
        family_name_encrypted: familyEncrypted,
        given_name_encrypted: givenEncrypted,
        email_encrypted: emailEncrypted,
        email_hash: blindIndex('aiko@example.com', HASH_PEPPER),
        notes_encrypted: null,
        position_label: 'Barista',
        employment_type: 'part_time',
        is_active: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        hourly_wage_yen: 1250,
        has_account_access: false,
      },
    ],
    error: null,
  });

  const result = await listWorkforceStaffForManager(client, TENANT_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data[0]!.name, 'Aiko Tanaka');
    assert.equal(result.data[0]!.familyName, 'Tanaka');
    assert.equal(result.data[0]!.email, 'aiko@example.com');
    assert.equal('nameEncrypted' in result.data[0]!, false);
  }
});

test('upsertWorkforceEmployee (create, no id) inserts and returns the decrypted new row', async () => {
  const encrypted = bufferToBytea(encryptPII('Kenji Sato', ENCRYPTION_KEY));
  const familyEncrypted = bufferToBytea(encryptPII('Sato', ENCRYPTION_KEY));
  const givenEncrypted = bufferToBytea(encryptPII('Kenji', ENCRYPTION_KEY));
  const emailEncrypted = bufferToBytea(encryptPII('kenji@example.com', ENCRYPTION_KEY));
  const { client, calls } = recordingClient({
    data: {
      staff_id: 's2',
      tenant_id: TENANT_ID,
      location_id: 'loc-1',
      name_encrypted: encrypted,
      name_hash: blindIndex('Kenji Sato', HASH_PEPPER),
      family_name_encrypted: familyEncrypted,
      given_name_encrypted: givenEncrypted,
      email_encrypted: emailEncrypted,
      email_hash: blindIndex('kenji@example.com', HASH_PEPPER),
      notes_encrypted: null,
      position_label: null,
      employment_type: null,
      is_active: true,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      hourly_wage_yen: 1250,
      has_account_access: false,
    },
    error: null,
  });

  const result = await upsertWorkforceEmployee(client, TENANT_ID, {
    locationId: 'loc-1', name: 'Kenji Sato', familyName: 'Sato', givenName: 'Kenji', email: 'kenji@example.com', hourlyWageYen: 1250,
  });
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data.name, 'Kenji Sato');
  assert.ok(calls.some((c) => c.method === 'insert'));
  assert.ok(!calls.some((c) => c.method === 'update'));
});

test('upsertWorkforceEmployee (edit, with id) updates and filters by staff_id', async () => {
  const encrypted = bufferToBytea(encryptPII('Kenji Sato', ENCRYPTION_KEY));
  const familyEncrypted = bufferToBytea(encryptPII('Sato', ENCRYPTION_KEY));
  const givenEncrypted = bufferToBytea(encryptPII('Kenji', ENCRYPTION_KEY));
  const emailEncrypted = bufferToBytea(encryptPII('kenji@example.com', ENCRYPTION_KEY));
  const { client, calls } = recordingClient({
    data: {
      staff_id: 's2',
      tenant_id: TENANT_ID,
      location_id: 'loc-1',
      name_encrypted: encrypted,
      name_hash: blindIndex('Kenji Sato', HASH_PEPPER),
      family_name_encrypted: familyEncrypted,
      given_name_encrypted: givenEncrypted,
      email_encrypted: emailEncrypted,
      email_hash: blindIndex('kenji@example.com', HASH_PEPPER),
      notes_encrypted: null,
      position_label: null,
      employment_type: null,
      is_active: true,
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
      hourly_wage_yen: null,
      has_account_access: true,
    },
    error: null,
  });

  const result = await upsertWorkforceEmployee(client, TENANT_ID, {
    id: 's2', locationId: 'loc-1', name: 'Kenji Sato', familyName: 'Sato', givenName: 'Kenji', email: 'kenji@example.com',
  });
  assert.equal(result.status, 'success');
  assert.ok(calls.some((c) => c.method === 'update'));
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'staff_id' && c.args[1] === 's2'));
});

const EDIT_ROW = {
  staff_id: 's2', tenant_id: TENANT_ID, location_id: 'loc-1',
  name_encrypted: bufferToBytea(encryptPII('Kenji Sato', ENCRYPTION_KEY)), name_hash: blindIndex('Kenji Sato', HASH_PEPPER),
  family_name_encrypted: bufferToBytea(encryptPII('Sato', ENCRYPTION_KEY)), given_name_encrypted: bufferToBytea(encryptPII('Kenji', ENCRYPTION_KEY)),
  email_encrypted: bufferToBytea(encryptPII('kenji@example.com', ENCRYPTION_KEY)), email_hash: blindIndex('kenji@example.com', HASH_PEPPER),
  notes_encrypted: null, position_label: null, employment_type: null, is_active: true,
  created_at: '2026-01-01', updated_at: '2026-01-02', hourly_wage_yen: 1300, has_account_access: true,
};

function updatePayload(calls: { method: string; args: unknown[] }[]): Record<string, unknown> {
  const call = calls.find((c) => c.method === 'update');
  assert.ok(call, 'an update call was made');
  return call.args[0] as Record<string, unknown>;
}

test('DEBT-052: an edit that does not send hourly wage / notes / position / employment type leaves those columns out of the UPDATE (never overwrites with null)', async () => {
  const { client, calls } = recordingClient({ data: EDIT_ROW, error: null });
  const result = await upsertWorkforceEmployee(client, TENANT_ID, {
    id: 's2', locationId: 'loc-1', name: 'Kenji Sato', familyName: 'Sato', givenName: 'Kenji', email: 'kenji@example.com',
  });
  assert.equal(result.status, 'success');
  const payload = updatePayload(calls);
  for (const column of ['hourly_wage_yen', 'notes_encrypted', 'position_label', 'employment_type', 'is_active']) {
    assert.ok(!(column in payload), `${column} must not be in the UPDATE when the caller did not send it`);
  }
  assert.ok('name_encrypted' in payload && 'email_encrypted' in payload, 'the identity fields that were sent are still updated');
});

test('an edit that explicitly sends a wage sets it; an explicit null clears it; 0 is a real value', async () => {
  for (const [sent, expected] of [[1450, 1450], [null, null], [0, 0]] as const) {
    const { client, calls } = recordingClient({ data: EDIT_ROW, error: null });
    await upsertWorkforceEmployee(client, TENANT_ID, {
      id: 's2', locationId: 'loc-1', name: 'Kenji Sato', familyName: 'Sato', givenName: 'Kenji', email: 'kenji@example.com',
      hourlyWageYen: sent,
    });
    const payload = updatePayload(calls);
    assert.ok('hourly_wage_yen' in payload);
    assert.equal(payload.hourly_wage_yen, expected);
  }
});

test('an edit that sends notes as null clears them, and only then (encrypted notes are otherwise untouched)', async () => {
  const { client, calls } = recordingClient({ data: EDIT_ROW, error: null });
  await upsertWorkforceEmployee(client, TENANT_ID, {
    id: 's2', locationId: 'loc-1', name: 'Kenji Sato', familyName: 'Sato', givenName: 'Kenji', email: 'kenji@example.com', notes: null,
  });
  assert.equal(updatePayload(calls).notes_encrypted, null);
});

test('create (no id) still stores a missing wage as null', async () => {
  const { client, calls } = recordingClient({ data: EDIT_ROW, error: null });
  await upsertWorkforceEmployee(client, TENANT_ID, {
    locationId: 'loc-1', name: 'Kenji Sato', familyName: 'Sato', givenName: 'Kenji', email: 'kenji@example.com',
  });
  const insert = calls.find((c) => c.method === 'insert');
  assert.ok(insert);
  assert.equal((insert.args[0] as Record<string, unknown>).hourly_wage_yen, null);
});

test('upsertWorkforceEmployee edit returns not_found when RLS/filter matches zero rows', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await upsertWorkforceEmployee(client, TENANT_ID, {
    id: 'missing', locationId: 'loc-1', name: 'Ghost', familyName: 'Ghost', givenName: 'User', email: 'ghost@example.com',
  });
  assert.equal(result.status, 'not_found');
});

test('setWorkforceEmployeeActive returns not_found when no row matches', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await setWorkforceEmployeeActive(client, TENANT_ID, 'missing', false);
  assert.equal(result.status, 'not_found');
});

test('setWorkforceEmployeeActive succeeds', async () => {
  const { client } = recordingClient({ data: { staff_id: 's2', is_active: false }, error: null });
  const result = await setWorkforceEmployeeActive(client, TENANT_ID, 's2', false);
  assert.deepEqual(result, { status: 'success', data: { staffId: 's2', isActive: false } });
});

// Regression coverage for the founder-reported "Delete permanently -> error"
// staff blocker: this service-layer wrapper around api.permanently_delete_employee
// (0056) previously had zero test coverage at all.
test('permanentlyDeleteEmployee calls api.permanently_delete_employee (never a raw DELETE) and succeeds for a disposable staff member with zero history', async () => {
  const { client, calls } = recordingClient({ data: [{ deleted: true, blocked_by_history: false }], error: null });
  const result = await permanentlyDeleteEmployee(client, TENANT_ID, 's-disposable');
  assert.deepEqual(result, { status: 'success', data: { staffId: 's-disposable' } });
  const rpcCall = calls.find((c) => c.method === 'rpc');
  assert.deepEqual(rpcCall?.args, ['permanently_delete_employee', { p_tenant_id: TENANT_ID, p_employee_id: 's-disposable' }]);
});

test('permanentlyDeleteEmployee refuses safely with blocked_by_history for a staff member with protected history, never weakening referential integrity to force success', async () => {
  const { client } = recordingClient({ data: [{ deleted: false, blocked_by_history: true }], error: null });
  const result = await permanentlyDeleteEmployee(client, TENANT_ID, 's-with-history');
  assert.deepEqual(result, { status: 'blocked_by_history' });
});

test('permanentlyDeleteEmployee returns not_found for a zero-row RPC result (not visible/not found/unauthorized), never a fabricated success', async () => {
  const { client } = recordingClient({ data: [], error: null });
  const result = await permanentlyDeleteEmployee(client, TENANT_ID, 'missing');
  assert.deepEqual(result, { status: 'not_found' });
});
