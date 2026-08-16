'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLang } from '@/lib/demo/cafe/i18n';
import { demoColors } from '@/lib/demo/cafe/theme';
import { useRestoreFocusOnClose } from './useRestoreFocusOnClose';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}

/** Single shared modal shell for the cafe demo: X/overlay/Escape close, mobile-safe sizing. */
export function Modal({ open, onClose, title, children, footer, maxWidth = 440 }: ModalProps) {
  const { lang } = useLang();
  // FA-05: restore focus to whatever opened this dialog on every close path
  // (Escape below, backdrop click, and the close button) - see
  // `useRestoreFocusOnClose` for why a single `open`-prop watcher covers all
  // of them.
  useRestoreFocusOnClose(open);
  const panelRef = useRef<HTMLDivElement>(null);
  // Move focus into the dialog on open so screen readers announce it and Tab
  // starts inside it; restoring focus back out is handled by the hook above.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
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
      className="demo-cafe-modal-overlay"
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
          maxWidth,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          outline: 'none',
          background: demoColors.surface,
          border: `1px solid ${demoColors.border}`,
          borderRadius: '8px 8px 0 0',
          boxShadow: '0 -8px 30px rgba(54, 43, 31, 0.18)',
        }}
        className="demo-cafe-modal-panel"
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
            borderBottom: `1px solid ${demoColors.border}`,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ja' ? '閉じる' : 'Close'}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${demoColors.border}`,
              background: demoColors.surfaceElevated,
              color: demoColors.textPrimary,
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
          <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: `1px solid ${demoColors.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            {footer}
          </div>
        ) : null}
      </div>
      <style>{`
        .demo-cafe-modal-overlay { align-items: flex-end; }
        @media (min-width: 640px) {
          .demo-cafe-modal-overlay { align-items: center; }
          .demo-cafe-modal-panel {
            border-radius: 8px !important;
          }
        }
      `}</style>
    </div>
  );
}
