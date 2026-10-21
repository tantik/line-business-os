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
  filterOrdered: string;
  filterReceived: string;
  filterHistory: string;
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
  invalidQuantityError: string;
  staleSnapshotError: string;
  notFoundError: string;
  pleaseSignInAgainError: string;
  notMemberOfWorkspaceError: string;
  somethingWentWrongError: string;
  closeButton: string;
  orderQuantityLabel: string;
  orderButton: string;
  orderingButton: string;
  orderedAtLabel: string;
  orderedQuantityLabel: string;
  receiveQuantityLabel: string;
  receiveButton: string;
  receivingButton: string;
  receivedAtLabel: string;
  receivedQuantityLabel: string;
  historyEmpty: string;
  historyActionBought: string;
  historyActionOrdered: string;
  historyActionReceived: string;
  historyActionOrderClosed: string;
  awaitingSectionTitle: string;
  awaitingSectionHint: string;
  stockNowLabel: string;
  moreActionsAriaLabel: string;
  cancelRestButton: string;
  cancelRestPendingButton: string;
  cancelRestConfirmTitle: string;
  keepWaitingButton: string;
  noOpenOrderError: string;
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
    filterOrdered: 'Ordered',
    filterReceived: 'Received',
    filterHistory: 'History',
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
      'Shows items that need restocking and the quantity to buy. Marking an item as Bought records the purchase but does not change its stock count. After the actual quantity is updated in Inventory, items with enough stock disappear and any remaining shortage returns to Pending.',
    notShortError: 'This item no longer needs buying.',
    invalidQuantityError: 'Enter a quantity greater than 0.',
    staleSnapshotError: 'Stock levels changed since this was loaded. Please try again.',
    notFoundError: 'Not found.',
    pleaseSignInAgainError: 'Please sign in again.',
    notMemberOfWorkspaceError: 'You are not a member of this workspace.',
    somethingWentWrongError: 'Something went wrong. Please try again.',
    closeButton: 'Close',
    orderQuantityLabel: 'Quantity ordered',
    orderButton: 'Order',
    orderingButton: 'Ordering…',
    orderedAtLabel: 'Ordered at',
    orderedQuantityLabel: 'Ordered:',
    receiveQuantityLabel: 'Quantity received',
    receiveButton: 'Receive',
    receivingButton: 'Receiving…',
    receivedAtLabel: 'Received at',
    receivedQuantityLabel: 'Received:',
    historyEmpty: 'No purchase history yet.',
    historyActionBought: 'Bought',
    historyActionOrdered: 'Ordered',
    historyActionReceived: 'Received',
    historyActionOrderClosed: 'Rest cancelled',
    awaitingSectionTitle: 'Awaiting delivery',
    awaitingSectionHint: 'Ordered, not delivered yet. Stock is already above the reorder point.',
    stockNowLabel: 'In stock:',
    moreActionsAriaLabel: 'More actions',
    cancelRestButton: 'Cancel the rest',
    cancelRestPendingButton: 'Cancelling…',
    cancelRestConfirmTitle: 'Cancel the rest of this order?',
    keepWaitingButton: 'Keep waiting',
    noOpenOrderError: 'This order was already fully received or cancelled.',
  },
  ja: {
    pageTitle: '仕入れ',
    pageDescription: '本日の購入品 -',
    backToDashboard: '戻る',
    signOut: 'ログアウト',
    unavailable: '仕入れ情報は一時的に利用できません。',
    noItemsYet: '現在購入が必要な商品はありません。',
    noItemsMatchFilter: '該当する商品がありません。',
    filterAll: 'すべて',
    filterPending: '未購入',
    filterBought: '購入済み',
    filterOrdered: '発注済み',
    filterReceived: '入荷済み',
    filterHistory: '履歴',
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
    popupHelpAriaLabel: '仕入れについて',
    popupHelpTitle: '仕入れについて',
    popupHelpBody:
      '補充が必要な商品と購入数を表示します。「購入済み」は購入したことを記録するだけで、在庫数は変わりません。在庫画面で実数を更新すると、十分な商品は一覧から消え、不足が残る商品は新しい数量で「未購入」に戻ります。',
    notShortError: 'この商品はもう購入する必要がありません。',
    invalidQuantityError: '数量は1以上を入力してください。',
    staleSnapshotError: '在庫状況が更新されました。もう一度お試しください。',
    notFoundError: '見つかりません。',
    pleaseSignInAgainError: 'もう一度ログインしてください。',
    notMemberOfWorkspaceError: 'このワークスペースのメンバーではありません。',
    somethingWentWrongError: 'エラーが発生しました。もう一度お試しください。',
    closeButton: '閉じる',
    orderQuantityLabel: '発注数量',
    orderButton: '発注',
    orderingButton: '発注中…',
    orderedAtLabel: '発注時刻',
    orderedQuantityLabel: '発注数:',
    receiveQuantityLabel: '入荷数量',
    receiveButton: '入荷',
    receivingButton: '入荷登録中…',
    receivedAtLabel: '入荷時刻',
    receivedQuantityLabel: '入荷数:',
    historyEmpty: '仕入れ履歴はまだありません。',
    historyActionBought: '購入済み',
    historyActionOrdered: '発注済み',
    historyActionReceived: '入荷済み',
    historyActionOrderClosed: '残りを取り消し',
    awaitingSectionTitle: '入荷待ち',
    awaitingSectionHint: '発注済みで、まだ届いていない分です。在庫はすでに発注点を上回っています。',
    stockNowLabel: '在庫:',
    moreActionsAriaLabel: 'その他の操作',
    cancelRestButton: '残りを取り消す',
    cancelRestPendingButton: '取り消し中…',
    cancelRestConfirmTitle: '残りを取り消しますか？',
    keepWaitingButton: '戻る',
    noOpenOrderError: 'この発注はすでに全量入荷済みか、取り消されています。',
  },
};

export const tPurchasesDashboard = makeTranslator(dictionary);
