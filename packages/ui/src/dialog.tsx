'use client';

import * as React from 'react';
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import { IconButton } from './button.js';

export type DialogSize = 'form' | 'wide' | 'sheet';

const sizeMaxWidth: Record<DialogSize, string> = {
  form: 'min(560px, 94vw)',
  wide: 'min(960px, 94vw)',
  sheet: 'min(1100px, 96vw)',
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Rendered after the title text in the sticky header (e.g. a help icon button). */
  titleAdornment?: React.ReactNode;
  /** `form` (560px, default), `wide` (960px, list/table popups), `sheet` (1100px, dense Manager surfaces). */
  size?: DialogSize;
  closeLabel?: string;
  /** Set false for a rare case where the dialog owns its own primary action and Escape/backdrop-dismiss would be unsafe mid-operation. Default true. */
  dismissible?: boolean;
  /** Announced by screen readers as the dialog's accessible description. Omit for a dialog whose content doesn't reduce to one sentence — a visually-hidden fallback (repeating the title) is used instead, only to satisfy Radix's a11y requirement that every dialog have one. */
  description?: string;
}

/**
 * The canonical ORUWA Dialog contract (mission §16 — required precondition
 * #1 from both audits). Built on Radix Dialog so focus-trap, scroll-lock,
 * labelledby/describedby wiring, portal rendering, and *stack-aware*
 * dismiss (an inner Dialog/ConfirmDialog's Escape only closes the inner
 * one) come from a maintained a11y engine instead of ORUWA hand-rolling
 * them — closes the design-kit `Modal`'s three known gaps (P1-1/2/3): no
 * focus-trap, no scroll-lock, and Escape listening on `window` with no
 * awareness of which layer is topmost.
 *
 * API intentionally mirrors the retiring `components/shared/design-kit/Modal`
 * (open/onClose/title/children/footer/titleAdornment/closeLabel) so call
 * sites migrate with a near-mechanical prop rename (`width` -> `size`).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  titleAdornment,
  size = 'form',
  closeLabel = 'Close',
  dismissible = true,
  description,
}: DialogProps) {
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[var(--oruwa-z-overlay)] bg-overlay" />
        <div className="fixed inset-0 z-[var(--oruwa-z-modal)] flex items-end justify-center sm:items-center">
          <RadixDialog.Content
            onEscapeKeyDown={(event) => {
              if (!dismissible) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (!dismissible) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (!dismissible) event.preventDefault();
            }}
            className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-md bg-surface shadow-overlay outline-none sm:rounded-md"
            style={{ maxWidth: sizeMaxWidth[size] }}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-2">
                <RadixDialog.Title className="truncate text-lg font-bold text-text-primary">
                  {title}
                </RadixDialog.Title>
                {titleAdornment}
              </div>
              <VisuallyHidden.Root asChild>
                <RadixDialog.Description>{description ?? title}</RadixDialog.Description>
              </VisuallyHidden.Root>
              {dismissible ? (
                <RadixDialog.Close asChild>
                  <IconButton
                    aria-label={closeLabel}
                    variant="secondary"
                    size="md"
                    icon={<CloseIcon />}
                  />
                </RadixDialog.Close>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5">{children}</div>
            {footer ? (
              <div className="flex shrink-0 justify-end gap-2.5 border-t border-border px-5 py-3.5">{footer}</div>
            ) : null}
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none">
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
