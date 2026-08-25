import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStaffMessageIdInput,
  parseSubmitManagerMessageInput,
  parseSubmitStaffMessageInput,
} from './staff-messages-input.js';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

test('parseSubmitStaffMessageInput accepts a trimmed non-empty body', () => {
  const formData = new FormData();
  formData.set('body', '  Running late today.  ');
  const result = parseSubmitStaffMessageInput(formData);
  assert.deepEqual(result, { body: 'Running late today.' });
});

test('parseSubmitStaffMessageInput rejects a blank/whitespace-only body', () => {
  const formData = new FormData();
  formData.set('body', '   ');
  assert.equal(parseSubmitStaffMessageInput(formData), null);
});

test('parseSubmitStaffMessageInput rejects a body over 500 characters (matches the DB check constraint)', () => {
  const formData = new FormData();
  formData.set('body', 'x'.repeat(501));
  assert.equal(parseSubmitStaffMessageInput(formData), null);
});

test('parseSubmitStaffMessageInput accepts exactly 500 characters', () => {
  const formData = new FormData();
  formData.set('body', 'x'.repeat(500));
  const result = parseSubmitStaffMessageInput(formData);
  assert.equal(result?.body.length, 500);
});

test('parseSubmitManagerMessageInput requires a valid employeeId UUID and a non-empty body', () => {
  const formData = new FormData();
  formData.set('employeeId', VALID_UUID);
  formData.set('body', 'On my way.');
  assert.deepEqual(parseSubmitManagerMessageInput(formData), { employeeId: VALID_UUID, body: 'On my way.' });
});

test('parseSubmitManagerMessageInput rejects a malformed employeeId', () => {
  const formData = new FormData();
  formData.set('employeeId', 'not-a-uuid');
  formData.set('body', 'On my way.');
  assert.equal(parseSubmitManagerMessageInput(formData), null);
});

test('parseSubmitManagerMessageInput rejects a missing employeeId', () => {
  const formData = new FormData();
  formData.set('body', 'On my way.');
  assert.equal(parseSubmitManagerMessageInput(formData), null);
});

test('parseStaffMessageIdInput accepts a valid UUID', () => {
  const formData = new FormData();
  formData.set('messageId', VALID_UUID);
  assert.deepEqual(parseStaffMessageIdInput(formData), { messageId: VALID_UUID });
});

test('parseStaffMessageIdInput rejects a missing or malformed messageId', () => {
  assert.equal(parseStaffMessageIdInput(new FormData()), null);
  const formData = new FormData();
  formData.set('messageId', 'nope');
  assert.equal(parseStaffMessageIdInput(formData), null);
});
