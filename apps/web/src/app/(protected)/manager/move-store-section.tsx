'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { Modal } from '@/components/shared/design-kit';
import { LoadingButton } from '@/components/ui/loading';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { moveEmployeeToStore } from '@/lib/tenant/location-manage-actions';
import { moveTargets, type TenantStoreRow } from '@/lib/tenant/location-manage';
import { moveStoreCopy, storesCopy } from './stores-i18n';

export interface MoveStoreSectionProps {
  staff: WorkforceStaffManageEntry;
  /** Every store of the workspace the caller sees (open + archived), for the current store's name. */
  stores: TenantStoreRow[];
  /** After a successful move: the person leaves this store's roster, so the popup shows `message` on its list. */
  onMoved: (message: string) => void;
  lang: Lang;
}

/**
 * DEBT-139 L3 (F3, debts a/b): 「別の店舗へ移動」 in the staff detail view.
 * Rendered only for an Owner / Admin (`core.location.manage` tenant-wide,
 * server-resolved) with two or more open stores; `api.move_employee_location`
 * is the real gate (rights, same tenant, open target, no future shifts at the
 * old store). The dialog says up front what the move does: pending requests
 * at the current store are cancelled (0156), future shifts block it, a
 * store-only Manager's rights move along.
 */
export function MoveStoreSection({ staff, stores, onMoved, lang }: MoveStoreSectionProps) {
  const copy = moveStoreCopy[lang];
  const errors = storesCopy[lang].errors;
  const selectId = useId();
  const notesId = useId();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const current = stores.find((s) => s.locationId === staff.locationId) ?? null;
  const targets = moveTargets(
    stores.filter((s) => s.isActive),
    staff.locationId,
  );

  function openDialog() {
    setError(null);
    setTarget(targets[0]?.locationId ?? '');
    setOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chosen = targets.find((s) => s.locationId === target);
    if (!chosen) {
      setError(errors.location_not_found);
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set('staffId', staff.staffId);
    formData.set('locationId', chosen.locationId);
    startTransition(async () => {
      const result = await moveEmployeeToStore(formData);
      if (result.status === 'success') {
        setOpen(false);
        onMoved(result.data.changed ? copy.moved(chosen.locationName, result.data.cancelledRequests) : copy.unchanged);
      } else {
        setError(errors[result.code]);
      }
    });
  }

  if (targets.length === 0) return null;

  return (
    <section>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{copy.heading}</h3>
      <p style={{ margin: 0, fontSize: 13, ...mutedText, overflowWrap: 'anywhere' }}>{current ? copy.current(current.locationName) : copy.noCurrent}</p>
      <div style={{ marginTop: 10 }}>
        <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={openDialog}>
          {copy.button}
        </button>
      </div>

      <Modal open={open} onClose={() => { if (!isPending) setOpen(false); }} title={copy.title} closeLabel={storesCopy[lang].cancel} width="min(480px, 94vw)">
        <form onSubmit={handleSubmit}>
          <strong style={{ display: 'block', marginBottom: 10, overflowWrap: 'anywhere' }}>{staff.name}</strong>
          <label htmlFor={selectId} style={{ fontSize: 13, ...mutedText }}>
            {copy.targetLabel}
          </label>
          <select
            id={selectId}
            value={target}
            onChange={(event) => setTarget(event.currentTarget.value)}
            disabled={isPending}
            aria-describedby={notesId}
            style={input}
          >
            {targets.map((s) => (
              <option key={s.locationId} value={s.locationId}>
                {s.locationName}
              </option>
            ))}
          </select>
          <ul id={notesId} style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: colors.textMuted, display: 'grid', gap: 4 }}>
            <li>{copy.requestsNote}</li>
            <li>{copy.shiftsNote}</li>
            <li>{copy.historyNote}</li>
            {staff.isManager && staff.managerScope === 'location' ? <li style={{ color: colors.textPrimary, fontWeight: 600 }}>{copy.managerNote}</li> : null}
          </ul>
          {error ? (
            <div role="alert" style={{ ...alertDanger, marginTop: 10 }}>
              {error}
            </div>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <LoadingButton
              type="submit"
              pending={isPending}
              pendingLabel={copy.moving}
              style={buttonPrimary}
              pendingStyle={buttonDisabled}
              className={hoverStyles.buttonPrimary}
            >
              {copy.confirm}
            </LoadingButton>
            <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} disabled={isPending} onClick={() => setOpen(false)}>
              {storesCopy[lang].cancel}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
