import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDecideCorrectionRequestInput,
  parseSubmitCorrectionRequestInput,
  parseSubmitWorkReportInput,
} from './attendance-input.js';

const ATTENDANCE_ID = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = '22222222-2222-2222-2222-222222222222';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

test('parseSubmitWorkReportInput accepts clock in/out local times and optional fields', () => {
  const result = parseSubmitWorkReportInput(
    formData({
      workDate: '2026-08-03',
      clockInLocal: '09:00',
      clockOutLocal: '17:00',
      transportationCost: '300',
      dailyMessage: 'Busy morning',
    }),
  );
  assert.deepEqual(result, {
    workDate: '2026-08-03',
    clockInLocal: '09:00',
    clockOutLocal: '17:00',
    transportationCost: 300,
    dailyMessage: 'Busy morning',
  });
});
test('parseSubmitWorkReportInput allows omitting clock times entirely', () => {
  const result = parseSubmitWorkReportInput(formData({ workDate: '2026-08-03' }));
  assert.deepEqual(result, { workDate: '2026-08-03', clockInLocal: undefined, clockOutLocal: undefined, transportationCost: null, dailyMessage: null });
});
test('parseSubmitWorkReportInput rejects clockOutLocal <= clockInLocal', () => {
  assert.equal(
    parseSubmitWorkReportInput(formData({ workDate: '2026-08-03', clockInLocal: '17:00', clockOutLocal: '09:00' })),
    null,
  );
});
test('parseSubmitWorkReportInput rejects a missing workDate', () => {
  assert.equal(parseSubmitWorkReportInput(formData({})), null);
});

test('parseSubmitCorrectionRequestInput accepts workDate + attendanceId + message', () => {
  assert.deepEqual(
    parseSubmitCorrectionRequestInput(formData({ workDate: '2026-08-03', attendanceId: ATTENDANCE_ID, message: 'Forgot to clock out' })),
    { workDate: '2026-08-03', attendanceId: ATTENDANCE_ID, message: 'Forgot to clock out' },
  );
});
test('parseSubmitCorrectionRequestInput allows a null attendanceId (not yet clocked)', () => {
  const result = parseSubmitCorrectionRequestInput(formData({ workDate: '2026-08-03' }));
  assert.deepEqual(result, { workDate: '2026-08-03', attendanceId: null, message: null });
});
test('parseSubmitCorrectionRequestInput rejects a malformed attendanceId', () => {
  assert.equal(parseSubmitCorrectionRequestInput(formData({ workDate: '2026-08-03', attendanceId: 'bad' })), null);
});

test('parseDecideCorrectionRequestInput accepts approved/rejected', () => {
  assert.deepEqual(parseDecideCorrectionRequestInput(formData({ requestId: REQUEST_ID, decision: 'approved' })), {
    requestId: REQUEST_ID,
    decision: 'approved',
  });
  assert.deepEqual(parseDecideCorrectionRequestInput(formData({ requestId: REQUEST_ID, decision: 'rejected' })), {
    requestId: REQUEST_ID,
    decision: 'rejected',
  });
});
test('parseDecideCorrectionRequestInput rejects an unknown decision value', () => {
  assert.equal(parseDecideCorrectionRequestInput(formData({ requestId: REQUEST_ID, decision: 'maybe' })), null);
});
