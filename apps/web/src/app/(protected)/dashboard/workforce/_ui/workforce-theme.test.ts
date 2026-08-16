import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceStatusLabel, correctionStatusLabel, exchangeStatusLabel } from './workforce-theme.js';

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
