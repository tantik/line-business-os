import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAutoScheduleRunMissed, listRecentAutoScheduleRuns } from './schedule-settings.js';
import { recordingClient } from './test-helpers.js';

test('listRecentAutoScheduleRuns reads the api run-log view, scoped to tenant + location, newest first, limited to 3', async () => {
  const { client, calls } = recordingClient({
    data: [
      {
        run_id: 'r1',
        target_month: '2026-11-01',
        outcome: 'generated',
        created_count: 42,
        shortage_count: 3,
        error_code: null,
        attempt_count: 1,
        last_seen_at: '2026-10-19T15:07:01Z',
      },
    ],
    error: null,
  });
  const result = await listRecentAutoScheduleRuns(client, 'tenant-a', 'loc-1');
  assert.deepEqual(result, {
    status: 'success',
    data: [
      {
        runId: 'r1',
        targetMonth: '2026-11-01',
        outcome: 'generated',
        createdCount: 42,
        shortageCount: 3,
        errorCode: null,
        attemptCount: 1,
        lastSeenAt: '2026-10-19T15:07:01Z',
      },
    ],
  });
  assert.deepEqual(calls.find((c) => c.method === 'schema')?.args, ['api']);
  assert.deepEqual(calls.find((c) => c.method === 'from')?.args, ['workforce_auto_schedule_runs']);
  const eqs = calls.filter((c) => c.method === 'eq').map((c) => c.args);
  assert.deepEqual(eqs, [
    ['tenant_id', 'tenant-a'],
    ['location_id', 'loc-1'],
  ]);
  assert.deepEqual(calls.find((c) => c.method === 'order')?.args, ['last_seen_at', { ascending: false }]);
  assert.deepEqual(calls.find((c) => c.method === 'limit')?.args, [3]);
});

test('listRecentAutoScheduleRuns maps an RLS denial to unauthorized', async () => {
  const { client } = recordingClient({ data: null, error: { code: '42501', message: 'permission denied' } });
  const result = await listRecentAutoScheduleRuns(client, 'tenant-a', 'loc-1');
  assert.equal(result.status, 'unauthorized');
});

const base = {
  autoCreateEnabled: true,
  autoCreateDayOfMonth: 20,
  autoCreateLastGeneratedMonth: null as string | null,
  todayIso: '2026-10-21',
  runs: [] as { targetMonth: string }[],
};

test('isAutoScheduleRunMissed: enabled, past the day, not generated, no run row -> missed', () => {
  assert.equal(isAutoScheduleRunMissed(base), true);
});

test('isAutoScheduleRunMissed: not missed when OFF, on/before the day, already marked, or any run row exists for next month', () => {
  assert.equal(isAutoScheduleRunMissed({ ...base, autoCreateEnabled: false }), false);
  assert.equal(isAutoScheduleRunMissed({ ...base, todayIso: '2026-10-20' }), false, 'the trigger day itself is not missed yet');
  assert.equal(isAutoScheduleRunMissed({ ...base, todayIso: '2026-10-05' }), false);
  assert.equal(isAutoScheduleRunMissed({ ...base, autoCreateLastGeneratedMonth: '2026-11-01' }), false);
  assert.equal(isAutoScheduleRunMissed({ ...base, runs: [{ targetMonth: '2026-11-01' }] }), false, 'a config_error/failed row is shown instead');
});

test('isAutoScheduleRunMissed: an old run row or old marker does not hide a miss; December rolls to January', () => {
  assert.equal(isAutoScheduleRunMissed({ ...base, runs: [{ targetMonth: '2026-10-01' }], autoCreateLastGeneratedMonth: '2026-10-01' }), true);
  assert.equal(isAutoScheduleRunMissed({ ...base, todayIso: '2026-12-25', runs: [{ targetMonth: '2027-01-01' }] }), false);
  assert.equal(isAutoScheduleRunMissed({ ...base, todayIso: '2026-12-25' }), true);
});
