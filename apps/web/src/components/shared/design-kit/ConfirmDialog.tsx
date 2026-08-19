'use client';

import { useEffect, type ReactNode } from 'react';
import { buttonPrimary, buttonSecondary, colors } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { useRestoreFocusOnClose } from './useRestoreFocusOnClose';

/**
 * Shared confirm/cancel dialog, promoted from the Cafe demo package
 * (`components/demo/cafe/ConfirmDialog.tsx`) to `components/shared/design-kit`.
 * Frequently opened from inside a `Modal` (shift unassign, staff/recipe/
 * inventory-item delete) — its overlay z-index is deliberately kept higher
 * than Modal's own so a nested confirmation still receives pointer input.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  pending = false,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // FA-05: restore focus to whatever opened this dialog on every close path
  // (Escape below, backdrop click, and Cancel) - see
  // `useRestoreFocusOnClose` for why a single `open`-prop watcher covers all
  // of them, including a nested confirmation opened from inside an
  // already-open `Modal` (it restores to its own opener, not the Modal's).
  useRestoreFocusOnClose(open);
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, pending, onCancel]);

  // Focus management: give focus back to whatever opened this dialog
  // (Cancel, Escape, and backdrop close all route through `onCancel`/state
  // going false) instead of leaving it on `<body>`. The opener can be gone
  // from the DOM by the time this runs (e.g. its row was removed by a
  // refetch after the confirmed action completed) -- `document.contains`
  // guards that case so restoring focus is always a safe no-op, never a
  // runtime error.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;
  // No `backdropFilter` on the overlay below: blurring the full viewport
  // behind this dialog was a measurable paint cost on lower-end mobile
  // hardware for a dialog that must otherwise open instantly (no async
  // gating above) -- a plain darkened overlay gives the same legibility.
  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(42, 34, 25, .58)' }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="shared-confirm-dialog-title"
        style={{ width: 'min(420px, 100%)', padding: 20, borderRadius: 14, background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: '0 24px 70px rgba(42,34,25,.28)' }}
      >
        <h3 id="shared-confirm-dialog-title" style={{ margin: 0, fontSize: 18 }}>{title}</h3>
        <div style={{ marginTop: 10, color: colors.textMuted, fontSize: 13.5, lineHeight: 1.55 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? hoverStyles.buttonDanger : hoverStyles.buttonPrimary}
            style={danger ? { ...buttonPrimary, background: colors.danger } : buttonPrimary}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
