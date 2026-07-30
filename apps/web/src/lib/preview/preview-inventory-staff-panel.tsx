'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
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
  },
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

function ItemRow({ item, locationId, tr }: { item: InventoryItemStatus; locationId: string; tr: (key: keyof InventoryStaffDict) => string }) {
  const router = useRouter();
  const { lang } = useLang();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set('locationId', locationId);
    formData.set('itemId', item.itemId);
    startTransition(async () => {
      const result = await previewSubmitInventoryStockCount(formData);
      if (result.status === 'success') {
        form.reset();
        router.refresh();
      } else {
        setError(previewWriteMessage(lang, result.status));
      }
    });
  }

  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <strong>{item.name}</strong>
          <p style={{ margin: '4px 0 0', ...mutedText, fontSize: 13 }}>
            {tr('required')}: {item.requiredQuantity} {item.unit} / {tr('current')}:{' '}
            {item.actualQuantity === null ? '—' : `${item.actualQuantity} ${item.unit}`}
          </p>
          <p style={{ margin: '2px 0 0', ...mutedText, fontSize: 12 }}>
            {tr('reorderPoint')}: {item.reorderPoint} {item.unit}
          </p>
        </div>
        <StatusBadge item={item} tr={tr} />
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 8 }}>
        {error ? <span style={{ color: demoColors.dangerText, fontSize: 12 }}>{error}</span> : null}
        <label style={{ flex: 1, maxWidth: 140 }}>
          <span style={{ ...mutedText, fontSize: 12 }}>
            {tr('actualLabel')} ({item.unit})
          </span>
          <input style={input} name="actualQuantity" type="number" min={0} step="0.001" required autoComplete="off" />
        </label>
        <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
          {isPending ? tr('saving') : tr('save')}
        </button>
      </form>
    </div>
  );
}

export function PreviewInventoryStaffPanel({ locationId, items }: { locationId: string; items: InventoryItemStatus[] }) {
  const { lang } = useLang();
  const tr = (key: keyof InventoryStaffDict) => t(lang, key);
  const [isOpen, setIsOpen] = useState(false);
  const shortageCount = items.filter((item) => item.status === 'shortage').length;

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
        items.map((item) => <ItemRow key={item.itemId} item={item} locationId={locationId} tr={tr} />)
      )}
        </PreviewInventoryModal>
      ) : null}
    </section>
  );
}
