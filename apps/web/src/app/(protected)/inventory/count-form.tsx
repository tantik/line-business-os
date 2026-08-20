'use client';

import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { recordInventoryStockCountAction } from '@/lib/inventory/count-actions';
import { alertDanger, input, mutedText } from '@/lib/ui/theme';
import { describeInventoryWriteError } from './error-copy';
import { tInventoryDashboard } from './inventory-i18n';

export interface CountFormProps {
  locationId: string;
  itemId: string;
  unit: string;
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
 * confirmed value on a failed save).
 */
export function CountForm({ locationId, itemId, unit, lang, onSuccess }: CountFormProps) {
  const [quantity, setQuantity] = useState('');
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

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 8 }}>
      <label style={{ flex: 1, maxWidth: 160 }}>
        <span style={{ ...mutedText, fontSize: 12 }}>
          {t('actualQuantityLabel')} ({unit})
        </span>
        <input
          style={input}
          type="number"
          min={0}
          step="0.001"
          autoComplete="off"
          value={quantity}
          onChange={(event) => handleChange(event.target.value)}
        />
      </label>
      <span style={{ ...mutedText, fontSize: 12, minWidth: 60 }}>
        {status === 'saving' ? t('savingStatus') : status === 'saved' ? t('savedStatus') : status === 'error' ? t('saveErrorStatus') : ''}
      </span>
      {error ? <div style={{ ...alertDanger, marginLeft: 8 }}>{error}</div> : null}
    </div>
  );
}
