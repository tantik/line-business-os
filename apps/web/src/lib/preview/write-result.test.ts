import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapPreviewTenantFailure,
  mapPreviewModuleFailure,
  mapManagerLocationFailure,
  mapWorkforceWriteResult,
  previewWriteMessageJa,
  PREVIEW_INVALID_INPUT_RESULT,
  type PreviewWriteFailureStatus,
} from './write-result.js';

const ALL_FAILURE_STATUSES: PreviewWriteFailureStatus[] = [
  'not_authenticated',
  'no_access',
  'module_disabled',
  'location_blocked',
  'invalid_input',
  'not_found',
  'duplicate',
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

test('PREVIEW_INVALID_INPUT_RESULT is the fixed invalid_input status', () => {
  assert.deepEqual(PREVIEW_INVALID_INPUT_RESULT, { status: 'invalid_input' });
});

test('mapPreviewTenantFailure maps not_authenticated/no_access to themselves and everything else to unexpected_error', () => {
  assert.deepEqual(mapPreviewTenantFailure({ status: 'not_authenticated' }), { status: 'not_authenticated' });
  assert.deepEqual(mapPreviewTenantFailure({ status: 'no_access' }), { status: 'no_access' });
  assert.deepEqual(mapPreviewTenantFailure({ status: 'config_error', message: 'raw pg detail' }), { status: 'unexpected_error' });
  assert.deepEqual(mapPreviewTenantFailure({ status: 'unexpected_error', message: 'raw pg detail' }), { status: 'unexpected_error' });
});

test('mapPreviewModuleFailure maps disabled to module_disabled and everything else to unexpected_error', () => {
  assert.deepEqual(mapPreviewModuleFailure({ status: 'disabled' }), { status: 'module_disabled' });
  assert.deepEqual(mapPreviewModuleFailure({ status: 'config_error', message: 'x' }), { status: 'unexpected_error' });
  assert.deepEqual(mapPreviewModuleFailure({ status: 'unexpected_error', message: 'x' }), { status: 'unexpected_error' });
});

test('mapManagerLocationFailure maps both none and ambiguous to the same neutral location_blocked status (never distinguished to the caller)', () => {
  assert.deepEqual(mapManagerLocationFailure({ kind: 'none' }), { status: 'location_blocked' });
  assert.deepEqual(mapManagerLocationFailure({ kind: 'ambiguous', count: 2 }), { status: 'location_blocked' });
});

test('mapWorkforceWriteResult passes success data through unchanged', () => {
  assert.deepEqual(mapWorkforceWriteResult({ status: 'success', data: { staffId: 's-1' } }), {
    status: 'success',
    data: { staffId: 's-1' },
  });
});

test('mapWorkforceWriteResult maps not_found/duplicate to themselves', () => {
  assert.deepEqual(mapWorkforceWriteResult({ status: 'not_found' }), { status: 'not_found' });
  assert.deepEqual(mapWorkforceWriteResult({ status: 'duplicate', message: 'unique violation detail' }), { status: 'duplicate' });
});

test('mapWorkforceWriteResult maps no_membership/unauthorized (RLS/permission denials) to the same neutral no_access status', () => {
  assert.deepEqual(mapWorkforceWriteResult({ status: 'no_membership' }), { status: 'no_access' });
  assert.deepEqual(mapWorkforceWriteResult({ status: 'unauthorized', message: 'policy detail' }), { status: 'no_access' });
});

test('mapWorkforceWriteResult maps config_error/unexpected_error to unexpected_error and never surfaces the raw message', () => {
  const result = mapWorkforceWriteResult({ status: 'unexpected_error', message: 'raw postgres error: relation X violates constraint Y' });
  assert.deepEqual(result, { status: 'unexpected_error' });
  assert.ok(!('message' in result), 'mapped result must not carry the raw error message');
});

test('mapWorkforceWriteResult maps not_authenticated to itself', () => {
  assert.deepEqual(mapWorkforceWriteResult({ status: 'not_authenticated' }), { status: 'not_authenticated' });
});
