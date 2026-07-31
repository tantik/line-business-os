'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { buttonSecondary, card, demoColors } from '@/lib/demo/cafe/theme';

export function PreviewInventoryModal({
  title,
  closeLabel,
  children,
  onClose,
}: {
  title: string;
  closeLabel: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(15, 23, 42, 0.55)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          ...card,
          width: 'min(640px, 100%)',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: demoColors.surface,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
        }}
      >
        <div style={{ position: 'sticky', top: -16, zIndex: 2, margin: '-16px -16px 0', padding: '14px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: demoColors.surface, borderBottom: `1px solid ${demoColors.border}` }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button type="button" style={buttonSecondary} onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
