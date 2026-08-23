import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the canonical Inventory page chrome
 * (`/dashboard/inventory`). Reuses the existing `LangProvider`/`useLang`/
 * `makeTranslator` mechanism (`@/lib/demo/cafe/i18n`), the same one the
 * canonical Staff dashboard and Admin page already use -- a new dictionary,
 * not a new i18n system. Closes the Cafe v2.1 Product/UX Reconciliation
 * Audit's Inventory finding (§8, §14): the page was entirely hardcoded
 * English (e.g. "Not yet counted", "Sufficient", "+ Add item") with no i18n
 * import at all. Presentation-only: inventory business rules, min/target/
 * shortage calculations, and stock-count semantics are unchanged.
 */
interface InventoryDashboardDict {
  pageTitle: string;
  pageDescription: string;
  backToDashboard: string;
  signOut: string;
  unavailable: string;
  itemsSufficient: string;
  itemsShortage: string;
  addItem: string;
  addItemButton: string;
  editItemHeading: string;
  newItemHeading: string;
  noItemsYet: string;
  statusNotCounted: string;
  statusShortageLabel: string;
  statusSufficient: string;
  targetLabel: string;
  reorderAtLabel: string;
  currentLabel: string;
  lastUpdatedLabel: string;
  unknownStaffLabel: string;
  editButton: string;
  deactivateButton: string;
  reactivateButton: string;
  actualQuantityLabel: string;
  saveCountButton: string;
  savingButton: string;
  savingStatus: string;
  savedStatus: string;
  saveErrorStatus: string;
  deleteButton: string;
  deletingButton: string;
  confirmDeactivateItemTitle: string;
  confirmDeleteItemTitle: string;
  confirmDeleteItemBody: string;
  nameLabel: string;
  targetQuantityLabel: string;
  reorderPointLabel: string;
  unitLabel: string;
  sortOrderLabel: string;
  saveChangesButton: string;
  cancelButton: string;
  filterAll: string;
  filterShortage: string;
  filterOk: string;
  filterInactive: string;
  searchLabel: string;
  searchPlaceholder: string;
  noItemsMatchFilter: string;
  // WP-9: shared "?" help affordance on the Manager Inventory popup
  popupHelpAriaLabel: string;
  popupHelpTitle: string;
  popupHelpBody: string;
  // 2026-08-21 redesign: table columns, sort, footer summary, •••-menu, autosave hint.
  colItem: string;
  colTarget: string;
  colReorderAt: string;
  colCurrent: string;
  colActualQuantity: string;
  colStatus: string;
  colShortage: string;
  colActions: string;
  statusInactiveLabel: string;
  statusShortageBadge: string;
  sortLabel: string;
  sortNameAsc: string;
  sortShortageFirst: string;
  moreActionsAriaLabel: string;
  clearActualQuantityAriaLabel: string;
  pressEnterToSaveHint: string;
  footerTotalItems: string;
  footerNeedRestocking: string;
  footerSufficient: string;
  footerTip: string;
}

const dictionary: Record<Lang, InventoryDashboardDict> = {
  en: {
    pageTitle: 'Inventory',
    pageDescription: 'Daily stock check for',
    backToDashboard: 'Back',
    signOut: 'Sign out',
    unavailable: 'Inventory is temporarily unavailable.',
    itemsSufficient: 'All items sufficient',
    itemsShortage: 'item(s) need restocking',
    addItem: '+ Add item',
    addItemButton: 'Add item',
    editItemHeading: 'Edit',
    newItemHeading: 'New item',
    noItemsYet: 'No inventory items yet.',
    statusNotCounted: 'Not yet counted',
    statusShortageLabel: 'Shortage — need',
    statusSufficient: 'Sufficient',
    targetLabel: 'Target:',
    reorderAtLabel: 'Reorder at:',
    currentLabel: 'Current:',
    lastUpdatedLabel: 'Last updated',
    unknownStaffLabel: 'Unknown staff',
    editButton: 'Edit',
    deactivateButton: 'Deactivate',
    reactivateButton: 'Reactivate',
    actualQuantityLabel: 'Actual quantity',
    saveCountButton: 'Save count',
    savingButton: 'Saving...',
    savingStatus: 'Saving...',
    savedStatus: 'Saved',
    saveErrorStatus: 'Could not save',
    deleteButton: 'Delete permanently',
    deletingButton: 'Deleting...',
    confirmDeactivateItemTitle: 'Deactivate this item?',
    confirmDeleteItemTitle: 'Permanently delete this item?',
    confirmDeleteItemBody: 'This only works for an item with no stock-count history. This cannot be undone.',
    nameLabel: 'Name',
    targetQuantityLabel: 'Target quantity',
    reorderPointLabel: 'Reorder point',
    unitLabel: 'Unit',
    sortOrderLabel: 'Sort order',
    saveChangesButton: 'Save changes',
    cancelButton: 'Cancel',
    filterAll: 'All',
    filterShortage: 'Need reorder',
    filterOk: 'OK',
    filterInactive: 'Deactivated',
    searchLabel: 'Search',
    searchPlaceholder: 'Search items…',
    noItemsMatchFilter: 'No items match this filter.',
    popupHelpAriaLabel: 'About inventory',
    popupHelpTitle: 'About inventory',
    popupHelpBody:
      'The actual quantity autosaves as you type -- there is no separate Save button. "Reorder at" is the threshold below which an item shows as a shortage; "Target" is the amount a full restock should bring it back up to. Deactivating hides an item from the daily count without deleting its history.',
    colItem: 'Item',
    colTarget: 'Target',
    colReorderAt: 'Reorder at',
    colCurrent: 'Current',
    colActualQuantity: 'Actual quantity',
    colStatus: 'Status',
    colShortage: 'Shortage',
    colActions: 'Actions',
    statusInactiveLabel: 'Deactivated',
    statusShortageBadge: 'Shortage',
    sortLabel: 'Sort',
    sortNameAsc: 'Name (A–Z)',
    sortShortageFirst: 'Shortage first',
    moreActionsAriaLabel: 'More actions',
    clearActualQuantityAriaLabel: 'Clear',
    pressEnterToSaveHint: 'Press Enter to save',
    footerTotalItems: 'Total items',
    footerNeedRestocking: 'Need restocking',
    footerSufficient: 'Sufficient',
    footerTip: 'Tip: enter the actual quantity and press Enter (or just wait a moment) to save.',
  },
  ja: {
    pageTitle: '在庫',
    pageDescription: '日次在庫確認 -',
    backToDashboard: '戻る',
    signOut: 'サインアウト',
    unavailable: '在庫情報は一時的に利用できません。',
    itemsSufficient: 'すべての商品が十分です',
    itemsShortage: '件の商品が要補充です',
    addItem: '＋ 商品を追加',
    addItemButton: '商品を追加',
    editItemHeading: '編集',
    newItemHeading: '新規商品',
    noItemsYet: 'まだ在庫品目がありません。',
    statusNotCounted: '未カウント',
    statusShortageLabel: '不足 — 必要数',
    statusSufficient: '十分',
    targetLabel: '目標:',
    reorderAtLabel: '発注点:',
    currentLabel: '現在:',
    lastUpdatedLabel: '最終更新',
    unknownStaffLabel: '不明なスタッフ',
    editButton: '編集',
    deactivateButton: '無効化',
    reactivateButton: '再有効化',
    actualQuantityLabel: '実数',
    saveCountButton: 'カウントを保存',
    savingButton: '保存中...',
    savingStatus: '保存中...',
    savedStatus: '保存しました',
    saveErrorStatus: '保存できませんでした',
    deleteButton: '完全に削除',
    deletingButton: '削除中...',
    confirmDeactivateItemTitle: 'この商品を無効化しますか？',
    confirmDeleteItemTitle: 'この商品を完全に削除しますか？',
    confirmDeleteItemBody: 'カウント履歴がない商品のみ削除できます。この操作は取り消せません。',
    nameLabel: '名前',
    targetQuantityLabel: '目標数量',
    reorderPointLabel: '発注点',
    unitLabel: '単位',
    sortOrderLabel: '表示順',
    saveChangesButton: '変更を保存',
    cancelButton: 'キャンセル',
    filterAll: 'すべて',
    filterShortage: '要補充',
    filterOk: 'OK',
    filterInactive: '無効化済み',
    searchLabel: '検索',
    searchPlaceholder: '商品を検索…',
    noItemsMatchFilter: '該当する商品がありません。',
    popupHelpAriaLabel: '在庫について',
    popupHelpTitle: '在庫について',
    popupHelpBody:
      '実数は入力すると自動的に保存されます -- 保存ボタンはありません。「発注点」はこれを下回ると不足として表示されるしきい値、「目標」は補充で戻すべき量です。無効化すると履歴を削除せずに日次カウントから非表示になります。',
    colItem: '商品',
    colTarget: '目標',
    colReorderAt: '発注点',
    colCurrent: '現在庫',
    colActualQuantity: '実数',
    colStatus: 'ステータス',
    colShortage: '不足数',
    colActions: '操作',
    statusInactiveLabel: '無効化済み',
    statusShortageBadge: '不足',
    sortLabel: '並び替え',
    sortNameAsc: '名前 (A–Z)',
    sortShortageFirst: '不足を優先',
    moreActionsAriaLabel: 'その他の操作',
    clearActualQuantityAriaLabel: 'クリア',
    pressEnterToSaveHint: 'Enterキーで保存',
    footerTotalItems: '登録商品数',
    footerNeedRestocking: '要補充',
    footerSufficient: '十分',
    footerTip: 'ヒント: 実数を入力してEnterキー(または少し待つだけ)で保存されます。',
  },
};

export const tInventoryDashboard = makeTranslator(dictionary);
