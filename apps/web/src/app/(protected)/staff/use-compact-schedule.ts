'use client';

import { useEffect, useState } from 'react';

/** Matches `ShiftTable`'s own `compact` prop doc comment ("a full 7-day week fits an iPhone-width screen") -- 375/390px devices, plus a little headroom. */
const COMPACT_MEDIA_QUERY = '(max-width: 480px)';

/**
 * Whether the viewport is narrow enough that the weekly schedule grid
 * (`ShiftTable`) should render in its existing `compact` mode instead of its
 * normal desktop sizing (Staff Shift Schedule v2, 2026-08-25). SSR-safe:
 * `window`/`matchMedia` don't exist on the server, so this always starts
 * `false` (non-compact) and only switches after mount -- a brief
 * non-compact flash on a narrow device's first paint is preferable to a
 * hydration mismatch. No new dependency -- plain `matchMedia`, same
 * convention as this app's other small client-only hooks (e.g.
 * `useTodayIso`).
 */
export function useIsCompactSchedule(): boolean {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQueryList = window.matchMedia(COMPACT_MEDIA_QUERY);
    setIsCompact(mediaQueryList.matches);
    const listener = (event: MediaQueryListEvent) => setIsCompact(event.matches);
    mediaQueryList.addEventListener('change', listener);
    return () => mediaQueryList.removeEventListener('change', listener);
  }, []);

  return isCompact;
}
