'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { previewClockIn, previewClockOut, previewResetTodayClock } from './actions/staff-attendance-actions';
import { previewWriteMessage } from './write-result';
import { CafeStaffStatusCard } from '@/components/demo/cafe/CafeStaffPresentation';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_STAFF_WORK_STATUS } from '@/lib/demo/cafe/helpContent';
import { buttonDisabled, buttonPrimary, buttonSecondary, card, demoColors, mutedText } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

const BREAK_OPTIONS = [0, 30, 60] as const;
type BreakMinutes = (typeof BREAK_OPTIONS)[number];

export interface PreviewClockPanelProps {
  todayAttendance: WorkforceAttendance | null;
  timeZone: string;
}

export function PreviewClockPanel({ todayAttendance, timeZone }: PreviewClockPanelProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);
  const [isPending, startTransition] = useTransition();
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [selectedBreak, setSelectedBreak] = useState<BreakMinutes | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isWorking = Boolean(todayAttendance?.clockIn && !todayAttendance.clockOut);
  const isFinished = Boolean(todayAttendance?.clockOut);
  const clockInTime = todayAttendance?.clockIn
    ? utcIsoToLocalDateTime(todayAttendance.clockIn, timeZone).localTime
    : null;
  const clockOutTime = todayAttendance?.clockOut
    ? utcIsoToLocalDateTime(todayAttendance.clockOut, timeZone).localTime
    : null;

  function clockIn() {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewClockIn();
      if (result.status === 'success') {
        router.refresh();
      } else {
        setFeedback(previewWriteMessage(lang, result.status));
      }
    });
  }

  function confirmClockOut() {
    if (selectedBreak === null) return;
    const formData = new FormData();
    formData.set('actualBreakMinutes', String(selectedBreak));
    setFeedback(null);
    startTransition(async () => {
      const result = await previewClockOut(formData);
      if (result.status === 'success') {
        setSelectedBreak(null);
        setClockOutOpen(false);
        router.refresh();
      } else {
        setFeedback(previewWriteMessage(lang, result.status));
      }
    });
  }

  function resetTodayClock() {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewResetTodayClock();
      if (result.status === 'success') {
        router.refresh();
      } else {
        setFeedback(previewWriteMessage(lang, result.status));
      }
    });
  }

  return (
    <CafeStaffStatusCard
      title={<>{t('workStatus')} <DemoHelpButton content={HELP_STAFF_WORK_STATUS} /></>}
      status={
      <span
        style={{
          padding: '3px 10px',
          borderRadius: 999,
          background: isWorking ? demoColors.accentMuted : demoColors.surfaceElevated,
          color: isWorking ? demoColors.accent : demoColors.textMuted,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {isFinished
          ? `${clockInTime}〜${clockOutTime}・${t('breakMinutesLabel')} ${todayAttendance?.actualBreakMinutes ?? 0}${t('minutesSuffix')}`
          : isWorking
            ? `${t('statusClockedIn')}・${clockInTime}〜`
            : t('statusIdle')}
      </span>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          style={{
            ...(isFinished ? buttonDisabled : isWorking ? buttonPrimary : buttonSecondary),
            width: 'min(100%, 360px)',
            minHeight: 64,
            borderRadius: 14,
            fontSize: 18,
            fontWeight: 800,
            boxShadow: isWorking ? '0 8px 22px rgba(79, 122, 82, 0.3)' : '0 4px 14px rgba(54, 43, 31, 0.08)',
          }}
          disabled={isPending || isFinished}
          onClick={isWorking ? () => setClockOutOpen(true) : clockIn}
        >
          {isPending ? t('processing') : isFinished ? t('statusClockedOut') : isWorking ? t('clockOut') : t('clockIn')}
        </button>
      </div>
      {isFinished ? (
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <button
            type="button"
            style={{ ...buttonSecondary, padding: '7px 12px', fontSize: 12 }}
            disabled={isPending}
            onClick={resetTodayClock}
          >
            {t('resetTodayClockTest')}
          </button>
        </div>
      ) : null}
      {feedback ? <p style={{ margin: '10px 0 0', color: demoColors.dangerText }}>{feedback}</p> : null}

      {clockOutOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="authenticated-clock-out-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'grid',
            placeItems: 'end center',
            padding: 12,
            background: 'rgba(0,0,0,0.48)',
          }}
        >
          <section style={{ ...card, width: 'min(100%, 460px)', margin: 0 }}>
            {selectedBreak === null ? (
              <>
                <h2 id="authenticated-clock-out-title" style={{ margin: 0, fontSize: 18 }}>{t('clockOutBreakTitle')}</h2>
                <p style={{ margin: '8px 0 14px', ...mutedText }}>{t('clockOutBreakBody')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {BREAK_OPTIONS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      style={{ ...buttonSecondary, minHeight: 56, fontSize: 17 }}
                      onClick={() => setSelectedBreak(minutes)}
                    >
                      {minutes}{t('minutesSuffix')}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 id="authenticated-clock-out-title" style={{ margin: 0, fontSize: 18 }}>{t('clockOutConfirmTitle')}</h2>
                <p style={{ margin: '10px 0 16px' }}>{t('clockOutConfirmBreak')}: <strong>{selectedBreak}{t('minutesSuffix')}</strong></p>
                <button type="button" style={{ ...buttonPrimary, width: '100%', minHeight: 52 }} disabled={isPending} onClick={confirmClockOut}>
                  {isPending ? t('processing') : t('clockOutConfirmAction')}
                </button>
              </>
            )}
            <button
              type="button"
              style={{ ...buttonSecondary, width: '100%', marginTop: 8 }}
              disabled={isPending}
              onClick={() => {
                setSelectedBreak(null);
                setClockOutOpen(false);
              }}
            >
              {t('clockOutCancel')}
            </button>
          </section>
        </div>
      ) : null}
    </CafeStaffStatusCard>
  );
}
