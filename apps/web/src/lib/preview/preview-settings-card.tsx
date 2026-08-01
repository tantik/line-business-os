'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import { buttonPrimary, card, demoColors, input, mutedText, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_SETTINGS } from '@/lib/demo/cafe/helpContent';
import { WEEKDAY_LABELS_EN_MON_FIRST, WEEKDAY_LABELS_MON_FIRST } from '@/lib/demo/cafe/format';
import { previewSaveScheduleSettings, previewSetShiftTypeActive, previewUpsertShiftType } from './actions/settings-actions';
import { previewWriteMessage } from './write-result';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

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
  settings: WorkforceScheduleSettings | null;
}

const smallButton = { padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer' } as const;

export function PreviewSettingsCard({ shiftTypes, settings }: PreviewSettingsCardProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const weekdayLabels = lang === 'en' ? WEEKDAY_LABELS_EN_MON_FIRST : WEEKDAY_LABELS_MON_FIRST;
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
  const activeShiftTypes = shiftTypes?.filter((shiftType) => shiftType.isActive) ?? null;

  function saveSettings() {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewSaveScheduleSettings({
        requiredHeadcountByWeekday: requirements,
        maxMonthlyHours: maxHours,
      });
      setFeedback(
        result.status === 'success'
          ? { ok: true, text: t('saved') }
          : { ok: false, text: previewWriteMessage(lang, result.status) },
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
        setFeedback({ ok: true, text: t('saved') });
        router.refresh();
      } else {
        setFeedback({ ok: false, text: previewWriteMessage(lang, result.status) });
      }
    });
  }

  function deactivateShiftType(shiftTypeId: string) {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewSetShiftTypeActive({ shiftTypeId, isActive: false });
      if (result.status === 'success') {
        setFeedback({ ok: true, text: t('saved') });
        router.refresh();
      }
      else setFeedback({ ok: false, text: previewWriteMessage(lang, result.status) });
    });
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ fontSize: 16 }}>{t('settingsCardTitle')}</strong>
        <DemoHelpButton content={HELP_MANAGER_SETTINGS} />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: demoColors.textMuted, marginBottom: 8 }}>{t('requiredHeadcountHeading')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
          {weekdayLabels.map((label, weekday) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: demoColors.textMuted, marginBottom: 4 }}>{label}</div>
              <input
                aria-label={`${label}${t('weekdayAriaSuffix')}`}
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
        <label style={{ fontSize: 13, color: demoColors.textMuted }}>{t('maxWorkHoursLabel')}</label>
        <input
          aria-label={t('maxWorkHoursLabel')}
          type="number"
          min={0}
          max={744}
          value={maxHours}
          onChange={(event) => setMaxHours(Number(event.currentTarget.value))}
          style={{ ...input, display: 'block', maxWidth: 140 }}
        />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: demoColors.textMuted, marginBottom: 8 }}>{t('shiftTypesHeading')}</div>
        {activeShiftTypes === null ? (
          <p style={{ margin: 0, ...mutedText }}>{t('shiftTypesLoadError')}</p>
        ) : activeShiftTypes.length === 0 ? (
          <p style={{ margin: 0, ...mutedText }}>{t('shiftTypesEmpty')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {activeShiftTypes.map((st) => {
              const chip = shiftChipColors(st.shiftTypeId, activeShiftTypes.map((s) => s.shiftTypeId));
              const label = st.labelJa || st.labelEn || st.code;
              if (editingId === st.shiftTypeId) {
                return (
                  <div key={st.shiftTypeId} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '8px 10px', borderRadius: 8, background: demoColors.surfaceElevated }}>
                    <label style={{ fontSize: 11, color: demoColors.textMuted }}>
                      {t('nameLabel')}
                      <input value={editLabel} onChange={(event) => setEditLabel(event.currentTarget.value)} style={{ ...input, width: 110 }} />
                    </label>
                    <label style={{ fontSize: 11, color: demoColors.textMuted }}>
                      {t('startTimeLabel')}
                      <input type="time" value={editStart} onChange={(event) => setEditStart(event.currentTarget.value)} style={{ ...input, width: 100 }} />
                    </label>
                    <label style={{ fontSize: 11, color: demoColors.textMuted }}>
                      {t('endTimeLabel')}
                      <input type="time" value={editEnd} onChange={(event) => setEditEnd(event.currentTarget.value)} style={{ ...input, width: 100 }} />
                    </label>
                    <button type="button" style={{ ...smallButton, border: 'none', background: demoColors.accent, color: '#fff' }} onClick={() => saveShiftType({ shiftTypeId: st.shiftTypeId, labelJa: editLabel, startsAtLocal: editStart, endsAtLocal: editEnd })}>
                      {t('save')}
                    </button>
                    <button type="button" style={{ ...smallButton, border: `1px solid ${demoColors.border}`, background: demoColors.surface }} onClick={() => setEditingId(null)}>
                      {t('cancel')}
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
                      {t('edit')}
                    </button>
                    <button type="button" disabled={isPending} style={{ ...smallButton, border: `1px solid ${demoColors.border}`, background: demoColors.surface, color: demoColors.dangerText, cursor: isPending ? 'wait' : 'pointer' }} onClick={() => deactivateShiftType(st.shiftTypeId)}>
                      {t('deleteButton')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, color: demoColors.textMuted }}>
            {t('optionalNameLabel')}
            <input value={newLabel} onChange={(event) => setNewLabel(event.currentTarget.value)} style={{ ...input, width: 120 }} />
          </label>
          <label style={{ fontSize: 12, color: demoColors.textMuted }}>
            {t('startTimeLabel')}
            <input type="time" value={newStart} onChange={(event) => setNewStart(event.currentTarget.value)} style={{ ...input, width: 110 }} />
          </label>
          <label style={{ fontSize: 12, color: demoColors.textMuted }}>
            {t('endTimeLabel')}
            <input type="time" value={newEnd} onChange={(event) => setNewEnd(event.currentTarget.value)} style={{ ...input, width: 110 }} />
          </label>
          <button type="button" style={buttonPrimary} onClick={() => saveShiftType({ labelJa: newLabel || `${newStart}-${newEnd}`, startsAtLocal: newStart, endsAtLocal: newEnd })} disabled={isPending}>
            {t('addShiftType')}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <button type="button" style={buttonPrimary} onClick={saveSettings} disabled={isPending}>
          {t('saveSettings')}
        </button>
        {feedback ? <span style={{ fontSize: 12, color: feedback.ok ? demoColors.accent : demoColors.dangerText }}>{feedback.text}</span> : null}
      </div>
    </section>
  );
}
