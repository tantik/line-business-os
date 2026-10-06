import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REMINDER_SENDER, sendTransactionalEmail, type FetchLike } from './resend-email.js';

const EMAIL = { to: 'staff@example.com', subject: 'Subject', text: 'Body', idempotencyKey: 'key-1' };

function captureConsoleError(): { lines: string[]; restore: () => void } {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  return { lines, restore: () => (console.error = original) };
}

test('sendTransactionalEmail returns not_configured and makes no request when the key is missing', async () => {
  let called = false;
  const fetch: FetchLike = async () => {
    called = true;
    return { ok: true, status: 200 };
  };
  const result = await sendTransactionalEmail(EMAIL, { fetch, apiKey: undefined });
  assert.deepEqual(result, { status: 'not_configured' });
  assert.equal(called, false);
});

test('sendTransactionalEmail posts one recipient to Resend with the bearer key and idempotency key', async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const fetch: FetchLike = async (url, init) => {
    captured = { url, init };
    return { ok: true, status: 200 };
  };
  const result = await sendTransactionalEmail(EMAIL, { fetch, apiKey: 're_test' });
  assert.deepEqual(result, { status: 'sent' });
  assert.ok(captured);
  const { url, init } = captured as { url: string; init: RequestInit };
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(init.method, 'POST');
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer re_test');
  assert.equal(headers['Idempotency-Key'], 'key-1');
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  assert.deepEqual(body, { from: REMINDER_SENDER, to: ['staff@example.com'], subject: 'Subject', text: 'Body' });
  assert.match(REMINDER_SENDER, /@notifications\.oruwa\.jp>$/);
});

test('sendTransactionalEmail maps a non-2xx response to failed and never logs the address or the key', async () => {
  const log = captureConsoleError();
  try {
    const result = await sendTransactionalEmail(EMAIL, { fetch: async () => ({ ok: false, status: 422 }), apiKey: 're_secret' });
    assert.deepEqual(result, { status: 'failed' });
  } finally {
    log.restore();
  }
  assert.equal(log.lines.length, 1);
  assert.match(log.lines[0]!, /HTTP 422/);
  assert.doesNotMatch(log.lines.join('\n'), /staff@example\.com|re_secret|Subject|Body/);
});

test('sendTransactionalEmail maps a network error to failed without throwing', async () => {
  const log = captureConsoleError();
  try {
    const result = await sendTransactionalEmail(EMAIL, {
      fetch: async () => {
        throw new TypeError('fetch failed for staff@example.com');
      },
      apiKey: 're_test',
    });
    assert.deepEqual(result, { status: 'failed' });
  } finally {
    log.restore();
  }
  assert.doesNotMatch(log.lines.join('\n'), /staff@example\.com/);
});
