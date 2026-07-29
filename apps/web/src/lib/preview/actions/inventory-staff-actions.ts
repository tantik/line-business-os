'use server';

import { recordInventoryStockCount, type RecordedInventoryStockCount } from '@/lib/inventory/stock-counts';
import { parseRecordStockCountInput } from '@/lib/inventory/stock-count-input';
import type { InventoryWriteResult } from '@/lib/inventory/result-types';
import { resolvePreviewInventoryStaffContext } from './inventory-authorize';
import { PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';

/**
 * Staff-only Inventory count-entry action, kept in its own module (see
 * `inventory-manager-actions.ts`'s header note on why manager/staff actions
 * must never share a `'use server'` file in this preview shell).
 */

function mapInventoryWriteResult<T>(result: InventoryWriteResult<T>): PreviewWriteResult<T> {
  switch (result.status) {
    case 'success':
      return { status: 'success', data: result.data };
    case 'not_found':
      return { status: 'not_found' };
    case 'not_authenticated':
      return { status: 'not_authenticated' };
    case 'no_membership':
    case 'unauthorized':
      return { status: 'no_access' };
    case 'config_error':
    case 'unexpected_error':
      return { status: 'unexpected_error' };
    default:
      return { status: 'unexpected_error' };
  }
}

/**
 * Staff: record a Daily Stock Check entry for the caller's own resolved
 * location. `locationId` from the form is ignored -- the resolved staff
 * context's own location is always used, matching every other B2b
 * self-scoped staff write in this preview shell.
 */
export async function previewSubmitInventoryStockCount(
  formData: FormData,
): Promise<PreviewWriteResult<RecordedInventoryStockCount>> {
  const input = parseRecordStockCountInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const contextResult = await resolvePreviewInventoryStaffContext();
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  return mapInventoryWriteResult(await recordInventoryStockCount(supabase, tenantId, locationId, input.itemId, input.actualQuantity));
}
