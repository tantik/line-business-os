import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatWeekRangeLabel } from './week-label.js';

test('formatWeekRangeLabel: JA always writes both full month+day, even within the same month', () => {
  assert.equal(formatWeekRangeLabel('ja', '2026-09-07', '2026-09-13'), '9月7日〜9月13日');
});

test('formatWeekRangeLabel: EN collapses to one month name when the week stays within one calendar month', () => {
  assert.equal(formatWeekRangeLabel('en', '2026-09-07', '2026-09-13'), 'Sep 7–13');
});

test('formatWeekRangeLabel: JA spells out both months when the week crosses a calendar-month boundary', () => {
  assert.equal(formatWeekRangeLabel('ja', '2026-09-28', '2026-10-04'), '9月28日〜10月4日');
});

test('formatWeekRangeLabel: EN spells out both months when the week crosses a calendar-month boundary', () => {
  assert.equal(formatWeekRangeLabel('en', '2026-09-28', '2026-10-04'), 'Sep 28–Oct 4');
});
