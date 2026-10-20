import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blindIndex, byteaToBuffer, decryptPII } from '../../../packages/db/src/crypto.ts';
import { blindIndexEmail, bytesToBytea, encryptPII, protectEmail } from './pii-protect.ts';

// Synthetic test-only key material (not a real secret).
const KEY = Buffer.alloc(32, 7).toString('base64');
const PEPPER = 'test-pepper-not-a-real-secret-0123456789';

test('Edge encryptPII output is decrypted by packages/db decryptPII ([IV][tag][ciphertext])', async () => {
  const blob = await encryptPII('owner@example.com', KEY);
  assert.equal(decryptPII(Buffer.from(blob), KEY), 'owner@example.com');
  assert.ok(blob.length >= 12 + 16 + 1);
});

test('encryption is randomized (fresh IV every call)', async () => {
  const a = await encryptPII('owner@example.com', KEY);
  const b = await encryptPII('owner@example.com', KEY);
  assert.notDeepEqual(a, b);
});

test('blindIndexEmail equals packages/db blindIndex(value, pepper, "email")', async () => {
  for (const email of ['owner@example.com', '  Owner@Example.COM ', 'a.b+c@sub.example.jp']) {
    assert.equal(await blindIndexEmail(email, PEPPER), blindIndex(email, PEPPER, 'email'));
  }
  assert.match(await blindIndexEmail('x@y.z', PEPPER), /^[0-9a-f]{64}$/);
});

test('protectEmail: bytea text round-trips; normalized email; hash matches; no plaintext in output', async () => {
  const p = await protectEmail(' Owner@Example.com ', { encryptionKey: KEY, pepper: PEPPER });
  assert.match(p.emailEncryptedBytea, /^\\x[0-9a-f]+$/);
  assert.equal(decryptPII(byteaToBuffer(p.emailEncryptedBytea), KEY), 'owner@example.com');
  assert.equal(p.emailHash, blindIndex('owner@example.com', PEPPER, 'email'));
  assert.ok(!JSON.stringify(p).toLowerCase().includes('owner'));
});

test('a key that is not 32 bytes is refused', async () => {
  await assert.rejects(() => encryptPII('x', Buffer.alloc(16).toString('base64')), /32 bytes/);
});

test('bytesToBytea encodes hex', () => {
  assert.equal(bytesToBytea(new Uint8Array([0, 15, 255])), '\\x000fff');
});
