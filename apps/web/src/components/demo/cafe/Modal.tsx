'use client';

import type { ReactNode } from 'react';
import { useLang } from '@/lib/demo/cafe/i18n';
import { Modal as SharedModal } from '@/components/shared/design-kit';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}

/**
 * Thin re-export shim: the real implementation lives at
 * `@/components/shared/design-kit` (promoted so any module/package can reuse
 * it, not just the Cafe demo). Kept here, prop-compatible with every
 * existing call site in this package (`maxWidth` in px, no `closeLabel` —
 * this shim derives it from the demo's own `useLang()` the way the original
 * component did), so nothing under `apps/web/src/lib/preview/**` or
 * `apps/web/src/components/demo/cafe/**` needs to change.
 */
export function Modal({ open, onClose, title, children, footer, maxWidth = 440 }: ModalProps) {
  const { lang } = useLang();
  return (
    <SharedModal
      open={open}
      onClose={onClose}
      title={title}
      footer={footer}
      width={`${maxWidth}px`}
      closeLabel={lang === 'ja' ? '閉じる' : 'Close'}
    >
      {children}
    </SharedModal>
  );
}
