/**
 * Pure (no React, no DOM) week-refresh state machine backing
 * `PreviewManagerViewChrome`'s prev/today/next navigation and the
 * post-mutation forced refresh. Extracted out of that `'use client'`
 * component specifically so this stateful sequencing/dedup logic can be unit
 * tested with plain `node:test` and deterministic deferred promises - this
 * project's test runner has no React-hook-testing harness, and the ordering
 * bugs this class guards against (a stale response landing after the user
 * has already navigated elsewhere, a queued post-mutation replay clobbering
 * the visible week) are invisible to a snapshot/source-text test.
 *
 * Preview Manager architecture (perf phase 2): this is a per-mount instance
 * (one per `PreviewManagerViewChrome`), constructed once via `useRef`, never
 * shared across mounts.
 */
export interface WeekRefreshResult<T> {
  status: 'success' | (string & {});
  data?: T;
}

export interface WeekRefreshControllerOptions<T> {
  /** The real (or test-double) fetch for one week's data - `previewGetScheduleWeek` in production. */
  fetchWeek: (targetOffset: number) => Promise<WeekRefreshResult<T>>;
  /** Called synchronously, at most once per settled fetch, only when that fetch's result should become the visible week's data. */
  onApply: (data: T) => void;
}

export class WeekRefreshController<T> {
  private readonly fetchWeek: (targetOffset: number) => Promise<WeekRefreshResult<T>>;
  private readonly onApply: (data: T) => void;

  // The offset the UI currently wants displayed - updated synchronously at
  // the start of every ordinary (non-`keepTarget`) `refresh` call, before the
  // `await`. A response is only ever applied if its offset still matches
  // this when it lands, so a response for an offset the user has since
  // navigated away from can never clobber the currently selected week,
  // regardless of which fetch happens to finish first.
  private targetOffset: number;
  // Per-offset monotonic sequence numbers, so a response is only applied if
  // it is the latest fetch issued for that exact offset - a global counter
  // would let a request for one offset invalidate a still-relevant,
  // still-in-flight request for a different offset that hasn't resolved yet.
  private readonly offsetSeq = new Map<number, number>();
  // In-flight guard, tracked per offset - a `refresh(offset)` call that
  // arrives while that exact offset is already in flight is deduplicated (no
  // extra request), never queued for automatic replay. A `force` caller (a
  // post-mutation refresh) instead opts into scheduling exactly one fresh
  // fetch to run right after the in-flight one settles, so a mutation that
  // lands mid-fetch is never lost.
  private readonly pendingOffsets = new Set<number>();
  private readonly forceRefreshOffsets = new Set<number>();

  constructor(initialOffset: number, options: WeekRefreshControllerOptions<T>) {
    this.targetOffset = initialOffset;
    this.fetchWeek = options.fetchWeek;
    this.onApply = options.onApply;
  }

  /** The offset the UI currently wants displayed - updates synchronously, independent of any in-flight fetch's latency, so navigation intent (button disabled state, URL) can react immediately without waiting on the network. */
  get currentTarget(): number {
    return this.targetOffset;
  }

  /** A newer, already-applied local edit for `offset` invalidates any still-in-flight fetch for that same offset, the same way a newer `refresh` call for it would - see `PreviewManagerViewChrome`'s per-cell save/unassign handler. */
  invalidate(offset: number): void {
    this.offsetSeq.set(offset, (this.offsetSeq.get(offset) ?? 0) + 1);
  }

  async refresh(targetOffset: number, options?: { force?: boolean; keepTarget?: boolean }): Promise<void> {
    // `keepTarget` is set only by the queued post-mutation replay below -
    // that replay's job is to update the fetch bookkeeping for the offset it
    // was queued for, never to re-assert navigation intent. Without this, a
    // replay that fires after the user has already navigated elsewhere would
    // reset `targetOffset` back to the old offset and let its (now stale)
    // response overwrite the newer visible week.
    if (!options?.keepTarget) this.targetOffset = targetOffset;

    if (this.pendingOffsets.has(targetOffset)) {
      // Already in flight for this exact offset. An ordinary duplicate call
      // (e.g. a double-clicked nav button) is deduplicated outright - the
      // in-flight fetch already covers it. A `force` caller instead
      // schedules exactly one fresh fetch to run once the in-flight one
      // settles, so the mutation is never lost.
      if (options?.force) this.forceRefreshOffsets.add(targetOffset);
      return;
    }

    this.pendingOffsets.add(targetOffset);
    const seq = (this.offsetSeq.get(targetOffset) ?? 0) + 1;
    this.offsetSeq.set(targetOffset, seq);
    try {
      const result = await this.fetchWeek(targetOffset);
      // Only apply if: (a) no newer fetch/local edit for this same offset
      // has since been issued, and (b) this offset is still the one the UI
      // wants displayed - guards independently against same-offset
      // staleness and against a slower response for an offset the user has
      // since navigated away from.
      const isLatestForOffset = this.offsetSeq.get(targetOffset) === seq;
      const isCurrentTarget = this.targetOffset === targetOffset;
      if (result.status === 'success' && isLatestForOffset && isCurrentTarget) this.onApply(result.data as T);
    } finally {
      this.pendingOffsets.delete(targetOffset);
      if (this.forceRefreshOffsets.delete(targetOffset)) {
        // Only replay if the user is still looking at this offset - if they
        // have since navigated away, the mutation that queued this replay is
        // for a week that's no longer visible, so re-fetching it here would
        // just be an unnecessary request (it will be re-fetched fresh
        // whenever/if the user navigates back to it).
        if (this.targetOffset === targetOffset) {
          await this.refresh(targetOffset, { force: true, keepTarget: true });
        }
      }
    }
  }
}
