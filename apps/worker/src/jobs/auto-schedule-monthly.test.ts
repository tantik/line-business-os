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

test('every query against an api.workforce_* view is explicitly scoped to BOTH tenant_id and location_id -- service_role never relied on alone for isolation', () => {
  // Checks each `.schema('api').from('workforce_...')` call site individually
  // (not just "the pattern occurs somewhere in the file") -- a single query
  // missing `location_id` while every other one has it previously slipped
  // past a looser version of this same assertion (independent review,
  // 2026-09-04: the preferences/workforce_shift_requests query was
  // tenant-scoped only).
  const callSites = [...SOURCE.matchAll(/\.schema\('api'\)\s*\n\s*\.from\('(workforce_[a-z_]+)'\)/g)];
  assert.ok(callSites.length >= 4, `expected at least 4 api.workforce_* call sites, found ${callSites.length}`);
  for (const match of callSites) {
    const viewName = match[1];
    const start = match.index ?? 0;
    // Each call site's own filter chain ends at the next `db\n` (start of
    // the next Promise.all entry / the insert / EOF) -- 500 chars is ample
    // for a single `.select(...).eq(...).eq(...)[...]` chain in this file.
    const chunk = SOURCE.slice(start, start + 500);
    assert.match(chunk, /\.eq\('tenant_id', tenantId\)/, `${viewName} query missing tenant_id scope`);
    assert.match(chunk, /\.eq\('location_id', locationId\)/, `${viewName} query missing location_id scope`);
  }
});

test('the mapped existing-assignment snapshot is defensively re-filtered to the resolved location in JS too (belt-and-suspenders, matching the manual auto-create path)', () => {
  assert.match(SOURCE, /\.filter\(\(a\) => a\.location_id === locationId\)/);
});

test('the idempotency marker write is an optimistic-lock UPDATE (conditioned on the marker still holding its pre-run value), not a blind write -- closes the overlapping-tick race window', () => {
  assert.match(SOURCE, /markQuery\.is\('auto_create_last_generated_month', null\)/);
  assert.match(SOURCE, /markQuery\.eq\('auto_create_last_generated_month', settings\.auto_create_last_generated_month\)/);
  assert.match(SOURCE, /if \(!markedRows \|\| markedRows\.length === 0\) return null;/);
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
