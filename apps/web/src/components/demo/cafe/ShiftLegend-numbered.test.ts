import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Founder Preview QA (2026-08-25, Staff Shift Schedule v2 fix-up): pairs
 * with `ShiftTable-compact-numbering.test.ts`. `numbered` defaults to
 * `false` so every pre-existing caller (Manager, preview surfaces) renders
 * identically unless it explicitly opts in; when `true`, each chip's badge
 * becomes its 1-based display-order index (same ordering `ShiftTable`
 * itself uses), and the adjacent text always still shows the real
 * label/time range. Same source-text convention as this directory's other
 * regression guards -- no DOM/React harness.
 */
const SOURCE = readFileSync(new URL('./ShiftLegend.tsx', import.meta.url), 'utf8');

test('numbered defaults to false, so every existing caller is unaffected unless it opts in', () => {
  assert.match(SOURCE, /numbered\?: boolean;/, 'numbered must be an optional prop');
  assert.match(SOURCE, /numbered = false/, 'numbered must default to false');
});

test('the badge is the 1-based display-order index only when numbered is true; the adjacent text always shows the real label/time', () => {
  assert.match(
    SOURCE,
    /const badgeLabel = numbered \? String\(index \+ 1\) : type\.label;/,
    'the badge must switch to a 1-based index only in numbered mode, otherwise keep the pre-existing full-label badge',
  );
  assert.match(
    SOURCE,
    /\{hasOwnTimeRange \? `\$\{type\.startTime\}-\$\{type\.endTime\}` : type\.label\}/,
    'the adjacent descriptive text must be unaffected by numbered mode -- always the real label/time',
  );
});
