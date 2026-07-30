'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { parseSetInventoryItemActiveInput, parseUpsertInventoryItemInput } from './items-input';
import { setInventoryItemActive, upsertInventoryItem, type InventoryItem } from './items';
import type { InventoryWriteResult } from './result-types';

/**
 * Server Actions for the Inventory catalog (manager-only; enforced by RLS --
 * `inv_items_insert`/`inv_items_update`, both `inventory.item.manage`). Thin
 * controllers: validate -> resolve tenant -> delegate to `items.ts`, which
 * owns the actual Supabase calls. `tenantId` always comes from
 * `requireTenantContext()` (server-resolved active membership), never from
 * client input.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

export async function upsertInventoryItemAction(formData: FormData): Promise<InventoryWriteResult<InventoryItem>> {
  const input = parseUpsertInventoryItemInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return upsertInventoryItem(supabase, tenantContext.data.activeTenant.tenantId, {
    id: input.id ?? undefined,
    locationId: input.locationId,
    name: input.name,
    unit: input.unit,
    requiredQuantity: input.requiredQuantity,
    reorderPoint: input.reorderPoint,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
  });
}

export async function setInventoryItemActiveAction(formData: FormData): Promise<InventoryWriteResult<InventoryItem>> {
  const input = parseSetInventoryItemActiveInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return setInventoryItemActive(supabase, tenantContext.data.activeTenant.tenantId, input.itemId, input.isActive);
}
