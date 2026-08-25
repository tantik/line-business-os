import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Founder Preview QA (2026-08-25, Staff Shift Schedule v2 fix-up): on a
 * ~375px mobile cell, a shift type's full `label` (often itself a full
 * time-range string, e.g. "13:00-18:00" -- see `shiftTypeDisplayLabel`'s
 * time-range fallback) was overflowing/truncating. In `compact` mode, a
 * resolved shift type must instead render its short 1-based display-order
 * badge; `compact === false` (desktop, and Manager mode, which never passes
 * `compact`) must render exactly the pre-existing full-label behavior, with
 * zero visual change. Same source-text convention as this file's sibling
 * `ShiftTable-keyboard-accessibility.test.ts` -- no DOM/React harness.
 */
const SOURCE = readFileSync(new URL('./ShiftTable.tsx', import.meta.url), 'utf8');

test('a resolved shift type renders its 1-based display-order index only in compact mode', () => {
  assert.match(
    SOURCE,
    /const shiftTypeIndexById = new Map\(shiftTypes\.map\(\(type, index\) => \[type\.id, index \+ 1\]\)\);/,
    'must build a 1-based index map over the shiftTypes array, same order the caller passed in',
  );
  assert.match(
    SOURCE,
    /const cellLabel = shiftType\s*\n\s*\? compact\s*\n\s*\? String\(shiftTypeIndexById\.get\(shiftType\.id\) \?\? shiftType\.label\)\s*\n\s*: shiftType\.label/,
    'compact mode must render the short numeric badge; non-compact must keep the full label unchanged',
  );
});

test('an unresolved/custom shift type keeps the existing raw start-end time fallback in both compact and non-compact mode -- no fake number is invented for it', () => {
  assert.match(
    SOURCE,
    /: assignment\?\.startTime && assignment\?\.endTime\s*\n\s*\? `\$\{assignment\.startTime\}-\$\{assignment\.endTime\}`\s*\n\s*: '－';/,
    'the custom-shift fallback must stay a real start-end time (or the dash), never a numeric badge',
  );
});
