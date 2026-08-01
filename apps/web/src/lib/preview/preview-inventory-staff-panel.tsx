'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import { previewSubmitInventoryStockCount } from './actions/inventory-staff-actions';
import { previewWriteMessage } from './write-result';
import { badgeStyle, buttonDisabled, buttonPrimary, card, demoColors, input, mutedText } from '@/lib/demo/cafe/theme';
import { useLang, makeTranslator } from '@/lib/demo/cafe/i18n';
import { PreviewInventoryModal } from './preview-inventory-modal';

interface InventoryStaffDict {
  title: string;
  subtitle: string;
  required: string;
  reorderPoint: string;
  current: string;
  shortage: string;
  sufficient: string;
  needsRestock: string;
  notCounted: string;
  actualLabel: string;
  save: string;
  saving: string;
  empty: string;
  openInventory: string;
  close: string;
  purchaseRecommendation: string;
  needToOrder: string;
  saved: string;
  allSaved: string;
}

const dictionary: Record<'ja' | 'en', InventoryStaffDict> = {
  ja: {
    title: '在庫確認',
    subtitle: '本日の在庫を入力してください。',
    required: '基準在庫',
    reorderPoint: '発注点',
    current: '現在庫',
    shortage: '不足',
    sufficient: '在庫十分',
    needsRestock: '要補充',
    notCounted: '未確認',
    actualLabel: '実測値',
    save: '保存',
    saving: '保存中...',
    empty: '在庫アイテムはまだ登録されていません。',
    openInventory: '在庫を確認・入力',
    close: '閉じる',
    purchaseRecommendation: '推奨発注数',
    needToOrder: '発注目安',
    saved: '保存済み',
    allSaved: 'すべて保存しました。',
  },
  en: {
    title: 'Inventory check',
    subtitle: "Enter today's actual stock for each item.",
    required: 'Required',
    reorderPoint: 'Reorder point',
    current: 'Current',
    shortage: 'Shortage',
    sufficient: 'Sufficient',
    needsRestock: 'Needs restock',
    notCounted: 'Not yet counted',
    actualLabel: 'Actual quantity',
    save: 'Save',
    saving: 'Saving...',
    empty: 'No inventory items yet.',
    openInventory: 'Check / update inventory',
    close: 'Close',
    purchaseRecommendation: 'Recommended purchase',
    needToOrder: 'Need to order',
    saved: 'Saved',
    allSaved: 'All items saved.',
  },
};

const filledCounterLabel: Record<'ja' | 'en', (filled: number, total: number) => string> = {
  ja: (filled, total) => `${filled} / ${total} 入力済み`,
  en: (filled, total) => `${filled} / ${total} entered`,
};

const t = makeTranslator(dictionary);

function StatusBadge({ item, tr }: { item: InventoryItemStatus; tr: (key: keyof InventoryStaffDict) => string }) {
  if (item.status === 'unknown') return <span style={badgeStyle('neutral')}>{tr('notCounted')}</span>;
  if (item.status === 'shortage') {
    return (
      <span style={badgeStyle('warning')} aria-label={`${tr('shortage')}: ${item.shortageQuantity} ${item.unit}`}>
        ⚠ {tr('needsRestock')} · {tr('purchaseRecommendation')}: {item.shortageQuantity} {item.unit}
      </span>
    );
  }
  return <span style={badgeStyle('active')}>{tr('sufficient')}</span>;
}

function parseQuantity(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function ItemCard({
  item,
  value,
  isSaved,
  disabled,
  onChange,
  tr,
}: {
  item: InventoryItemStatus;
  value: string;
  isSaved: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  tr: (key: keyof InventoryStaffDict) => string;
}) {
  const enteredQuantity = parseQuantity(value);
  const needToOrder = enteredQuantity !== null ? Math.max(item.requiredQuantity - enteredQuantity, 0) : null;

  return (
    <div style={{ ...card, padding: 10, marginTop: 6, opacity: isSaved ? 0.65 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <strong style={{ fontSize: 13.5 }}>{item.name}</strong>
          <p style={{ margin: '2px 0 0', ...mutedText, fontSize: 12 }}>
            {tr('required')}: {item.requiredQuantity} {item.unit} / {tr('current')}:{' '}
            {item.actualQuantity === null ? '—' : `${item.actualQuantity} ${item.unit}`}
            {' · '}
            {tr('reorderPoint')}: {item.reorderPoint} {item.unit}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
          {isSaved ? <span style={badgeStyle('active')}>✓ {tr('saved')}</span> : <StatusBadge item={item} tr={tr} />}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <label style={{ flex: 1, maxWidth: 140 }}>
          <span style={{ ...mutedText, fontSize: 11.5 }}>
            {tr('actualLabel')} ({item.unit})
          </span>
          <input
            style={{ ...input, marginTop: 2, padding: '7px 10px' }}
            name="actualQuantity"
            type="number"
            min={0}
            step="0.001"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        {needToOrder !== null ? (
          <p style={{ margin: 0, fontSize: 12, ...mutedText }}>
            {tr('needToOrder')}: <strong>{needToOrder}</strong> {item.unit}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function PreviewInventoryStaffPanel({ locationId, items }: { locationId: string; items: InventoryItemStatus[] }) {
  const { lang } = useLang();
  const tr = (key: keyof InventoryStaffDict) => t(lang, key);
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [search, setSearch] = useState('');
  const [shortagesOnly, setShortagesOnly] = useState(false);

  const shortageCount = items.filter((item) => item.status === 'shortage').length;
  const filledCount = Object.values(values).filter((raw) => raw.trim() !== '').length;
  const pendingItems = items.filter((item) => {
    const raw = values[item.itemId];
    if (raw === undefined || raw.trim() === '') return false;
    return savedValues[item.itemId] !== raw;
  });
  const visibleItems = [...items]
    .filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((item) => !shortagesOnly || item.status === 'shortage')
    .sort((a, b) => Number(b.status === 'shortage') - Number(a.status === 'shortage') || a.name.localeCompare(b.name));

  function handleChange(itemId: string, raw: string) {
    setValues((prev) => ({ ...prev, [itemId]: raw }));
    setFeedback(null);
  }

  async function handleSaveAll() {
    if (isSaving || pendingItems.length === 0) return;
    setIsSaving(true);
    setFeedback(null);
    setFeedbackIsError(false);

    for (const item of pendingItems) {
      const raw = values[item.itemId];
      if (raw === undefined) continue;
      const formData = new FormData();
      formData.set('locationId', locationId);
      formData.set('itemId', item.itemId);
      formData.set('actualQuantity', raw);
      const result = await previewSubmitInventoryStockCount(formData);
      if (result.status !== 'success') {
        setFeedbackIsError(true);
        setFeedback(`${item.name}: ${previewWriteMessage(lang, result.status)}`);
        setIsSaving(false);
        router.refresh();
        return;
      }
      setSavedValues((prev) => ({ ...prev, [item.itemId]: raw }));
    }

    setIsSaving(false);
    setFeedbackIsError(false);
    setFeedback(tr('allSaved'));
    router.refresh();
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{tr('title')}</h2>
          <p style={{ margin: '4px 0 0', ...mutedText, fontSize: 13 }}>{tr('subtitle')}</p>
        </div>
        <button type="button" style={shortageCount > 0 ? buttonPrimary : buttonDisabled} onClick={() => setIsOpen(true)}>
          {tr('openInventory')} {shortageCount > 0 ? `(${shortageCount})` : ''}
        </button>
      </div>
      {isOpen ? (
        <PreviewInventoryModal title={tr('title')} closeLabel={tr('close')} onClose={() => setIsOpen(false)}>
          {items.length === 0 ? (
            <p style={{ margin: '12px 0 0', ...mutedText }}>{tr('empty')}</p>
          ) : (
            <>
              <div style={{ position: 'sticky', top: 51, zIndex: 2, margin: '0 -16px', padding: '10px 16px 8px', background: demoColors.surface, borderBottom: `1px solid ${demoColors.border}` }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={lang === 'ja' ? '商品を検索' : 'Search items'} aria-label={lang === 'ja' ? '商品を検索' : 'Search items'} style={{ ...input, flex: 1, padding: '7px 10px' }} />
                  <button type="button" style={shortagesOnly ? buttonPrimary : buttonDisabled} onClick={() => setShortagesOnly((value) => !value)}>{shortagesOnly ? (lang === 'ja' ? '不足のみ' : 'Shortages') : (lang === 'ja' ? 'すべて' : 'All')}</button>
                </div>
                <p style={{ margin: '7px 0 0', fontSize: 12.5, fontWeight: 700, color: demoColors.textPrimary }}>{filledCounterLabel[lang](filledCount, items.length)}</p>
              </div>
              {visibleItems.map((item) => (
                <ItemCard
                  key={item.itemId}
                  item={item}
                  value={values[item.itemId] ?? ''}
                  isSaved={values[item.itemId] !== undefined && savedValues[item.itemId] === values[item.itemId]}
                  disabled={isSaving}
                  onChange={(raw) => handleChange(item.itemId, raw)}
                  tr={tr}
                />
              ))}
              <div
                style={{
                  position: 'sticky',
                  bottom: 0,
                  marginTop: 14,
                  paddingTop: 10,
                  background: demoColors.surface,
                  borderTop: `1px solid ${demoColors.border}`,
                }}
              >
                {feedback ? (
                  <p style={{ margin: '0 0 8px', fontSize: 12.5, color: feedbackIsError ? demoColors.dangerText : demoColors.accentStrong }}>
                    {feedback}
                  </p>
                ) : null}
                <button
                  type="button"
                  style={isSaving || pendingItems.length === 0 ? buttonDisabled : buttonPrimary}
                  disabled={isSaving || pendingItems.length === 0}
                  onClick={handleSaveAll}
                >
                  {isSaving ? tr('saving') : tr('save')}
                </button>
              </div>
            </>
          )}
        </PreviewInventoryModal>
      ) : null}
    </section>
  );
}
