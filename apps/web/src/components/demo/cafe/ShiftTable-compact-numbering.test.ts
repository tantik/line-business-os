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
 * zero visual change.
 *
 * A follow-up round of the same QA (round 2) found a second, related
 * overflow: a genuinely custom/unresolved shift (no shift type to number)
 * still rendered its full "13:00-18:00" fallback uncompacted even in compact
 * mode. Round 3: the Founder found even a shortened time range ("13-18")
 * still read as visual noise next to the clean numeric badges -- a
 * short letter badge ("Cus"/"カス") now stands in for it in compact mode
 * instead, with the real time surfaced via `title` (hover) and, for the
 * caller's own shift, the tap-through Shift Details/Request view. Same
 * source-text convention as this file's sibling
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

test('an unresolved/custom shift renders a short letter badge in compact mode, never a fake number and never the raw time', () => {
  assert.match(
    SOURCE,
    /customBadge: 'カス'/,
    'ja must have a short custom-shift badge',
  );
  assert.match(
    SOURCE,
    /customBadge: 'Cus'/,
    'en must have a short custom-shift badge',
  );
  assert.match(
    SOURCE,
    /: customTimeRange\s*\n\s*\? compact\s*\n\s*\? labels\.customBadge\s*\n\s*: customTimeRange\s*\n\s*: '－';/,
    'compact mode must render the short custom badge; non-compact must keep the full time range unchanged; never a numeric index',
  );
});

test('the real custom-shift time stays available via a title/hover attribute in compact mode', () => {
  assert.match(
    SOURCE,
    /const cellTitle = !shiftType && compact \? \(customTimeRange \?\? undefined\) : undefined;/,
    'compact custom-shift cells must expose their real time via title, since the visible badge no longer shows it',
  );
});
