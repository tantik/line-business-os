import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDateTimeToUtcIso, resolveFixtureAnchorNow, resolveIsoDate } from './mame-to-cha-dates.js';

test('resolveIsoDate offsets by UTC calendar days, including month rollover', () => {
  const now = new Date('2026-01-31T23:00:00Z');
  assert.equal(resolveIsoDate(now, 0), '2026-01-31');
  assert.equal(resolveIsoDate(now, 1), '2026-02-01');
  assert.equal(resolveIsoDate(now, -31), '2025-12-31');
});

test('resolveFixtureAnchorNow keeps an existing fixture pinned to tenant creation time', () => {
  const fallback = new Date('2026-07-24T00:00:00Z');
  assert.equal(
    resolveFixtureAnchorNow('2026-07-18T07:33:20.000Z', fallback).toISOString(),
    '2026-07-18T07:33:20.000Z',
  );
  assert.equal(resolveFixtureAnchorNow(undefined, fallback), fallback);
});

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
