'use client';

import { useEffect, type ReactNode } from 'react';
import { buttonPrimary, buttonSecondary, demoColors } from '@/lib/demo/cafe/theme';
import { useRestoreFocusOnClose } from './useRestoreFocusOnClose';

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
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending) onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, pending, onCancel]);

  if (!open) return null;
  // No `backdropFilter` on the overlay below: blurring the full viewport
  // behind this dialog was a measurable paint cost on lower-end mobile
  // hardware for a dialog that must otherwise open instantly (no async
  // gating above) -- a plain darkened overlay gives the same legibility.
  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onCancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(42, 34, 25, .58)' }}
    >
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" style={{ width: 'min(420px, 100%)', padding: 20, borderRadius: 14, background: demoColors.surface, border: `1px solid ${demoColors.border}`, boxShadow: '0 24px 70px rgba(42,34,25,.28)' }}>
        <h3 id="confirm-dialog-title" style={{ margin: 0, fontSize: 18 }}>{title}</h3>
        <div style={{ marginTop: 10, color: demoColors.textMuted, fontSize: 13.5, lineHeight: 1.55 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button type="button" style={buttonSecondary} disabled={pending} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" style={danger ? { ...buttonPrimary, background: demoColors.danger } : buttonPrimary} disabled={pending} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
