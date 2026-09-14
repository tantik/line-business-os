'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { parseMarkPurchaseBoughtInput } from './mark-bought-input';
import { recordPurchaseAction, type RecordedPurchaseAction } from './mark-bought';
import { parseRecordPurchaseOrderInput } from './record-purchase-order-input';
import { recordPurchaseOrder, type RecordedPurchaseOrder } from './record-purchase-order';
import { parseRecordPurchaseReceiptInput } from './record-purchase-receipt-input';
import { recordPurchaseReceipt, type RecordedPurchaseReceipt } from './record-purchase-receipt';
import type { PurchasesWriteResult } from './result-types';

/**
 * Server Action for marking an item as bought (staff AND manager; enforced
 * by RLS -- `purchases_actions_insert`, `purchases.action.write`,
 * location-matched). `tenantId` always comes from `requireTenantContext()`;
 * `actioned_by` is stamped server-side inside `api.record_purchase_action`
 * as the caller's own user id -- this action never sends one.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

export async function markPurchaseBoughtAction(
  formData: FormData,
): Promise<PurchasesWriteResult<RecordedPurchaseAction>> {
  const input = parseMarkPurchaseBoughtInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return recordPurchaseAction(
    supabase,
    tenantContext.data.activeTenant.tenantId,
    input.locationId,
    input.itemId,
  );
}

/**
 * Server Action for logging an "Ordered" acknowledgement (0120,
 * `api.record_purchase_order`) -- informational only, never touches
 * Inventory. Same permission/RLS posture as `markPurchaseBoughtAction`.
 */
export async function recordPurchaseOrderAction(
  formData: FormData,
): Promise<PurchasesWriteResult<RecordedPurchaseOrder>> {
  const input = parseRecordPurchaseOrderInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return recordPurchaseOrder(
    supabase,
    tenantContext.data.activeTenant.tenantId,
    input.locationId,
    input.itemId,
    input.orderedQuantity,
  );
}

/**
 * Server Action for recording a real delivery (0120,
 * `api.record_purchase_receipt`) -- writes the received quantity into
 * Inventory via that function's own canonical stock-count call. Does not
 * require a prior "Ordered" acknowledgement; Receive is available whenever
 * the item is still listed, independent of `purchaseStatus`.
 * `expectedStockCountId`, when supplied, is passed straight through to the
 * RPC's optional optimistic-concurrency guard.
 */
export async function recordPurchaseReceiptAction(
  formData: FormData,
): Promise<PurchasesWriteResult<RecordedPurchaseReceipt>> {
  const input = parseRecordPurchaseReceiptInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return recordPurchaseReceipt(
    supabase,
    tenantContext.data.activeTenant.tenantId,
    input.locationId,
    input.itemId,
    input.receivedQuantity,
    input.expectedStockCountId,
  );
}
