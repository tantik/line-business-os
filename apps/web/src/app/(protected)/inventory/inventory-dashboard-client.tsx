'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import { deleteInventoryItemAction, setInventoryItemActiveAction } from '@/lib/inventory/manager-actions';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { ActionsMenu, ConfirmDialog, LightboxTrigger, Modal } from '@/components/shared/design-kit';
import {
  backLink,
  badgeStyle,
  buttonPrimary,
  buttonSecondary,
  card,
  colors,
  input,
  mutedText,
  tableCell,
  tableHeaderCell,
} from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import responsiveTable from '@/lib/ui/responsive-table.module.css';
import inventoryFooter from './inventory-footer.module.css';
import { ItemForm } from './item-form';
import { CountForm } from './count-form';
import { describeInventoryWriteError } from './error-copy';
import { tInventoryDashboard } from './inventory-i18n';

export interface InventoryDashboardClientProps {
  tenantName: string;
  locationName: string;
  locationId: string;
  /** Location's IANA timezone, used to render `countedAt` consistently between server and client (avoids a hydration mismatch). */
  locationTimezone: string;
  items: InventoryItemStatus[];
  /** Signed URLs for every item that has a photo, keyed by `itemId` (see `createInventoryMediaUrlMap`). Items without an entry here render a placeholder. */
  mediaUrlByItemId: Record<string, string>;
  /** Pure UX affordance (RLS is the real boundary regardless): whether to show catalog management controls. */
  canManage: boolean;
  /** Manager-only decrypted staff-id -> display-name map (see page.tsx). Always empty for a non-manager caller -- staff never see another employee's name here. */
  staffNameById: Record<string, string>;
  /**
   * True only when rendered inside the Manager dashboard's Inventory popup
   * (WP A5) -- skips this component's own page-level `<header>` (title,
   * language toggle, sign-out, back-link), since the popup already sits
   * inside the Manager page's own header/chrome. `useLang()` still resolves
   * correctly without an embedded `LangProvider`: the popup renders
   * `InventoryDashboardBody` directly inside the Manager page's own
   * `LangProvider`, not through the default-exported `InventoryDashboardClient`
   * wrapper below. Defaults false -- the standalone `/inventory` page's own
   * behavior is completely unchanged.
   */
  embedded?: boolean;
  /**
   * Which filter tab to start on. Defaults to 'all'. Used by the Manager
   * dashboard's "Needs attention" panel: clicking its "Inventory shortage"
   * item used to always open this popup on "All", forcing the manager to
   * click "Need reorder" themselves every time -- passing 'shortage' here
   * opens straight on the tab that answers what they clicked for.
   */
  initialStatusFilter?: 'all' | 'shortage' | 'ok' | 'inactive';
}

type T = (key: Parameters<typeof tInventoryDashboard>[1]) => string;
type SortKey = 'name' | 'shortage';

function StatusBadge({ item, t }: { item: InventoryItemStatus; t: T }) {
  if (!item.isActive) {
    return <span style={badgeStyle('inactive')}>{t('statusInactiveLabel')}</span>;
  }
  if (item.status === 'unknown') {
    return <span style={badgeStyle('neutral')}>{t('statusNotCounted')}</span>;
  }
  if (item.status === 'shortage') {
    return <span style={badgeStyle('warning')}>⚠ {t('statusShortageBadge')}</span>;
  }
  return <span style={badgeStyle('active')}>{t('statusSufficient')}</span>;
}

function formatLastUpdated(item: InventoryItemStatus, lang: ReturnType<typeof useLang>['lang'], locationTimezone: string) {
  if (!item.countedAt) return null;
  return new Date(item.countedAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', { timeZone: locationTimezone });
}

interface RowProps {
  item: InventoryItemStatus;
  mediaUrl: string | null;
  locationId: string;
  locationTimezone: string;
  canManage: boolean;
  staffNameById: Record<string, string>;
  onEdit: () => void;
  lang: ReturnType<typeof useLang>['lang'];
  t: T;
  onChanged: () => void;
}

/** Photo thumbnail, matching the size/placeholder pattern of the recipe list's own thumbnail. Click-to-enlarge (`LightboxTrigger`) when a photo exists; a plain placeholder box otherwise -- never itself clickable. */
function ItemThumbnail({ mediaUrl, name, size }: { mediaUrl: string | null; name: string; size: number }) {
  if (mediaUrl) {
    return (
      <LightboxTrigger
        src={mediaUrl}
        alt={name}
        thumbnailStyle={{ width: size, height: size, flexShrink: 0, borderRadius: 8, border: `1px solid ${colors.border}` }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 8,
        border: `1px solid ${colors.border}`,
        background: colors.surfaceElevated,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <span style={{ fontSize: size * 0.45 }}>📦</span>
    </div>
  );
}

function useRowActions({ item, onChanged }: Pick<RowProps, 'item' | 'onChanged'>) {
  const [isPending, setIsPending] = useState(false);
  const [confirmToggleActive, setConfirmToggleActive] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  function setActive(nextActive: boolean) {
    setIsPending(true);
    const formData = new FormData();
    formData.set('itemId', item.itemId);
    formData.set('isActive', nextActive ? 'true' : 'false');
    setInventoryItemActiveAction(formData).finally(() => {
      setIsPending(false);
      onChanged();
    });
  }

  function handleDelete() {
    setRowError(null);
    setIsPending(true);
    const formData = new FormData();
    formData.set('itemId', item.itemId);
    deleteInventoryItemAction(formData).then((result) => {
      setIsPending(false);
      setConfirmDeleteOpen(false);
      if (result.status === 'success') {
        onChanged();
      } else {
        setRowError(describeInventoryWriteError(result));
      }
    });
  }

  return {
    isPending,
    confirmToggleActive,
    setConfirmToggleActive,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    rowError,
    setActive,
    handleDelete,
  };
}

function TableRow({ item, mediaUrl, locationId, locationTimezone, canManage, staffNameById, onEdit, lang, t, onChanged }: RowProps) {
  const { isPending, confirmToggleActive, setConfirmToggleActive, confirmDeleteOpen, setConfirmDeleteOpen, rowError, setActive, handleDelete } =
    useRowActions({ item, onChanged });
  const lastUpdated = formatLastUpdated(item, lang, locationTimezone);
  const belowReorder = item.isActive && item.status === 'shortage';

  return (
    <tr style={{ opacity: item.isActive ? 1 : 0.6 }}>
      {/* `border` on a plain `<tr>` doesn't paint under `border-collapse`; the shortage marker has to live on the cell itself. */}
      <td style={{ ...tableCell, borderLeft: belowReorder ? `3px solid ${colors.danger}` : '3px solid transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ItemThumbnail mediaUrl={mediaUrl} name={item.name} size={40} />
          <div>
            <div style={{ fontWeight: 600 }}>{item.name}</div>
            {lastUpdated ? (
              <div style={{ ...mutedText, fontSize: 12, marginTop: 2 }}>
                {t('lastUpdatedLabel')} {lastUpdated}
                {canManage && item.countedByStaffId ? ` · ${staffNameById[item.countedByStaffId] ?? t('unknownStaffLabel')}` : ''}
              </div>
            ) : null}
            {rowError ? <div style={{ marginTop: 4, fontSize: 12, color: colors.dangerText }}>{rowError}</div> : null}
          </div>
        </div>
      </td>
      {/* Target/Reorder-at/Current combined into one compact cell (Founder direction, 2026-08-24: match the mobile card's single-line arrangement instead of three separate columns). */}
      <td style={{ ...tableCell, color: belowReorder ? colors.dangerText : colors.textPrimary }}>
        {t('targetLabel')} {item.requiredQuantity} {item.unit}
        <br />
        {t('reorderAtLabel')} {item.reorderPoint} {item.unit}
        <br />
        <span style={{ fontWeight: belowReorder ? 600 : 400 }}>
          {t('currentLabel')} {item.actualQuantity === null ? '—' : `${item.actualQuantity} ${item.unit}`}
        </span>
      </td>
      <td style={tableCell}>
        {item.isActive ? (
          <CountForm
            locationId={locationId}
            itemId={item.itemId}
            itemName={item.name}
            unit={item.unit}
            initialValue={item.actualQuantity}
            lang={lang}
            onSuccess={onChanged}
          />
        ) : (
          <span style={mutedText}>—</span>
        )}
      </td>
      <td style={tableCell}>
        <StatusBadge item={item} t={t} />
      </td>
      <td style={{ ...tableCell, color: belowReorder ? colors.dangerText : colors.textMuted }}>
        {belowReorder ? `−${item.shortageQuantity} ${item.unit}` : '—'}
      </td>
      {canManage ? (
        <td style={tableCell}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              aria-label={`${t('editButton')} ${item.name}`}
              className={hoverStyles.iconButton}
              style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.surface, cursor: 'pointer' }}
              onClick={onEdit}
            >
              ✎
            </button>
            <ActionsMenu
              triggerLabel={`${t('moreActionsAriaLabel')} — ${item.name}`}
              items={[
                item.isActive
                  ? { label: t('deactivateButton'), onClick: () => setConfirmToggleActive(true), disabled: isPending }
                  : { label: t('reactivateButton'), onClick: () => setActive(true), disabled: isPending },
                // 0082 (Founder decision, 2026-08-23): permanent delete now
                // works for a counted item too -- it deletes the item's own
                // stock-count history along with it. Always offered again;
                // no client-side gating on countedAt.
                { label: t('deleteButton'), onClick: () => setConfirmDeleteOpen(true), danger: true, disabled: isPending },
              ]}
            />
          </div>
        </td>
      ) : null}

      <RowConfirmDialogs
        item={item}
        t={t}
        isPending={isPending}
        confirmToggleActive={confirmToggleActive}
        setConfirmToggleActive={setConfirmToggleActive}
        confirmDeleteOpen={confirmDeleteOpen}
        setConfirmDeleteOpen={setConfirmDeleteOpen}
        setActive={setActive}
        handleDelete={handleDelete}
      />
    </tr>
  );
}

function RowConfirmDialogs({
  item,
  t,
  isPending,
  confirmToggleActive,
  setConfirmToggleActive,
  confirmDeleteOpen,
  setConfirmDeleteOpen,
  setActive,
  handleDelete,
}: {
  item: InventoryItemStatus;
  t: T;
  isPending: boolean;
  confirmToggleActive: boolean;
  setConfirmToggleActive: (v: boolean) => void;
  confirmDeleteOpen: boolean;
  setConfirmDeleteOpen: (v: boolean) => void;
  setActive: (v: boolean) => void;
  handleDelete: () => void;
}) {
  return (
    <>
      <ConfirmDialog
        open={confirmToggleActive}
        title={t('confirmDeactivateItemTitle')}
        confirmLabel={t('deactivateButton')}
        cancelLabel={t('cancelButton')}
        pending={isPending}
        danger
        onCancel={() => setConfirmToggleActive(false)}
        onConfirm={() => {
          setConfirmToggleActive(false);
          setActive(false);
        }}
      >
        {item.name}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={t('confirmDeleteItemTitle')}
        confirmLabel={t('deleteButton')}
        cancelLabel={t('cancelButton')}
        pending={isPending}
        danger
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
      >
        {t('confirmDeleteItemBody')}
      </ConfirmDialog>
    </>
  );
}

function ItemCard({ item, mediaUrl, locationId, locationTimezone, canManage, staffNameById, onEdit, lang, t, onChanged }: RowProps) {
  const { isPending, confirmToggleActive, setConfirmToggleActive, confirmDeleteOpen, setConfirmDeleteOpen, rowError, setActive, handleDelete } =
    useRowActions({ item, onChanged });
  const lastUpdated = formatLastUpdated(item, lang, locationTimezone);
  const belowReorder = item.isActive && item.status === 'shortage';

  return (
    <div style={{ ...card, marginTop: 0, opacity: item.isActive ? 1 : 0.6, borderLeft: belowReorder ? `3px solid ${colors.danger}` : card.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <ItemThumbnail mediaUrl={mediaUrl} name={item.name} size={44} />
          <h3 style={{ margin: 0, fontSize: 16, minWidth: 0, overflowWrap: 'anywhere' }}>{item.name}</h3>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <StatusBadge item={item} t={t} />
          {canManage ? (
            <>
              <button
                type="button"
                aria-label={`${t('editButton')} ${item.name}`}
                className={hoverStyles.iconButton}
                style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.surface, cursor: 'pointer' }}
                onClick={onEdit}
              >
                ✎
              </button>
              <ActionsMenu
                triggerLabel={`${t('moreActionsAriaLabel')} — ${item.name}`}
                items={[
                  item.isActive
                    ? { label: t('deactivateButton'), onClick: () => setConfirmToggleActive(true), disabled: isPending }
                    : { label: t('reactivateButton'), onClick: () => setActive(true), disabled: isPending },
                  { label: t('deleteButton'), onClick: () => setConfirmDeleteOpen(true), danger: true, disabled: isPending },
                ]}
              />
            </>
          ) : null}
        </div>
      </div>
      <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 13 }}>
        {t('targetLabel')} {item.requiredQuantity} {item.unit} · {t('reorderAtLabel')} {item.reorderPoint} {item.unit} ·{' '}
        {t('currentLabel')} {item.actualQuantity === null ? '—' : `${item.actualQuantity} ${item.unit}`}
      </p>
      {lastUpdated ? (
        <p style={{ margin: '2px 0 0', ...mutedText, fontSize: 12 }}>
          {t('lastUpdatedLabel')} {lastUpdated}
          {canManage && item.countedByStaffId ? ` · ${staffNameById[item.countedByStaffId] ?? t('unknownStaffLabel')}` : ''}
        </p>
      ) : null}
      {rowError ? <p style={{ margin: '4px 0 0', fontSize: 12, color: colors.dangerText }}>{rowError}</p> : null}
      {item.isActive ? (
        <div style={{ marginTop: 8 }}>
          <CountForm
            locationId={locationId}
            itemId={item.itemId}
            itemName={item.name}
            unit={item.unit}
            initialValue={item.actualQuantity}
            lang={lang}
            onSuccess={onChanged}
          />
        </div>
      ) : null}

      <RowConfirmDialogs
        item={item}
        t={t}
        isPending={isPending}
        confirmToggleActive={confirmToggleActive}
        setConfirmToggleActive={setConfirmToggleActive}
        confirmDeleteOpen={confirmDeleteOpen}
        setConfirmDeleteOpen={setConfirmDeleteOpen}
        setActive={setActive}
        handleDelete={handleDelete}
      />
    </div>
  );
}

/**
 * Outer wrapper: mounts the shared `LangProvider` around the whole
 * Inventory page body, matching the same pattern the canonical Staff
 * dashboard and Admin page use -- a component cannot call `useLang()`
 * above its own `LangProvider` ancestor.
 */
export function InventoryDashboardClient(props: InventoryDashboardClientProps) {
  return (
    <LangProvider>
      <InventoryDashboardBody {...props} />
    </LangProvider>
  );
}

export function InventoryDashboardBody({
  tenantName,
  locationName,
  locationId,
  locationTimezone,
  items,
  mediaUrlByItemId,
  canManage,
  staffNameById,
  embedded = false,
  initialStatusFilter = 'all',
}: InventoryDashboardClientProps) {
  const { lang } = useLang();
  const t: T = (key) => tInventoryDashboard(lang, key);
  const router = useRouter();
  // 2026-08-21 redesign: Add/Edit is a real popup (`Modal`), not an inline
  // section pushing the list down -- matches the Recipes module and the
  // Founder's explicit "should be a popup, not expand at the top" direction.
  const [editing, setEditing] = useState<'new' | InventoryItemStatus | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'shortage' | 'ok' | 'inactive'>(initialStatusFilter);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [search, setSearch] = useState('');
  const editTriggerRef = useRef<HTMLElement | null>(null);

  function openEditor(target: 'new' | InventoryItemStatus) {
    editTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(target);
  }

  function closeEditor() {
    setEditing(null);
    requestAnimationFrame(() => editTriggerRef.current?.focus());
  }

  function refresh() {
    router.refresh();
  }

  const activeItems = items.filter((i) => i.isActive);
  const shortageCount = activeItems.filter((i) => i.status === 'shortage').length;
  const okCount = activeItems.filter((i) => i.status !== 'shortage').length;
  const inactiveCount = items.length - activeItems.length;
  const normalizedSearch = search.trim().toLowerCase();
  const searchFiltered = items.filter((item) => normalizedSearch === '' || item.name.toLowerCase().includes(normalizedSearch));
  const visibleItems = searchFiltered
    .filter((item) => {
      switch (statusFilter) {
        case 'shortage':
          return item.isActive && item.status === 'shortage';
        case 'ok':
          return item.isActive && item.status !== 'shortage';
        case 'inactive':
          return !item.isActive;
        default:
          return true;
      }
    })
    .slice()
    .sort((a, b) => {
      if (sortKey === 'shortage') {
        const aShortage = a.isActive && a.status === 'shortage' ? 1 : 0;
        const bShortage = b.isActive && b.status === 'shortage' ? 1 : 0;
        if (aShortage !== bShortage) return bShortage - aShortage;
      }
      return a.name.localeCompare(b.name);
    });

  const editingItem =
    editing && editing !== 'new'
      ? {
          itemId: editing.itemId,
          tenantId: editing.tenantId,
          locationId: editing.locationId,
          name: editing.name,
          unit: editing.unit,
          requiredQuantity: editing.requiredQuantity,
          reorderPoint: editing.reorderPoint,
          sortOrder: editing.sortOrder,
          isActive: editing.isActive,
          createdAt: '',
          updatedAt: '',
          mediaPath: editing.mediaPath,
        }
      : undefined;

  const rowProps = { locationId, locationTimezone, canManage, staffNameById, lang, t, onChanged: refresh };

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
          <Link href={canManage ? '/manager' : '/staff'} style={{ ...backLink, marginTop: 12 }}>
            {t('backToDashboard')}
          </Link>
        </header>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: embedded ? 0 : 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%' }}>
          {(canManage ? (['all', 'shortage', 'ok', 'inactive'] as const) : (['all', 'shortage', 'ok'] as const)).map((value) => {
            const label =
              value === 'all' ? t('filterAll') : value === 'shortage' ? t('filterShortage') : value === 'ok' ? t('filterOk') : t('filterInactive');
            const count = value === 'all' ? items.length : value === 'shortage' ? shortageCount : value === 'ok' ? okCount : inactiveCount;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={statusFilter === value}
                className={hoverStyles.buttonSecondary}
                style={{
                  ...(statusFilter === value ? { ...buttonSecondary, background: colors.accentMuted, color: colors.accent } : buttonSecondary),
                  flex: '1 1 84px',
                  textAlign: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => setStatusFilter(value)}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
        {canManage ? (
          <button type="button" className={hoverStyles.buttonPrimary} style={buttonPrimary} onClick={() => openEditor('new')}>
            {t('addItem')}
          </button>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ ...input, flex: 1, minWidth: 160, marginTop: 0 }}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...mutedText, fontSize: 13 }}>
          {t('sortLabel')}:
          <select
            style={{ ...input, marginTop: 0, width: 'auto', minHeight: 36, padding: '6px 8px' }}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="name">{t('sortNameAsc')}</option>
            <option value="shortage">{t('sortShortageFirst')}</option>
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <section style={card}>
          <p style={{ margin: 0, ...mutedText }}>{t('noItemsYet')}</p>
        </section>
      ) : visibleItems.length === 0 ? (
        <section style={card}>
          <p style={{ margin: 0, ...mutedText }}>{t('noItemsMatchFilter')}</p>
        </section>
      ) : (
        <>
          <div className={responsiveTable.tableView} style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colItem')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>
                    {t('colTarget')} / {t('colReorderAt')} / {t('colCurrent')}
                  </th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colActualQuantity')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStatus')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colShortage')}</th>
                  {canManage ? <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colActions')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <TableRow key={item.itemId} item={item} mediaUrl={mediaUrlByItemId[item.itemId] ?? null} onEdit={() => openEditor(item)} {...rowProps} />
                ))}
              </tbody>
            </table>
          </div>

          <div className={responsiveTable.cardView} style={{ marginTop: 12, flexDirection: 'column', gap: 10 }}>
            {visibleItems.map((item) => (
              <ItemCard key={item.itemId} item={item} mediaUrl={mediaUrlByItemId[item.itemId] ?? null} onEdit={() => openEditor(item)} {...rowProps} />
            ))}
          </div>

          <div
            className={inventoryFooter.footer}
            style={{
              ...card,
              marginTop: 12,
              gap: 16,
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <span>
                <strong>{items.length}</strong> <span style={mutedText}>{t('footerTotalItems')}</span>
              </span>
              <span>
                <strong style={{ color: shortageCount > 0 ? colors.dangerText : undefined }}>{shortageCount}</strong>{' '}
                <span style={mutedText}>{t('footerNeedRestocking')}</span>
              </span>
              <span>
                <strong style={{ color: colors.accent }}>{okCount}</strong> <span style={mutedText}>{t('footerSufficient')}</span>
              </span>
            </div>
            <span style={{ ...mutedText, fontSize: 12 }}>{t('footerTip')}</span>
          </div>
        </>
      )}

      <Modal
        open={editing !== null}
        onClose={closeEditor}
        title={editing === 'new' ? t('newItemHeading') : `${t('editItemHeading')} — ${editingItem?.name ?? ''}`}
        width="min(480px, 94vw)"
        closeLabel={t('cancelButton')}
      >
        {editing ? (
          <ItemForm
            locationId={locationId}
            item={editingItem}
            mediaUrl={editingItem ? (mediaUrlByItemId[editingItem.itemId] ?? null) : null}
            lang={lang}
            onSuccess={() => {
              closeEditor();
              refresh();
            }}
            onCancel={closeEditor}
          />
        ) : null}
      </Modal>
    </>
  );
}
