import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendancePresence } from './attendance-presence.js';

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
