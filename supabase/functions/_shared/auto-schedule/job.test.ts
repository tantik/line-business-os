import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AutoScheduleRunError,
  runAutoScheduleMonthly,
  type AutoScheduleCandidate,
  type AutoScheduleInputs,
  type AutoScheduleRpc,
  type RpcResult,
} from './job.ts';

/**
 * Behavioural tests for the scheduled monthly auto-create orchestration
 * (DEBT-074). The DB side (`api.auto_schedule_*`, migration 0125) is covered
 * by pgTAP `supabase/tests/0065_...`; here the RPC is a fake that records
 * every call, so the job's own decisions (trigger day in the location
 * timezone, idempotent skip, config errors not marked, per-location failure
 * isolation, lost race) are executed for real.
 */

const T1 = '11111111-1111-1111-1111-111111111111';
const L1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const L2 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const E1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1';
const E2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2';
const ST1 = '55555555-5555-5555-5555-555555555551';

// 2026-10-19T15:30Z is 2026-10-20 00:30 in Asia/Tokyo (still the 19th in UTC).
const JST_20TH = new Date('2026-10-19T15:30:00Z');

function candidate(overrides: Partial<AutoScheduleCandidate> = {}): AutoScheduleCandidate {
  return {
    tenant_id: T1,
    location_id: L1,
    timezone: 'Asia/Tokyo',
    auto_create_day_of_month: 20,
    auto_create_last_generated_month: null,
    required_headcount_by_weekday: [1, 1, 1, 1, 1, 1, 1],
    max_monthly_hours: 160,
    ...overrides,
  };
}

function inputs(overrides: Partial<AutoScheduleInputs> = {}): AutoScheduleInputs {
  return {
    employees: [
      { employee_id: E1, is_active: true },
      { employee_id: E2, is_active: true },
    ],
    shift_types: [
      {
        shift_type_id: ST1,
        code: 'AM',
        starts_at_local: '09:00',
        ends_at_local: '17:00',
        break_minutes: 60,
        sort_order: 1,
        is_active: true,
      },
    ],
    preferences: [],
    existing_assignments: [],
    ...overrides,
  };
}

interface Call {
  fn: string;
  args: Record<string, unknown> | undefined;
}

function fakeRpc(handlers: {
  candidates: AutoScheduleCandidate[] | RpcResult;
  inputsByLocation?: Record<string, AutoScheduleInputs | RpcResult | Error>;
  applyResult?: (args: Record<string, unknown>) => RpcResult;
}): { rpc: AutoScheduleRpc; calls: Call[] } {
  const calls: Call[] = [];
  const rpc: AutoScheduleRpc = async (fn, args) => {
    calls.push({ fn, args });
    switch (fn) {
      case 'auto_schedule_candidates':
        return Array.isArray(handlers.candidates) ? { data: handlers.candidates, error: null } : handlers.candidates;
      case 'auto_schedule_load_inputs': {
        const value = handlers.inputsByLocation?.[args?.p_location_id as string] ?? inputs();
        if (value instanceof Error) throw value;
        if ('error' in value && 'data' in value) return value as RpcResult;
        return { data: value, error: null };
      }
      case 'auto_schedule_apply':
        return handlers.applyResult ? handlers.applyResult(args ?? {}) : { data: true, error: null };
      case 'auto_schedule_record_issue':
        return { data: null, error: null };
      default:
        throw new Error(`unexpected rpc ${fn}`);
    }
  };
  return { rpc, calls };
}

const callsTo = (calls: Call[], fn: string) => calls.filter((c) => c.fn === fn);

test('trigger day matches in the location timezone (JST boundary): generates next month, all drafts in the target month', async () => {
  const { rpc, calls } = fakeRpc({ candidates: [candidate()] });
  const summary = await runAutoScheduleMonthly(rpc, JST_20TH);

  assert.equal(summary.candidates, 1);
  assert.equal(summary.results.length, 1);
  const r = summary.results[0]!;
  assert.equal(r.outcome, 'generated');
  assert.equal(r.targetMonth, '2026-11');
  assert.equal(r.errorCode, null);
  assert.ok(r.created > 0, 'drafts were produced by the engine');

  const load = callsTo(calls, 'auto_schedule_load_inputs')[0]!;
  assert.deepEqual(load.args, {
    p_tenant_id: T1,
    p_location_id: L1,
    p_period_start: '2026-11-01',
    p_period_end: '2026-11-30',
    p_from: '2026-10-31T15:00:00.000Z',
    p_to: '2026-11-30T15:00:00.000Z',
  });

  const apply = callsTo(calls, 'auto_schedule_apply')[0]!;
  assert.equal(apply.args?.p_target_month, '2026-11-01');
  assert.equal(apply.args?.p_expected_marker, null);
  const drafts = apply.args?.p_drafts as { employee_id: string; shift_type_id: string; starts_at: string; ends_at: string }[];
  assert.equal(drafts.length, r.created);
  for (const d of drafts) {
    assert.ok(d.starts_at >= '2026-10-31T15:00:00.000Z' && d.starts_at < '2026-11-30T15:00:00.000Z', `draft inside Nov (JST): ${d.starts_at}`);
    assert.equal(d.shift_type_id, ST1);
    assert.ok([E1, E2].includes(d.employee_id));
    assert.equal('published' in d, false, 'publish state is decided by the DB (always false), never by the caller');
  }
  assert.equal(callsTo(calls, 'auto_schedule_record_issue').length, 0);
});

test('day mismatch: the same instant is the 19th in UTC, so a UTC location is silently skipped', async () => {
  const { rpc, calls } = fakeRpc({ candidates: [candidate({ timezone: 'UTC' })] });
  const summary = await runAutoScheduleMonthly(rpc, JST_20TH);
  assert.deepEqual(summary.results, []);
  assert.deepEqual(calls.map((c) => c.fn), ['auto_schedule_candidates']);
});

test('one minute before JST midnight is still the 19th in Tokyo -> skipped', async () => {
  const { rpc, calls } = fakeRpc({ candidates: [candidate()] });
  const summary = await runAutoScheduleMonthly(rpc, new Date('2026-10-19T14:59:00Z'));
  assert.deepEqual(summary.results, []);
  assert.equal(callsTo(calls, 'auto_schedule_load_inputs').length, 0);
});

test('already generated for the target month: skipped without loading anything (idempotent re-tick)', async () => {
  const { rpc, calls } = fakeRpc({ candidates: [candidate({ auto_create_last_generated_month: '2026-11-01' })] });
  const summary = await runAutoScheduleMonthly(rpc, JST_20TH);
  assert.deepEqual(summary.results, []);
  assert.deepEqual(calls.map((c) => c.fn), ['auto_schedule_candidates']);
});

test('a marker from the previous month is passed through as the optimistic-lock expected value', async () => {
  const { rpc, calls } = fakeRpc({ candidates: [candidate({ auto_create_last_generated_month: '2026-10-01' })] });
  await runAutoScheduleMonthly(rpc, JST_20TH);
  assert.equal(callsTo(calls, 'auto_schedule_apply')[0]!.args?.p_expected_marker, '2026-10-01');
});

test('config error (no active shift types): recorded as config_error, never applied/marked', async () => {
  const { rpc, calls } = fakeRpc({
    candidates: [candidate()],
    inputsByLocation: {
      [L1]: inputs({ shift_types: [{ ...inputs().shift_types[0]!, is_active: false }] }),
    },
  });
  const summary = await runAutoScheduleMonthly(rpc, JST_20TH);
  assert.equal(summary.results[0]!.outcome, 'config_error');
  assert.equal(summary.results[0]!.errorCode, 'no_active_shift_types');
  assert.equal(callsTo(calls, 'auto_schedule_apply').length, 0, 'marker never set on a config error');
  assert.deepEqual(callsTo(calls, 'auto_schedule_record_issue')[0]!.args, {
    p_tenant_id: T1,
    p_location_id: L1,
    p_target_month: '2026-11-01',
    p_outcome: 'config_error',
    p_error_code: 'no_active_shift_types',
  });
});

test('config error (no required headcount): recorded as config_error, never applied', async () => {
  const { rpc, calls } = fakeRpc({ candidates: [candidate({ required_headcount_by_weekday: [0, 0, 0, 0, 0, 0, 0] })] });
  const summary = await runAutoScheduleMonthly(rpc, JST_20TH);
  assert.equal(summary.results[0]!.outcome, 'config_error');
  assert.equal(summary.results[0]!.errorCode, 'no_staffing_requirement');
  assert.equal(callsTo(calls, 'auto_schedule_apply').length, 0);
});

test('per-location failure isolation: a throwing load at L1 is recorded as failed and L2 still generates', async () => {
  const { rpc, calls } = fakeRpc({
    candidates: [candidate(), candidate({ location_id: L2 })],
    inputsByLocation: { [L1]: new Error('network blew up with secret detail') },
  });
  const summary = await runAutoScheduleMonthly(rpc, JST_20TH);
  assert.equal(summary.results.length, 2);
  const [r1, r2] = summary.results;
  assert.equal(r1!.locationId, L1);
  assert.equal(r1!.outcome, 'failed');
  assert.equal(r1!.errorCode, 'unexpected_error');
  assert.equal(r2!.locationId, L2);
  assert.equal(r2!.outcome, 'generated');
  const issue = callsTo(calls, 'auto_schedule_record_issue')[0]!;
  assert.equal(issue.args?.p_outcome, 'failed');
  assert.equal(issue.args?.p_error_code, 'unexpected_error');
  assert.ok(!JSON.stringify(summary).includes('secret detail'), 'raw error text never reaches the summary');
});

test('an RPC error on load / apply maps to a short machine code', async () => {
  const load = fakeRpc({
    candidates: [candidate()],
    inputsByLocation: { [L1]: { data: null, error: { code: '42501', message: 'permission denied for schema workforce' } } },
  });
  const s1 = await runAutoScheduleMonthly(load.rpc, JST_20TH);
  assert.equal(s1.results[0]!.errorCode, 'load_inputs_failed');

  const apply = fakeRpc({
    candidates: [candidate()],
    applyResult: () => ({ data: null, error: { code: '22023', message: 'draft(s) rejected' } }),
  });
  const s2 = await runAutoScheduleMonthly(apply.rpc, JST_20TH);
  assert.equal(s2.results[0]!.outcome, 'failed');
  assert.equal(s2.results[0]!.errorCode, 'apply_failed');
  assert.ok(!JSON.stringify(s2).includes('rejected'));
});

test('apply returning false (lost the race): already_claimed, nothing recorded as an issue', async () => {
  const { rpc, calls } = fakeRpc({ candidates: [candidate()], applyResult: () => ({ data: false, error: null }) });
  const summary = await runAutoScheduleMonthly(rpc, JST_20TH);
  assert.equal(summary.results[0]!.outcome, 'already_claimed');
  assert.equal(summary.results[0]!.created, 0);
  assert.equal(callsTo(calls, 'auto_schedule_record_issue').length, 0);
});

test('existing manual shifts are preserved: the employee already working a day is not double-booked', async () => {
  const { rpc, calls } = fakeRpc({
    candidates: [candidate({ required_headcount_by_weekday: [1, 1, 1, 1, 1, 1, 1] })],
    inputsByLocation: {
      [L1]: inputs({
        employees: [{ employee_id: E1, is_active: true }],
        existing_assignments: [
          {
            employee_id: E1,
            shift_type_id: ST1,
            starts_at: '2026-11-02T00:00:00+00:00', // 09:00 JST, 2 Nov
            ends_at: '2026-11-02T08:00:00+00:00',
            break_minutes: 60,
            published: true,
            location_id: L1,
          },
        ],
      }),
    },
  });
  await runAutoScheduleMonthly(rpc, JST_20TH);
  const drafts = callsTo(calls, 'auto_schedule_apply')[0]!.args?.p_drafts as { starts_at: string }[];
  assert.ok(!drafts.some((d) => d.starts_at === '2026-11-02T00:00:00.000Z'), 'no draft on the manually staffed day');
});

test('invalid IANA timezone: recorded as failed/invalid_timezone on the UTC trigger day, never loads or applies', async () => {
  // JST_20TH is the 19th in UTC.
  const { rpc, calls } = fakeRpc({ candidates: [candidate({ timezone: 'Not/A_Zone', auto_create_day_of_month: 19 })] });
  const summary = await runAutoScheduleMonthly(rpc, JST_20TH);
  assert.equal(summary.results.length, 1);
  assert.equal(summary.results[0]!.outcome, 'failed');
  assert.equal(summary.results[0]!.errorCode, 'invalid_timezone');
  assert.equal(summary.results[0]!.targetMonth, '2026-11');
  assert.deepEqual(callsTo(calls, 'auto_schedule_record_issue')[0]!.args, {
    p_tenant_id: T1,
    p_location_id: L1,
    p_target_month: '2026-11-01',
    p_outcome: 'failed',
    p_error_code: 'invalid_timezone',
  });
  assert.equal(callsTo(calls, 'auto_schedule_load_inputs').length, 0);
  assert.equal(callsTo(calls, 'auto_schedule_apply').length, 0);

  // Any other UTC day: silent skip (no hourly spam outside the trigger day).
  const other = fakeRpc({ candidates: [candidate({ timezone: 'Not/A_Zone', auto_create_day_of_month: 20 })] });
  const skipped = await runAutoScheduleMonthly(other.rpc, JST_20TH);
  assert.deepEqual(skipped.results, []);
  assert.deepEqual(other.calls.map((c) => c.fn), ['auto_schedule_candidates']);
});

test('candidates RPC error is a whole-run error with a code (no location processed)', async () => {
  const { rpc } = fakeRpc({ candidates: { data: null, error: { code: '42501' } } });
  await assert.rejects(runAutoScheduleMonthly(rpc, JST_20TH), (err: unknown) => {
    assert.ok(err instanceof AutoScheduleRunError);
    assert.equal((err as AutoScheduleRunError).code, 'candidates_failed');
    return true;
  });
});

test('source guard: one shared engine (generated copy), never a local reimplementation', () => {
  const source = readFileSync(new URL('./job.ts', import.meta.url), 'utf8');
  assert.match(source, /from '\.\.\/workforce-engine\/auto-distribute\.ts'/);
  assert.match(source, /from '\.\.\/workforce-engine\/auto-distribution-authority\.ts'/);
  assert.doesNotMatch(source, /function autoDistribute/);
  assert.match(source, /overwriteExisting: false/);
  assert.match(source, /extraHoursByEmployee: \{\}/);
  assert.doesNotMatch(source, /published:\s*true/);
  assert.doesNotMatch(source, /Deno\.(env|serve)/);
});
