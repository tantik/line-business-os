import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendancePresence, lateMinutesToday } from './attendance-presence.js';

const TZ = 'Asia/Tokyo';
const TODAY = '2026-10-20';

test('attendancePresence: clocked in, not out -> working since local HH:MM (Asia/Tokyo)', () => {
  const presence = attendancePresence(
    [{ employeeId: 'e1', workDate: TODAY, clockIn: '2026-10-20T00:58:00.000Z', clockOut: null }],
    'e1',
    TODAY,
    TZ,
  );
  assert.deepEqual(presence, { state: 'working', sinceLocal: '09:58' });
});

test('attendancePresence: clocked out -> left at local HH:MM', () => {
  const presence = attendancePresence(
    [{ employeeId: 'e1', workDate: TODAY, clockIn: '2026-10-20T00:58:00.000Z', clockOut: '2026-10-20T08:02:00.000Z' }],
    'e1',
    TODAY,
    TZ,
  );
  assert.deepEqual(presence, { state: 'left', atLocal: '17:02', sinceLocal: '09:58' });
});

test('attendancePresence: no marker for another day, another employee, or an empty row', () => {
  const rows = [
    { employeeId: 'e1', workDate: '2026-10-19', clockIn: '2026-10-19T00:00:00.000Z', clockOut: null },
    { employeeId: 'e2', workDate: TODAY, clockIn: '2026-10-20T00:00:00.000Z', clockOut: null },
    { employeeId: 'e3', workDate: TODAY, clockIn: null, clockOut: null },
  ];
  assert.equal(attendancePresence(rows, 'e1', TODAY, TZ), null);
  assert.equal(attendancePresence(rows, 'e3', TODAY, TZ), null);
  assert.equal(attendancePresence(rows, 'e2', TODAY, TZ)?.state, 'working');
});

test('lateMinutesToday: same rule as the Weekly Review (first published shift today, floor, >= 1 min)', () => {
  const att = [{ employeeId: 'e1', workDate: TODAY, clockIn: '2026-10-20T08:46:35.000Z', clockOut: null }];
  const shift = (startsAt: string, published = true, employeeId: string | null = 'e1') => ({ employeeId, startsAt, published });
  // 17:30 JST shift, clock-in 17:46:35 -> 16 min (the live QA4 case).
  assert.equal(lateMinutesToday(att, [shift('2026-10-20T08:30:00.000Z')], 'e1', TODAY, TZ), 16);
  // The earliest published shift of the day counts; a draft never does.
  assert.equal(lateMinutesToday(att, [shift('2026-10-20T09:00:00.000Z'), shift('2026-10-20T08:00:00.000Z', false)], 'e1', TODAY, TZ), null);
  // 59 s late is on time.
  assert.equal(lateMinutesToday(att, [shift('2026-10-20T08:45:36.000Z')], 'e1', TODAY, TZ), null);
  // No shift today (yesterday's in JST), another employee's shift, or no clock-in -> null.
  assert.equal(lateMinutesToday(att, [shift('2026-10-19T08:30:00.000Z'), shift('2026-10-20T08:30:00.000Z', true, 'e2')], 'e1', TODAY, TZ), null);
  assert.equal(lateMinutesToday([], [shift('2026-10-20T08:30:00.000Z')], 'e1', TODAY, TZ), null);
});
