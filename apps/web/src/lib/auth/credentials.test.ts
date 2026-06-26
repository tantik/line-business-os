import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCredentials } from './credentials.js';

function form(fields: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) fd.set(key, value);
  }
  return fd;
}

test('parseCredentials returns trimmed email + password on valid input', () => {
  const result = parseCredentials(form({ email: '  user@example.com  ', password: 'secret' }));
  assert.deepEqual(result, { email: 'user@example.com', password: 'secret' });
});

test('parseCredentials does not trim or alter the password', () => {
  const result = parseCredentials(form({ email: 'user@example.com', password: '  spaced  ' }));
  assert.equal(result?.password, '  spaced  ');
});

test('parseCredentials returns null when email is missing', () => {
  assert.equal(parseCredentials(form({ password: 'secret' })), null);
});

test('parseCredentials returns null when password is missing', () => {
  assert.equal(parseCredentials(form({ email: 'user@example.com' })), null);
});

test('parseCredentials returns null when email is blank/whitespace', () => {
  assert.equal(parseCredentials(form({ email: '   ', password: 'secret' })), null);
});

test('parseCredentials returns null when password is empty', () => {
  assert.equal(parseCredentials(form({ email: 'user@example.com', password: '' })), null);
});
