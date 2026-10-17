import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCoalescer, employeeTopic, managerTopic, signalAreaFor, staffTopic } from './live-signals';

const T = 'c1270000-0000-0000-0000-00000000000a';
const L1 = 'c1271000-0000-0000-0000-000000000001';
const L2 = 'c1271000-0000-0000-0000-000000000002';
const ME = 'c1279000-0000-0000-0000-000000000002';
const OTHER = 'c1279000-0000-0000-0000-000000000001';

test('topic names match the 0127 join rule (core.realtime_topic_allowed)', () => {
  assert.equal(staffTopic(T), `oruwa:${T}:staff`);
  assert.equal(managerTopic(T), `oruwa:${T}:manager`);
  assert.equal(employeeTopic(T, ME), `oruwa:${T}:emp:${ME}`);
  const migration = readFileSync(new URL('../../../../../supabase/migrations/0127_realtime_change_signals.sql', import.meta.url), 'utf8');
  assert.match(migration, /v_parts\[3\] = 'staff'/);
  assert.match(migration, /v_parts\[3\] = 'manager'/);
  assert.match(migration, /v_parts\[3\] = 'emp'/);
});

test('signalAreaFor: relevant signals pass, own / other-location / unknown are dropped', () => {
  const ctx = { locationId: L1, myUserId: ME };
  assert.equal(signalAreaFor({ area: 'schedule', location: L1, by: OTHER }, ctx), 'schedule');
  assert.equal(signalAreaFor({ area: 'mail', location: L1, by: null }, ctx), 'mail', 'system (cloud runner) changes pass');
  assert.equal(signalAreaFor({ area: 'recipes', location: null, by: OTHER }, ctx), 'recipes', 'tenant-wide rows pass');
  assert.equal(signalAreaFor({ area: 'schedule', location: L1, by: ME }, ctx), null, 'own change already refreshed');
  assert.equal(signalAreaFor({ area: 'schedule', location: L2, by: OTHER }, ctx), null, 'another location is ignored');
  assert.equal(signalAreaFor({ area: 'drop-table', location: L1 }, ctx), null);
  assert.equal(signalAreaFor({ location: L1 }, ctx), null);
  assert.equal(signalAreaFor(null, ctx), null);
  assert.equal(signalAreaFor({ area: 'issues', location: L2 }, { locationId: null, myUserId: null }), 'issues', 'no location filter when the screen has none');
});

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    clock: {
      now: () => now,
      setTimeout: (fn: () => void, ms: number) => {
        const id = nextId++;
        timers.set(id, { at: now + ms, fn });
        return id;
      },
      clearTimeout: (id: unknown) => void timers.delete(id as number),
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

test('createCoalescer: a burst of signals gives one run after the quiet period', () => {
  const f = fakeClock();
  let runs = 0;
  const c = createCoalescer(() => runs++, { debounceMs: 2000, minGapMs: 10_000 }, f.clock);
  for (let i = 0; i < 20; i++) {
    c.trigger();
    f.advance(100);
  }
  assert.equal(runs, 0, 'still inside the burst');
  f.advance(2000);
  assert.equal(runs, 1);
});

test('createCoalescer: runs are at least minGapMs apart', () => {
  const f = fakeClock();
  const at: number[] = [];
  const c = createCoalescer(() => at.push(f.clock.now()), { debounceMs: 2000, minGapMs: 10_000 }, f.clock);
  c.trigger();
  f.advance(2000);
  c.trigger();
  f.advance(3000);
  assert.deepEqual(at, [2000], 'second run waits for the gap');
  f.advance(10_000);
  assert.deepEqual(at, [2000, 12_000]);
});

test('createCoalescer: cancel drops a pending run', () => {
  const f = fakeClock();
  let runs = 0;
  const c = createCoalescer(() => runs++, { debounceMs: 1500, minGapMs: 5000 }, f.clock);
  c.trigger();
  c.cancel();
  f.advance(10_000);
  assert.equal(runs, 0);
});

test('screens subscribe to the right topics and keep only a 15 min safety timer', () => {
  const staff = readFileSync(new URL('../../app/(protected)/staff/staff-dashboard-client.tsx', import.meta.url), 'utf8');
  assert.match(staff, /topics: \[staffTopic\(tenantId\), employeeTopic\(tenantId, profile\.staffId\)\]/);
  assert.equal((staff.match(/intervalMs: POLL_SAFETY_INTERVAL_MS/g) ?? []).length, 2, 'schedule + mail timers are safety nets only');
  const manager = readFileSync(new URL('../../app/(protected)/manager/manager-dashboard-client.tsx', import.meta.url), 'utf8');
  assert.match(manager, /topics: \[managerTopic\(tenantId\)\]/);
  assert.match(manager, /createCoalescer\(\(\) => router\.refresh\(\), \{ debounceMs: 2000, minGapMs: 10_000 \}\)/);
  assert.match(manager, /useVisiblePolling\(async \(\) => router\.refresh\(\), \{ intervalMs: POLL_SAFETY_INTERVAL_MS \}\)/);
  for (const path of ['../../app/(protected)/recipes/recipes-list-client.tsx', '../../app/(protected)/recipes/[recipeId]/recipe-detail-client.tsx']) {
    const src = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(src, /topics: liveTenantId \? \[staffTopic\(liveTenantId\)\] : \[\]/, path);
    assert.match(src, /intervalMs: POLL_SAFETY_INTERVAL_MS/, path);
  }
});

test('the live channel is private and the browser never sends', () => {
  const src = readFileSync(new URL('./live-signals.ts', import.meta.url), 'utf8');
  assert.match(src, /\.channel\(topic, \{ config: \{ private: true \} \}\)/);
  assert.doesNotMatch(src, /\.send\(/);
  assert.doesNotMatch(src, /service_role|SERVICE_ROLE|createServiceClient/);
});
