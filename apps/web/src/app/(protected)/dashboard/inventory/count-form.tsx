'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { recordInventoryStockCountAction } from '@/lib/inventory/count-actions';
import { alertDanger, buttonDisabled, buttonPrimary, input, mutedText } from '@/lib/ui/theme';
import { describeInventoryWriteError } from './error-copy';

export interface CountFormProps {
  locationId: string;
  itemId: string;
  unit: string;
  onSuccess: () => void;
}

/**
 * Staff + manager stock-count entry: the user types the final counted (or
 * just-purchased total) actual quantity -- not a delta -- matching the
 * brief's "type the ending total, not what changed" MVP semantics.
 */
export function CountForm({ locationId, itemId, unit, onSuccess }: CountFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set('locationId', locationId);
    formData.set('itemId', itemId);

    startTransition(async () => {
      const result = await recordInventoryStockCountAction(formData);
      if (result.status === 'success') {
        (event.currentTarget as HTMLFormElement).reset();
        onSuccess();
      } else {
        setError(describeInventoryWriteError(result));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 8 }}>
      {error ? <div style={{ ...alertDanger, marginRight: 8 }}>{error}</div> : null}
      <label style={{ flex: 1, maxWidth: 160 }}>
        <span style={{ ...mutedText, fontSize: 12 }}>Actual quantity ({unit})</span>
        <input style={input} name="actualQuantity" type="number" min={0} step="0.001" required autoComplete="off" />
      </label>
      <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
        {isPending ? 'Saving...' : 'Save count'}
      </button>
    </form>
  );
}
