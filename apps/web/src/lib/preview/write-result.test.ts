import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  previewWriteMessage,
  previewWriteMessageJa,
  type PreviewWriteFailureStatus,
} from './write-result.js';

const ALL_FAILURE_STATUSES: PreviewWriteFailureStatus[] = [
  'not_authenticated',
  'no_access',
  'module_disabled',
  'location_blocked',
  'no_profile',
  'invalid_input',
  'not_found',
  'duplicate',
  'blocked_by_history',
  'blocked_not_archived',
  'stale_reference',
  'language_change_requires_confirmation',
  'unexpected_error',
];

test('previewWriteMessageJa returns a non-empty, UUID-free, path-free message for every failure status', () => {
  for (const status of ALL_FAILURE_STATUSES) {
    const message = previewWriteMessageJa(status);
    assert.ok(message.length > 0, `${status} must have a message`);
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(message), `${status} message must not contain a UUID`);
    assert.ok(!/\/(dashboard|_client-preview)/.test(message), `${status} message must not contain an internal route path`);
  }
});

test('previewWriteMessage returns distinct, non-empty ja/en copy for every failure status, matching previewWriteMessageJa for ja', () => {
  for (const status of ALL_FAILURE_STATUSES) {
    const ja = previewWriteMessage('ja', status);
    const en = previewWriteMessage('en', status);
    assert.ok(ja.length > 0, `previewWriteMessage(ja, ${status}) must not be empty`);
    assert.ok(en.length > 0, `previewWriteMessage(en, ${status}) must not be empty`);
    assert.notEqual(ja, en, `previewWriteMessage(ja/en, ${status}) should have distinct copy`);
    assert.equal(previewWriteMessageJa(status), ja);
  }
});
