'use client';

import type { CSSProperties } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';
import type { ClockState } from '@/lib/demo/cafe/types';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';
import { DemoHelpButton } from './DemoHelpButton';
import { HELP_STAFF_WORK_STATUS } from '@/lib/demo/cafe/helpContent';

const STATUS_LABEL_KEY: Record<ClockState, Parameters<typeof tStaff>[1]> = {
  idle: 'statusIdle',
  clocked_in: 'statusClockedIn',
  on_break: 'statusOnBreak',
  clocked_out: 'statusClockedOut',
};

const STATUS_TONE: Record<ClockState, { background: string; color: string }> = {
  idle: { background: demoColors.surfaceElevated, color: demoColors.textMuted },
  clocked_in: { background: demoColors.accentMuted, color: demoColors.accent },
  on_break: { background: demoColors.alertWarningBg, color: demoColors.warning },
  clocked_out: { background: demoColors.surfaceElevated, color: demoColors.textMuted },
};

function actionButtonStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    padding: '16px 10px',
    minHeight: 52,
    borderRadius: 8,
    border: `1px solid ${active ? demoColors.accent : demoColors.border}`,
    background: disabled ? demoColors.surfaceElevated : active ? demoColors.accent : demoColors.surface,
    color: disabled ? demoColors.textMuted : active ? '#FFFFFF' : demoColors.textPrimary,
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    boxShadow: active && !disabled ? '0 4px 10px rgba(79, 122, 82, 0.25)' : 'none',
  };
}

interface ClockPanelProps {
  /** Current clock state, sourced from the shared demo store so it survives refresh and is scoped per brand. */
  state: ClockState;
  /** Clock-in time label to show alongside the status pill (e.g. "09:05〜"), or null before clocking in. */
  clockInLabel: string | null;
  onClockToggle: () => void;
  onBreakToggle: () => void;
}

/** 出勤/退勤 + 休憩開始/休憩終了 as exactly 2 state-changing buttons. Controlled by the caller — see `StaffView` for the shared-store wiring. Demo only — no real time-tracking backend. */
export function ClockPanel({ state, clockInLabel, onClockToggle, onBreakToggle }: ClockPanelProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);

  const isWorking = state === 'clocked_in' || state === 'on_break';
  const onBreak = state === 'on_break';
  const clockedOut = state === 'clocked_out';

  return (
    <section
      style={{
        border: `1px solid ${demoColors.border}`,
        borderRadius: 8,
        padding: 18,
        background: demoColors.surface,
        boxShadow: '0 1px 2px rgba(54, 43, 31, 0.04), 0 10px 24px rgba(54, 43, 31, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 15 }}>{t('workStatus')}</strong>
          <DemoHelpButton content={HELP_STAFF_WORK_STATUS} />
        </div>
        <span
          style={{
            ...STATUS_TONE[state],
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {t(STATUS_LABEL_KEY[state])}
          {clockInLabel && state !== 'idle' ? ` ・ ${clockInLabel}〜` : ''}
        </span>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button
          type="button"
          disabled={clockedOut}
          onClick={onClockToggle}
          style={actionButtonStyle(isWorking, clockedOut)}
        >
          {isWorking ? t('clockOut') : t('clockIn')}
        </button>
        <button
          type="button"
          disabled={!isWorking}
          onClick={onBreakToggle}
          style={actionButtonStyle(onBreak, !isWorking)}
        >
          {onBreak ? t('breakEnd') : t('breakStart')}
        </button>
      </div>
    </section>
  );
}
