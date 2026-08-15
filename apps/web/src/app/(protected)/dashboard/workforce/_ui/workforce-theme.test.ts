import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceStatusLabel, correctionStatusLabel } from './workforce-theme.js';

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

test('correctionStatusLabel keeps its existing English-only behavior by default (Manager dashboard has no lang context)', () => {
  assert.equal(correctionStatusLabel('pending'), 'Pending');
  assert.equal(correctionStatusLabel('approved'), 'Approved');
  assert.equal(correctionStatusLabel('rejected'), 'Rejected');
});

test('correctionStatusLabel returns Japanese labels when lang is ja', () => {
  assert.equal(correctionStatusLabel('pending', 'ja'), '保留中');
  assert.equal(correctionStatusLabel('approved', 'ja'), '承認済み');
  assert.equal(correctionStatusLabel('rejected', 'ja'), '却下');
});
