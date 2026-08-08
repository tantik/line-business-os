import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDecideCorrectionRequestInput,
  parsePreviewSubmitCorrectionRequestInput,
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
      actualBreakMinutes: '60',
      transportationCost: '300',
      dailyMessage: 'Busy morning',
    }),
  );
  assert.deepEqual(result, {
    workDate: '2026-08-03',
    clockInLocal: '09:00',
    clockOutLocal: '17:00',
    actualBreakMinutes: 60,
    transportationCost: 300,
    dailyMessage: 'Busy morning',
  });
});
test('parseSubmitWorkReportInput allows omitting clock times entirely', () => {
  const result = parseSubmitWorkReportInput(formData({ workDate: '2026-08-03' }));
  assert.deepEqual(result, { workDate: '2026-08-03', clockInLocal: undefined, clockOutLocal: undefined, actualBreakMinutes: null, transportationCost: null, dailyMessage: null });
});
test('parseSubmitWorkReportInput accepts bounded correction break minutes and rejects values over 480', () => {
  assert.equal(parseSubmitWorkReportInput(formData({ workDate: '2026-08-03', actualBreakMinutes: '30' }))?.actualBreakMinutes, 30);
  assert.equal(parseSubmitWorkReportInput(formData({ workDate: '2026-08-03', actualBreakMinutes: '481' })), null);
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
    { workDate: '2026-08-03', attendanceId: ATTENDANCE_ID, clockInLocal: undefined, clockOutLocal: undefined, actualBreakMinutes: null, message: 'Forgot to clock out' },
  );
});
test('parseSubmitCorrectionRequestInput allows a null attendanceId (not yet clocked)', () => {
  const result = parseSubmitCorrectionRequestInput(formData({ workDate: '2026-08-03' }));
  assert.deepEqual(result, { workDate: '2026-08-03', attendanceId: null, clockInLocal: undefined, clockOutLocal: undefined, actualBreakMinutes: null, message: null });
});

test('parseSubmitCorrectionRequestInput accepts independently editable attendance fields', () => {
  assert.deepEqual(
    parseSubmitCorrectionRequestInput(formData({
      workDate: '2026-08-03',
      attendanceId: ATTENDANCE_ID,
      clockInLocal: '09:05',
      clockOutLocal: '17:45',
      actualBreakMinutes: '30',
      message: 'Opening preparation ran late.',
    })),
    {
      workDate: '2026-08-03',
      attendanceId: ATTENDANCE_ID,
      clockInLocal: '09:05',
      clockOutLocal: '17:45',
      actualBreakMinutes: 30,
      message: 'Opening preparation ran late.',
    },
  );
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

// ============================================================================
// FA-02 - parsePreviewSubmitCorrectionRequestInput (Mame To Cha preview
// correction-request validity contract: a meaningful change AND a non-blank
// reason, both required)
// ============================================================================

test('parsePreviewSubmitCorrectionRequestInput rejects an all-blank submission (no fields, no reason) - the FA-02 defect', () => {
  assert.equal(parsePreviewSubmitCorrectionRequestInput(formData({ workDate: '2026-08-03' })), null);
});

test('parsePreviewSubmitCorrectionRequestInput rejects a whitespace-only reason', () => {
  assert.equal(
    parsePreviewSubmitCorrectionRequestInput(formData({ workDate: '2026-08-03', clockInLocal: '09:05', message: '   ' })),
    null,
  );
});

test('parsePreviewSubmitCorrectionRequestInput rejects a reason with no accompanying correction field', () => {
  assert.equal(
    parsePreviewSubmitCorrectionRequestInput(formData({ workDate: '2026-08-03', message: 'Please review my hours.' })),
    null,
  );
});

test('parsePreviewSubmitCorrectionRequestInput rejects time values with a blank reason', () => {
  assert.equal(
    parsePreviewSubmitCorrectionRequestInput(
      formData({ workDate: '2026-08-03', clockInLocal: '09:05', clockOutLocal: '17:00' }),
    ),
    null,
  );
});

test('parsePreviewSubmitCorrectionRequestInput rejects invalid time ordering even with a reason present', () => {
  assert.equal(
    parsePreviewSubmitCorrectionRequestInput(
      formData({ workDate: '2026-08-03', clockInLocal: '17:00', clockOutLocal: '09:00', message: 'Reason' }),
    ),
    null,
  );
});

test('parsePreviewSubmitCorrectionRequestInput rejects an invalid break value even with a reason present', () => {
  assert.equal(
    parsePreviewSubmitCorrectionRequestInput(
      formData({ workDate: '2026-08-03', actualBreakMinutes: '481', message: 'Reason' }),
    ),
    null,
  );
});

test('parsePreviewSubmitCorrectionRequestInput accepts one meaningful correction field plus a reason', () => {
  assert.deepEqual(
    parsePreviewSubmitCorrectionRequestInput(
      formData({ workDate: '2026-08-03', clockInLocal: '09:05', message: 'Opening preparation ran late.' }),
    ),
    {
      workDate: '2026-08-03',
      attendanceId: null,
      clockInLocal: '09:05',
      clockOutLocal: undefined,
      actualBreakMinutes: null,
      message: 'Opening preparation ran late.',
    },
  );
});

test('parsePreviewSubmitCorrectionRequestInput accepts a break-only correction plus a reason', () => {
  assert.deepEqual(
    parsePreviewSubmitCorrectionRequestInput(
      formData({ workDate: '2026-08-03', actualBreakMinutes: '30', message: 'Took a longer break.' }),
    ),
    {
      workDate: '2026-08-03',
      attendanceId: null,
      clockInLocal: undefined,
      clockOutLocal: undefined,
      actualBreakMinutes: 30,
      message: 'Took a longer break.',
    },
  );
});
