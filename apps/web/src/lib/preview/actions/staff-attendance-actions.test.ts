import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Phase 1N-4C Slice B2b - source-text regression guards for the preview
 * staff work-report and correction-request submission wrappers. Same
 * convention as `authorize.test.ts`/`attendance-actions.test.ts`.
 * Deliberately a separate file from `attendance-actions.ts` (the B2a manager
 * module) - see the doc comment on this module for why.
 */
const SOURCE = readFileSync(new URL('./staff-attendance-actions.ts', import.meta.url), 'utf8');

function fnBody(name: string, nextName?: string): string {
  const start = SOURCE.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `expected to find export async function ${name}(`);
  const end = nextName ? SOURCE.indexOf(`export async function ${nextName}(`) : SOURCE.length;
  return SOURCE.slice(start, end);
}

test('exports exactly the five staff attendance actions', () => {
  assert.deepEqual(
    [...SOURCE.matchAll(/export async function (preview[A-Za-z]+)\(/g)].map((match) => match[1]),
    ['previewSubmitWorkReport', 'previewClockIn', 'previewClockOut', 'previewResetTodayClock', 'previewSubmitCorrectionRequest'],
  );
});

test('clock actions derive date/time from the server instant and resolved location timezone', () => {
  const clockInBody = fnBody('previewClockIn', 'previewClockOut');
  const clockOutBody = fnBody('previewClockOut', 'previewResetTodayClock');
  for (const body of [clockInBody, clockOutBody]) {
    assert.ok(/new Date\(\)\.toISOString\(\)/.test(body));
    assert.ok(/utcIsoToLocalDateTime\(nowIso, timeZone\)/.test(body));
    assert.ok(/listMyAttendance\(supabase, tenantId\)/.test(body));
    assert.ok(!/listAttendanceForManager\(/.test(body));
  }
});

test('previewClockOut accepts only the exact 0/30/60 break choices before resolving context', () => {
  const body = fnBody('previewClockOut', 'previewResetTodayClock');
  assert.ok(/rawBreakMinutes !== '0'/.test(body));
  assert.ok(/rawBreakMinutes !== '30'/.test(body));
  assert.ok(/rawBreakMinutes !== '60'/.test(body));
  assert.ok(body.indexOf('rawBreakMinutes') < body.indexOf('resolvePreviewStaffContext()'));
});

test('previewSubmitWorkReport and previewSubmitCorrectionRequest resolve the staff context, never the manager context', () => {
  const workReportBody = fnBody('previewSubmitWorkReport', 'previewClockIn');
  const correctionBody = fnBody('previewSubmitCorrectionRequest');
  assert.ok(/resolvePreviewStaffContext\(\)/.test(workReportBody));
  assert.ok(/resolvePreviewStaffContext\(\)/.test(correctionBody));
  assert.ok(!/resolvePreviewManagerContext\(/.test(workReportBody));
  assert.ok(!/resolvePreviewManagerContext\(/.test(correctionBody));
});

test('previewSubmitWorkReport derives clockIn/clockOut from the resolved context timeZone, never a client-supplied one', () => {
  const body = fnBody('previewSubmitWorkReport', 'previewClockIn');
  assert.ok(/localDateTimeToUtcIso\(input\.workDate, input\.clockInLocal, timeZone\)/.test(body));
  assert.ok(/localDateTimeToUtcIso\(input\.workDate, input\.clockOutLocal, timeZone\)/.test(body));
});

test('previewSubmitWorkReport preserves clock events when the detail form omits clock fields', () => {
  const body = fnBody('previewSubmitWorkReport', 'previewClockIn');
  assert.ok(/input\.clockInLocal[\s\S]*: undefined/.test(body));
  assert.ok(/input\.clockOutLocal[\s\S]*: undefined/.test(body));
  assert.ok(!/input\.clockInLocal[\s\S]*: null/.test(body));
  assert.ok(!/input\.clockOutLocal[\s\S]*: null/.test(body));
});

test('previewSubmitWorkReport and previewSubmitCorrectionRequest pass only server-resolved employeeId/locationId to the service-layer call, never a client-supplied one', () => {
  const workReportBody = fnBody('previewSubmitWorkReport', 'previewClockIn');
  const correctionBody = fnBody('previewSubmitCorrectionRequest');
  assert.ok(!/formData\.get\('employeeId'\)/.test(workReportBody));
  assert.ok(!/formData\.get\('locationId'\)/.test(workReportBody));
  assert.ok(!/formData\.get\('employeeId'\)/.test(correctionBody));
  assert.ok(!/formData\.get\('locationId'\)/.test(correctionBody));
});

test("previewSubmitCorrectionRequest validates a submitted attendanceId against the caller's own self-scoped attendance (listMyAttendance, never listAttendanceForManager) before the service-layer call", () => {
  const body = fnBody('previewSubmitCorrectionRequest');
  assert.ok(/if \(input\.attendanceId\)/.test(body));
  assert.ok(/listMyAttendance\(supabase, tenantId\)/.test(body));
  assert.ok(!/listAttendanceForManager\(/.test(body), 'must never use the manager-wide attendance read for a staff wrapper');
  assert.ok(/target\.employeeId !== employeeId/.test(body), 'must reject an attendance row belonging to another employee');
  assert.ok(/target\.locationId !== locationId/.test(body), 'must reject an attendance row at another location');
  const validationIdx = body.indexOf('target.employeeId !== employeeId');
  const callIdx = body.indexOf('submitCorrectionRequestWrite(');
  assert.ok(validationIdx >= 0 && validationIdx < callIdx, 'attendance ownership validation must run before the service-layer call');
});

test('previewSubmitCorrectionRequest calls submitCorrectionRequestWrite unchanged and previewSubmitWorkReport calls submitWorkReportWrite unchanged', () => {
  assert.ok(/submitCorrectionRequestWrite\(supabase, tenantId, \{/.test(SOURCE));
  assert.ok(/submitWorkReportWrite\(supabase, tenantId, \{/.test(SOURCE));
});

test('never imports a raw dashboard action module', () => {
  assert.ok(!/@\/lib\/workforce\/(staff-actions|schedule-actions|attendance-actions|employee-line-links)/.test(SOURCE));
});

test('never references tenantSlug/moduleEnabled authority literals', () => {
  assert.ok(!SOURCE.includes('tenantSlug'));
  assert.ok(!SOURCE.includes('moduleEnabled'));
});

test("never exports a B2a manager action (kept separate so a route importing one role's actions never bundles the other role's worker registrations)", () => {
  assert.ok(!/export async function previewDecideCorrectionRequest\(/.test(SOURCE));
});
