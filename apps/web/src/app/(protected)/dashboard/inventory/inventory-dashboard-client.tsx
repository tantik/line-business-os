'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import { setInventoryItemActiveAction } from '@/lib/inventory/manager-actions';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { badgeStyle, buttonPrimary, buttonSecondary, card, input, linkAccent, mutedText } from '@/lib/ui/theme';
import { ItemForm } from './item-form';
import { CountForm } from './count-form';
import { tInventoryDashboard } from './inventory-i18n';

export interface InventoryDashboardClientProps {
  tenantName: string;
  locationName: string;
  locationId: string;
  items: InventoryItemStatus[];
  /** Pure UX affordance (RLS is the real boundary regardless): whether to show catalog management controls. */
  canManage: boolean;
  /** Manager-only decrypted staff-id -> display-name map (see page.tsx). Always empty for a non-manager caller -- staff never see another employee's name here. */
  staffNameById: Record<string, string>;
}

type T = (key: Parameters<typeof tInventoryDashboard>[1]) => string;

function StatusBadge({ item, t }: { item: InventoryItemStatus; t: T }) {
  if (item.status === 'unknown') {
    return <span style={badgeStyle('neutral')}>{t('statusNotCounted')}</span>;
  }
  if (item.status === 'shortage') {
    return (
      <span style={badgeStyle('warning')} aria-label={`${t('statusShortageLabel')} ${item.shortageQuantity} ${item.unit}`}>
        ⚠ {t('statusShortageLabel')} {item.shortageQuantity} {item.unit}
      </span>
    );
  }
  return <span style={badgeStyle('active')}>{t('statusSufficient')}</span>;
}

function ItemRow({
  item,
  locationId,
  canManage,
  staffNameById,
  onEdit,
  lang,
  t,
}: {
  item: InventoryItemStatus;
  locationId: string;
  canManage: boolean;
  staffNameById: Record<string, string>;
  onEdit: () => void;
  lang: ReturnType<typeof useLang>['lang'];
  t: T;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{item.name}</h3>
          <p style={{ margin: '4px 0 0', ...mutedText, fontSize: 13 }}>
            {t('targetLabel')} {item.requiredQuantity} {item.unit} · {t('reorderAtLabel')} {item.reorderPoint} {item.unit} ·{' '}
            {t('currentLabel')} {item.actualQuantity === null ? '—' : `${item.actualQuantity} ${item.unit}`}
          </p>
          {item.countedAt ? (
            <p style={{ margin: '2px 0 0', ...mutedText, fontSize: 12 }}>
              {t('lastUpdatedLabel')} {new Date(item.countedAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US')}
              {canManage && item.countedByStaffId
                ? ` · ${staffNameById[item.countedByStaffId] ?? t('unknownStaffLabel')}`
                : ''}
            </p>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <StatusBadge item={item} t={t} />
          {canManage ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={buttonSecondary} onClick={onEdit}>
                {t('editButton')}
              </button>
              <button
                type="button"
                style={buttonSecondary}
                disabled={isPending}
                onClick={() => {
                  setIsPending(true);
                  const formData = new FormData();
                  formData.set('itemId', item.itemId);
                  formData.set('isActive', item.isActive ? 'false' : 'true');
                  setInventoryItemActiveAction(formData).finally(() => {
                    setIsPending(false);
                    router.refresh();
                  });
                }}
              >
                {item.isActive ? t('deactivateButton') : t('reactivateButton')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {item.isActive ? (
        <CountForm locationId={locationId} itemId={item.itemId} unit={item.unit} lang={lang} onSuccess={() => router.refresh()} />
      ) : null}
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

function InventoryDashboardBody({ tenantName, locationName, locationId, items, canManage, staffNameById }: InventoryDashboardClientProps) {
  const { lang } = useLang();
  const t: T = (key) => tInventoryDashboard(lang, key);
  const router = useRouter();
  const [editing, setEditing] = useState<'new' | InventoryItemStatus | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'shortage' | 'ok'>('all');
  const [search, setSearch] = useState('');

  const shortageCount = items.filter((i) => i.status === 'shortage').length;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleItems = items.filter(
    (item) =>
      (statusFilter === 'all' || (statusFilter === 'shortage' ? item.status === 'shortage' : item.status !== 'shortage')) &&
      (normalizedSearch === '' || item.name.toLowerCase().includes(normalizedSearch)),
  );
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
        }
      : undefined;

  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{t('pageTitle')}</h1>
          <PreviewLanguageToggle />
        </div>
        <p style={{ margin: '8px 0 0', ...mutedText }}>
          {t('pageDescription')} {tenantName} — {locationName}.
        </p>
        <Link href="/dashboard" style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}>
          {t('backToDashboard')}
        </Link>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
        <p style={{ margin: 0, ...mutedText }}>
          {shortageCount > 0 ? (
            <span style={badgeStyle('warning')}>
              {shortageCount} {t('itemsShortage')}
            </span>
          ) : (
            <span style={badgeStyle('active')}>{t('itemsSufficient')}</span>
          )}
        </p>
        {canManage ? (
          <button type="button" style={buttonSecondary} onClick={() => setEditing('new')}>
            {t('addItem')}
          </button>
        ) : null}
      </div>

      {editing ? (
        <section style={card}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{editing === 'new' ? t('newItemHeading') : `${t('editItemHeading')} ${editingItem?.name}`}</h3>
          <ItemForm
            locationId={locationId}
            item={editingItem}
            lang={lang}
            onSuccess={() => {
              setEditing(null);
              router.refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        </section>
      ) : null}

      {items.length === 0 ? (
        <section style={card}>
          <p style={{ margin: 0, ...mutedText }}>{t('noItemsYet')}</p>
        </section>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['all', 'shortage', 'ok'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  style={statusFilter === value ? buttonPrimary : buttonSecondary}
                  onClick={() => setStatusFilter(value)}
                >
                  {value === 'all' ? t('filterAll') : value === 'shortage' ? t('filterShortage') : t('filterOk')}
                </button>
              ))}
            </div>
            <input
              style={{ ...input, flex: 1, minWidth: 160 }}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
            />
          </div>

          {visibleItems.length === 0 ? (
            <section style={card}>
              <p style={{ margin: 0, ...mutedText }}>{t('noItemsMatchFilter')}</p>
            </section>
          ) : (
            visibleItems.map((item) => (
              <ItemRow
                key={item.itemId}
                item={item}
                locationId={locationId}
                canManage={canManage}
                staffNameById={staffNameById}
                onEdit={() => setEditing(item)}
                lang={lang}
                t={t}
              />
            ))
          )}
        </>
      )}
    </>
  );
}
