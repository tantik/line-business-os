'use client';

import { useState } from 'react';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';
import { demoColors } from '@/lib/demo/cafe/theme';

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

  if (!open) return null;

  function close() {
    setSelected(null);
    onClose();
  }

  function confirm() {
    if (selected === null) return;
    const breakMinutes = selected;
    setSelected(null);
    onConfirm(breakMinutes);
  }

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 12,
        background: 'rgba(35, 29, 22, 0.46)',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="clock-out-title"
        style={{
          width: 'min(100%, 480px)',
          padding: 20,
          borderRadius: 16,
          background: demoColors.surface,
          boxShadow: '0 20px 50px rgba(35, 29, 22, 0.24)',
        }}
      >
        {selected === null ? (
          <>
            <h2 id="clock-out-title" style={{ margin: 0, fontSize: 20 }}>{t('clockOutBreakTitle')}</h2>
            <p style={{ margin: '8px 0 16px', color: demoColors.textMuted }}>{t('clockOutBreakBody')}</p>
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
            <h2 id="clock-out-title" style={{ margin: 0, fontSize: 20 }}>{t('clockOutConfirmTitle')}</h2>
            <p style={{ margin: '12px 0 4px', fontSize: 16 }}>
              {t('clockOutConfirmTime')}: <strong>{clockOutTime}</strong>
            </p>
            <p style={{ margin: '4px 0 18px', fontSize: 16 }}>
              {t('clockOutConfirmBreak')}: <strong>{selected}{t('minutesSuffix')}</strong>
            </p>
            <button
              type="button"
              onClick={confirm}
              style={{
                width: '100%',
                minHeight: 56,
                border: 0,
                borderRadius: 10,
                background: demoColors.accent,
                color: '#fff',
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
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
      </section>
    </div>
  );
}
