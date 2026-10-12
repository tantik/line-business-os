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
  notFoundError: string;
  pleaseSignInAgainError: string;
  notMemberOfWorkspaceError: string;
  blockedByHistoryError: string;
  somethingWentWrongError: string;
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
  formPhotoLabel: string;
  formChooseImage: string;
  formReplaceImage: string;
  formRemoveImage: string;
  formUndoRemoveImage: string;
  formPhotoHint: string;
  formPhotoWillBeRemoved: string;
  formPhotoTooLarge: string;
  formPhotoDimensionsInvalid: string;
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
  footerTotalItems: string;
  footerNeedRestocking: string;
  footerSufficient: string;
  footerTip: string;
  purchasedBadgeAriaLabel: string;
  // WP5 (Cafe v2.2 Recipe Intelligence Lite): reference price + allergens
  referencePriceLabel: string;
  referencePriceHint: string;
  allergensLabel: string;
  allergensConfirmedCheckboxLabel: string;
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
    notFoundError: 'Not found.',
    pleaseSignInAgainError: 'Please sign in again.',
    notMemberOfWorkspaceError: 'You are not a member of this workspace.',
    blockedByHistoryError: 'This item has past stock-count history, so it cannot be permanently deleted. Use Deactivate instead.',
    somethingWentWrongError: 'Something went wrong. Please try again.',
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
    confirmDeleteItemBody: 'This also permanently deletes this item’s entire stock-count history. This cannot be undone.',
    nameLabel: 'Name',
    formPhotoLabel: 'Photo',
    formChooseImage: 'Choose image',
    formReplaceImage: 'Replace image',
    formRemoveImage: 'Remove image',
    formUndoRemoveImage: 'Undo remove',
    formPhotoHint: 'JPEG, PNG or WebP, up to 2 MB and 4096×4096',
    formPhotoWillBeRemoved: 'Will be removed when saved',
    formPhotoTooLarge: 'Choose an image up to 2 MB.',
    formPhotoDimensionsInvalid: 'Image dimensions must be at most 4096×4096.',
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
      'Enter the quantity currently on hand; it saves automatically. "Reorder at" is the level that triggers a restock warning. "Target" is the quantity to aim for after restocking. Deactivating removes an item from daily checks while keeping its history.',
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
    footerTotalItems: 'Total items',
    footerNeedRestocking: 'Need restocking',
    footerSufficient: 'Sufficient',
    footerTip: 'Tip: enter the actual quantity and press Enter (or just wait a moment) to save.',
    purchasedBadgeAriaLabel: 'Marked as bought in Purchases — update the actual quantity below to clear this',
    referencePriceLabel: 'Reference price',
    referencePriceHint: 'An estimate, in yen per 1 unit — used only for the Recipes estimated-cost feature, never for receiving or accounting.',
    allergensLabel: 'Allergens',
    allergensConfirmedCheckboxLabel: 'Allergen information confirmed for this item',
  },
  ja: {
    pageTitle: '在庫',
    pageDescription: '日次在庫確認 -',
    backToDashboard: '戻る',
    signOut: 'ログアウト',
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
    notFoundError: '見つかりません。',
    pleaseSignInAgainError: 'もう一度ログインしてください。',
    notMemberOfWorkspaceError: 'このワークスペースのメンバーではありません。',
    blockedByHistoryError: 'この商品には過去の在庫カウント履歴があるため、完全に削除できません。代わりに無効化を使用してください。',
    somethingWentWrongError: 'エラーが発生しました。もう一度お試しください。',
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
    confirmDeleteItemBody: 'この商品のカウント履歴もすべて完全に削除されます。この操作は取り消せません。',
    nameLabel: '名前',
    formPhotoLabel: '写真',
    formChooseImage: '画像を選択',
    formReplaceImage: '画像を差し替え',
    formRemoveImage: '画像を削除',
    formUndoRemoveImage: '削除を取り消す',
    formPhotoHint: 'JPEG・PNG・WebP、最大2MB・4096×4096',
    formPhotoWillBeRemoved: '保存時に削除されます',
    formPhotoTooLarge: '画像は2MB以下にしてください。',
    formPhotoDimensionsInvalid: '画像は4096×4096以下にしてください。',
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
      '現在ある数量を入力すると自動保存されます。「発注点」は補充の警告を出す基準、「目標」は補充後にそろえておきたい数量です。商品を無効化すると、履歴を残したまま日々の在庫確認から外せます。',
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
    footerTotalItems: '登録商品数',
    footerNeedRestocking: '要補充',
    footerSufficient: '十分',
    footerTip: 'ヒント: 実数を入力してEnterキー(または少し待つだけ)で保存されます。',
    purchasedBadgeAriaLabel: '仕入れで購入済みとしてマークされています — 下の実数を更新すると解除されます',
    referencePriceLabel: '参考価格',
    referencePriceHint: '1単位あたりの目安価格（円）。レシピの材料費目安にのみ使用され、仕入れや会計には使用されません。',
    allergensLabel: 'アレルゲン',
    allergensConfirmedCheckboxLabel: 'この品目のアレルゲン情報を確認済み',
  },
};

export const tInventoryDashboard = makeTranslator(dictionary);

/**
 * 29-code allergen vocabulary (migration 0124; 消費者庁 食品表示基準
 * revision effective 2026-04-01), grouped for the item form: 9 特定原材料
 * (mandatory) then 20 特定原材料に準ずるもの (recommended).
 * Same list/order as `lib/workforce/recipe-allergens.ts`'s copy, kept
 * independent (Inventory does not import from the Workforce/Recipes module,
 * see `validation.ts`'s header note); `recipe-allergens.test.ts` asserts the
 * two copies and the migration's array are identical.
 */
export const ALLERGEN_CODE_GROUPS = [
  {
    key: 'mandatory',
    codes: ['egg', 'milk', 'wheat', 'buckwheat', 'peanut', 'shrimp', 'crab', 'walnut', 'cashew'],
  },
  {
    key: 'recommended',
    codes: [
      'almond', 'abalone', 'squid', 'salmon_roe', 'orange', 'kiwi', 'beef', 'sesame', 'salmon', 'mackerel',
      'soy', 'chicken', 'banana', 'pistachio', 'pork', 'macadamia', 'peach', 'yam', 'apple', 'gelatin',
    ],
  },
] as const;

export const ALLERGEN_CODES: readonly string[] = ALLERGEN_CODE_GROUPS.flatMap((group) => group.codes);

export const ALLERGEN_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    egg: 'Egg', milk: 'Milk', wheat: 'Wheat', buckwheat: 'Buckwheat', peanut: 'Peanut',
    shrimp: 'Shrimp', crab: 'Crab', walnut: 'Walnut',
    almond: 'Almond', abalone: 'Abalone', squid: 'Squid', salmon_roe: 'Salmon roe', orange: 'Orange',
    cashew: 'Cashew nut', kiwi: 'Kiwi fruit', beef: 'Beef', sesame: 'Sesame', salmon: 'Salmon',
    mackerel: 'Mackerel', soy: 'Soy', chicken: 'Chicken', banana: 'Banana', pistachio: 'Pistachio', pork: 'Pork',
    macadamia: 'Macadamia nut', peach: 'Peach', yam: 'Yam', apple: 'Apple', gelatin: 'Gelatin',
  },
  ja: {
    egg: '卵', milk: '乳', wheat: '小麦', buckwheat: 'そば', peanut: '落花生',
    shrimp: 'えび', crab: 'かに', walnut: 'くるみ',
    almond: 'アーモンド', abalone: 'あわび', squid: 'いか', salmon_roe: 'いくら', orange: 'オレンジ',
    cashew: 'カシューナッツ', kiwi: 'キウイフルーツ', beef: '牛肉', sesame: 'ごま', salmon: 'さけ',
    mackerel: 'さば', soy: '大豆', chicken: '鶏肉', banana: 'バナナ', pistachio: 'ピスタチオ', pork: '豚肉',
    macadamia: 'マカダミアナッツ', peach: 'もも', yam: 'やまいも', apple: 'りんご', gelatin: 'ゼラチン',
  },
};

const ALLERGEN_GROUP_HEADINGS: Record<Lang, Record<(typeof ALLERGEN_CODE_GROUPS)[number]['key'], string>> = {
  en: { mandatory: 'Mandatory allergens ({count})', recommended: 'Recommended allergens ({count})' },
  ja: { mandatory: '特定原材料（{count}品目）', recommended: '特定原材料に準ずるもの（{count}品目）' },
};

/** Subheading for one allergen group; `{count}` comes from the group's own code list, never hard-coded. */
export function allergenGroupHeading(lang: Lang, group: (typeof ALLERGEN_CODE_GROUPS)[number]): string {
  return ALLERGEN_GROUP_HEADINGS[lang][group.key].replace('{count}', String(group.codes.length));
}

export function allergenLabel(lang: Lang, code: string): string {
  return ALLERGEN_LABELS[lang][code] ?? code;
}
