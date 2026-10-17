'use client';

import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * Live updates by push (docs/architecture/realtime-live-updates.md, 0127).
 *
 * The browser joins private Realtime Broadcast topics; a DB trigger sends a
 * content-free signal `{ area, location, by }` when something changes, and
 * the screen re-reads that area through its existing RLS-checked read path.
 * No Vercel call happens until something actually changed.
 */

export type LiveArea =
  | 'schedule'
  | 'settings'
  | 'roster'
  | 'mail'
  | 'requests'
  | 'attendance'
  | 'recipes'
  | 'issues'
  | 'operations'
  | 'inventory'
  | 'purchases';

export interface LiveSignalPayload {
  area?: unknown;
  location?: unknown;
  by?: unknown;
}

export const staffTopic = (tenantId: string) => `oruwa:${tenantId}:staff`;
export const managerTopic = (tenantId: string) => `oruwa:${tenantId}:manager`;
export const employeeTopic = (tenantId: string, employeeId: string) => `oruwa:${tenantId}:emp:${employeeId}`;

const AREAS: readonly string[] = [
  'schedule', 'settings', 'roster', 'mail', 'requests', 'attendance', 'recipes', 'issues', 'operations', 'inventory', 'purchases',
];

/**
 * Which area a signal is for, or `null` when this screen should ignore it:
 * unknown area, another location of the same tenant, or the viewer's own
 * change (their own write already refreshed the screen).
 */
export function signalAreaFor(
  payload: LiveSignalPayload | null | undefined,
  { locationId, myUserId }: { locationId: string | null; myUserId: string | null },
): LiveArea | null {
  if (!payload || typeof payload.area !== 'string' || !AREAS.includes(payload.area)) return null;
  if (myUserId && payload.by === myUserId) return null;
  if (locationId && typeof payload.location === 'string' && payload.location !== locationId) return null;
  return payload.area as LiveArea;
}

/**
 * Coalesces bursts: runs `fn` once `debounceMs` after the last call, and never
 * sooner than `minGapMs` after its previous run (the Manager dashboard
 * refresh is a whole-page re-render). Returns `{ trigger, cancel }`.
 */
export function createCoalescer(
  fn: () => void,
  { debounceMs, minGapMs }: { debounceMs: number; minGapMs: number },
  clock: { now: () => number; setTimeout: (f: () => void, ms: number) => unknown; clearTimeout: (id: unknown) => void } = {
    now: () => Date.now(),
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
) {
  let timer: unknown = null;
  let lastRunAt = -Infinity;
  const run = () => {
    timer = null;
    lastRunAt = clock.now();
    fn();
  };
  return {
    trigger() {
      if (timer !== null) clock.clearTimeout(timer);
      const wait = Math.max(debounceMs, lastRunAt + minGapMs - clock.now());
      timer = clock.setTimeout(run, wait);
    },
    cancel() {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
    },
  };
}

let browserClient: SupabaseClient | null = null;
function liveClient(): SupabaseClient {
  // One client (one WebSocket) per tab, shared by every subscribed screen.
  browserClient ??= createClient();
  return browserClient;
}

/**
 * Subscribes to `topics` while mounted. `onSignal(area)` fires for relevant
 * signals (see `signalAreaFor`); `onResync()` fires when a channel comes back
 * after a drop (phone asleep, network loss) -- re-read everything once, a
 * signal may have been missed. Callbacks are read from refs, so passing new
 * closures each render does not resubscribe.
 */
export function useLiveSignals({
  topics,
  locationId,
  onSignal,
  onResync,
  enabled = true,
}: {
  topics: readonly string[];
  locationId: string | null;
  onSignal: (area: LiveArea) => void;
  onResync?: () => void;
  enabled?: boolean;
}): void {
  const onSignalRef = useRef(onSignal);
  const onResyncRef = useRef(onResync);
  useEffect(() => {
    onSignalRef.current = onSignal;
    onResyncRef.current = onResync;
  });
  const topicsKey = topics.join('|');

  useEffect(() => {
    if (!enabled || topicsKey === '') return;
    const supabase = liveClient();
    let disposed = false;
    let myUserId: string | null = null;
    const channels: ReturnType<SupabaseClient['channel']>[] = [];

    void (async () => {
      // Local read of the cookie session (no network): who "me" is, so our
      // own writes do not trigger a second refresh.
      const { data } = await supabase.auth.getSession();
      if (disposed) return;
      myUserId = data.session?.user.id ?? null;
      await supabase.realtime.setAuth();
      if (disposed) return;
      for (const topic of topicsKey.split('|')) {
        let joinedBefore = false;
        const channel = supabase
          .channel(topic, { config: { private: true } })
          .on('broadcast', { event: '*' }, (message: { payload?: LiveSignalPayload }) => {
            const area = signalAreaFor(message.payload, { locationId, myUserId });
            if (area) onSignalRef.current(area);
          })
          .subscribe((status) => {
            if (status !== 'SUBSCRIBED') return;
            if (joinedBefore) onResyncRef.current?.();
            joinedBefore = true;
          });
        channels.push(channel);
      }
    })();

    return () => {
      disposed = true;
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [enabled, topicsKey, locationId]);
}
