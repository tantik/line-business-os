import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeekRefreshController } from './week-refresh-controller.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Week {
  weekOffset: number;
  tag: string;
}

function week(weekOffset: number, tag = `w${weekOffset}`): Week {
  return { weekOffset, tag };
}

/**
 * Deterministic tests for the stale-response/dedup/forced-replay state
 * machine `PreviewManagerViewChrome` delegates to (see
 * `week-refresh-controller.ts`). Every scenario controls exactly when each
 * fetch settles via a manually-resolved deferred promise, so ordering that
 * would otherwise depend on real network timing (an older response landing
 * after a newer one, a replay firing after the user has navigated away) is
 * reproduced exactly, every run.
 */

test('same-week duplicate request is deduplicated - a second refresh() for an already-in-flight offset issues no extra fetch', async () => {
  let fetchCount = 0;
  const deferred: Deferred<Week>[] = [];
  const applied: Week[] = [];
  const controller = new WeekRefreshController<Week>(0, {
    fetchWeek: async () => {
      fetchCount += 1;
      const d = defer<Week>();
      deferred.push(d);
      const data = await d.promise;
      return { status: 'success', data };
    },
    onApply: (data) => applied.push(data),
  });

  const first = controller.refresh(0);
  const second = controller.refresh(0); // duplicate while offset 0 is in flight
  assert.equal(fetchCount, 1, 'the duplicate call must not start a second fetch');
  deferred[0]!.resolve(week(0));
  await Promise.all([first, second]);
  assert.deepEqual(applied, [week(0)]);
});

test('different-week requests run independently - each gets its own fetch, not deduplicated against the other offset, and can settle in either order', async () => {
  const deferred = new Map<number, Deferred<Week>>();
  const applied: Week[] = [];
  const controller = new WeekRefreshController<Week>(0, {
    fetchWeek: async (offset) => {
      const d = defer<Week>();
      deferred.set(offset, d);
      const data = await d.promise;
      return { status: 'success', data };
    },
    onApply: (data) => applied.push(data),
  });

  // Navigating from offset 0 to offset 1 starts a second, independent fetch
  // rather than being deduplicated against the still-in-flight offset-0 one
  // (dedup only ever applies within the same offset).
  const p0 = controller.refresh(0);
  const p1 = controller.refresh(1); // now targets offset 1
  assert.equal(deferred.size, 2, 'two independent fetches must be in flight, one per offset');
  assert.equal(controller.currentTarget, 1);

  // Resolve the older (no-longer-current) offset-0 fetch first - it must
  // settle without error but never apply, since the visible target has moved
  // on. The still-current offset-1 fetch resolving afterward is the one that
  // actually updates the visible week.
  deferred.get(0)!.resolve(week(0));
  await p0;
  deferred.get(1)!.resolve(week(1));
  await p1;

  assert.deepEqual(applied, [week(1)], 'only the current target (offset 1) is ever applied - the abandoned offset-0 fetch still completed independently but is discarded');
});

test('an older response cannot overwrite a newer locally-edited cache for the same week', async () => {
  const deferred: Deferred<Week>[] = [];
  const applied: Week[] = [];
  const controller = new WeekRefreshController<Week>(0, {
    fetchWeek: async () => {
      const d = defer<Week>();
      deferred.push(d);
      const data = await d.promise;
      return { status: 'success', data };
    },
    onApply: (data) => applied.push(data),
  });

  const inFlight = controller.refresh(0);
  assert.equal(deferred.length, 1);
  // A local edit (e.g. a single-cell save) lands while the fetch above is
  // still in flight - it invalidates that in-flight fetch's result.
  controller.invalidate(0);
  deferred[0]!.resolve(week(0, 'stale-server-response'));
  await inFlight;

  assert.deepEqual(applied, [], 'the stale response (older than the local edit) must never be applied');
});

test('post-mutation forced refresh does not redirect the visible week when the user has since navigated elsewhere', async () => {
  const deferred = new Map<number, Deferred<Week>[]>();
  const applied: Week[] = [];
  const controller = new WeekRefreshController<Week>(0, {
    fetchWeek: async (offset) => {
      const d = defer<Week>();
      const list = deferred.get(offset) ?? [];
      list.push(d);
      deferred.set(offset, list);
      const data = await d.promise;
      return { status: 'success', data };
    },
    onApply: (data) => applied.push(data),
  });

  // A mutation on week 0 starts an in-flight fetch, then requests a forced
  // post-mutation replay while that fetch is still pending.
  const initial = controller.refresh(0);
  controller.refresh(0, { force: true }); // queued (offset 0 already in flight)
  assert.equal(controller.currentTarget, 0);

  // The user navigates to week 1 before the initial fetch settles.
  const nav = controller.refresh(1);
  assert.equal(controller.currentTarget, 1, 'navigation intent updates synchronously, independent of any in-flight fetch');

  // The original week-0 fetch now settles, triggering the queued replay's
  // finally-block check.
  deferred.get(0)![0]!.resolve(week(0, 'first'));
  await initial;
  await new Promise((r) => setTimeout(r, 0));

  // The queued replay must not have fired (the user left week 0), so no
  // second fetch for offset 0 exists, and currentTarget must still be 1.
  assert.equal(deferred.get(0)!.length, 1, 'the queued forced replay must not issue an unnecessary second fetch for an abandoned week');
  assert.equal(controller.currentTarget, 1, 'the forced replay must never reset the current target back to the old week');

  deferred.get(1)![0]!.resolve(week(1));
  await nav;
  assert.deepEqual(applied, [week(1)], 'only week 1 (the currently visible week) must ever be applied');
});

test('post-mutation forced refresh replays and applies when the user is still on the mutated week', async () => {
  const deferred: Deferred<Week>[] = [];
  const applied: Week[] = [];
  const controller = new WeekRefreshController<Week>(0, {
    fetchWeek: async () => {
      const d = defer<Week>();
      deferred.push(d);
      const data = await d.promise;
      return { status: 'success', data };
    },
    onApply: (data) => applied.push(data),
  });

  // `initial`'s `finally` block awaits the queued replay before settling
  // itself, so it must not be awaited until every deferred it will
  // transitively wait on has been resolved (below).
  const initial = controller.refresh(0);
  controller.refresh(0, { force: true }); // queued
  deferred[0]!.resolve(week(0, 'pre-mutation'));
  // Let the first fetch's `.then`/`finally` microtasks run far enough to
  // start the queued replay's own fetch (pushing the second deferred).
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(deferred.length, 2, 'the queued replay must fire since the user is still on week 0');
  deferred[1]!.resolve(week(0, 'post-mutation'));

  await initial;

  assert.deepEqual(applied, [week(0, 'pre-mutation'), week(0, 'post-mutation')]);
});

test('a failed request clears its in-flight state so the same offset is not silently deduplicated on the next call', async () => {
  let fetchCount = 0;
  const controller = new WeekRefreshController<Week>(0, {
    fetchWeek: async () => {
      fetchCount += 1;
      throw new Error('network error');
    },
    onApply: () => {},
  });

  await assert.rejects(controller.refresh(0));
  // If the in-flight flag were not cleared in the `finally` block on
  // failure, this second call for the same offset would be silently
  // deduplicated (treated as still in flight) instead of issuing a real
  // second fetch.
  await assert.rejects(controller.refresh(0));
  assert.equal(fetchCount, 2, 'the offset must not still be marked in-flight after the first attempt failed');
});

test('retry after failure applies the successful result', async () => {
  let attempt = 0;
  const applied: Week[] = [];
  const controller = new WeekRefreshController<Week>(0, {
    fetchWeek: async (offset) => {
      attempt += 1;
      if (attempt === 1) throw new Error('network error');
      return { status: 'success', data: week(offset, `attempt-${attempt}`) };
    },
    onApply: (data) => applied.push(data),
  });

  await assert.rejects(controller.refresh(0));
  assert.deepEqual(applied, []);
  await controller.refresh(0);
  assert.deepEqual(applied, [week(0, 'attempt-2')]);
});

test('rapid Prev/Next navigation keeps only the final selected week applied, regardless of resolution order', async () => {
  const deferred = new Map<number, Deferred<Week>>();
  const applied: Week[] = [];
  const controller = new WeekRefreshController<Week>(0, {
    fetchWeek: async (offset) => {
      const d = defer<Week>();
      deferred.set(offset, d);
      const data = await d.promise;
      return { status: 'success', data };
    },
    onApply: (data) => applied.push(data),
  });

  // Prev, Prev, Next, Next in rapid succession - final target is offset 0.
  const p1 = controller.refresh(-1);
  const p2 = controller.refresh(-2);
  const p3 = controller.refresh(-1);
  const p4 = controller.refresh(0);
  assert.equal(controller.currentTarget, 0, 'the final navigation call wins the target synchronously');

  // Resolve out of order: the -2 request (never the final target) resolves
  // last, after everything else - it must still never apply.
  deferred.get(-1)!.resolve(week(-1));
  deferred.get(0)!.resolve(week(0));
  await Promise.all([p1, p3, p4]);
  deferred.get(-2)!.resolve(week(-2));
  await p2;

  assert.deepEqual(applied, [week(0)], 'only the final target (offset 0) must ever be applied, no matter the resolution order');
});

test('cached navigation intent is immediate - currentTarget updates synchronously before any fetch settles', () => {
  const controller = new WeekRefreshController<Week>(0, {
    fetchWeek: () => new Promise(() => {}), // never resolves
    onApply: () => {},
  });
  void controller.refresh(3);
  assert.equal(controller.currentTarget, 3, 'navigation intent must be visible immediately, not gated on network latency');
});
