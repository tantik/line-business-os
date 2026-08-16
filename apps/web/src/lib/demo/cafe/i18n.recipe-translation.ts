import { makeTranslator, type Lang } from './i18n';

/**
 * UI-chrome dictionary for the Manager recipe-translation panel and the
 * Staff recipe English/Japanese-original toggle. System chrome only -- the
 * recipe content itself (Japanese original / English translation text) is
 * user-authored content resolved by `@/lib/content/recipe-display.ts`, a
 * separate concern from this static dictionary.
 */
interface RecipeTranslationDict {
  translateToggle: string;
  translationSectionTitle: string;
  translationSectionTitleField: string;
  translationSectionDescription: string;
  translationSectionIngredients: string;
  translationSectionSteps: string;
  translationSectionNotes: string;
  generateButton: string;
  generateButtonBusy: string;
  generateSummary: string;
  japaneseOriginalLabel: string;
  englishTranslationLabel: string;
  statusMachine: string;
  statusReviewed: string;
  statusStale: string;
  statusNone: string;
  providerLabel: string;
  translatedAtLabel: string;
  saveButton: string;
  saveButtonBusy: string;
  markReviewedButton: string;
  markReviewedButtonBusy: string;
  forceOverwriteConfirm: string;
  emptyTranslationBlocked: string;
  regenerateReviewedConfirm: string;
  staffViewEnglish: string;
  staffViewJapanese: string;
  staffMachineMarker: string;
  staffOriginalMarker: string;
}

const RECIPE_TRANSLATION_DICT: Record<Lang, RecipeTranslationDict> = {
  ja: {
    translateToggle: '翻訳',
    translationSectionTitle: 'タイトル',
    translationSectionTitleField: 'タイトル',
    translationSectionDescription: '説明',
    translationSectionIngredients: '材料',
    translationSectionSteps: '手順',
    translationSectionNotes: '注意事項',
    generateButton: '英語翻訳を生成',
    generateButtonBusy: '翻訳を生成しています…',
    generateSummary: '件のフィールドを更新しました',
    japaneseOriginalLabel: '日本語（原文）',
    englishTranslationLabel: '英語訳',
    statusMachine: '機械翻訳（未確認）',
    statusReviewed: '確認済み',
    statusStale: '原文が更新されています',
    statusNone: '未翻訳',
    providerLabel: '翻訳元',
    translatedAtLabel: '翻訳日時',
    saveButton: '保存',
    saveButtonBusy: '保存しています…',
    markReviewedButton: '確認済みにする',
    markReviewedButtonBusy: '更新しています…',
    forceOverwriteConfirm: 'この翻訳はすでに確認済みです。上書きしますか？',
    emptyTranslationBlocked: '英語訳を入力してください。',
    regenerateReviewedConfirm: '原文が変更された確認済み翻訳を、機械翻訳で置き換えますか？',
    staffViewEnglish: 'English',
    staffViewJapanese: '日本語原文',
    staffMachineMarker: '機械翻訳',
    staffOriginalMarker: '原文（日本語）',
  },
  en: {
    translateToggle: 'Translate',
    translationSectionTitle: 'Title',
    translationSectionTitleField: 'Title',
    translationSectionDescription: 'Description',
    translationSectionIngredients: 'Ingredients',
    translationSectionSteps: 'Steps',
    translationSectionNotes: 'Notes',
    generateButton: 'Generate English translation',
    generateButtonBusy: 'Generating translation…',
    generateSummary: 'field(s) updated',
    japaneseOriginalLabel: 'Japanese (original)',
    englishTranslationLabel: 'English translation',
    statusMachine: 'Machine translation (unreviewed)',
    statusReviewed: 'Reviewed',
    statusStale: 'Original text has changed since this was translated',
    statusNone: 'Not translated',
    providerLabel: 'Provider',
    translatedAtLabel: 'Translated at',
    saveButton: 'Save',
    saveButtonBusy: 'Saving…',
    markReviewedButton: 'Mark as reviewed',
    markReviewedButtonBusy: 'Updating…',
    forceOverwriteConfirm: 'This translation was already reviewed. Overwrite it?',
    emptyTranslationBlocked: 'Please enter an English translation.',
    regenerateReviewedConfirm: 'Replace stale reviewed translations with a new machine translation?',
    staffViewEnglish: 'English',
    staffViewJapanese: '日本語原文',
    staffMachineMarker: 'Machine translation',
    staffOriginalMarker: 'Original text (Japanese)',
  },
};

export const tRecipeTranslation = makeTranslator(RECIPE_TRANSLATION_DICT);
