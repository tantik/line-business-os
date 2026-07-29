import type {
  ContentTranslationProvider,
  ContentTranslationProviderError,
  TranslateBatchInput,
  TranslateBatchResult,
} from '../translation-provider';

/**
 * DeepL API implementation of `ContentTranslationProvider`. This module
 * sends the recipe's Japanese text to an external API using a secret API
 * key, so it must never be reachable from a `'use client'` file -- verified
 * below by a repo-wide scan test rather than a `server-only` import (that
 * guard package only resolves inside a Next.js webpack build, which would
 * make this file unreachable from a plain `node --test` run; see
 * `translation-env.ts`'s header for the same tradeoff). Its only production
 * caller is the `'use server'` recipe-translation actions module.
 *

 * Endpoint resolution: an explicit `apiUrl` always wins; otherwise this
 * follows DeepL's own key convention -- a Free-tier key always ends in
 * `:fx`, so it is routed to `api-free.deepl.com`, everything else to
 * `api.deepl.com` -- without ever hardcoding which tier a given deployment
 * uses.
 *
 * Logging discipline: on any non-ok response this NEVER logs the response
 * body (which can echo back request text) or the `Authorization` header --
 * only the HTTP status and the mapped `ContentTranslationErrorCode`.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

function resolveEndpoint(apiKey: string, apiUrl: string | null): string {
  if (apiUrl) return apiUrl;
  const isFreeKey = apiKey.endsWith(':fx');
  return isFreeKey ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
}

function mapStatusToError(status: number): ContentTranslationProviderError {
  // 403 (auth rejected) and 456 (quota exceeded) both surface as a
  // quota/entitlement problem to the caller -- neither is something a retry
  // fixes, and DeepL uses 403 for both "bad key" and certain quota states.
  if (status === 403 || status === 456 || status === 429) {
    return { code: 'translation_quota_exceeded' };
  }
  return { code: 'translation_provider_unavailable' };
}

export class DeepLContentTranslationProvider implements ContentTranslationProvider {
  readonly providerId = 'deepl';

  private readonly apiKey: string;
  private readonly apiUrl: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: {
    apiKey: string;
    apiUrl?: string | null;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }) {
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl ?? null;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async translateBatch(input: TranslateBatchInput): Promise<TranslateBatchResult> {
    if (input.texts.length === 0) return { ok: true, translations: [] };

    const endpoint = resolveEndpoint(this.apiKey, this.apiUrl);
    const body = new URLSearchParams();
    for (const text of input.texts) body.append('text', text);
    body.set('source_lang', input.sourceLang.toUpperCase());
    body.set('target_lang', input.targetLang.toUpperCase());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: controller.signal,
      });
    } catch {
      // Covers both AbortError (timeout) and network failure -- neither
      // exposes a status code, so both map to "provider unavailable".
      return { ok: false, error: { code: 'translation_provider_unavailable' } };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return { ok: false, error: mapStatusToError(response.status) };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, error: { code: 'translation_invalid_response' } };
    }

    const translations = extractTranslations(payload);
    if (!translations || translations.length !== input.texts.length) {
      return { ok: false, error: { code: 'translation_invalid_response' } };
    }

    return { ok: true, translations };
  }
}

function extractTranslations(payload: unknown): string[] | null {
  if (typeof payload !== 'object' || payload === null || !('translations' in payload)) return null;
  const rawTranslations = (payload as { translations: unknown }).translations;
  if (!Array.isArray(rawTranslations)) return null;

  const texts: string[] = [];
  for (const entry of rawTranslations) {
    if (typeof entry !== 'object' || entry === null || typeof (entry as { text?: unknown }).text !== 'string') {
      return null;
    }
    texts.push((entry as { text: string }).text);
  }
  return texts;
}
