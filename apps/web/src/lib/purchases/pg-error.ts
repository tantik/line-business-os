import type { PostgrestError } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { PurchasesWriteResult } from './result-types';

/** 42501 = insufficient_privilege; PostgREST also surfaces "permission denied" / RLS also surfaces "row-level security". Never surfaced verbatim to the client -- callers map this to a generic, user-facing message. */
function isPermissionError(error: PostgrestError): boolean {
  return error.code === '42501' || /permission denied|row-level security/i.test(error.message);
}

/** `purchases_item_not_found`/`purchases_item_never_counted` -- raised by `api.record_purchase_action` when the item doesn't exist for this tenant, or has no stock count history at all (should be unreachable from the UI, which only ever lists already-counted shortage items). */
function isNotFoundError(error: PostgrestError): boolean {
  return /purchases_item_not_found|purchases_item_never_counted/i.test(error.message);
}

/** `purchases_item_not_short` -- raised by `api.record_purchase_action` when the item is inactive or its latest count is no longer at/below reorder_point (e.g. someone else already recorded a restocking count). */
function isNotShortError(error: PostgrestError): boolean {
  return /purchases_item_not_short/i.test(error.message);
}

export function mapPurchasesReadError(error: PostgrestError, action: string): TenantAccessResult<never> {
  if (isPermissionError(error)) return { status: 'unauthorized', message: `Not permitted to ${action}.` };
  return { status: 'unexpected_error', message: 'Unable to load purchases data right now.' };
}

export function mapPurchasesWriteError(error: PostgrestError, action: string): PurchasesWriteResult<never> {
  if (isNotShortError(error)) return { status: 'not_short' };
  if (isNotFoundError(error)) return { status: 'not_found' };
  if (isPermissionError(error)) return { status: 'unauthorized', message: `Not permitted to ${action}.` };
  return { status: 'unexpected_error', message: `Unable to ${action} right now.` };
}
