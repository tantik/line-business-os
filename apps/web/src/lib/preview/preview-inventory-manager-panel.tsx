'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import { INVENTORY_UNITS } from '@/lib/inventory/validation';
import {
  previewSetInventoryItemActive,
  previewUpsertInventoryItem,
  previewPermanentlyDeleteInventoryItem,
} from './actions/inventory-manager-actions';
import { previewWriteMessage } from './write-result';
import { badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, card, demoColors, input, mutedText } from '@/lib/demo/cafe/theme';
import { useLang, makeTranslator } from '@/lib/demo/cafe/i18n';
import { PreviewInventoryModal } from './preview-inventory-modal';
import { Modal } from '@/components/demo/cafe/Modal';
import { ConfirmDialog } from '@/components/demo/cafe/ConfirmDialog';
import { LoadingButton, PendingOverlay } from '@/components/ui/loading';

interface InventoryManagerDict {
  title: string;
  subtitle: string;
  addItem: string;
  editItem: string;
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
  deleteItem: string;
  deleting: string;
  permanentDelete: string;
  permanentDeleting: string;
  reactivate: string;
  updating: string;
  empty: string;
  allSufficient: string;
  unknownStaffFallback: string;
  openInventory: string;
  close: string;
  purchaseRecommendation: string;
  searchPlaceholder: string;
  noSearchResults: string;
  confirmDeleteTitle: string;
  confirmDeleteBody: string;
  confirmDeleteButton: string;
  confirmPermanentDeleteTitle: string;
  confirmPermanentDeleteBody: string;
  confirmPermanentDeleteButton: string;
  statusInactive: string;
  reorderPointExceedsRequired: string;
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
    editItem: '商品を編集',
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
    deleteItem: '削除',
    deleting: '削除中...',
    permanentDelete: '完全に削除',
    permanentDeleting: '完全に削除中...',
    reactivate: '有効化',
    updating: '更新中...',
    empty: '在庫アイテムはまだ登録されていません。',
    allSufficient: 'すべての在庫が十分です',
    unknownStaffFallback: '不明なスタッフ',
    openInventory: '在庫を開く',
    close: '閉じる',
    purchaseRecommendation: '推奨発注数',
    searchPlaceholder: '商品名で検索',
    noSearchResults: '一致する商品はありません。',
    confirmDeleteTitle: 'この商品を削除しますか？',
    confirmDeleteBody: 'この商品は非表示になりますが、過去の記録は保持されます。',
    confirmDeleteButton: '削除する',
    confirmPermanentDeleteTitle: 'この商品を完全に削除しますか？',
    confirmPermanentDeleteBody: 'この操作はこの商品を完全に削除します。\nこの操作は取り消せません。',
    confirmPermanentDeleteButton: '完全に削除する',
    statusInactive: '削除済み',
    reorderPointExceedsRequired: '発注点は基準在庫以下にしてください。',
  },
  en: {
    title: 'Inventory',
    subtitle: 'Manage required and current stock levels.',
    addItem: '+ Add item',
    editItem: 'Edit item',
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
    deleteItem: 'Delete',
    deleting: 'Deleting...',
    permanentDelete: 'Permanent Delete',
    permanentDeleting: 'Permanently deleting...',
    reactivate: 'Reactivate',
    updating: 'Updating...',
    empty: 'No inventory items yet.',
    allSufficient: 'All items sufficient',
    unknownStaffFallback: 'Unknown staff',
    openInventory: 'Open inventory',
    close: 'Close',
    purchaseRecommendation: 'Recommended purchase',
    searchPlaceholder: 'Search by name',
    noSearchResults: 'No items match your search.',
    confirmDeleteTitle: 'Delete this item?',
    confirmDeleteBody: 'This item will be hidden but its history will be preserved.',
    confirmDeleteButton: 'Delete',
    confirmPermanentDeleteTitle: 'Permanently delete this item?',
    confirmPermanentDeleteBody: 'This action permanently removes this item.\nThis cannot be undone.',
    confirmPermanentDeleteButton: 'Permanently delete',
    statusInactive: 'Deleted',
    reorderPointExceedsRequired: 'Reorder point must be less than or equal to Required.',
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
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'delete' | 'permanentDelete' | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (item) formData.set('id', item.itemId);
    formData.set('locationId', locationId);

    // Same rule the server enforces (parseUpsertInventoryItemInput /
    // the inventory_items_reorder_point_check DB constraint), checked here
    // first so a Required/Reorder-point mismatch shows this specific message
    // instantly instead of a round trip that comes back as the generic
    // "Please check your input." -- which, with no obvious cause, previously
    // read to the manager as a lost permission rather than a validation rule.
    const requiredQuantity = Number(formData.get('requiredQuantity'));
    const reorderPoint = Number(formData.get('reorderPoint'));
    if (Number.isFinite(requiredQuantity) && Number.isFinite(reorderPoint) && reorderPoint > requiredQuantity) {
      setError(tr('reorderPointExceedsRequired'));
      return;
    }

    setPendingMessage(tr('saving'));
    startTransition(async () => {
      const result = await previewUpsertInventoryItem(formData);
      if (result.status === 'success') onSuccess();
      else setError(previewWriteMessage(lang, result.status));
    });
  }

  function setActive(isActive: boolean) {
    setError(null);
    const formData = new FormData();
    formData.set('itemId', item!.itemId);
    formData.set('isActive', isActive ? 'true' : 'false');
    setPendingMessage(isActive ? tr('updating') : tr('deleting'));
    startTransition(async () => {
      const result = await previewSetInventoryItemActive(formData);
      if (result.status === 'success') {
        setConfirmAction(null);
        onSuccess();
      } else setError(previewWriteMessage(lang, result.status));
    });
  }

  function permanentlyDelete() {
    setError(null);
    const formData = new FormData();
    formData.set('itemId', item!.itemId);
    setPendingMessage(tr('permanentDeleting'));
    startTransition(async () => {
      const result = await previewPermanentlyDeleteInventoryItem(formData);
      if (result.status === 'success') {
        setConfirmAction(null);
        onSuccess();
      } else {
        // Kept open (not `setConfirmAction(null)`) when blocked by history --
        // the manager should see the "use Delete instead" message right next
        // to the action they just tried, not after the dialog has vanished.
        setError(previewWriteMessage(lang, result.status));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
      <PendingOverlay visible={isPending} message={pendingMessage ?? undefined} />
      {error ? <span style={{ color: demoColors.dangerText, fontSize: 12 }}>{error}</span> : null}
      <label>
        <span style={{ ...mutedText, fontSize: 12 }}>{tr('name')}</span>
        <input style={input} name="name" defaultValue={item?.name ?? ''} maxLength={120} required />
      </label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 140px' }}>
          <span style={{ ...mutedText, fontSize: 12 }}>{tr('required')}</span>
          <input style={input} name="requiredQuantity" type="number" min={0} step="0.001" defaultValue={item?.requiredQuantity ?? 0} required />
        </label>
        <label style={{ flex: '1 1 140px' }}>
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
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ flex: '1 1 140px' }}>
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
        <LoadingButton type="submit" pending={isPending} pendingLabel={tr('saving')} style={buttonPrimary} pendingStyle={buttonDisabled}>
          {tr('save')}
        </LoadingButton>
        <button type="button" style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          {tr('cancel')}
        </button>
      </div>

      {item ? (
        <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${demoColors.border}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {item.isActive ? (
            <button type="button" style={buttonSecondary} disabled={isPending} onClick={() => setConfirmAction('delete')}>
              {tr('deleteItem')}
            </button>
          ) : (
            <button type="button" style={buttonSecondary} disabled={isPending} onClick={() => setActive(true)}>
              {tr('reactivate')}
            </button>
          )}
          <button
            type="button"
            style={{ ...buttonSecondary, color: demoColors.dangerText }}
            disabled={isPending}
            onClick={() => setConfirmAction('permanentDelete')}
          >
            {tr('permanentDelete')}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmAction === 'delete'}
        title={tr('confirmDeleteTitle')}
        confirmLabel={tr('confirmDeleteButton')}
        cancelLabel={tr('cancel')}
        pending={isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => setActive(false)}
      >
        {tr('confirmDeleteBody')}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmAction === 'permanentDelete'}
        title={tr('confirmPermanentDeleteTitle')}
        confirmLabel={tr('confirmPermanentDeleteButton')}
        cancelLabel={tr('cancel')}
        pending={isPending}
        danger
        onCancel={() => setConfirmAction(null)}
        onConfirm={permanentlyDelete}
      >
        {tr('confirmPermanentDeleteBody')
          .split('\n')
          .map((line, index) => (
            <span key={index} style={{ display: 'block' }}>
              {line}
            </span>
          ))}
      </ConfirmDialog>
    </form>
  );
}

export function PreviewInventoryManagerPanel({
  locationId,
  items,
  staffNameById,
  /** When true, renders as a bare trigger button (no card/heading/subtitle) so it can sit inline inside another management block (e.g. next to "Manage Staff" / "Manage Recipes") instead of as its own section. All list/search/edit/modal functionality is unchanged. */
  embedded = false,
}: {
  locationId: string;
  items: InventoryItemStatus[];
  /** Manager-only decrypted staff-id -> display-name map, built by the page from the same `listWorkforceStaffForManager` directory the Staff-management dialog already uses -- never a new PII exposure surface. */
  staffNameById: Record<string, string>;
  embedded?: boolean;
}) {
  const { lang } = useLang();
  const tr = (key: DictKey) => t(lang, key);
  const router = useRouter();
  const [editing, setEditing] = useState<'new' | InventoryItemStatus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const shortageCount = items.filter((i) => i.status === 'shortage').length;
  const filteredItems = items.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));

  const trigger = (
    <button type="button" style={embedded ? buttonSecondary : buttonPrimary} onClick={() => setIsOpen(true)}>
      {tr('openInventory')} {shortageCount > 0 ? `(${shortageCount})` : ''}
    </button>
  );

  const body = embedded ? (
    trigger
  ) : (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{tr('title')}</h2>
          <p style={{ margin: '4px 0 0', ...mutedText, fontSize: 13 }}>{tr('subtitle')}</p>
        </div>
        {trigger}
      </div>

      <p style={{ margin: '10px 0 0' }}>
        {shortageCount > 0 ? (
          <span style={badgeStyle('warning')}>{shortageAlert[lang](shortageCount)}</span>
        ) : (
          <span style={badgeStyle('active')}>{tr('allSufficient')}</span>
        )}
      </p>
    </section>
  );

  return (
    <>
      {body}

      {isOpen ? (
        <PreviewInventoryModal title={tr('title')} closeLabel={tr('close')} onClose={() => setIsOpen(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <input
              type="search"
              style={{ ...input, flex: 1, minWidth: 160 }}
              placeholder={tr('searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={tr('searchPlaceholder')}
            />
            <button type="button" style={buttonSecondary} onClick={() => setEditing('new')}>
              {tr('addItem')}
            </button>
          </div>

      {items.length === 0 ? (
        <p style={{ margin: '12px 0 0', ...mutedText }}>{tr('empty')}</p>
      ) : filteredItems.length === 0 ? (
        <p style={{ margin: '12px 0 0', ...mutedText }}>{tr('noSearchResults')}</p>
      ) : (
        filteredItems.map((item) => (
          <button
            type="button"
            key={item.itemId}
            onClick={() => setEditing(item)}
            style={{
              ...card,
              marginTop: 8,
              padding: '12px 14px',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              opacity: item.isActive ? 1 : 0.6,
              ...(item.status === 'shortage'
                ? { borderColor: demoColors.warning, background: demoColors.alertWarningBg }
                : {}),
            }}
          >
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
                {!item.isActive ? (
                  <span style={badgeStyle('neutral')}>{tr('statusInactive')}</span>
                ) : item.status === 'unknown' ? (
                  <span style={badgeStyle('neutral')}>{tr('notCounted')}</span>
                ) : item.status === 'shortage' ? (
                  <span style={badgeStyle('warning')}>
                    ⚠ {tr('needsRestock')} · {tr('purchaseRecommendation')}: {item.shortageQuantity} {item.unit}
                  </span>
                ) : (
                  <span style={badgeStyle('active')}>{tr('sufficient')}</span>
                )}
              </div>
            </div>
          </button>
        ))
      )}
        </PreviewInventoryModal>
      ) : null}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? tr('addItem') : tr('editItem')}
        maxWidth={520}
      >
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
      </Modal>
    </>
  );
}
