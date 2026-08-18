'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import { saveScheduleSettings, setShiftTypeActive, upsertShiftType } from '@/lib/workforce/schedule-settings-actions';
import { WEEKDAY_LABELS_EN_MON_FIRST, WEEKDAY_LABELS_MON_FIRST } from '@/lib/demo/cafe/format';
import { buttonPrimary, buttonSecondary, card, input, mutedText } from '@/lib/ui/theme';
import { shiftChipColors, shiftChipStyle } from '../_ui/workforce-theme';
import { Modal, ConfirmDialog } from '@/components/shared/design-kit';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { tManagerDashboard } from './manager-dashboard-i18n';

export interface SettingsSectionProps {
  locationId: string;
  settings: WorkforceScheduleSettings | null;
  shiftTypes: WorkforceShiftType[] | null;
  onShiftTypesChanged: () => void;
  lang: Lang;
}

const smallButton = { padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer' } as const;

/**
 * Manager dashboard Settings section (WP A8), ported from the proven
 * `preview-settings-card.tsx` autosave/CRUD pattern (this mission's Surface
 * A reference) onto the canonical service layer
 * (`schedule-settings-actions.ts`) instead of the preview action stubs.
 * Per-weekday staffing requirements + max monthly hours already had full
 * schema/read/write support (`schedule-settings.ts`) -- no migration needed.
 * Shift-type "color uniqueness" (the plan's original ask) is handled by
 * `shiftChipColors`' position-based tone assignment (workforce-theme.ts),
 * not a stored color field or a save-time rejection -- there is no editable
 * "color" concept on `workforce.shift_types` today, and a manager has no
 * control over the server-generated `shiftTypeId` a color would key off of
 * to make a save-time rejection actionable. Duplicate-*name* rejection
 * (also in the plan) IS enforced server-side, in `upsertWorkforceShiftType`.
 */
export function SettingsSection({ locationId, settings, shiftTypes: initialShiftTypes, onShiftTypesChanged, lang }: SettingsSectionProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const weekdayLabels = lang === 'en' ? WEEKDAY_LABELS_EN_MON_FIRST : WEEKDAY_LABELS_MON_FIRST;

  const [shiftTypes, setShiftTypes] = useState(initialShiftTypes);
  const [requirements, setRequirements] = useState(settings?.requiredHeadcountByWeekday ?? [1, 1, 1, 1, 1, 1, 1]);
  const [maxHours, setMaxHours] = useState(settings?.maxMonthlyHours ?? 160);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newStart, setNewStart] = useState('10:00');
  const [newEnd, setNewEnd] = useState('14:00');
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => setShiftTypes(initialShiftTypes), [initialShiftTypes]);

  const activeShiftTypes = shiftTypes?.filter((st) => st.isActive) ?? null;
  const inactiveShiftTypes = shiftTypes?.filter((st) => !st.isActive) ?? null;
  const activeShiftTypeIds = (activeShiftTypes ?? []).map((st) => st.shiftTypeId);
  const confirmDeactivateTarget = confirmDeactivateId ? (activeShiftTypes ?? []).find((st) => st.shiftTypeId === confirmDeactivateId) ?? null : null;

  const latestRef = useRef({ requirements, maxHours });
  const lastConfirmedRef = useRef({ requirements, maxHours });
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const dirtyWhileSavingRef = useRef(false);
  const savedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestRef.current = { requirements, maxHours };
  }, [requirements, maxHours]);

  useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
    },
    [],
  );

  function runAutosave() {
    if (savingRef.current) {
      dirtyWhileSavingRef.current = true;
      return;
    }
    savingRef.current = true;
    dirtyWhileSavingRef.current = false;
    setAutosaveStatus('saving');
    const toSave = latestRef.current;
    startTransition(async () => {
      const result = await saveScheduleSettings({ locationId, requiredHeadcountByWeekday: toSave.requirements, maxMonthlyHours: toSave.maxHours });
      savingRef.current = false;
      if (result.status === 'success') {
        lastConfirmedRef.current = toSave;
        setAutosaveStatus('saved');
        if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
        savedResetTimerRef.current = setTimeout(() => setAutosaveStatus('idle'), 2500);
      } else {
        setRequirements(lastConfirmedRef.current.requirements);
        setMaxHours(lastConfirmedRef.current.maxHours);
        setAutosaveStatus('error');
      }
      if (dirtyWhileSavingRef.current) runAutosave();
    });
  }

  function scheduleAutosave() {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(runAutosave, 600);
  }

  function saveShiftType(input: { shiftTypeId?: string; labelJa: string; startsAtLocal: string; endsAtLocal: string }) {
    setFeedback(null);
    startTransition(async () => {
      const result = await upsertShiftType({ ...input, locationId });
      if (result.status === 'success') {
        setEditingId(null);
        setNewLabel('');
        setFeedback({ ok: true, text: t('savedStatus') });
        onShiftTypesChanged();
      } else {
        setFeedback({ ok: false, text: result.status === 'duplicate' ? t('duplicateShiftTypeName') : t('saveErrorStatus') });
      }
    });
  }

  function setActive(shiftTypeId: string, isActive: boolean) {
    setFeedback(null);
    startTransition(async () => {
      const result = await setShiftTypeActive({ shiftTypeId, isActive, locationId });
      if (result.status === 'success') {
        if (!isActive) setConfirmDeactivateId(null);
        setFeedback({ ok: true, text: t('savedStatus') });
        onShiftTypesChanged();
      } else {
        setFeedback({ ok: false, text: t('saveErrorStatus') });
      }
    });
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('settingsCardTitle')}</h2>
        <button
          type="button"
          aria-label={t('settingsCardTitle')}
          onClick={() => setHelpOpen(true)}
          style={{ width: 24, height: 24, borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13 }}
        >
          ?
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, ...mutedText, marginBottom: 8 }}>{t('requiredHeadcountHeading')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
          {weekdayLabels.map((label, weekday) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, ...mutedText, marginBottom: 4 }}>{label}</div>
              <input
                aria-label={`${label}${t('weekdayAriaSuffix')}`}
                type="number"
                min={0}
                max={100}
                value={requirements[weekday] ?? 0}
                onChange={(event) => {
                  const parsed = Number(event.currentTarget.value);
                  setRequirements((current) => current.map((value, index) => (index === weekday ? parsed : value)));
                  scheduleAutosave();
                }}
                style={{ ...input, textAlign: 'center', padding: '6px 4px', marginTop: 0 }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={{ fontSize: 13, ...mutedText }}>{t('maxWorkHoursLabel')}</label>
        <input
          aria-label={t('maxWorkHoursLabel')}
          type="number"
          min={0}
          max={744}
          value={maxHours}
          onChange={(event) => {
            setMaxHours(Number(event.currentTarget.value));
            scheduleAutosave();
          }}
          style={{ ...input, display: 'block', maxWidth: 140 }}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, ...mutedText, marginBottom: 8 }}>{t('shiftTypesHeading')}</div>
        {activeShiftTypes === null ? (
          <p style={{ margin: 0, ...mutedText }}>{t('shiftTypesUnavailable')}</p>
        ) : activeShiftTypes.length === 0 ? (
          <p style={{ margin: 0, ...mutedText }}>{t('shiftTypesEmpty')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {activeShiftTypes.map((st) => {
              const label = st.labelJa || st.labelEn || st.code;
              if (editingId === st.shiftTypeId) {
                return (
                  <div key={st.shiftTypeId} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '8px 10px', borderRadius: 8 }}>
                    <label style={{ fontSize: 11, ...mutedText }}>
                      {t('nameLabel')}
                      <input value={editLabel} onChange={(event) => setEditLabel(event.currentTarget.value)} style={{ ...input, width: 110 }} />
                    </label>
                    <label style={{ fontSize: 11, ...mutedText }}>
                      {t('startTimeLabel')}
                      <input type="time" value={editStart} onChange={(event) => setEditStart(event.currentTarget.value)} style={{ ...input, width: 100 }} />
                    </label>
                    <label style={{ fontSize: 11, ...mutedText }}>
                      {t('endTimeLabel')}
                      <input type="time" value={editEnd} onChange={(event) => setEditEnd(event.currentTarget.value)} style={{ ...input, width: 100 }} />
                    </label>
                    <button
                      type="button"
                      style={buttonPrimary}
                      disabled={isPending}
                      onClick={() => saveShiftType({ shiftTypeId: st.shiftTypeId, labelJa: editLabel, startsAtLocal: editStart, endsAtLocal: editEnd })}
                    >
                      {t('save')}
                    </button>
                    <button type="button" style={buttonSecondary} onClick={() => setEditingId(null)}>
                      {t('cancel')}
                    </button>
                  </div>
                );
              }
              return (
                <div key={st.shiftTypeId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderRadius: 8 }}>
                  <span style={shiftChipStyle(shiftChipColors(st.shiftTypeId, activeShiftTypeIds))}>
                    {label} ({st.startsAtLocal}-{st.endsAtLocal})
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      style={{ ...smallButton, border: 'none', background: 'transparent', cursor: 'pointer' }}
                      onClick={() => {
                        setEditingId(st.shiftTypeId);
                        setEditLabel(label);
                        setEditStart(st.startsAtLocal.slice(0, 5));
                        setEditEnd(st.endsAtLocal.slice(0, 5));
                      }}
                    >
                      {t('edit')}
                    </button>
                    <button type="button" disabled={isPending} style={{ ...smallButton, border: 'none', background: 'transparent', cursor: isPending ? 'wait' : 'pointer' }} onClick={() => setConfirmDeactivateId(st.shiftTypeId)}>
                      {t('deactivateShiftTypeButton')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, ...mutedText }}>
            {t('optionalNameLabel')}
            <input value={newLabel} onChange={(event) => setNewLabel(event.currentTarget.value)} style={{ ...input, width: 120 }} />
          </label>
          <label style={{ fontSize: 12, ...mutedText }}>
            {t('startTimeLabel')}
            <input type="time" value={newStart} onChange={(event) => setNewStart(event.currentTarget.value)} style={{ ...input, width: 110 }} />
          </label>
          <label style={{ fontSize: 12, ...mutedText }}>
            {t('endTimeLabel')}
            <input type="time" value={newEnd} onChange={(event) => setNewEnd(event.currentTarget.value)} style={{ ...input, width: 110 }} />
          </label>
          <button
            type="button"
            style={buttonPrimary}
            disabled={isPending}
            onClick={() => saveShiftType({ labelJa: newLabel || `${newStart}-${newEnd}`, startsAtLocal: newStart, endsAtLocal: newEnd })}
          >
            {t('addShiftType')}
          </button>
        </div>

        <button type="button" style={{ ...smallButton, marginTop: 12, border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => setShowInactive((value) => !value)}>
          {showInactive ? t('hideDeactivatedShiftTypes') : t('showDeactivatedShiftTypes')}
        </button>

        {showInactive ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, ...mutedText, marginBottom: 8 }}>{t('deactivatedShiftTypesHeading')}</div>
            {inactiveShiftTypes === null || inactiveShiftTypes.length === 0 ? (
              <p style={{ margin: 0, ...mutedText }}>{t('deactivatedShiftTypesEmpty')}</p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {inactiveShiftTypes.map((st) => {
                  const label = st.labelJa || st.labelEn || st.code;
                  return (
                    <div key={st.shiftTypeId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderRadius: 8, opacity: 0.7 }}>
                      <span>
                        {label} ({st.startsAtLocal}-{st.endsAtLocal})
                      </span>
                      <button type="button" disabled={isPending} style={{ ...smallButton, border: 'none', background: 'transparent', cursor: isPending ? 'wait' : 'pointer' }} onClick={() => setActive(st.shiftTypeId, true)}>
                        {t('reactivate')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDeactivateId !== null}
        title={t('confirmDeactivateShiftTypeTitle')}
        confirmLabel={t('deactivateShiftTypeButton')}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger
        onCancel={() => setConfirmDeactivateId(null)}
        onConfirm={() => {
          if (confirmDeactivateId) setActive(confirmDeactivateId, false);
        }}
      >
        {confirmDeactivateTarget ? (
          <>
            <p style={{ margin: 0 }}>
              {confirmDeactivateTarget.labelJa || confirmDeactivateTarget.labelEn || confirmDeactivateTarget.code} ({confirmDeactivateTarget.startsAtLocal}-{confirmDeactivateTarget.endsAtLocal})
            </p>
            <p style={{ margin: '8px 0 0' }}>{t('confirmDeactivateShiftTypeBody')}</p>
          </>
        ) : null}
      </ConfirmDialog>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('settingsCardTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('settingsHelpBody')}</div>
      </Modal>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        {autosaveStatus === 'saving' ? (
          <span style={{ fontSize: 12, ...mutedText }}>{t('savingStatus')}</span>
        ) : autosaveStatus === 'saved' ? (
          <span style={{ fontSize: 12 }}>{t('savedStatus')}</span>
        ) : autosaveStatus === 'error' ? (
          <span style={{ fontSize: 12, color: 'crimson' }}>{t('saveErrorStatus')}</span>
        ) : null}
        {feedback ? <span style={{ fontSize: 12, color: feedback.ok ? undefined : 'crimson' }}>{feedback.text}</span> : null}
      </div>
    </section>
  );
}
