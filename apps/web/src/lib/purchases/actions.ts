'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { parseMarkPurchaseBoughtInput } from './mark-bought-input';
import { recordPurchaseAction, type RecordedPurchaseAction } from './mark-bought';
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
