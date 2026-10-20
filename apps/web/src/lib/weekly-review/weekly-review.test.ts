import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWeeklyReviewSummary, mapWeeklyReviewSummary } from './weekly-review.js';

const FULL = {
  weekStart: '2026-01-05',
  weekEnd: '2026-01-11',
  workforce: {
    shiftAssignmentsCount: 7,
    shiftExchangesCount: 1,
    unresolvedShiftRequestsCount: 2,
    attendanceCount: 6,
    lateCount: 2,
    lateMinutesTotal: 16,
    noShowCount: 1,
    unscheduledClockInsCount: 1,
  },
  operations: {
    completedCount: 4,
    criticalMissedCount: 1,
    openExceptionsCount: 3,
    thresholdOutOfRangeCount: 2,
    thresholdOutOfRangeOpenCount: 1,
  },
  issues: { newIssuesCount: 0, newHandoversCount: 0, unresolvedIssuesCount: 0, unresolvedImportantIssuesCount: 0, recurringCategories: [] },
  purchasing: { shortageItemsCount: 0, pendingPurchasesCount: 0 },
};

test('mapWeeklyReviewSummary passes every 0136 attendance/threshold count through unchanged', () => {
  assert.deepEqual(mapWeeklyReviewSummary(FULL), FULL);
});

test('mapWeeklyReviewSummary keeps module-off sections null (not a zero-filled object)', () => {
  const mapped = mapWeeklyReviewSummary({ ...FULL, workforce: null, operations: null });
  assert.equal(mapped.workforce, null);
  assert.equal(mapped.operations, null);
});

test('mapWeeklyReviewSummary reads counts missing from a pre-0136 DB function as 0, never undefined', () => {
  const mapped = mapWeeklyReviewSummary({
    ...FULL,
    workforce: { shiftAssignmentsCount: 3, shiftExchangesCount: 0, unresolvedShiftRequestsCount: 1 },
    operations: { completedCount: 2, criticalMissedCount: 0, openExceptionsCount: 0 },
  });
  assert.deepEqual(mapped.workforce, {
    shiftAssignmentsCount: 3,
    shiftExchangesCount: 0,
    unresolvedShiftRequestsCount: 1,
    attendanceCount: 0,
    lateCount: 0,
    lateMinutesTotal: 0,
    noShowCount: 0,
    unscheduledClockInsCount: 0,
  });
  assert.equal(mapped.operations?.thresholdOutOfRangeCount, 0);
  assert.equal(mapped.operations?.thresholdOutOfRangeOpenCount, 0);
});

test('getWeeklyReviewSummary calls api.weekly_review_summary with the six arguments and maps the result', async () => {
  let calledSchema = '';
  let calledFn = '';
  let calledArgs: Record<string, unknown> = {};
  const supabase = {
    schema(name: string) {
      calledSchema = name;
      return {
        rpc(fn: string, args: Record<string, unknown>) {
          calledFn = fn;
          calledArgs = args;
          return Promise.resolve({ data: FULL, error: null });
        },
      };
    },
  } as unknown as SupabaseClient;

  const result = await getWeeklyReviewSummary(supabase, 't1', 'l1', '2026-01-05', '2026-01-11', '2026-01-04T15:00:00.000Z', '2026-01-11T15:00:00.000Z');
  assert.equal(calledSchema, 'api');
  assert.equal(calledFn, 'weekly_review_summary');
  assert.deepEqual(calledArgs, {
    p_tenant_id: 't1',
    p_location_id: 'l1',
    p_week_start: '2026-01-05',
    p_week_end: '2026-01-11',
    p_week_starts_at: '2026-01-04T15:00:00.000Z',
    p_week_ends_at_exclusive: '2026-01-11T15:00:00.000Z',
  });
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data.workforce?.lateMinutesTotal, 16);
    assert.equal(result.data.operations?.thresholdOutOfRangeOpenCount, 1);
  }
});
