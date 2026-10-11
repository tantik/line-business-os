import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeWriteError } from './error-copy.js';

test('describeWriteError returns distinct-by-language copy for every mapped status', () => {
  const statuses = [
    'not_found',
    'not_authenticated',
    'no_membership',
    'blocked_by_history',
    'blocked_not_archived',
    'stale_reference',
    'language_change_requires_confirmation',
  ] as const;
  for (const status of statuses) {
    const en = describeWriteError({ status }, 'en');
    const ja = describeWriteError({ status }, 'ja');
    assert.ok(en.length > 0, `en copy for ${status} must not be empty`);
    assert.ok(ja.length > 0, `ja copy for ${status} must not be empty`);
    assert.notEqual(en, ja, `describeWriteError(${status}) should have distinct ja/en copy`);
  }
});

test('describeWriteError defaults to English when no lang is passed (existing call sites outside a LangProvider)', () => {
  assert.equal(describeWriteError({ status: 'not_found' }), 'Not found.');
});

test('describeWriteError never shows an unknown server message (Copy Audit A-03): generic per-status copy instead', () => {
  assert.equal(describeWriteError({ status: 'unauthorized', message: 'custom message' }, 'ja'), 'この操作を行う権限がありません。');
  assert.equal(
    describeWriteError({ status: 'unexpected_error', message: 'raw postgres error: relation X violates constraint Y' }, 'en'),
    'Something went wrong. Please try again.',
  );
});

test('describeWriteError translates a known server sentence (the repeat clock-in case)', () => {
  assert.equal(describeWriteError({ status: 'duplicate', message: 'You have already clocked in today.' }, 'ja'), '本日はすでに出勤済みです。');
});
