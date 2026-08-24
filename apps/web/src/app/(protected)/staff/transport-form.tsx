'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { submitWorkReport } from '@/lib/workforce/attendance-actions';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { card, colors, input } from '@/lib/ui/theme';
import { tStaffDashboard } from './staff-dashboard-i18n';

export interface TransportFormProps {
  workDate: string;
  defaultTransportationCost: number | null;
  lang: Lang;
  onSuccess: () => void;
}

/**
 * Today's transportation cost, on its own (Founder direction, 2026-08-24:
 * split out from the daily message -- different entities). Autosaves on
 * input (debounced) and on blur, same convention as Inventory's `CountForm`
 * -- "as soon as you type it, it's saved and visible to your manager", no
 * separate Save button. Submits through the canonical `submitWorkReport`
 * action with only `workDate` + `transportationCost` in the FormData (no
 * `dailyMessage` key at all), which the action now treats as "leave the
 * message unchanged" rather than clearing it (see `attendance-actions.ts`).
 */
export function TransportForm({ workDate, defaultTransportationCost, lang, onSuccess }: TransportFormProps) {
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);
  const [value, setValue] = useState(defaultTransportationCost === null ? '' : String(defaultTransportationCost));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [helpOpen, setHelpOpen] = useState(false);

  const latestRef = useRef(value);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const dirtyWhileSavingRef = useRef(false);
  const savedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestRef.current = value;
  }, [value]);

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
    setStatus('saving');
    const formData = new FormData();
    formData.set('workDate', workDate);
    formData.set('transportationCost', latestRef.current);
    submitWorkReport(formData).then((result) => {
      savingRef.current = false;
      if (result.status === 'success') {
        setStatus('saved');
        onSuccess();
        if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
        savedResetTimerRef.current = setTimeout(() => setStatus('idle'), 2500);
      } else {
        setStatus('error');
      }
      if (dirtyWhileSavingRef.current) runAutosave();
    });
  }

  function handleChange(next: string) {
    setValue(next);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(runAutosave, 600);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    runAutosave();
  }

  function handleBlur() {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    runAutosave();
  }

  const statusText = status === 'saving' ? t('savingStatus') : status === 'saved' ? t('savedStatus') : status === 'error' ? t('saveErrorStatus') : '';

  return (
    <section style={{ ...card, marginTop: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t('transportationCostLabel')}</h2>
          <HelpIconButton ariaLabel={t('transportHelpAriaLabel')} onClick={() => setHelpOpen(true)} />
        </div>
        <span style={{ fontSize: 12, minHeight: 14, color: status === 'error' ? colors.dangerText : colors.textMuted }}>{statusText}</span>
      </div>
      <input
        style={{ ...input, maxWidth: 240 }}
        type="number"
        min={0}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={t('transportPlaceholder')}
      />

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('transportationCostLabel')} width="min(420px, 94vw)">
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{t('transportHelpBody')}</p>
      </Modal>
    </section>
  );
}
