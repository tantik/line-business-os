'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import { setInventoryItemActiveAction } from '@/lib/inventory/manager-actions';
import { badgeStyle, buttonSecondary, card, mutedText } from '@/lib/ui/theme';
import { ItemForm } from './item-form';
import { CountForm } from './count-form';

export interface InventoryDashboardClientProps {
  locationId: string;
  items: InventoryItemStatus[];
  /** Pure UX affordance (RLS is the real boundary regardless): whether to show catalog management controls. */
  canManage: boolean;
  /** Manager-only decrypted staff-id -> display-name map (see page.tsx). Always empty for a non-manager caller -- staff never see another employee's name here. */
  staffNameById: Record<string, string>;
}

const UNKNOWN_STAFF_LABEL = 'Unknown staff';

function StatusBadge({ item }: { item: InventoryItemStatus }) {
  if (item.status === 'unknown') {
    return <span style={badgeStyle('neutral')}>Not yet counted</span>;
  }
  if (item.status === 'shortage') {
    return (
      <span style={badgeStyle('warning')} aria-label={`Shortage: ${item.shortageQuantity} ${item.unit} needed`}>
        ⚠ Shortage — need {item.shortageQuantity} {item.unit}
      </span>
    );
  }
  return <span style={badgeStyle('active')}>Sufficient</span>;
}

function ItemRow({
  item,
  locationId,
  canManage,
  staffNameById,
  onEdit,
}: {
  item: InventoryItemStatus;
  locationId: string;
  canManage: boolean;
  staffNameById: Record<string, string>;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{item.name}</h3>
          <p style={{ margin: '4px 0 0', ...mutedText, fontSize: 13 }}>
            Required: {item.requiredQuantity} {item.unit} · Current:{' '}
            {item.actualQuantity === null ? '—' : `${item.actualQuantity} ${item.unit}`}
          </p>
          {item.countedAt ? (
            <p style={{ margin: '2px 0 0', ...mutedText, fontSize: 12 }}>
              Last updated {new Date(item.countedAt).toLocaleString()}
              {canManage && item.countedByStaffId
                ? ` · ${staffNameById[item.countedByStaffId] ?? UNKNOWN_STAFF_LABEL}`
                : ''}
            </p>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <StatusBadge item={item} />
          {canManage ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={buttonSecondary} onClick={onEdit}>
                Edit
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
                {item.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {item.isActive ? (
        <CountForm locationId={locationId} itemId={item.itemId} unit={item.unit} onSuccess={() => router.refresh()} />
      ) : null}
    </div>
  );
}

export function InventoryDashboardClient({ locationId, items, canManage, staffNameById }: InventoryDashboardClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<'new' | InventoryItemStatus | null>(null);

  const shortageCount = items.filter((i) => i.status === 'shortage').length;
  const editingItem =
    editing && editing !== 'new'
      ? {
          itemId: editing.itemId,
          tenantId: editing.tenantId,
          locationId: editing.locationId,
          name: editing.name,
          unit: editing.unit,
          requiredQuantity: editing.requiredQuantity,
          sortOrder: editing.sortOrder,
          isActive: editing.isActive,
          createdAt: '',
          updatedAt: '',
        }
      : undefined;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ margin: 0, ...mutedText }}>
          {shortageCount > 0 ? (
            <span style={badgeStyle('warning')}>{shortageCount} item(s) need restocking</span>
          ) : (
            <span style={badgeStyle('active')}>All items sufficient</span>
          )}
        </p>
        {canManage ? (
          <button type="button" style={buttonSecondary} onClick={() => setEditing('new')}>
            + Add item
          </button>
        ) : null}
      </div>

      {editing ? (
        <section style={card}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{editing === 'new' ? 'New item' : `Edit ${editingItem?.name}`}</h3>
          <ItemForm
            locationId={locationId}
            item={editingItem}
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
          <p style={{ margin: 0, ...mutedText }}>No inventory items yet.</p>
        </section>
      ) : (
        items.map((item) => (
          <ItemRow
            key={item.itemId}
            item={item}
            locationId={locationId}
            canManage={canManage}
            staffNameById={staffNameById}
            onEdit={() => setEditing(item)}
          />
        ))
      )}
    </div>
  );
}
