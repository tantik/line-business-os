import type { Lang } from '@/lib/demo/cafe/i18n';
import { previewWriteMessage, type PreviewWriteFailureStatus } from '../write-result';

/**
 * Result contract for the recipe-translation Server Actions -- extends the
 * shared `PreviewWriteFailureStatus` union with the translation-specific
 * failure modes from the brief. Kept in its own module (not added to
 * `write-result.ts`) since these statuses are meaningless outside this one
 * feature; every other preview write action is unaffected.
 */
export type RecipeTranslationFailureStatus =
  | PreviewWriteFailureStatus
  | 'translation_not_configured'
  | 'translation_quota_exceeded'
  | 'translation_provider_unavailable'
  | 'translation_invalid_response'
  | 'translation_requires_force'
  | 'translation_partial_failure';

export type RecipeTranslationActionResult<T> =
  | { status: 'success'; data: T }
  | { status: RecipeTranslationFailureStatus };

const TRANSLATION_MESSAGES_JA: Record<
  'translation_not_configured' | 'translation_quota_exceeded' | 'translation_provider_unavailable' | 'translation_invalid_response' | 'translation_requires_force' | 'translation_partial_failure',
  string
> = {
  translation_not_configured: '自動翻訳は設定されていません。手動で翻訳を入力できます。',
  translation_quota_exceeded: '翻訳サービスの利用上限に達しました。しばらくしてからもう一度お試しください。',
  translation_provider_unavailable: '翻訳サービスに接続できませんでした。しばらくしてからもう一度お試しください。',
  translation_invalid_response: '翻訳サービスから予期しない応答がありました。もう一度お試しください。',
  translation_requires_force: 'すでに確認済みの翻訳を上書きするには、明示的な確認が必要です。',
  translation_partial_failure: '一部の翻訳を保存できませんでした。再読み込み後にもう一度お試しください。',
};

const TRANSLATION_MESSAGES_EN: Record<
  'translation_not_configured' | 'translation_quota_exceeded' | 'translation_provider_unavailable' | 'translation_invalid_response' | 'translation_requires_force' | 'translation_partial_failure',
  string
> = {
  translation_not_configured: 'Automatic translation is not configured. You can still enter a translation manually.',
  translation_quota_exceeded: 'The translation service quota was reached. Please try again later.',
  translation_provider_unavailable: 'Could not reach the translation service. Please try again later.',
  translation_invalid_response: 'The translation service returned an unexpected response. Please try again.',
  translation_requires_force: 'This translation was already reviewed -- confirm you want to replace it.',
  translation_partial_failure: 'Some translations could not be saved. Refresh and try again.',
};

/** Lang-aware message for any `RecipeTranslationFailureStatus`, falling back to the shared preview messages for statuses this module doesn't own. */
export function recipeTranslationWriteMessage(lang: Lang, status: RecipeTranslationFailureStatus): string {
  if (status in TRANSLATION_MESSAGES_JA) {
    const key = status as keyof typeof TRANSLATION_MESSAGES_JA;
    return lang === 'en' ? TRANSLATION_MESSAGES_EN[key] : TRANSLATION_MESSAGES_JA[key];
  }
  // Shared statuses (not_authenticated, no_access, invalid_input, ...) --
  // reuse the existing dictionary rather than duplicating it.
  return previewWriteMessage(lang, status as PreviewWriteFailureStatus);
}
