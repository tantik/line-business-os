import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindEmployeeLineUser, listEmployeeLineLinks, unbindEmployeeLineUser } from './employee-line-links.js';
import { recordingClient } from './test-helpers.js';

const TENANT_ID = 'tenant-a';
const EMPLOYEE_ID = 'employee-1';

process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PII_HASH_PEPPER = 'a'.repeat(16);

test('listEmployeeLineLinks maps rows (no encrypted/hash columns exist to leak)', async () => {
  const { client } = recordingClient({
    data: [
      { link_id: 'l1', tenant_id: TENANT_ID, employee_id: EMPLOYEE_ID, is_active: true, linked_at: '2026-01-01', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ],
    error: null,
  });
  const result = await listEmployeeLineLinks(client, TENANT_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data[0]!.linkId, 'l1');
});

test('bindEmployeeLineUser calls the RPC with encrypted/hashed values, never the raw id', async () => {
  const { client, calls } = recordingClient({
    data: [{ link_id: 'l2', employee_id: EMPLOYEE_ID, is_active: true, linked_at: '2026-01-02' }],
    error: null,
  });

  const result = await bindEmployeeLineUser(client, TENANT_ID, EMPLOYEE_ID, 'U1234567890abcdef');
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data.linkId, 'l2');
    assert.equal(result.data.tenantId, TENANT_ID);
  }

  const rpcCall = calls.find((c) => c.method === 'rpc');
  assert.ok(rpcCall);
  const params = rpcCall!.args[1] as Record<string, unknown>;
  assert.equal(params.p_tenant_id, TENANT_ID);
  assert.equal(params.p_employee_id, EMPLOYEE_ID);
  assert.notEqual(params.p_line_user_id_encrypted, 'U1234567890abcdef');
  assert.notEqual(params.p_line_user_id_hash, 'U1234567890abcdef');
});

test('bindEmployeeLineUser maps a foreign-key violation (23503) to not_found', async () => {
  const { client } = recordingClient({ data: null, error: { code: '23503', message: 'fk violation' } });
  const result = await bindEmployeeLineUser(client, TENANT_ID, 'nonexistent-employee', 'U123');
  assert.equal(result.status, 'not_found');
});

test('bindEmployeeLineUser maps an RLS denial to unauthorized', async () => {
  const { client } = recordingClient({ data: null, error: { code: '42501', message: 'row-level security' } });
  const result = await bindEmployeeLineUser(client, TENANT_ID, EMPLOYEE_ID, 'U123');
  assert.equal(result.status, 'unauthorized');
});

test('unbindEmployeeLineUser reports unbound: true when a row was deactivated', async () => {
  const { client } = recordingClient({ data: 1, error: null });
  const result = await unbindEmployeeLineUser(client, TENANT_ID, EMPLOYEE_ID);
  assert.deepEqual(result, { status: 'success', data: { unbound: true } });
});

test('unbindEmployeeLineUser reports unbound: false when nothing was active', async () => {
  const { client } = recordingClient({ data: 0, error: null });
  const result = await unbindEmployeeLineUser(client, TENANT_ID, EMPLOYEE_ID);
  assert.deepEqual(result, { status: 'success', data: { unbound: false } });
});
