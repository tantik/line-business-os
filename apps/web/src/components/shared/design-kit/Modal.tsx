'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { colors } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { useRestoreFocusOnClose } from './useRestoreFocusOnClose';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Rendered immediately after the title text in the sticky header (e.g. a `HelpIconButton`) -- kept separate from `title` (a plain string, also used as the dialog's `aria-label`) rather than widening `title` to `ReactNode`. */
  titleAdornment?: ReactNode;
  /** CSS width value. Default fits a single-column form; pass a wider value
   * (e.g. `'min(1400px, 96vw)'`) for list/table-heavy popups (Manage staff,
   * Manage recipes, Inventory, the Shift schedule's cell/staff popups). */
  width?: string;
  /** Localized "Close" label for the × button's aria-label. Callers own their
   * own i18n; this component has no i18n dependency of its own so it stays
   * reusable outside the Cafe module. */
  closeLabel?: string;
}

/**
 * Shared modal shell: X/overlay/Escape close, sticky header, internally
 * scrolling body, mobile-safe sizing (bottom sheet under 640px, centered
 * panel above it). Promoted from the Cafe demo package
 * (`components/demo/cafe/Modal.tsx`) to `components/shared/design-kit` so
 * every module/package can reuse the same popup shell instead of each
 * building its own.
 */
export function Modal({ open, onClose, title, children, footer, titleAdornment, width = 'min(960px, 94vw)', closeLabel = 'Close' }: ModalProps) {
  // FA-05: restore focus to whatever opened this dialog on every close path
  // (Escape below, backdrop click, and the close button) - see
  // `useRestoreFocusOnClose` for why a single `open`-prop watcher covers all
  // of them.
  useRestoreFocusOnClose(open);
  const panelRef = useRef<HTMLDivElement>(null);
  // Move focus into the dialog on open so screen readers announce it and Tab
  // starts inside it; restoring focus back out is handled by the hook above.
  // `preventScroll: true` because the panel is already fully visible (fixed
  // overlay covering the viewport) -- without it, the browser's default
  // focus()-triggers-scrollIntoView behavior would visibly jump the page
  // every time any modal opens, for no reason (nothing was actually
  // off-screen).
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="shared-design-kit-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(54, 43, 31, 0.45)',
        display: 'flex',
        justifyContent: 'center',
        padding: 0,
        zIndex: 1000,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          outline: 'none',
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px 8px 0 0',
          boxShadow: '0 -8px 30px rgba(54, 43, 31, 0.18)',
        }}
        className="shared-design-kit-modal-panel"
      >
        {/* Sticky header: stays outside the scrollable body below, so it's
            always visible no matter how far the content (a long Staff/Recipe
            list, a form) scrolls - never pushed off-screen. */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '20px 20px 16px',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h2>
            {titleAdornment}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className={hoverStyles.iconButton}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              background: colors.surfaceElevated,
              color: colors.textPrimary,
              fontSize: 16,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 20 }}>{children}</div>
        {footer ? (
          <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: `1px solid ${colors.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            {footer}
          </div>
        ) : null}
      </div>
      <style>{`
        .shared-design-kit-modal-overlay { align-items: flex-end; }
        @media (min-width: 640px) {
          .shared-design-kit-modal-overlay { align-items: center; }
          .shared-design-kit-modal-panel {
            border-radius: 8px !important;
          }
        }
      `}</style>
    </div>
  );
}
