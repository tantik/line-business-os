import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPII, blindIndex, bufferToBytea } from '@line-os/db/crypto';
import { getWorkforceStaffDirectoryEntryById, listWorkforceStaffDirectory, listWorkforceStaffForManager, setWorkforceEmployeeActive, upsertWorkforceEmployee } from './employees.js';
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
