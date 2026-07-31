'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Modal } from './Modal';
import { SHIFT_TYPES } from '@/lib/demo/cafe/data';
import { addDays, toISODate, weekdayIndexMonFirst, WEEKDAY_LABELS_MON_FIRST } from '@/lib/demo/cafe/format';
import { buttonPrimary, buttonSecondary, demoColors, input, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

interface ShiftPreferenceModalProps {
  open: boolean;
  onClose: () => void;
  alreadySubmitted: boolean;
  onSubmit: (selections: Record<string, string | null>, note: string) => void;
}

/** Cycle order for tap-to-select: 未指定 (-) first, then the current shift-type settings (1 / 2 / 3 / 通 / 休暇). */
const PREFERENCE_OPTION_IDS: Array<string | null> = [null, ...SHIFT_TYPES.map((type) => type.id)];

function optionLabel(id: string | null): string {
  if (id === null) return '-';
  return SHIFT_TYPES.find((type) => type.id === id)?.label ?? '-';
}

function nextMonthDates(today: Date): string[] {
  const year = today.getFullYear();
  const month = today.getMonth();
  const nextMonthFirst = new Date(year, month + 1, 1);
  const daysInNextMonth = new Date(year, month + 2, 0).getDate();
  return Array.from({ length: daysInNextMonth }, (_, i) => toISODate(addDays(nextMonthFirst, i)));
}

const cellBase: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  minHeight: 44,
  borderRadius: 8,
  border: `1px solid ${demoColors.border}`,
  cursor: 'pointer',
  fontSize: 11.5,
};

/** 来月のシフト希望を提出: tap-to-cycle next-month calendar, demo-only (no scheduling backend). */
export function ShiftPreferenceModal({ open, onClose, alreadySubmitted, onSubmit }: ShiftPreferenceModalProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);
  const dates = useMemo(() => nextMonthDates(new Date()), []);
  const leadingBlanks = dates.length > 0 ? weekdayIndexMonFirst(new Date(`${dates[0]}T00:00:00`)) : 0;
  const monthLabel = dates.length > 0 ? new Date(`${dates[0]}T00:00:00`).getMonth() + 1 : null;

  const [selections, setSelections] = useState<Record<string, string | null>>({});
  const [note, setNote] = useState('');

  function cyclePreference(date: string) {
    const current = selections[date] ?? null;
    const currentIndex = PREFERENCE_OPTION_IDS.indexOf(current);
    const next = PREFERENCE_OPTION_IDS[(currentIndex + 1) % PREFERENCE_OPTION_IDS.length]!;
    setSelections((prev) => ({ ...prev, [date]: next }));
  }

  function handleSubmit() {
    onSubmit(selections, note);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t('preferenceModalTitle')} maxWidth={480}>
      {alreadySubmitted ? (
        <p style={{ fontSize: 12.5, color: demoColors.accent, marginTop: 0 }}>{t('alreadySubmittedNote')}</p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 10 }}>
        {PREFERENCE_OPTION_IDS.map((id) => {
          const chip = shiftChipColors(id, PREFERENCE_OPTION_IDS.filter((optionId): optionId is string => optionId !== null));
          const type = SHIFT_TYPES.find((t) => t.id === id);
          const timeLabel = type?.isTimeOff
            ? lang === 'ja'
              ? '休暇'
              : 'Time off'
            : type?.startTime && type?.endTime
              ? `${type.startTime}-${type.endTime}`
              : t('unspecified');
          return (
            <div key={id ?? 'none'} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={shiftChipStyle(chip.background, chip.color, true)}>{optionLabel(id)}</span>
              <span style={{ fontSize: 10.5, color: demoColors.textMuted }}>{timeLabel}</span>
            </div>
          );
        })}
      </div>

      {monthLabel ? (
        <div style={{ fontSize: 13, fontWeight: 700, color: demoColors.textPrimary, marginBottom: 6 }}>{monthLabel}月</div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {WEEKDAY_LABELS_MON_FIRST.map((label) => (
          <div key={label} style={{ textAlign: 'center', fontSize: 11, color: demoColors.textMuted, fontWeight: 700 }}>
            {label}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {dates.map((date) => {
          const value = selections[date] ?? null;
          const chip = shiftChipColors(value, PREFERENCE_OPTION_IDS.filter((optionId): optionId is string => optionId !== null));
          const dayNumber = Number(date.slice(-2));
          return (
            <button
              key={date}
              type="button"
              onClick={() => cyclePreference(date)}
              style={{ ...cellBase, background: chip.background, color: chip.color }}
            >
              <span style={{ fontWeight: 600 }}>{dayNumber}</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{optionLabel(value)}</span>
            </button>
          );
        })}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 12, color: demoColors.textMuted }}>{t('tapToSelectHelp')}</p>
      <p style={{ margin: '4px 0 0', fontSize: 11.5, color: demoColors.textMuted }}>{t('dashOrTimeOffHelp')}</p>

      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 13, color: demoColors.textMuted }}>{t('optionalMessage')}</label>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder={t('optionalNotePlaceholder')}
          style={{ ...input, resize: 'vertical' }}
        />
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" style={buttonSecondary} onClick={onClose}>
          {t('cancel')}
        </button>
        <button type="button" style={buttonPrimary} onClick={handleSubmit}>
          {t('submitPreference')}
        </button>
      </div>
    </Modal>
  );
}
