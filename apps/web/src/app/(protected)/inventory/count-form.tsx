'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { recordInventoryStockCountAction } from '@/lib/inventory/count-actions';
import { colors, mutedText } from '@/lib/ui/theme';
import { describeInventoryWriteError } from './error-copy';
import { tInventoryDashboard } from './inventory-i18n';

export interface CountFormProps {
  locationId: string;
  itemId: string;
  itemName: string;
  unit: string;
  /** Last confirmed actual quantity, used to prefill the input so a manager sees the current count instead of a blank box. */
  initialValue: number | null;
  lang: Lang;
  onSuccess: () => void;
}

/**
 * Staff + manager stock-count entry: the user types the final counted (or
 * just-purchased total) actual quantity -- not a delta -- matching the
 * brief's "type the ending total, not what changed" MVP semantics.
 *
 * WP-7 (Cafe Manager UI/UX Parity mission): autosave-on-input, debounced
 * 600ms, replacing the old explicit "Save count" button -- same
 * debounce/status-indicator convention `settings-section.tsx`'s autosave
 * already established (dirty-while-saving re-queues, revert to last
 * confirmed value on a failed save). 2026-08-21 Inventory redesign: also
 * saves immediately on Enter (no need to wait out the debounce), shows a
 * unit suffix + clear ("×") affordance inline, and prefills the last
 * confirmed value instead of starting blank.
 */
export function CountForm({ locationId, itemId, itemName, unit, initialValue, lang, onSuccess }: CountFormProps) {
  const [quantity, setQuantity] = useState(initialValue === null ? '' : String(initialValue));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof tInventoryDashboard>[1]) => tInventoryDashboard(lang, key);

  const latestRef = useRef(quantity);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const dirtyWhileSavingRef = useRef(false);
  const savedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestRef.current = quantity;
  }, [quantity]);

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
    const toSave = latestRef.current;
    if (toSave.trim() === '') return;
    savingRef.current = true;
    dirtyWhileSavingRef.current = false;
    setStatus('saving');
    setError(null);
    const formData = new FormData();
    formData.set('locationId', locationId);
    formData.set('itemId', itemId);
    formData.set('actualQuantity', toSave);
    recordInventoryStockCountAction(formData).then((result) => {
      savingRef.current = false;
      if (result.status === 'success') {
        setStatus('saved');
        onSuccess();
        if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
        savedResetTimerRef.current = setTimeout(() => setStatus('idle'), 2500);
      } else {
        setStatus('error');
        setError(describeInventoryWriteError(result));
      }
      if (dirtyWhileSavingRef.current) runAutosave();
    });
  }

  function handleChange(value: string) {
    setQuantity(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(runAutosave, 600);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    runAutosave();
  }

  const statusText = status === 'saving' ? t('savingStatus') : status === 'saved' ? t('savedStatus') : status === 'error' ? t('saveErrorStatus') : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 'fit-content', minWidth: 140 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          background: colors.surface,
          overflow: 'hidden',
        }}
      >
        <input
          style={{
            width: 90,
            border: 'none',
            outline: 'none',
            padding: '8px 8px 8px 10px',
            fontSize: 14,
            color: colors.textPrimary,
            background: 'transparent',
          }}
          type="number"
          min={0}
          step="0.001"
          autoComplete="off"
          aria-label={`${t('actualQuantityLabel')} — ${itemName}`}
          value={quantity}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {quantity !== '' ? (
          <button
            type="button"
            aria-label={t('clearActualQuantityAriaLabel')}
            onClick={() => handleChange('')}
            style={{
              border: 'none',
              background: 'transparent',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: '0 6px',
              fontSize: 13,
              alignSelf: 'stretch',
            }}
          >
            ×
          </button>
        ) : null}
        <span style={{ ...mutedText, fontSize: 12, padding: '0 10px 0 4px', whiteSpace: 'nowrap' }}>{unit}</span>
      </div>
      <span style={{ ...mutedText, fontSize: 11, minHeight: 14, color: status === 'error' ? colors.dangerText : colors.textMuted }}>
        {statusText || t('pressEnterToSaveHint')}
      </span>
      {error ? <span style={{ fontSize: 11, color: colors.dangerText }}>{error}</span> : null}
    </div>
  );
}
