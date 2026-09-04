import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text guards for the canonical `runAutoDistribution` Server Action's
 * server-side staffing authority. This repo's test runner has no way to
 * execute a `'use server'` module with a real Supabase client, so -- exactly
 * like `lib/preview/actions/schedule-actions.test.ts` -- these assert the
 * shape of the action, not its runtime behaviour. The behavioural coverage
 * lives in the pure helpers (`auto-distribution-authority.test.ts`,
 * `auto-distribute.test.ts`).
 */
const SOURCE = readFileSync(new URL('./schedule-actions.ts', import.meta.url), 'utf8');

function runAutoDistributionBody(): string {
  const start = SOURCE.indexOf('export async function runAutoDistribution(');
  assert.ok(start >= 0);
  return SOURCE.slice(start, SOURCE.indexOf('export async function undoAutoDistribution('));
}

test('runAutoDistribution never parses or reads a client-supplied staffing-requirement array', () => {
  const body = runAutoDistributionBody();
  assert.doesNotMatch(body, /parseRunAutoDistributionInput/);
  assert.doesNotMatch(body, /raw\.staffingRequirements|input\.staffingRequirements/);
  assert.doesNotMatch(SOURCE, /import\s*\{[^}]*parseRunAutoDistributionInput/);
});

test('runAutoDistribution accepts only locationId/periodStart/periodEnd from the client', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /parseUuid\(raw\.locationId\)/);
  assert.match(body, /parseIsoDate\(raw\.periodStart\)/);
  assert.match(body, /parseIsoDate\(raw\.periodEnd\)/);
});

test('overwriteExisting is hardcoded false -- never read from the client', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /overwriteExisting: false/);
  assert.doesNotMatch(body, /raw\.overwriteExisting|input\.overwriteExisting/);
});

test('staffing requirements + headcount + hours cap are all resolved server-side, keyed by shiftTypeId (not a hardcoded window-code alias)', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /getWorkforceScheduleSettings\(supabase, tenantId, locationId\)/);
  assert.match(body, /activeShiftTypeIds = locationShiftTypes\.filter\(\(st\) => st\.isActive\)\.map\(\(st\) => st\.shiftTypeId\)/);
  assert.match(body, /buildAuthoritativeStaffingRequirements\(\s*activeShiftTypeIds,\s*scheduleSettings\?\.requiredHeadcountByWeekday,\s*\)/);
  assert.match(body, /maxPeriodHours: scheduleSettings\?\.maxMonthlyHours/);
  // shift types scoped to the resolved location, same as preview
  assert.match(body, /shiftTypesResult\.data\.filter\(\(st\) => st\.locationId === locationId\)/);
});

test('distinct invalid_config outcomes for no-windows / no-requirement / period-in-past (a re-run is NOT an error)', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /return \{ status: 'invalid_config', reason: 'no_active_windows' \}/);
  assert.match(body, /reason: 'no_staffing_requirement'/);
  assert.match(body, /reason: 'period_in_past'/);
  assert.doesNotMatch(body, /stale_proposal/);
});

test('a period spanning a month boundary (the displayed week can straddle two calendar months) is split into one engine run per calendar month, never rejected outright', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /const monthSlices: MonthSlice\[\] = \[\];/);
  assert.match(body, /for \(const slice of monthSlices\) \{/);
  // each slice gets its own calendar-month hour-cap baseline
  assert.match(body, /existingAssignmentsThisSliceMonth/);
  assert.doesNotMatch(body, /reason: 'multi_month_period'/);
});

test('historical immutability: the server clamps periodStart to today in the location timezone, never trusting the client range as-is', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /todayIsoInTimeZone\(timeZone\)/);
  assert.match(body, /requestedPeriodStart < today \? today : requestedPeriodStart/);
});

test('calendar-month hour cap: hours already used elsewhere in the same month are summed and seeded into the engine, not just the regeneration slice', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /getMonthPeriodForDate\(cursor\)/);
  assert.match(body, /extraHoursByEmployee/);
  assert.match(body, /if \(!assignment\.published\) continue;/);
});

test('a re-run replaces the previous unconfirmed proposal: clears published=false rows for the period before inserting the new set', () => {
  const body = runAutoDistributionBody();
  const clearIdx = body.indexOf('clearUnconfirmedDraftAssignmentsInPeriod(');
  const insertIdx = body.indexOf('insertDraftShiftAssignments(');
  assert.ok(clearIdx >= 0, 'must call clearUnconfirmedDraftAssignmentsInPeriod');
  assert.ok(clearIdx < insertIdx, 'the clear must run before the insert');
  assert.match(body, /if \(clearResult\.status !== 'success'\) return clearResult;/);
});

test('location isolation: the existing-shift snapshot is scoped to the resolved location before it reaches autoDistribute', () => {
  const body = runAutoDistributionBody();
  assert.match(
    body,
    /existingMonthResult\.data\s*\n\s*\.filter\(\(a\) => a\.locationId === locationId\)\s*\n\s*\.map\(\(a\) => toAutoDistributeExistingAssignment\(a, timeZone\)\)/,
    'existingMonthResult.data must be location-filtered immediately before toAutoDistributeExistingAssignment',
  );
  // employees, shift types and the clear are all already location-scoped too.
  assert.match(body, /staffResult\.data\s*\n\s*\.filter\(\(s\) => s\.locationId === locationId\)/);
  assert.match(body, /clearUnconfirmedDraftAssignmentsInPeriod\(\s*supabase,\s*tenantId,\s*locationId,/);
});

test('generated assignments are written with the resolved locationId, never a client value', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /mapDraftAssignmentToInsertRow\(draft, tenantId, locationId, timeZone\)/);
});
