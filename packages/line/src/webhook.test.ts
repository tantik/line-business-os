import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyLineSignature, parseWebhookBody } from './webhook.js';

const secret = 'test-channel-secret';
const body = JSON.stringify({ destination: 'U123', events: [] });
const sig = createHmac('sha256', secret).update(body).digest('base64');

test('accepts a valid signature', () => {
  assert.equal(verifyLineSignature({ channelSecret: secret, rawBody: body, signature: sig }), true);
});

test('rejects a tampered body', () => {
  const tampered = body + ' ';
  assert.equal(
    verifyLineSignature({ channelSecret: secret, rawBody: tampered, signature: sig }),
    false,
  );
});

test('rejects a missing signature', () => {
  assert.equal(verifyLineSignature({ channelSecret: secret, rawBody: body, signature: null }), false);
});

test('parses a verified body', () => {
  assert.deepEqual(parseWebhookBody(body).events, []);
});
