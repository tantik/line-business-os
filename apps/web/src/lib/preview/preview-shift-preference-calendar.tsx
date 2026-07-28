'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { previewSubmitShiftPreference } from './actions/staff-schedule-actions';
import { previewWriteMessageJa } from './write-result';
import { buttonPrimary, buttonSecondary, demoColors, input, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';

interface Props { shiftTypes: WorkforceShiftType[] | null; defaultMonthDate: string; onClose: () => void }

function monthDates(monthDate: string): string[] {
  const [year, month] = monthDate.split('-').map(Number);
  const count = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`);
}

export function PreviewShiftPreferenceCalendar({ shiftTypes, defaultMonthDate, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const dates = useMemo(() => monthDates(defaultMonthDate), [defaultMonthDate]);
  const options = [null, ...(shiftTypes ?? []).map((item) => item.shiftTypeId)];
  const [selections, setSelections] = useState<Record<string, string | null>>({});
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const firstWeekday = dates[0] ? (new Date(`${dates[0]}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;

  function cycle(date: string) {
    const current = selections[date] ?? null;
    const next = options[(options.indexOf(current) + 1) % options.length] ?? null;
    setSelections((previous) => ({ ...previous, [date]: next }));
  }

  function submit() {
    const chosen = Object.entries(selections);
    if (chosen.length === 0) return setFeedback('日付をタップして希望シフトを選択してください。');
    startTransition(async () => {
      for (const [workDate, shiftTypeId] of chosen) {
        const data = new FormData();
        data.set('workDate', workDate);
        if (shiftTypeId) data.set('shiftTypeId', shiftTypeId);
        data.set('isUnavailable', 'false');
        if (note) data.set('note', note);
        const result = await previewSubmitShiftPreference(data);
        if (result.status !== 'success' && result.status !== 'duplicate') {
          setFeedback(previewWriteMessageJa(result.status));
          return;
        }
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px', marginBottom: 12 }}>
        <span style={shiftChipStyle(demoColors.surfaceElevated, demoColors.textMuted, true)}>－</span>
        {(shiftTypes ?? []).map((type) => {
          const chip = shiftChipColors(type.shiftTypeId);
          return <span key={type.shiftTypeId} style={shiftChipStyle(chip.background, chip.color, true)}>{type.labelJa} {type.startsAtLocal.slice(0, 5)}-{type.endsAtLocal.slice(0, 5)}</span>;
        })}
      </div>
      <strong>{Number(defaultMonthDate.slice(5, 7))}月</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 8 }}>
        {'月火水木金土日'.split('').map((day) => <div key={day} style={{ textAlign: 'center', fontSize: 11, color: demoColors.textMuted }}>{day}</div>)}
        {Array.from({ length: firstWeekday }).map((_, index) => <div key={`blank-${index}`} />)}
        {dates.map((date) => {
          const value = selections[date] ?? null;
          const type = (shiftTypes ?? []).find((item) => item.shiftTypeId === value);
          const chip = shiftChipColors(value);
          return <button key={date} type="button" onClick={() => cycle(date)} style={{ minWidth: 0, minHeight: 44, padding: '4px 2px', overflow: 'hidden', border: `1px solid ${demoColors.border}`, borderRadius: 8, background: chip.background, color: chip.color, cursor: 'pointer' }}>
            <span style={{ display: 'block', fontWeight: 600 }}>{Number(date.slice(-2))}</span>
            <span style={{ display: 'block', overflow: 'hidden', fontSize: 11, fontWeight: 700, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{type?.labelJa ?? '－'}</span>
          </button>;
        })}
      </div>
      <p style={{ fontSize: 12, color: demoColors.textMuted }}>日付をタップして希望するシフトを選択してください。</p>
      <label style={{ fontSize: 13, color: demoColors.textMuted }}>メッセージ（任意）</label>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="例：10日は終日休み希望です。" style={{ ...input, resize: 'vertical' }} />
      {feedback ? <p style={{ color: demoColors.dangerText }}>{feedback}</p> : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button type="button" style={buttonSecondary} disabled={pending} onClick={onClose}>キャンセル</button>
        <button type="button" style={buttonPrimary} disabled={pending} onClick={submit}>{pending ? '送信中…' : '提出する'}</button>
      </div>
    </>
  );
}
