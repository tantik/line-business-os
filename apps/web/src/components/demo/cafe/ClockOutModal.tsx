'use client';

import { useState } from 'react';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';
import { demoColors } from '@/lib/demo/cafe/theme';
import { Modal } from './Modal';

const BREAK_OPTIONS = [0, 30, 60] as const;
export type DemoClockOutBreakMinutes = (typeof BREAK_OPTIONS)[number];

interface ClockOutModalProps {
  open: boolean;
  clockOutTime: string;
  onClose: () => void;
  onConfirm: (breakMinutes: DemoClockOutBreakMinutes) => void;
}

export function ClockOutModal({ open, clockOutTime, onClose, onConfirm }: ClockOutModalProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);
  const [selected, setSelected] = useState<DemoClockOutBreakMinutes | null>(null);
  const [confirming, setConfirming] = useState(false);

  function close() {
    setSelected(null);
    setConfirming(false);
    onClose();
  }

  function confirm() {
    if (selected === null || confirming) return;
    setConfirming(true);
    const breakMinutes = selected;
    setSelected(null);
    onConfirm(breakMinutes);
  }

  return (
    <Modal open={open} onClose={close} title={selected === null ? t('clockOutBreakTitle') : t('clockOutConfirmTitle')}>
      {selected === null ? (
        <>
          <p style={{ margin: '0 0 16px', color: demoColors.textMuted }}>{t('clockOutBreakBody')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {BREAK_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => setSelected(minutes)}
                style={{
                  minHeight: 64,
                  border: `1px solid ${demoColors.border}`,
                  borderRadius: 10,
                  background: demoColors.surfaceElevated,
                  color: demoColors.textPrimary,
                  fontSize: 18,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {minutes}{t('minutesSuffix')}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 4px', fontSize: 16 }}>
            {t('clockOutConfirmTime')}: <strong>{clockOutTime}</strong>
          </p>
          <p style={{ margin: '4px 0 18px', fontSize: 16 }}>
            {t('clockOutConfirmBreak')}: <strong>{selected}{t('minutesSuffix')}</strong>
          </p>
          <button
            type="button"
            onClick={confirm}
            disabled={confirming}
            style={{
              width: '100%',
              minHeight: 56,
              border: 0,
              borderRadius: 10,
              background: confirming ? demoColors.textMuted : demoColors.accent,
              color: '#fff',
              fontSize: 16,
              fontWeight: 800,
              cursor: confirming ? 'default' : 'pointer',
            }}
          >
            {t('clockOutConfirmAction')}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={close}
        style={{
          width: '100%',
          minHeight: 48,
          marginTop: 10,
          border: `1px solid ${demoColors.border}`,
          borderRadius: 10,
          background: demoColors.surface,
          color: demoColors.textPrimary,
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {t('clockOutCancel')}
      </button>
    </Modal>
  );
}
