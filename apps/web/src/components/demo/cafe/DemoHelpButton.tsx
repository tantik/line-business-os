'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Modal } from './Modal';
import { demoColors } from '@/lib/demo/cafe/theme';
import type { DemoHelpContent, DemoHelpContentByLang } from '@/lib/demo/cafe/helpContent';
import { useLang } from '@/lib/demo/cafe/i18n';

interface DemoHelpButtonProps {
  content: DemoHelpContent | DemoHelpContentByLang;
}

const helpButtonStyle: CSSProperties = {
  width: 22,
  height: 22,
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: '50%',
  border: `1px solid ${demoColors.borderStrong}`,
  background: demoColors.surfaceElevated,
  color: demoColors.textMuted,
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  cursor: 'pointer',
};

/** Small circular `?` button + modal, used to attach step-by-step JA help copy to a demo section heading. Tap-to-open (no hover-only tooltip) so it works the same on mobile and desktop. */
export function DemoHelpButton({ content }: DemoHelpButtonProps) {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();
  const localized = 'ja' in content ? content[lang] : content;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={localized.ariaLabel} style={helpButtonStyle}>
        ?
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={localized.title}>
        <div style={{ fontSize: 13.5, lineHeight: 1.75, color: demoColors.textPrimary, whiteSpace: 'pre-line' }}>
          {localized.body}
        </div>
      </Modal>
    </>
  );
}
