import type { InventoryWriteResult } from '@/lib/inventory/result-types';
import { tInventoryDashboard } from './inventory-i18n';
import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * Shared client-side error copy for every Inventory write call on this page
 * -- the single place this text lives. Never surfaces a raw Postgres/
 * internal message. `lang` defaults to `'en'` so existing call sites keep
 * working without a change; pass the page's `lang` to get the Japanese
 * copy, same convention as `purchases/error-copy.ts`.
 */
export function describeInventoryWriteError(
  result: Exclude<InventoryWriteResult<unknown>, { status: 'success' }>,
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
      return result.message;
    default:
      return t('somethingWentWrongError');
  }
}
