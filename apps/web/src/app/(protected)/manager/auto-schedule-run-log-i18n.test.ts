import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoScheduleConfigErrorReason,
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

test('generated line, JA and EN', () => {
  assert.equal(
    autoScheduleRunGeneratedLine.ja('10月20日 9:07', '2026年11月', 42, 3),
    '10月20日 9:07 2026年11月分の下書きを作成しました（42件、人員不足 3件）',
  );
  assert.equal(
    autoScheduleRunGeneratedLine.en('Oct 20, 9:07', 'November 2026', 42, 3),
    'Oct 20, 9:07: created a draft for November 2026 (42 shifts, 3 shortages)',
  );
});

test('config error lines carry a translated reason for both machine codes', () => {
  assert.equal(
    autoScheduleRunConfigErrorLine.ja(autoScheduleConfigErrorReason.ja.no_active_shift_types!),
    '自動作成できませんでした：有効なシフト区分がありません',
  );
  assert.equal(
    autoScheduleRunConfigErrorLine.en(autoScheduleConfigErrorReason.en.no_staffing_requirement!),
    'Automatic creation did not run: no required headcount set',
  );
  for (const lang of ['ja', 'en'] as const) {
    assert.deepEqual(Object.keys(autoScheduleConfigErrorReason[lang]).sort(), ['no_active_shift_types', 'no_staffing_requirement']);
  }
});

test('failed and missed lines', () => {
  assert.equal(autoScheduleRunFailedLine.ja, '自動作成に失敗しました。手動で作成してください。');
  assert.equal(autoScheduleRunFailedLine.en, 'Automatic creation failed. Please create the schedule manually.');
  assert.equal(autoScheduleRunMissedLine.ja(20), '毎月20日の自動作成がまだ実行されていません。手動で作成してください。');
  assert.equal(
    autoScheduleRunMissedLine.en(20),
    "This month's automatic creation (day 20) has not run yet. Please create the schedule manually.",
  );
});
