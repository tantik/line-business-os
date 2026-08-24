'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { clockIn as clockInAction, clockOut as clockOutAction } from '@/lib/workforce/attendance-actions';
import { Modal } from '@/components/demo/cafe/Modal';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, card, colors, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';
import { tStaffDashboard } from './staff-dashboard-i18n';

const BREAK_OPTIONS = [0, 30, 60] as const;
type BreakMinutes = (typeof BREAK_OPTIONS)[number];

export interface WorkStatusCardProps {
  /** The caller's own attendance row for today, or `null` if not yet clocked in. */
  todayAttendance: WorkforceAttendance | null;
  timeZone: string;
  lang: Lang;
}

/**
 * Live Clock in / Clock out card for the caller's own attendance today --
 * one whole-cell primary action plus a break-time confirmation step, matching
 * the `_client-preview` `PreviewClockPanel` reference one-to-one (Founder
 * screenshot direction, 2026-08-24) but wired to the canonical, non-preview
 * `clockIn`/`clockOut` Server Actions so a real Staff session's clock event
 * is immediately visible to the Manager's Weekly Schedule as a closed day.
 */
export function WorkStatusCard({ todayAttendance, timeZone, lang }: WorkStatusCardProps) {
  const router = useRouter();
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);
  const [isPending, startTransition] = useTransition();
  const [breakPickerOpen, setBreakPickerOpen] = useState(false);
  const [selectedBreak, setSelectedBreak] = useState<BreakMinutes | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isWorking = Boolean(todayAttendance?.clockIn && !todayAttendance.clockOut);
  const isFinished = Boolean(todayAttendance?.clockOut);
  const clockInTime = todayAttendance?.clockIn ? utcIsoToLocalDateTime(todayAttendance.clockIn, timeZone).localTime : null;
  const clockOutTime = todayAttendance?.clockOut ? utcIsoToLocalDateTime(todayAttendance.clockOut, timeZone).localTime : null;

  function closeBreakPicker() {
    setSelectedBreak(null);
    setBreakPickerOpen(false);
  }

  function handleClockIn() {
    setError(null);
    startTransition(async () => {
      const result = await clockInAction();
      if (result.status === 'success') {
        router.refresh();
      } else {
        setError(describeWriteError(result, lang));
      }
    });
  }

  function handleConfirmClockOut() {
    if (selectedBreak === null) return;
    const formData = new FormData();
    formData.set('actualBreakMinutes', String(selectedBreak));
    setError(null);
    startTransition(async () => {
      const result = await clockOutAction(formData);
      if (result.status === 'success') {
        closeBreakPicker();
        router.refresh();
      } else {
        setError(describeWriteError(result, lang));
      }
    });
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('workStatusHeading')}</h2>
        <span
          style={{
            padding: '3px 10px',
            borderRadius: 999,
            background: isWorking ? colors.accentMuted : colors.surfaceElevated,
            color: isWorking ? colors.accent : colors.textMuted,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {isFinished
            ? `${clockInTime}〜${clockOutTime}・${t('workStatusBreakLabel')} ${todayAttendance?.actualBreakMinutes ?? 0}${t('workStatusMinutesSuffix')}`
            : isWorking
              ? `${t('workStatusWorkingLabel')}・${clockInTime}〜`
              : t('workStatusIdle')}
        </span>
      </div>

      <button
        type="button"
        style={{
          ...(isFinished ? buttonDisabled : isWorking ? buttonPrimary : buttonSecondary),
          width: '100%',
          marginTop: 14,
          minHeight: 64,
          borderRadius: 14,
          fontSize: 18,
          fontWeight: 800,
        }}
        disabled={isPending || isFinished}
        onClick={isWorking ? () => setBreakPickerOpen(true) : handleClockIn}
      >
        {isPending ? t('workStatusProcessing') : isFinished ? t('workStatusClockedOutButton') : isWorking ? t('clockOutLabel') : t('clockInLabel')}
      </button>

      {error ? <div style={{ ...alertDanger, marginTop: 10 }}>{error}</div> : null}

      <Modal
        open={breakPickerOpen}
        onClose={closeBreakPicker}
        title={selectedBreak === null ? t('workStatusSelectBreakTitle') : t('workStatusConfirmTitle')}
      >
        {selectedBreak === null ? (
          <>
            <p style={{ margin: '0 0 14px', ...mutedText }}>{t('workStatusSelectBreakBody')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {BREAK_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  style={{ ...buttonSecondary, minHeight: 56, fontSize: 17 }}
                  onClick={() => setSelectedBreak(minutes)}
                >
                  {minutes}
                  {t('workStatusMinutesSuffix')}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p style={{ margin: '0 0 16px' }}>
            {t('workStatusConfirmBreakLabel')}: <strong>{selectedBreak}{t('workStatusMinutesSuffix')}</strong>
          </p>
        )}
        {selectedBreak !== null ? (
          <button type="button" style={{ ...(isPending ? buttonDisabled : buttonPrimary), width: '100%', minHeight: 52 }} disabled={isPending} onClick={handleConfirmClockOut}>
            {isPending ? t('workStatusProcessing') : t('workStatusConfirmAction')}
          </button>
        ) : null}
        <button type="button" style={{ ...buttonSecondary, width: '100%', marginTop: 8 }} disabled={isPending} onClick={closeBreakPicker}>
          {t('workStatusCancel')}
        </button>
      </Modal>
    </section>
  );
}
