import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guards for the Operations "today" boundary. The
 * Manager and Staff pages once took "today" as the UTC calendar date, so from
 * 00:00 to 09:00 JST they asked for yesterday's business date and showed every
 * task overdue. The date must come from the location's own timezone.
 */
const MANAGER_PAGE = readFileSync(new URL('../manager/page.tsx', import.meta.url), 'utf8');
const STAFF_PAGE = readFileSync(new URL('../staff/page.tsx', import.meta.url), 'utf8');

test('Manager page takes the Operations business date in the location timezone, never the UTC date', () => {
  assert.ok(
    /const managerToday = todayIsoInTimeZone\(location\.timezone\);/.test(MANAGER_PAGE),
    'managerToday must be todayIsoInTimeZone(location.timezone)',
  );
  assert.ok(!/const managerToday = new Date\(\)\.toISOString\(\)/.test(MANAGER_PAGE), 'managerToday must not be the UTC date');
});

test('Staff page takes the Operations business date in the location timezone, never the UTC date', () => {
  assert.ok(
    /const operationsToday = todayIsoInTimeZone\(location\.timezone\);/.test(STAFF_PAGE),
    'operationsToday must be todayIsoInTimeZone(location.timezone)',
  );
  assert.ok(!/const operationsToday = new Date\(\)\.toISOString\(\)/.test(STAFF_PAGE), 'operationsToday must not be the UTC date');
});
