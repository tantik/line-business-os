import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PostgrestError } from '@supabase/supabase-js';
import { mapWorkforceReadError, mapWorkforceWriteError } from './pg-error.js';

function pgError(code: string, message: string): PostgrestError {
  return { code, message, details: '', hint: '', name: 'PostgrestError' } as PostgrestError;
}

test('mapWorkforceReadError maps 42501 to unauthorized', () => {
  assert.deepEqual(mapWorkforceReadError(pgError('42501', 'insufficient_privilege'), 'read X'), {
    status: 'unauthorized',
    message: 'Not permitted to read X.',
  });
});
test('mapWorkforceReadError maps a "permission denied" message to unauthorized even with a different code', () => {
  const result = mapWorkforceReadError(pgError('42000', 'permission denied for relation foo'), 'read X');
  assert.equal(result.status, 'unauthorized');
});
test('mapWorkforceReadError maps anything else to unexpected_error', () => {
  const result = mapWorkforceReadError(pgError('23503', 'foreign key violation'), 'read X');
  assert.equal(result.status, 'unexpected_error');
});

test('mapWorkforceWriteError maps 42501 and row-level security messages to unauthorized', () => {
  assert.equal(mapWorkforceWriteError(pgError('42501', 'x'), 'bind Y').status, 'unauthorized');
  assert.equal(
    mapWorkforceWriteError(pgError('42501', 'new row violates row-level security policy for table "x"'), 'bind Y').status,
    'unauthorized',
  );
});
test('mapWorkforceWriteError maps 23505 to duplicate', () => {
  const result = mapWorkforceWriteError(pgError('23505', 'duplicate key value'), 'bind Y');
  assert.equal(result.status, 'duplicate');
});
test('mapWorkforceWriteError maps anything else to unexpected_error', () => {
  assert.equal(mapWorkforceWriteError(pgError('23503', 'fk violation'), 'bind Y').status, 'unexpected_error');
});
