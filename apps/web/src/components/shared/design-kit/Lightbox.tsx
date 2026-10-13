'use client';

import { useState } from 'react';
import { ImageViewer } from '@line-os/ui';

/**
 * Click-to-enlarge viewer for a single photo (a recipe's/inventory item's
 * one `photo_url` field). Not a multi-photo gallery — that needs a new
 * `recipe_photos`-style table and is explicitly out of scope until that's a
 * separate, later decision.
 *
 * Usage: render `<LightboxTrigger src={photo.url} alt={...} />` wherever a
 * thumbnail is shown; it owns its own open/close state.
 *
 * The enlarged view is the Radix-based `ImageViewer` from `@line-os/ui`
 * (QA3 finding 2026-10-13): thumbnails sit inside Radix `Dialog` popups
 * (Inventory, Recipes), and the previous hand-made `document.body` portal
 * could not be clicked or closed there — a modal Radix Dialog makes
 * everything outside its own layer stack non-interactive. Being a portal
 * (not inline) also keeps the earlier fix: a dimmed/inactive row's CSS
 * `opacity` no longer bleeds into the enlarged view (Founder report,
 * 2026-08-24).
 */
export function LightboxTrigger({ src, alt, thumbnailStyle }: { src: string; alt: string; thumbnailStyle?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);

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
      <ImageViewer open={open} onClose={() => setOpen(false)} src={src} alt={alt} />
    </>
  );
}
