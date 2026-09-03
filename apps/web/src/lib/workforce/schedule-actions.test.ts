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

test('staffing windows + headcount + hours cap are all resolved server-side', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /getWorkforceScheduleSettings\(supabase, tenantId, locationId\)/);
  assert.match(body, /deriveActiveScheduleWindowCodes\(locationShiftTypes\)/);
  assert.match(body, /buildAuthoritativeStaffingRequirements\(\s*activeWindowCodes,\s*scheduleSettings\?\.requiredHeadcountByWeekday,\s*\)/);
  assert.match(body, /maxPeriodHours: scheduleSettings\?\.maxMonthlyHours/);
  // shift types scoped to the resolved location, same as preview
  assert.match(body, /shiftTypesResult\.data\.filter\(\(st\) => st\.locationId === locationId\)/);
});

test('distinct invalid_config outcomes for no-windows / no-requirement / stale-proposal', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /return \{ status: 'invalid_config', reason: 'no_active_windows' \}/);
  assert.match(body, /reason: 'no_staffing_requirement'/);
  assert.match(body, /reason: 'stale_proposal'/);
});

test('the stale-proposal guard ignores undo-orphaned (employee_id null) rows', () => {
  const body = runAutoDistributionBody();
  assert.match(body, /a\.published === false && a\.employeeId !== null/);
});
