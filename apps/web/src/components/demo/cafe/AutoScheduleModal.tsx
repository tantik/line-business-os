'use client';

import { Modal } from './Modal';
import { buttonPrimary, buttonSecondary, demoColors } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

interface AutoScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

const DEFAULT_DESCRIPTION_JA =
  '来月分のシフトを、スタッフの希望と設定内容にもとづいてすべて再作成します。すでに来月分に加えた手動変更は上書きされる場合があります。続けますか？';
const DEFAULT_DESCRIPTION_EN =
  "Recreates next month's shifts from scratch based on staff preferences and your settings. Manual edits already made for next month may be overwritten. Continue?";

export function AutoScheduleModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
}: AutoScheduleModalProps) {
  const { lang } = useLang();
  const resolvedTitle = title ?? tManager(lang, 'autoScheduleConfirmTitle');
  const resolvedDescription = description ?? (lang === 'en' ? DEFAULT_DESCRIPTION_EN : DEFAULT_DESCRIPTION_JA);
  const resolvedConfirmLabel = confirmLabel ?? tManager(lang, 'autoScheduleConfirmAction');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={resolvedTitle}
      footer={
        <>
          <button type="button" style={buttonSecondary} onClick={onClose}>
            {tManager(lang, 'cancel')}
          </button>
          <button
            type="button"
            style={buttonPrimary}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {resolvedConfirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: demoColors.textPrimary }}>
        {resolvedDescription}
      </p>
    </Modal>
  );
}
