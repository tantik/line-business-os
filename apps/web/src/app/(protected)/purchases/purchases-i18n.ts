import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the Purchases module -- follows `inventory-i18n.ts`'s
 * exact pattern (same `LangProvider`/`useLang`/`makeTranslator` mechanism, a
 * new dictionary, not a new i18n system).
 */
interface PurchasesDashboardDict {
  pageTitle: string;
  pageDescription: string;
  backToDashboard: string;
  signOut: string;
  unavailable: string;
  noItemsYet: string;
  noItemsMatchFilter: string;
  filterAll: string;
  filterPending: string;
  filterBought: string;
  needToBuyLabel: string;
  reorderAtLabel: string;
  targetLabel: string;
  boughtButton: string;
  markingBoughtButton: string;
  boughtAtLabel: string;
  boughtByPrefix: string;
  unknownStaffLabel: string;
  footerTotalItems: string;
  footerBought: string;
  footerPending: string;
  popupHelpAriaLabel: string;
  popupHelpTitle: string;
  popupHelpBody: string;
  notShortError: string;
  closeButton: string;
}

const dictionary: Record<Lang, PurchasesDashboardDict> = {
  en: {
    pageTitle: 'Purchases',
    pageDescription: 'Items to buy for',
    backToDashboard: 'Back',
    signOut: 'Sign out',
    unavailable: 'Purchases is temporarily unavailable.',
    noItemsYet: 'Nothing needs buying right now.',
    noItemsMatchFilter: 'No items match this filter.',
    filterAll: 'All',
    filterPending: 'Pending',
    filterBought: 'Bought',
    needToBuyLabel: 'Need to buy:',
    reorderAtLabel: 'Reorder at:',
    targetLabel: 'Target:',
    boughtButton: 'Bought',
    markingBoughtButton: 'Marking…',
    boughtAtLabel: 'Bought at',
    boughtByPrefix: 'by',
    unknownStaffLabel: 'Unknown staff',
    footerTotalItems: 'Total items',
    footerBought: 'Bought',
    footerPending: 'Pending',
    popupHelpAriaLabel: 'About purchases',
    popupHelpTitle: 'About purchases',
    popupHelpBody:
      'This list shows items Inventory says are currently short, with how many to buy. Pressing Bought only records that you bought it -- it does not change Inventory. Once someone updates the actual quantity in Inventory, this list updates automatically: an item that is now sufficient disappears, and an item that is still short shows as Pending again with the new amount, even if it was already marked Bought.',
    notShortError: 'This item no longer needs buying.',
    closeButton: 'Close',
  },
  ja: {
    pageTitle: '購入',
    pageDescription: '本日の購入品 -',
    backToDashboard: '戻る',
    signOut: 'サインアウト',
    unavailable: '購入情報は一時的に利用できません。',
    noItemsYet: '現在購入が必要な商品はありません。',
    noItemsMatchFilter: '該当する商品がありません。',
    filterAll: 'すべて',
    filterPending: '未購入',
    filterBought: '購入済み',
    needToBuyLabel: '必要数:',
    reorderAtLabel: '発注点:',
    targetLabel: '目標:',
    boughtButton: '購入済み',
    markingBoughtButton: '記録中…',
    boughtAtLabel: '購入時刻',
    boughtByPrefix: '担当:',
    unknownStaffLabel: '不明なスタッフ',
    footerTotalItems: '合計',
    footerBought: '購入済み',
    footerPending: '未購入',
    popupHelpAriaLabel: '購入について',
    popupHelpTitle: '購入について',
    popupHelpBody:
      'このリストは在庫が不足している商品と必要な購入数を表示します。「購入済み」を押しても在庫は変更されません -- 購入したことを記録するだけです。在庫で実数を更新すると、このリストは自動的に更新されます: 十分になった商品は消え、まだ不足している商品は新しい数量で「未購入」に戻ります(すでに購入済みとしていても)。',
    notShortError: 'この商品はもう購入する必要がありません。',
    closeButton: '閉じる',
  },
};

export const tPurchasesDashboard = makeTranslator(dictionary);
