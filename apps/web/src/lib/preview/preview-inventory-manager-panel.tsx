'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import { INVENTORY_UNITS } from '@/lib/inventory/validation';
import { previewSetInventoryItemActive, previewUpsertInventoryItem } from './actions/inventory-manager-actions';
import { previewWriteMessage } from './write-result';
import { badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, card, demoColors, input, mutedText } from '@/lib/demo/cafe/theme';
import { useLang, makeTranslator } from '@/lib/demo/cafe/i18n';
import { PreviewInventoryModal } from './preview-inventory-modal';

interface InventoryManagerDict {
  title: string;
  subtitle: string;
  addItem: string;
  required: string;
  reorderPoint: string;
  current: string;
  shortage: string;
  sufficient: string;
  needsRestock: string;
  notCounted: string;
  name: string;
  unit: string;
  save: string;
  saving: string;
  cancel: string;
  edit: string;
  deactivate: string;
  reactivate: string;
  empty: string;
  allSufficient: string;
  unknownStaffFallback: string;
  openInventory: string;
  close: string;
  purchaseRecommendation: string;
}

const shortageAlert: Record<'ja' | 'en', (n: number) => string> = {
  ja: (n) => `${n}件の商品が不足しています`,
  en: (n) => `${n} item(s) need restocking`,
};

const dictionary: Record<'ja' | 'en', InventoryManagerDict> = {
  ja: {
    title: '在庫確認',
    subtitle: '基準在庫と現在庫を管理します。',
    addItem: '+ 商品を追加',
    required: '基準在庫',
    reorderPoint: '発注点',
    current: '現在庫',
    shortage: '不足',
    sufficient: '在庫十分',
    needsRestock: '要補充',
    notCounted: '未確認',
    name: '商品名',
    unit: '単位',
    save: '保存',
    saving: '保存中...',
    cancel: 'キャンセル',
    edit: '編集',
    deactivate: '無効化',
    reactivate: '有効化',
    empty: '在庫アイテムはまだ登録されていません。',
    allSufficient: 'すべての在庫が十分です',
    unknownStaffFallback: '不明なスタッフ',
    openInventory: '在庫を開く',
    close: '閉じる',
    purchaseRecommendation: '推奨発注数',
  },
  en: {
    title: 'Inventory',
    subtitle: 'Manage required and current stock levels.',
    addItem: '+ Add item',
    required: 'Required',
    reorderPoint: 'Reorder point',
    current: 'Current',
    shortage: 'Shortage',
    sufficient: 'Sufficient',
    needsRestock: 'Needs restock',
    notCounted: 'Not yet counted',
    name: 'Name',
    unit: 'Unit',
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    edit: 'Edit',
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
    empty: 'No inventory items yet.',
    allSufficient: 'All items sufficient',
    unknownStaffFallback: 'Unknown staff',
    openInventory: 'Open inventory',
    close: 'Close',
    purchaseRecommendation: 'Recommended purchase',
  },
};

type DictKey = keyof InventoryManagerDict;

const t = makeTranslator(dictionary);

function ItemForm({
  locationId,
  item,
  lang,
  tr,
  onSuccess,
  onCancel,
}: {
  locationId: string;
  item?: InventoryItemStatus;
  lang: 'ja' | 'en';
  tr: (key: DictKey) => string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (item) formData.set('id', item.itemId);
    formData.set('locationId', locationId);

    startTransition(async () => {
      const result = await previewUpsertInventoryItem(formData);
      if (result.status === 'success') onSuccess();
      else setError(previewWriteMessage(lang, result.status));
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, maxWidth: 320 }}>
      {error ? <span style={{ color: demoColors.dangerText, fontSize: 12 }}>{error}</span> : null}
      <label>
        <span style={{ ...mutedText, fontSize: 12 }}>{tr('name')}</span>
        <input style={input} name="name" defaultValue={item?.name ?? ''} maxLength={120} required />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 12 }}>{tr('required')}</span>
          <input style={input} name="requiredQuantity" type="number" min={0} step="0.001" defaultValue={item?.requiredQuantity ?? 0} required />
        </label>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 12 }}>{tr('reorderPoint')}</span>
          <input
            style={input}
            name="reorderPoint"
            type="number"
            min={0}
            step="0.001"
            defaultValue={item?.reorderPoint ?? 0}
            required
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 12 }}>{tr('unit')}</span>
          <select style={input} name="unit" defaultValue={item?.unit ?? INVENTORY_UNITS[0]} required>
            {INVENTORY_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
          {isPending ? tr('saving') : tr('save')}
        </button>
        <button type="button" style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          {tr('cancel')}
        </button>
      </div>
    </form>
  );
}

export function PreviewInventoryManagerPanel({
  locationId,
  items,
  staffNameById,
}: {
  locationId: string;
  items: InventoryItemStatus[];
  /** Manager-only decrypted staff-id -> display-name map, built by the page from the same `listWorkforceStaffForManager` directory the Staff-management dialog already uses -- never a new PII exposure surface. */
  staffNameById: Record<string, string>;
}) {
  const { lang } = useLang();
  const tr = (key: DictKey) => t(lang, key);
  const router = useRouter();
  const [editing, setEditing] = useState<'new' | InventoryItemStatus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const shortageCount = items.filter((i) => i.status === 'shortage').length;

  return (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{tr('title')}</h2>
          <p style={{ margin: '4px 0 0', ...mutedText, fontSize: 13 }}>{tr('subtitle')}</p>
        </div>
        <button type="button" style={buttonPrimary} onClick={() => setIsOpen(true)}>
          {tr('openInventory')}
        </button>
      </div>

      <p style={{ margin: '10px 0 0' }}>
        {shortageCount > 0 ? (
          <span style={badgeStyle('warning')}>{shortageAlert[lang](shortageCount)}</span>
        ) : (
          <span style={badgeStyle('active')}>{tr('allSufficient')}</span>
        )}
      </p>

      {isOpen ? (
        <PreviewInventoryModal title={tr('title')} closeLabel={tr('close')} onClose={() => setIsOpen(false)}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" style={buttonSecondary} onClick={() => setEditing('new')}>
              {tr('addItem')}
            </button>
          </div>
      {editing ? (
        <ItemForm
          locationId={locationId}
          item={editing === 'new' ? undefined : editing}
          lang={lang}
          tr={tr}
          onSuccess={() => {
            setEditing(null);
            router.refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {items.length === 0 ? (
        <p style={{ margin: '12px 0 0', ...mutedText }}>{tr('empty')}</p>
      ) : (
        items.map((item) => (
          <div key={item.itemId} style={{ ...card, marginTop: 10 }}>
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
                {item.countedAt ? (
                  <p style={{ margin: '2px 0 0', ...mutedText, fontSize: 12 }}>
                    {new Date(item.countedAt).toLocaleString()}
                    {item.countedByStaffId
                      ? ` · ${staffNameById[item.countedByStaffId] ?? tr('unknownStaffFallback')}`
                      : ''}
                  </p>
                ) : null}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {item.status === 'unknown' ? (
                  <span style={badgeStyle('neutral')}>{tr('notCounted')}</span>
                ) : item.status === 'shortage' ? (
                  <span style={badgeStyle('warning')}>
                    ⚠ {tr('needsRestock')} · {tr('purchaseRecommendation')}: {item.shortageQuantity} {item.unit}
                  </span>
                ) : (
                  <span style={badgeStyle('active')}>{tr('sufficient')}</span>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" style={buttonSecondary} onClick={() => setEditing(item)}>
                    {tr('edit')}
                  </button>
                  <button
                    type="button"
                    style={buttonSecondary}
                    disabled={isPending}
                    onClick={() => {
                      const formData = new FormData();
                      formData.set('itemId', item.itemId);
                      formData.set('isActive', item.isActive ? 'false' : 'true');
                      startTransition(async () => {
                        await previewSetInventoryItemActive(formData);
                        router.refresh();
                      });
                    }}
                  >
                    {item.isActive ? tr('deactivate') : tr('reactivate')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
        </PreviewInventoryModal>
      ) : null}
    </section>
  );
}
