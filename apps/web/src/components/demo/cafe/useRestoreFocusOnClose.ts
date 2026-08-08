'use client';

import { useEffect, useRef } from 'react';

/**
 * FA-05 fix: shared focus-restore-on-close behavior for every dialog in this
 * app (`Modal`, `ConfirmDialog`) - captures whatever element had focus right
 * before the dialog opened, and restores focus to it on every close path
 * (Escape, backdrop click, Cancel, close button all flip `open` to `false`,
 * the single signal this hook watches, so no per-close-path wiring is
 * needed). A nested dialog (e.g. a `ConfirmDialog` opened from a button
 * inside an already-open `Modal`) captures its own opener independently, so
 * closing it restores focus to that inner button, not the outer Modal's
 * original opener.
 *
 * Fails safe: if the original opener was removed from the DOM or disabled by
 * the time the dialog closes, focus is simply left wherever the browser put
 * it - never an exception, never a focus attempt on a dead/disabled node.
 */
export function useRestoreFocusOnClose(open: boolean): void {
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    const opener = openerRef.current;
    openerRef.current = null;
    if (!opener || !opener.isConnected) return;
    if ('disabled' in opener && (opener as HTMLButtonElement).disabled) return;
    opener.focus();
  }, [open]);
}
