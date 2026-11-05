'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { ActionsMenu, ConfirmDialog, Modal } from '@/components/shared/design-kit';
import { LoadingButton } from '@/components/ui/loading';
import { alertDanger, badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, card, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { createStore, renameStore, setStoreActive } from '@/lib/tenant/location-manage-actions';
import { LOCATION_NAME_MAX_LENGTH, parseLocationName, type TenantStoreRow } from '@/lib/tenant/location-manage';
import { storesCopy } from './stores-i18n';

// Same success-alert shape as manager-role-section.tsx / the dashboard banner.
const alertSuccess = {
  border: `1px solid ${colors.success}`,
  background: colors.successMuted,
  color: colors.success,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

export interface StoresSectionProps {
  /** Open stores, main store first (`tenantStoreGroups`). */
  activeStores: TenantStoreRow[];
  /** Archived stores, same order. */
  archivedStores: TenantStoreRow[];
  /** The store this page shows (marked 「表示中」). */
  currentLocationId: string;
  onChange: () => void;
  lang: Lang;
}

type Feedback = { tone: 'success' | 'error'; text: string } | null;

/**
 * DEBT-139 L3 (F1): the cabinet 「店舗」 section -- add a store, and rename /
 * archive / restore one from a ••• menu per row (rare actions). Rendered only
 * for a caller with `core.location.manage` tenant-wide (Owner / Admin,
 * resolved server-side in page.tsx); the RPCs behind the server actions are
 * the real gate. Matches the neighbouring Settings section (legacy theme +
 * design-kit), wraps at 375 px.
 */
export function StoresSection({ activeStores, archivedStores, currentLocationId, onChange, lang }: StoresSectionProps) {
  const copy = storesCopy[lang];
  const nameInputId = useId();
  const nameHintId = useId();
  const renameInputId = useId();
  const [isPending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<'add' | 'rename' | 'active' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [newName, setNewName] = useState('');
  const [renameTarget, setRenameTarget] = useState<TenantStoreRow | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TenantStoreRow | null>(null);

  const mainStoreId = activeStores[0]?.locationId ?? null;

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const name = parseLocationName(newName);
    if (!name) {
      setFeedback({ tone: 'error', text: copy.errors.invalid_name });
      return;
    }
    const formData = new FormData();
    formData.set('name', name);
    setPendingKind('add');
    startTransition(async () => {
      const result = await createStore(formData);
      setPendingKind(null);
      if (result.status === 'success') {
        setNewName('');
        setFeedback({ tone: 'success', text: copy.created(name) });
        onChange();
      } else {
        setFeedback({ tone: 'error', text: copy.errors[result.code] });
      }
    });
  }

  function openRename(store: TenantStoreRow) {
    setFeedback(null);
    setRenameError(null);
    setRenameValue(store.locationName);
    setRenameTarget(store);
  }

  function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget) return;
    const name = parseLocationName(renameValue);
    if (!name) {
      setRenameError(copy.errors.invalid_name);
      return;
    }
    const formData = new FormData();
    formData.set('locationId', renameTarget.locationId);
    formData.set('name', name);
    setRenameError(null);
    setPendingKind('rename');
    startTransition(async () => {
      const result = await renameStore(formData);
      setPendingKind(null);
      if (result.status === 'success') {
        setRenameTarget(null);
        setFeedback({ tone: 'success', text: result.data.changed ? copy.renamed : copy.unchanged });
        if (result.data.changed) onChange();
      } else {
        setRenameError(copy.errors[result.code]);
      }
    });
  }

  function handleSetActive(store: TenantStoreRow, isActive: boolean) {
    setFeedback(null);
    const formData = new FormData();
    formData.set('locationId', store.locationId);
    formData.set('isActive', isActive ? 'true' : 'false');
    setPendingKind('active');
    startTransition(async () => {
      const result = await setStoreActive(formData);
      setPendingKind(null);
      setArchiveTarget(null);
      if (result.status === 'success') {
        setFeedback({ tone: 'success', text: !result.data.changed ? copy.unchanged : isActive ? copy.restored : copy.archived });
        if (result.data.changed) onChange();
      } else {
        setFeedback({ tone: 'error', text: copy.errors[result.code] });
      }
    });
  }

  function storeRow(store: TenantStoreRow, archived: boolean) {
    const items = archived
      ? [
          { label: copy.restore, onClick: () => handleSetActive(store, true), disabled: isPending },
          { label: copy.rename, onClick: () => openRename(store), disabled: isPending },
        ]
      : [
          { label: copy.rename, onClick: () => openRename(store), disabled: isPending },
          { label: copy.archive, onClick: () => { setFeedback(null); setArchiveTarget(store); }, danger: true, disabled: isPending },
        ];
    return (
      <li
        key={store.locationId}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 8,
          background: colors.surfaceElevated,
          opacity: archived ? 0.7 : 1,
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
          <strong style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
            {store.locationName}
          </strong>
          {!archived && store.locationId === mainStoreId ? <span style={badgeStyle('neutral')}>{copy.mainBadge}</span> : null}
          {!archived && store.locationId === currentLocationId ? <span style={badgeStyle('active')}>{copy.currentBadge}</span> : null}
        </div>
        <ActionsMenu triggerLabel={copy.rowMenuLabel(store.locationName)} items={items} />
      </li>
    );
  }

  return (
    <section style={card} aria-labelledby={`${nameInputId}-heading`}>
      <h2 id={`${nameInputId}-heading`} style={{ margin: 0, fontSize: 16 }}>
        {copy.heading}
      </h2>
      <p style={{ margin: '6px 0 0', fontSize: 13, ...mutedText }}>{copy.intro}</p>

      <ul aria-label={copy.activeListLabel} style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
        {activeStores.map((store) => storeRow(store, false))}
      </ul>

      <form onSubmit={handleAdd} style={{ marginTop: 16 }}>
        <label htmlFor={nameInputId} style={{ fontSize: 13, ...mutedText }}>
          {copy.addNameLabel}
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <input
            id={nameInputId}
            name="name"
            value={newName}
            onChange={(event) => setNewName(event.currentTarget.value)}
            maxLength={LOCATION_NAME_MAX_LENGTH * 2}
            autoComplete="off"
            aria-describedby={nameHintId}
            style={{ ...input, marginTop: 0, flex: '1 1 200px', width: 'auto', minWidth: 0 }}
          />
          <LoadingButton
            type="submit"
            pending={isPending && pendingKind === 'add'}
            pendingLabel={copy.adding}
            disabled={isPending}
            style={buttonPrimary}
            pendingStyle={buttonDisabled}
            className={hoverStyles.buttonPrimary}
          >
            {copy.addButton}
          </LoadingButton>
        </div>
        <p id={nameHintId} style={{ margin: '6px 0 0', fontSize: 12, ...mutedText }}>
          {copy.addNameHint}
        </p>
      </form>

      {feedback ? (
        <div role={feedback.tone === 'error' ? 'alert' : 'status'} style={{ ...(feedback.tone === 'error' ? alertDanger : alertSuccess), marginTop: 10 }}>
          {feedback.text}
        </div>
      ) : null}

      {archivedStores.length > 0 ? (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
          <h3 style={{ margin: 0, fontSize: 14, ...mutedText }}>{copy.archivedHeading}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, ...mutedText }}>{copy.archivedHint}</p>
          <ul aria-label={copy.archivedHeading} style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
            {archivedStores.map((store) => storeRow(store, true))}
          </ul>
        </div>
      ) : null}

      <Modal open={renameTarget !== null} onClose={() => { if (!isPending) setRenameTarget(null); }} title={copy.renameTitle} closeLabel={copy.cancel} width="min(440px, 94vw)">
        <form onSubmit={handleRename}>
          <label htmlFor={renameInputId} style={{ fontSize: 13, ...mutedText }}>
            {copy.renameNameLabel}
          </label>
          <input
            id={renameInputId}
            name="name"
            value={renameValue}
            onChange={(event) => setRenameValue(event.currentTarget.value)}
            maxLength={LOCATION_NAME_MAX_LENGTH * 2}
            autoComplete="off"
            style={input}
          />
          {renameError ? (
            <div role="alert" style={{ ...alertDanger, marginTop: 8 }}>
              {renameError}
            </div>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <LoadingButton
              type="submit"
              pending={isPending && pendingKind === 'rename'}
              pendingLabel={copy.saving}
              disabled={isPending}
              style={buttonPrimary}
              pendingStyle={buttonDisabled}
              className={hoverStyles.buttonPrimary}
            >
              {copy.save}
            </LoadingButton>
            <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} disabled={isPending} onClick={() => setRenameTarget(null)}>
              {copy.cancel}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={archiveTarget !== null}
        title={copy.archiveConfirmTitle}
        confirmLabel={copy.archive}
        cancelLabel={copy.cancel}
        pending={isPending && pendingKind === 'active'}
        danger
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => {
          if (archiveTarget) handleSetActive(archiveTarget, false);
        }}
      >
        {archiveTarget ? <strong style={{ display: 'block', marginBottom: 6, color: colors.textPrimary }}>{archiveTarget.locationName}</strong> : null}
        {copy.archiveConfirmBody}
      </ConfirmDialog>
    </section>
  );
}
