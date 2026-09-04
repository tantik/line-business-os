import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guards for `auto-schedule-monthly.ts`. This repo's
 * test runner has no way to execute this job against a real Supabase
 * client -- exactly like `apps/web`'s `schedule-actions.test.ts` for the
 * manual "auto-create schedule" Server Action, these assert the shape of
 * the job (reuse of the one shared engine, tenant/location scoping,
 * idempotency, ON/OFF + day-of-month gating, no-auto-publish) rather than
 * its runtime behaviour. The engine itself is covered for real by
 * `packages/workforce`'s `auto-distribute.test.ts` /
 * `auto-distribution-authority.test.ts` (unchanged, just relocated); the
 * pure "next calendar month" date math is covered for real by
 * `lib/timezone.test.ts` in this package.
 */
const SOURCE = readFileSync(new URL('./auto-schedule-monthly.ts', import.meta.url), 'utf8');

test('imports the engine from @line-os/workforce -- never a second implementation', () => {
  assert.match(SOURCE, /from '@line-os\/workforce'/);
  assert.match(SOURCE, /autoDistribute\(/);
  assert.match(SOURCE, /buildAuthoritativeStaffingRequirements\(/);
  assert.match(SOURCE, /hasPositiveStaffingRequirement\(/);
  // never a locally-reimplemented distribution loop
  assert.doesNotMatch(SOURCE, /function autoDistribute/);
});

test('respects the Manager ON/OFF opt-in and day-of-month, both read from workforce.schedule_settings', () => {
  assert.match(SOURCE, /\.eq\('auto_create_enabled', true\)/);
  assert.match(SOURCE, /todayDayOfMonth !== settings\.auto_create_day_of_month/);
});

test('module gate: fails closed if Workforce is not enabled (or the tenant_modules row is missing) for the tenant', () => {
  assert.match(SOURCE, /core['"]\)\s*\n\s*\.from\('tenant_modules'\)/);
  assert.match(SOURCE, /if \(!moduleRow\?\.is_enabled\) return null;/);
});

test('always targets the NEXT calendar month, computed from "today" in the location\'s own timezone', () => {
  assert.match(SOURCE, /todayIsoInTimeZone\(timeZone\)/);
  assert.match(SOURCE, /nextMonthPeriod\(today\)/);
});

test('idempotent: a location already marked generated for the target month is skipped, and the marker is set only after a real engine run', () => {
  assert.match(SOURCE, /settings\.auto_create_last_generated_month === target\.periodStart\) return null/);
  assert.match(SOURCE, /auto_create_last_generated_month: target\.periodStart/);
  // the marker write happens after both config-error early returns (no active shift types / no staffing requirement)
  const configErrorIdx = SOURCE.indexOf('hasPositiveStaffingRequirement(staffingRequirements)) return null');
  const markIdx = SOURCE.indexOf('auto_create_last_generated_month: target.periodStart');
  assert.ok(configErrorIdx >= 0 && markIdx > configErrorIdx);
});

test('every query is explicitly scoped to one tenant_id + location_id pair -- service_role never relied on alone for isolation', () => {
  assert.match(SOURCE, /\.eq\('tenant_id', tenantId\)\s*\n\s*\.eq\('location_id', locationId\)/);
  assert.match(SOURCE, /\.filter\(\(a\) => a\.location_id === locationId\)/);
});

test('never auto-publishes and never queues a LINE notification', () => {
  assert.match(SOURCE, /published: false, \/\/ review-pending proposal/);
  assert.doesNotMatch(SOURCE, /queueLineNotification/);
  assert.doesNotMatch(SOURCE, /published:\s*true/);
});

test('manual pre-existing assignments in the target month are preserved, never cleared -- this is always the location\'s first scheduled attempt at that month (guarded by idempotency above)', () => {
  assert.match(SOURCE, /overwriteExisting: false/);
  assert.doesNotMatch(SOURCE, /clearUnconfirmedDraftAssignmentsInPeriod/);
});

test('the calendar-month hour cap uses the whole target month as its own window -- no extra hours from outside it', () => {
  assert.match(SOURCE, /extraHoursByEmployee: \{\}/);
  assert.match(SOURCE, /maxPeriodHours: settings\.max_monthly_hours/);
});
