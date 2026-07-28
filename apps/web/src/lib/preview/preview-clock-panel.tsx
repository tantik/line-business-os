'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { previewClockIn, previewClockOut } from './actions/staff-attendance-actions';
import { previewWriteMessageJa } from './write-result';
import { CafeStaffStatusCard } from '@/components/demo/cafe/CafeStaffPresentation';
import { buttonPrimary, buttonSecondary, card, demoColors, mutedText } from '@/lib/demo/cafe/theme';

const BREAK_OPTIONS = [0, 30, 60] as const;
type BreakMinutes = (typeof BREAK_OPTIONS)[number];

export interface PreviewClockPanelProps {
  todayAttendance: WorkforceAttendance | null;
  timeZone: string;
}

export function PreviewClockPanel({ todayAttendance, timeZone }: PreviewClockPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [selectedBreak, setSelectedBreak] = useState<BreakMinutes | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isWorking = Boolean(todayAttendance?.clockIn && !todayAttendance.clockOut);
  const isFinished = Boolean(todayAttendance?.clockOut);
  const clockInTime = todayAttendance?.clockIn
    ? utcIsoToLocalDateTime(todayAttendance.clockIn, timeZone).localTime
    : null;

  function clockIn() {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewClockIn();
      if (result.status === 'success') {
        router.refresh();
      } else {
        setFeedback(previewWriteMessageJa(result.status));
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
        setFeedback(previewWriteMessageJa(result.status));
      }
    });
  }

  return (
    <CafeStaffStatusCard
      title="勤務状況"
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
          ? `退勤済み・休憩 ${todayAttendance?.actualBreakMinutes ?? 0}分`
          : isWorking
            ? `勤務中・${clockInTime}〜`
            : '未出勤'}
      </span>
      }
    >
      {!isFinished ? (
        <button
          type="button"
          style={{ ...buttonPrimary, width: '100%', minHeight: 52 }}
          disabled={isPending}
          onClick={isWorking ? () => setClockOutOpen(true) : clockIn}
        >
          {isPending ? '処理中…' : isWorking ? '退勤' : '出勤'}
        </button>
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
                <h2 id="authenticated-clock-out-title" style={{ margin: 0, fontSize: 18 }}>休憩時間を選択</h2>
                <p style={{ margin: '8px 0 14px', ...mutedText }}>本日の休憩時間を選んでください。</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {BREAK_OPTIONS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      style={{ ...buttonSecondary, minHeight: 56, fontSize: 17 }}
                      onClick={() => setSelectedBreak(minutes)}
                    >
                      {minutes}分
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 id="authenticated-clock-out-title" style={{ margin: 0, fontSize: 18 }}>退勤を確認</h2>
                <p style={{ margin: '10px 0 16px' }}>休憩時間: <strong>{selectedBreak}分</strong></p>
                <button type="button" style={{ ...buttonPrimary, width: '100%', minHeight: 52 }} disabled={isPending} onClick={confirmClockOut}>
                  {isPending ? '処理中…' : '退勤を確定'}
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
              キャンセル
            </button>
          </section>
        </div>
      ) : null}
    </CafeStaffStatusCard>
  );
}
