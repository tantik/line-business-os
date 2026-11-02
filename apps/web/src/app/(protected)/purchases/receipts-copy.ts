import type { Lang } from '@/lib/demo/cafe/i18n';
import type { SpendReceiptWriteResult } from '@/lib/purchases/spend-receipts';
import { localizeServerMessage } from '@/lib/ui/server-message-copy';
import { tPurchasesDashboard } from './purchases-i18n';
import { tReceiptError } from './receipts-i18n';

/** User-facing copy for a failed receipt write -- never a raw database message. */
export function describeReceiptWriteError(result: Exclude<SpendReceiptWriteResult<unknown>, { status: 'success' }>, lang: Lang): string {
  switch (result.status) {
    case 'receipt_error':
      return tReceiptError(lang, result.code);
    case 'not_authenticated':
      return tPurchasesDashboard(lang, 'pleaseSignInAgainError');
    case 'no_membership':
      return tPurchasesDashboard(lang, 'notMemberOfWorkspaceError');
    case 'unauthorized':
      return localizeServerMessage(result.status, result.message, lang);
    default:
      return tReceiptError(lang, 'generic');
  }
}
