'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STATUS_RANK, type PurchaseNeededItem } from '@/lib/purchases/items';
import type { PurchaseHistoryEntry } from '@/lib/purchases/history';
import { splitAwaitingDelivery, type PurchaseAwaitingDeliveryItem } from '@/lib/purchases/awaiting-delivery';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { backLink, buttonSecondary, card, colors, mutedText, tableCell, tableHeaderCell } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import responsiveTable from '@/lib/ui/responsive-table.module.css';
import purchasesFooter from './purchases-footer.module.css';
import { MarkBoughtButton } from './mark-bought-button';
import { OrderForm } from './order-form';
import { ReceiveForm } from './receive-form';
import { CancelRestMenu } from './cancel-rest-menu';
import { formatAwaitingLabel } from './awaiting-copy';
import { tPurchasesDashboard } from './purchases-i18n';

export interface PurchasesDashboardClientProps {
  tenantName: string;
  locationName: string;
  locationId: string;
  /** Location's IANA timezone, used to render `actionedAt` consistently between server and client (avoids a hydration mismatch). */
  locationTimezone: string;
  items: PurchaseNeededItem[];
  /** Manager-only decrypted staff-id -> display-name map for "bought by" (mirrors Inventory's own `staffNameById` convention -- staff never see another employee's name here). Always empty for a non-manager caller. */
  staffNameById: Record<string, string>;
  /** Full append-only action log (0120, `api.purchase_history`), read-only "History" tab. `null` when it failed to load -- the tab still renders, showing `unavailable` copy instead of throwing. */
  history: PurchaseHistoryEntry[] | null;
  /**
   * Open orders (0137, `api.purchases_awaiting_delivery`). Shown inline on the
   * item's shopping-list row when the item is still short, otherwise in the
   * separate 「入荷待ち」 section -- see `splitAwaitingDelivery`. `null` when
   * it failed to load: the shopping list still renders, just without the
   * awaiting-delivery information.
   */
  awaiting: PurchaseAwaitingDeliveryItem[] | null;
  /** Skips this component's own page-level `<header>` when rendered inside a popup (mirrors `InventoryDashboardClientProps.embedded`). */
  embedded?: boolean;
}

type T = (key: Parameters<typeof tPurchasesDashboard>[1]) => string;
type Filter = 'all' | 'pending' | 'bought' | 'ordered' | 'received' | 'history';

function formatTimestamp(iso: string, lang: ReturnType<typeof useLang>['lang'], locationTimezone: string) {
  return new Date(iso).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', { timeZone: locationTimezone });
}

function formatActionedAt(item: PurchaseNeededItem, lang: ReturnType<typeof useLang>['lang'], locationTimezone: string) {
  if (!item.actionedAt) return null;
  return formatTimestamp(item.actionedAt, lang, locationTimezone);
}

interface RowProps {
  item: PurchaseNeededItem;
  locationId: string;
  locationTimezone: string;
  staffNameById: Record<string, string>;
  lang: ReturnType<typeof useLang>['lang'];
  t: T;
  onChanged: () => void;
  /** The item's open order (0137), when it has one -- rendered inline on this row (one place per item). */
  openOrder?: PurchaseAwaitingDeliveryItem;
}

/** 「入荷待ち 4 L（8 Lのうち）」 line for an open order (0137). */
function AwaitingLine({ openOrder, unit, lang }: { openOrder: PurchaseAwaitingDeliveryItem; unit: string; lang: ReturnType<typeof useLang>['lang'] }) {
  return (
    <div style={{ color: colors.accent, fontWeight: 600, fontSize: 13 }}>
      {formatAwaitingLabel(lang, openOrder.openOrderQuantity, openOrder.orderedQuantity, unit)}
    </div>
  );
}

/**
 * The status-specific info line shown in place of (or alongside) the
 * action controls -- mirrors the original 0089 "bought" info block for the
 * two new 0120 statuses ('ordered'/'received'), each showing its own
 * quantity plus the same actionedAt/actionedBy convention. When the item has
 * an open order (0137) its 「入荷待ち」 line is added (or, for 'ordered',
 * replaces the plain "Ordered: N" line, which it already contains).
 */
function StatusInfo({ item, locationTimezone, staffNameById, lang, t, openOrder }: Omit<RowProps, 'onChanged' | 'locationId'>) {
  const actionedAt = formatActionedAt(item, lang, locationTimezone);
  const actorSuffix =
    item.actionedByStaffId && staffNameById[item.actionedByStaffId] ? ` · ${t('boughtByPrefix')} ${staffNameById[item.actionedByStaffId]}` : '';
  const status = <StatusBlock item={item} actionedAt={actionedAt} actorSuffix={actorSuffix} t={t} lang={lang} openOrder={openOrder} />;
  if (!openOrder || item.purchaseStatus === 'ordered') return status;
  return (
    <div style={{ textAlign: 'right' }}>
      {status}
      <AwaitingLine openOrder={openOrder} unit={item.unit} lang={lang} />
    </div>
  );
}

function StatusBlock({
  item,
  actionedAt,
  actorSuffix,
  t,
  lang,
  openOrder,
}: {
  item: PurchaseNeededItem;
  actionedAt: string | null;
  actorSuffix: string;
  t: T;
  lang: ReturnType<typeof useLang>['lang'];
  openOrder?: PurchaseAwaitingDeliveryItem;
}) {
  if (item.purchaseStatus === 'bought') {
    return (
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: colors.accent, fontWeight: 600, fontSize: 13 }}>✓ {t('boughtButton')}</div>
        {actionedAt ? (
          <div style={{ ...mutedText, fontSize: 11, marginTop: 2 }}>
            {t('boughtAtLabel')} {actionedAt}
            {actorSuffix}
          </div>
        ) : null}
      </div>
    );
  }

  if (item.purchaseStatus === 'ordered') {
    return (
      <div style={{ textAlign: 'right' }}>
        {openOrder ? (
          <AwaitingLine openOrder={openOrder} unit={item.unit} lang={lang} />
        ) : (
          <div style={{ color: colors.accent, fontWeight: 600, fontSize: 13 }}>
            {t('orderedQuantityLabel')} {item.orderedQuantity} {item.unit}
          </div>
        )}
        {actionedAt ? (
          <div style={{ ...mutedText, fontSize: 11, marginTop: 2 }}>
            {t('orderedAtLabel')} {actionedAt}
            {actorSuffix}
          </div>
        ) : null}
      </div>
    );
  }

  if (item.purchaseStatus === 'received') {
    return (
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: colors.accent, fontWeight: 600, fontSize: 13 }}>
          {t('receivedQuantityLabel')} {item.receivedQuantity} {item.unit}
        </div>
        {actionedAt ? (
          <div style={{ ...mutedText, fontSize: 11, marginTop: 2 }}>
            {t('receivedAtLabel')} {actionedAt}
            {actorSuffix}
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}

/**
 * Action controls beneath/beside `StatusInfo`. Judgment call (not
 * explicitly forced by RLS/RPC, since Receive never requires a prior
 * Order): Receive is offered for every listed item regardless of
 * `purchaseStatus` -- an item stays listed here as long as it's still at or
 * below its reorder point, and a real delivery can be logged at any point
 * in that window. Bought/Order remain one-time acknowledgements, offered
 * only while `purchaseStatus === 'pending'` (matching 0089's original
 * single-step lifecycle already in place for "Bought"). With an open order
 * (0137) Receive is pre-filled with the open quantity and the row's •••
 * menu offers "Cancel the rest".
 */
function ActionControls({ item, locationId, lang, onChanged, openOrder }: Omit<RowProps, 'locationTimezone' | 'staffNameById' | 't'>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      {item.purchaseStatus === 'pending' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          <MarkBoughtButton locationId={locationId} itemId={item.itemId} itemName={item.name} lang={lang} onSuccess={onChanged} />
          <OrderForm locationId={locationId} itemId={item.itemId} itemName={item.name} unit={item.unit} lang={lang} onSuccess={onChanged} />
        </div>
      ) : null}
      <ReceiveRow
        locationId={locationId}
        itemId={item.itemId}
        itemName={item.name}
        unit={item.unit}
        expectedStockCountId={item.latestStockCountId}
        openOrder={openOrder}
        lang={lang}
        onChanged={onChanged}
      />
    </div>
  );
}

/**
 * Receive form (+ the ••• "Cancel the rest" menu when there is an open
 * order). Shared by shopping-list rows and the 「入荷待ち」 section. The
 * form is keyed by the open quantity so a refresh after a partial delivery
 * re-seeds the pre-filled quantity with the new remainder.
 */
function ReceiveRow({
  locationId,
  itemId,
  itemName,
  unit,
  expectedStockCountId,
  openOrder,
  lang,
  onChanged,
}: {
  locationId: string;
  itemId: string;
  itemName: string;
  unit: string;
  expectedStockCountId: string;
  openOrder?: PurchaseAwaitingDeliveryItem;
  lang: ReturnType<typeof useLang>['lang'];
  onChanged: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, justifyContent: 'flex-end' }}>
      <ReceiveForm
        key={`${openOrder?.orderActionId ?? 'none'}:${openOrder?.openOrderQuantity ?? ''}`}
        locationId={locationId}
        itemId={itemId}
        itemName={itemName}
        unit={unit}
        expectedStockCountId={expectedStockCountId}
        defaultQuantity={openOrder?.openOrderQuantity}
        lang={lang}
        onSuccess={onChanged}
      />
      {openOrder ? (
        <CancelRestMenu
          locationId={locationId}
          itemId={itemId}
          itemName={itemName}
          unit={unit}
          orderActionId={openOrder.orderActionId}
          openQuantity={openOrder.openOrderQuantity}
          lang={lang}
          onSuccess={onChanged}
        />
      ) : null}
    </div>
  );
}

/**
 * 「入荷待ち」 (0137): open orders of items that are NOT on the shopping list
 * any more -- typically "ordered 8 L, received 4 L" lifted the stock above
 * the reorder point. Items still short show their open order inline on their
 * own row instead (`splitAwaitingDelivery`), so no item appears twice. One
 * card list for every width (no table/card duplication needed for a short,
 * secondary list).
 */
function AwaitingDeliverySection({
  entries,
  locationId,
  locationTimezone,
  staffNameById,
  lang,
  t,
  onChanged,
}: {
  entries: PurchaseAwaitingDeliveryItem[];
  locationId: string;
  locationTimezone: string;
  staffNameById: Record<string, string>;
  lang: ReturnType<typeof useLang>['lang'];
  t: T;
  onChanged: () => void;
}) {
  return (
    <section aria-labelledby="purchases-awaiting-delivery-title" style={{ marginTop: 20 }}>
      <h2 id="purchases-awaiting-delivery-title" style={{ margin: 0, fontSize: 16 }}>
        {t('awaitingSectionTitle')} ({entries.length})
      </h2>
      <p style={{ margin: '4px 0 0', ...mutedText, fontSize: 12 }}>{t('awaitingSectionHint')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {entries.map((entry) => {
          const actorName = entry.orderedByStaffId ? staffNameById[entry.orderedByStaffId] : undefined;
          return (
            <div key={entry.itemId} style={{ ...card, marginTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 16, overflowWrap: 'anywhere' }}>{entry.name}</h3>
                  <div style={{ marginTop: 4 }}>
                    <AwaitingLine openOrder={entry} unit={entry.unit} lang={lang} />
                  </div>
                  <div style={{ ...mutedText, fontSize: 12, marginTop: 2 }}>
                    {t('stockNowLabel')} {entry.actualQuantity} {entry.unit} · {t('reorderAtLabel')} {entry.reorderPoint} {entry.unit}
                  </div>
                  <div style={{ ...mutedText, fontSize: 11, marginTop: 2 }}>
                    {t('orderedAtLabel')} {formatTimestamp(entry.orderedAt, lang, locationTimezone)}
                    {actorName ? ` · ${t('boughtByPrefix')} ${actorName}` : ''}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <ReceiveRow
                    locationId={locationId}
                    itemId={entry.itemId}
                    itemName={entry.name}
                    unit={entry.unit}
                    expectedStockCountId={entry.latestStockCountId}
                    openOrder={entry}
                    lang={lang}
                    onChanged={onChanged}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TableRow({ item, locationId, locationTimezone, staffNameById, lang, t, onChanged, openOrder }: RowProps) {
  const settled = item.purchaseStatus !== 'pending';
  return (
    <tr>
      <td style={{ ...tableCell, borderLeft: settled ? '3px solid transparent' : `3px solid ${colors.danger}` }}>
        <div style={{ fontWeight: 600 }}>{item.name}</div>
      </td>
      <td style={tableCell}>
        <div style={{ fontWeight: 600, color: settled ? colors.textMuted : colors.dangerText }}>
          {t('needToBuyLabel')} {item.shortageQuantity} {item.unit}
        </div>
        <div style={{ ...mutedText, fontSize: 12, marginTop: 2 }}>
          {t('reorderAtLabel')} {item.reorderPoint} {item.unit} · {t('targetLabel')} {item.requiredQuantity} {item.unit}
        </div>
      </td>
      <td style={{ ...tableCell, textAlign: 'right' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <StatusInfo item={item} locationTimezone={locationTimezone} staffNameById={staffNameById} lang={lang} t={t} openOrder={openOrder} />
          <ActionControls item={item} locationId={locationId} lang={lang} onChanged={onChanged} openOrder={openOrder} />
        </div>
      </td>
    </tr>
  );
}

function ItemCard({ item, locationId, locationTimezone, staffNameById, lang, t, onChanged, openOrder }: RowProps) {
  const settled = item.purchaseStatus !== 'pending';
  // Founder Acceptance QA1 2026-09-22 (Staff, 375px): a settled card used to also
  // get `opacity: 0.85` on top of `colors.textMuted` text -- stacking the two
  // pushed "Need to buy"/"Reorder at" below WCAG AA contrast (~4.15:1 measured,
  // need 4.5:1). The muted text color alone already signals "resolved" without
  // dimming the whole card.
  return (
    <div style={{ ...card, marginTop: 0, borderLeft: settled ? card.border : `3px solid ${colors.danger}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, overflowWrap: 'anywhere' }}>{item.name}</h3>
          <div style={{ fontWeight: 600, marginTop: 4, color: settled ? colors.textMuted : colors.dangerText }}>
            {t('needToBuyLabel')} {item.shortageQuantity} {item.unit}
          </div>
          <div style={{ ...mutedText, fontSize: 12, marginTop: 2 }}>
            {t('reorderAtLabel')} {item.reorderPoint} {item.unit} · {t('targetLabel')} {item.requiredQuantity} {item.unit}
          </div>
        </div>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <StatusInfo item={item} locationTimezone={locationTimezone} staffNameById={staffNameById} lang={lang} t={t} openOrder={openOrder} />
          <ActionControls item={item} locationId={locationId} lang={lang} onChanged={onChanged} openOrder={openOrder} />
        </div>
      </div>
    </div>
  );
}

const historyActionLabel = (t: T, actionType: PurchaseHistoryEntry['actionType']) =>
  actionType === 'bought'
    ? t('historyActionBought')
    : actionType === 'ordered'
      ? t('historyActionOrdered')
      : actionType === 'order_closed'
        ? t('historyActionOrderClosed')
        : t('historyActionReceived');

function historyQuantity(entry: PurchaseHistoryEntry) {
  if (entry.actionType === 'ordered') return entry.orderedQuantity;
  if (entry.actionType === 'received') return entry.receivedQuantity;
  return null;
}

/** Read-only "History" tab: the full append-only log (0120, `api.purchase_history`), newest first. Reuses the same theme.ts table/card styles as the rest of this legacy-theme page -- not a new design-system component (out of scope, tracked separately). */
function HistoryList({
  history,
  staffNameById,
  locationTimezone,
  lang,
  t,
}: {
  history: PurchaseHistoryEntry[] | null;
  staffNameById: Record<string, string>;
  locationTimezone: string;
  lang: ReturnType<typeof useLang>['lang'];
  t: T;
}) {
  if (history === null) {
    return (
      <section style={{ ...card, marginTop: 12 }}>
        <p style={{ margin: 0, ...mutedText }}>{t('unavailable')}</p>
      </section>
    );
  }

  if (history.length === 0) {
    return (
      <section style={{ ...card, marginTop: 12 }}>
        <p style={{ margin: 0, ...mutedText }}>{t('historyEmpty')}</p>
      </section>
    );
  }

  return (
    <>
      <div className={responsiveTable.tableView} style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('pageTitle')}</th>
              <th style={{ ...tableHeaderCell, textAlign: 'left' }} />
              <th style={{ ...tableHeaderCell, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => {
              const quantity = historyQuantity(entry);
              const actorName = entry.actionedByStaffId ? staffNameById[entry.actionedByStaffId] : undefined;
              return (
                <tr key={entry.actionId}>
                  <td style={tableCell}>
                    <div style={{ fontWeight: 600 }}>{entry.itemName}</div>
                  </td>
                  <td style={tableCell}>
                    <span style={{ fontWeight: 600, color: colors.accent }}>{historyActionLabel(t, entry.actionType)}</span>
                    {quantity !== null ? (
                      <span style={{ ...mutedText, marginLeft: 8 }}>
                        {quantity} {entry.unit}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ ...tableCell, textAlign: 'right' }}>
                    <div style={{ fontSize: 12 }}>{formatTimestamp(entry.actionedAt, lang, locationTimezone)}</div>
                    {actorName ? <div style={{ ...mutedText, fontSize: 11, marginTop: 2 }}>{actorName}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={responsiveTable.cardView} style={{ marginTop: 12, flexDirection: 'column', gap: 10 }}>
        {history.map((entry) => {
          const quantity = historyQuantity(entry);
          const actorName = entry.actionedByStaffId ? staffNameById[entry.actionedByStaffId] : undefined;
          return (
            <div key={entry.actionId} style={{ ...card, marginTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 16, overflowWrap: 'anywhere' }}>{entry.itemName}</h3>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontWeight: 600, color: colors.accent }}>{historyActionLabel(t, entry.actionType)}</span>
                    {quantity !== null ? (
                      <span style={{ ...mutedText, marginLeft: 8 }}>
                        {quantity} {entry.unit}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 12 }}>{formatTimestamp(entry.actionedAt, lang, locationTimezone)}</div>
                  {actorName ? <div style={{ ...mutedText, fontSize: 11, marginTop: 2 }}>{actorName}</div> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Outer wrapper: mounts the shared `LangProvider`, matching Inventory's own `InventoryDashboardClient`/`InventoryDashboardBody` split. */
export function PurchasesDashboardClient(props: PurchasesDashboardClientProps) {
  return (
    <LangProvider>
      <PurchasesDashboardBody {...props} />
    </LangProvider>
  );
}

export function PurchasesDashboardBody({
  tenantName,
  locationName,
  locationId,
  locationTimezone,
  items,
  staffNameById,
  history,
  awaiting,
  embedded = false,
}: PurchasesDashboardClientProps) {
  const { lang } = useLang();
  const t: T = (key) => tPurchasesDashboard(lang, key);
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');

  function refresh() {
    router.refresh();
  }

  const pendingCount = items.filter((i) => i.purchaseStatus === 'pending').length;
  const boughtCount = items.filter((i) => i.purchaseStatus === 'bought').length;
  const orderedCount = items.filter((i) => i.purchaseStatus === 'ordered').length;
  const receivedCount = items.filter((i) => i.purchaseStatus === 'received').length;
  const visibleItems =
    filter === 'history'
      ? []
      : items
          .filter((item) => (filter === 'all' ? true : item.purchaseStatus === filter))
          .slice()
          .sort((a, b) => {
            if (a.purchaseStatus !== b.purchaseStatus) return STATUS_RANK[a.purchaseStatus] - STATUS_RANK[b.purchaseStatus];
            return a.name.localeCompare(b.name);
          });

  const rowProps = { locationId, locationTimezone, staffNameById, lang, t, onChanged: refresh };

  // One place per item: still-short items carry their open order inline on
  // their own row; only not-short ones go to the 「入荷待ち」 section, which
  // belongs to the "All" and "Ordered" views.
  const { openOrderByItemId, awaitingOnly } = splitAwaitingDelivery(
    items.map((i) => i.itemId),
    awaiting ?? [],
  );
  const showAwaitingSection = (filter === 'all' || filter === 'ordered') && awaitingOnly.length > 0;

  return (
    <>
      {!embedded ? (
        <header>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{t('pageTitle')}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PreviewLanguageToggle />
              <SignOutButton label={t('signOut')} />
            </div>
          </div>
          <p style={{ margin: '8px 0 0', ...mutedText }}>
            {t('pageDescription')} {tenantName} — {locationName}.
          </p>
          <Link href="/staff" style={{ ...backLink, marginTop: 12 }}>
            {t('backToDashboard')}
          </Link>
        </header>
      ) : null}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: embedded ? 0 : 16 }}>
        {(['all', 'pending', 'bought', 'ordered', 'received', 'history'] as const).map((value) => {
          const label =
            value === 'all'
              ? t('filterAll')
              : value === 'pending'
                ? t('filterPending')
                : value === 'bought'
                  ? t('filterBought')
                  : value === 'ordered'
                    ? t('filterOrdered')
                    : value === 'received'
                      ? t('filterReceived')
                      : t('filterHistory');
          // "All" and "Ordered" also list the 「入荷待ち」 section, so their
          // counts include it (a chip count must match what the view shows).
          const count =
            value === 'all'
              ? items.length + awaitingOnly.length
              : value === 'pending'
                ? pendingCount
                : value === 'bought'
                  ? boughtCount
                  : value === 'ordered'
                    ? orderedCount + awaitingOnly.length
                    : value === 'received'
                      ? receivedCount
                      : (history?.length ?? 0);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              className={hoverStyles.buttonSecondary}
              style={{
                ...(filter === value ? { ...buttonSecondary, background: colors.accentMuted, color: colors.accent } : buttonSecondary),
                flex: '1 1 84px',
                textAlign: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
              }}
              onClick={() => setFilter(value)}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {filter === 'history' ? (
        <HistoryList history={history} staffNameById={staffNameById} locationTimezone={locationTimezone} lang={lang} t={t} />
      ) : items.length === 0 ? (
        <section style={{ ...card, marginTop: 12 }}>
          <p style={{ margin: 0, ...mutedText }}>{t('noItemsYet')}</p>
        </section>
      ) : visibleItems.length === 0 ? (
        showAwaitingSection ? null : (
          <section style={{ ...card, marginTop: 12 }}>
            <p style={{ margin: 0, ...mutedText }}>{t('noItemsMatchFilter')}</p>
          </section>
        )
      ) : (
        <>
          <div className={responsiveTable.tableView} style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('pageTitle')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }} />
                  <th style={{ ...tableHeaderCell, textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <TableRow key={item.itemId} item={item} {...rowProps} openOrder={openOrderByItemId.get(item.itemId)} />
                ))}
              </tbody>
            </table>
          </div>

          <div className={responsiveTable.cardView} style={{ marginTop: 12, flexDirection: 'column', gap: 10 }}>
            {visibleItems.map((item) => (
              <ItemCard key={item.itemId} item={item} {...rowProps} openOrder={openOrderByItemId.get(item.itemId)} />
            ))}
          </div>

          <div
            className={purchasesFooter.footer}
            style={{ ...card, marginTop: 12, gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}
          >
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <span>
                <strong>{items.length}</strong> <span style={mutedText}>{t('footerTotalItems')}</span>
              </span>
              <span>
                <strong style={{ color: colors.accent }}>{boughtCount}</strong> <span style={mutedText}>{t('footerBought')}</span>
              </span>
              <span>
                <strong style={{ color: pendingCount > 0 ? colors.dangerText : undefined }}>{pendingCount}</strong>{' '}
                <span style={mutedText}>{t('footerPending')}</span>
              </span>
            </div>
          </div>
        </>
      )}

      {showAwaitingSection ? (
        <AwaitingDeliverySection
          entries={awaitingOnly}
          locationId={locationId}
          locationTimezone={locationTimezone}
          staffNameById={staffNameById}
          lang={lang}
          t={t}
          onChanged={refresh}
        />
      ) : null}
    </>
  );
}
