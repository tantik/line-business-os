import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLL_IDLE_PAUSE_MS, POLL_INTERVAL_MS, startVisiblePoller, type PollerEnv } from './visible-polling';

/** Fake clock/timer/event env: `advance` fires due interval ticks; `emit` fires listeners. */
function fakeEnv() {
  let now = 1_000_000;
  let visible = true;
  const timers: { fn: () => void; ms: number; next: number; id: number }[] = [];
  const listeners = new Map<string, Set<() => void>>();
  let nextId = 1;
  const env: PollerEnv = {
    now: () => now,
    isVisible: () => visible,
    setInterval: (fn, ms) => {
      const id = nextId++;
      timers.push({ fn, ms, next: now + ms, id });
      return id;
    },
    clearInterval: (id) => {
      const index = timers.findIndex((t) => t.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    listen: (target, type, fn) => {
      const key = `${target}:${type}`;
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(fn);
      return () => listeners.get(key)!.delete(fn);
    },
  };
  return {
    env,
    timers,
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    setVisible: (v: boolean) => {
      visible = v;
    },
    emit: (target: 'window' | 'document', type: string) => {
      for (const fn of listeners.get(`${target}:${type}`) ?? []) fn();
    },
    advance: async (ms: number) => {
      const end = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.next <= end).sort((a, b) => a.next - b.next)[0];
        if (!due) break;
        now = due.next;
        due.next += due.ms;
        due.fn();
        await Promise.resolve();
      }
      now = end;
      await Promise.resolve();
    },
  };
}

function counter() {
  let calls = 0;
  return { run: async () => void calls++, get calls() { return calls; } };
}

test('polls once per interval (60 s by default), never at the old 2.5 s rate', async () => {
  const f = fakeEnv();
  const c = counter();
  const stop = startVisiblePoller(c.run, f.env);
  assert.equal(f.timers.length, 1);
  assert.equal(f.timers[0]!.ms, POLL_INTERVAL_MS);
  assert.equal(POLL_INTERVAL_MS, 60_000);
  await f.advance(59_000);
  assert.equal(c.calls, 0, 'no poll right after page load');
  // Keep the user active so the idle pause does not kick in.
  for (let i = 0; i < 4; i++) {
    f.emit('window', 'pointermove');
    await f.advance(60_000);
  }
  assert.equal(c.calls, 4);
  stop();
});

test('does not poll while the tab is hidden', async () => {
  const f = fakeEnv();
  const c = counter();
  const stop = startVisiblePoller(c.run, f.env);
  f.setVisible(false);
  await f.advance(3 * 60_000);
  assert.equal(c.calls, 0);
  stop();
});

test('refreshes once immediately when the tab becomes visible again, and not twice with the next tick', async () => {
  const f = fakeEnv();
  const c = counter();
  const stop = startVisiblePoller(c.run, f.env);
  f.setVisible(false);
  await f.advance(50_000);
  f.setVisible(true);
  f.emit('document', 'visibilitychange');
  f.emit('window', 'focus');
  await f.advance(0);
  assert.equal(c.calls, 1, 'visibilitychange + focus together give one refresh');
  await f.advance(10_000); // the 60 s tick lands 10 s later -- too soon after the resume refresh
  assert.equal(c.calls, 1);
  stop();
});

test('pauses after the idle window and resumes with one refresh on the next user input', async () => {
  const f = fakeEnv();
  const c = counter();
  const stop = startVisiblePoller(c.run, f.env);
  await f.advance(POLL_IDLE_PAUSE_MS + 30 * 60_000);
  const whileIdle = c.calls;
  assert.ok(whileIdle <= POLL_IDLE_PAUSE_MS / POLL_INTERVAL_MS, `idle tab kept polling: ${whileIdle}`);
  f.emit('window', 'pointerdown');
  await f.advance(0);
  assert.equal(c.calls, whileIdle + 1, 'first input after idle refreshes at once');
  stop();
});

test('never runs two polls at once', async () => {
  const f = fakeEnv();
  let calls = 0;
  let release: () => void = () => {};
  const stop = startVisiblePoller(
    () =>
      new Promise<void>((resolve) => {
        calls++;
        release = resolve;
      }),
    f.env,
  );
  f.emit('window', 'pointermove');
  await f.advance(60_000);
  f.emit('window', 'pointermove');
  await f.advance(60_000);
  assert.equal(calls, 1, 'second tick skipped while the first request is still in flight');
  release();
  await f.advance(0);
  f.emit('window', 'pointermove');
  await f.advance(60_000);
  assert.equal(calls, 2);
  stop();
});

test('a failed poll does not stop later polls', async () => {
  const f = fakeEnv();
  let calls = 0;
  const stop = startVisiblePoller(async () => {
    calls++;
    throw new Error('network');
  }, f.env);
  f.emit('window', 'pointermove');
  await f.advance(60_000);
  f.emit('window', 'pointermove');
  await f.advance(60_000);
  assert.equal(calls, 2);
  stop();
});

test('stop() removes the timer and every listener', async () => {
  const f = fakeEnv();
  const c = counter();
  const stop = startVisiblePoller(c.run, f.env);
  assert.ok(f.listenerCount() > 0);
  stop();
  assert.equal(f.timers.length, 0);
  assert.equal(f.listenerCount(), 0);
  f.emit('document', 'visibilitychange');
  await f.advance(10 * 60_000);
  assert.equal(c.calls, 0);
});

// Guard: every background refresh goes through this module. A raw
// `setInterval` in app code is how /staff ended up polling every 2.5 s and
// burning the Vercel free CPU (2026-10-15).
test('no raw setInterval in apps/web/src outside visible-polling.ts', () => {
  const srcRoot = fileURLToPath(new URL('../..', import.meta.url));
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name) || name === 'visible-polling.ts') continue;
      if (/\bsetInterval\s*\(/.test(readFileSync(path, 'utf8'))) offenders.push(path.slice(srcRoot.length));
    }
  };
  walk(srcRoot);
  assert.deepEqual(offenders, [], 'use useVisiblePolling from @/lib/ui/visible-polling instead');
});
