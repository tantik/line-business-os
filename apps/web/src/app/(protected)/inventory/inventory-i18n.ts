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
  searchLabel: string;
  searchPlaceholder: string;
  noItemsMatchFilter: string;
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
    searchLabel: 'Search',
    searchPlaceholder: 'Search items…',
    noItemsMatchFilter: 'No items match this filter.',
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
    searchLabel: '検索',
    searchPlaceholder: '商品を検索…',
    noItemsMatchFilter: '該当する商品がありません。',
  },
};

export const tInventoryDashboard = makeTranslator(dictionary);
