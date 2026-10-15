'use client';

import { useEffect, useRef } from 'react';

/**
 * Shared background-refresh policy for every polling screen (2026-10-15).
 *
 * Each poll is a Server Action, i.e. one Vercel function invocation plus
 * several Supabase calls. The old per-screen `setInterval(…, 2500)` kept an
 * open /staff tab at ~17k invocations per 12 h and used up most of the Vercel
 * Hobby free CPU. Contract:
 *   - at most one poll per `intervalMs` (default 60 s; checked every 10 s
 *     locally, so the gap is 60-70 s), never two at once;
 *   - no polling while the tab is hidden;
 *   - no polling after `idleMs` (default 5 min) without user input -- a
 *     tablet left open on the counter, or an automation browser, stops;
 *   - one immediate refresh when the tab becomes visible / focused again, or
 *     on the first input after an idle pause;
 *   - everything is torn down on unmount.
 * A user's own writes still refresh at once through their own code paths.
 */
export const POLL_INTERVAL_MS = 60_000;
export const POLL_IDLE_PAUSE_MS = 5 * 60_000;
/** A visibility/focus refresh is skipped when the last poll is newer than this (alt-tab must not become a 5 s poll). */
export const POLL_RESUME_MIN_GAP_MS = 30_000;
/** How often the timer checks locally whether a poll is due -- no request unless it is. */
export const POLL_CHECK_EVERY_MS = 10_000;

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const;

export interface PollerEnv {
  now: () => number;
  isVisible: () => boolean;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  /** Subscribes to an event on window/document; returns the unsubscribe. */
  listen: (target: 'window' | 'document', type: string, fn: () => void) => () => void;
}

export interface PollerOptions {
  intervalMs?: number;
  idleMs?: number;
}

/** Framework-free core of `useVisiblePolling`, exported for tests. Returns `stop`. */
export function startVisiblePoller(run: () => Promise<void>, env: PollerEnv, options: PollerOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
  const idleMs = options.idleMs ?? POLL_IDLE_PAUSE_MS;
  let stopped = false;
  let inFlight = false;
  // The page load itself is the first "poll" and the first activity.
  let lastRunAt = env.now();
  let lastActivityAt = env.now();

  const fire = () => {
    if (stopped || inFlight) return;
    inFlight = true;
    lastRunAt = env.now();
    run()
      .catch(() => {
        // A failed background refresh is retried on the next tick.
      })
      .finally(() => {
        inFlight = false;
      });
  };

  const isIdle = () => env.now() - lastActivityAt >= idleMs;

  // Due-ness is measured from the last poll, so a resume refresh pushes the
  // next poll a full interval out instead of leaving a near-double gap.
  const onTick = () => {
    if (!env.isVisible() || isIdle()) return;
    if (env.now() - lastRunAt < intervalMs) return;
    fire();
  };

  const onResume = () => {
    if (!env.isVisible()) return;
    lastActivityAt = env.now();
    if (env.now() - lastRunAt >= POLL_RESUME_MIN_GAP_MS) fire();
  };

  const onActivity = () => {
    const wasIdle = isIdle();
    lastActivityAt = env.now();
    if (wasIdle && env.isVisible() && env.now() - lastRunAt >= intervalMs) fire();
  };

  const id = env.setInterval(onTick, Math.min(POLL_CHECK_EVERY_MS, intervalMs));
  const unsubscribers = [
    env.listen('document', 'visibilitychange', onResume),
    env.listen('window', 'focus', onResume),
    ...ACTIVITY_EVENTS.map((type) => env.listen('window', type, onActivity)),
  ];

  return () => {
    stopped = true;
    env.clearInterval(id);
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

function browserEnv(): PollerEnv {
  return {
    now: () => Date.now(),
    isVisible: () => document.visibilityState === 'visible',
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id as number),
    listen: (target, type, fn) => {
      const node = target === 'window' ? window : document;
      node.addEventListener(type, fn, { passive: true });
      return () => node.removeEventListener(type, fn);
    },
  };
}

/**
 * Runs `poll` in the background under the shared policy above. `poll` always
 * sees the latest committed render's values (kept in a ref), so a changing
 * argument such as the displayed week does not restart the timer.
 * `isCurrent()` turns false after unmount, when `enabled` flips, or when
 * `resetOn` changes -- pass the server-fetched data the poll overwrites, so a
 * poll started before a `router.refresh()` cannot overwrite the fresher data.
 */
export function useVisiblePolling(
  poll: (isCurrent: () => boolean) => Promise<void>,
  { enabled = true, intervalMs, idleMs, resetOn }: PollerOptions & { enabled?: boolean; resetOn?: unknown } = {},
): void {
  const pollRef = useRef(poll);
  useEffect(() => {
    pollRef.current = poll;
  });

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const stop = startVisiblePoller(() => pollRef.current(() => current), browserEnv(), { intervalMs, idleMs });
    return () => {
      current = false;
      stop();
    };
  }, [enabled, intervalMs, idleMs, resetOn]);
}
