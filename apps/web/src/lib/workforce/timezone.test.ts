import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addIsoDays, localDateTimeToUtcIso, utcIsoToLocalDateTime } from './timezone.js';

test('localDateTimeToUtcIso converts Asia/Tokyo (UTC+9, no DST) wall-clock to the correct UTC instant', () => {
  assert.equal(localDateTimeToUtcIso('2026-08-03', '09:00', 'Asia/Tokyo'), '2026-08-03T00:00:00.000Z');
  assert.equal(localDateTimeToUtcIso('2026-08-03', '13:00', 'Asia/Tokyo'), '2026-08-03T04:00:00.000Z');
});

test('localDateTimeToUtcIso rolls over to the previous UTC calendar day when the offset crosses midnight', () => {
  assert.equal(localDateTimeToUtcIso('2026-08-03', '00:30', 'Asia/Tokyo'), '2026-08-02T15:30:00.000Z');
});

test('localDateTimeToUtcIso resolves a DST-observing zone correctly (America/New_York, summer = UTC-4)', () => {
  assert.equal(localDateTimeToUtcIso('2026-07-01', '09:00', 'America/New_York'), '2026-07-01T13:00:00.000Z');
});

test('localDateTimeToUtcIso resolves a DST-observing zone correctly (America/New_York, winter = UTC-5)', () => {
  assert.equal(localDateTimeToUtcIso('2026-01-01', '09:00', 'America/New_York'), '2026-01-01T14:00:00.000Z');
});

test('utcIsoToLocalDateTime is the inverse of localDateTimeToUtcIso for Asia/Tokyo', () => {
  const iso = localDateTimeToUtcIso('2026-08-03', '09:00', 'Asia/Tokyo');
  assert.deepEqual(utcIsoToLocalDateTime(iso, 'Asia/Tokyo'), { workDate: '2026-08-03', localTime: '09:00' });
});

test('utcIsoToLocalDateTime is the inverse of localDateTimeToUtcIso across a UTC-day rollover', () => {
  const iso = localDateTimeToUtcIso('2026-08-03', '00:30', 'Asia/Tokyo');
  assert.deepEqual(utcIsoToLocalDateTime(iso, 'Asia/Tokyo'), { workDate: '2026-08-03', localTime: '00:30' });
});

test('addIsoDays adds calendar days, UTC-anchored, including month/year rollover', () => {
  assert.equal(addIsoDays('2026-08-03', 1), '2026-08-04');
  assert.equal(addIsoDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addIsoDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addIsoDays('2026-08-03', 0), '2026-08-03');
});
