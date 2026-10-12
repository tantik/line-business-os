import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoCreateConfigErrorMessage,
  autoScheduleConfigErrorReasonText,
  autoScheduleRunConfigErrorLine,
  autoScheduleRunDateTimeLabel,
  autoScheduleRunFailedLine,
  autoScheduleRunGeneratedLine,
  autoScheduleRunMissedLine,
  autoScheduleTargetMonthLabel,
} from './manager-dashboard-i18n';

/** DEBT-074: Manager-facing run-log copy (JA/EN), month label and location-timezone datetime. */

test('target month label: JA YYYY年M月, EN Month YYYY', () => {
  assert.equal(autoScheduleTargetMonthLabel('ja', '2026-11-01'), '2026年11月');
  assert.equal(autoScheduleTargetMonthLabel('en', '2026-11-01'), 'November 2026');
  assert.equal(autoScheduleTargetMonthLabel('ja', '2027-01-01'), '2027年1月');
});

test('run datetime: exact deterministic strings in the location timezone (hydration-safe)', () => {
  // 2026-10-20T00:07Z is 2026-10-20 09:07 in Tokyo.
  assert.equal(autoScheduleRunDateTimeLabel('ja', '2026-10-20T00:07:00Z', 'Asia/Tokyo'), '10月20日 9:07');
  assert.equal(autoScheduleRunDateTimeLabel('en', '2026-10-20T00:07:00Z', 'Asia/Tokyo'), 'Oct 20, 9:07');
  // 2026-10-19T15:07Z crosses the JST day boundary: 20 Oct 0:07 in Tokyo, still 19 Oct in UTC.
  assert.equal(autoScheduleRunDateTimeLabel('ja', '2026-10-19T15:07:00Z', 'Asia/Tokyo'), '10月20日 0:07');
  assert.equal(autoScheduleRunDateTimeLabel('en', '2026-10-19T15:07:00Z', 'UTC'), 'Oct 19, 15:07');
  // 24h clock, December, no locale punctuation (only ASCII digits/letters, ':', ',', ' ' and the JA 月/日).
  const en = autoScheduleRunDateTimeLabel('en', '2026-12-31T14:59:00Z', 'Asia/Tokyo');
  assert.equal(en, 'Dec 31, 23:59');
  assert.match(en, /^[A-Za-z0-9:, ]+$/);
});

test('generated line, JA and EN, with EN pluralization', () => {
  assert.equal(
    autoScheduleRunGeneratedLine.ja('10月20日 9:07', '2026年11月', 42, 3),
    '10月20日 9:07 2026年11月分の下書きを作成しました（42件、人員不足 3件）',
  );
  assert.equal(
    autoScheduleRunGeneratedLine.en('Oct 20, 9:07', 'November 2026', 42, 3),
    'Oct 20, 9:07: created a draft for November 2026 (42 shifts, 3 shortages)',
  );
  assert.equal(
    autoScheduleRunGeneratedLine.en('Oct 20, 9:07', 'November 2026', 1, 1),
    'Oct 20, 9:07: created a draft for November 2026 (1 shift, 1 shortage)',
  );
  assert.equal(
    autoScheduleRunGeneratedLine.en('Oct 20, 9:07', 'November 2026', 0, 0),
    'Oct 20, 9:07: created a draft for November 2026 (0 shifts, 0 shortages)',
  );
});

test('config error reasons reuse the manual auto-create copy (one dictionary, シフト種別 terminology)', () => {
  assert.equal(autoScheduleConfigErrorReasonText('ja', 'no_active_shift_types'), autoCreateConfigErrorMessage.ja('no_active_windows'));
  assert.equal(autoScheduleConfigErrorReasonText('en', 'no_staffing_requirement'), autoCreateConfigErrorMessage.en('no_staffing_requirement'));
  assert.match(autoScheduleConfigErrorReasonText('ja', 'no_active_shift_types')!, /シフト種別/);
  assert.doesNotMatch(autoScheduleConfigErrorReasonText('ja', 'no_active_shift_types')!, /シフト区分/);
  assert.equal(autoScheduleConfigErrorReasonText('ja', 'something_else'), null);
  assert.equal(autoScheduleConfigErrorReasonText('en', null), null);
});

test('config error and failed lines carry the local date/time and the target month', () => {
  assert.equal(
    autoScheduleRunConfigErrorLine.ja('10月20日 9:07', '2026年11月', '理由。'),
    '10月20日 9:07 2026年11月分は自動作成できませんでした：理由。',
  );
  assert.equal(
    autoScheduleRunConfigErrorLine.en('Oct 20, 9:07', 'November 2026', 'Reason.'),
    'Oct 20, 9:07: automatic creation for November 2026 did not run: Reason.',
  );
  assert.equal(autoScheduleRunFailedLine.ja('10月20日 9:07', '2026年11月'), '10月20日 9:07 2026年11月分の自動作成に失敗しました。手動で作成してください。');
  assert.equal(
    autoScheduleRunFailedLine.en('Oct 20, 9:07', 'November 2026'),
    'Oct 20, 9:07: automatic creation for November 2026 failed. Please create the schedule manually.',
  );
});

test('missed line', () => {
  assert.equal(autoScheduleRunMissedLine.ja(20), '今月の自動作成（毎月20日）は実行されませんでした。手動で作成してください。');
  assert.equal(autoScheduleRunMissedLine.en(20), "This month's automatic creation (day 20) did not run. Please create the schedule manually.");
});
