'use client';

import { BrandLoader } from './BrandLoader';

/**
 * Platform-standard full-section/full-page loading state (a route's
 * `loading.tsx`, or a panel waiting on its first data fetch) -- centers
 * `BrandLoader` with an optional message. Same component family as
 * `PendingOverlay` (in-place, dims existing content) and `LoadingButton`
 * (per-action); this one is for "there is nothing to show yet".
 */
export function LoadingPage({ message, minHeight = '60vh' }: { message?: string; minHeight?: number | string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ minHeight, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}
    >
      <BrandLoader size="lg" label={message ?? 'Loading'} />
      {message ? <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-text, #362B1F)' }}>{message}</span> : null}
    </div>
  );
}
