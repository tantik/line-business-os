'use client';

import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { formatMonthDayWeekday } from '@/lib/demo/cafe/format';
import { buttonPrimary, buttonSecondary, demoColors, shiftChipColors, shiftTypeDisplayLabel } from '@/lib/demo/cafe/theme';
import type { ShiftTypeDef } from '@/lib/demo/cafe/types';

interface ShiftEditModalProps {
  open: boolean;
  onClose: () => void;
  staffName: string;
  date: string;
  currentShiftTypeId: string | null;
  shiftTypes: ShiftTypeDef[];
  onSave: (shiftTypeId: string | null) => void;
  /** Explains what the "!" indicator on this cell means (correction request / staff message / staffing shortage). Empty when the cell has no indicator. */
  alertMessages?: string[];
}

export function ShiftEditModal({
  open,
  onClose,
  staffName,
  date,
  currentShiftTypeId,
  shiftTypes,
  onSave,
  alertMessages = [],
}: ShiftEditModalProps) {
  const [selected, setSelected] = useState<string | null>(currentShiftTypeId);

  useEffect(() => {
    setSelected(currentShiftTypeId);
  }, [currentShiftTypeId, date, open]);

  if (!open) return null;

  const options: Array<{ id: string | null; label: string }> = [
    { id: null, label: '未定' },
    ...shiftTypes.map((type) => ({ id: type.id, label: shiftTypeDisplayLabel(type) })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`シフト編集 - ${staffName}`}
      footer={
        <>
          <button type="button" style={buttonSecondary} onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            style={buttonPrimary}
            onClick={() => {
              onSave(selected);
              onClose();
            }}
          >
            保存
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 12px', fontSize: 13, color: demoColors.textMuted }}>
        {formatMonthDayWeekday(new Date(`${date}T00:00:00`))}
      </p>

      {alertMessages.length > 0 ? (
        <div
          style={{
            marginBottom: 14,
            padding: '10px 12px',
            borderRadius: 8,
            background: demoColors.alertDangerBg,
            border: `1px solid ${demoColors.danger}`,
          }}
        >
          <strong style={{ fontSize: 12.5, color: demoColors.dangerText }}>「!」の内容</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, color: demoColors.dangerText, display: 'grid', gap: 4 }}>
            {alertMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 6 }}>
        {options.map((option) => {
          const chip = shiftChipColors(option.id);
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id ?? 'none'}
              type="button"
              onClick={() => setSelected(option.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${isSelected ? demoColors.accent : demoColors.border}`,
                background: isSelected ? demoColors.accentMuted : demoColors.surfaceElevated,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 13, color: demoColors.textPrimary }}>{option.label}</span>
              <span
                style={{
                  display: 'inline-flex',
                  minWidth: 28,
                  padding: '2px 6px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  justifyContent: 'center',
                  background: chip.background,
                  color: chip.color,
                }}
              >
                {option.id ? shiftTypes.find((t) => t.id === option.id)?.label : '－'}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
