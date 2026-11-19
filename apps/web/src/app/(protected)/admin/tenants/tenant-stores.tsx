'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { Button, ConfirmDialog, Dialog, Field, InlineAlert, Input, Menu, MetadataText, Select, StatusBadge, type MenuItem, type SelectOption } from '@line-os/ui';
import { createPlatformLocation, renamePlatformLocation, setPlatformLocationActive } from '@/lib/platform/platform-location-actions';
import type { PlatformLocationResult } from '@/lib/platform/platform-location';
import { CONSOLE_TIMEZONES, DEFAULT_TIMEZONE } from '@/lib/platform/provisioning-form';
import type { PlatformLocationRow } from '@/lib/platform/tenant-locations';
import { LOCATION_NAME_MAX_LENGTH, parseLocationName } from '@/lib/tenant/location-manage';
import { STORE_ERROR_KEY, fillTenants, type TenantsKey } from './tenants-i18n';

type T = (key: TenantsKey) => string;

type Feedback = { tone: 'success' | 'critical'; key: TenantsKey } | null;

type PendingKind = 'add' | 'rename' | 'active' | null;

export interface TenantStoresDialogProps {
  tenantId: string;
  /** Business name (or slug) for the title. */
  tenantLabel: string;
  /** false = suspended / archived tenant: the DB refuses every change (tenant_not_active), so nothing is offered. */
  tenantActive: boolean;
  /** Open stores, main store (oldest) first (`tenantLocationGroups`). */
  activeStores: PlatformLocationRow[];
  /** Archived stores, same order. */
  archivedStores: PlatformLocationRow[];
  t: T;
  onChanged: () => void;
  onClose: () => void;
}

const TIMEZONE_OPTIONS: SelectOption[] = CONSOLE_TIMEZONES.map((tz) => ({ value: tz, label: tz }));

const nameStyle ='min-w-0 truncate text-sm font-semibold text-text-primary';

/**
 * DEBT-139 L3c: one tenant's stores in the ORUWA admin console -- open stores
 * (main = oldest open, active staff count), archived ones in their own group,
 * a ••• menu per row (rename / archive / restore; no archive for the last open
 * store, archive disabled while staff still belong there, archive confirmed),
 * and an add-store form (name + time zone). Every write goes through a Server
 * Action -> platform-location Edge Function; the 0151 functions are the gate.
 * A Dialog (bottom sheet on phones), so the 640 px tenants table never hides
 * the menus at 375 px.
 */
export function TenantStoresDialog({ tenantId, tenantLabel, tenantActive, activeStores, archivedStores, t, onChanged, onClose }: TenantStoresDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<PendingKind>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [newName, setNewName] = useState('');
  // a new store usually shares the main store's time zone
  const [newTimezone, setNewTimezone] = useState<string>(activeStores[0]?.timezone ?? DEFAULT_TIMEZONE);
  const [addError, setAddError] = useState<TenantsKey | null>(null);
  const [renameTarget, setRenameTarget] = useState<PlatformLocationRow | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<TenantsKey | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PlatformLocationRow | null>(null);

  const mainStoreId = activeStores[0]?.locationId ?? null;
  const feedbackRef = useRef<HTMLDivElement>(null);

  // the action may be far below (archived group) on a phone sheet: bring the result into view
  useEffect(() => {
    if (feedback) feedbackRef.current?.scrollIntoView({ block: 'nearest' });
  }, [feedback]);

  // keep the pending label through the router refresh that follows a change
  useEffect(() => {
    if (!isPending) setPendingKind(null);
  }, [isPending]);

  function errorKey(result: Extract<PlatformLocationResult, { status: 'error' }>): TenantsKey {
    return STORE_ERROR_KEY[result.code];
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const name = parseLocationName(newName);
    if (!name) {
      setAddError('storesErrInvalidName');
      return;
    }
    setAddError(null);
    const formData = new FormData();
    formData.set('tenantId', tenantId);
    formData.set('name', name);
    formData.set('timezone', newTimezone);
    setPendingKind('add');
    startTransition(async () => {
      const result = await createPlatformLocation(formData);
      if (result.status === 'success') {
        setNewName('');
        setFeedback({ tone: 'success', key: 'storesCreated' });
        onChanged();
      } else if (result.code === 'invalid_name' || result.code === 'invalid_timezone' || result.code === 'name_taken') {
        setAddError(errorKey(result));
      } else {
        setFeedback({ tone: 'critical', key: errorKey(result) });
      }
    });
  }

  function openRename(store: PlatformLocationRow) {
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
      setRenameError('storesErrInvalidName');
      return;
    }
    setRenameError(null);
    const formData = new FormData();
    formData.set('locationId', renameTarget.locationId);
    formData.set('name', name);
    setPendingKind('rename');
    startTransition(async () => {
      const result = await renamePlatformLocation(formData);
      if (result.status === 'success') {
        setRenameTarget(null);
        setFeedback({ tone: 'success', key: result.changed ? 'storesRenamed' : 'storesUnchanged' });
        if (result.changed) onChanged();
      } else {
        setRenameError(errorKey(result));
      }
    });
  }

  function handleSetActive(store: PlatformLocationRow, isActive: boolean) {
    setFeedback(null);
    const formData = new FormData();
    formData.set('locationId', store.locationId);
    formData.set('isActive', isActive ? 'true' : 'false');
    setPendingKind('active');
    startTransition(async () => {
      const result = await setPlatformLocationActive(formData);
      setArchiveTarget(null);
      if (result.status === 'success') {
        setFeedback({ tone: 'success', key: !result.changed ? 'storesUnchanged' : isActive ? 'storesRestored' : 'storesArchived' });
        if (result.changed) onChanged();
      } else {
        setFeedback({ tone: 'critical', key: isActive && result.code === 'name_taken' ? 'storesErrNameTakenRestore' : errorKey(result) });
      }
    });
  }

  function menuItems(store: PlatformLocationRow, archived: boolean): MenuItem[] {
    const rename: MenuItem = { key: 'rename', label: t('storesRename'), onSelect: () => openRename(store), disabled: isPending };
    if (archived) {
      return [{ key: 'restore', label: t('storesRestore'), onSelect: () => handleSetActive(store, true), disabled: isPending }, rename];
    }
    // the last open store cannot be archived (DB: last_active_location) -- not offered
    if (activeStores.length <= 1) return [rename];
    const hasStaff = store.activeStaffCount > 0;
    return [
      rename,
      {
        key: 'archive',
        // DB: location_has_active_staff -- shown, but disabled with the reason
        label: t(hasStaff ? 'storesArchiveHasStaff' : 'storesArchive'),
        onSelect: () => {
          setFeedback(null);
          setArchiveTarget(store);
        },
        destructive: true,
        disabled: isPending || hasStaff,
      },
    ];
  }

  function storeRow(store: PlatformLocationRow, archived: boolean) {
    return (
      <li key={store.locationId} className={`flex min-w-0 items-center gap-2 rounded-md bg-surface-elevated px-3 py-2 ${archived ? 'opacity-70' : ''}`}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={nameStyle} title={store.locationName}>
              {store.locationName}
            </span>
            {!archived && store.locationId === mainStoreId ? (
              <StatusBadge tone="info" size="sm" className="shrink-0">
                {t('storesMainBadge')}
              </StatusBadge>
            ) : null}
          </div>
          <MetadataText className="min-w-0 flex-wrap text-xs">
            <span>{fillTenants(t('storesStaffCount'), { n: store.activeStaffCount })}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{store.timezone}</span>
          </MetadataText>
        </div>
        {tenantActive ? <Menu label={fillTenants(t('storesRowMenu'), { name: store.locationName })} items={menuItems(store, archived)} /> : null}
      </li>
    );
  }

  return (
    <Dialog open onClose={onClose} title={fillTenants(t('storesTitleFor'), { name: tenantLabel })} size="form" closeLabel={t('formClose')} dismissible={!isPending}>
      <div className="flex min-w-0 flex-col gap-4">
        <p className="m-0 text-sm text-text-muted">{t('storesIntro')}</p>

        {!tenantActive ? <InlineAlert tone="warning">{t('storesTenantInactive')}</InlineAlert> : null}

        {isPending && pendingKind === 'active' && archiveTarget === null ? (
          <p role="status" className="m-0 text-sm text-text-muted">
            {t('storesSaving')}
          </p>
        ) : null}

        {feedback ? (
          <div ref={feedbackRef}>
            <InlineAlert tone={feedback.tone}>{t(feedback.key)}</InlineAlert>
          </div>
        ) : null}

        <section aria-label={t('storesOpenHeading')} className="min-w-0">
          <h3 className="m-0 text-sm font-semibold text-text-primary">{t('storesOpenHeading')}</h3>
          {activeStores.length === 0 ? (
            <p className="m-0 mt-2 text-sm text-text-muted">{t('storesEmpty')}</p>
          ) : (
            <ul className="m-0 mt-2 grid list-none grid-cols-[minmax(0,1fr)] gap-1.5 p-0">{activeStores.map((store) => storeRow(store, false))}</ul>
          )}
        </section>

        {tenantActive ? (
          <form onSubmit={handleAdd} noValidate className="flex min-w-0 flex-col gap-3 border-t border-border pt-4">
            <h3 className="m-0 text-sm font-semibold text-text-primary">{t('storesAddHeading')}</h3>
            <Field label={t('storesAddNameLabel')} hint={t('storesAddNameHint')} error={addError ? t(addError) : undefined}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  name="name"
                  value={newName}
                  onChange={(event) => {
                    setNewName(event.currentTarget.value);
                    if (addError) setAddError(null);
                  }}
                  maxLength={LOCATION_NAME_MAX_LENGTH * 2}
                  autoComplete="off"
                  disabled={isPending}
                />
              )}
            </Field>
            <Field label={t('formTimezone')}>
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  value={newTimezone}
                  onValueChange={setNewTimezone}
                  options={TIMEZONE_OPTIONS}
                  disabled={isPending}
                />
              )}
            </Field>
            <div className="flex justify-end">
              <Button type="submit" size="md" loading={isPending && pendingKind === 'add'} disabled={isPending}>
                {isPending && pendingKind === 'add' ? t('storesAdding') : t('storesAddButton')}
              </Button>
            </div>
          </form>
        ) : null}

        {archivedStores.length > 0 ? (
          <section aria-label={t('storesArchivedHeading')} className="min-w-0 border-t border-border pt-4">
            <h3 className="m-0 text-sm font-semibold text-text-muted">{t('storesArchivedHeading')}</h3>
            <p className="m-0 mt-1 text-xs text-text-muted">{t('storesArchivedHint')}</p>
            <ul className="m-0 mt-2 grid list-none grid-cols-[minmax(0,1fr)] gap-1.5 p-0">{archivedStores.map((store) => storeRow(store, true))}</ul>
          </section>
        ) : null}
      </div>

      <Dialog
        open={renameTarget !== null}
        onClose={() => {
          if (!isPending) setRenameTarget(null);
        }}
        title={t('storesRenameTitle')}
        size="form"
        closeLabel={t('formCancel')}
        dismissible={!isPending}
      >
        <form onSubmit={handleRename} noValidate className="flex min-w-0 flex-col gap-3">
          <Field label={t('storesNameLabel')} error={renameError ? t(renameError) : undefined}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="name"
                value={renameValue}
                onChange={(event) => {
                  setRenameValue(event.currentTarget.value);
                  if (renameError) setRenameError(null);
                }}
                maxLength={LOCATION_NAME_MAX_LENGTH * 2}
                autoComplete="off"
                disabled={isPending}
              />
            )}
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="md" disabled={isPending} onClick={() => setRenameTarget(null)}>
              {t('formCancel')}
            </Button>
            <Button type="submit" size="md" loading={isPending && pendingKind === 'rename'} disabled={isPending}>
              {isPending && pendingKind === 'rename' ? t('storesSaving') : t('storesSave')}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={t('storesArchiveConfirmTitle')}
        description={
          <>
            {archiveTarget ? <span className="mb-1.5 block break-words font-semibold text-text-primary">{archiveTarget.locationName}</span> : null}
            {t('storesArchiveConfirmBody')}
          </>
        }
        confirmLabel={t('storesArchive')}
        cancelLabel={t('formCancel')}
        pending={isPending && pendingKind === 'active'}
        confirmVariant="destructive"
        onConfirm={() => {
          if (archiveTarget) handleSetActive(archiveTarget, false);
        }}
      />
    </Dialog>
  );
}
