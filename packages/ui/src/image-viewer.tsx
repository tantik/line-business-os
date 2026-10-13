'use client';

import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';

export interface ImageViewerProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  closeLabel?: string;
}

/**
 * Click-to-enlarge photo viewer on Radix Dialog. It must be a Radix layer:
 * thumbnails live inside Radix `Dialog` popups (Inventory, Recipes), and a
 * modal Radix Dialog makes anything portaled to `document.body` outside its
 * own layer stack non-interactive (QA3 finding 2026-10-13, same class as the
 * Inventory "•••" menu). As a nested Radix Dialog it stacks correctly: its
 * own close/backdrop/Escape close only the viewer, never the popup below.
 */
export function ImageViewer({ open, onClose, src, alt, closeLabel = 'Close' }: ImageViewerProps) {
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[var(--oruwa-z-overlay)] bg-[rgba(20,16,11,0.85)]" />
        <div className="fixed inset-0 z-[var(--oruwa-z-modal)] grid place-items-center p-6">
          <RadixDialog.Content
            className="relative outline-none"
            style={{ maxWidth: 'min(500px, 92vw)', maxHeight: '92vh' }}
          >
            <VisuallyHidden.Root asChild>
              <RadixDialog.Title>{alt}</RadixDialog.Title>
            </VisuallyHidden.Root>
            <VisuallyHidden.Root asChild>
              <RadixDialog.Description>{alt}</RadixDialog.Description>
            </VisuallyHidden.Root>
            <img
              src={src}
              alt={alt}
              className="block max-h-[92vh] max-w-full rounded-md object-contain"
            />
            <RadixDialog.Close
              aria-label={closeLabel}
              className="absolute right-2.5 top-2.5 grid h-8 w-8 cursor-pointer place-items-center rounded-full border-0 bg-surface text-text-primary shadow-overlay"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </RadixDialog.Close>
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
