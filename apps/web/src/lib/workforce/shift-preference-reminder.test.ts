import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPII, bufferToBytea } from '@line-os/db/crypto';
import type { TransactionalEmail, SendEmailResult } from '@/lib/notifications/resend-email';
import { sendShiftPreferenceReminder } from './shift-preference-reminder.js';
import { buildShiftPreferenceReminderEmail, nextMonthPrefix } from './shift-preference-reminder-email.js';
import { recordingClient } from './test-helpers.js';

const TENANT_ID = 'tenant-a';
const EMPLOYEE_ID = '33333333-3333-3333-3333-333333333333';
const LOCATION_ID = '11111111-1111-1111-1111-111111111111';
const NONCE = '55555555-5555-4555-8555-555555555555';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

process.env.PII_ENCRYPTION_KEY = ENCRYPTION_KEY;
process.env.PII_HASH_PEPPER = 'a'.repeat(16);

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    staff_id: EMPLOYEE_ID,
    location_id: LOCATION_ID,
    name_encrypted: bufferToBytea(encryptPII('田中美咲', ENCRYPTION_KEY)),
    email_encrypted: bufferToBytea(encryptPII('misaki@example.com', ENCRYPTION_KEY)),
    is_active: true,
    ...overrides,
  };
}

const LOCATIONS = { data: [{ tenant_id: TENANT_ID, location_id: LOCATION_ID, location_name: 'Main', timezone: 'Asia/Tokyo', is_active: true }], error: null };

function recordingSender(result: SendEmailResult): { sent: TransactionalEmail[]; sendEmail: (email: TransactionalEmail) => Promise<SendEmailResult> } {
  const sent: TransactionalEmail[] = [];
  return {
    sent,
    sendEmail: async (email) => {
      sent.push(email);
      return result;
    },
  };
}

test('nextMonthPrefix rolls December over to January', () => {
  assert.equal(nextMonthPrefix('2026-10-06'), '2026-11');
  assert.equal(nextMonthPrefix('2026-12-31'), '2027-01');
});

test('reminder email carries the name and the target month only, in JA and EN', () => {
  const { subject, text } = buildShiftPreferenceReminderEmail('田中美咲', '2026-11');
  assert.match(subject, /2026年11月/);
  assert.match(subject, /November 2026/);
  assert.match(text, /田中美咲さん/);
  assert.match(text, /Hi 田中美咲,/);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-/i, 'no internal ids');
});

test('sendShiftPreferenceReminder decrypts the address server-side, sends for next month, and returns only the delivery outcome', async () => {
  const { client, calls } = recordingClient([{ data: employeeRow(), error: null }, { data: true, error: null }, LOCATIONS]);
  const sender = recordingSender({ status: 'sent' });
  const result = await sendShiftPreferenceReminder(client, TENANT_ID, { employeeId: EMPLOYEE_ID, nonce: NONCE }, {
    sendEmail: sender.sendEmail,
    todayIso: () => '2026-10-06',
  });

  assert.deepEqual(result, { status: 'success', data: { delivery: 'sent', monthPrefix: '2026-11' } });
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0]!.to, 'misaki@example.com');
  assert.match(sender.sent[0]!.subject, /2026年11月/);
  assert.equal(sender.sent[0]!.idempotencyKey, `shift-pref-reminder/${TENANT_ID}/${EMPLOYEE_ID}/2026-11/${NONCE}`);
  assert.doesNotMatch(JSON.stringify(result), /misaki@example\.com/, 'the address never reaches the client');

  const rpc = calls.find((c) => c.method === 'rpc');
  assert.deepEqual(rpc!.args, ['has_permission', { p_tenant_id: TENANT_ID, p_permission: 'workforce.request.manage', p_location_id: LOCATION_ID }]);
});

test('sendShiftPreferenceReminder reports no_email (and sends nothing) for an employee with no address', async () => {
  const { client } = recordingClient([{ data: employeeRow({ email_encrypted: null }), error: null }, { data: true, error: null }, LOCATIONS]);
  const sender = recordingSender({ status: 'sent' });
  const result = await sendShiftPreferenceReminder(client, TENANT_ID, { employeeId: EMPLOYEE_ID, nonce: NONCE }, { sendEmail: sender.sendEmail, todayIso: () => '2026-10-06' });
  assert.deepEqual(result, { status: 'success', data: { delivery: 'no_email', monthPrefix: '2026-11' } });
  assert.equal(sender.sent.length, 0);
});

test('sendShiftPreferenceReminder maps provider failure and missing configuration to distinct outcomes, never "sent"', async () => {
  for (const [providerResult, delivery] of [
    [{ status: 'failed' }, 'send_failed'],
    [{ status: 'not_configured' }, 'not_configured'],
  ] as const) {
    const { client } = recordingClient([{ data: employeeRow(), error: null }, { data: true, error: null }, LOCATIONS]);
    const result = await sendShiftPreferenceReminder(client, TENANT_ID, { employeeId: EMPLOYEE_ID, nonce: NONCE }, {
      sendEmail: recordingSender(providerResult).sendEmail,
      todayIso: () => '2026-10-06',
    });
    assert.deepEqual(result, { status: 'success', data: { delivery, monthPrefix: '2026-11' } });
  }
});

test('sendShiftPreferenceReminder refuses a caller without workforce.request.manage and sends nothing', async () => {
  const { client } = recordingClient([{ data: employeeRow(), error: null }, { data: false, error: null }]);
  const sender = recordingSender({ status: 'sent' });
  const result = await sendShiftPreferenceReminder(client, TENANT_ID, { employeeId: EMPLOYEE_ID, nonce: NONCE }, { sendEmail: sender.sendEmail });
  assert.equal(result.status, 'unauthorized');
  assert.equal(sender.sent.length, 0);
});

test('sendShiftPreferenceReminder returns not_found for an employee not visible under RLS or inactive', async () => {
  for (const row of [null, employeeRow({ is_active: false })]) {
    const { client } = recordingClient({ data: row, error: null });
    const sender = recordingSender({ status: 'sent' });
    const result = await sendShiftPreferenceReminder(client, TENANT_ID, { employeeId: EMPLOYEE_ID, nonce: NONCE }, { sendEmail: sender.sendEmail });
    assert.equal(result.status, 'not_found');
    assert.equal(sender.sent.length, 0);
  }
});
