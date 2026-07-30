import { readTranslationEnv } from './translation-env';
import { DeepLContentTranslationProvider } from './providers/deepl-provider';
import { OpenAIContentTranslationProvider } from './providers/openai-provider';
import type { ContentTranslationProvider } from './translation-provider';

/**
 * Resolves the active `ContentTranslationProvider` for this deployment, or
 * `null` when automatic translation is unconfigured/misconfigured/disabled.
 * Every caller treats `null` as "manual-translation-only mode" -- never a
 * crash or thrown error -- per the brief: a translation-provider problem
 * must never break Staff reading or Manager manual-entry.
 *
 * Provider selection is EXPLICIT via `CONTENT_TRANSLATION_PROVIDER` --
 * deliberately never inferred from "whichever API key happens to be set",
 * so a stray leftover `DEEPL_API_KEY` in one environment can never silently
 * activate DeepL when the deployment intends OpenAI (or vice versa).
 *
 * `CONTENT_TRANSLATION_PROVIDER` unset, `CONTENT_TRANSLATION_AUTO_ENABLED=
 * false`, an unsupported provider value, or the selected provider's required
 * key missing, all resolve to `null` identically to callers -- but the
 * latter two cases are also logged server-side (status/reason only, never a
 * key value) so a misconfiguration is diagnosable from server logs instead
 * of silently degrading to manual-only with no trace.
 *
 * No `server-only` import (see `translation-env.ts`'s header for why -- the
 * guard package can't be resolved outside a Next.js webpack build, which
 * would make this file unit-test-unreachable); this module's only
 * production caller is the `'use server'` recipe-translation actions
 * module, which is already server-only by the Server Actions directive
 * itself). The repo-wide scan test in `deepl-provider.test.ts` verifies no
 * `'use client'` file ever imports this module directly.
 */
export function resolveContentTranslationProvider(): ContentTranslationProvider | null {
  const env = readTranslationEnv();
  if (!env.autoTranslationEnabled) return null;

  if (!env.providerSelector) {
    if (env.providerSelectorRaw) {
      console.error(
        `content-translation: CONTENT_TRANSLATION_PROVIDER=${env.providerSelectorRaw} is not a supported provider (expected "deepl" or "openai") -- falling back to manual-only.`,
      );
    }
    return null;
  }

  if (env.providerSelector === 'openai') {
    if (!env.openaiApiKey) {
      console.error(
        'content-translation: CONTENT_TRANSLATION_PROVIDER=openai requires OPENAI_API_KEY to be set -- falling back to manual-only.',
      );
      return null;
    }
    return new OpenAIContentTranslationProvider({ apiKey: env.openaiApiKey, model: env.openaiModel });
  }

  if (!env.deeplApiKey) {
    console.error(
      'content-translation: CONTENT_TRANSLATION_PROVIDER=deepl requires DEEPL_API_KEY to be set -- falling back to manual-only.',
    );
    return null;
  }
  return new DeepLContentTranslationProvider({ apiKey: env.deeplApiKey, apiUrl: env.deeplApiUrl });
}
