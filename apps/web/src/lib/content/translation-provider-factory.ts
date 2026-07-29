import { readTranslationEnv } from './translation-env';
import { DeepLContentTranslationProvider } from './providers/deepl-provider';
import type { ContentTranslationProvider } from './translation-provider';

/**
 * Resolves the active `ContentTranslationProvider` for this deployment, or
 * `null` when automatic translation is unconfigured/disabled. Every caller
 * treats `null` as "manual-translation-only mode" -- never a crash or thrown
 * error -- per the brief: a missing `DEEPL_API_KEY` must never break Staff
 * reading or Manager manual-entry.
 *
 * `DEEPL_API_KEY` unset, or `CONTENT_TRANSLATION_AUTO_ENABLED=false`, both
 * resolve to `null` identically -- callers only need one branch ("no
 * provider available") for both cases.
 *
 * No `server-only` import (see `translation-env.ts`'s header for why -- the
 * guard package can't be resolved outside a Next.js webpack build, which
 * would make this file unit-test-unreachable); this module's only
 * production caller is the `'use server'` recipe-translation actions
 * module, which is already server-only by the Server Actions directive.
 */
export function resolveContentTranslationProvider(): ContentTranslationProvider | null {
  const { deeplApiKey, deeplApiUrl, autoTranslationEnabled } = readTranslationEnv();
  if (!autoTranslationEnabled || !deeplApiKey) return null;
  return new DeepLContentTranslationProvider({ apiKey: deeplApiKey, apiUrl: deeplApiUrl });
}
