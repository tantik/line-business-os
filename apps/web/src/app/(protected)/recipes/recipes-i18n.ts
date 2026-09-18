import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the canonical Recipes/SOP page chrome
 * (`/dashboard/workforce/recipes` and `/dashboard/workforce/recipes/[recipeId]`).
 * Reuses the existing `LangProvider`/`useLang`/`makeTranslator` mechanism
 * (`@/lib/demo/cafe/i18n`), the same one the canonical Staff dashboard,
 * Admin page, and Inventory page already use -- a new dictionary, not a new
 * i18n system. Closes the Cafe v2.1 Product/UX Reconciliation Audit's
 * Recipes finding (§8, §14/§16, Part G): recipe *content* is already
 * bilingual by data model (`titleJa`/`titleEn` etc.), but the surrounding
 * page chrome was hardcoded English. Does not modify the recipe
 * translation data architecture -- chrome only.
 */
interface RecipesDict {
  pageTitle: string;
  pageDescription: string;
  backToWorkforce: string;
  backToRecipes: string;
  signOut: string;
  unavailable: string;
  /** Mission 8 Quality Sweep fix (F8/F16): fallback title when a recipe has neither a JA nor EN title -- previously fell back to the raw recipe UUID (list/detail) or an empty title bar (popup Modal), inconsistently, across three code paths. */
  untitledRecipe: string;
  noRecipesYet: string;
  noRecipesMatchSearch: string;
  searchPlaceholder: string;
  manageDescription: string;
  filterArchive: string;
  filterDraft: string;
  instructionBadge: string;
  ingredientsHeading: string;
  noIngredients: string;
  stepsHeading: string;
  noSteps: string;
  notesHeading: string;
  noNotes: string;
  // Manager CRUD (Cafe v2.1 QA audit P1-2, 2026-08-17)
  addRecipeButton: string;
  editButton: string;
  deleteButton: string;
  deleteConfirmTitle: string;
  archivedBadge: string;
  draftBadge: string;
  publishedBadge: string;
  newRecipeHeading: string;
  editRecipeHeading: string;
  formContentKindLabel: string;
  formContentKindRecipe: string;
  formContentKindInstruction: string;
  formStatusLabel: string;
  formStatusDraft: string;
  formStatusPublished: string;
  formStatusArchived: string;
  formTitleLabel: string;
  formDescriptionLabel: string;
  formPhotoLabel: string;
  formChooseImage: string;
  formReplaceImage: string;
  formRemoveImage: string;
  formUndoRemoveImage: string;
  formPhotoHint: string;
  formPhotoWillBeRemoved: string;
  formPhotoTooLarge: string;
  formPhotoDimensionsInvalid: string;
  formIngredientsLabel: string;
  formStepsLabel: string;
  formOnePerLineHint: string;
  formNoteTitleLabel: string;
  formNoteBodyLabel: string;
  formSaving: string;
  formSaveChanges: string;
  formCreateRecipe: string;
  formCancel: string;
  // WP-9: shared "?" help affordance on the Manager Recipes popup
  popupHelpAriaLabel: string;
  popupHelpTitle: string;
  popupHelpBody: string;
  // WP5 (Cafe v2.2 Recipe Intelligence Lite): per-ingredient Inventory mapping form
  formIngredientLabelPlaceholder: string;
  formRemoveIngredient: string;
  formAddIngredient: string;
  formLinkIngredientToInventory: string;
  formUnlinkIngredient: string;
  formIngredientItemLabel: string;
  formIngredientQuantityLabel: string;
  formIngredientUnitLabel: string;
  formIngredientItemUnavailable: string;
  // WP5: allergen + estimated cost display
  allergensNotConfigured: string;
  allergensNoneKnown: string;
  costSummaryHeading: string;
  costKnownSubtotalLabel: string;
  costIncompleteMessage: string;
}

const dictionary: Record<Lang, RecipesDict> = {
  en: {
    pageTitle: 'Recipes',
    pageDescription: 'Published recipes for',
    backToWorkforce: 'Back',
    backToRecipes: 'Back to recipes',
    signOut: 'Sign out',
    unavailable: 'Recipes are temporarily unavailable.',
    untitledRecipe: 'Untitled recipe',
    noRecipesYet: 'No recipes yet.',
    noRecipesMatchSearch: 'No recipes match your search.',
    searchPlaceholder: 'Search by recipe name',
    manageDescription: "Manage this store's recipes and manuals. Instructions appear at the top of the staff screen.",
    filterArchive: 'Archive',
    filterDraft: 'Draft',
    instructionBadge: 'ⓘ Instruction',
    ingredientsHeading: 'Ingredients',
    noIngredients: 'No ingredients listed.',
    stepsHeading: 'Steps',
    noSteps: 'No steps listed.',
    notesHeading: 'Notes',
    noNotes: 'No notes.',
    addRecipeButton: '+ Add recipe',
    editButton: 'Edit',
    deleteButton: 'Delete',
    deleteConfirmTitle: 'Delete this recipe? This cannot be undone.',
    archivedBadge: 'Archived',
    draftBadge: 'Draft',
    publishedBadge: 'Published',
    newRecipeHeading: 'New recipe',
    editRecipeHeading: 'Edit recipe',
    formContentKindLabel: 'Type',
    formContentKindRecipe: 'Recipe',
    formContentKindInstruction: 'Instruction',
    formStatusLabel: 'Status',
    formStatusDraft: 'Draft',
    formStatusPublished: 'Published',
    formStatusArchived: 'Archived',
    formTitleLabel: 'Title',
    formDescriptionLabel: 'Description',
    formPhotoLabel: 'Photo',
    formChooseImage: 'Choose image',
    formReplaceImage: 'Replace image',
    formRemoveImage: 'Remove image',
    formUndoRemoveImage: 'Undo remove',
    formPhotoHint: 'JPEG, PNG or WebP, up to 2 MB and 4096×4096',
    formPhotoWillBeRemoved: 'Will be removed when saved',
    formPhotoTooLarge: 'Choose an image up to 2 MB.',
    formPhotoDimensionsInvalid: 'Image dimensions must be at most 4096×4096.',
    formIngredientsLabel: 'Ingredients',
    formStepsLabel: 'Steps',
    formOnePerLineHint: 'One per line',
    formNoteTitleLabel: 'Note title (optional)',
    formNoteBodyLabel: 'Note body (optional)',
    formSaving: 'Saving…',
    formSaveChanges: 'Save changes',
    formCreateRecipe: 'Create recipe',
    formCancel: 'Cancel',
    popupHelpAriaLabel: 'About recipes',
    popupHelpTitle: 'About recipes',
    popupHelpBody:
      'Recipes and work instructions help staff follow the same procedure. Drafts are visible only to managers; publish an item when staff should be able to open it. Archive items you may need later, and use permanent deletion only when the content is no longer required.',
    formIngredientLabelPlaceholder: 'Ingredient name',
    formRemoveIngredient: 'Remove ingredient',
    formAddIngredient: '+ Add ingredient',
    formLinkIngredientToInventory: 'Link to inventory item',
    formUnlinkIngredient: 'Unlink from inventory item',
    formIngredientItemLabel: 'Inventory item',
    formIngredientQuantityLabel: 'Quantity used',
    formIngredientUnitLabel: 'Unit',
    formIngredientItemUnavailable: 'No inventory items available to link at this location.',
    allergensNotConfigured: 'Allergens not set',
    allergensNoneKnown: 'No known allergens',
    costSummaryHeading: 'Estimated ingredient cost',
    costKnownSubtotalLabel: 'Estimated total',
    costIncompleteMessage: 'Estimated cost so far: {knownSubtotal} ({pricedCount} of {ingredientCount} ingredients priced). Price not set or unit conversion not supported for the rest.',
  },
  ja: {
    pageTitle: 'レシピ',
    pageDescription: '公開中のレシピ -',
    backToWorkforce: '戻る',
    backToRecipes: 'レシピ一覧に戻る',
    signOut: 'サインアウト',
    unavailable: 'レシピは一時的に利用できません。',
    untitledRecipe: '無題のレシピ',
    noRecipesYet: 'まだレシピがありません。',
    noRecipesMatchSearch: '検索条件に一致するレシピがありません。',
    searchPlaceholder: 'レシピ名で検索',
    manageDescription: 'この店舗のレシピ・マニュアルを管理します。手順はスタッフ画面の上部に表示されます。',
    filterArchive: 'アーカイブ',
    filterDraft: '下書き',
    instructionBadge: 'ⓘ 手順書',
    ingredientsHeading: '材料',
    noIngredients: '材料が登録されていません。',
    stepsHeading: '手順',
    noSteps: '手順が登録されていません。',
    notesHeading: 'メモ',
    noNotes: 'メモはありません。',
    addRecipeButton: '+ レシピを追加',
    editButton: '編集',
    deleteButton: '削除',
    deleteConfirmTitle: 'このレシピを削除しますか？元に戻せません。',
    archivedBadge: 'アーカイブ済み',
    draftBadge: '下書き',
    publishedBadge: '公開中',
    newRecipeHeading: '新規レシピ',
    editRecipeHeading: 'レシピを編集',
    formContentKindLabel: '種類',
    formContentKindRecipe: 'レシピ',
    formContentKindInstruction: '手順書',
    formStatusLabel: 'ステータス',
    formStatusDraft: '下書き',
    formStatusPublished: '公開済み',
    formStatusArchived: 'アーカイブ済み',
    formTitleLabel: 'タイトル',
    formDescriptionLabel: '説明',
    formPhotoLabel: '写真',
    formChooseImage: '画像を選択',
    formReplaceImage: '画像を差し替え',
    formRemoveImage: '画像を削除',
    formUndoRemoveImage: '削除を取り消す',
    formPhotoHint: 'JPEG・PNG・WebP、最大2MB・4096×4096',
    formPhotoWillBeRemoved: '保存時に削除されます',
    formPhotoTooLarge: '画像は2MB以下にしてください。',
    formPhotoDimensionsInvalid: '画像は4096×4096以下にしてください。',
    formIngredientsLabel: '材料',
    formStepsLabel: '手順',
    formOnePerLineHint: '1行に1つ',
    formNoteTitleLabel: 'メモのタイトル（任意）',
    formNoteBodyLabel: 'メモの内容（任意）',
    formSaving: '保存中…',
    formSaveChanges: '変更を保存',
    formCreateRecipe: 'レシピを作成',
    formCancel: 'キャンセル',
    popupHelpAriaLabel: 'レシピについて',
    popupHelpTitle: 'レシピについて',
    popupHelpBody:
      'レシピと手順書は、スタッフが同じ手順で作業するための共有資料です。下書きはマネージャーだけに表示され、公開するとスタッフも確認できます。後で使う可能性がある場合はアーカイブし、完全削除は不要になった内容にのみ使用してください。',
    formIngredientLabelPlaceholder: '材料名',
    formRemoveIngredient: '材料を削除',
    formAddIngredient: '+ 材料を追加',
    formLinkIngredientToInventory: '在庫品目と紐付ける',
    formUnlinkIngredient: '在庫品目との紐付けを解除',
    formIngredientItemLabel: '在庫品目',
    formIngredientQuantityLabel: '使用量',
    formIngredientUnitLabel: '単位',
    formIngredientItemUnavailable: 'この拠点で紐付け可能な在庫品目がありません。',
    allergensNotConfigured: 'アレルゲン未設定',
    allergensNoneKnown: 'アレルゲンなし（確認済み）',
    costSummaryHeading: '材料費目安',
    costKnownSubtotalLabel: '概算合計',
    costIncompleteMessage: '現時点の概算費用: {knownSubtotal}（{ingredientCount}個中{pricedCount}個が計算済み）。残りは価格未設定または単位換算不可です。',
  },
};

export const tRecipes = makeTranslator(dictionary);

/** Fixed 10-code allergen vocabulary (migration 0121) -- JA/EN display names. */
const ALLERGEN_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    egg: 'Egg', milk: 'Milk', wheat: 'Wheat', buckwheat: 'Buckwheat', peanut: 'Peanut',
    shrimp: 'Shrimp', crab: 'Crab', walnut: 'Walnut', soy: 'Soy', sesame: 'Sesame',
  },
  ja: {
    egg: '卵', milk: '乳', wheat: '小麦', buckwheat: 'そば', peanut: '落花生',
    shrimp: 'えび', crab: 'かに', walnut: 'くるみ', soy: '大豆', sesame: 'ごま',
  },
};

/** Localized display name for one allergen code; falls back to the raw code for an unrecognized value (should not happen -- the DB CHECK constraint already limits this to the fixed vocabulary). */
export function allergenLabel(lang: Lang, code: string): string {
  return ALLERGEN_LABELS[lang][code] ?? code;
}
