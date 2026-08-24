import type { PurchasesWriteResult } from '@/lib/purchases/result-types';
import { tPurchasesDashboard } from './purchases-i18n';
import type { Lang } from '@/lib/demo/cafe/i18n';

/** Shared client-side error copy for every Purchases write call on this page -- the single place this text lives. Never surfaces a raw Postgres/internal message. */
export function describePurchasesWriteError(result: Exclude<PurchasesWriteResult<unknown>, { status: 'success' }>, lang: Lang): string {
  const t = (key: Parameters<typeof tPurchasesDashboard>[1]) => tPurchasesDashboard(lang, key);
  switch (result.status) {
    case 'not_found':
      return 'Not found.';
    case 'not_authenticated':
      return 'Please sign in again.';
    case 'no_membership':
      return 'You are not a member of this workspace.';
    case 'not_short':
      return t('notShortError');
    case 'unauthorized':
      return result.message;
    default:
      return 'Something went wrong. Please try again.';
  }
}
