'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRestoreFocusOnClose } from './useRestoreFocusOnClose';

/**
 * Click-to-enlarge viewer for a single photo (a recipe's/inventory item's
 * one `photo_url` field). Not a multi-photo gallery — that needs a new
 * `recipe_photos`-style table and is explicitly out of scope until that's a
 * separate, later decision.
 *
 * Usage: render `<LightboxTrigger src={photo.url} alt={...} />` wherever a
 * thumbnail is shown; it owns its own open/close state.
 *
 * The enlarged view is portaled to `document.body` rather than rendered
 * inline: a `position: fixed` descendant still inherits an ancestor's CSS
 * `opacity` (fixed only escapes layout/clipping, not the opacity stacking
 * context), so a thumbnail nested inside a dimmed/inactive row or card was
 * making the popup itself look translucent (Founder report, 2026-08-24).
 */
export function LightboxTrigger({ src, alt, thumbnailStyle }: { src: string; alt: string; thumbnailStyle?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  useRestoreFocusOnClose(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', ...thumbnailStyle }}
        aria-label={alt}
      >
        <img src={src} alt={alt} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
      </button>
      {open
        ? createPortal(
            <div
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(20, 16, 11, 0.85)',
                display: 'grid',
                placeItems: 'center',
                zIndex: 1150,
                padding: 24,
              }}
            >
              {/*
                The close button used to sit half outside this wrapper's own
                top-right corner (`top: -16, right: -16`) -- for an image
                tall/wide enough to approach the 92vw/92vh cap, that corner
                sits right at the outer overlay's edge, clipping the button
                against the viewport (Founder report, 2026-08-24). Now
                positioned fully inside the image instead, so it's always
                visible regardless of image size. The dialog wrapper carries
                the 92vw/92vh cap (once, not duplicated on the image too);
                the image itself just fills up to 100% of that.
              */}
              {/* `min(500px, 92vw)`: caps the enlarged view at a compact 500px on desktop (Founder direction, 2026-08-24 -- a near-full-viewport image read as too large), while still shrinking to fit a narrow phone screen instead of overflowing it. */}
              <div role="dialog" aria-modal="true" aria-label={alt} style={{ position: 'relative', maxWidth: 'min(500px, 92vw)', maxHeight: '92vh' }}>
                <img src={src} alt={alt} style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain' }} />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#FFFFFF',
                    color: '#362B1F',
                    fontSize: 16,
                    lineHeight: 1,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  ×
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
