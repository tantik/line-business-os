'use client';

import { useEffect, useState } from 'react';
import { useRestoreFocusOnClose } from './useRestoreFocusOnClose';

/**
 * Click-to-enlarge viewer for a single photo (a recipe's/inventory item's
 * one `photo_url` field). Not a multi-photo gallery — that needs a new
 * `recipe_photos`-style table and is explicitly out of scope until that's a
 * separate, later decision.
 *
 * Usage: render `<LightboxTrigger src={photo.url} alt={...} />` wherever a
 * thumbnail is shown; it owns its own open/close state.
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
      {open ? (
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
          <div role="dialog" aria-modal="true" aria-label={alt} style={{ position: 'relative', maxWidth: '92vw', maxHeight: '92vh' }}>
            <img src={src} alt={alt} style={{ display: 'block', maxWidth: '92vw', maxHeight: '92vh', borderRadius: 8, objectFit: 'contain' }} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: -16,
                right: -16,
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
        </div>
      ) : null}
    </>
  );
}
