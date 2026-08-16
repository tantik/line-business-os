import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { computeManagerShortageDateSet } from './manager-view-model.js';
import type { ShiftAssignment } from '@/lib/demo/cafe/types';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';

/**
 * Static source-text regression guards for the Manager シフト表 "!" shortage
 * indicator (`ShiftTable.tsx`'s header cell), plus a data-level integration
 * test that runs the real `computeManagerShortageDateSet` domain function and
 * checks its output against the exact same `shortageDateSet.has(date)`
 * condition the header cell renders from. Same convention as
 * `manager-screen-unification.test.ts` - this project's test runner
 * (`node --test`) has no DOM/component-rendering harness, so "does the '!'
 * render only for shortage dates" is verified by tying the render condition's
 * source text to the real computed `Set<string>`, not by mounting a
 * component. Do not add a new test framework (e.g. jsdom/React Testing
 * Library) to get closer to a literal DOM render - this is the existing
 * project pattern for this class of assertion.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

function read(relativeToThisFile: string): string {
  return readFileSync(path.join(THIS_DIR, relativeToThisFile), 'utf8');
}

const SHIFT_TABLE = read('../../components/demo/cafe/ShiftTable.tsx');

function shiftType(overrides: Partial<WorkforceShiftType> = {}): WorkforceShiftType {
  return {
    shiftTypeId: 'st1',
    tenantId: 't1',
    locationId: 'l1',
    code: 'AM',
    labelJa: '午前',
    labelEn: 'Morning',
    startsAtLocal: '08:30',
    endsAtLocal: '13:00',
    breakMinutes: 0,
    isCustom: false,
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

test('ShiftTable derives the header shortage indicator from shortageDateSet.has(date), the same real Set computeManagerShortageDateSet returns - never a separate/duplicated condition', () => {
  assert.ok(
    /const hasShortage = shortageDateSet\?\.has\(date\);/.test(SHIFT_TABLE),
    'the header cell must read shortage status directly off the passed-in shortageDateSet for that exact date',
  );
});

test('ShiftTable renders "!" only when hasShortage is true, and a blank placeholder (not nothing) otherwise - so the header height never shifts on a sufficiently staffed day', () => {
  assert.ok(
    /\{hasShortage \? '!' : '\s'\}/.test(SHIFT_TABLE),
    'the indicator slot must render "!" exactly for a shortage date and a blank placeholder for every other date, never the reverse or a shared fallback',
  );
});

test('ShiftTable only attaches the shortage tooltip to a header cell when hasShortage is true, never unconditionally', () => {
  assert.ok(
    /title=\{hasShortage \? labels\.shortageTooltip : undefined\}/.test(SHIFT_TABLE),
    'the header <th> title attribute must be undefined (no tooltip) on a non-shortage day',
  );
});

test('ShiftTable\'s CHROME_LABELS carries a real JA shortage tooltip describing an actual staffing shortage, not a correction/message alert', () => {
  const match = SHIFT_TABLE.match(/ja:\s*\{[^}]*shortageTooltip:\s*'([^']+)'/);
  assert.ok(match, 'expected to find CHROME_LABELS.ja.shortageTooltip');
  assert.ok(match![1]!.includes('人手不足'), 'JA shortage tooltip must describe a real staffing shortage');
});

test('ShiftTable\'s CHROME_LABELS carries a real EN shortage tooltip describing an actual staffing shortage, not a correction/message alert', () => {
  const match = SHIFT_TABLE.match(/en:\s*\{[^}]*shortageTooltip:\s*'([^']+)'/);
  assert.ok(match, 'expected to find CHROME_LABELS.en.shortageTooltip');
  assert.ok(match![1]!.toLowerCase().includes('staffing'), 'EN shortage tooltip must describe a real staffing shortage');
});

test('integration: the real shortageDateSet computeManagerShortageDateSet returns agrees, date by date, with what the header cell\'s hasShortage condition would evaluate for each date in a mixed week', () => {
  const dates = ['2026-08-03', '2026-08-04', '2026-08-05'];
  const shiftTypes = [shiftType({ shiftTypeId: 'st-am', code: 'AM' })];
  // Mon (index 0) understaffed: 0 assigned < 1 required. Tue (index 1) fully
  // staffed. Wed (index 2) has no requirement at all.
  const assignments: ShiftAssignment[] = [{ staffId: 'e1', date: '2026-08-04', shiftTypeId: 'st-am' }];
  const requiredHeadcountByWeekday = [1, 1, 0, 0, 0, 0, 0];

  const shortageDateSet = computeManagerShortageDateSet(dates, assignments, shiftTypes, requiredHeadcountByWeekday);

  // Mirrors ShiftTable's own `const hasShortage = shortageDateSet?.has(date)`
  // per date - the exact condition the header cell's "!" is gated on.
  const rendered = dates.map((date) => ({ date, hasShortage: shortageDateSet.has(date) }));

  assert.deepEqual(rendered, [
    { date: '2026-08-03', hasShortage: true },
    { date: '2026-08-04', hasShortage: false },
    { date: '2026-08-05', hasShortage: false },
  ]);
});
