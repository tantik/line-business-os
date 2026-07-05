'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';

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
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '85vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: demoColors.surface,
          border: `1px solid ${demoColors.border}`,
          borderRadius: '8px 8px 0 0',
          padding: 20,
          boxShadow: '0 -8px 30px rgba(54, 43, 31, 0.18)',
        }}
        className="demo-cafe-modal-panel"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
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
        <div style={{ marginTop: 16 }}>{children}</div>
        {footer ? <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>{footer}</div> : null}
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
