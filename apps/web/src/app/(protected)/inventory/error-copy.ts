import type { InventoryItemInputError, InventoryItemWriteResult } from '@/lib/inventory/result-types';
import { tInventoryDashboard } from './inventory-i18n';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { localizeServerMessage } from '@/lib/ui/server-message-copy';

/**
 * Shared client-side error copy for every Inventory write call on this page
 * -- the single place this text lives. Never surfaces a raw Postgres/
 * internal message. `lang` defaults to `'en'` so existing call sites keep
 * working without a change; pass the page's `lang` to get the Japanese
 * copy, same convention as `purchases/error-copy.ts`.
 */
export function describeInventoryWriteError(
  result: Exclude<InventoryItemWriteResult<unknown>, { status: 'success' }>,
  lang: Lang = 'en',
): string {
  const t = (key: Parameters<typeof tInventoryDashboard>[1]) => tInventoryDashboard(lang, key);
  switch (result.status) {
    case 'not_found':
      return t('notFoundError');
    case 'not_authenticated':
      return t('pleaseSignInAgainError');
    case 'no_membership':
      return t('notMemberOfWorkspaceError');
    case 'blocked_by_history':
      return t('blockedByHistoryError');
    case 'unauthorized':
      return localizeServerMessage(result.status, result.message, lang);
    case 'invalid_input':
      return describeInventoryItemInputError(result.reason, lang);
    default:
      return t('somethingWentWrongError');
  }
}

/** Specific, actionable copy for a rejected item create/edit payload (`parseUpsertInventoryItemInput`). */
export function describeInventoryItemInputError(reason: InventoryItemInputError, lang: Lang = 'en'): string {
  const t = (key: Parameters<typeof tInventoryDashboard>[1]) => tInventoryDashboard(lang, key);
  switch (reason) {
    case 'invalid_name':
      return t('itemNameInvalidError');
    case 'invalid_unit':
      return t('itemUnitInvalidError');
    case 'invalid_target_quantity':
      return t('itemTargetQuantityInvalidError');
    case 'invalid_reorder_point':
      return t('itemReorderPointInvalidError');
    case 'reorder_above_target':
      return t('itemReorderAboveTargetError');
    case 'invalid_sort_order':
      return t('itemSortOrderInvalidError');
    case 'invalid_request':
    default:
      return t('somethingWentWrongError');
  }
}

/** Item form field (its `name` attribute) a rejection reason belongs to, so the form can show it next to that field; `null` = form-level. */
export type InventoryItemFormField = 'name' | 'unit' | 'requiredQuantity' | 'reorderPoint' | 'sortOrder';

export function inventoryItemInputErrorField(reason: InventoryItemInputError): InventoryItemFormField | null {
  switch (reason) {
    case 'invalid_name':
      return 'name';
    case 'invalid_unit':
      return 'unit';
    case 'invalid_target_quantity':
      return 'requiredQuantity';
    case 'invalid_reorder_point':
    case 'reorder_above_target':
      return 'reorderPoint';
    case 'invalid_sort_order':
      return 'sortOrder';
    default:
      return null;
  }
}
