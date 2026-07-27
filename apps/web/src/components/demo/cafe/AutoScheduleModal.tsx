'use client';

import { Modal } from './Modal';
import { buttonPrimary, buttonSecondary, demoColors } from '@/lib/demo/cafe/theme';

interface AutoScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

const DEFAULT_DESCRIPTION =
  '来月分のシフトを、スタッフの希望と設定内容にもとづいてすべて再作成します。すでに来月分に加えた手動変更は上書きされる場合があります。続けますか？';

export function AutoScheduleModal({
  open,
  onClose,
  onConfirm,
  title = '自動シフト作成',
  description = DEFAULT_DESCRIPTION,
  confirmLabel = '自動作成する',
}: AutoScheduleModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" style={buttonSecondary} onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            style={buttonPrimary}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: demoColors.textPrimary }}>
        {description}
      </p>
    </Modal>
  );
}
