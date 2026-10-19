import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDateTimeToUtcIso } from './fixture-dates.js';

test('localDateTimeToUtcIso converts Asia/Tokyo (UTC+9, no DST) correctly', () => {
  const iso = localDateTimeToUtcIso('2026-03-10', '09:00', 'Asia/Tokyo');
  assert.equal(iso, '2026-03-10T00:00:00.000Z');
});

test('localDateTimeToUtcIso resolves a DST-observing zone correctly (summer)', () => {
  // America/New_York is UTC-4 in July (EDT).
  const iso = localDateTimeToUtcIso('2026-07-10', '09:00', 'America/New_York');
  assert.equal(iso, '2026-07-10T13:00:00.000Z');
});

test('localDateTimeToUtcIso resolves a DST-observing zone correctly (winter)', () => {
  // America/New_York is UTC-5 in January (EST).
  const iso = localDateTimeToUtcIso('2026-01-10', '09:00', 'America/New_York');
  assert.equal(iso, '2026-01-10T14:00:00.000Z');
});

test('localDateTimeToUtcIso rejects a malformed date/time', () => {
  assert.throws(() => localDateTimeToUtcIso('2026-03', '09:00', 'Asia/Tokyo'), /Invalid date or time format/);
});
