/**
 * Automatic-translation configuration (DeepL / OpenAI / Google Cloud
 * Translation) for apps/web, read directly
 * from `process.env` -- deliberately NOT routed through
 * `packages/config/src/env.ts`'s `serverEnv()`, which requires the FULL
 * cross-service server schema (including `SUPABASE_SERVICE_ROLE_KEY`) to be
 * present and is meant for apps/api/apps/worker. apps/web must never hold or
 * validate against that secret (see AGENTS.md / ADR 0005) -- this module
 * mirrors `apps/web/src/lib/supabase/env.ts`'s pattern instead: a small,
 * scoped, non-throwing reader for just the vars this feature needs.
 *
 * No `server-only` import here (matching this codebase's existing
 * `auth-boundary-smoke.service.ts` split-file convention: the `server-only`
 * guard package cannot be resolved outside a Next.js webpack build, so any
 * module carrying it can never be unit-tested with a direct `node --test`
 * import -- this file's only production caller is
 * `translation-provider-factory.ts`, itself only ever imported from the
 * `'use server'` recipe-translation actions module, which is server-only by
 * the Server Actions directive itself). The repo-wide scan test in
 * `deepl-provider.test.ts` verifies no `'use client'` file ever imports this
 * module directly.
 */

/** Supported `CONTENT_TRANSLATION_PROVIDER` values -- kept in one place so the factory's switch and this reader's typing can't drift apart. */
export type ContentTranslationProviderSelector = 'deepl' | 'openai' | 'google';

const SUPPORTED_PROVIDER_SELECTORS: ContentTranslationProviderSelector[] = ['deepl', 'openai', 'google'];

function isSupportedProviderSelector(value: string): value is ContentTranslationProviderSelector {
  return (SUPPORTED_PROVIDER_SELECTORS as string[]).includes(value);
}

export interface TranslationEnvConfig {
  /** Explicit provider choice from `CONTENT_TRANSLATION_PROVIDER` -- `null` if unset (auto-translation off) or set to an unsupported value (surfaced via `providerSelectorRaw` instead of throwing). */
  providerSelector: ContentTranslationProviderSelector | null;
  /** The raw, untrimmed-comparison value of `CONTENT_TRANSLATION_PROVIDER` when set but not a supported selector -- lets the factory log a clear, specific configuration error without this reader needing to know about logging. */
  providerSelectorRaw: string | null;
  deeplApiKey: string | null;
  deeplApiUrl: string | null;
  openaiApiKey: string | null;
  openaiModel: string | null;
  googleTranslateApiKey: string | null;
  autoTranslationEnabled: boolean;
}

/** Never throws; a missing/unset key simply means "not configured" to every caller. */
export function readTranslationEnv(): TranslationEnvConfig {
  const rawSelector = process.env.CONTENT_TRANSLATION_PROVIDER?.trim().toLowerCase() || null;
  const providerSelector = rawSelector && isSupportedProviderSelector(rawSelector) ? rawSelector : null;
  const providerSelectorRaw = rawSelector && !providerSelector ? rawSelector : null;

  const deeplApiKey = process.env.DEEPL_API_KEY?.trim() || null;
  const deeplApiUrl = process.env.DEEPL_API_URL?.trim() || null;
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || null;
  const openaiModel = process.env.OPENAI_TRANSLATION_MODEL?.trim() || null;
  const googleTranslateApiKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim() || null;
  // Default enabled; only an explicit "false"/"0" disables it.
  const rawFlag = process.env.CONTENT_TRANSLATION_AUTO_ENABLED?.trim().toLowerCase();
  const autoTranslationEnabled = rawFlag !== 'false' && rawFlag !== '0';

  return {
    providerSelector,
    providerSelectorRaw,
    deeplApiKey,
    deeplApiUrl,
    openaiApiKey,
    openaiModel,
    googleTranslateApiKey,
    autoTranslationEnabled,
  };
}
