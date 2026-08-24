'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PurchaseNeededItem } from '@/lib/purchases/items';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { backLink, buttonSecondary, card, colors, mutedText, tableCell, tableHeaderCell } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import responsiveTable from '@/lib/ui/responsive-table.module.css';
import purchasesFooter from './purchases-footer.module.css';
import { MarkBoughtButton } from './mark-bought-button';
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
  /** Skips this component's own page-level `<header>` when rendered inside a popup (mirrors `InventoryDashboardClientProps.embedded`). */
  embedded?: boolean;
}

type T = (key: Parameters<typeof tPurchasesDashboard>[1]) => string;
type Filter = 'all' | 'pending' | 'bought';

function formatActionedAt(item: PurchaseNeededItem, lang: ReturnType<typeof useLang>['lang'], locationTimezone: string) {
  if (!item.actionedAt) return null;
  return new Date(item.actionedAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', { timeZone: locationTimezone });
}

interface RowProps {
  item: PurchaseNeededItem;
  locationId: string;
  locationTimezone: string;
  staffNameById: Record<string, string>;
  lang: ReturnType<typeof useLang>['lang'];
  t: T;
  onChanged: () => void;
}

function TableRow({ item, locationId, locationTimezone, staffNameById, lang, t, onChanged }: RowProps) {
  const bought = item.purchaseStatus === 'bought';
  const actionedAt = formatActionedAt(item, lang, locationTimezone);
  return (
    <tr style={{ opacity: bought ? 0.6 : 1 }}>
      <td style={{ ...tableCell, borderLeft: bought ? '3px solid transparent' : `3px solid ${colors.danger}` }}>
        <div style={{ fontWeight: 600 }}>{item.name}</div>
      </td>
      <td style={tableCell}>
        <div style={{ fontWeight: 600, color: bought ? colors.textMuted : colors.dangerText }}>
          {t('needToBuyLabel')} {item.shortageQuantity} {item.unit}
        </div>
        <div style={{ ...mutedText, fontSize: 12, marginTop: 2 }}>
          {t('reorderAtLabel')} {item.reorderPoint} {item.unit} · {t('targetLabel')} {item.requiredQuantity} {item.unit}
        </div>
      </td>
      <td style={{ ...tableCell, textAlign: 'right' }}>
        {bought ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: colors.accent, fontWeight: 600, fontSize: 13 }}>✓ {t('boughtButton')}</div>
            {actionedAt ? (
              <div style={{ ...mutedText, fontSize: 11, marginTop: 2 }}>
                {t('boughtAtLabel')} {actionedAt}
                {item.actionedByStaffId && staffNameById[item.actionedByStaffId]
                  ? ` · ${t('boughtByPrefix')} ${staffNameById[item.actionedByStaffId]}`
                  : ''}
              </div>
            ) : null}
          </div>
        ) : (
          <MarkBoughtButton locationId={locationId} itemId={item.itemId} itemName={item.name} lang={lang} onSuccess={onChanged} />
        )}
      </td>
    </tr>
  );
}

function ItemCard({ item, locationId, locationTimezone, staffNameById, lang, t, onChanged }: RowProps) {
  const bought = item.purchaseStatus === 'bought';
  const actionedAt = formatActionedAt(item, lang, locationTimezone);
  return (
    <div style={{ ...card, marginTop: 0, opacity: bought ? 0.6 : 1, borderLeft: bought ? card.border : `3px solid ${colors.danger}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, overflowWrap: 'anywhere' }}>{item.name}</h3>
          <div style={{ fontWeight: 600, marginTop: 4, color: bought ? colors.textMuted : colors.dangerText }}>
            {t('needToBuyLabel')} {item.shortageQuantity} {item.unit}
          </div>
          <div style={{ ...mutedText, fontSize: 12, marginTop: 2 }}>
            {t('reorderAtLabel')} {item.reorderPoint} {item.unit} · {t('targetLabel')} {item.requiredQuantity} {item.unit}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {bought ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: colors.accent, fontWeight: 600, fontSize: 13 }}>✓ {t('boughtButton')}</div>
              {actionedAt ? (
                <div style={{ ...mutedText, fontSize: 11, marginTop: 2 }}>
                  {t('boughtAtLabel')} {actionedAt}
                  {item.actionedByStaffId && staffNameById[item.actionedByStaffId]
                    ? ` · ${t('boughtByPrefix')} ${staffNameById[item.actionedByStaffId]}`
                    : ''}
                </div>
              ) : null}
            </div>
          ) : (
            <MarkBoughtButton locationId={locationId} itemId={item.itemId} itemName={item.name} lang={lang} onSuccess={onChanged} />
          )}
        </div>
      </div>
    </div>
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
  const visibleItems = items
    .filter((item) => (filter === 'all' ? true : item.purchaseStatus === filter))
    .slice()
    .sort((a, b) => {
      if (a.purchaseStatus !== b.purchaseStatus) return a.purchaseStatus === 'pending' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const rowProps = { locationId, locationTimezone, staffNameById, lang, t, onChanged: refresh };

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
        {(['all', 'pending', 'bought'] as const).map((value) => {
          const label = value === 'all' ? t('filterAll') : value === 'pending' ? t('filterPending') : t('filterBought');
          const count = value === 'all' ? items.length : value === 'pending' ? pendingCount : boughtCount;
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

      {items.length === 0 ? (
        <section style={{ ...card, marginTop: 12 }}>
          <p style={{ margin: 0, ...mutedText }}>{t('noItemsYet')}</p>
        </section>
      ) : visibleItems.length === 0 ? (
        <section style={{ ...card, marginTop: 12 }}>
          <p style={{ margin: 0, ...mutedText }}>{t('noItemsMatchFilter')}</p>
        </section>
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
                  <TableRow key={item.itemId} item={item} {...rowProps} />
                ))}
              </tbody>
            </table>
          </div>

          <div className={responsiveTable.cardView} style={{ marginTop: 12, flexDirection: 'column', gap: 10 }}>
            {visibleItems.map((item) => (
              <ItemCard key={item.itemId} item={item} {...rowProps} />
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
    </>
  );
}
