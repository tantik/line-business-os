import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addIsoDays, localDateTimeToUtcIso, nextMonthPeriod, todayIsoInTimeZone, utcIsoToLocalDateTime } from './timezone.ts';

test('nextMonthPeriod returns the full calendar month immediately after today, mid-year', () => {
  assert.deepEqual(nextMonthPeriod('2026-09-20'), {
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    monthPrefix: '2026-10',
  });
});

test('nextMonthPeriod rolls the year over at a December trigger', () => {
  assert.deepEqual(nextMonthPeriod('2026-12-05'), {
    periodStart: '2027-01-01',
    periodEnd: '2027-01-31',
    monthPrefix: '2027-01',
  });
});

test('nextMonthPeriod gets a short month (February, non-leap) right', () => {
  assert.deepEqual(nextMonthPeriod('2027-01-15'), {
    periodStart: '2027-02-01',
    periodEnd: '2027-02-28',
    monthPrefix: '2027-02',
  });
});

test('nextMonthPeriod gets a leap-year February right', () => {
  assert.deepEqual(nextMonthPeriod('2028-01-15'), {
    periodStart: '2028-02-01',
    periodEnd: '2028-02-29',
    monthPrefix: '2028-02',
  });
});

test('localDateTimeToUtcIso / addIsoDays / utcIsoToLocalDateTime round-trip in a non-UTC zone (Asia/Tokyo, UTC+9)', () => {
  const utcIso = localDateTimeToUtcIso('2026-10-01', '10:00', 'Asia/Tokyo');
  assert.equal(utcIso, '2026-10-01T01:00:00.000Z');
  const back = utcIsoToLocalDateTime(utcIso, 'Asia/Tokyo');
  assert.deepEqual(back, { workDate: '2026-10-01', localTime: '10:00' });
  assert.equal(addIsoDays('2026-10-31', 1), '2026-11-01');
});

test('todayIsoInTimeZone returns a YYYY-MM-DD string', () => {
  assert.match(todayIsoInTimeZone('Asia/Tokyo'), /^\d{4}-\d{2}-\d{2}$/);
});

test('todayIsoInTimeZone derives "today" from the injected instant, across the JST day boundary', () => {
  // 2026-10-19T15:30Z is 2026-10-20 00:30 in Tokyo, still 2026-10-19 in UTC.
  const now = new Date('2026-10-19T15:30:00Z');
  assert.equal(todayIsoInTimeZone('Asia/Tokyo', now), '2026-10-20');
  assert.equal(todayIsoInTimeZone('UTC', now), '2026-10-19');
  // One minute before JST midnight.
  assert.equal(todayIsoInTimeZone('Asia/Tokyo', new Date('2026-10-19T14:59:00Z')), '2026-10-19');
});
