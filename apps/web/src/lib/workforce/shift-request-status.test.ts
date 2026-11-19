import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLiveShiftRequest } from './shift-request-status';

test('isLiveShiftRequest: only cancelled is not live (pending / approved / rejected keep their meaning)', () => {
  assert.equal(isLiveShiftRequest({ status: 'cancelled' }), false);
  for (const status of ['pending', 'approved', 'rejected']) assert.equal(isLiveShiftRequest({ status }), true, status);
  assert.equal(isLiveShiftRequest({}), true, 'callers without a status keep their old behaviour');
});

test('Manager page drops cancelled preferences once, before every Manager reader', () => {
  const page = readFileSync(new URL('../../app/(protected)/manager/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /requests=\{requestsResult\.status === 'success' \? requestsResult\.data\.filter\(isLiveShiftRequest\) : null\}/);
});
