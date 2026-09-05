'use client';

import { useEffect, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { OperationsSchedule, OperationsRecurrenceKind } from '@/lib/operations/schedules';
import { createSchedule, reviseSchedule } from '@/lib/operations/schedules-actions';
import { PendingOverlay } from '@/components/ui/loading';
import { checkboxLabel, checkboxInput, input, mutedText } from '@/lib/ui/theme';
import { describeOperationsWriteError } from './error-copy';
import { tOperations } from './operations-i18n';

const WEEKDAY_OPTIONS: { value: number; labelKey: 'weekdayMon' | 'weekdayTue' | 'weekdayWed' | 'weekdayThu' | 'weekdayFri' | 'weekdaySat' | 'weekdaySun' }[] = [
  { value: 1, labelKey: 'weekdayMon' },
  { value: 2, labelKey: 'weekdayTue' },
  { value: 3, labelKey: 'weekdayWed' },
  { value: 4, labelKey: 'weekdayThu' },
  { value: 5, labelKey: 'weekdayFri' },
  { value: 6, labelKey: 'weekdaySat' },
  { value: 7, labelKey: 'weekdaySun' },
];

export interface ScheduleFormProps {
  /** `create`: a brand-new schedule for `templateId` at `locationId`. `revise`: a new future-dated version of `schedule` (recurrence/timing change from a future date -- `api.operations_revise_schedule`, 0102). */
  mode: 'create' | 'revise';
  locationId: string;
  templateId: string;
  /** Required for `revise`; ignored for `create`. */
  schedule?: OperationsSchedule;
  formId: string;
  lang: Lang;
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
  onErrorChange?: (error: string | null) => void;
}

/**
 * Create/revise form for one Operations task schedule (Cafe v2.2 WP1
 * Operations, second UI slice -- "apply a template to a location with a
 * simple recurrence"). `recurrenceKind` drives whether the weekday
 * multi-select is shown, matching the DB CHECK constraints
 * (`operations_task_schedules_weekdays_chk` / `_daily_chk`, 0101) rather than
 * trying to replicate their exact logic beyond "show the right fields".
 */
export function ScheduleForm({ mode, locationId, templateId, schedule, formId, lang, onSuccess, onPendingChange, onErrorChange }: ScheduleFormProps) {
  const t = (key: Parameters<typeof tOperations>[1]) => tOperations(lang, key);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recurrenceKind, setRecurrenceKind] = useState<OperationsRecurrenceKind>(schedule?.recurrenceKind ?? 'daily');
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set(schedule?.weekdays ?? []));

  useEffect(() => onPendingChange?.(isPending), [isPending, onPendingChange]);
  useEffect(() => onErrorChange?.(error), [error, onErrorChange]);

  function toggleWeekday(value: number) {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set('recurrenceKind', recurrenceKind);
    if (recurrenceKind === 'weekdays') {
      for (const day of weekdays) formData.append('weekdays', String(day));
    }

    startTransition(async () => {
      let result;
      if (mode === 'create') {
        formData.set('locationId', locationId);
        formData.set('templateId', templateId);
        result = await createSchedule(formData);
      } else if (schedule) {
        formData.set('scheduleId', schedule.scheduleId);
        result = await reviseSchedule(formData);
      } else {
        return;
      }
      if (result.status !== 'success') {
        setError(describeOperationsWriteError(result, lang));
        return;
      }
      onSuccess();
    });
  }

  return (
    <form id={formId} onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PendingOverlay visible={isPending} message={t('formSaving')} />

      <div>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('scheduleRecurrenceLabel')}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          <label style={checkboxLabel}>
            <input type="radio" name="recurrenceKindRadio" checked={recurrenceKind === 'daily'} onChange={() => setRecurrenceKind('daily')} />
            {t('recurrenceDaily')}
          </label>
          <label style={checkboxLabel}>
            <input type="radio" name="recurrenceKindRadio" checked={recurrenceKind === 'weekdays'} onChange={() => setRecurrenceKind('weekdays')} />
            {t('recurrenceWeekdays')}
          </label>
        </div>
      </div>

      {recurrenceKind === 'weekdays' ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {WEEKDAY_OPTIONS.map((option) => (
            <label key={option.value} style={checkboxLabel}>
              <input style={checkboxInput} type="checkbox" checked={weekdays.has(option.value)} onChange={() => toggleWeekday(option.value)} />
              {t(option.labelKey)}
            </label>
          ))}
        </div>
      ) : null}

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('dueTimeLabel')}</span>
        <input style={input} type="time" name="dueTime" defaultValue={schedule?.dueTime?.slice(0, 5) ?? ''} required={mode === 'create'} />
      </label>

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('windowEndTimeLabel')}</span>
        <input style={input} type="time" name="windowEndTime" defaultValue={schedule?.windowEndTime?.slice(0, 5) ?? ''} />
      </label>

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{mode === 'create' ? t('effectiveFromLabel') : t('effectiveFromRevisionLabel')}</span>
        <input style={input} type="date" name="effectiveFrom" />
        <span style={{ ...mutedText, fontSize: 12, display: 'block', marginTop: 4 }}>
          {mode === 'create' ? t('effectiveFromHintCreate') : t('effectiveFromHintRevise')}
        </span>
      </label>
    </form>
  );
}
