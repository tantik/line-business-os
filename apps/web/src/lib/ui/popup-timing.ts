'use client';

import { useEffect, useRef } from 'react';

/**
 * Lightweight popup-open timing instrumentation (Cafe Manager UI/UX Parity
 * mission, WP-9). The Founder's complaint was "popups are slow to open";
 * the locked decision (see the mission plan/handoff) was to measure the
 * actual bottleneck per popup before touching anything, rather than adding
 * Modal open/close animation as a blind fix (the reference has none,
 * deliberately). This does not send data anywhere or persist it -- it logs
 * one `console.info` line per open, readable in the browser DevTools
 * console during a live QA pass, then can be deleted once real numbers are
 * in hand and a fix (or "not actually slow") is decided.
 *
 * Two halves: `markPopupTriggerClick` records when the user clicked the
 * button that opens a popup; `usePopupOpenTiming` (called by the popup
 * component itself) reports the elapsed time once that popup's `open` prop
 * actually becomes true, i.e. once its content has mounted and is
 * interactive.
 */
const triggerClickTimestamps = new Map<string, number>();

export function markPopupTriggerClick(label: string): void {
  triggerClickTimestamps.set(label, performance.now());
}

export function usePopupOpenTiming(open: boolean, label: string): void {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const clickedAt = triggerClickTimestamps.get(label);
      if (clickedAt !== undefined) {
        const elapsedMs = Math.round(performance.now() - clickedAt);
        console.info(`[popup-timing] ${label} opened in ${elapsedMs}ms`);
        triggerClickTimestamps.delete(label);
      }
    }
    wasOpen.current = open;
  }, [open, label]);
}
