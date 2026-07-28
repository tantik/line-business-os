'use client';

import { useState, useTransition } from 'react';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import { buttonPrimary, card, demoColors, input, mutedText, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_SETTINGS } from '@/lib/demo/cafe/helpContent';
import { WEEKDAY_LABELS_MON_FIRST } from '@/lib/demo/cafe/format';
import { previewSaveScheduleSettings, previewSetShiftTypeActive, previewUpsertShiftType } from './actions/settings-actions';
import { previewWriteMessageJa } from './write-result';

/**
 * Demo/Preview manager UX parity: 設定 is a single compact card, like the
 * demo's `SettingsPanel`. Preview currently has no Server Action to
 * create/edit shift types or staffing requirements (`lib/preview/actions`
 * has no `shift-type-actions.ts`/settings module), so this renders the same
 * shift-type chip rows as `SettingsPanel`'s non-editing display state - never
 * a fake add/edit/delete control, and never a caveat about what's missing;
 * the row list alone reads as a normal, finished settings summary. Action-free
 * and not a client component, so it carries no Server Action risk.
 */
export interface PreviewSettingsCardProps {
  shiftTypes: WorkforceShiftType[] | null;
  assignments: WorkforceShiftAssignment[] | null;
  settings: WorkforceScheduleSettings | null;
}

const smallButton = { padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer' } as const;

export function PreviewSettingsCard({ shiftTypes, assignments, settings }: PreviewSettingsCardProps) {
  const [requirements, setRequirements] = useState(settings?.requiredHeadcountByWeekday ?? [3, 3, 3, 3, 3, 2, 4]);
  const [maxHours, setMaxHours] = useState(settings?.maxMonthlyHours ?? 160);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newStart, setNewStart] = useState('10:00');
  const [newEnd, setNewEnd] = useState('14:00');

  function saveSettings() {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewSaveScheduleSettings({
        requiredHeadcountByWeekday: requirements,
        maxMonthlyHours: maxHours,
      });
      setFeedback(
        result.status === 'success'
          ? { ok: true, text: '設定を保存しました。' }
          : { ok: false, text: previewWriteMessageJa(result.status) },
      );
    });
  }

  function saveShiftType(input: { shiftTypeId?: string; labelJa: string; startsAtLocal: string; endsAtLocal: string }) {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewUpsertShiftType(input);
      if (result.status === 'success') {
        setEditingId(null);
        setNewLabel('');
        setFeedback({ ok: true, text: 'シフト種別を保存しました。' });
        window.location.reload();
      } else {
        setFeedback({ ok: false, text: previewWriteMessageJa(result.status) });
      }
    });
  }

  function deactivateShiftType(shiftTypeId: string) {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewSetShiftTypeActive({ shiftTypeId, isActive: false });
      if (result.status === 'success') window.location.reload();
      else setFeedback({ ok: false, text: previewWriteMessageJa(result.status) });
    });
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ fontSize: 16 }}>設定</strong>
        <DemoHelpButton content={HELP_MANAGER_SETTINGS} />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: demoColors.textMuted, marginBottom: 8 }}>必要人数（曜日ごと）</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
          {WEEKDAY_LABELS_MON_FIRST.map((label, weekday) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: demoColors.textMuted, marginBottom: 4 }}>{label}</div>
              <input
                aria-label={`${label}曜日の必要人数`}
                type="number"
                min={0}
                max={100}
                value={requirements[weekday] ?? 0}
                onChange={(event) =>
                  setRequirements((current) => current.map((value, index) => (index === weekday ? Number(event.currentTarget.value) : value)))
                }
                style={{ ...input, textAlign: 'center', padding: '6px 4px' }}
              />
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <label style={{ fontSize: 13, color: demoColors.textMuted }}>スタッフ最大勤務時間 / 月</label>
        <input
          aria-label="スタッフ最大勤務時間"
          type="number"
          min={0}
          max={744}
          value={maxHours}
          onChange={(event) => setMaxHours(Number(event.currentTarget.value))}
          style={{ ...input, display: 'block', maxWidth: 140 }}
        />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: demoColors.textMuted, marginBottom: 8 }}>シフト種別</div>
        {shiftTypes === null ? (
          <p style={{ margin: 0, ...mutedText }}>シフト種別を読み込めませんでした。</p>
        ) : shiftTypes.length === 0 ? (
          <p style={{ margin: 0, ...mutedText }}>シフト種別がまだ設定されていません。</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {shiftTypes.map((st) => {
              const chip = shiftChipColors(st.shiftTypeId);
              const label = st.labelJa || st.labelEn || st.code;
              const inUse = (assignments ?? []).some((assignment) => assignment.shiftTypeId === st.shiftTypeId);
              if (editingId === st.shiftTypeId) {
                return (
                  <div key={st.shiftTypeId} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '8px 10px', borderRadius: 8, background: demoColors.surfaceElevated }}>
                    <label style={{ fontSize: 11, color: demoColors.textMuted }}>
                      名称
                      <input value={editLabel} onChange={(event) => setEditLabel(event.currentTarget.value)} style={{ ...input, width: 110 }} />
                    </label>
                    <label style={{ fontSize: 11, color: demoColors.textMuted }}>
                      開始
                      <input type="time" value={editStart} onChange={(event) => setEditStart(event.currentTarget.value)} style={{ ...input, width: 100 }} />
                    </label>
                    <label style={{ fontSize: 11, color: demoColors.textMuted }}>
                      終了
                      <input type="time" value={editEnd} onChange={(event) => setEditEnd(event.currentTarget.value)} style={{ ...input, width: 100 }} />
                    </label>
                    <button type="button" style={{ ...smallButton, border: 'none', background: demoColors.accent, color: '#fff' }} onClick={() => saveShiftType({ shiftTypeId: st.shiftTypeId, labelJa: editLabel, startsAtLocal: editStart, endsAtLocal: editEnd })}>
                      保存
                    </button>
                    <button type="button" style={{ ...smallButton, border: `1px solid ${demoColors.border}`, background: demoColors.surface }} onClick={() => setEditingId(null)}>
                      キャンセル
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={st.shiftTypeId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: demoColors.surfaceElevated,
                  }}
                >
                  <span style={shiftChipStyle(chip.background, chip.color)}>{label} ({st.startsAtLocal}-{st.endsAtLocal})</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      style={{ ...smallButton, border: `1px solid ${demoColors.border}`, background: demoColors.surface }}
                      onClick={() => {
                        setEditingId(st.shiftTypeId);
                        setEditLabel(label);
                        setEditStart(st.startsAtLocal.slice(0, 5));
                        setEditEnd(st.endsAtLocal.slice(0, 5));
                      }}
                    >
                      編集
                    </button>
                    <button type="button" disabled={inUse} style={{ ...smallButton, border: `1px solid ${demoColors.border}`, background: demoColors.surface, color: demoColors.textMuted, cursor: inUse ? 'not-allowed' : 'pointer', opacity: inUse ? 0.6 : 1 }} onClick={() => deactivateShiftType(st.shiftTypeId)}>
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, color: demoColors.textMuted }}>
            名称（任意）
            <input value={newLabel} onChange={(event) => setNewLabel(event.currentTarget.value)} style={{ ...input, width: 120 }} />
          </label>
          <label style={{ fontSize: 12, color: demoColors.textMuted }}>
            開始
            <input type="time" value={newStart} onChange={(event) => setNewStart(event.currentTarget.value)} style={{ ...input, width: 110 }} />
          </label>
          <label style={{ fontSize: 12, color: demoColors.textMuted }}>
            終了
            <input type="time" value={newEnd} onChange={(event) => setNewEnd(event.currentTarget.value)} style={{ ...input, width: 110 }} />
          </label>
          <button type="button" style={buttonPrimary} onClick={() => saveShiftType({ labelJa: newLabel || `${newStart}-${newEnd}`, startsAtLocal: newStart, endsAtLocal: newEnd })} disabled={isPending}>
            シフト種別を追加
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <button type="button" style={buttonPrimary} onClick={saveSettings} disabled={isPending}>
          設定を保存
        </button>
        {feedback ? <span style={{ fontSize: 12, color: feedback.ok ? demoColors.accent : demoColors.dangerText }}>{feedback.text}</span> : null}
      </div>
    </section>
  );
}
