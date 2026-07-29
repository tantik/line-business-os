'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { parseRecordStockCountInput } from './stock-count-input';
import { recordInventoryStockCount, type RecordedInventoryStockCount } from './stock-counts';
import type { InventoryWriteResult } from './result-types';

/**
 * Server Action for recording a Daily Stock Check entry (staff AND manager;
 * enforced by RLS -- `inv_stock_counts_insert`, `inventory.count.write`,
 * location-matched). `tenantId` always comes from `requireTenantContext()`;
 * `counted_by` is stamped server-side inside `api.record_inventory_stock_count`
 * as the caller's own user id -- this action never sends one.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

export async function recordInventoryStockCountAction(
  formData: FormData,
): Promise<InventoryWriteResult<RecordedInventoryStockCount>> {
  const input = parseRecordStockCountInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return recordInventoryStockCount(
    supabase,
    tenantContext.data.activeTenant.tenantId,
    input.locationId,
    input.itemId,
    input.actualQuantity,
  );
}
