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
  noRecipesYet: string;
  noRecipesInCategory: string;
  uncategorized: string;
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
  archiveButton: string;
  restoreButton: string;
  deleteForeverButton: string;
  deleteForeverConfirm: string;
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
}

const dictionary: Record<Lang, RecipesDict> = {
  en: {
    pageTitle: 'Recipes',
    pageDescription: 'Published recipes for',
    backToWorkforce: 'Back',
    backToRecipes: 'Back to recipes',
    signOut: 'Sign out',
    unavailable: 'Recipes are temporarily unavailable.',
    noRecipesYet: 'No recipes available yet.',
    noRecipesInCategory: 'No recipes in this category yet.',
    uncategorized: 'Uncategorized',
    instructionBadge: 'ⓘ Instruction',
    ingredientsHeading: 'Ingredients',
    noIngredients: 'No ingredients listed.',
    stepsHeading: 'Steps',
    noSteps: 'No steps listed.',
    notesHeading: 'Notes',
    noNotes: 'No notes.',
    addRecipeButton: '+ Add recipe',
    editButton: 'Edit',
    archiveButton: 'Archive',
    restoreButton: 'Restore',
    deleteForeverButton: 'Delete forever',
    deleteForeverConfirm: 'Permanently delete this recipe? This cannot be undone.',
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
      'Recipes and instructions are shared reference material for staff. Draft items are only visible to managers; publish a recipe to make it visible to staff. Archiving hides a recipe without deleting it -- use "Delete forever" only once you are sure it will never be needed again.',
  },
  ja: {
    pageTitle: 'レシピ',
    pageDescription: '公開中のレシピ -',
    backToWorkforce: '戻る',
    backToRecipes: 'レシピ一覧に戻る',
    signOut: 'サインアウト',
    unavailable: 'レシピは一時的に利用できません。',
    noRecipesYet: 'まだ利用可能なレシピがありません。',
    noRecipesInCategory: 'このカテゴリにはまだレシピがありません。',
    uncategorized: '未分類',
    instructionBadge: 'ⓘ 手順書',
    ingredientsHeading: '材料',
    noIngredients: '材料が登録されていません。',
    stepsHeading: '手順',
    noSteps: '手順が登録されていません。',
    notesHeading: 'メモ',
    noNotes: 'メモはありません。',
    addRecipeButton: '+ レシピを追加',
    editButton: '編集',
    archiveButton: 'アーカイブ',
    restoreButton: '復元',
    deleteForeverButton: '完全に削除',
    deleteForeverConfirm: 'このレシピを完全に削除しますか？元に戻せません。',
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
      'レシピ・手順書はスタッフ向けの共有資料です。下書きはマネージャーのみ閲覧でき、公開するとスタッフにも表示されます。アーカイブすると削除せずに一覧から隠せます -- 「完全に削除」は今後二度と必要ないと確信できる場合のみ使用してください。',
  },
};

export const tRecipes = makeTranslator(dictionary);
