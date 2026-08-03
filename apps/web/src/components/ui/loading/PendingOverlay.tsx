'use client';

import { BrandLoader, type BrandLoaderSize } from './BrandLoader';

/**
 * Platform-standard "this is taking a moment" overlay -- dims and disables
 * the dialog/page it's placed in, centers `BrandLoader`, and optionally
 * shows a short message ("Saving...", "Deleting...", "Publishing..."). Every
 * module's Server Action pending state renders through this component (or
 * `LoadingButton`/`LoadingPage`), never a bespoke spinner or a bare
 * "Saving..." string.
 *
 * Must be placed inside a `position: relative` ancestor (the calling
 * dialog/page) -- it fills that ancestor via `position: absolute; inset: 0`
 * rather than the full viewport, so it dims only the dialog/page it's
 * attached to.
 *
 * Colors read CSS variables (`--brand-overlay-bg`, `--brand-text`) with
 * neutral fallbacks -- no hardcoded hex here; a module's theme provider can
 * override both without touching this component.
 */
export function PendingOverlay({ visible, message, size = 'md' }: { visible: boolean; message?: string; size?: BrandLoaderSize }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: 'var(--brand-overlay-bg, rgba(255, 255, 255, 0.72))',
        borderRadius: 'inherit',
        cursor: 'wait',
      }}
    >
      <BrandLoader size={size} label={message ?? 'Loading'} />
      {message ? (
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-text, #362B1F)' }}>{message}</span>
      ) : null}
    </div>
  );
}
