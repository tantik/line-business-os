/**
 * Reusable, provider-agnostic interface for machine translation of
 * user-generated content. `DeepLContentTranslationProvider`
 * (`providers/deepl-provider.ts`) is the first (and, in this MVP, only)
 * implementation; the business logic that calls this interface
 * (`translation-orchestrator.ts`) never imports DeepL directly, so a future
 * Google Cloud Translation or OpenAI-based provider is a second file that
 * implements this same interface, not a rewrite of the orchestration layer.
 *
 * No `server-only` import here (it's just types/a tiny error union) --
 * `providers/deepl-provider.ts` and `translation-provider-factory.ts` carry
 * that guarantee instead, since they're the ones that actually touch a
 * secret/perform HTTP.
 */

export type ContentTranslationErrorCode =
  | 'translation_not_configured'
  | 'translation_quota_exceeded'
  | 'translation_provider_unavailable'
  | 'translation_invalid_response';

export interface ContentTranslationProviderError {
  code: ContentTranslationErrorCode;
}

export interface TranslateBatchInput {
  /** Source texts, in order -- the provider must return translations in the SAME order/count. */
  texts: string[];
  sourceLang: string;
  targetLang: string;
}

export type TranslateBatchResult =
  | { ok: true; translations: string[] }
  | { ok: false; error: ContentTranslationProviderError };

export interface ContentTranslationProvider {
  /** Provider identifier stored in `content.translations.translation_provider` (e.g. 'deepl'). */
  readonly providerId: string;
  translateBatch(input: TranslateBatchInput): Promise<TranslateBatchResult>;
}
