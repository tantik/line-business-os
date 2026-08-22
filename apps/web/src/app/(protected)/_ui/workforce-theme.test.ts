import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceStatusLabel, correctionStatusLabel, exchangeStatusLabel, shiftChipColors } from './workforce-theme.js';

test('attendanceStatusLabel maps every workforce.attendance_status enum value to an English label by default', () => {
  assert.equal(attendanceStatusLabel('present'), 'Present');
  assert.equal(attendanceStatusLabel('late'), 'Late');
  assert.equal(attendanceStatusLabel('absent'), 'Absent');
  assert.equal(attendanceStatusLabel('on_leave'), 'On leave');
});

test('attendanceStatusLabel maps every workforce.attendance_status enum value to a Japanese label when lang is ja', () => {
  assert.equal(attendanceStatusLabel('present', 'ja'), '出勤');
  assert.equal(attendanceStatusLabel('late', 'ja'), '遅刻');
  assert.equal(attendanceStatusLabel('absent', 'ja'), '欠勤');
  assert.equal(attendanceStatusLabel('on_leave', 'ja'), '休暇');
});

test('attendanceStatusLabel falls back to the raw value for an unrecognized status, never throws', () => {
  assert.equal(attendanceStatusLabel('unknown_future_status'), 'unknown_future_status');
  assert.equal(attendanceStatusLabel('unknown_future_status', 'ja'), 'unknown_future_status');
});

test('correctionStatusLabel keeps its existing English-only default (call sites predating Mission 2 do not pass lang)', () => {
  assert.equal(correctionStatusLabel('pending'), 'Pending');
  assert.equal(correctionStatusLabel('approved'), 'Approved');
  assert.equal(correctionStatusLabel('rejected'), 'Rejected');
});

test('correctionStatusLabel returns Japanese labels when lang is ja', () => {
  assert.equal(correctionStatusLabel('pending', 'ja'), '保留中');
  assert.equal(correctionStatusLabel('approved', 'ja'), '承認済み');
  assert.equal(correctionStatusLabel('rejected', 'ja'), '却下');
});

test('exchangeStatusLabel keeps its existing English-only default (call sites predating Mission 2 do not pass lang)', () => {
  assert.equal(exchangeStatusLabel('open'), 'Open');
  assert.equal(exchangeStatusLabel('accepted'), 'Accepted');
  assert.equal(exchangeStatusLabel('approved'), 'Approved');
  assert.equal(exchangeStatusLabel('rejected'), 'Rejected');
  assert.equal(exchangeStatusLabel('cancelled'), 'Cancelled');
});

test('exchangeStatusLabel returns Japanese labels when lang is ja', () => {
  assert.equal(exchangeStatusLabel('open', 'ja'), '募集中');
  assert.equal(exchangeStatusLabel('accepted', 'ja'), '承諾済み');
  assert.equal(exchangeStatusLabel('approved', 'ja'), '承認済み');
  assert.equal(exchangeStatusLabel('rejected', 'ja'), '却下');
  assert.equal(exchangeStatusLabel('cancelled', 'ja'), 'キャンセル済み');
});

test('exchangeStatusLabel falls back to the raw value for an unrecognized status, never throws', () => {
  assert.equal(exchangeStatusLabel('unknown_future_status'), 'unknown_future_status');
  assert.equal(exchangeStatusLabel('unknown_future_status', 'ja'), 'unknown_future_status');
});

// WP A8: with the active-ids list supplied, no two ids among the first
// CHIP_TONES.length (3) active shift types ever collide on the same tone --
// deterministic by position, not hash chance.
test('shiftChipColors: with allActiveShiftTypeIds, distinct active ids never collide up to the tone-palette size', () => {
  const ids = ['type-a', 'type-b', 'type-c'];
  const tones = ids.map((id) => shiftChipColors(id, ids));
  assert.notDeepEqual(tones[0], tones[1]);
  assert.notDeepEqual(tones[1], tones[2]);
  assert.notDeepEqual(tones[0], tones[2]);
});

// Weekly Schedule redesign (2026-08-22): capacity requirement -- at least 10
// visually distinct tones, and exactly 10 concurrently-active shift types
// never collide with each other.
test('shiftChipColors: supports at least 10 distinct tones with zero collisions among 10 active ids', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `shift-type-${i}`);
  const tones = ids.map((id) => shiftChipColors(id, ids));
  const seen = new Set(tones.map((tone) => `${tone.background}|${tone.color}`));
  assert.equal(seen.size, 10, 'expected 10 distinct tones for 10 distinct active shift types');
});

// Beyond the guaranteed 10-tone capacity, the mapping must degrade
// gracefully (deterministic reuse), never throw and never return an
// undefined/invalid style.
test('shiftChipColors: beyond 10 active ids, every id still resolves to a valid tone (no crash)', () => {
  const ids = Array.from({ length: 14 }, (_, i) => `overflow-type-${i}`);
  for (const id of ids) {
    const tone = shiftChipColors(id, ids);
    assert.ok(typeof tone.background === 'string' && tone.background.length > 0);
    assert.ok(typeof tone.color === 'string' && tone.color.length > 0);
  }
});

// Stability requirement: a shift type's color must not change just because
// some *other* shift type was reordered, added, or removed -- reordering
// the input array (same set, different order) must resolve every id to the
// exact same tone every time.
test('shiftChipColors: tone for a given id is stable regardless of the active-ids array order (reorder-immune)', () => {
  const ids = ['type-a', 'type-b', 'type-c', 'type-d'];
  const reordered = ['type-d', 'type-b', 'type-a', 'type-c'];
  for (const id of ids) {
    assert.deepEqual(shiftChipColors(id, ids), shiftChipColors(id, reordered));
  }
});

// Stability requirement: adding a brand-new shift type to the active set
// must not repaint a shift type that already had a color and does not
// collide with the new one.
test('shiftChipColors: adding a new active id does not change an existing, lower-sorted id\'s tone', () => {
  const before = ['type-a', 'type-b', 'type-c'];
  const after = ['type-a', 'type-b', 'type-c', 'type-z-new'];
  // `type-a` sorts before `type-z-new`, so the collision pass (sorted
  // ascending) always assigns `type-a` its slot first, same as before --
  // appending a higher-sorted id can only affect ids that sort after it,
  // never this one.
  assert.deepEqual(shiftChipColors('type-a', before), shiftChipColors('type-a', after));
});

test('shiftChipColors: same id always resolves to the same tone given the same active-ids list', () => {
  const ids = ['type-a', 'type-b'];
  assert.deepEqual(shiftChipColors('type-b', ids), shiftChipColors('type-b', ids));
});

test('shiftChipColors: an id not present in allActiveShiftTypeIds falls back to the hash-based tone', () => {
  const withoutList = shiftChipColors('deactivated-type');
  const notInList = shiftChipColors('deactivated-type', ['type-a', 'type-b']);
  assert.deepEqual(notInList, withoutList);
});

test('shiftChipColors: null/undefined id and no list both keep their pre-A8 behavior', () => {
  assert.deepEqual(shiftChipColors(null), shiftChipColors(null, ['type-a']));
  assert.deepEqual(shiftChipColors('type-a'), shiftChipColors('type-a'));
});
