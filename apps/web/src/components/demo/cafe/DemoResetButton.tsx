'use client';

import { useState } from 'react';
import { Modal } from './Modal';
import { resetDemoStore } from '@/lib/demo/cafe/store';
import type { DemoCafeStoreScope } from '@/lib/demo/cafe/store';
import { buttonPrimary, buttonSecondary, demoColors } from '@/lib/demo/cafe/theme';

interface DemoResetButtonProps {
  /** Store scope to reset — only this brand's demo data is cleared. */
  scope: DemoCafeStoreScope;
  label: string;
  doneLabel: string;
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
  cancelLabel: string;
}

/** Small confirm-then-reset control for the public demo. Clears only the current brand's scoped demo data, never the other brand's. */
export function DemoResetButton({
  scope,
  label,
  doneLabel,
  confirmTitle,
  confirmBody,
  confirmLabel,
  cancelLabel,
}: DemoResetButtonProps) {
  const [open, setOpen] = useState(false);
  const [justReset, setJustReset] = useState(false);

  function handleConfirm() {
    resetDemoStore(scope);
    setOpen(false);
    setJustReset(true);
    window.setTimeout(() => setJustReset(false), 2000);
  }

  return (
    <>
      <button
        type="button"
        style={{ ...buttonSecondary, fontSize: 12.5, padding: '8px 12px', whiteSpace: 'nowrap' }}
        onClick={() => setOpen(true)}
      >
        {justReset ? doneLabel : label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={confirmTitle}>
        <p style={{ margin: 0, fontSize: 13.5, color: demoColors.textPrimary, lineHeight: 1.65 }}>{confirmBody}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" style={buttonSecondary} onClick={() => setOpen(false)}>
            {cancelLabel}
          </button>
          <button type="button" style={buttonPrimary} onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </Modal>
    </>
  );
}
