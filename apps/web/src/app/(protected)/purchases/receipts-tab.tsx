'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  FormActions,
  IconButton,
  ImageViewer,
  InlineAlert,
  Input,
  Menu,
  MetadataText,
  SegmentedControl,
  SkeletonLines,
  StatusBadge,
} from '@line-os/ui';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { formatYen } from '@/lib/demo/cafe/format';
import {
  cancelSpendReceiptAction,
  loadSpendReceiptsAction,
  setSpendReceiptSettingsAction,
  type SpendReceiptsTabData,
} from '@/lib/purchases/spend-receipt-actions';
import {
  MAX_RECEIPT_NOTE_LENGTH,
  shiftMonth,
  summarizeSpend,
  type ReceiptPhotoMode,
  type SpendReceipt,
} from '@/lib/purchases/spend-receipts';
import { describeReceiptWriteError } from './receipts-copy';
import { formatMissingAmountCount, formatReceiptCount, tReceiptError, tReceipts } from './receipts-i18n';
import { CATEGORY_LABEL_KEY, ReceiptSheet } from './receipt-sheet';

type T = (key: Parameters<typeof tReceipts>[1]) => string;

function formatMonth(month: string, lang: Lang) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return lang === 'ja'
    ? `${y}年${m}月`
    : new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** `YYYY-MM-DD` -> `11/2` (same in both languages). */
function formatDay(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

/** Can the caller still change this receipt? Mirrors `purchases.lock_editable_spend_receipt` (the RPC decides). */
export function canEditReceipt(receipt: SpendReceipt, data: Pick<SpendReceiptsTabData, 'canManage' | 'today' | 'settings'>) {
  if (receipt.status !== 'active') return false;
  if (data.canManage) return true;
  return receipt.isMine && receipt.createdOn === data.today && data.settings.receiptsEnabled;
}

/**
 * Loads the tab's data on demand (server action), never with the dashboard
 * page. Data is returned only for the current (location, month, scope, token)
 * -- after a switch the caller sees "loading", never the previous month/store.
 * `token < 0` = do not load.
 */
export function useSpendReceipts(
  locationId: string,
  locationTimezone: string,
  month: string | null,
  scope: 'tab' | 'prompt',
  token: number,
) {
  const key = `${locationId}|${locationTimezone}|${month ?? ''}|${scope}|${token}`;
  const [loaded, setLoaded] = useState<{ data: SpendReceiptsTabData; key: string; reloadKey: number } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (token < 0) return;
    let alive = true;
    setFailedKey(null);
    loadSpendReceiptsAction(locationId, month, locationTimezone, scope)
      .then((result) => {
        if (!alive) return;
        if (result.status === 'success') setLoaded({ data: result.data, key, reloadKey });
        else setFailedKey(key);
      })
      .catch(() => {
        if (alive) setFailedKey(key);
      });
    return () => {
      alive = false;
    };
  }, [locationId, locationTimezone, month, scope, token, key, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const data = loaded?.key === key ? loaded.data : null;
  // true while a reload() of the same data is in flight (the old data stays on screen)
  const refreshing = data !== null && loaded?.reloadKey !== reloadKey;
  return { data, refreshing, failed: failedKey === key, reload };
}

export interface ReceiptsTabProps {
  lang: Lang;
  locationId: string;
  locationTimezone: string;
  /** Manager-only employee id -> name (empty for staff). */
  staffNameById: Record<string, string>;
}

/**
 * 「レシート」 tab of the Purchases popup (DEBT-136). Staff: own receipts of
 * the month (edit / cancel on the day). Manager (`purchases.receipt.manage`):
 * every receipt of the store, the monthly spend (total, by person, by
 * category, count 「金額未入力」) and the receipt settings in the ••• menu.
 */
export function ReceiptsTab({ lang, locationId, locationTimezone, staffNameById }: ReceiptsTabProps) {
  const t: T = (key) => tReceipts(lang, key);
  const [month, setMonth] = useState<string | null>(null);
  const { data, refreshing, failed, reload } = useSpendReceipts(locationId, locationTimezone, month, 'tab', 0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SpendReceipt | null>(null);
  const [canceling, setCanceling] = useState<SpendReceipt | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (failed) {
    return (
      <div className="mt-3">
        <InlineAlert
          tone="critical"
          action={
            <Button variant="secondary" size="sm" onClick={reload}>
              {t('retryButton')}
            </Button>
          }
        >
          {t('loadFailed')}
        </InlineAlert>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mt-3">
        <SkeletonLines lines={4} label={t('loading')} />
      </div>
    );
  }

  const currentMonth = data.today.slice(0, 7);
  // receipts off: nobody creates new ones (0147); a manager can still correct existing ones
  const canAdd = data.settings.receiptsEnabled;
  const changeMonth = (delta: number) => {
    setNotice(null);
    setMonth(shiftMonth(data.month, delta));
  };
  const summary = data.canManage ? summarizeSpend(data.receipts) : null;
  const personName = (employeeId: string | null) =>
    (employeeId && staffNameById[employeeId]) || t('unknownPerson');

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <IconButton size="lg" variant="ghost" aria-label={t('monthPrevAria')} icon={<span aria-hidden>‹</span>} onClick={() => changeMonth(-1)} />
          <h2 className="m-0 whitespace-nowrap text-center text-base font-semibold text-text-primary">{formatMonth(data.month, lang)}</h2>
          <IconButton
            size="lg"
            variant="ghost"
            aria-label={t('monthNextAria')}
            icon={<span aria-hidden>›</span>}
            disabled={data.month >= currentMonth}
            onClick={() => changeMonth(1)}
          />
        </div>
        <div className="flex items-center gap-1">
          {canAdd ? (
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              {t('newReceiptButton')}
            </Button>
          ) : null}
          {data.canManage ? (
            <Menu label={t('moreActionsAria')} items={[{ key: 'settings', label: t('settingsAction'), onSelect: () => setSettingsOpen(true) }]} />
          ) : null}
        </div>
      </div>

      {!data.settings.receiptsEnabled ? (
        <InlineAlert tone="info">{data.canManage ? t('receiptsOffManagerNotice') : t('receiptsOffNotice')}</InlineAlert>
      ) : null}
      {/* shown once the list includes the change, never next to the old list */}
      {notice && !refreshing ? <InlineAlert tone="success">{notice}</InlineAlert> : null}

      {summary ? <SpendSummaryCard t={t} lang={lang} summary={summary} personName={personName} /> : null}

      <h3 className="m-0 text-sm font-semibold text-text-primary">{data.canManage ? t('allReceiptsTitle') : t('myReceiptsTitle')}</h3>
      {!data.canManage ? <MetadataText>{t('editableTodayHint')}</MetadataText> : null}

      {data.receipts.length === 0 ? (
        <EmptyState title={data.canManage ? t('emptyAll') : t('emptyMine')} />
      ) : (
        <div className="flex flex-col gap-2">
          {data.receipts.map((receipt) => (
            <ReceiptRow
              key={receipt.receiptId}
              t={t}
              lang={lang}
              receipt={receipt}
              showPerson={data.canManage}
              personName={personName(receipt.createdByEmployeeId)}
              photoUrl={data.photoUrlByReceiptId[receipt.receiptId] ?? null}
              editable={canEditReceipt(receipt, data)}
              onViewPhoto={setViewingPhoto}
              onEdit={() => {
                setEditing(receipt);
                setSheetOpen(true);
              }}
              onCancel={() => setCanceling(receipt)}
            />
          ))}
        </div>
      )}

      <ReceiptSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          setSheetOpen(false);
          setNotice(t('savedNotice'));
          reload();
        }}
        lang={lang}
        locationId={locationId}
        today={data.today}
        settings={data.settings}
        candidates={data.candidates}
        receipt={editing}
        photoUrl={editing ? (data.photoUrlByReceiptId[editing.receiptId] ?? null) : null}
      />

      <CancelReceiptDialog
        t={t}
        lang={lang}
        receipt={canceling}
        onClose={() => setCanceling(null)}
        onDone={() => {
          setCanceling(null);
          setNotice(null);
          reload();
        }}
      />

      {data.canManage ? (
        <ReceiptSettingsDialog
          t={t}
          lang={lang}
          open={settingsOpen}
          locationId={locationId}
          receiptsEnabled={data.settings.receiptsEnabled}
          photoMode={data.settings.photoMode}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            setNotice(null);
            reload();
          }}
        />
      ) : null}

      <ImageViewer open={viewingPhoto !== null} onClose={() => setViewingPhoto(null)} src={viewingPhoto ?? ''} alt={t('photoLabel')} closeLabel={t('closeButton')} />
    </div>
  );
}

function SpendSummaryCard({
  t,
  lang,
  summary,
  personName,
}: {
  t: T;
  lang: Lang;
  summary: ReturnType<typeof summarizeSpend>;
  personName: (employeeId: string | null) => string;
}) {
  return (
    <Card>
      <h3 className="m-0 text-sm font-semibold text-text-primary">{t('summaryTitle')}</h3>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <strong className="text-2xl font-semibold text-text-primary">{formatYen(summary.totalJpy)}</strong>
        <MetadataText>{formatReceiptCount(lang, summary.receiptCount)}</MetadataText>
        {summary.missingAmountCount > 0 ? (
          <StatusBadge tone="warning">{formatMissingAmountCount(lang, summary.missingAmountCount)}</StatusBadge>
        ) : null}
      </div>
      {summary.receiptCount > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SummaryList
            title={t('summaryByPerson')}
            rows={summary.byPerson.map((p) => ({ key: p.employeeId || 'unknown', label: personName(p.employeeId || null), totalJpy: p.totalJpy, count: p.count }))}
            lang={lang}
          />
          <SummaryList
            title={t('summaryByCategory')}
            rows={summary.byCategory.map((c) => ({ key: c.category, label: t(CATEGORY_LABEL_KEY[c.category]), totalJpy: c.totalJpy, count: c.count }))}
            lang={lang}
          />
        </div>
      ) : null}
    </Card>
  );
}

function SummaryList({ title, rows, lang }: { title: string; rows: Array<{ key: string; label: string; totalJpy: number; count: number }>; lang: Lang }) {
  return (
    <div>
      <p className="m-0 text-xs font-medium text-text-muted">{title}</p>
      <ul className="m-0 mt-1 list-none p-0">
        {rows.map((row) => (
          <li key={row.key} className="flex items-baseline justify-between gap-2 border-b border-border py-1.5 text-sm last:border-b-0">
            <span className="min-w-0 truncate text-text-primary">{row.label}</span>
            <span className="shrink-0 tabular-nums text-text-primary">
              {formatYen(row.totalJpy)} <span className="text-xs text-text-muted">· {formatReceiptCount(lang, row.count)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReceiptRow({
  t,
  lang,
  receipt,
  showPerson,
  personName,
  photoUrl,
  editable,
  onViewPhoto,
  onEdit,
  onCancel,
}: {
  t: T;
  lang: Lang;
  receipt: SpendReceipt;
  showPerson: boolean;
  personName: string;
  photoUrl: string | null;
  editable: boolean;
  onViewPhoto: (url: string) => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const canceled = receipt.status === 'canceled';
  const what =
    receipt.items.length > 0
      ? receipt.items.map((i) => i.itemName ?? '—').join(lang === 'ja' ? '、' : ', ')
      : receipt.category
        ? t(CATEGORY_LABEL_KEY[receipt.category])
        : '';
  return (
    <div className={`rounded-md border border-border bg-surface p-3 shadow-card ${canceled ? 'opacity-80' : ''}`}>
      <div className="flex items-start gap-3">
        {photoUrl ? (
          <button
            type="button"
            className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-surface-muted p-0"
            aria-label={t('viewPhotoAria')}
            onClick={() => onViewPhoto(photoUrl)}
          >
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {receipt.amountJpy !== null ? (
              <strong className={`text-base font-semibold tabular-nums ${canceled ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                {formatYen(receipt.amountJpy)}
              </strong>
            ) : (
              <StatusBadge tone="warning">{t('amountMissing')}</StatusBadge>
            )}
            {canceled ? (
              <StatusBadge tone="neutral" showIcon={false}>
                {t('canceledBadge')}
              </StatusBadge>
            ) : null}
            <MetadataText>{formatDay(receipt.purchasedOn)}</MetadataText>
          </div>
          {what ? <p className="m-0 mt-1 break-words text-sm text-text-primary">{what}</p> : null}
          {receipt.note ? <p className="m-0 mt-0.5 break-words text-sm text-text-muted">{receipt.note}</p> : null}
          <div className="mt-1 flex flex-wrap gap-x-3">
            {showPerson ? <MetadataText>{personName}</MetadataText> : null}
            {canceled && receipt.cancelReason ? (
              <MetadataText>
                {t('canceledReasonPrefix')} {receipt.cancelReason}
              </MetadataText>
            ) : null}
          </div>
        </div>
        {editable ? (
          <Menu
            label={t('moreActionsAria')}
            items={[
              { key: 'edit', label: t('editAction'), onSelect: onEdit },
              { key: 'cancel', label: t('cancelReceiptAction'), onSelect: onCancel, destructive: true },
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}

function CancelReceiptDialog({
  t,
  lang,
  receipt,
  onClose,
  onDone,
}: {
  t: T;
  lang: Lang;
  receipt: SpendReceipt | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (receipt) {
      setReason('');
      setError(null);
      setIsPending(false);
    }
  }, [receipt]);

  function handleConfirm() {
    if (!receipt || isPending) return;
    if (reason.trim() === '') {
      setError(tReceiptError(lang, 'cancel_reason_required'));
      return;
    }
    setIsPending(true);
    const formData = new FormData();
    formData.set('receiptId', receipt.receiptId);
    formData.set('reason', reason);
    cancelSpendReceiptAction(formData)
      .then((result) => {
        setIsPending(false);
        if (result.status === 'success') onDone();
        else setError(describeReceiptWriteError(result, lang));
      })
      .catch(() => {
        setIsPending(false);
        setError(tReceiptError(lang, 'generic'));
      });
  }

  return (
    <Dialog
      open={receipt !== null}
      onClose={() => (isPending ? undefined : onClose())}
      title={t('cancelDialogTitle')}
      size="form"
      closeLabel={t('keepButton')}
      footer={
        <FormActions
          primary={
            <Button variant="destructive" loading={isPending} onClick={handleConfirm}>
              {t('cancelConfirmButton')}
            </Button>
          }
          secondary={
            <Button variant="secondary" disabled={isPending} onClick={onClose}>
              {t('keepButton')}
            </Button>
          }
        />
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm text-text-primary">{t('cancelDialogBody')}</p>
        <Field label={t('cancelReasonLabel')} required error={error ?? undefined}>
          {(fieldProps) => (
            <Input {...fieldProps} maxLength={MAX_RECEIPT_NOTE_LENGTH} value={reason} onChange={(event) => setReason(event.target.value)} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function ReceiptSettingsDialog({
  t,
  lang,
  open,
  locationId,
  receiptsEnabled,
  photoMode,
  onClose,
  onSaved,
}: {
  t: T;
  lang: Lang;
  open: boolean;
  locationId: string;
  receiptsEnabled: boolean;
  photoMode: ReceiptPhotoMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(receiptsEnabled);
  const [mode, setMode] = useState<ReceiptPhotoMode>(photoMode);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (open) {
      setEnabled(receiptsEnabled);
      setMode(photoMode);
      setError(null);
      setIsPending(false);
    }
  }, [open, receiptsEnabled, photoMode]);

  function handleSave() {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    const formData = new FormData();
    formData.set('locationId', locationId);
    formData.set('receiptsEnabled', String(enabled));
    formData.set('photoMode', mode);
    setSpendReceiptSettingsAction(formData)
      .then((result) => {
        setIsPending(false);
        if (result.status === 'success') onSaved();
        else setError(describeReceiptWriteError(result, lang));
      })
      .catch(() => {
        setIsPending(false);
        setError(tReceiptError(lang, 'generic'));
      });
  }

  return (
    <Dialog
      open={open}
      onClose={() => (isPending ? undefined : onClose())}
      title={t('settingsTitle')}
      size="form"
      closeLabel={t('cancelButton')}
      footer={
        <FormActions
          primary={
            <Button variant="primary" loading={isPending} onClick={handleSave}>
              {isPending ? t('savingButton') : t('settingsSaveButton')}
            </Button>
          }
          secondary={
            <Button variant="secondary" disabled={isPending} onClick={onClose}>
              {t('cancelButton')}
            </Button>
          }
        />
      }
    >
      <div className="flex flex-col gap-4">
        <Checkbox checked={enabled} onCheckedChange={setEnabled} label={t('settingsEnabledLabel')} />
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-sm font-medium text-text-primary">{t('settingsPhotoLabel')}</p>
          <SegmentedControl
            value={mode}
            onValueChange={(value) => setMode(value as ReceiptPhotoMode)}
            aria-label={t('settingsPhotoLabel')}
            options={[
              { value: 'off', label: t('photoModeOff') },
              { value: 'optional', label: t('photoModeOptional') },
              { value: 'required', label: t('photoModeRequired') },
            ]}
          />
        </div>
        {error ? <InlineAlert tone="critical">{error}</InlineAlert> : null}
      </div>
    </Dialog>
  );
}

/**
 * After 「購入済み」/「入荷」: a small bar offering 「レシートを追加」 with the
 * purchases recorded in this popup session pre-ticked (DEBT-136) -- never
 * other people's purchases, even for a manager. Hidden when receipts are off.
 * Loads the light `prompt` scope (settings + today's candidates) only after a
 * purchase was recorded.
 */
export function ReceiptPrompt({
  lang,
  locationId,
  locationTimezone,
  trigger,
  recordedActionIds,
  onDismiss,
}: {
  lang: Lang;
  locationId: string;
  locationTimezone: string;
  /** Increments on every bought/received success; 0 = nothing recorded yet. */
  trigger: number;
  /** Action ids recorded in this session (from the bought/received results). */
  recordedActionIds: string[];
  onDismiss: () => void;
}) {
  const t: T = (key) => tReceipts(lang, key);
  // -1 = nothing recorded yet, no load; data only for the latest purchase (it contains it)
  const { data } = useSpendReceipts(locationId, locationTimezone, null, 'prompt', trigger > 0 ? trigger : -1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [savedFor, setSavedFor] = useState<number | null>(null);
  const candidates = data?.candidates;
  const preselected = useMemo(
    () => (candidates ?? []).filter((c) => recordedActionIds.includes(c.actionId)).map((c) => c.actionId),
    [candidates, recordedActionIds],
  );

  if (trigger === 0 || !data || !data.settings.receiptsEnabled) return null;
  if (savedFor === trigger) {
    return (
      <div className="sticky bottom-0 z-10 mt-3">
        <InlineAlert
          tone="success"
          action={
            <Button variant="ghost" size="lg" onClick={onDismiss}>
              {t('closeButton')}
            </Button>
          }
        >
          {t('savedNotice')}
        </InlineAlert>
      </div>
    );
  }
  if (preselected.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-10 mt-3 rounded-md shadow-card">
      <InlineAlert tone="info">
        <p className="m-0">{t('addReceiptPrompt')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="primary" size="lg" onClick={() => setSheetOpen(true)}>
            {t('addReceiptButton')}
          </Button>
          <Button variant="ghost" size="lg" onClick={onDismiss}>
            {t('closeButton')}
          </Button>
        </div>
      </InlineAlert>
      <ReceiptSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          setSheetOpen(false);
          setSavedFor(trigger);
        }}
        lang={lang}
        locationId={locationId}
        today={data.today}
        settings={data.settings}
        candidates={data.candidates}
        preselectedActionIds={preselected}
      />
    </div>
  );
}
