'use client';

import { useMemo, useState, useTransition } from 'react';
import type { CSSProperties } from 'react';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { addDays, toISODate, weekdayIndexMonFirst, WEEKDAY_LABELS_EN_MON_FIRST, WEEKDAY_LABELS_MON_FIRST } from '@/lib/demo/cafe/format';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { shiftTypeDisplayLabel, type WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import { submitMonthlyShiftPreferences } from '@/lib/workforce/schedule-actions';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, colors, input as inputStyle, mutedText } from '@/lib/ui/theme';
import { shiftChipColors } from '../_ui/workforce-theme';
import { describeWriteError } from './error-copy';
import { tStaffDashboard } from './staff-dashboard-i18n';

export interface MonthlyShiftPreferenceModalProps {
  open: boolean;
  onClose: () => void;
  shiftTypes: WorkforceShiftType[];
  /** The caller's own `kind: 'preference'` requests (not date-filtered) -- used to lock next month's already-submitted days, since preference rows are INSERT-only (no self-scoped edit). */
  requests: WorkforceShiftRequest[];
  lang: Lang;
  onSuccess: (message: string) => void;
}

function nextMonthDates(today: Date): string[] {
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month + 1, 1);
  const daysInMonth = new Date(year, month + 2, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => toISODate(addDays(first, i)));
}

const cellBase: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  minHeight: 44,
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  fontSize: 11.5,
  cursor: 'pointer',
};

/**
 * "Submit next month's shift preference": a tap-to-cycle calendar of every
 * day in the upcoming calendar month, ported from the demo package's
 * `ShiftPreferenceModal` (same interaction) onto the real backend --
 * `submitMonthlyShiftPreferences` inserts one `workforce_shift_requests` row
 * per selected day via the existing single-day write path, no schema change.
 * A day that already has a submitted preference is shown locked (read-only):
 * preference rows are INSERT-only, so changing an already-submitted day
 * requires a manager to edit it directly (same rule the single-day form
 * already documents).
 */
export function MonthlyShiftPreferenceModal({ open, onClose, shiftTypes, requests, lang, onSuccess }: MonthlyShiftPreferenceModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string | null>>({});
  const [note, setNote] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);

  const dates = useMemo(() => nextMonthDates(new Date()), []);
  const leadingBlanks = dates.length > 0 ? weekdayIndexMonFirst(new Date(`${dates[0]}T00:00:00`)) : 0;
  const monthLabel = dates.length > 0 ? new Date(`${dates[0]}T00:00:00`).getMonth() + 1 : null;
  const weekdayLabels = lang === 'en' ? WEEKDAY_LABELS_EN_MON_FIRST : WEEKDAY_LABELS_MON_FIRST;

  const activeShiftTypes = useMemo(() => shiftTypes.filter((st) => st.isActive), [shiftTypes]);
  const activeIds = useMemo(() => activeShiftTypes.map((st) => st.shiftTypeId), [activeShiftTypes]);
  const cycleOptions = useMemo<Array<string | null>>(() => [null, ...activeShiftTypes.map((st) => st.shiftTypeId)], [activeShiftTypes]);

  const lockedByDate = useMemo(() => {
    const map = new Map<string, WorkforceShiftRequest>();
    for (const r of requests) {
      if (r.kind === 'preference' && dates.includes(r.workDate)) map.set(r.workDate, r);
    }
    return map;
  }, [requests, dates]);

  function optionLabel(value: string | null): string {
    if (value === null) return '-';
    const st = activeShiftTypes.find((s) => s.shiftTypeId === value);
    return st ? shiftTypeDisplayLabel(st) : '-';
  }

  /** Time-range caption under a legend chip, same convention as `ShiftLegend` under the main schedule table. A blank day already means "not working" -- no separate "unavailable" state to explain. */
  function optionTimeCaption(value: string | null): string {
    if (value === null) return lang === 'ja' ? '勤務なし' : 'Not working';
    const st = activeShiftTypes.find((s) => s.shiftTypeId === value);
    return st ? `${st.startsAtLocal}-${st.endsAtLocal}` : '';
  }

  function cellTone(value: string | null): { background: string; color: string } {
    if (value === null) return { background: colors.surfaceElevated, color: colors.textMuted };
    return shiftChipColors(value, activeIds);
  }

  function cyclePreference(date: string) {
    if (lockedByDate.has(date)) return;
    const current = selections[date] ?? null;
    const idx = cycleOptions.indexOf(current);
    const next = cycleOptions[(idx + 1) % cycleOptions.length] ?? null;
    setSelections((prev) => ({ ...prev, [date]: next }));
  }

  function handleClose() {
    setError(null);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    const chosen = Object.entries(selections).filter(([, value]) => value !== null);
    if (chosen.length === 0) {
      setError(lang === 'ja' ? '少なくとも1日を選択してください。' : 'Choose at least one day.');
      return;
    }
    startTransition(async () => {
      const result = await submitMonthlyShiftPreferences({
        selections: chosen.map(([workDate, value]) => ({ workDate, shiftTypeId: value, isUnavailable: false })),
        note: note.trim() || null,
      });
      if (result.status === 'success') {
        setSelections({});
        setNote('');
        onClose();
        onSuccess(lang === 'ja' ? 'シフト希望を送信しました。' : 'Shift preferences submitted.');
      } else {
        setError(describeWriteError(result, lang));
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={lang === 'ja' ? '来月のシフト希望を提出' : "Submit next month's shift preference"}
      titleAdornment={<HelpIconButton ariaLabel={t('preferenceHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(480px, 94vw)"
      closeLabel={lang === 'ja' ? '閉じる' : 'Close'}
      footer={
        <>
          <button type="button" style={buttonSecondary} onClick={handleClose}>
            {lang === 'ja' ? 'キャンセル' : 'Cancel'}
          </button>
          <button type="button" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending} onClick={handleSubmit}>
            {isPending ? (lang === 'ja' ? '送信中...' : 'Submitting...') : lang === 'ja' ? '提出する' : 'Submit'}
          </button>
        </>
      }
    >
      {error ? <div style={{ ...alertDanger, marginBottom: 10 }}>{error}</div> : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 10 }}>
        {cycleOptions.map((value) => {
          const tone = cellTone(value ?? null);
          return (
            <div key={value ?? 'none'} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: tone.background,
                  color: tone.color,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {optionLabel(value ?? null)}
              </span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>{optionTimeCaption(value ?? null)}</span>
            </div>
          );
        })}
      </div>

      {monthLabel ? (
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary, marginBottom: 6 }}>
          {lang === 'ja' ? `${monthLabel}月` : `Month ${monthLabel}`}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {weekdayLabels.map((label) => (
          <div key={label} style={{ textAlign: 'center', fontSize: 11, color: colors.textMuted, fontWeight: 700 }}>
            {label}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {dates.map((date) => {
          const locked = lockedByDate.get(date);
          // A locked row's own `isUnavailable` (from the retired single-day
          // "unavailable" checkbox) displays the same as no shift set --
          // both mean "not working that day" (Founder simplification,
          // 2026-08-24), so there is no separate visual state for it.
          const value = locked ? (locked.isUnavailable ? null : locked.shiftTypeId) : (selections[date] ?? null);
          const tone = cellTone(value);
          const dayNumber = Number(date.slice(-2));
          return (
            <button
              key={date}
              type="button"
              onClick={() => cyclePreference(date)}
              disabled={Boolean(locked)}
              style={{ ...cellBase, background: tone.background, color: tone.color, cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.85 : 1 }}
            >
              <span style={{ fontWeight: 600 }}>{dayNumber}</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{optionLabel(value)}</span>
            </button>
          );
        })}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 12, color: colors.textMuted }}>
        {lang === 'ja' ? '日付をタップして希望するシフトを選択してください。' : 'Tap a date to choose your preferred shift.'}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 11.5, color: colors.textMuted }}>
        {lang === 'ja'
          ? '色の付いた日はすでに提出済みで変更できません。'
          : 'Colored, non-tappable days already have a submitted preference and can no longer be changed here.'}
      </p>

      <div style={{ marginTop: 14 }}>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{lang === 'ja' ? 'メッセージ（任意）' : 'Message (optional)'}</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder={lang === 'ja' ? '例: 10日は終日休み希望です。' : 'e.g. I would like the 10th off all day.'}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>
      </div>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('preferenceHelpTitle')} closeLabel={lang === 'ja' ? '閉じる' : 'Close'} width="min(480px, 94vw)">
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{t('preferenceHelpBody')}</p>
      </Modal>
    </Modal>
  );
}
