import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMonthPeriod, getWeekOffsetWindow, getWeekPeriod, getWeeksInMonth, weekOffsetForWorkDate } from './period.js';

const TZ = 'Asia/Tokyo';

test('getWeekPeriod resolves a Monday to itself as periodStart', () => {
  assert.deepEqual(getWeekPeriod('2026-08-03T00:00:00.000Z', TZ), {
    periodStart: '2026-08-03',
    periodEnd: '2026-08-09',
  });
});

test('getWeekPeriod resolves a mid-week date back to its Monday', () => {
  assert.deepEqual(getWeekPeriod('2026-08-05T00:00:00.000Z', TZ), {
    periodStart: '2026-08-03',
    periodEnd: '2026-08-09',
  });
});

test('getWeekPeriod resolves a Sunday to the Monday of the same week (not the next one)', () => {
  assert.deepEqual(getWeekPeriod('2026-08-09T00:00:00.000Z', TZ), {
    periodStart: '2026-08-03',
    periodEnd: '2026-08-09',
  });
});

test('getWeekPeriod applies a positive weekOffset', () => {
  assert.deepEqual(getWeekPeriod('2026-08-03T00:00:00.000Z', TZ, 1), {
    periodStart: '2026-08-10',
    periodEnd: '2026-08-16',
  });
});

test('getWeekPeriod applies a negative weekOffset', () => {
  assert.deepEqual(getWeekPeriod('2026-08-03T00:00:00.000Z', TZ, -1), {
    periodStart: '2026-07-27',
    periodEnd: '2026-08-02',
  });
});

test('getWeekPeriod resolves the UTC instant in the given time zone, not raw UTC date', () => {
  // 2026-07-10T20:00:00Z is 2026-07-11 05:00 JST (UTC+9, no DST) -- a Saturday,
  // whose Monday is 2026-07-06, not the Monday of 2026-07-10 (also 2026-07-06,
  // chosen deliberately so a wrong UTC-only implementation would still pass;
  // the next case pins the boundary that actually catches it).
  assert.deepEqual(getWeekPeriod('2026-07-10T20:00:00.000Z', TZ), {
    periodStart: '2026-07-06',
    periodEnd: '2026-07-12',
  });
});

test('getWeekPeriod: a late-UTC instant that rolls into the next JST calendar day crosses into the following week', () => {
  // 2026-08-09T20:00:00Z (Sunday, late UTC) is 2026-08-10 05:00 JST (Monday) --
  // a UTC-only implementation would resolve the wrong (prior) week.
  assert.deepEqual(getWeekPeriod('2026-08-09T20:00:00.000Z', TZ), {
    periodStart: '2026-08-10',
    periodEnd: '2026-08-16',
  });
});

test('getWeekOffsetWindow covers exactly every week exposed by a bounded navigator', () => {
  assert.deepEqual(getWeekOffsetWindow('2026-08-05T00:00:00.000Z', TZ, -8, 8), {
    periodStart: '2026-06-08',
    periodEnd: '2026-10-04',
  });
});

test('getWeekOffsetWindow rejects a reversed or non-integer window', () => {
  assert.throws(() => getWeekOffsetWindow('2026-08-05T00:00:00.000Z', TZ, 2, 1), RangeError);
  assert.throws(() => getWeekOffsetWindow('2026-08-05T00:00:00.000Z', TZ, -0.5, 1), RangeError);
});

test('weekOffsetForWorkDate returns 0 for a date in the same week as today', () => {
  assert.equal(weekOffsetForWorkDate('2026-08-05', '2026-08-03'), 0);
  assert.equal(weekOffsetForWorkDate('2026-08-03', '2026-08-09'), 0);
});

test('weekOffsetForWorkDate returns a positive offset for a future week', () => {
  assert.equal(weekOffsetForWorkDate('2026-08-05', '2026-08-12'), 1);
  assert.equal(weekOffsetForWorkDate('2026-08-05', '2026-08-24'), 3);
});

test('weekOffsetForWorkDate returns a negative offset for a past week', () => {
  assert.equal(weekOffsetForWorkDate('2026-08-05', '2026-07-27'), -1);
});

test('getMonthPeriod resolves the calendar month containing nowIso, in the given time zone', () => {
  assert.deepEqual(getMonthPeriod('2026-08-17T03:00:00.000Z', TZ), {
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    monthPrefix: '2026-08',
  });
});

test('getMonthPeriod handles a 30-day month and a late-UTC instant that rolls into the next JST day', () => {
  // 2026-09-30T20:00:00Z is 2026-10-01 05:00 JST -- crosses into October.
  assert.deepEqual(getMonthPeriod('2026-09-30T20:00:00.000Z', TZ), {
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    monthPrefix: '2026-10',
  });
  assert.deepEqual(getMonthPeriod('2026-09-15T00:00:00.000Z', TZ), {
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    monthPrefix: '2026-09',
  });
});

test('getMonthPeriod handles February in a leap year', () => {
  assert.deepEqual(getMonthPeriod('2028-02-10T00:00:00.000Z', TZ), {
    periodStart: '2028-02-01',
    periodEnd: '2028-02-29',
    monthPrefix: '2028-02',
  });
});

test('getWeeksInMonth returns every Monday-Sunday week intersecting the month, in order', () => {
  // August 2026: Aug 1 is a Saturday, Aug 31 is a Monday.
  assert.deepEqual(getWeeksInMonth('2026-08'), [
    { weekStart: '2026-07-27', weekEnd: '2026-08-02' },
    { weekStart: '2026-08-03', weekEnd: '2026-08-09' },
    { weekStart: '2026-08-10', weekEnd: '2026-08-16' },
    { weekStart: '2026-08-17', weekEnd: '2026-08-23' },
    { weekStart: '2026-08-24', weekEnd: '2026-08-30' },
    { weekStart: '2026-08-31', weekEnd: '2026-09-06' },
  ]);
});

test('getWeeksInMonth: a month starting on a Monday has no leading partial week', () => {
  // 2026-06-01 is a Monday.
  const weeks = getWeeksInMonth('2026-06');
  assert.equal(weeks[0]?.weekStart, '2026-06-01');
});
