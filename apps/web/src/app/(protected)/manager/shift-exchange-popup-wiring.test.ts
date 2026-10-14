import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * QA3 finding 2026-10-14 (live): for a November exchange request every
 * candidate showed 「対応可能」 although all had overlapping shifts that day,
 * and the server's `shift_exchange_schedule_conflict` rejection was invisible
 * (the page banner sits under the modal), so 「指名する」 seemed to do nothing.
 */
const CLIENT = readFileSync(new URL('./manager-dashboard-client.tsx', import.meta.url), 'utf8');
const POPUP = readFileSync(new URL('./shift-exchange-requests-popup.tsx', import.meta.url), 'utf8');

test('candidate conflict preview uses the -8..+8 week exchange window, not only the viewed week', () => {
  assert.match(CLIENT, /allAssignments=\{exchangeAssignments \?\? assignments\}/);
  assert.doesNotMatch(CLIENT, /allAssignments=\{assignments\}/);
});

test('the exchange popup renders the decide/assign result inside the modal', () => {
  assert.match(CLIENT, /resultBanner=\{banner\}/);
  assert.match(POPUP, /resultBanner \?/);
  assert.match(POPUP, /<InlineAlert/);
});
